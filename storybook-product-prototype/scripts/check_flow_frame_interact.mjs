#!/usr/bin/env node
// Checks UI Flow interact mode (flow-frame-interaction) in system Chrome over
// CDP (Node built-in WebSocket, no packages). Run it against a Storybook
// started from create_flow_bench_fixture.mjs:
//
//   node storybook-product-prototype/scripts/check_flow_frame_interact.mjs \
//     --url "http://localhost:6006/iframe.html?id=pages-prototypes-example-prototype--default&viewMode=story" \
//     [--unsupported-url "http://localhost:6006/iframe.html?id=pages-prototypes-bench-round-up--default&viewMode=story"] \
//     [--navigating-url "http://localhost:6006/iframe.html?id=pages-prototypes-bench-inventory--default&viewMode=story"] \
//     [--resize-url "http://localhost:6006/iframe.html?id=pages-prototypes-bench-viewport-overflow--default&viewMode=story"] \
//     [--headed]
//
// --url is the example prototype, which supports prototypeFlowInteractive
// and declares the journey intake, review, approval-decision, review. The
// optional stories are prototypes without the contract: round-up keeps its
// route pinned and has a 1040 px route; inventory navigates anyway;
// viewport-overflow has a frame measured larger than declared. Cases whose
// story is not given are skipped. Every case starts from an empty saved
// layout. Exits non-zero when a case fails.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 1 };
const READY_TIMEOUT_MS = 120_000;
const SETTLE_MS = 800;
const MARK_COMMIT = "pi:flow:commit";
const SHIFT = 8;
const CHIP_TEXT = "互動中 · Esc 結束";

function usage() {
  return [
    "Usage: node storybook-product-prototype/scripts/check_flow_frame_interact.mjs --url <example prototype story iframe URL> [options]",
    "",
    "  --url <url>              Storybook iframe URL of the example prototype story (required).",
    "  --unsupported-url <url>  A prototype that keeps prototypeRoute pinned and has a 1040 px route (bench-round-up).",
    "  --navigating-url <url>   A prototype without the contract that navigates anyway (bench-inventory).",
    "  --resize-url <url>       A prototype with a frame measured larger than declared (bench-viewport-overflow).",
    "  --headed                 Run Chrome with a window instead of --headless=new.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { headed: false, navigatingUrl: null, resizeUrl: null, unsupportedUrl: null, url: null };
  const options = { "--navigating-url": "navigatingUrl", "--resize-url": "resizeUrl", "--unsupported-url": "unsupportedUrl", "--url": "url" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (options[arg]) args[options[arg]] = argv[++index];
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

// Counts writes of the saved layout key and route iframe loads, and records
// the keydown events that reach the window (the canvas stops the keys it
// handles at the document).
const INSTRUMENTATION = `(() => {
  if (window !== window.top) return;
  window.__interactCheck = { iframeLoads: 0, layoutOps: [], windowKeys: [] };
  document.addEventListener("load", (event) => {
    if (event.target instanceof HTMLIFrameElement) window.__interactCheck.iframeLoads += 1;
  }, true);
  for (const method of ["setItem", "removeItem"]) {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function (key, value) {
      if (this === window.localStorage && String(key).startsWith("prototype-inspector:flow-layout:")) window.__interactCheck.layoutOps.push(method);
      return original.call(this, key, value);
    };
  }
  window.addEventListener("keydown", (event) => {
    window.__interactCheck.windowKeys.push({ code: event.code, prevented: event.defaultPrevented });
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
    layoutOps: (window.__interactCheck?.layoutOps ?? []).slice(),
    outlines: [...root.querySelectorAll('[data-frame-outline][data-selected="true"]')].map((element) => element.getAttribute("data-frame-outline")),
    routeOrder: [...root.querySelectorAll(".prototype-inspector__flow-world .prototype-inspector__flow-frame[data-frame-id]")].map((element) => element.getAttribute("data-frame-id")),
    selected: Object.entries(frames).filter(([, frame]) => frame.selected).map(([id]) => id),
    viewport: { height: viewport.clientHeight, left: box.left, top: box.top, width: viewport.clientWidth },
    windowKeys: (window.__interactCheck?.windowKeys ?? []).slice(),
  };
})()`;
const readState = (page) => page.evaluate(READ_STATE);
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function pressKey(page, code, key, keyCode, modifiers = 0) {
  // Enter carries its text, so a focused button activates as with a real key.
  const text = code === "Enter" ? { text: "\r" } : {};
  await page.send("Input.dispatchKeyEvent", { code, key, modifiers, type: "keyDown", windowsVirtualKeyCode: keyCode, ...text });
  await page.send("Input.dispatchKeyEvent", { code, key, modifiers, type: "keyUp", windowsVirtualKeyCode: keyCode });
}

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

// The interacting frame, its iframe and the document inside it.
const INTERACT_STATE = `(() => {
  const root = document.querySelector(".prototype-inspector--flow");
  const frame = root.querySelector('.prototype-inspector__flow-world [data-interacting="true"]');
  const chip = root.querySelector(".prototype-inspector__flow-interact-chip");
  const iframe = frame?.querySelector("iframe") ?? null;
  let doc = null;
  try { doc = iframe?.contentDocument ?? null; } catch (error) { doc = null; }
  const docRoot = doc?.querySelector("[data-prototype-root]") ?? null;
  const viewport = root.querySelector(".prototype-inspector__flow-viewport");
  return {
    activeIsIframe: Boolean(iframe) && document.activeElement === iframe,
    activeIsViewport: document.activeElement === viewport,
    chip: chip ? chip.textContent : null,
    chipLabel: chip?.getAttribute("aria-label") ?? null,
    docInteractive: docRoot?.getAttribute("data-prototype-interactive") ?? null,
    docRoute: docRoot?.getAttribute("data-route") ?? null,
    key: frame?.getAttribute("data-frame-id") ?? null,
    loading: frame?.getAttribute("data-live-loading") === "true",
    overscroll: doc?.documentElement.style.overscrollBehavior ?? null,
    src: iframe?.getAttribute("src") ?? null,
  };
})()`;
const interactState = (page) => page.evaluate(INTERACT_STATE);

// A frame's iframe: its src, whether it is inert and the route its document shows.
const frameIframe = (page, key) =>
  page.evaluate(`(() => {
    const iframe = document.querySelector('.prototype-inspector__flow-world [data-frame-id="${key}"] iframe');
    if (!iframe) return null;
    let route = null;
    try { route = iframe.contentDocument?.querySelector("[data-prototype-root]")?.getAttribute("data-route") ?? null; } catch (error) { route = null; }
    return { inert: iframe.inert, probe: iframe.__interactProbe ?? null, route, src: iframe.getAttribute("src") };
  })()`);

async function waitFor(page, predicate, timeoutMs = 20_000) {
  const started = Date.now();
  let state = null;
  while (Date.now() - started < timeoutMs) {
    state = await interactState(page);
    if (predicate(state)) return state;
    await sleep(100);
  }
  return state;
}
// The interacting frame has loaded its interactive URL and rendered.
const waitForInteractive = (page, key) =>
  waitFor(page, (state) => state.key === key && Boolean(state.src?.includes("prototypeFlowInteractive=true")) && state.docInteractive === "true" && !state.loading);

async function dblClickFrame(page, frameId) {
  const point = await framePoint(page, frameId);
  if (!point) throw new Error(`frame ${frameId} is not on screen`);
  await mouse(page, "mouseMoved", point.x, point.y);
  await mouse(page, "mousePressed", point.x, point.y, { clickCount: 1 });
  await mouse(page, "mouseReleased", point.x, point.y, { clickCount: 1 });
  await mouse(page, "mousePressed", point.x, point.y, { clickCount: 2 });
  await mouse(page, "mouseReleased", point.x, point.y, { clickCount: 2 });
  await sleep(300);
}

// The host-document point of an element inside the interacting frame.
const pointInFrame = (page, selector) =>
  page.evaluate(`(() => {
    const iframe = document.querySelector('.prototype-inspector__flow-world [data-interacting="true"] iframe');
    const element = iframe?.contentDocument?.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const frameRect = iframe.getBoundingClientRect();
    const scale = frameRect.width / iframe.offsetWidth;
    const box = element.getBoundingClientRect();
    return { x: frameRect.left + (box.left + box.width / 2) * scale, y: frameRect.top + (box.top + box.height / 2) * scale };
  })()`);
async function clickAt(page, point) {
  await mouse(page, "mouseMoved", point.x, point.y);
  await mouse(page, "mousePressed", point.x, point.y);
  await mouse(page, "mouseReleased", point.x, point.y);
  await sleep(300);
}
const buttonByText = (text) =>
  `[...document.querySelectorAll("button")].find((button) => button.textContent.trim() === ${JSON.stringify(text)})`;
async function clickFrameButton(page, text) {
  const point = await page.evaluate(`(() => {
    const iframe = document.querySelector('.prototype-inspector__flow-world [data-interacting="true"] iframe');
    const doc = iframe?.contentDocument;
    const button = doc && [...doc.querySelectorAll("button")].find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)});
    if (!button) return null;
    const frameRect = iframe.getBoundingClientRect();
    const scale = frameRect.width / iframe.offsetWidth;
    const box = button.getBoundingClientRect();
    return { x: frameRect.left + (box.left + box.width / 2) * scale, y: frameRect.top + (box.top + box.height / 2) * scale };
  })()`);
  if (!point) throw new Error(`no button ${text} in the interacting frame`);
  await clickAt(page, point);
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const results = [];
function check(name, passed, detail) {
  results.push({ detail, name, passed: Boolean(passed) });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// Double-click from the opening fit: the frame becomes live with the
// interactive URL, takes input, navigates in-frame (the chip follows), and
// Escape inside it ends interact mode with focus on the viewport; the frame
// reloads its plain route and stays selected.
async function caseEnterAndLeave(page, args) {
  await freshFlow(page, args.url);
  const opened = await readState(page);
  await dblClickFrame(page, "intake");
  const entered = await waitForInteractive(page, "intake");
  const afterEnter = await readState(page);
  const hit = await page.evaluate(`(() => {
    const iframe = document.querySelector('.prototype-inspector__flow-world [data-frame-id="intake"] iframe');
    const box = iframe.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(box.height / 2, 200)) === iframe;
  })()`);
  check(
    "enter: a double-click makes the frame live with the interactive URL, nothing covers its iframe, fit tracking ends, the frame is selected alone",
    opened.fitPressed === "true" && entered.key === "intake" && entered.docInteractive === "true" && hit && afterEnter.fitPressed === "false" && sameList(afterEnter.selected, ["intake"]),
    JSON.stringify({ entered, fit: [opened.fitPressed, afterEnter.fitPressed], hitIframe: hit, selected: afterEnter.selected }),
  );
  const placed = await page.evaluate(`(() => {
    const viewport = document.querySelector(".prototype-inspector__flow-viewport").getBoundingClientRect();
    const box = document.querySelector('[data-frame-id="intake"] .prototype-inspector__flow-frame-preview').getBoundingClientRect();
    return { inside: box.left >= viewport.left - 1 && box.top >= viewport.top - 1 && box.right <= viewport.right + 1 && box.bottom <= viewport.bottom + 1, width: box.width };
  })()`);
  check("enter: a frame too small at the opening fit is fitted, at least 300 px wide and fully on screen", placed.inside && placed.width >= 300, JSON.stringify(placed));
  check(
    "enter: the chip reads 互動中 · Esc 結束 with an English name",
    entered.chip === CHIP_TEXT && entered.chipLabel === "Interacting with Project Intake; press Escape to exit",
    JSON.stringify({ chip: entered.chip, label: entered.chipLabel }),
  );
  await clickFrameButton(page, "Submit intake");
  const navigated = await waitFor(page, (state) => state.docRoute === "review");
  check(
    "input: a click inside reaches the prototype, which navigates in-frame; the chip shows the current route",
    navigated.docRoute === "review" && navigated.chip === `${CHIP_TEXT} · Review Request` && navigated.activeIsIframe && navigated.overscroll === "contain",
    JSON.stringify({ activeIsIframe: navigated.activeIsIframe, chip: navigated.chip, overscroll: navigated.overscroll, route: navigated.docRoute }),
  );
  await page.evaluate(`(() => { const doc = document.querySelector('[data-interacting="true"] iframe').contentDocument; doc.querySelector("[data-prototype-root]").setAttribute("data-route", "approval-decision"); })()`);
  await sleep(200);
  const nodeId = await interactState(page);
  await page.evaluate(`(() => { const doc = document.querySelector('[data-interacting="true"] iframe').contentDocument; doc.querySelector("[data-prototype-root]").setAttribute("data-route", "not-a-route"); })()`);
  await sleep(200);
  const unknown = await interactState(page);
  check("indicator: a flow-only node id or an unknown data-route shows only 互動中 · Esc 結束", nodeId.chip === CHIP_TEXT && unknown.chip === CHIP_TEXT, JSON.stringify([nodeId.chip, unknown.chip]));

  await pressKey(page, "Escape", "Escape", 27);
  await sleep(300);
  const left = await interactState(page);
  const afterLeave = await readState(page);
  const reloaded = await (async () => {
    for (let n = 0; n < 100; n += 1) {
      const iframe = await frameIframe(page, "intake");
      if (iframe && !iframe.src.includes("prototypeFlowInteractive") && iframe.route === "intake") return iframe;
      await sleep(100);
    }
    return frameIframe(page, "intake");
  })();
  check(
    "leave: Escape inside the frame ends interact mode, focus moves to the viewport, the frame stays selected and reloads its plain route",
    left.key === null && left.activeIsViewport && sameList(afterLeave.selected, ["intake"]) && reloaded && !reloaded.src.includes("prototypeFlowInteractive") && reloaded.route === "intake" && reloaded.inert,
    JSON.stringify({ activeIsViewport: left.activeIsViewport, reloaded, selected: afterLeave.selected }),
  );
  await pressKey(page, "Digit1", "!", 49, SHIFT);
  await sleep(400);
  check("leave: Shift+1 fits the canvas right after, without a click", (await readState(page)).fitPressed === "true");
}

// Zooming out to 30% and panning the frame away keeps its iframe; Space
// panning and Zoom in do not end interact mode; a press on another frame
// does; double-clicking another frame moves interact mode to it.
async function caseStaysInteracting(page, args) {
  await freshFlow(page, args.url);
  await dblClickFrame(page, "intake");
  await waitForInteractive(page, "intake");
  await page.evaluate(`(() => {
    const iframe = document.querySelector('[data-frame-id="intake"] iframe');
    iframe.__interactProbe = "kept";
    iframe.__interactLoads = 0;
    iframe.addEventListener("load", () => { iframe.__interactLoads += 1; });
  })()`);
  const blank = await blankPoint(page);
  if (!blank) throw new Error("no blank canvas point");
  for (let n = 0; n < 12; n += 1) {
    await page.send("Input.dispatchMouseEvent", { deltaX: 0, deltaY: 120, modifiers: 2, type: "mouseWheel", x: blank.x, y: blank.y });
    await sleep(30);
  }
  await page.send("Input.dispatchMouseEvent", { deltaX: 3000, deltaY: 0, type: "mouseWheel", x: blank.x, y: blank.y });
  await sleep(SETTLE_MS);
  const zoomed = await readState(page);
  const iframe = await frameIframe(page, "intake");
  const reloads = await page.evaluate(`document.querySelector('[data-frame-id="intake"] iframe')?.__interactLoads ?? null`);
  const still = await interactState(page);
  check(
    "live: zoomed out and panned out of view, the interacting frame keeps its iframe without reloading",
    zoomed.camera.z <= 0.31 && iframe?.probe === "kept" && reloads === 0 && still.key === "intake",
    JSON.stringify({ probe: iframe?.probe, reloads, zoom: zoomed.camera.z }),
  );

  // While focus is inside the frame, Space belongs to the prototype; the
  // middle button pans from anywhere, and with focus on the canvas (Tab out)
  // Space + drag pans too. Neither ends interact mode, nor does Zoom in.
  const pan = async (button, buttons) => {
    const point = await blankPoint(page);
    await mouse(page, "mouseMoved", point.x, point.y, { button: "none" });
    await mouse(page, "mousePressed", point.x, point.y, { button });
    for (let step = 1; step <= 6; step += 1) {
      await mouse(page, "mouseMoved", point.x + step * 20, point.y, { button: "none", buttons });
      await sleep(20);
    }
    await mouse(page, "mouseReleased", point.x + 120, point.y, { button });
    await sleep(300);
  };
  await pan("middle", 4);
  const afterMiddle = await interactState(page);
  await page.evaluate(`document.querySelector(".prototype-inspector__flow-viewport").focus()`);
  await page.send("Input.dispatchKeyEvent", { code: "Space", key: " ", type: "keyDown", windowsVirtualKeyCode: 32 });
  await pan("left", 1);
  await page.send("Input.dispatchKeyEvent", { code: "Space", key: " ", type: "keyUp", windowsVirtualKeyCode: 32 });
  const afterSpace = await interactState(page);
  const zoomIn = await page.evaluate(`(() => { const box = document.querySelector('[aria-label="Zoom in"]').getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
  await clickAt(page, zoomIn);
  const afterZoomIn = await interactState(page);
  check(
    "live: a middle-button pan, a Space pan with focus on the canvas and a press on Zoom in keep interact mode",
    afterMiddle.key === "intake" && afterSpace.key === "intake" && afterZoomIn.key === "intake",
    JSON.stringify([afterMiddle.key, afterSpace.key, afterZoomIn.key]),
  );

  await pressKey(page, "Digit1", "!", 49, SHIFT);
  await sleep(400);
  await dblClickFrame(page, "review");
  const moved = await waitForInteractive(page, "review");
  const intakeIframe = await frameIframe(page, "intake");
  check(
    "one at a time: double-clicking another frame ends the first frame's interact mode and enters the second",
    moved.key === "review" && (!intakeIframe || !intakeIframe.src.includes("prototypeFlowInteractive")),
    JSON.stringify({ intake: intakeIframe?.src ?? null, interacting: moved.key }),
  );
  await pressKey(page, "Digit1", "!", 49, SHIFT);
  await sleep(400);
  await clickFrame(page, "intake");
  const pressed = await interactState(page);
  check("end: a press on another frame ends interact mode", pressed.key === null, JSON.stringify(pressed.key));
}

// With focus on the canvas, Escape ends interact mode first and clears the
// selection only on the next press; Enter with one route selected enters;
// Enter on the focused Reset confirm button only resets.
async function caseKeyboard(page, args) {
  await freshFlow(page, args.url);
  await clickFrame(page, "intake");
  await page.evaluate(`document.querySelector(".prototype-inspector__flow-viewport").focus()`);
  await pressKey(page, "Enter", "Enter", 13);
  const entered = await waitForInteractive(page, "intake");
  await page.evaluate(`document.querySelector(".prototype-inspector__flow-viewport").focus()`);
  await pressKey(page, "Escape", "Escape", 27);
  await sleep(300);
  const first = await readState(page);
  const firstInteract = await interactState(page);
  await pressKey(page, "Escape", "Escape", 27);
  await sleep(300);
  const second = await readState(page);
  check(
    "keys: Enter enters; with focus on the canvas Escape ends interact mode and keeps the selection, the next Escape clears it",
    entered.key === "intake" && firstInteract.key === null && sameList(first.selected, ["intake"]) && second.selected.length === 0,
    JSON.stringify({ entered: entered.key, firstSelected: first.selected, secondSelected: second.selected }),
  );

  // A saved layout enables Reset; with its confirm button focused, Enter resets.
  await dragFrame(page, "review", 200, 0, first.camera.z, { modifiers: 2 });
  await clickFrame(page, "intake");
  await page.evaluate(`${buttonByText("Reset Layout")}.click()`);
  await sleep(300);
  await page.evaluate(`(() => { const confirm = [...document.querySelectorAll('[role="dialog"] button')].find((button) => /reset/i.test(button.textContent)); confirm.focus(); })()`);
  const beforeEnter = await readState(page);
  await pressKey(page, "Enter", "Enter", 13);
  await sleep(SETTLE_MS);
  const afterEnter = await readState(page);
  const notInteracting = await interactState(page);
  const dialogOpen = await page.evaluate(`Boolean(document.querySelector('[role="dialog"]'))`);
  check(
    "keys: Enter on the focused Reset confirm button resets the layout and does not enter interact mode",
    !dialogOpen && afterEnter.layoutOps.length > beforeEnter.layoutOps.length && notInteracting.key === null,
    JSON.stringify({ dialogOpen, interacting: notInteracting.key, writes: afterEnter.layoutOps.length - beforeEnter.layoutOps.length }),
  );
}

// Zoom input over the interacting frame zooms the canvas (even past an
// element that stops propagation), with no commit until the camera settles;
// an IME Escape keeps interact mode; in-frame content taller than the frame
// leaves the frame box alone.
async function caseInputRouting(page, args) {
  await freshFlow(page, args.url);
  await dblClickFrame(page, "intake");
  await waitForInteractive(page, "intake");
  await page.evaluate(`(() => {
    const doc = document.querySelector('[data-interacting="true"] iframe').contentDocument;
    doc.body.addEventListener("wheel", (event) => event.stopPropagation());
  })()`);
  const center = await pointInFrame(page, "[data-prototype-route-preview]");
  const before = await readState(page);
  const zoomBefore = before.camera.z;
  const worldUnder = (state) => ({ x: (center.x - state.viewport.left - state.camera.x) / state.camera.z, y: (center.y - state.viewport.top - state.camera.y) / state.camera.z });
  for (let n = 0; n < 6; n += 1) {
    await page.send("Input.dispatchMouseEvent", { deltaX: 0, deltaY: -40, modifiers: 2, type: "mouseWheel", x: center.x, y: center.y });
    await sleep(30);
  }
  const during = await readState(page);
  await sleep(SETTLE_MS);
  const settled = await readState(page);
  const pageZoom = await page.evaluate(`document.querySelector('[data-interacting="true"] iframe').contentWindow.visualViewport?.scale ?? 1`);
  const [anchorBefore, anchorAfter] = [worldUnder(before), worldUnder(settled)];
  check(
    "input: Ctrl+wheel over the frame zooms the canvas around the pointer, past a stopPropagation listener, with no commit until the camera settles",
    during.camera.z > zoomBefore && during.commits === before.commits && settled.commits > before.commits && pageZoom === 1 &&
      Math.hypot(anchorAfter.x - anchorBefore.x, anchorAfter.y - anchorBefore.y) < 1,
    JSON.stringify({ anchor: [anchorBefore, anchorAfter], commits: [before.commits, during.commits, settled.commits], pageZoom, zoom: [zoomBefore, during.camera.z] }),
  );
  await pressKey(page, "Digit1", "!", 49, SHIFT);
  await sleep(400);

  // During a Safari pinch (gesturestart .. gestureend) a zoom wheel from the
  // frame is ignored, as over the canvas; after gestureend it zooms again.
  const pinchZoom = await page.evaluate(`(async () => {
    const frameWindow = document.querySelector('[data-interacting="true"] iframe').contentWindow;
    const zoom = () => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".prototype-inspector__flow-world")).transform).a;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const gesture = (type, scale) => {
      const event = new frameWindow.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { clientX: { value: 100 }, clientY: { value: 200 }, scale: { value: scale } });
      frameWindow.document.body.dispatchEvent(event);
    };
    // Zooming out: the camera can sit at the 400% cap after the wheels above.
    const wheel = () => frameWindow.document.body.dispatchEvent(new frameWindow.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 100, clientY: 200, ctrlKey: true, deltaY: 80 }));
    gesture("gesturestart", 1);
    await frame();
    const start = zoom();
    wheel();
    await frame();
    const duringPinch = zoom();
    gesture("gestureend", 1);
    await frame();
    wheel();
    await frame();
    return { afterPinch: zoom(), duringPinch, start };
  })()`);
  check(
    "input: a zoom wheel from the frame during a Safari pinch is ignored, and zooms again after the pinch",
    Math.abs(pinchZoom.duringPinch - pinchZoom.start) < 1e-6 && pinchZoom.afterPinch < pinchZoom.duringPinch,
    JSON.stringify(pinchZoom),
  );
  await pressKey(page, "Digit1", "!", 49, SHIFT);
  await sleep(400);

  const typed = await page.evaluate(`(() => {
    const frameWindow = document.querySelector('[data-interacting="true"] iframe').contentWindow;
    const input = frameWindow.document.createElement("input");
    frameWindow.document.body.append(input);
    input.focus();
    input.value = "ㄓㄨˋ";
    input.dispatchEvent(new frameWindow.KeyboardEvent("keydown", { bubbles: true, isComposing: true, key: "Escape" }));
    return input.value;
  })()`);
  await sleep(200);
  const composing = await interactState(page);
  check("input: an Escape during IME composition keeps interact mode and the input's text", composing.key === "intake" && typed === "ㄓㄨˋ", JSON.stringify({ interacting: composing.key, typed }));

  // The frame box, the edges and the size stored with the route's snapshot.
  const box = () => page.evaluate(`(async () => {
    const frame = document.querySelector('.prototype-inspector__flow-world [data-frame-id="intake"]');
    const edges = [...document.querySelectorAll(".prototype-inspector__flow-world [data-edge-key] polyline")].map((line) => line.getAttribute("points")).join(" | ");
    const stored = await new Promise((resolve) => {
      const request = indexedDB.open("prototype-inspector-snapshots");
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("tiles")) return resolve(null);
        // Keys are stored out of line: walk the store with a cursor.
        const cursor = db.transaction("tiles").objectStore("tiles").openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return resolve(null);
          if (String(current.key).includes("|intake|")) {
            const record = current.value;
            return resolve([record.width, record.height, record.previewWidth, record.previewHeight].join("x"));
          }
          current.continue();
        };
        cursor.onerror = () => resolve(null);
      };
    });
    return { edges, height: frame.style.getPropertyValue("--prototype-flow-card-height"), preview: frame.style.getPropertyValue("--prototype-flow-preview-height"), stored };
  })()`);
  const boxBefore = await box();
  await page.evaluate(`document.querySelector('[data-interacting="true"] iframe').contentDocument.querySelector("[data-prototype-route-preview]").style.minHeight = "1040px"`);
  await sleep(1_500);
  const boxAfter = await box();
  check(
    "input: content grown to 1040 px inside the frame leaves the frame box, its edges and the stored size unchanged",
    JSON.stringify(boxBefore) === JSON.stringify(boxAfter) && Boolean(boxBefore.edges) && Boolean(boxBefore.stored),
    JSON.stringify({ after: { ...boxAfter, edges: boxAfter.edges.length }, before: { ...boxBefore, edges: boxBefore.edges.length } }),
  );

  // Escape inside the frame releases its window at once: the root's
  // overscroll style is restored before the frame reloads.
  const overscroll = await page.evaluate(`(() => {
    const frameWindow = document.querySelector('[data-interacting="true"] iframe').contentWindow;
    const root = frameWindow.document.documentElement;
    const during = root.style.overscrollBehavior;
    frameWindow.document.body.dispatchEvent(new frameWindow.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    return { after: root.style.overscrollBehavior, during };
  })()`);
  check("input: overscroll stays inside the frame while interacting and is restored on exit", overscroll.during === "contain" && overscroll.after === "", JSON.stringify(overscroll));
}

// The journey intake, review, approval-decision, review: only the
// double-clicked instance interacts, and selecting 全部 ends interact mode
// first, dropping that instance's iframe.
async function caseJourney(page, args) {
  await freshFlow(page, args.url, { "prototype-inspector:flow-journey:example-prototype": "declared:request-changes" });
  await dblClickFrame(page, "3:review");
  const entered = await waitForInteractive(page, "3:review");
  const other = await page.evaluate(`document.querySelector('[data-frame-id="1:review"]')?.getAttribute("data-interacting")`);
  check("journey: only the double-clicked step instance 3:review interacts", entered.key === "3:review" && other === null, JSON.stringify({ interacting: entered.key, other }));
  await page.evaluate(`[...document.querySelectorAll(".prototype-inspector__flow-journey")].find((button) => button.textContent.startsWith("全部")).click()`);
  await sleep(SETTLE_MS);
  const switched = await interactState(page);
  const full = await readState(page);
  check("journey: selecting 全部 ends interact mode before the complete flow shows", switched.key === null && full.journey === null && !("3:review" in full.frames), JSON.stringify({ interacting: switched.key, journey: full.journey }));

  // ] with focus on the canvas (outside the frame) ends interact mode first.
  await page.evaluate(`[...document.querySelectorAll(".prototype-inspector__flow-journey")].find((button) => button.getAttribute("aria-label") === "Request changes").click()`);
  await sleep(SETTLE_MS);
  await dblClickFrame(page, "1:review");
  await waitForInteractive(page, "1:review");
  await page.evaluate(`document.querySelector(".prototype-inspector__flow-viewport").focus()`);
  await pressKey(page, "BracketRight", "]", 221);
  await sleep(SETTLE_MS);
  const bracket = await interactState(page);
  const next = await readState(page);
  check("journey: ] with focus on the canvas ends interact mode before the next journey shows", bracket.key === null && next.journey !== "declared:request-changes", JSON.stringify({ interacting: bracket.key, journey: next.journey }));

  // Enter on a focused journey list entry selects it; interact mode does not start.
  const entry = await readState(page);
  const anyFrame = Object.keys(entry.frames).find((key) => entry.frames[key].width > 300);
  if (anyFrame) await clickFrame(page, anyFrame);
  await page.evaluate(`[...document.querySelectorAll(".prototype-inspector__flow-journey")].find((button) => button.textContent.startsWith("全部")).focus()`);
  await pressKey(page, "Enter", "Enter", 13);
  await sleep(SETTLE_MS);
  const onEntry = await interactState(page);
  const afterEntry = await readState(page);
  check("journey: Enter on a focused journey list entry selects it and does not enter interact mode", onEntry.key === null && afterEntry.journey === null, JSON.stringify({ interacting: onEntry.key, journey: afterEntry.journey }));
}

// The example prototype's own preview contract, without the UI Flow: an
// interactive preview navigates, a pinned preview stays on its route, and
// prototypeFlowInteractive alone (no prototypeRoute) is not interactive.
async function casePreviewContract(page, args) {
  const open = async (query) => {
    const url = new URL(args.url);
    url.search = `${url.search}&${query}`;
    await page.send("Page.navigate", { url: url.toString() });
    const started = Date.now();
    while (Date.now() - started < READY_TIMEOUT_MS && !(await page.evaluate(`Boolean(document.querySelector("[data-prototype-root]"))`).catch(() => false))) await sleep(100);
    await sleep(300);
  };
  const read = () => page.evaluate(`(() => { const root = document.querySelector("[data-prototype-root]"); return { chrome: Boolean(root.querySelector('nav[aria-label="Prototype routes"]')), interactive: root.getAttribute("data-prototype-interactive"), route: root.getAttribute("data-route") }; })()`);
  const submit = () => page.evaluate(`${buttonByText("Submit intake")}?.click()`);
  await open("prototypeFlowPreview=true&prototypeRoute=intake&prototypeFlowInteractive=true");
  await submit();
  await sleep(300);
  const interactive = await read();
  await open("prototypeFlowPreview=true&prototypeRoute=intake");
  await submit();
  await sleep(300);
  const pinned = await read();
  await open("prototypeFlowInteractive=true");
  const alone = await read();
  check(
    "contract: an interactive preview navigates (no chrome, data-route review), a pinned preview stays on intake, and the parameter alone is not interactive",
    interactive.route === "review" && interactive.interactive === "true" && !interactive.chrome && pinned.route === "intake" && pinned.interactive === null && alone.interactive === null,
    JSON.stringify({ alone, interactive, pinned }),
  );
}

// Prototypes without the contract: round-up keeps its route pinned (a click
// does not navigate) and plain wheel scrolls its content, not the camera;
// inventory navigates and the chip names the route it reaches.
async function caseUnsupported(page, args) {
  if (args.unsupportedUrl) {
    await freshFlow(page, args.unsupportedUrl);
    await dblClickFrame(page, "offer");
    await waitFor(page, (state) => state.key === "offer" && Boolean(state.src?.includes("prototypeFlowInteractive=true")) && state.docRoute === "offer" && !state.loading);
    const before = await readState(page);
    const point = await pointInFrame(page, "[data-prototype-route-preview]");
    for (let n = 0; n < 4; n += 1) {
      await page.send("Input.dispatchMouseEvent", { deltaX: 0, deltaY: 200, type: "mouseWheel", x: point.x, y: point.y });
      await sleep(50);
    }
    await sleep(SETTLE_MS);
    const after = await readState(page);
    const scrolled = await page.evaluate(`(() => {
      const doc = document.querySelector('[data-interacting="true"] iframe').contentDocument;
      return Math.max(doc.scrollingElement.scrollTop, ...[...doc.querySelectorAll("*")].map((element) => element.scrollTop));
    })()`);
    check(
      "unsupported: plain wheel over the frame scrolls its content and leaves the camera",
      scrolled > 0 && after.camera.x === before.camera.x && after.camera.y === before.camera.y && after.camera.z === before.camera.z,
      JSON.stringify({ camera: [before.camera, after.camera], scrolled }),
    );
    await clickFrameButton(page, "Continue");
    await sleep(300);
    const pinned = await interactState(page);
    await pressKey(page, "Escape", "Escape", 27);
    await sleep(300);
    const left = await interactState(page);
    check("unsupported: a pinned prototype does not navigate, and Escape ends interact mode", pinned.docRoute === "offer" && pinned.chip === CHIP_TEXT && left.key === null, JSON.stringify({ chip: pinned.chip, interacting: left.key, route: pinned.docRoute }));
  } else {
    console.log("SKIP unsupported pinned case: no --unsupported-url");
  }
  if (args.navigatingUrl) {
    await freshFlow(page, args.navigatingUrl);
    await dblClickFrame(page, "portfolio");
    await waitFor(page, (state) => state.key === "portfolio" && Boolean(state.src?.includes("prototypeFlowInteractive=true")) && state.docRoute === "portfolio" && !state.loading);
    await clickFrameButton(page, "Continue");
    const moved = await waitFor(page, (state) => state.docRoute !== "portfolio");
    check("unsupported: a prototype that navigates anyway moves on, and the chip names the route it reaches", moved.docRoute === "quote-detail" && moved.chip?.startsWith(`${CHIP_TEXT} · `), JSON.stringify({ chip: moved.chip, route: moved.docRoute }));
  } else {
    console.log("SKIP unsupported navigating case: no --navigating-url");
  }
}

// Runs first (fresh profile, no cached sizes): a double-click from the
// opening fit ends fit tracking, so neither frames measured afterwards nor a
// smaller canvas refit the flow (with fit tracking on, both would).
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
  await dblClickFrame(page, "regular");
  const afterEnter = await readState(page);
  await waitForSnapshotsIdle(page);
  await page.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, height: 900, mobile: false, width: 1400 });
  await sleep(SETTLE_MS);
  const settled = await readState(page);
  await page.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, mobile: false });
  const resized = Object.keys(opened.frames)
    .filter((id) => settled.frames[id] && settled.frames[id].height !== opened.frames[id].height)
    .map((id) => `${id} ${opened.frames[id].height} -> ${settled.frames[id].height}`);
  check(
    "camera: entering from the opening fit ends fit tracking, so later measurements and a smaller canvas do not refit the flow",
    opened.fitPressed === "true" && afterEnter.fitPressed === "false" && settled.fitPressed === "false" &&
      Math.abs(settled.camera.z - afterEnter.camera.z) < 1e-6 && Math.abs(settled.camera.x - afterEnter.camera.x) < 0.5 && Math.abs(settled.camera.y - afterEnter.camera.y) < 0.5,
    JSON.stringify({ afterEnter: afterEnter.camera, framesMeasuredSinceOpening: resized, settled: settled.camera }),
  );
}

const cases = [caseOpeningFit, casePreviewContract, caseEnterAndLeave, caseStaysInteracting, caseKeyboard, caseInputRouting, caseJourney, caseUnsupported];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chrome = findChrome();
  if (!chrome) throw new Error("No Chrome/Chromium binary found. Set CHROME_PATH.");
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "flow-interact-check-"));
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
  console.log(`${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length} UI Flow interact checks`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
