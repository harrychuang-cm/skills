#!/usr/bin/env node
// Checks the UI Flow snapshot lifecycle against a running Storybook in system
// Chrome over CDP (Node built-in WebSocket, no packages):
//
//   node storybook-product-prototype/scripts/check_flow_snapshots.mjs \
//     --url "http://localhost:6006/iframe.html?id=<story>&globals=prototypeMode:flow&viewMode=story" \
//     [--edit-file <route component> [--edit-find <text>] [--edit-replace <text>]]
//
// - first open: every route is captured once, visible frames nearest the
//   canvas center first;
// - reload: the commit that reveals the canvas already shows the cached
//   snapshots at their cached heights, and each route is revalidated exactly
//   once without encoding;
// - a new tab (no stored camera, so the canvas fits on open) reveals the
//   cached snapshots without waiting for the fit's camera idle;
// - with --edit-file (Storybook dev): editing the route component marks the
//   shown snapshots as updating, no snapshot is replaced before the renderer's
//   own storyHotUpdated plus 100 ms, and every snapshot is replaced; an edit
//   made while the Story mode is shown (the UI Flow unmounted) marks the
//   snapshots as updating when the UI Flow comes back and replaces them. The
//   file is restored afterwards. The defaults of --edit-find and
//   --edit-replace fit the bench-shared/BenchRouteScreen.tsx of
//   create_flow_bench_fixture.mjs.
//
// Prints SKIPPED and exits 0 when no system Chrome is found.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MARK_SNAPSHOT = "pi:flow:snapshot";
const MARK_RESET = "pi:flow:renderer-reset";
const VIEWPORT = { deviceScaleFactor: 1, height: 1000, width: 1600 };
const QUEUE_TIMEOUT_MS = 180_000;
// The opening fit settles 120 ms after the camera stops; a reveal sooner than
// this after the canvas mounts did not wait for it.
const REVEAL_BEFORE_FIT_IDLE_MS = 100;
const HOT_QUIET_MS = 100;
// Allowed backwards step in the capture order, in world pixels (measured
// sizes can move frame centres a little while capturing).
const ORDER_TOLERANCE = 50;

function parseArgs(argv) {
  const args = { editFile: null, editFind: "<h1>{route.title}</h1>", editReplace: "<h1>{route.title} (edited)</h1>", url: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined) throw new Error(`${flag} needs a value.`);
      index += 1;
      return next;
    };
    if (flag === "--url") args.url = value();
    else if (flag === "--edit-file") args.editFile = path.resolve(value());
    else if (flag === "--edit-find") args.editFind = value();
    else if (flag === "--edit-replace") args.editReplace = value();
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!args.url) throw new Error("--url is required.");
  return args;
}

function findChrome() {
  return [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean).find((candidate) => existsSync(candidate)) ?? null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(chrome, profile) {
  const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "about:blank"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const wsUrl = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not start.")), 30_000);
    browser.stderr.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
      socket.send(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { browser, send, socket };
}

// Every document of a page: the renderer document reports its in-place route
// switches; the top document counts encodes, records storyHotUpdated from the
// renderer and what the canvas shows in the commit that reveals it.
const INSTRUMENTATION = `(() => {
  const top = window.top;
  if (window.frameElement && window.frameElement.getAttribute("data-prototype-inspector-renderer") === "true") {
    const replaceState = history.replaceState;
    history.replaceState = function (...args) {
      // Storybook also rewrites the URL on load, keeping the route.
      const route = new URL(String(args[2]), location.href).searchParams.get("prototypeRoute");
      if (route && route !== new URLSearchParams(location.search).get("prototypeRoute")) (top.__snapshotSwitches ??= []).push(route);
      return replaceState.apply(this, args);
    };
    return;
  }
  if (window !== top) return;
  window.__snapshotEncodes = 0;
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (...args) { window.__snapshotEncodes += 1; return toBlob.apply(this, args); };
  window.__rendererHot = [];
  addEventListener("message", (event) => {
    const renderer = document.querySelector("iframe[data-prototype-inspector-renderer]");
    if (renderer && event.source === renderer.contentWindow && String(event.data).includes("storyHotUpdated")) window.__rendererHot.push(performance.now());
  });
  const observer = new MutationObserver(() => {
    const root = document.querySelector(".prototype-inspector--flow");
    if (!root) return;
    window.__flowMountedAt ??= performance.now();
    if (root.hasAttribute("data-snapshot-preload") || window.__reveal) return;
    const frames = [...root.querySelectorAll(".prototype-inspector__flow-frame[data-frame-id]")];
    window.__reveal = {
      at: performance.now(),
      heights: Object.fromEntries(frames.map((frame) => [frame.dataset.frameId, frame.style.getPropertyValue("--prototype-flow-preview-height")])),
      snapshotMarks: performance.getEntriesByName(${JSON.stringify(MARK_SNAPSHOT)}).length,
      snapshotTier: frames.filter((frame) => frame.getAttribute("data-tier") === "snapshot").length,
      snapshotTierWithImage: frames.filter((frame) => frame.getAttribute("data-tier") === "snapshot" && frame.querySelector(".prototype-inspector__flow-frame-snapshot")).length,
    };
  });
  addEventListener("DOMContentLoaded", () => observer.observe(document.documentElement, { attributeFilter: ["data-snapshot-preload"], attributes: true, childList: true, subtree: true }));
})()`;

async function openPage(send) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { flatten: true, targetId });
  const page = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const result = await page("Runtime.evaluate", { awaitPromise: true, expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  await page("Page.enable");
  await page("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, mobile: false });
  await page("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENTATION });
  return { close: () => send("Target.closeTarget", { targetId }), evaluate, page };
}

const STATE = `(() => {
  const root = document.querySelector(".prototype-inspector--flow");
  const frames = root ? [...root.querySelectorAll(".prototype-inspector__flow-frame[data-frame-id]")] : [];
  return {
    encodes: window.__snapshotEncodes ?? 0,
    frames: frames.length,
    queue: root ? root.getAttribute("data-snapshot-queue") : null,
    resets: performance.getEntriesByName(${JSON.stringify(MARK_RESET)}).map((mark) => mark.detail?.reason ?? null),
    snapshotMarks: performance.getEntriesByName(${JSON.stringify(MARK_SNAPSHOT)}).length,
    snapshotTier: frames.filter((frame) => frame.getAttribute("data-tier") === "snapshot").length,
    snapshotTierShown: frames.filter((frame) => {
      if (frame.getAttribute("data-tier") !== "snapshot") return false;
      const image = frame.querySelector(".prototype-inspector__flow-frame-snapshot");
      return Boolean(image && image.complete && image.naturalWidth > 0);
    }).length,
    stale: frames.filter((frame) => frame.getAttribute("data-snapshot-stale") === "true").length,
    switches: (window.__snapshotSwitches ?? []).length,
  };
})()`;

async function waitFor(evaluate, test, timeoutMs, label) {
  const started = Date.now();
  let last = null;
  let idleSince = null;
  while (Date.now() - started < timeoutMs) {
    last = await evaluate(STATE).catch(() => null);
    if (last && test(last)) {
      // The queue can empty for a moment between captures.
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= 500) return last;
    } else {
      idleSince = null;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const chrome = findChrome();
  if (!chrome) {
    console.log("SKIPPED: no Chrome");
    return;
  }

  const failures = [];
  const check = (passed, label, detail) => {
    console.log(`${passed ? "PASS" : "FAIL"} ${label}${detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
    if (!passed) failures.push(label);
  };
  const original = args.editFile ? await readFile(args.editFile, "utf8") : null;
  if (args.editFile && !original.includes(args.editFind)) {
    console.error(`--edit-file does not contain --edit-find: ${args.editFind}`);
    process.exit(2);
  }
  const restore = async () => {
    if (original !== null) await writeFile(args.editFile, original);
  };
  process.once("SIGINT", () => restore().finally(() => process.exit(130)));

  const profile = await mkdtemp(path.join(os.tmpdir(), "flow-snapshots-"));
  const { browser, send, socket } = await connect(chrome, profile);
  try {
    // 1. First open: every route once, nearest the centre first.
    const first = await openPage(send);
    await first.page("Page.navigate", { url: args.url });
    const cold = await waitFor(first.evaluate, (state) => state.queue === "idle" && state.snapshotTier > 0 && state.snapshotTierShown === state.snapshotTier, QUEUE_TIMEOUT_MS, "the first captures");
    const order = await first.evaluate(`(() => {
      const viewport = document.querySelector(".prototype-inspector__flow-viewport").getBoundingClientRect();
      const world = document.querySelector(".prototype-inspector__flow-world");
      const camera = new DOMMatrixReadOnly(getComputedStyle(world).transform);
      const centre = { x: (viewport.width / 2 - camera.e) / camera.a, y: (viewport.height / 2 - camera.f) / camera.a };
      const distance = Object.fromEntries([...document.querySelectorAll(".prototype-inspector__flow-frame[data-frame-id]")].map((frame) => {
        const style = frame.style;
        const x = Number.parseFloat(style.getPropertyValue("--prototype-flow-card-x"));
        const y = Number.parseFloat(style.getPropertyValue("--prototype-flow-card-y"));
        const width = Number.parseFloat(style.getPropertyValue("--prototype-flow-card-width"));
        const height = Number.parseFloat(style.getPropertyValue("--prototype-flow-card-height"));
        const rect = frame.getBoundingClientRect();
        const visible = rect.right > viewport.left && rect.left < viewport.right && rect.bottom > viewport.top && rect.top < viewport.bottom;
        return [frame.dataset.frameId, { distance: Math.hypot(x + width / 2 - centre.x, y + height / 2 - centre.y), visible }];
      }));
      return performance.getEntriesByName(${JSON.stringify(MARK_SNAPSHOT)}).map((mark) => ({ routeId: mark.detail?.routeId, ...distance[mark.detail?.routeId] }));
    })()`);
    let backwards = 0;
    for (let index = 1; index < order.length; index += 1) {
      const previous = order[index - 1];
      const current = order[index];
      if (previous.visible === current.visible && current.distance < previous.distance - ORDER_TOLERANCE) backwards += 1;
      if (!previous.visible && current.visible) backwards += 1;
    }
    check(
      cold.snapshotMarks === cold.frames && cold.encodes === cold.frames && backwards === 0,
      "first open: every route is captured and encoded once, visible frames nearest the centre first",
      { backwards, encodes: cold.encodes, frames: cold.frames, snapshotMarks: cold.snapshotMarks },
    );
    const coldHeights = await first.evaluate(`Object.fromEntries([...document.querySelectorAll(".prototype-inspector__flow-frame[data-frame-id]")].map((frame) => [frame.dataset.frameId, frame.style.getPropertyValue("--prototype-flow-preview-height")]))`);

    // 2. Reload in the same tab.
    await first.page("Page.navigate", { url: args.url });
    let reveal = null;
    for (let attempt = 0; attempt < 400 && !reveal; attempt += 1) {
      await sleep(25);
      reveal = await first.evaluate("window.__reveal ?? null").catch(() => null);
    }
    const sameHeights = Boolean(reveal) && Object.entries(coldHeights).every(([frameId, height]) => reveal.heights[frameId] === height);
    check(
      Boolean(reveal) && reveal.snapshotMarks === 0 && reveal.snapshotTier > 0 && reveal.snapshotTierWithImage === reveal.snapshotTier && sameHeights,
      "reload: the commit that reveals the canvas already shows the cached snapshots at their cached heights, before any capture",
      reveal && { sameHeights, snapshotMarks: reveal.snapshotMarks, snapshotTier: reveal.snapshotTier, withImage: reveal.snapshotTierWithImage },
    );
    const warm = await waitFor(first.evaluate, (state) => state.queue === "idle", QUEUE_TIMEOUT_MS, "the revalidation");
    const switched = await first.evaluate("window.__snapshotSwitches ?? []");
    const captures = warm.resets.length + warm.switches;
    check(
      captures === warm.frames && new Set(switched).size === switched.length && warm.encodes === 0 && warm.snapshotMarks === 0,
      "reload: each route is revalidated exactly once, unchanged, with no encode and no new snapshot",
      { captures, encodes: warm.encodes, frames: warm.frames, resets: warm.resets, snapshotMarks: warm.snapshotMarks },
    );

    // 3. A new tab fits on open; the cached snapshots do not wait for its idle.
    const second = await openPage(send);
    await second.page("Page.navigate", { url: args.url });
    let opened = null;
    for (let attempt = 0; attempt < 400 && !opened; attempt += 1) {
      await sleep(25);
      opened = await second.evaluate("window.__reveal ? { ...window.__reveal, mountedAt: window.__flowMountedAt } : null").catch(() => null);
    }
    const revealDelay = opened ? Math.round(opened.at - opened.mountedAt) : null;
    check(
      Boolean(opened) && opened.snapshotTierWithImage === opened.snapshotTier && opened.snapshotTier > 0 && revealDelay < REVEAL_BEFORE_FIT_IDLE_MS,
      `new tab: the canvas is revealed with the cached snapshots less than ${REVEAL_BEFORE_FIT_IDLE_MS} ms after it mounts, without waiting for the opening fit's idle`,
      opened && { revealDelay, snapshotTier: opened.snapshotTier, withImage: opened.snapshotTierWithImage },
    );
    await second.close();

    // 4. A code edit.
    if (!args.editFile) {
      console.log("NOTE code update: pass --edit-file to check the update path in Storybook dev");
    } else {
      const editedAt = await first.evaluate("performance.now()");
      await writeFile(args.editFile, original.replace(args.editFind, args.editReplace));
      let marked = null;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        marked = await first.evaluate(STATE).catch(() => null);
        if (marked?.stale > 0) break;
        await sleep(100);
      }
      check(marked?.stale === marked?.snapshotTier && marked?.stale > 0, "code update: every shown snapshot is marked as updating", marked && { snapshotTier: marked.snapshotTier, stale: marked.stale });
      const done = await waitFor(first.evaluate, (state) => state.stale === 0 && state.queue === "idle", QUEUE_TIMEOUT_MS, "the recaptures");
      const timing = await first.evaluate(`(() => {
        const hot = window.__rendererHot.filter((at) => at > ${editedAt});
        const marks = performance.getEntriesByName(${JSON.stringify(MARK_SNAPSHOT)}).filter((mark) => mark.startTime > ${editedAt}).map((mark) => mark.startTime);
        const renderer = document.querySelector("iframe[data-prototype-inspector-renderer]");
        return {
          edited: Boolean(renderer && renderer.contentDocument && renderer.contentDocument.body.textContent.includes(${JSON.stringify(args.editReplace.replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, "").trim())})),
          firstHot: hot.length ? Math.round(hot[0]) : null,
          firstSnapshot: marks.length ? Math.round(Math.min(...marks)) : null,
          newSnapshots: marks.length,
        };
      })()`);
      check(
        timing.firstHot !== null && timing.firstSnapshot !== null && timing.firstSnapshot >= timing.firstHot + HOT_QUIET_MS && timing.edited,
        `code update: no snapshot is replaced before the renderer's own storyHotUpdated plus ${HOT_QUIET_MS} ms, and the renderer shows the edit`,
        { ...timing, resets: done.resets },
      );
      check(timing.newSnapshots === done.frames, "code update: every snapshot is replaced by a capture of the edited code", { frames: done.frames, newSnapshots: timing.newSnapshots });
      await restore();
      await waitFor(first.evaluate, (state) => state.stale === 0 && state.queue === "idle", QUEUE_TIMEOUT_MS, "the captures after restoring the file").catch(() => undefined);

      // The same edit while the Story mode is shown.
      const setMode = (mode) => first.evaluate(`window.__STORYBOOK_PREVIEW__.onUpdateGlobals({ globals: { prototypeMode: ${JSON.stringify(mode)} } })`);
      await setMode("story");
      await sleep(1_500);
      await writeFile(args.editFile, original.replace(args.editFind, args.editReplace));
      await sleep(2_500);
      const backAt = await first.evaluate("performance.now()");
      await setMode("flow");
      let back = null;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        back = await first.evaluate(STATE).catch(() => null);
        if (back?.frames && back.stale > 0) break;
        await sleep(50);
      }
      // A build that captures nothing here never creates the renderer queue.
      const backDone = await waitFor(first.evaluate, (state) => state.stale === 0 && state.queue !== "busy" && state.frames > 0, QUEUE_TIMEOUT_MS, "the captures after returning to the UI Flow");
      const backResult = await first.evaluate(`(() => {
        const renderer = document.querySelector("iframe[data-prototype-inspector-renderer]");
        return {
          edited: Boolean(renderer && renderer.contentDocument && renderer.contentDocument.body.textContent.includes(${JSON.stringify(args.editReplace.replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, "").trim())})),
          newSnapshots: performance.getEntriesByName(${JSON.stringify(MARK_SNAPSHOT)}).filter((mark) => mark.startTime > ${backAt}).length,
        };
      })()`);
      check(
        back?.stale > 0 && back.stale === back.snapshotTier && backResult.newSnapshots === backDone.frames && backResult.edited,
        "code update while the UI Flow is not mounted: coming back marks the snapshots as updating and replaces them with captures of the edit",
        { frames: backDone.frames, newSnapshots: backResult.newSnapshots, staleOnReturn: back?.stale ?? null, edited: backResult.edited },
      );
      await restore();
      await waitFor(first.evaluate, (state) => state.stale === 0 && state.queue === "idle", QUEUE_TIMEOUT_MS, "the captures after restoring the file").catch(() => undefined);
    }
    await first.close();
  } catch (error) {
    check(false, "the checks ran", error.message);
  } finally {
    await restore();
    socket.close();
    browser.kill();
    await rm(profile, { force: true, recursive: true }).catch(() => undefined);
  }

  console.log(failures.length ? `FAIL ${failures.length} snapshot lifecycle check(s)` : "PASS snapshot lifecycle checks");
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
