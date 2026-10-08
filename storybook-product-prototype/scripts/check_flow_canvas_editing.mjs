#!/usr/bin/env node
// Checks the UI Flow editing tools (flow-canvas-editing) in system Chrome over
// CDP (Node built-in WebSocket, no packages). Run it against a Storybook
// started from create_flow_bench_fixture.mjs:
//
//   node storybook-product-prototype/scripts/check_flow_canvas_editing.mjs \
//     --url "http://localhost:6006/iframe.html?id=pages-prototypes-bench-growth-fund--default&viewMode=story" \
//     [--journey-url "http://localhost:6006/iframe.html?id=pages-prototypes-example-prototype--default&viewMode=story"] \
//     [--resize-url "http://localhost:6006/iframe.html?id=pages-prototypes-bench-viewport-overflow--default&viewMode=story"] \
//     [--headed]
//
// --url is a complete flow with many routes (the growth-fund story). The
// journey cases need --journey-url, a story whose flow declares the journey
// intake, review, approval-decision, review (the example prototype); the
// opening-fit case needs --resize-url, a story with a frame measured larger
// than declared (the viewport-overflow bench story). Both are skipped without
// their URL. Every case starts from an empty saved layout. Exits non-zero when
// a case fails.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 1 };
const READY_TIMEOUT_MS = 120_000;
const SETTLE_MS = 800;
const NUDGE_COMMIT_MS = 500;
const MARK_COMMIT = "pi:flow:commit";
// Cmd on macOS, Ctrl elsewhere (CDP modifier bits: Alt 1, Ctrl 2, Meta 4, Shift 8).
const MOD = process.platform === "darwin" ? 4 : 2;
const CTRL = 2;
const SHIFT = 8;

function usage() {
  return [
    "Usage: node storybook-product-prototype/scripts/check_flow_canvas_editing.mjs --url <prototype story iframe URL> [--journey-url <url>] [--headed]",
    "",
    "  --url <url>          Storybook iframe URL of a prototype story with many routes (required); globals are set per case.",
    "  --journey-url <url>  Storybook iframe URL of a story declaring the journey intake, review, approval-decision, review",
    "                       (request-changes in the example prototype); without it the journey cases are skipped.",
    "  --resize-url <url>   Storybook iframe URL of a story with a frame measured larger than declared (the viewport-overflow",
    "                       bench story); without it the opening-fit case is skipped.",
    "  --headed             Run Chrome with a window instead of --headless=new.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { headed: false, journeyUrl: null, resizeUrl: null, url: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url") args.url = argv[++index];
    else if (arg === "--journey-url") args.journeyUrl = argv[++index];
    else if (arg === "--resize-url") args.resizeUrl = argv[++index];
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}\n\n${usage()}`);
    }
  }
  if (!args.url) throw new Error(`--url is required.\n\n${usage()}`);
  return args;
}

function withGlobals(input, globals) {
  const url = new URL(input);
  url.searchParams.set(
    "globals",
    Object.entries(globals)
      .map(([key, value]) => `${key}:${value}`)
      .join(";"),
  );
  url.searchParams.set("viewMode", "story");
  return url.toString();
}

function findChrome() {
  return [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]
    .filter(Boolean)
    .find((candidate) => existsSync(candidate));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function browserWebSocketUrl(browser) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Chrome CDP did not start.\n${stderr}`)), 20_000);
    browser.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    browser.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before CDP was ready (${code}).\n${stderr}`));
    });
  });
}

class CdpClient {
  id = 0;
  pending = new Map();

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const { method, reject, resolve, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`CDP ${method}: ${message.error.message}`));
      else resolve(message.result);
    });
  }

  send(method, params = {}, sessionId, timeoutMs = 120_000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs} ms.`));
      }, timeoutMs);
      this.pending.set(id, { method, reject, resolve, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

// Counts writes of the saved layout key and records the keydown events that
// reach the window (the canvas stops the keys it handles at the document).
const INSTRUMENTATION = `(() => {
  if (window !== window.top) return;
  window.__editingCheck = { layoutOps: [], windowKeys: [] };
  for (const method of ["setItem", "removeItem"]) {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function (key, value) {
      if (this === window.localStorage && String(key).startsWith("prototype-inspector:flow-layout:")) window.__editingCheck.layoutOps.push(method);
      return original.call(this, key, value);
    };
  }
  window.addEventListener("keydown", (event) => {
    window.__editingCheck.windowKeys.push({ code: event.code, prevented: event.defaultPrevented });
  });
})()`;

async function openPage(cdp) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { flatten: true, targetId });
  const page = {
    targetId,
    send: (method, params = {}, timeoutMs) => cdp.send(method, params, sessionId, timeoutMs),
    async evaluate(expression, timeoutMs = 120_000) {
      const response = await page.send("Runtime.evaluate", { awaitPromise: true, expression, returnByValue: true }, timeoutMs);
      if (response.exceptionDetails) {
        const details = response.exceptionDetails;
        throw new Error(details.exception?.description ?? details.text ?? "Runtime.evaluate failed");
      }
      return response.result?.value;
    },
  };
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, mobile: false });
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENTATION });
  await page.send("Page.bringToFront");
  return page;
}

async function waitForFrames(page) {
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    const ready = await page
      .evaluate(`Boolean(document.querySelector(".prototype-inspector--flow:not([data-snapshot-preload]) .prototype-inspector__flow-frame"))`, 10_000)
      .catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error("the UI Flow did not show a frame");
}

// Background snapshot captures commit on their own: wait until the queue has
// been idle for 1.5 s.
async function waitForSnapshotsIdle(page) {
  for (let waited = 0, idle = 0; waited < 60_000 && idle < 1_500; waited += 250) {
    const queue = await page.evaluate(`document.querySelector(".prototype-inspector--flow")?.getAttribute("data-snapshot-queue")`);
    idle = queue === "idle" ? idle + 250 : 0;
    await sleep(250);
  }
}

async function openFlow(page, url) {
  const response = await page.send("Page.navigate", { url });
  if (response.errorText) throw new Error(`Navigation to ${url} failed: ${response.errorText}`);
  await waitForFrames(page);
  await waitForSnapshotsIdle(page);
  await sleep(500);
}

async function clearStoredFlow(page) {
  await page.evaluate(`Object.keys(localStorage).filter((key) => key.startsWith("prototype-inspector:flow-")).forEach((key) => localStorage.removeItem(key)); sessionStorage.clear();`);
}

// Opens the flow with nothing stored, then sets `session` entries (a journey
// selection) and reloads when given.
async function freshFlow(page, input, session = null) {
  const url = withGlobals(input, { prototypeMode: "flow" });
  await openFlow(page, url);
  await clearStoredFlow(page);
  if (session) {
    await page.evaluate(`(() => { const entries = ${JSON.stringify(session)}; Object.entries(entries).forEach(([key, value]) => sessionStorage.setItem(key, value)); })()`);
  }
  await openFlow(page, url);
  return url;
}

// Frames by id (instance key in a journey view) with world positions from
// their CSS variables, the selection and the camera.
const READ_STATE = `(() => {
  const root = document.querySelector(".prototype-inspector--flow");
  const px = (element, name) => Number.parseFloat(element.style.getPropertyValue(name));
  const frames = Object.fromEntries(
    [...root.querySelectorAll(".prototype-inspector__flow-world [data-frame-id]")].map((element) => {
      const isNode = element.classList.contains("prototype-inspector__flow-node");
      const prefix = isNode ? "--prototype-flow-node-" : "--prototype-flow-card-";
      return [element.getAttribute("data-frame-id"), {
        height: px(element, prefix + "height"),
        selected: element.getAttribute("data-selected") === "true",
        transform: element.style.transform,
        width: px(element, prefix + "width"),
        x: px(element, prefix + "x"),
        y: px(element, prefix + "y"),
      }];
    }),
  );
  const matrix = new DOMMatrixReadOnly(getComputedStyle(root.querySelector(".prototype-inspector__flow-world")).transform);
  const viewport = root.querySelector(".prototype-inspector__flow-viewport");
  const box = viewport.getBoundingClientRect();
  return {
    camera: { x: matrix.e, y: matrix.f, z: matrix.a },
    commits: performance.getEntriesByName(${JSON.stringify(MARK_COMMIT)}).length,
    fitPressed: root.querySelector('[aria-label="Fit canvas"]')?.getAttribute("aria-pressed"),
    frames,
    journey: root.getAttribute("data-journey-focus"),
    layoutOps: (window.__editingCheck?.layoutOps ?? []).slice(),
    outlines: [...root.querySelectorAll('[data-frame-outline][data-selected="true"]')].map((element) => element.getAttribute("data-frame-outline")),
    routeOrder: [...root.querySelectorAll(".prototype-inspector__flow-world .prototype-inspector__flow-frame[data-frame-id]")].map((element) => element.getAttribute("data-frame-id")),
    selected: Object.entries(frames).filter(([, frame]) => frame.selected).map(([id]) => id),
    viewport: { height: viewport.clientHeight, left: box.left, top: box.top, width: viewport.clientWidth },
    windowKeys: (window.__editingCheck?.windowKeys ?? []).slice(),
  };
})()`;
const readState = (page) => page.evaluate(READ_STATE);
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function pressKey(page, code, key, keyCode, modifiers = 0) {
  await page.send("Input.dispatchKeyEvent", { code, key, modifiers, type: "keyDown", windowsVirtualKeyCode: keyCode });
  await page.send("Input.dispatchKeyEvent", { code, key, modifiers, type: "keyUp", windowsVirtualKeyCode: keyCode });
}
const arrowRight = (page, modifiers = 0) => pressKey(page, "ArrowRight", "ArrowRight", 39, modifiers);
const undoKey = (page) => pressKey(page, "KeyZ", "z", 90, MOD);

// A point of the frame's preview that the frame itself receives.
const framePoint = (page, frameId) =>
  page.evaluate(`(() => {
    const frame = document.querySelector('.prototype-inspector__flow-world [data-frame-id="${frameId}"]');
    if (!frame) return null;
    const target = frame.querySelector(".prototype-inspector__flow-frame-preview") ?? frame;
    const box = target.getBoundingClientRect();
    for (let fy = 0.1; fy < 0.95; fy += 0.1) for (let fx = 0.2; fx < 0.85; fx += 0.15) {
      const x = box.left + box.width * fx;
      const y = box.top + box.height * fy;
      if (document.elementFromPoint(x, y)?.closest("[data-frame-id]")?.getAttribute("data-frame-id") === "${frameId}") return { x, y };
    }
    return null;
  })()`);
const mouse = (page, type, x, y, extra = {}) => page.send("Input.dispatchMouseEvent", { button: "left", clickCount: 1, type, x, y, ...extra });

async function clickFrame(page, frameId, modifiers = 0) {
  const point = await framePoint(page, frameId);
  if (!point) throw new Error(`frame ${frameId} is not on screen`);
  await mouse(page, "mouseMoved", point.x, point.y, { modifiers });
  await mouse(page, "mousePressed", point.x, point.y, { modifiers });
  await mouse(page, "mouseReleased", point.x, point.y, { modifiers });
  await sleep(250);
}

// A pointer drag by a world offset at zoom z; `back` returns to the start
// before releasing. Returns the guides shown before the release.
async function dragFrame(page, frameId, worldDx, worldDy, z, { back = false, modifiers = 0 } = {}) {
  const start = await framePoint(page, frameId);
  if (!start) throw new Error(`frame ${frameId} is not on screen`);
  const at = (step, steps) => ({ x: start.x + (worldDx * z * step) / steps, y: start.y + (worldDy * z * step) / steps });
  await mouse(page, "mouseMoved", start.x, start.y);
  await sleep(300);
  await mouse(page, "mousePressed", start.x, start.y);
  const steps = 10;
  for (let step = 1; step <= steps; step += 1) {
    const point = at(step, steps);
    await mouse(page, "mouseMoved", point.x, point.y, { buttons: 1, modifiers });
    await sleep(20);
  }
  if (back) {
    for (let step = steps - 1; step >= 0; step -= 1) {
      const point = at(step, steps);
      await mouse(page, "mouseMoved", point.x, point.y, { buttons: 1, modifiers });
      await sleep(20);
    }
  }
  await sleep(100);
  const guides = await page.evaluate(`[...document.querySelectorAll(".prototype-inspector__flow-guide")].filter((guide) => !guide.hidden).map((guide) => guide.getAttribute("data-axis"))`);
  const end = back ? start : at(steps, steps);
  await mouse(page, "mouseReleased", end.x, end.y, { modifiers });
  await sleep(SETTLE_MS);
  return guides;
}

// Frames whose preview is inside the viewport (with `topOnly`, whose
// preview's top edge is, enough to grab it and to be a snap candidate).
const framesOnScreen = (page, { topOnly = false } = {}) =>
  page.evaluate(`(() => {
    const viewport = document.querySelector(".prototype-inspector__flow-viewport").getBoundingClientRect();
    return [...document.querySelectorAll(".prototype-inspector__flow-world .prototype-inspector__flow-frame[data-frame-id]")]
      .filter((element) => {
        const box = element.querySelector(".prototype-inspector__flow-frame-preview").getBoundingClientRect();
        const bottom = ${topOnly} ? box.top + 120 : box.bottom;
        return box.left > viewport.left + 40 && box.right < viewport.right - 40 && box.top > viewport.top + 40 && bottom < viewport.bottom - 40;
      })
      .map((element) => element.getAttribute("data-frame-id"));
  })()`);

// A blank canvas point (the viewport or world receives it) away from frames.
const blankPoint = (page) =>
  page.evaluate(`(() => {
    const viewport = document.querySelector(".prototype-inspector__flow-viewport").getBoundingClientRect();
    for (let y = viewport.top + 60; y < viewport.bottom - 60; y += 20) for (let x = viewport.left + 60; x < viewport.right - 60; x += 20) {
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit.classList.contains("prototype-inspector__flow-viewport") || hit.classList.contains("prototype-inspector__flow-world"))) return { x, y };
    }
    return null;
  })()`);

const chooseZoomItem = (page, label) =>
  page.evaluate(`[...document.querySelectorAll(".prototype-inspector__flow-zoom-menu-item")].find((item) => item.textContent.startsWith(${JSON.stringify(label)})).click()`);

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const results = [];
function check(name, passed, detail) {
  results.push({ detail, name, passed: Boolean(passed) });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// Runs first, in a fresh browser profile with no cached frame sizes: N right
// after opening ends fit tracking, so a frame measured larger afterwards does
// not refit the flow.
async function caseOpeningFit(page, args) {
  if (!args.resizeUrl) {
    console.log("SKIP opening-fit case: no --resize-url");
    return;
  }
  const url = withGlobals(args.resizeUrl, { prototypeMode: "flow" });
  const response = await page.send("Page.navigate", { url });
  if (response.errorText) throw new Error(`Navigation to ${url} failed: ${response.errorText}`);
  await waitForFrames(page);
  const opened = await readState(page);
  await pressKey(page, "KeyN", "n", 78);
  await sleep(100);
  const afterN = await readState(page);
  await waitForSnapshotsIdle(page);
  const settled = await readState(page);
  const resized = Object.keys(afterN.frames)
    .filter((id) => settled.frames[id] && settled.frames[id].height !== afterN.frames[id].height)
    .map((id) => `${id} ${afterN.frames[id].height} -> ${settled.frames[id].height}`);
  check(
    "navigation: N right after opening ends fit tracking, and a frame measured larger afterwards does not refit the flow",
    opened.fitPressed === "true" &&
      sameList(afterN.selected, [opened.routeOrder[0]]) &&
      afterN.fitPressed === "false" &&
      resized.length > 0 &&
      settled.fitPressed === "false" &&
      Math.abs(settled.camera.z - afterN.camera.z) < 1e-6 &&
      Math.abs(settled.camera.x - afterN.camera.x) < 0.5 &&
      Math.abs(settled.camera.y - afterN.camera.y) < 0.5,
    JSON.stringify({ afterN: afterN.camera, opened: opened.fitPressed, resizedAfterN: resized, settled: settled.camera }),
  );
}

// b -> c in flow order, and the last route wraps to the first, each fitted at
// no more than 100%.
async function caseNavigation(page, args) {
  await freshFlow(page, args.url);
  const opened = await readState(page);
  const [a, b, c] = opened.routeOrder;
  await clickFrame(page, b);
  await pressKey(page, "KeyN", "n", 78);
  await sleep(300);
  const n1 = await readState(page);
  await pressKey(page, "Digit1", "!", 49, SHIFT);
  await sleep(400);
  await clickFrame(page, opened.routeOrder.at(-1));
  await pressKey(page, "KeyN", "n", 78);
  await sleep(300);
  const n2 = await readState(page);
  check(
    "navigation: N selects the next route in flow order and wraps from the last to the first, fitted at no more than 100%",
    sameList(n1.selected, [c]) && sameList(n2.selected, [a]) && n1.camera.z <= 1 && n2.camera.z <= 1,
    JSON.stringify({ afterB: n1.selected, afterLast: n2.selected, zoom: [n1.camera.z, n2.camera.z] }),
  );
}

async function caseSelection(page, args) {
  await freshFlow(page, args.url);
  const [a, b] = await framesOnScreen(page);
  await clickFrame(page, a);
  await clickFrame(page, b, SHIFT);
  await clickFrame(page, a, SHIFT);
  const toggled = await readState(page);
  check("selection: Shift+click A, B, A leaves only B selected and outlined", sameList(toggled.selected, [b]) && sameList(toggled.outlines, [b]), JSON.stringify(toggled.selected));

  const keysBefore = toggled.windowKeys.length;
  await pressKey(page, "Escape", "Escape", 27);
  await sleep(200);
  const cleared = await readState(page);
  await pressKey(page, "Escape", "Escape", 27);
  await sleep(200);
  const passed = await readState(page);
  const reached = passed.windowKeys.slice(keysBefore).filter((key) => key.code === "Escape");
  check(
    "selection: Escape clears the selection without reaching Storybook, and with nothing selected it propagates",
    cleared.selected.length === 0 && reached.length === 1 && !reached[0].prevented,
    JSON.stringify({ cleared: cleared.selected, escapesReachingWindow: reached }),
  );

  // Escape during a marquee restores the selection from before it.
  await clickFrame(page, b);
  const start = await blankPoint(page);
  if (!start) throw new Error("no blank canvas point");
  await mouse(page, "mouseMoved", start.x, start.y);
  await mouse(page, "mousePressed", start.x, start.y);
  for (let step = 1; step <= 10; step += 1) {
    await mouse(page, "mouseMoved", start.x + step * 60, start.y + step * 40, { buttons: 1 });
    await sleep(20);
  }
  const during = await page.evaluate(`!document.querySelector(".prototype-inspector__flow-marquee").hidden`);
  await pressKey(page, "Escape", "Escape", 27);
  await mouse(page, "mouseReleased", start.x + 600, start.y + 400);
  await sleep(300);
  const restored = await readState(page);
  check("selection: Escape during a marquee restores the previous selection", during && sameList(restored.selected, [b]), JSON.stringify({ marqueeShown: during, selected: restored.selected }));

  // A blank press released over the zoom group (outside the viewport) still
  // ends at the viewport, clearing the selection like any blank click, and
  // leaves nothing behind: later moves without a button draw no marquee.
  const zoomGroup = await page.evaluate(`document.querySelector(".prototype-inspector__flow-controls--zoom").getBoundingClientRect().toJSON()`);
  const nearGroup = await page.evaluate(`(() => {
    const group = ${JSON.stringify(zoomGroup)};
    for (let x = group.left - 2; x > group.left - 40; x -= 2) {
      const hit = document.elementFromPoint(x, group.top + group.height / 2);
      if (hit && (hit.classList.contains("prototype-inspector__flow-viewport") || hit.classList.contains("prototype-inspector__flow-world"))) return { x, y: group.top + group.height / 2 };
    }
    return null;
  })()`);
  if (!nearGroup) throw new Error("no blank canvas point beside the zoom group");
  const releaseAt = { x: zoomGroup.left + 2, y: nearGroup.y };
  const beforePress = await readState(page);
  await mouse(page, "mouseMoved", nearGroup.x, nearGroup.y);
  await mouse(page, "mousePressed", nearGroup.x, nearGroup.y);
  await mouse(page, "mouseMoved", releaseAt.x, releaseAt.y, { buttons: 1 });
  await mouse(page, "mouseReleased", releaseAt.x, releaseAt.y);
  await sleep(200);
  for (let step = 1; step <= 10; step += 1) {
    await mouse(page, "mouseMoved", nearGroup.x - step * 40, nearGroup.y + step * 40);
    await sleep(20);
  }
  await sleep(300);
  const afterHover = await readState(page);
  const marqueeShown = await page.evaluate(`!document.querySelector(".prototype-inspector__flow-marquee").hidden`);
  check(
    "selection: a blank press released over the zoom group clears the selection and leaves no marquee for later moves without a button",
    beforePress.selected.length > 0 && !marqueeShown && afterHover.selected.length === 0 && afterHover.camera.x === beforePress.camera.x && afterHover.camera.y === beforePress.camera.y,
    JSON.stringify({ marqueeShown, selected: afterHover.selected }),
  );
}

// The keyboard nudge examples of the spec, on the first route on screen.
async function caseNudge(page, args) {
  await freshFlow(page, args.url);
  const [frame] = await framesOnScreen(page);
  const at = (state) => [state.frames[frame].x, state.frames[frame].y];
  await clickFrame(page, frame);
  const start = await readState(page);
  const [x0, y0] = at(start);

  // ArrowRight, then Mod+Z within 500 ms, with an empty history.
  await arrowRight(page);
  await undoKey(page);
  await sleep(SETTLE_MS);
  const undone = await readState(page);
  check(
    "nudge: ArrowRight then Mod+Z within 500 ms (empty history) records the nudge once and undoes it",
    sameList(at(undone), [x0, y0]) && undone.layoutOps.length - start.layoutOps.length === 2 && !undone.windowKeys.some((key) => key.code === "KeyZ"),
    JSON.stringify({ position: at(undone), start: [x0, y0], writes: undone.layoutOps.length - start.layoutOps.length }),
  );

  // Three taps, each less than 500 ms after the previous release.
  for (let tap = 0; tap < 3; tap += 1) {
    await arrowRight(page);
    await sleep(100);
  }
  await sleep(NUDGE_COMMIT_MS + 300);
  const tapped = await readState(page);
  check("nudge: ArrowRight tapped three times moves 60 px as one layout action", sameList(at(tapped), [x0 + 60, y0]) && tapped.layoutOps.length - undone.layoutOps.length === 1, JSON.stringify({ position: at(tapped), writes: tapped.layoutOps.length - undone.layoutOps.length }));

  // Held: one press and two auto-repeats, then released.
  await page.send("Input.dispatchKeyEvent", { code: "ArrowRight", key: "ArrowRight", type: "keyDown", windowsVirtualKeyCode: 39 });
  for (let repeat = 0; repeat < 2; repeat += 1) {
    await sleep(50);
    await page.send("Input.dispatchKeyEvent", { autoRepeat: true, code: "ArrowRight", key: "ArrowRight", type: "keyDown", windowsVirtualKeyCode: 39 });
  }
  await page.send("Input.dispatchKeyEvent", { code: "ArrowRight", key: "ArrowRight", type: "keyUp", windowsVirtualKeyCode: 39 });
  await sleep(NUDGE_COMMIT_MS + 300);
  const held = await readState(page);
  check("nudge: ArrowRight held for three keydowns moves 60 px as one layout action", sameList(at(held), [x0 + 120, y0]) && held.layoutOps.length - tapped.layoutOps.length === 1, JSON.stringify({ position: at(held), writes: held.layoutOps.length - tapped.layoutOps.length }));

  await pressKey(page, "ArrowDown", "ArrowDown", 40, SHIFT);
  await sleep(NUDGE_COMMIT_MS + 300);
  const shifted = await readState(page);
  check("nudge: Shift+ArrowDown moves 100 px", sameList(at(shifted), [x0 + 120, y0 + 100]) && shifted.layoutOps.length - held.layoutOps.length === 1, JSON.stringify(at(shifted)));

  await pressKey(page, "ArrowLeft", "ArrowLeft", 37);
  await sleep(600);
  await pressKey(page, "ArrowLeft", "ArrowLeft", 37);
  await sleep(NUDGE_COMMIT_MS + 300);
  const twice = await readState(page);
  check("nudge: ArrowLeft tapped twice 600 ms apart is two layout actions", sameList(at(twice), [x0 + 80, y0 + 100]) && twice.layoutOps.length - shifted.layoutOps.length === 2, JSON.stringify({ position: at(twice), writes: twice.layoutOps.length - shifted.layoutOps.length }));

  // A drag right after a nudge: the nudge commits first, then the drag moves
  // the frame from the nudged position.
  const z = twice.camera.z;
  await arrowRight(page);
  await dragFrame(page, frame, 200, 0, z, { modifiers: CTRL });
  const dragged = await readState(page);
  const [dx, dy] = [dragged.frames[frame].x - (x0 + 100), dragged.frames[frame].y - (y0 + 100)];
  check(
    "nudge: dragging the selection right after an arrow key moves it on from the nudged position",
    Math.abs(dx - 200) <= 2 && Math.abs(dy) <= 1 && dragged.layoutOps.length - twice.layoutOps.length === 2,
    JSON.stringify({ dragOffset: [dx, dy], writes: dragged.layoutOps.length - twice.layoutOps.length }),
  );

  await pressKey(page, "Escape", "Escape", 27);
  await sleep(200);
  const keysBefore = (await readState(page)).windowKeys.length;
  await pressKey(page, "ArrowUp", "ArrowUp", 38);
  await sleep(NUDGE_COMMIT_MS + 300);
  const none = await readState(page);
  const reached = none.windowKeys.slice(keysBefore).filter((key) => key.code === "ArrowUp");
  check(
    "nudge: ArrowUp with nothing selected moves nothing and propagates",
    sameList(at(none), at(dragged)) && none.layoutOps.length === dragged.layoutOps.length && reached.length === 1 && !reached[0].prevented,
    JSON.stringify({ reached }),
  );
}

// An arrow key after Auto Layout ends the notice's undo period at once, so
// the notice's Undo can never undo the nudge instead of the layout.
async function caseNudgeEndsNotice(page, args) {
  await freshFlow(page, args.url);
  await page.evaluate(`document.querySelector(".prototype-inspector__flow-auto-layout-button").click()`);
  await sleep(SETTLE_MS);
  const noticeShown = () => page.evaluate(`Boolean(document.querySelector(".prototype-inspector__flow-auto-layout-notice"))`);
  const applied = await noticeShown();
  await pressKey(page, "Digit1", "!", 49, SHIFT);
  await sleep(400);
  const [frame] = await framesOnScreen(page, { topOnly: true });
  await clickFrame(page, frame);
  const stillShown = await noticeShown();
  await arrowRight(page);
  await sleep(50);
  const afterNudge = await noticeShown();
  check(
    "nudge: an arrow key ends the Auto Layout notice at once, before the nudge commits",
    applied && stillShown && !afterNudge,
    JSON.stringify({ afterApply: applied, afterNudge, afterSelect: stillShown }),
  );
  await sleep(NUDGE_COMMIT_MS + 300);
}

// At zoom 0.5 a box left edge dragged to 7 world px from another's snaps onto
// it with a guide; holding Ctrl places it at 7 px with no guide.
async function caseSnapping(page, args) {
  await freshFlow(page, args.url);
  await chooseZoomItem(page, "50%");
  await sleep(600);
  const state = await readState(page);
  const z = state.camera.z;
  const onScreen = await framesOnScreen(page, { topOnly: true });
  const pair = onScreen.flatMap((dragged) => onScreen.filter((other) => other !== dragged && Math.abs(state.frames[dragged].y - state.frames[other].y) > 500).map((other) => [dragged, other]))[0];
  if (!pair) throw new Error("no two frames on screen in different rows at 50%");
  const [dragged, candidate] = pair;
  const target = state.frames[candidate].x;
  const guides = await dragFrame(page, dragged, target + 7 - state.frames[dragged].x, 0, z);
  const snapped = await readState(page);
  check("snapping: at 50% a left edge 7 world px away snaps onto the other frame's, with a guide", snapped.frames[dragged].x === target && guides.includes("x"), JSON.stringify({ guides, x: snapped.frames[dragged].x, target }));
  const ctrlGuides = await dragFrame(page, dragged, 7, 0, z, { modifiers: CTRL });
  const free = await readState(page);
  check("snapping: holding Ctrl places the frame 7 px away with no guide", free.frames[dragged].x === target + 7 && ctrlGuides.length === 0, JSON.stringify({ guides: ctrlGuides, x: free.frames[dragged].x }));
}

// A minimap press at the panel point of world (2400, 3000), outside the
// viewport rectangle, centres the camera there at the same zoom.
async function caseMinimap(page, args) {
  await freshFlow(page, args.url);
  await pressKey(page, "Digit0", ")", 48, SHIFT);
  await sleep(400);
  const viewportBox = (await readState(page)).viewport;
  await page.send("Input.dispatchMouseEvent", { deltaX: -4000, deltaY: -4000, type: "mouseWheel", x: viewportBox.left + 400, y: viewportBox.top + 300 });
  await sleep(SETTLE_MS);
  const target = { x: 2400, y: 3000 };
  const panel = await page.evaluate(`(() => {
    const svg = document.querySelector(".prototype-inspector__flow-minimap");
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const [x, y, width, height] = svg.getAttribute("viewBox").split(" ").map(Number);
    const rect = svg.querySelector(".prototype-inspector__flow-minimap-viewport");
    return { box: box.toJSON(), rect: ["x", "y", "width", "height"].map((name) => Number(rect.getAttribute(name))), viewBox: { height, width, x, y } };
  })()`);
  if (!panel) throw new Error("no minimap");
  const scale = Math.min(panel.box.width / panel.viewBox.width, panel.box.height / panel.viewBox.height);
  const offsetX = (panel.box.width - panel.viewBox.width * scale) / 2;
  const offsetY = (panel.box.height - panel.viewBox.height * scale) / 2;
  const point = { x: panel.box.left + offsetX + (target.x - panel.viewBox.x) * scale, y: panel.box.top + offsetY + (target.y - panel.viewBox.y) * scale };
  const [rx, ry, rw, rh] = panel.rect;
  const outside = target.x < rx || target.x > rx + rw || target.y < ry || target.y > ry + rh;
  const inPanel = point.x > panel.box.left && point.x < panel.box.right && point.y > panel.box.top && point.y < panel.box.bottom;
  const before = await readState(page);
  await mouse(page, "mouseMoved", point.x, point.y);
  await mouse(page, "mousePressed", point.x, point.y);
  await mouse(page, "mouseReleased", point.x, point.y);
  await sleep(400);
  const after = await readState(page);
  const centre = { x: (after.viewport.width / 2 - after.camera.x) / after.camera.z, y: (after.viewport.height / 2 - after.camera.y) / after.camera.z };
  check(
    "minimap: a press at world (2400, 3000) outside the viewport rectangle centres the camera there at the same zoom",
    outside && inPanel && Math.abs(centre.x - target.x) < 2 && Math.abs(centre.y - target.y) < 2 && Math.abs(after.camera.z - before.camera.z) < 1e-6,
    JSON.stringify({ centre, inPanel, outsideViewportRect: outside, zoom: [before.camera.z, after.camera.z] }),
  );
}

// The journey intake, review, approval-decision, review: N by step index from
// the lowest selected step, the arrow keys move nothing, and switching
// journeys clears the selection.
async function caseJourney(page, args) {
  if (!args.journeyUrl) {
    console.log("SKIP journey cases: no --journey-url");
    return;
  }
  const url = new URL(args.journeyUrl);
  const prototypeId = url.searchParams.get("id")?.replace(/^pages-prototypes-/, "").replace(/--[^-]+$/, "") ?? "";
  await freshFlow(page, args.journeyUrl, { [`prototype-inspector:flow-journey:${prototypeId}`]: "declared:request-changes" });
  const shown = await readState(page);
  if (!("1:review" in shown.frames && "3:review" in shown.frames)) throw new Error(`the request-changes journey view is not shown (${Object.keys(shown.frames).join(", ")})`);
  await clickFrame(page, "3:review");
  const one = await readState(page);
  await pressKey(page, "KeyN", "n", 78);
  await sleep(300);
  const wrapped = await readState(page);
  check(
    "journey: selecting the second review outlines only it, and N wraps to 0:intake",
    sameList(one.outlines, ["3:review"]) && sameList(wrapped.selected, ["0:intake"]) && sameList(wrapped.outlines, ["0:intake"]),
    JSON.stringify({ afterN: wrapped.selected, outlined: one.outlines }),
  );
  await pressKey(page, "Digit1", "!", 49, SHIFT);
  await sleep(400);
  await clickFrame(page, "1:review");
  await clickFrame(page, "3:review", SHIFT);
  await pressKey(page, "KeyN", "n", 78);
  await sleep(300);
  const fromLowest = await readState(page);
  check("journey: with 1:review and 3:review selected, N selects 2:approval-decision", sameList(fromLowest.selected, ["2:approval-decision"]), JSON.stringify(fromLowest.selected));

  const keysBefore = fromLowest.windowKeys.length;
  await arrowRight(page);
  await undoKey(page);
  await sleep(NUDGE_COMMIT_MS + 300);
  const still = await readState(page);
  const reached = still.windowKeys.slice(keysBefore).filter((key) => key.code === "ArrowRight" || key.code === "KeyZ");
  const unmoved = Object.keys(fromLowest.frames).every((id) => still.frames[id].x === fromLowest.frames[id].x && still.frames[id].y === fromLowest.frames[id].y && !still.frames[id].transform);
  check(
    "journey: ArrowRight and Mod+Z move nothing, record nothing and reach Storybook",
    unmoved && still.layoutOps.length === fromLowest.layoutOps.length && reached.length === 2 && reached.every((key) => !key.prevented),
    JSON.stringify({ reached, unmoved, writes: still.layoutOps.length - fromLowest.layoutOps.length }),
  );

  // A press on a step instance released over blank canvas, then a switch to
  // the complete flow: a frame drag there still ends on its release.
  const pressAt = await framePoint(page, "1:review");
  const blank = await blankPoint(page);
  if (!pressAt || !blank) throw new Error("no point on 1:review or on blank canvas");
  await mouse(page, "mouseMoved", pressAt.x, pressAt.y);
  await mouse(page, "mousePressed", pressAt.x, pressAt.y);
  for (let step = 1; step <= 8; step += 1) {
    await mouse(page, "mouseMoved", pressAt.x + ((blank.x - pressAt.x) * step) / 8, pressAt.y + ((blank.y - pressAt.y) * step) / 8, { buttons: 1 });
    await sleep(20);
  }
  await mouse(page, "mouseReleased", blank.x, blank.y);
  await sleep(300);
  await page.evaluate(`[...document.querySelectorAll(".prototype-inspector__flow-journey")].find((button) => button.getAttribute("aria-label") !== "Request changes" && button.getAttribute("aria-pressed") === "false")?.click()`);
  await sleep(SETTLE_MS);
  const switched = await readState(page);
  check(
    "journey: switching to another journey clears the selection",
    switched.journey !== "declared:request-changes" && switched.selected.length === 0 && switched.outlines.length === 0,
    JSON.stringify({ journey: switched.journey, selected: switched.selected }),
  );
  await page.evaluate(`[...document.querySelectorAll(".prototype-inspector__flow-journey")].find((button) => button.textContent.startsWith("全部"))?.click()`);
  await sleep(SETTLE_MS);
  const full = await readState(page);
  if (full.journey) throw new Error(`the complete flow is not shown (${full.journey})`);
  const [target] = await framesOnScreen(page, { topOnly: true });
  await dragFrame(page, target, 120, 0, full.camera.z, { modifiers: CTRL });
  const moved = await readState(page);
  const grab = await framePoint(page, target);
  for (let step = 1; step <= 8; step += 1) {
    await mouse(page, "mouseMoved", grab.x + step * 10, grab.y + step * 5);
    await sleep(20);
  }
  await sleep(300);
  const hovered = await readState(page);
  check(
    "journey: after a read-only press released off its frame, a drag in the complete flow ends on release and later hovering moves nothing",
    Math.abs(moved.frames[target].x - full.frames[target].x - 120) <= 2 &&
      hovered.frames[target].x === moved.frames[target].x &&
      hovered.frames[target].y === moved.frames[target].y &&
      !hovered.frames[target].transform,
    JSON.stringify({ dragged: moved.frames[target].x - full.frames[target].x, hoverShift: [hovered.frames[target].x - moved.frames[target].x, hovered.frames[target].transform] }),
  );
}

const cases = [caseOpeningFit, caseNavigation, caseSelection, caseNudge, caseNudgeEndsNotice, caseSnapping, caseMinimap, caseJourney];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chrome = findChrome();
  if (!chrome) throw new Error("No Chrome/Chromium binary found. Set CHROME_PATH.");
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "flow-editing-check-"));
  const browser = spawn(
    chrome,
    [
      ...(args.headed ? [] : ["--headless=new"]),
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let socket;
  try {
    socket = new WebSocket(await browserWebSocketUrl(browser));
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const cdp = new CdpClient(socket);
    for (const runCase of cases) {
      const page = await openPage(cdp);
      try {
        await runCase(page, args);
      } catch (error) {
        check(runCase.name, false, error instanceof Error ? error.message : String(error));
      } finally {
        await clearStoredFlow(page).catch(() => undefined);
        await cdp.send("Target.closeTarget", { targetId: page.targetId }).catch(() => undefined);
      }
    }
  } finally {
    socket?.close();
    const exited = new Promise((resolve) => browser.once("exit", resolve));
    browser.kill("SIGTERM");
    await Promise.race([exited, sleep(5_000)]);
    await rm(profileDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });
  }
  const failed = results.filter((result) => !result.passed);
  console.log(`${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length} UI Flow editing checks`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
