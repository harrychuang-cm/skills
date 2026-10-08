#!/usr/bin/env node
// Checks the UI Flow Auto Layout (flow-auto-layout) in system Chrome over CDP
// (Node built-in WebSocket, no packages). Run it against a Storybook started
// from create_flow_bench_fixture.mjs:
//
//   node storybook-product-prototype/scripts/check_flow_auto_layout.mjs \
//     --url "http://localhost:6006/iframe.html?id=pages-prototypes-bench-growth-fund--default&viewMode=story" \
//     [--headed]
//
// Feature-name cases need a flow with more than one lane (the growth-fund
// story); on a one-lane flow (the example prototype, whose journeys leave
// one lane) the script checks that no name is shown and skips them. Every
// case starts from an empty saved layout. Exits non-zero when a case fails.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getAutoLayoutLabelPlacement } from "../assets/prototype-inspector/flow-canvas-geometry.js";

const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 1 };
const READY_TIMEOUT_MS = 120_000;
const SETTLE_MS = 800;
const NOTICE_MS = 8_000;
const MARK_COMMIT = "pi:flow:commit";

function usage() {
  return [
    "Usage: node storybook-product-prototype/scripts/check_flow_auto_layout.mjs --url <prototype story iframe URL> [--headed]",
    "",
    "  --url <url>   Storybook iframe URL of a prototype story (required); globals are set per case.",
    "  --headed      Run Chrome with a window instead of --headless=new.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { headed: false, url: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url") args.url = argv[++index];
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

// Counts sbfx:anchors-moved events, route iframe loads and writes of the
// saved layout key on every document.
const INSTRUMENTATION = `(() => {
  if (window !== window.top) return;
  window.__autoLayoutCheck = { anchorsMoved: 0, iframeLoads: 0, layoutOps: [] };
  for (const method of ["setItem", "removeItem"]) {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function (key, value) {
      if (this === window.localStorage && String(key).startsWith("prototype-inspector:flow-layout:")) window.__autoLayoutCheck.layoutOps.push(method);
      return original.call(this, key, value);
    };
  }
  document.addEventListener("sbfx:anchors-moved", () => { window.__autoLayoutCheck.anchorsMoved += 1; }, true);
  document.addEventListener("load", (event) => {
    if (event.target instanceof HTMLIFrameElement) window.__autoLayoutCheck.iframeLoads += 1;
  }, true);
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

async function openFlow(page, url) {
  const response = await page.send("Page.navigate", { url });
  if (response.errorText) throw new Error(`Navigation to ${url} failed: ${response.errorText}`);
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    const ready = await page
      .evaluate(`Boolean(document.querySelector(".prototype-inspector--flow:not([data-snapshot-preload]) .prototype-inspector__flow-frame"))`, 10_000)
      .catch(() => false);
    if (ready) break;
    await sleep(200);
  }
  await sleep(1_500);
}

// In-page reads. Frame boxes are world coordinates from the frames' CSS
// variables; the camera comes from the world layer's transform.
const READ_STATE = `(() => {
  const root = document.querySelector(".prototype-inspector--flow");
  const px = (element, name) => Number.parseFloat(element.style.getPropertyValue(name));
  const frames = [
    ...[...root.querySelectorAll(".prototype-inspector__flow-world .prototype-inspector__flow-frame")].map((element) => ({
      height: px(element, "--prototype-flow-card-height"),
      id: element.getAttribute("data-frame-id"),
      type: "route",
      width: px(element, "--prototype-flow-card-width"),
      x: px(element, "--prototype-flow-card-x"),
      y: px(element, "--prototype-flow-card-y"),
    })),
    ...[...root.querySelectorAll(".prototype-inspector__flow-world .prototype-inspector__flow-node")].map((element) => ({
      height: px(element, "--prototype-flow-node-height"),
      id: element.getAttribute("data-frame-id"),
      type: "flow",
      width: px(element, "--prototype-flow-node-width"),
      x: px(element, "--prototype-flow-node-x"),
      y: px(element, "--prototype-flow-node-y"),
    })),
  ];
  const matrix = new DOMMatrixReadOnly(getComputedStyle(root.querySelector(".prototype-inspector__flow-world")).transform);
  const viewport = root.querySelector(".prototype-inspector__flow-viewport").getBoundingClientRect();
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { bottom: box.bottom, left: box.left, right: box.right, top: box.top };
  };
  const notice = root.querySelector(".prototype-inspector__flow-auto-layout-notice");
  return {
    anchorsMoved: window.__autoLayoutCheck?.anchorsMoved ?? 0,
    button: rect(root.querySelector(".prototype-inspector__flow-auto-layout-button")),
    camera: { x: matrix.e, y: matrix.f, z: matrix.a },
    commits: performance.getEntriesByName(${JSON.stringify(MARK_COMMIT)}).length,
    dialog: Boolean([...root.querySelectorAll('[role="dialog"] h2')].find((heading) => heading.textContent === "Auto layout this UI Flow?")),
    fitPressed: root.querySelector('[aria-label="Fit canvas"]')?.getAttribute("aria-pressed"),
    frames,
    iframeLoads: window.__autoLayoutCheck?.iframeLoads ?? 0,
    layoutOps: (window.__autoLayoutCheck?.layoutOps ?? []).slice(),
    lanesStored: Object.keys(localStorage).filter((key) => key.startsWith("prototype-inspector:flow-lanes:")).length,
    layoutGroup: rect(root.querySelector(".prototype-inspector__flow-controls--layout")),
    names: [...root.querySelectorAll(".prototype-inspector__flow-lane-label")].map((element) => ({
      anchor: element.getAttribute("data-lane-anchor"),
      key: element.getAttribute("data-lane-key"),
      rect: rect(element),
      text: element.textContent,
    })),
    notice: rect(notice),
    rendererSrc: root.querySelector("iframe[data-prototype-inspector-renderer]")?.getAttribute("src") ?? null,
    viewport: { bottom: viewport.bottom, left: viewport.left, right: viewport.right, top: viewport.top },
    workspace: rect(document.querySelector(".sbfx-workspace:not([data-export-collapsed='true'])")),
  };
})()`;
const readState = (page) => page.evaluate(READ_STATE);
const positionsOf = (state) => Object.fromEntries(state.frames.map((frame) => [frame.id, [Math.round(frame.x), Math.round(frame.y)]]));
const samePositions = (a, b) => JSON.stringify(positionsOf(a)) === JSON.stringify(positionsOf(b));

function overlappingPairs(frames) {
  const hits = [];
  for (let i = 0; i < frames.length; i += 1) {
    for (let j = i + 1; j < frames.length; j += 1) {
      const a = frames[i];
      const b = frames[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) hits.push(`${a.id}/${b.id}`);
    }
  }
  return hits;
}

// Lanes are stacked 240 world px apart and sub-rows 120 apart: frames whose
// vertical extents chain with gaps under 240 form one lane band.
function laneBands(frames) {
  const sorted = [...frames].sort((a, b) => a.y - b.y);
  const bands = [];
  for (const frame of sorted) {
    const band = bands.at(-1);
    if (band && frame.y < band.bottom + 239) {
      band.frames.push(frame);
      band.bottom = Math.max(band.bottom, frame.y + frame.height);
    } else {
      bands.push({ bottom: frame.y + frame.height, frames: [frame] });
    }
  }
  return bands;
}

const clickSelector = (page, selector) =>
  page.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error("no ${selector.replaceAll('"', "'")}"); element.click(); })()`);
const clickButtonText = (page, text) =>
  page.evaluate(`(() => { const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent === ${JSON.stringify(text)} && candidate.offsetParent); if (!button) throw new Error("no button ${text}"); button.click(); })()`);

async function pressKey(page, code, key, keyCode, modifiers = 0) {
  await page.send("Input.dispatchKeyEvent", { code, key, modifiers, type: "keyDown", windowsVirtualKeyCode: keyCode });
  await page.send("Input.dispatchKeyEvent", { code, key, modifiers, type: "keyUp", windowsVirtualKeyCode: keyCode });
}

// A frame's visible preview center on screen (falls back to the node box).
const framePoint = (page, frameId) =>
  page.evaluate(`(() => {
    const frame = document.querySelector('.prototype-inspector__flow-world [data-frame-id="${frameId}"]');
    const target = frame?.querySelector(".prototype-inspector__flow-frame-preview") ?? frame;
    if (!target) return null;
    const box = target.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + Math.min(box.height / 2, 120) };
  })()`);

// A real pointer drag through Chrome's input pipeline. `during` runs after
// the moves, before the release.
async function dragFrame(page, frameId, { dx = 120, dy = 60, modifiers = 0, steps = 12, during = null } = {}) {
  const start = await framePoint(page, frameId);
  if (!start) throw new Error(`no frame ${frameId}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: start.x, y: start.y });
  await page.send("Input.dispatchMouseEvent", { button: "left", clickCount: 1, type: "mousePressed", x: start.x, y: start.y });
  for (let step = 1; step <= steps; step += 1) {
    await page.send("Input.dispatchMouseEvent", { buttons: 1, modifiers, type: "mouseMoved", x: start.x + (dx * step) / steps, y: start.y + (dy * step) / steps });
    await sleep(16);
  }
  const result = during ? await during({ x: start.x + dx, y: start.y + dy }) : null;
  await page.send("Input.dispatchMouseEvent", { button: "left", clickCount: 1, type: "mouseReleased", x: start.x + dx, y: start.y + dy });
  await sleep(SETTLE_MS);
  return result;
}

async function clearSavedLayout(page) {
  await page.evaluate(`Object.keys(localStorage).filter((key) => key.startsWith("prototype-inspector:flow-layout:") || key.startsWith("prototype-inspector:flow-lanes:")).forEach((key) => localStorage.removeItem(key)); sessionStorage.clear();`);
}

async function applyAutoLayout(page) {
  await clickSelector(page, ".prototype-inspector__flow-auto-layout-button");
  await sleep(SETTLE_MS);
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const results = [];
function check(name, passed, detail) {
  results.push({ detail, name, passed: Boolean(passed) });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// Opens the flow with an empty saved layout.
async function freshFlow(page, args, globals = {}) {
  const url = withGlobals(args.url, { prototypeMode: "flow", ...globals });
  await openFlow(page, url);
  await clearSavedLayout(page);
  await openFlow(page, url);
  return url;
}

async function caseApplyAndUndo(page, args) {
  await freshFlow(page, args);
  const before = await readState(page);
  await applyAutoLayout(page);
  const applied = await readState(page);
  check(
    "apply: without a saved layout no dialog opens, frames do not overlap and the camera fits them",
    !applied.dialog && overlappingPairs(applied.frames).length === 0 && applied.fitPressed === "true" && !samePositions(before, applied),
    JSON.stringify({ fit: applied.fitPressed, overlaps: overlappingPairs(applied.frames).slice(0, 3) }),
  );
  check(
    "apply: pins follow (sbfx:anchors-moved) and no route iframe or renderer reloads",
    applied.anchorsMoved > before.anchorsMoved && applied.iframeLoads === before.iframeLoads && applied.rendererSrc === before.rendererSrc,
    JSON.stringify({ anchorsMoved: applied.anchorsMoved - before.anchorsMoved, iframeLoads: applied.iframeLoads - before.iframeLoads }),
  );
  check("apply: the Undo notice is shown", Boolean(applied.notice));

  // A drag release ends the possibility to undo.
  const firstFrame = applied.frames[0].id;
  await dragFrame(page, firstFrame);
  const dragged = await readState(page);
  check("undo: a drag release ends it", !dragged.notice);

  // With a saved layout the dialog asks first; Cancel and Escape change nothing.
  await applyAutoLayout(page);
  const asked = await readState(page);
  await clickButtonText(page, "Cancel");
  await sleep(SETTLE_MS);
  const cancelled = await readState(page);
  await applyAutoLayout(page);
  const askedAgain = await readState(page);
  await pressKey(page, "Escape", "Escape", 27);
  await sleep(SETTLE_MS);
  const escaped = await readState(page);
  check(
    "dialog: a saved layout asks first; Cancel and Escape keep every position",
    asked.dialog && askedAgain.dialog && !cancelled.dialog && !escaped.dialog && samePositions(dragged, cancelled) && samePositions(dragged, escaped),
    JSON.stringify({ asked: asked.dialog, askedAgain: askedAgain.dialog }),
  );

  // Undo restores a dragged layout that had no names (spec scenario): the
  // positions come back and no name is shown.
  await freshFlow(page, args);
  await dragFrame(page, applied.frames[0].id);
  const draggedOnly = await readState(page);
  await applyAutoLayout(page);
  await clickSelector(page, '[role="dialog"] .prototype-inspector__flow-reset-dialog-confirm');
  await sleep(SETTLE_MS);
  const confirmed = await readState(page);
  await clickButtonText(page, "Undo");
  await sleep(SETTLE_MS);
  const undone = await readState(page);
  check(
    "undo: restores the dragged layout, shows no feature name and hides the notice",
    !samePositions(draggedOnly, confirmed) && samePositions(draggedOnly, undone) && undone.names.length === 0 && !undone.notice && undone.lanesStored === 0,
    JSON.stringify({ names: undone.names.length, notice: Boolean(undone.notice) }),
  );
  // Undo also restores names saved before: apply, drag, apply again, Undo.
  await freshFlow(page, args);
  await applyAutoLayout(page);
  await dragFrame(page, applied.frames[0].id);
  const namedDragged = await readState(page);
  await applyAutoLayout(page);
  await clickSelector(page, '[role="dialog"] .prototype-inspector__flow-reset-dialog-confirm');
  await sleep(SETTLE_MS);
  await clickButtonText(page, "Undo");
  await sleep(SETTLE_MS);
  const namedUndone = await readState(page);
  if (namedDragged.names.length === 0) {
    console.log("SKIP undo with names: this story's auto layout has one lane");
    return;
  }
  check(
    "undo: restores the names that were saved before the auto layout",
    samePositions(namedDragged, namedUndone) &&
      JSON.stringify(namedUndone.names.map((name) => name.key)) === JSON.stringify(namedDragged.names.map((name) => name.key)),
    `${namedUndone.names.length} names`,
  );
}

async function caseNoticeDuringDrag(page, args) {
  await freshFlow(page, args);
  await applyAutoLayout(page);
  const applied = await readState(page);
  const frameId = applied.frames[0].id;
  const start = await framePoint(page, frameId);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: start.x, y: start.y });
  await page.send("Input.dispatchMouseEvent", { button: "left", clickCount: 1, type: "mousePressed", x: start.x, y: start.y });
  await page.send("Input.dispatchMouseEvent", { buttons: 1, type: "mouseMoved", x: start.x + 20, y: start.y + 10 });
  await sleep(100);
  const firstMove = await readState(page);
  const startedAt = Date.now();
  let step = 0;
  while (Date.now() - startedAt < NOTICE_MS + 800) {
    step += 1;
    await page.send("Input.dispatchMouseEvent", { buttons: 1, type: "mouseMoved", x: start.x + 20 + (step % 20), y: start.y + 10 + (step % 7) });
    await sleep(200);
  }
  const beforeRelease = await readState(page);
  await page.send("Input.dispatchMouseEvent", { button: "left", clickCount: 1, type: "mouseReleased", x: start.x + 40, y: start.y + 16 });
  await sleep(SETTLE_MS);
  const released = await readState(page);
  check(
    "notice: its time ending during a drag commits nothing until the release, which ends Undo",
    beforeRelease.commits === firstMove.commits && Boolean(beforeRelease.notice) && !released.notice,
    JSON.stringify({ commitsDuringDrag: beforeRelease.commits - firstMove.commits, noticeAtRelease: Boolean(beforeRelease.notice) }),
  );
}

async function caseNames(page, args) {
  const url = await freshFlow(page, args);
  await applyAutoLayout(page);
  const applied = await readState(page);
  const bands = laneBands(applied.frames);
  if (applied.names.length === 0) {
    check("names: a one-lane layout shows no feature name", bands.length === 1, `${bands.length} lane bands`);
    console.log("SKIP names: this story's auto layout has one lane");
    return;
  }

  // One name per lane band, on that band's first frame.
  const bandOf = (frameId) => bands.findIndex((band) => band.frames.some((frame) => frame.id === frameId));
  const nameBands = applied.names.map((name) => bandOf(name.anchor));
  check(
    "names: one feature name per lane, in lane order, on the lane's leftmost frame",
    applied.names.length === bands.length &&
      nameBands.every((band, index) => band === index) &&
      applied.names.every((name) => {
        const band = bands[bandOf(name.anchor)];
        const anchor = band.frames.find((frame) => frame.id === name.anchor);
        return band.frames.every((frame) => frame.x >= anchor.x);
      }),
    JSON.stringify({ bands: bands.length, names: applied.names.map((name) => name.text) }),
  );
  // Positions match the reference placement (with the page's screen gutter);
  // fitted names are fully visible.
  const gutter = await page.evaluate(`Number.parseFloat(getComputedStyle(document.querySelector(".prototype-inspector--flow")).getPropertyValue("--pi-sys-spacing-screen-gutter"))`);
  const offsets = applied.names.map((name) => {
    const anchor = applied.frames.find((frame) => frame.id === name.anchor);
    const expected = getAutoLayoutLabelPlacement(anchor, applied.camera, anchor.type, gutter);
    return Math.max(
      Math.abs(name.rect.right - (applied.viewport.left + expected.right)),
      Math.abs(name.rect.top - (applied.viewport.top + expected.top)),
    );
  });
  check("names: each sits within 1 px of its reference placement", offsets.every((offset) => offset <= 1), `worst ${Math.max(...offsets).toFixed(2)} px (gutter ${gutter} px)`);
  check(
    "names: after the fit every name is fully inside the canvas",
    applied.names.every(
      (name) => name.rect.left >= applied.viewport.left && name.rect.right <= applied.viewport.right && name.rect.top >= applied.viewport.top && name.rect.bottom <= applied.viewport.bottom,
    ),
    JSON.stringify(applied.names.map((name) => Math.round(name.rect.left))),
  );
  // Each lane reads left to right: its drawn lines point right, except key
  // lines the arrangement ignores (kind return or global) and lines back to a
  // screen already placed (a cycle), which the DOM cannot tell apart; so 80%
  // is required (growth-fund: every line points right).
  const lines = await page.evaluate(`[...document.querySelectorAll('.prototype-inspector__flow-world polyline[data-sbfx-anchor^="edge:"]')].map((line) => line.getAttribute("data-sbfx-anchor").slice(5).split("->"))`);
  const byId = new Map(applied.frames.map((frame) => [frame.id, frame]));
  const inLane = lines.filter(([from, to]) => byId.has(from) && byId.has(to) && bandOf(from) === bandOf(to));
  const forward = inLane.filter(([from, to]) => byId.get(to).x > byId.get(from).x);
  check(
    "lanes: lines inside a lane run left to right",
    inLane.length > 0 && forward.length / inLane.length >= 0.8,
    `${forward.length}/${inLane.length} lines inside lanes point right`,
  );

  // Reload keeps positions and names.
  await openFlow(page, url);
  const reloaded = await readState(page);
  check(
    "reload: the positions and feature names are still there",
    samePositions(applied, reloaded) && JSON.stringify(reloaded.names.map((name) => name.key)) === JSON.stringify(applied.names.map((name) => name.key)),
    `${reloaded.names.length} names`,
  );

  // Dragging a lane's first frame moves only that lane's name, without a commit
  // (the hover the pointer causes before pressing settles first).
  const target = reloaded.names[1] ?? reloaded.names[0];
  const others = reloaded.names.filter((name) => name.key !== target.key);
  const hoverPoint = await framePoint(page, target.anchor);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hoverPoint.x, y: hoverPoint.y });
  await sleep(500);
  const beforeDrag = await readState(page);
  const midDrag = await dragFrame(page, target.anchor, {
    dx: 0,
    dy: 120,
    during: async () => {
      const state = await readState(page);
      return state;
    },
  });
  const moved = midDrag.names.find((name) => name.key === target.key);
  const stayed = others.every((name) => {
    const now = midDrag.names.find((candidate) => candidate.key === name.key);
    return now && Math.abs(now.rect.top - name.rect.top) < 0.5 && Math.abs(now.rect.right - name.rect.right) < 0.5;
  });
  check(
    "names: dragging a lane's first frame moves only that lane's name, with no commit during the drag",
    moved && moved.rect.top - target.rect.top > 50 && stayed && midDrag.commits === beforeDrag.commits,
    JSON.stringify({ commitsDuringDrag: midDrag.commits - beforeDrag.commits, movedPx: moved ? Math.round(moved.rect.top - target.rect.top) : null }),
  );

  // Export carries the names; Reset removes them; Import brings them back.
  const downloadDir = await mkdtemp(path.join(os.tmpdir(), "flow-auto-layout-export-"));
  try {
    await page.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir }).catch(() =>
      page.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir }),
    );
    await clickSelector(page, '[aria-label="Export UI Flow layout"]');
    let file = null;
    for (let attempt = 0; attempt < 50 && !file; attempt += 1) {
      await sleep(100);
      file = (await readdir(downloadDir)).find((name) => name.endsWith(".json"));
    }
    const exported = file ? JSON.parse(await readFile(path.join(downloadDir, file), "utf8")) : null;
    check(
      "export: the layout file carries the shown names as lanes",
      Array.isArray(exported?.lanes) && exported.lanes.length === reloaded.names.length,
      exported ? `${exported.lanes?.length ?? 0} lanes` : "no file downloaded",
    );
    // A journey view hides the names, but its export still carries them.
    const journeyEntry = await page.evaluate(`document.querySelectorAll(".prototype-inspector__flow-journey")[1]?.getAttribute("aria-label") ?? null`);
    if (journeyEntry) {
      await page.evaluate(`document.querySelectorAll(".prototype-inspector__flow-journey")[1].click()`);
      await sleep(SETTLE_MS);
      const hidden = await readState(page);
      // A second download may reuse the first file name: read it, then wait
      // for a file with the new export time.
      const firstExportedAt = exported?.exportedAt ?? null;
      await clickSelector(page, '[aria-label="Export UI Flow layout"]');
      let journeyExport = null;
      for (let attempt = 0; attempt < 50 && !journeyExport; attempt += 1) {
        await sleep(100);
        for (const name of (await readdir(downloadDir)).filter((entry) => entry.endsWith(".json"))) {
          let candidate = null;
          try {
            candidate = JSON.parse(await readFile(path.join(downloadDir, name), "utf8"));
          } catch {
            // Still being written.
          }
          if (candidate && candidate.exportedAt !== firstExportedAt) journeyExport = candidate;
        }
      }
      check(
        "export: from a journey view, which hides the names, the file still carries them",
        hidden.names.length === 0 && journeyExport?.lanes?.length === reloaded.names.length,
        JSON.stringify({ journey: journeyEntry, lanes: journeyExport?.lanes?.length ?? null, shown: hidden.names.length }),
      );
      await page.evaluate(`[...document.querySelectorAll(".prototype-inspector__flow-journey")].find((button) => button.getAttribute("aria-label") === "All").click()`);
      await sleep(SETTLE_MS);
    }

    await clickSelector(page, '[aria-label="Reset UI Flow layout"]');
    await sleep(300);
    await clickButtonText(page, "Reset");
    await sleep(SETTLE_MS);
    const reset = await readState(page);
    check("reset: no feature name is shown and the lanes key is removed", reset.names.length === 0 && reset.lanesStored === 0);

    if (file) {
      const { root } = await page.send("DOM.getDocument", { depth: 1 });
      const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".prototype-inspector__flow-import-input" });
      await page.send("DOM.setFileInputFiles", { files: [path.join(downloadDir, file)], nodeId });
      await sleep(SETTLE_MS + 400);
      const imported = await readState(page);
      check(
        "import: the file's lanes bring the names back",
        imported.names.length === reloaded.names.length && imported.lanesStored === 1,
        `${imported.names.length} names`,
      );
    }
  } finally {
    await rm(downloadDir, { force: true, recursive: true });
  }
}

// Applied on a cold open (empty snapshot cache) before the routes are
// measured: frames measured larger afterwards re-arrange the lanes, so no
// two frames overlap once every route is measured (the round-up story has
// routes taller than their viewport).
async function caseMeasuredAfterApply(page, args) {
  const url = withGlobals(args.url, { prototypeMode: "flow" });
  await openFlow(page, url);
  await clearSavedLayout(page);
  await page.evaluate(`new Promise((resolve) => {
    const request = indexedDB.deleteDatabase("prototype-inspector-snapshots");
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })`);
  await page.send("Page.navigate", { url });
  for (let attempt = 0; attempt < 600; attempt += 1) {
    await sleep(100);
    const ready = await page
      .evaluate(`Boolean(document.querySelector(".prototype-inspector--flow:not([data-snapshot-preload]) .prototype-inspector__flow-auto-layout-button"))`, 10_000)
      .catch(() => false);
    if (ready) break;
  }
  await applyAutoLayout(page);
  const applied = await readState(page);
  let idleSince = 0;
  for (let waited = 0; waited < 120_000; waited += 250) {
    const queue = await page.evaluate(`document.querySelector(".prototype-inspector--flow")?.getAttribute("data-snapshot-queue")`);
    idleSince = queue === "idle" ? idleSince + 250 : 0;
    if (idleSince >= 1_500) break;
    await sleep(250);
  }
  await sleep(SETTLE_MS);
  const measured = await readState(page);
  const grew = measured.frames.filter((frame) => {
    const before = applied.frames.find((candidate) => candidate.id === frame.id);
    return before && frame.height > before.height + 1;
  });
  check(
    "remeasure: frames measured after applying re-arrange the lanes, and no two frames overlap",
    overlappingPairs(measured.frames).length === 0 && (grew.length === 0 || !samePositions(applied, measured)),
    JSON.stringify({ grew: grew.map((frame) => frame.id), overlaps: overlappingPairs(measured.frames).slice(0, 3) }),
  );
}

// Layout undo history (flow-canvas-editing): the spec's history sequence,
// Auto Layout undone and redone from the keyboard with its names, and one
// write of the layout key per undo and redo, also around a Reset.
async function caseUndoHistory(page, args) {
  const META = 4;
  const SHIFT = 8;
  const CTRL = 2;
  await freshFlow(page, args);
  const at = (state, id) => state.frames.find((frame) => frame.id === id);
  const opsSince = (before, after) => after.layoutOps.slice(before.layoutOps.length);
  const undo = () => pressKey(page, "KeyZ", "z", 90, META);
  const redo = () => pressKey(page, "KeyZ", "z", 90, META | SHIFT);
  const s0 = await readState(page);
  const target = s0.frames.find((frame) => frame.type === "route").id;
  const z = s0.camera.z;
  // 1. Drag 200 world px right (Ctrl: no snapping); the drag selects it.
  await dragFrame(page, target, { dx: 200 * z, dy: 0, modifiers: CTRL });
  const s1 = await readState(page);
  // 2. Nudge right once.
  await pressKey(page, "ArrowRight", "ArrowRight", 39);
  await sleep(800);
  const s2 = await readState(page);
  // 3-5. Undo, undo, redo.
  await undo();
  await sleep(SETTLE_MS);
  const s3 = await readState(page);
  await undo();
  await sleep(SETTLE_MS);
  const s4 = await readState(page);
  await redo();
  await sleep(SETTLE_MS);
  const s5 = await readState(page);
  // 6. A new drag drops what could be redone.
  await dragFrame(page, target, { dx: -100 * z, dy: 100 * z, modifiers: CTRL });
  const s6 = await readState(page);
  await redo();
  await sleep(SETTLE_MS);
  const s7 = await readState(page);
  const x = (state) => at(state, target).x;
  check(
    "history: drag, nudge, undo, undo, redo and a new drag follow the spec's sequence",
    x(s2) === x(s1) + 20 && x(s3) === x(s1) && x(s4) === x(s0) && x(s5) === x(s1) && at(s7, target).x === at(s6, target).x && at(s7, target).y === at(s6, target).y,
    JSON.stringify({ start: x(s0), dragged: x(s1), nudged: x(s2), undo1: x(s3), undo2: x(s4), redo: x(s5), newDrag: [x(s6), at(s6, target).y], redoAfterDrag: [x(s7), at(s7, target).y] }),
  );
  check(
    "history: every undo and redo writes the layout key once",
    opsSince(s2, s3).length === 1 && opsSince(s3, s4).length === 1 && opsSince(s4, s5).length === 1 && opsSince(s6, s7).length === 0,
    JSON.stringify({ undo1: opsSince(s2, s3), undo2: opsSince(s3, s4), redo: opsSince(s4, s5), redoAfterDrag: opsSince(s6, s7) }),
  );

  // Auto layout from the keyboard: Mod+Z restores the dragged layout and its
  // (absent) names and ends the notice; Shift+Mod+Z brings both back.
  await applyAutoLayout(page);
  await clickSelector(page, '[role="dialog"] .prototype-inspector__flow-reset-dialog-confirm');
  await sleep(SETTLE_MS);
  const applied = await readState(page);
  await undo();
  await sleep(SETTLE_MS);
  const undone = await readState(page);
  await redo();
  await sleep(SETTLE_MS);
  const redone = await readState(page);
  check(
    "history: Mod+Z undoes an auto layout with its names and notice; Shift+Mod+Z redoes it",
    samePositions(undone, s7) && undone.names.length === 0 && !undone.notice && samePositions(redone, applied) && redone.names.length === applied.names.length,
    JSON.stringify({ appliedNames: applied.names.length, redoneNames: redone.names.length, undoneNames: undone.names.length, noticeAfterUndo: Boolean(undone.notice) }),
  );

  // Reset, undo, redo: removeItem, setItem, removeItem.
  const beforeReset = await readState(page);
  await clickSelector(page, '[aria-label="Reset UI Flow layout"]');
  await sleep(300);
  await clickButtonText(page, "Reset");
  await sleep(SETTLE_MS);
  const reset = await readState(page);
  await undo();
  await sleep(SETTLE_MS);
  const resetUndone = await readState(page);
  await redo();
  await sleep(SETTLE_MS);
  const resetRedone = await readState(page);
  check(
    "history: Reset can be undone and redone, one write each",
    JSON.stringify(opsSince(beforeReset, reset)) === JSON.stringify(["removeItem"]) &&
      JSON.stringify(opsSince(reset, resetUndone)) === JSON.stringify(["setItem"]) &&
      JSON.stringify(opsSince(resetUndone, resetRedone)) === JSON.stringify(["removeItem"]) &&
      samePositions(resetUndone, beforeReset) &&
      resetUndone.names.length === beforeReset.names.length,
    JSON.stringify({ reset: opsSince(beforeReset, reset), redo: opsSince(resetUndone, resetRedone), undo: opsSince(reset, resetUndone) }),
  );
}

// With the figma-export workspace open, the button and the notice stay in
// the layout group, clear of the dock, at three widths.
async function caseWorkspace(page, args) {
  try {
    await freshFlow(page, args, { figmaExport: "on" });
    await page.evaluate(`(async () => {
      const workspace = document.querySelector(".sbfx-workspace");
      if (workspace?.getAttribute("data-export-collapsed") === "true") workspace.querySelector(".sbfx-exporter__toggle")?.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
    })()`);
    await applyAutoLayout(page);
    const inside = (inner, outer) => inner && outer && inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;
    const clear = (rect, dock) => !dock || !rect || rect.right <= dock.left + 0.5 || rect.left >= dock.right - 0.5 || rect.bottom <= dock.top + 0.5 || rect.top >= dock.bottom - 0.5;
    for (const size of [{ height: 1000, width: 1600 }, { height: 1000, width: 800 }, { height: 800, width: 640 }]) {
      await page.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, ...size, mobile: false });
      await sleep(SETTLE_MS);
      const state = await readState(page);
      check(
        `workspace: at ${size.width} px the button and the notice sit in the layout group, clear of the dock`,
        inside(state.button, state.layoutGroup) && inside(state.notice, state.layoutGroup) && clear(state.button, state.workspace) && clear(state.notice, state.workspace),
        JSON.stringify({ button: state.button, dock: state.workspace, group: state.layoutGroup, notice: state.notice }),
      );
    }
  } finally {
    await page.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, mobile: false });
  }
}

const cases = [caseMeasuredAfterApply, caseApplyAndUndo, caseNoticeDuringDrag, caseNames, caseUndoHistory, caseWorkspace];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chrome = findChrome();
  if (!chrome) throw new Error("No Chrome/Chromium binary found. Set CHROME_PATH.");
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "flow-auto-layout-check-"));
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
        await clearSavedLayout(page).catch(() => undefined);
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
  console.log(`${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length} UI Flow auto layout checks`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
