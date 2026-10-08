#!/usr/bin/env node
// Measures the Prototype Inspector UI Flow canvas in system Chrome over CDP
// (Node built-in WebSocket, no packages). Works on the pre-camera DOM
// (.prototype-inspector__flow-wrap scroll container) and on the camera DOM
// (.prototype-inspector__flow-viewport / __flow-world / __flow-overlay).
//
//   node storybook-product-prototype/scripts/bench_flow_canvas.mjs \
//     --url "http://localhost:6006/iframe.html?id=<story>&globals=prototypeMode:flow&viewMode=story" \
//     [--project-root <storybook project>] [--out <json>] [--label <run name>]
//     [--journey <journey list entry key>] [--layout <UI Flow layout export>]
//
// Metrics whose performance mark or CSS variable does not exist in the
// measured build are reported as null (pi:flow:commit, pi:flow:label-placement,
// --prototype-flow-stroke-zoom). Builds with level-of-detail snapshots also get
// snapshot timings: a cold open with an empty snapshot store, a second
// navigation that shows the cached snapshots, and a drag while the first open
// is still capturing.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 1 };
const READY_TIMEOUT_MS = 240_000;
// A UI Flow whose route iframes stop making progress (Chrome can abort module
// requests with ERR_INSUFFICIENT_RESOURCES when 100 dev-mode iframes load at
// once, leaving frames that never boot) is given up after this long instead of
// waiting for READY_TIMEOUT_MS; such a run is invalid either way.
const READY_STALL_MS = 30_000;
const QUIET_MS = 1_000;
const QUIET_TIMEOUT_MS = 30_000;
const FIXED_SETTLE_MS = 1_500;
// rebuild-flow-canvas-camera commits camera state 120 ms after the last change.
const CAMERA_IDLE_MS = 120;
const AFTER_IDLE_WINDOW_MS = 100;
const PINCH = { events: 30, scalePerEvent: 1.03 };
const PAN = { events: 30, deltaX: 6, deltaY: 8 };
const DRAG = { moves: 20, stepX: 5, stepY: 3 };
const DRAG_STORAGE_WINDOW_MS = 1_000;
// Live frames load one at a time after zooming to 100% (dev cold loads can
// take seconds each), so that wait is bounded.
const ZOOM_100_LOAD_TIMEOUT_MS = 30_000;
// Renderer resets that are planned rather than fallbacks.
const PLANNED_RENDERER_RESETS = new Set(["initial", "scheduled"]);
const MARK_RENDERER_RESET = "pi:flow:renderer-reset";
const MARK_SNAPSHOT = "pi:flow:snapshot";
// The snapshot queue counts as idle after this long without work; a build
// that shows no queue within the grace period has no snapshots.
const SNAPSHOT_IDLE_STABLE_MS = 500;
const SNAPSHOT_QUEUE_GRACE_MS = 3_000;
const SNAPSHOT_QUEUE_TIMEOUT_MS = 180_000;
const VISIBLE_SNAPSHOTS_TIMEOUT_MS = 30_000;
// Estimated targets of add-flow-canvas-level-of-detail; the output records the
// measured value and whether each was met.
const LOD_TARGETS = {
  cachedVisibleSnapshotsMs: 1_000,
  coldAllSnapshotsMs: 10_000,
  dragDuringCaptureP95Ms: 8,
  fitRendererMemoryOverStoryMb: 100,
  fitRendererIframes: 1,
  fitRouteIframes: 0,
  zoom100Iframes: 8,
};
const FLOW_LAYOUT_PREFIX = "prototype-inspector:flow-layout:";
const UNKNOWN_NODE_ID = "__flow-bench-unknown-node__";
const MARK_COMMIT = "pi:flow:commit";
const MARK_LABEL_PLACEMENT = "pi:flow:label-placement";
const STROKE_ZOOM_VARIABLE = "--prototype-flow-stroke-zoom";

const SELECTOR_SETS = [
  {
    name: "camera",
    description: "camera canvas: viewport, world and overlay layers",
    root: ".prototype-inspector--flow",
    viewport: ".prototype-inspector__flow-viewport",
    world: ".prototype-inspector__flow-world",
    overlay: ".prototype-inspector__flow-overlay",
    // Route frames kept the pre-camera card class while the canvas was being
    // rebuilt; accept both so every intermediate build can be measured.
    routeFrame: ".prototype-inspector__flow-frame, .prototype-inspector__flow-card",
    flowNode: ".prototype-inspector__flow-node",
  },
  {
    name: "scroll",
    description: "pre-camera canvas: native scroll container with a scaled canvas",
    root: ".prototype-inspector--flow",
    viewport: ".prototype-inspector__flow-wrap",
    world: ".prototype-inspector__flow-canvas",
    overlay: null,
    routeFrame: ".prototype-inspector__flow-card",
    flowNode: ".prototype-inspector__flow-node",
  },
];

function usage() {
  return [
    "Usage: node storybook-product-prototype/scripts/bench_flow_canvas.mjs --url <UI Flow URL> [options]",
    "",
    "  --url <url>            Storybook iframe URL of a prototype story with globals=prototypeMode:flow (required).",
    "  --project-root <dir>   Storybook project measured; its .storybook/prototype-inspector/preview.js",
    "                         supplies prototypeInspectorBuildTag.",
    "  --out <file>           Also write the JSON there. With --label the run is merged into",
    "                         { runs: { <label>: ... } } of an existing file.",
    "  --label <name>         Run name used with --out (for example growth-fund).",
    "  --journey <key>        Open the UI Flow on this journey list entry (all, declared:<id> or",
    "                         derived:<branch id>:<target id>): it is written to sessionStorage",
    "                         (prototype-inspector:flow-journey:<prototypeId>) before the canvas reads it.",
    "  --layout <file>        Open the UI Flow with the positions of this layout export (for example one",
    "                         saved after Auto Layout) and its lanes, instead of the first route's position.",
    "  --chrome-port <port>   Chrome --remote-debugging-port (default 0: pick a free port).",
    "  --headed               Run Chrome with a window instead of --headless=new.",
    "  --trace <file>         Record a Chrome trace of the gestures (devtools timeline categories).",
    "",
    "Set CHROME_PATH to use another Chrome or Chromium binary.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    chromePort: 0,
    headed: false,
    help: false,
    journey: null,
    label: null,
    layout: null,
    out: null,
    projectRoot: null,
    trace: null,
    url: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [flag, inlineValue] = raw.startsWith("--") && raw.includes("=")
      ? [raw.slice(0, raw.indexOf("=")), raw.slice(raw.indexOf("=") + 1)]
      : [raw, undefined];
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value.`);
      index += 1;
      return value;
    };

    switch (flag) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--url":
        args.url = readValue();
        break;
      case "--project-root":
        args.projectRoot = path.resolve(readValue());
        break;
      case "--out":
        args.out = path.resolve(readValue());
        break;
      case "--label":
        args.label = readValue();
        break;
      case "--journey":
        args.journey = readValue();
        break;
      case "--layout":
        args.layout = path.resolve(readValue());
        break;
      case "--chrome-port": {
        const port = Number(readValue());
        if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--chrome-port must be 0-65535.");
        args.chromePort = port;
        break;
      }
      case "--headed":
        args.headed = true;
        break;
      case "--trace":
        args.trace = path.resolve(readValue());
        break;
      default:
        throw new Error(`Unknown argument: ${raw}`);
    }
  }

  return args;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round(value, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Replaces (or adds) prototypeMode inside the Storybook globals query value,
// keeping every other query parameter byte for byte.
function withPrototypeMode(input, mode) {
  const url = new URL(input);
  const parts = url.search.replace(/^\?/, "").split("&").filter(Boolean);
  let found = false;
  const next = parts.map((part) => {
    const [key, ...rest] = part.split("=");
    if (key !== "globals") return part;
    found = true;
    const entries = decodeURIComponent(rest.join("=").replace(/\+/g, " "))
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => entry.split(":")[0].trim() !== "prototypeMode");
    entries.push(`prototypeMode:${mode}`);
    return `globals=${entries.join(";")}`;
  });
  if (!found) next.push(`globals=prototypeMode:${mode}`);
  url.search = `?${next.join("&")}`;
  return url.toString();
}

function summarize(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = sorted.length / 2;
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[Math.floor(middle)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];

  return {
    count: sorted.length,
    median: round(median),
    p95: round(p95),
    max: round(sorted[sorted.length - 1]),
    mean: round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
  };
}

function getZoomBucket(zoom) {
  return Number.isFinite(zoom) && zoom > 0 ? Math.round(2 * Math.log2(zoom)) : null;
}

// ---------------------------------------------------------------------------
// Page-side instrumentation. Serialized with Function.prototype.toString and
// evaluated in every frame before the frame's own scripts run.
// ---------------------------------------------------------------------------

function installFlowBenchInstrumentation(config) {
  try {
    let isTop = false;
    try {
      isTop = window.top === window;
    } catch (error) {
      isTop = false;
    }

    let hub = null;

    if (isTop) {
      hub = {
        config,
        errors: [],
        longFrames: [],
        longFramesSupported: false,
        marks: [],
        readyAt: null,
        readyInfo: null,
        seed: null,
        storage: [],
        strokeZoomWrites: [],
        timeOrigin: performance.timeOrigin,
        visibleSnapshotsAt: null,
        visibleSnapshotsInfo: null,
      };
      Object.defineProperty(window, "__piFlowBench", { configurable: true, value: hub });

      // Seed before any app script runs, and before the storage hooks below.
      if (config.seed) {
        try {
          window.localStorage.setItem(config.seed.key, config.seed.value);
          for (const [key, value] of config.seed.extra ?? []) {
            window.localStorage.setItem(key, value);
          }
          hub.seed = { key: config.seed.key, written: true };
        } catch (error) {
          hub.seed = { key: config.seed.key, written: false, error: String(error) };
        }
      }

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (typeof entry.name !== "string" || !entry.name.startsWith("pi:flow:")) continue;
            const detail = entry.detail;
            hub.marks.push({
              durationMs: detail && typeof detail.durationMs === "number" ? detail.durationMs : null,
              name: entry.name,
              reason: detail && typeof detail.reason === "string" ? detail.reason : null,
              t: entry.startTime,
            });
          }
        }).observe({ buffered: true, type: "mark" });
      } catch (error) {
        hub.errors.push(`mark observer: ${error}`);
      }

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            hub.longFrames.push({
              blocking: typeof entry.blockingDuration === "number" ? entry.blockingDuration : null,
              duration: entry.duration,
              t: entry.startTime,
            });
          }
        }).observe({ buffered: true, type: "long-animation-frame" });
        hub.longFramesSupported = true;
      } catch (error) {
        hub.longFramesSupported = false;
      }

      const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
      CSSStyleDeclaration.prototype.setProperty = function setProperty(name, value, priority) {
        if (name === config.strokeZoomVariable) {
          hub.strokeZoomWrites.push({ t: performance.now(), value: String(value) });
        }
        return originalSetProperty.call(this, name, value, priority);
      };
    } else {
      try {
        hub = window.top.__piFlowBench ?? null;
      } catch (error) {
        hub = null;
      }
    }

    // Child frames report on the top frame's timeline.
    const topTime = isTop
      ? () => performance.now()
      : () => performance.timeOrigin + performance.now() - (hub ? hub.timeOrigin : performance.timeOrigin);
    const storageArea = (storage) => {
      try {
        if (storage === window.localStorage) return "local";
        if (storage === window.sessionStorage) return "session";
      } catch (error) {
        return "unknown";
      }
      return "unknown";
    };
    // --journey: the first read of a journey selection key finds the entry
    // already stored, as if it had been selected before opening the UI Flow.
    // Written with the native setItem, so it is not counted as a page write.
    if (isTop && config.journey) {
      const nativeGetItem = Storage.prototype.getItem;
      const nativeSetItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function getItemWithJourney(key) {
        if (
          this === window.sessionStorage &&
          String(key).startsWith("prototype-inspector:flow-journey:") &&
          nativeGetItem.call(this, key) === null
        ) {
          nativeSetItem.call(this, key, config.journey);
        }
        return nativeGetItem.call(this, key);
      };
    }
    for (const method of ["setItem", "removeItem", "clear"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function storageHook(...args) {
        if (hub) {
          hub.storage.push({
            area: storageArea(this),
            frame: isTop ? "top" : "child",
            key: method === "clear" ? null : String(args[0]),
            op: method,
            t: topTime(),
          });
        }
        return original.apply(this, args);
      };
    }

    if (!isTop) return;

    const sets = config.selectorSets;
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    // React's scheduler posts render work through MessageChannel; a message
    // posted after the event runs after it, so this barrier always includes
    // the render a pointermove scheduled (setTimeout(0) alone sometimes runs first).
    const taskBarrier = () => Promise.all([
      wait(0),
      new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          resolve();
        };
        channel.port2.postMessage(0);
      }),
    ]);
    const detectSet = () => sets.find((set) => document.querySelector(set.viewport)) ?? null;
    const rectOf = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
    };
    const describe = (element) => {
      if (!element || !element.tagName) return null;
      const classes = typeof element.className === "string" ? element.className.trim().split(/\s+/).slice(0, 2) : [];
      return `${element.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join("")}`;
    };
    const routeFrames = (set) => {
      const root = document.querySelector(set.root) ?? document.body;
      return [...root.querySelectorAll(set.routeFrame)].filter((element) => !element.matches(set.flowNode));
    };
    const iframeState = (iframe) => {
      let doc = null;
      try {
        doc = iframe.contentDocument;
      } catch (error) {
        return "cross-origin";
      }
      if (!doc || doc.readyState !== "complete" || !doc.body) return "loading";
      const classes = doc.body.classList;
      if (classes.contains("sb-show-errordisplay")) return "error";
      if (classes.contains("sb-show-preparing-story") || classes.contains("sb-show-preparing-docs")) return "loading";
      if (doc.querySelector('[data-prototype-route-preview="true"]') || doc.querySelector("#storybook-root > *")) {
        return "ready";
      }
      return "loading";
    };
    const flowState = () => {
      const set = detectSet();
      if (!set) return { ready: false, selectorSet: null };
      const root = document.querySelector(set.root) ?? document.body;
      const frames = routeFrames(set);
      const iframes = [...root.querySelectorAll("iframe")].filter(
        (iframe) => !iframe.matches("[data-prototype-inspector-renderer]"),
      );
      const counts = { error: 0, loading: 0, ready: 0 };
      for (const iframe of iframes) {
        const state = iframeState(iframe);
        counts[state === "ready" ? "ready" : state === "error" ? "error" : "loading"] += 1;
      }
      // Level-of-detail builds tier every route frame: ready once every frame
      // has a tier and no live frame is still loading (most frames hold no
      // iframe at all). Older builds wait for every route iframe.
      // A canvas still waiting for its cached snapshots is hidden.
      const tiered = frames.some((frame) => frame.hasAttribute("data-tier"));
      const liveLoading = frames.filter((frame) => frame.getAttribute("data-live-loading") === "true").length;
      const snapshotPreload = root.getAttribute("data-snapshot-preload");
      return {
        flowNodes: root.querySelectorAll(set.flowNode).length,
        iframeErrors: counts.error,
        iframes: iframes.length,
        iframesReady: counts.ready,
        // The journey list entry shown (flow-journey-focus), null for the full flow.
        journeyFocus: root.getAttribute("data-journey-focus"),
        liveLoading,
        ready: tiered
          ? frames.length > 0 &&
            frames.every((frame) => frame.hasAttribute("data-tier")) &&
            liveLoading === 0 &&
            snapshotPreload === null
          : frames.length > 0 && iframes.length > 0 && counts.loading === 0,
        snapshotPreload,
        snapshotQueue: root.getAttribute("data-snapshot-queue"),
        rendererIframes: root.querySelectorAll("iframe[data-prototype-inspector-renderer]").length,
        routeFrames: frames.length,
        selectorSet: set.name,
        tiered,
      };
    };
    const storyState = () => {
      const root = document.querySelector("#storybook-root");
      const body = document.body;
      const preparing = Boolean(
        body && (body.classList.contains("sb-show-preparing-story") || body.classList.contains("sb-show-preparing-docs")),
      );
      const error = Boolean(body && body.classList.contains("sb-show-errordisplay"));
      return { error, ready: error || Boolean(root && root.firstElementChild && !preparing) };
    };
    const readCamera = () => {
      const set = detectSet();
      if (!set) return null;
      const world = document.querySelector(set.world);
      const viewport = document.querySelector(set.viewport);
      let zoom = null;
      let x = null;
      let y = null;
      if (world) {
        const transform = getComputedStyle(world).transform;
        if (transform && transform !== "none") {
          const matrix = new DOMMatrixReadOnly(transform);
          zoom = matrix.a;
          if (set.name === "camera") {
            x = matrix.e;
            y = matrix.f;
          }
        } else {
          zoom = 1;
        }
      }
      if (set.name !== "camera" && viewport) {
        x = -viewport.scrollLeft;
        y = -viewport.scrollTop;
      }
      const overlay = set.overlay ? document.querySelector(set.overlay) : null;
      const overlayZoom = overlay ? Number.parseFloat(overlay.style.getPropertyValue("--prototype-flow-camera-zoom")) : NaN;
      return {
        overlayZoom: Number.isFinite(overlayZoom) ? overlayZoom : null,
        x,
        y,
        zoom,
      };
    };
    const readZoomLabel = () => {
      const zoomIn = document.querySelector('[aria-label="Zoom in"]');
      const group = zoomIn?.closest('[role="group"]') ?? zoomIn?.parentElement;
      if (!group) return null;
      let best = null;
      for (const element of group.querySelectorAll("*")) {
        const text = (element.textContent ?? "").trim();
        const match = text.match(/(\d+(?:\.\d+)?)%$/);
        if (match && (!best || text.length < best.length)) best = text;
      }
      return best ? best.match(/(\d+(?:\.\d+)?)%$/)[0] : null;
    };
    const readStrokeZoom = () => {
      const set = detectSet();
      const world = set ? document.querySelector(set.world) : null;
      const value = world ? world.style.getPropertyValue(config.strokeZoomVariable).trim() : "";
      return value || null;
    };
    const viewportRect = () => {
      const set = detectSet();
      const element = set ? document.querySelector(set.viewport) : null;
      if (element) return element.getBoundingClientRect();
      return { height: innerHeight, left: 0, top: 0, width: innerWidth };
    };
    // Gestures happen over the frames: the centre of the on-screen part of the
    // route frames, or the canvas centre when none is on screen.
    const gestureAnchor = () => {
      const set = detectSet();
      const vp = viewportRect();
      const bounds = { bottom: -Infinity, left: Infinity, right: -Infinity, top: Infinity };
      for (const element of set ? routeFrames(set) : []) {
        const rect = element.getBoundingClientRect();
        const left = Math.max(rect.left, vp.left);
        const top = Math.max(rect.top, vp.top);
        const right = Math.min(rect.right, vp.left + vp.width);
        const bottom = Math.min(rect.bottom, vp.top + vp.height);
        if (right <= left || bottom <= top) continue;
        bounds.left = Math.min(bounds.left, left);
        bounds.top = Math.min(bounds.top, top);
        bounds.right = Math.max(bounds.right, right);
        bounds.bottom = Math.max(bounds.bottom, bottom);
      }
      if (!Number.isFinite(bounds.left)) {
        return { source: "canvas centre", x: vp.left + vp.width / 2, y: vp.top + vp.height / 2 };
      }
      return { source: "on-screen frames centre", x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    };
    const dispatchWheelGesture = async ({ ctrlKey, deltaX, deltaY, events }) => {
      const anchor = gestureAnchor();
      const clientX = anchor.x;
      const clientY = anchor.y;
      const set = detectSet();
      const target = document.elementFromPoint(clientX, clientY)
        ?? (set ? document.querySelector(set.viewport) : null)
        ?? document.body;
      const before = readCamera();
      const samples = [];
      let t0 = null;
      let tLast = null;
      for (let index = 0; index < events; index += 1) {
        const t = performance.now();
        if (t0 === null) t0 = t;
        tLast = t;
        target.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          composed: true,
          ctrlKey,
          deltaMode: 0,
          deltaX,
          deltaY,
          deltaZ: 0,
          screenX: clientX,
          screenY: clientY,
          view: window,
        }));
        await nextFrame();
        const camera = readCamera();
        samples.push({ t: performance.now(), zoom: camera ? camera.zoom : null });
      }
      return {
        anchor: { source: anchor.source, x: Math.round(clientX), y: Math.round(clientY) },
        before,
        samples,
        t0,
        tLast,
        target: describe(target),
      };
    };
    // A snapshot frame "shows" once its image has loaded.
    const snapshotShown = (frame) => {
      const image = frame.querySelector(".prototype-inspector__flow-frame-snapshot");
      return Boolean(image && image.complete && image.naturalWidth > 0);
    };
    const lib = {
      snapshotState() {
        const set = detectSet();
        if (!set) return null;
        const root = document.querySelector(set.root) ?? document.body;
        const vp = viewportRect();
        const onScreen = (frame) => {
          const rect = frame.getBoundingClientRect();
          return rect.right > vp.left && rect.left < vp.left + vp.width && rect.bottom > vp.top && rect.top < vp.top + vp.height;
        };
        const snapshotFrames = routeFrames(set).filter((frame) => frame.getAttribute("data-tier") === "snapshot");
        const visible = snapshotFrames.filter(onScreen);
        return {
          preload: root.getAttribute("data-snapshot-preload"),
          queue: root.getAttribute("data-snapshot-queue"),
          snapshotTier: snapshotFrames.length,
          snapshotTierShown: snapshotFrames.filter(snapshotShown).length,
          visibleSnapshotTier: visible.length,
          visibleSnapshotTierShown: visible.filter(snapshotShown).length,
        };
      },
      iframeCounts() {
        const set = detectSet();
        const root = set ? document.querySelector(set.root) ?? document.body : document.body;
        const all = [...root.querySelectorAll("iframe")];
        const renderer = all.filter((iframe) => iframe.matches("[data-prototype-inspector-renderer]")).length;
        return { renderer, route: all.length - renderer };
      },
      flowState,
      storyState,
      readCamera,
      readZoomLabel,
      readStrokeZoom,
      storybookMode() {
        const scripts = [...document.scripts].map((script) => script.src).filter(Boolean);
        const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
        if ([...scripts, ...resources].some((url) => url.includes("/@vite/client"))) {
          return { evidence: "/@vite/client is loaded", mode: "dev" };
        }
        const hashed = scripts.find((url) => /\/assets\/iframe-[\w-]+\.js/.test(url));
        if (hashed) return { evidence: `hashed preview bundle ${hashed}`, mode: "static" };
        return { evidence: "no /@vite/client and no hashed assets/iframe-*.js", mode: "unknown" };
      },
      prototypeInfo(parameterName) {
        const preview = window.__STORYBOOK_PREVIEW__;
        const story = preview && preview.currentRender ? preview.currentRender.story : null;
        const prototype = story && story.parameters ? story.parameters[parameterName] : null;
        if (!prototype || typeof prototype !== "object") return null;
        const flow = prototype.flow && typeof prototype.flow === "object" ? prototype.flow : {};
        const routes = Array.isArray(flow.routes) ? flow.routes.filter((route) => route && typeof route === "object") : [];
        const nodes = Array.isArray(flow.nodes) ? flow.nodes.filter((node) => node && typeof node.id === "string") : [];
        const transitions = Array.isArray(flow.transitions) ? flow.transitions.filter((item) => item && typeof item === "object") : [];
        const positioned = routes.find((route) =>
          typeof route.id === "string" &&
          route.flowPosition &&
          Number.isFinite(route.flowPosition.x) &&
          Number.isFinite(route.flowPosition.y));
        return {
          firstPositionedRoute: positioned
            ? { id: positioned.id, x: positioned.flowPosition.x, y: positioned.flowPosition.y }
            : null,
          flowNodes: nodes.length,
          id: typeof prototype.id === "string" && prototype.id.trim() ? prototype.id.trim() : "prototype",
          keyEdges: new Set(transitions.filter((item) => item.flowLine === "key").map((item) => `${item.from}->${item.to}`)).size,
          routes: routes.length,
          storyId: story.id,
          title: typeof prototype.title === "string" ? prototype.title : null,
          transitions: transitions.length,
          viewport: flow.viewport && typeof flow.viewport === "object" ? flow.viewport : null,
        };
      },
      async pinch({ deltaY, events }) {
        const zoomLabelBefore = readZoomLabel();
        const strokeZoomBefore = readStrokeZoom();
        const result = await dispatchWheelGesture({ ctrlKey: true, deltaX: 0, deltaY, events });
        return {
          ...result,
          after: readCamera(),
          strokeZoomAfter: readStrokeZoom(),
          strokeZoomBefore,
          zoomLabelAfter: readZoomLabel(),
          zoomLabelBefore,
        };
      },
      async pan({ deltaX, deltaY, events }) {
        const zoomLabelBefore = readZoomLabel();
        const result = await dispatchWheelGesture({ ctrlKey: false, deltaX, deltaY, events });
        return { ...result, after: readCamera(), zoomLabelAfter: readZoomLabel(), zoomLabelBefore };
      },
      async drag({ moves, stepX, stepY }) {
        const set = detectSet();
        if (!set) return { error: "no UI Flow canvas found" };
        // Press the route frame whose preview (its iframe) shows the most on
        // screen, at the centre of the visible part of that preview, so the
        // press never lands on an empty name area or off screen.
        const vp = viewportRect();
        const inset = 40;
        const bounds = {
          bottom: vp.top + vp.height - inset,
          left: vp.left + inset,
          right: vp.left + vp.width - inset,
          top: vp.top + inset,
        };
        const centerX = vp.left + vp.width / 2;
        const centerY = vp.top + vp.height / 2;
        const all = routeFrames(set);
        const withPreview = all.filter((element) => element.querySelector("iframe"));
        const candidates = (withPreview.length ? withPreview : all)
          .map((element) => {
            const rect = (element.querySelector("iframe") ?? element).getBoundingClientRect();
            const left = Math.max(rect.left, bounds.left);
            const top = Math.max(rect.top, bounds.top);
            const right = Math.min(rect.right, bounds.right);
            const bottom = Math.min(rect.bottom, bounds.bottom);
            if (right - left < 24 || bottom - top < 24) return null;
            const x = (left + right) / 2;
            const y = (top + bottom) / 2;
            return { area: Math.round((right - left) * (bottom - top)), distance: Math.hypot(x - centerX, y - centerY), element, x, y };
          })
          .filter(Boolean)
          .sort((first, second) => second.area - first.area || first.distance - second.distance);
        if (candidates.length === 0) return { error: "no route frame on screen" };
        const frame = candidates[0].element;
        lib.dragFrame = frame;
        const rectBefore = rectOf(frame);
        const startX = candidates[0].x;
        const startY = candidates[0].y;
        const pointer = (x, y, buttons) => ({
          bubbles: true,
          button: 0,
          buttons,
          cancelable: true,
          clientX: x,
          clientY: y,
          composed: true,
          height: 1,
          isPrimary: true,
          pointerId: 1,
          pointerType: "mouse",
          pressure: buttons ? 0.5 : 0,
          screenX: x,
          screenY: y,
          view: window,
          width: 1,
        });
        // Dispatch where a real pointer would land: the element under the start
        // point (a child hit area, the preview or the frame itself), so pointer
        // handlers on any ancestor, including the viewport, receive the drag.
        const hit = document.elementFromPoint(startX, startY);
        const target = hit && (frame.contains(hit) || hit.contains(frame) === false) ? hit : frame;
        const tDown = performance.now();
        target.dispatchEvent(new PointerEvent("pointerdown", pointer(startX, startY, 1)));
        await nextFrame();
        await wait(50);
        const costs = [];
        let tFirstMove = null;
        for (let index = 1; index <= moves; index += 1) {
          const started = performance.now();
          if (tFirstMove === null) tFirstMove = started;
          target.dispatchEvent(new PointerEvent("pointermove", pointer(startX + index * stepX, startY + index * stepY, 1)));
          await taskBarrier();
          costs.push(performance.now() - started);
          await nextFrame();
        }
        const tUp = performance.now();
        target.dispatchEvent(new PointerEvent("pointerup", pointer(startX + moves * stepX, startY + moves * stepY, 0)));
        return {
          costs,
          frame: describe(frame),
          dispatchTarget: describe(target),
          frameName: frame.getAttribute("aria-label"),
          rectBefore,
          start: { x: startX, y: startY },
          tDown,
          tFirstMove,
          tUp,
        };
      },
      dragFrameRect() {
        return lib.dragFrame && lib.dragFrame.isConnected ? rectOf(lib.dragFrame) : null;
      },
      dragFrame: null,
    };
    Object.defineProperty(window, "__piFlowBenchLib", { configurable: true, value: lib });

    // Snapshot timing pages: the first animation frame in which the canvas is
    // shown and every on-screen snapshot-tier frame shows its image.
    if (config.watchSnapshots) {
      const watch = () => {
        try {
          const state = lib.snapshotState();
          if (state && state.preload === null && state.visibleSnapshotTier > 0 && state.visibleSnapshotTierShown === state.visibleSnapshotTier) {
            hub.visibleSnapshotsAt = performance.now();
            hub.visibleSnapshotsInfo = state;
            return;
          }
        } catch (error) {
          hub.errors.push(`snapshot watch: ${error}`);
          return;
        }
        if (performance.now() < 120_000) requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    }

    const poll = () => {
      if (hub.readyAt !== null) return;
      try {
        const state = config.mode === "flow" ? flowState() : storyState();
        if (state.ready) {
          hub.readyAt = performance.now();
          hub.readyInfo = state;
          return;
        }
      } catch (error) {
        hub.errors.push(`ready poll: ${error}`);
      }
      setTimeout(poll, 50);
    };
    setTimeout(poll, 0);
  } catch (error) {
    try {
      console.warn("[flow-bench] instrumentation failed", error);
    } catch (ignored) {
      // Nothing else to report to.
    }
  }
}

// ---------------------------------------------------------------------------
// Chrome and CDP
// ---------------------------------------------------------------------------

function findChrome() {
  return [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

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
  closeInfo = null;
  id = 0;
  listeners = new Set();
  pending = new Map();
  stats = { bytes: 0, largest: 0, largestMethod: null, messages: 0 };

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const text = String(event.data);
      const message = JSON.parse(text);
      this.stats.messages += 1;
      this.stats.bytes += text.length;
      if (text.length > this.stats.largest) {
        this.stats.largest = text.length;
        this.stats.largestMethod = message.method ?? `response to ${this.pending.get(message.id)?.method ?? message.id}`;
      }
      if (message.id && this.pending.has(message.id)) {
        const { method, reject, resolve, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) {
          const data = message.error.data ? ` (${message.error.data})` : "";
          reject(new Error(`CDP ${method}: ${message.error.message}${data}`));
        } else {
          resolve(message.result);
        }
        return;
      }
      if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    });
    socket.addEventListener("close", (event) => {
      this.closeInfo = { code: event.code, reason: event.reason, wasClean: event.wasClean };
      for (const { method, reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(this.closedError(method));
      }
      this.pending.clear();
    });
  }

  closedError(method) {
    const info = this.closeInfo ?? {};
    const error = new Error(
      `CDP ${method}: the Chrome DevTools socket closed (code ${info.code ?? "?"}${info.reason ? `, ${info.reason}` : ""}; ` +
        `${this.stats.messages} messages received, largest ${this.stats.largest} chars from ${this.stats.largestMethod}).`,
    );
    error.cdpClosed = true;
    error.transient = true;
    return error;
  }

  send(method, params = {}, sessionId, timeoutMs = 120_000) {
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(this.closedError(method));
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

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

async function openPage(cdp, instrumentationConfig, profileDir) {
  const baseline = rendererProcesses(profileDir);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { flatten: true, targetId });
  const page = {
    baselinePids: baseline ? new Set(baseline.map((entry) => entry.pid)) : null,
    errors: [],
    mainFrameNavigations: 0,
    sessionId,
    targetId,
    send: (method, params = {}, timeoutMs) => cdp.send(method, params, sessionId, timeoutMs),
    async evaluate(expression, timeoutMs = 120_000) {
      const response = await page.send(
        "Runtime.evaluate",
        { awaitPromise: true, expression, returnByValue: true },
        timeoutMs,
      );
      if (response.exceptionDetails) {
        const details = response.exceptionDetails;
        throw new Error(details.exception?.description ?? details.text ?? "Runtime.evaluate failed");
      }
      return response.result?.value;
    },
  };
  page.stopListening = cdp.on((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Page.frameNavigated" && !message.params.frame.parentId) {
      page.mainFrameNavigations += 1;
    } else if (message.method === "Runtime.exceptionThrown" && page.errors.length < 20) {
      const details = message.params.exceptionDetails;
      page.errors.push(String(details.exception?.description ?? details.text).split("\n")[0]);
    } else if (
      message.method === "Runtime.consoleAPICalled" &&
      message.params.type === "error" &&
      page.errors.length < 20
    ) {
      page.errors.push(
        message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ").split("\n")[0],
      );
    }
  });
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    height: VIEWPORT.height,
    mobile: false,
    width: VIEWPORT.width,
  });
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${installFlowBenchInstrumentation.toString()})(${JSON.stringify(instrumentationConfig)});`,
  });
  await page.send("Page.bringToFront");
  return page;
}

async function closePage(cdp, page) {
  page.stopListening();
  await cdp.send("Target.closeTarget", { targetId: page.targetId }).catch(() => undefined);
}

async function navigate(page, url) {
  const response = await page.send("Page.navigate", { url });
  if (response.errorText) throw new Error(`Navigation to ${url} failed: ${response.errorText}`);
}

async function readHub(page, expression) {
  try {
    return await page.evaluate(
      `(() => { const hub = window.__piFlowBench; if (!hub) return null; return (${expression})(hub); })()`,
      30_000,
    );
  } catch (error) {
    if (error.cdpClosed) throw error;
    // The context can be replaced while a navigation or a dev-server reload is in flight.
    return null;
  }
}

const benchStarted = Date.now();
function progress(message) {
  process.stderr.write(`[flow-bench +${((Date.now() - benchStarted) / 1000).toFixed(1)}s] ${message}\n`);
}

async function waitForReady(page, timeoutMs) {
  const started = Date.now();
  let progressKey = null;
  let progressAt = started;
  let stalled = false;
  while (Date.now() - started < timeoutMs) {
    const ready = await readHub(page, "(hub) => hub.readyAt === null ? null : { readyAt: hub.readyAt, readyInfo: hub.readyInfo }");
    if (ready) return { ...ready, timedOut: false, stalled: false };
    const flow = await page.evaluate(
      "window.__piFlowBenchLib && window.__piFlowBenchLib.flowState ? window.__piFlowBenchLib.flowState() : null",
    ).catch((error) => {
      if (error.cdpClosed) throw error;
      return null;
    });
    if (flow && (flow.iframes > 0 || flow.tiered)) {
      const key = `${flow.iframes}/${flow.iframesReady}/${flow.iframeErrors}/${flow.liveLoading ?? 0}`;
      if (key !== progressKey) {
        progressKey = key;
        progressAt = Date.now();
      } else if (Date.now() - progressAt >= READY_STALL_MS) {
        stalled = true;
        break;
      }
    }
    await sleep(200);
  }
  const state = await readHub(page, "(hub) => ({ errors: hub.errors })");
  const current = await page.evaluate(
    "window.__piFlowBenchLib ? (window.__piFlowBenchLib.flowState ? window.__piFlowBenchLib.flowState() : null) : null",
  ).catch((error) => {
    if (error.cdpClosed) throw error;
    return null;
  });
  return { readyAt: null, readyInfo: current, timedOut: true, stalled, errors: state?.errors ?? [] };
}

async function waitForQuiet(page, marksExist) {
  const started = Date.now();
  if (!marksExist) {
    await sleep(FIXED_SETTLE_MS);
    return { rule: `fixed ${FIXED_SETTLE_MS} ms settle (build has no ${MARK_COMMIT} mark)`, timedOut: false, waitedMs: FIXED_SETTLE_MS };
  }
  while (Date.now() - started < QUIET_TIMEOUT_MS) {
    const state = await readHub(
      page,
      `(hub) => { const commits = hub.marks.filter((mark) => mark.name === ${JSON.stringify(MARK_COMMIT)}); return { now: performance.now(), last: commits.length ? commits[commits.length - 1].t : 0 }; }`,
    );
    if (state && state.now - state.last >= QUIET_MS) {
      return { rule: `no ${MARK_COMMIT} for ${QUIET_MS} ms`, timedOut: false, waitedMs: Date.now() - started };
    }
    await sleep(100);
  }
  return { rule: `no ${MARK_COMMIT} for ${QUIET_MS} ms`, timedOut: true, waitedMs: Date.now() - started };
}

// Snapshot queue idle for SNAPSHOT_IDLE_STABLE_MS (the queue can empty for a
// moment between captures). unsupported: the build shows no snapshot queue.
async function waitForSnapshotQueueIdle(page, timeoutMs) {
  const started = Date.now();
  let idleSince = null;
  let state = null;
  while (Date.now() - started < timeoutMs) {
    state = await page.evaluate(
      "window.__piFlowBenchLib && window.__piFlowBenchLib.snapshotState ? window.__piFlowBenchLib.snapshotState() : null",
    ).catch((error) => {
      if (error.cdpClosed) throw error;
      return null;
    });
    if (state?.queue === "idle") {
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= SNAPSHOT_IDLE_STABLE_MS) {
        return { state, timedOut: false, unsupported: false, waitedMs: Date.now() - started };
      }
    } else {
      idleSince = null;
      if (state && state.queue === null && Date.now() - started >= SNAPSHOT_QUEUE_GRACE_MS) {
        return { state, timedOut: false, unsupported: true, waitedMs: Date.now() - started };
      }
    }
    await sleep(100);
  }
  return { state, timedOut: true, unsupported: false, waitedMs: Date.now() - started };
}

// Every process of this Chrome instance carries its unique --user-data-dir.
function chromeProcesses(profileDir) {
  const output = execFileSync("ps", ["-axww", "-o", "pid=,rss=,command="], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .split("\n")
    .filter((line) => line.includes(`--user-data-dir=${profileDir}`))
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, rss, command]) => ({ command, pid: Number(pid), rssKb: Number(rss) }));
}

function rendererProcesses(profileDir) {
  try {
    return chromeProcesses(profileDir).filter((entry) => entry.command.includes("--type=renderer"));
  } catch (error) {
    return null;
  }
}

function sumRss(entries) {
  return entries ? round(entries.reduce((total, entry) => total + entry.rssKb, 0) / 1024, 1) : null;
}

// The page's renderers are the ones that did not exist before its target was
// created (the spare renderer is disabled, so a navigation spawns its own).
function rendererMemory(profileDir, baselinePids) {
  const renderers = rendererProcesses(profileDir);
  if (!renderers) {
    return { rendererProcesses: null, rendererRssMb: null, instanceRendererProcesses: null, instanceRendererRssMb: null };
  }
  const pageRenderers = baselinePids ? renderers.filter((entry) => !baselinePids.has(entry.pid)) : renderers;
  return {
    rendererProcesses: pageRenderers.length,
    rendererRssMb: sumRss(pageRenderers),
    instanceRendererProcesses: renderers.length,
    instanceRendererRssMb: sumRss(renderers),
  };
}

async function clearLocalStorage(page) {
  await page.evaluate("(() => { try { localStorage.clear(); return true; } catch (error) { return false; } })()").catch(() => false);
}

async function sampleMemory(page, profileDir) {
  await page.send("HeapProfiler.enable");
  await page.send("HeapProfiler.collectGarbage");
  await sleep(300);
  await page.send("Performance.enable");
  const { metrics } = await page.send("Performance.getMetrics");
  const values = Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
  const counters = await page.send("Memory.getDOMCounters");
  return {
    documents: counters.documents,
    domNodes: counters.nodes,
    jsEventListeners: counters.jsEventListeners,
    jsHeapTotalMb: round(values.JSHeapTotalSize / 1048576, 1),
    jsHeapUsedMb: round(values.JSHeapUsedSize / 1048576, 1),
    ...rendererMemory(profileDir, page.baselinePids),
  };
}

async function recordTrace(cdp, file, run) {
  const categories = [
    "-*",
    "devtools.timeline",
    "disabled-by-default-devtools.timeline",
    "disabled-by-default-devtools.timeline.frame",
    "disabled-by-default-devtools.timeline.stack",
    "disabled-by-default-v8.cpu_profiler",
    "v8.execute",
    "blink.user_timing",
    "latencyInfo",
    "toplevel",
  ];
  const complete = new Promise((resolve) => {
    const stop = cdp.on((message) => {
      if (message.method === "Tracing.tracingComplete") {
        stop();
        resolve(message.params.stream);
      }
    });
  });
  await cdp.send("Tracing.start", {
    traceConfig: { includedCategories: categories, recordMode: "recordAsMuchAsPossible" },
    transferMode: "ReturnAsStream",
  });
  try {
    return await run();
  } finally {
    await cdp.send("Tracing.end");
    const stream = await complete;
    const chunks = [];
    while (true) {
      const chunk = await cdp.send("IO.read", { handle: stream, size: 1 << 20 });
      chunks.push(chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : Buffer.from(chunk.data));
      if (chunk.eof) break;
    }
    await cdp.send("IO.close", { handle: stream });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.concat(chunks));
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function machineInfo() {
  const read = (command, args) => {
    try {
      return execFileSync(command, args, { encoding: "utf8" }).trim() || null;
    } catch (error) {
      return null;
    }
  };
  let model = null;
  let cpu = os.cpus()[0]?.model ?? null;
  if (process.platform === "darwin") {
    model = read("sysctl", ["-n", "hw.model"]);
    cpu = read("sysctl", ["-n", "machdep.cpu.brand_string"]) ?? cpu;
  } else if (existsSync("/sys/devices/virtual/dmi/id/product_name")) {
    model = readFileSync("/sys/devices/virtual/dmi/id/product_name", "utf8").trim() || null;
  }
  return {
    cpu,
    logicalCpus: os.cpus().length,
    memoryGb: round(os.totalmem() / 1024 ** 3, 1),
    model,
    node: process.version,
    os: `${process.platform} ${os.release()}`,
  };
}

function inspectorInfo(projectRoot) {
  if (!projectRoot) {
    return { buildTag: null, declares: null, previewFile: null, note: "--project-root not given" };
  }
  const inspectorDir = path.join(projectRoot, ".storybook", "prototype-inspector");
  const previewFile = path.join(inspectorDir, "preview.js");
  if (!existsSync(previewFile)) {
    return { buildTag: null, declares: null, previewFile, note: "preview.js not found" };
  }
  const match = readFileSync(previewFile, "utf8").match(/prototypeInspectorBuildTag\s*=\s*["'`]([^"'`]+)["'`]/);
  const sources = readdirSync(inspectorDir)
    .filter((name) => /\.(m?js|css)$/.test(name))
    .map((name) => readFileSync(path.join(inspectorDir, name), "utf8"))
    .join("\n");
  return {
    buildTag: match ? match[1] : null,
    declares: {
      commitMark: sources.includes(MARK_COMMIT),
      labelPlacementMark: sources.includes(MARK_LABEL_PLACEMENT),
      strokeZoomVariable: sources.includes(STROKE_ZOOM_VARIABLE),
    },
    previewFile,
  };
}

function viewportSignature(viewport) {
  if (!isRecord(viewport)) return null;
  const fallback = { desktop: [1280, 800], phone: [375, 812], tablet: [768, 1024] };
  const formFactor = Object.hasOwn(fallback, viewport.formFactor) ? viewport.formFactor : "phone";
  const width = Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : fallback[formFactor][0];
  const height = Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : fallback[formFactor][1];
  return `${formFactor}:${width}x${height}`;
}

// ---------------------------------------------------------------------------
// Window accounting
// ---------------------------------------------------------------------------

function countMarks(marks, name, from, to, exists) {
  if (!exists) return null;
  return marks.filter((mark) => mark.name === name && mark.t >= from && mark.t < to).length;
}

function longFrameSummary(hub, from, to) {
  if (!hub.longFramesSupported) return null;
  const frames = hub.longFrames.filter((frame) => frame.t >= from && frame.t < to);
  return {
    count: frames.length,
    maxDurationMs: frames.length ? round(Math.max(...frames.map((frame) => frame.duration))) : 0,
    totalBlockingMs: round(frames.reduce((total, frame) => total + (frame.blocking ?? 0), 0)),
  };
}

// When the first commit at or after the camera idle landed, in ms after the
// gesture's last event (null when none did, or the build has no commit mark).
function firstCommitAfter(hub, from, lastEvent, exists) {
  if (!exists.commit) return null;
  const commit = hub.marks.find((mark) => mark.name === MARK_COMMIT && mark.t >= from);
  return commit ? round(commit.t - lastEvent, 1) : null;
}

function wheelGestureSummary(hub, gesture, exists) {
  const idleAt = gesture.tLast + CAMERA_IDLE_MS;
  return {
    commitMarks: {
      duringGesture: countMarks(hub.marks, MARK_COMMIT, gesture.t0, idleAt, exists.commit),
      afterIdle100ms: countMarks(hub.marks, MARK_COMMIT, idleAt, idleAt + AFTER_IDLE_WINDOW_MS + 0.001, exists.commit),
      firstAfterLastEventMs: firstCommitAfter(hub, idleAt, gesture.tLast, exists),
    },
    labelPlacementMarks: {
      duringGesture: countMarks(hub.marks, MARK_LABEL_PLACEMENT, gesture.t0, idleAt, exists.labelPlacement),
      afterIdle100ms: countMarks(
        hub.marks,
        MARK_LABEL_PLACEMENT,
        idleAt,
        idleAt + AFTER_IDLE_WINDOW_MS + 0.001,
        exists.labelPlacement,
      ),
    },
    durationMs: round(gesture.tLast - gesture.t0),
    longAnimationFrames: longFrameSummary(hub, gesture.t0, idleAt),
  };
}

function cameraSummary(camera) {
  if (!camera) return null;
  return { x: round(camera.x), y: round(camera.y), zoom: round(camera.zoom, 4) };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function runBench(args) {
  const chrome = findChrome();
  if (!chrome) throw new Error("No Chrome or Chromium binary found; set CHROME_PATH.");

  const flowUrl = withPrototypeMode(args.url, "flow");
  const storyUrl = withPrototypeMode(args.url, "story");
  const notes = [];
  const inspector = inspectorInfo(args.projectRoot);
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "pi-flow-bench-chrome-"));
  const browser = spawn(
    chrome,
    [
      ...(args.headed ? [] : ["--headless=new"]),
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-component-extensions-with-background-pages",
      "--disable-component-update",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-features=SpareRendererForSitePerProcess,Translate,MediaRouter,OptimizationHints",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--use-mock-keychain",
      "--password-store=basic",
      "--mute-audio",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      `--remote-debugging-port=${args.chromePort}`,
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let socket;

  const cleanup = async () => {
    try {
      socket?.close();
    } catch (error) {
      // Already closed.
    }
    if (browser.exitCode === null && browser.signalCode === null) {
      const exited = new Promise((resolve) => browser.once("exit", resolve));
      browser.kill("SIGTERM");
      await Promise.race([exited, sleep(5_000)]);
      if (browser.exitCode === null && browser.signalCode === null) browser.kill("SIGKILL");
    }
    // Helper processes can outlive the browser process for a moment and keep
    // writing into the profile; wait for them (and kill stragglers) first.
    const deadline = Date.now() + 5_000;
    let leftovers = [];
    do {
      try {
        leftovers = chromeProcesses(profileDir);
      } catch (error) {
        leftovers = [];
      }
      if (leftovers.length > 0) await sleep(200);
    } while (leftovers.length > 0 && Date.now() < deadline);
    for (const entry of leftovers) {
      try {
        process.kill(entry.pid, "SIGKILL");
      } catch (error) {
        // Already gone.
      }
    }
    await rm(profileDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 }).catch(() => undefined);
  };
  const onSignal = () => {
    cleanup().finally(() => process.exit(130));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    socket = new WebSocket(await browserWebSocketUrl(browser));
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const cdp = new CdpClient(socket);
    const version = await cdp.send("Browser.getVersion");
    progress(`${version.product} ${args.headed ? "headed" : "headless"}; profile ${profileDir}`);
    const idleMemory = rendererMemory(profileDir, null);
    // --layout: a UI Flow layout export whose positions (and lanes) are saved
    // before the measured open.
    const layoutExport = args.layout ? JSON.parse(await readFile(args.layout, "utf8")) : null;
    const baseConfig = {
      journey: args.journey,
      selectorSets: SELECTOR_SETS,
      strokeZoomVariable: STROKE_ZOOM_VARIABLE,
    };

    // Warm-up: the first visit makes the dev server transform and optimize
    // the modules of this story; nothing from it is measured.
    const warmup = await openPage(cdp, { ...baseConfig, mode: "flow", seed: null }, profileDir);
    await navigate(warmup, flowUrl);
    const warmupReady = await waitForReady(warmup, READY_TIMEOUT_MS);
    if (warmupReady.timedOut) notes.push("warm-up visit did not reach readiness");
    progress(`warm-up UI Flow ${warmupReady.stalled ? `stalled (no iframe progress for ${READY_STALL_MS} ms)` : warmupReady.timedOut ? "timed out" : `ready in ${round(warmupReady.readyAt, 0)} ms`}`);
    await sleep(1_500);
    await clearLocalStorage(warmup);
    await closePage(cdp, warmup);
    await sleep(1_000);

    // Story mode: readiness, memory, prototype discovery.
    const storyPage = await openPage(cdp, { ...baseConfig, mode: "story", seed: null }, profileDir);
    await navigate(storyPage, storyUrl);
    const storyReady = await waitForReady(storyPage, READY_TIMEOUT_MS);
    if (storyReady.timedOut) throw new Error(`Story mode did not render: ${storyUrl}`);
    if (storyReady.readyInfo?.error) throw new Error(`Storybook shows an error for ${storyUrl}`);
    await sleep(FIXED_SETTLE_MS);
    const prototype = await storyPage.evaluate("window.__piFlowBenchLib.prototypeInfo('prototype')");
    if (!prototype) throw new Error(`No parameters.prototype on the story at ${storyUrl}`);
    const storybookMode = await storyPage.evaluate("window.__piFlowBenchLib.storybookMode()");
    const storyMemory = await sampleMemory(storyPage, profileDir);
    progress(`Story mode ready in ${round(storyReady.readyAt, 0)} ms; prototype ${prototype.id} (${prototype.routes} routes)`);
    const storyErrors = storyPage.errors.slice();
    await clearLocalStorage(storyPage);
    await closePage(cdp, storyPage);
    await sleep(1_500);

    // Snapshot timings. The warm-up visit filled the snapshot store, so the
    // cold opens clear IndexedDB for the Storybook origin first (through the
    // page's session: the browser session answers with an internal error).
    const clearSnapshotStore = (page) =>
      page.send("Storage.clearDataForOrigin", { origin: new URL(flowUrl).origin, storageTypes: "indexeddb" });
    const snapshotMarksOf = (marks) => (marks ?? []).filter((mark) => mark.name === MARK_SNAPSHOT);
    let snapshotTimings = null;
    {
      const coldPage = await openPage(cdp, { ...baseConfig, mode: "flow", seed: null, watchSnapshots: true }, profileDir);
      await clearSnapshotStore(coldPage);
      await navigate(coldPage, flowUrl);
      const coldReady = await waitForReady(coldPage, READY_TIMEOUT_MS);
      const coldQueue = await waitForSnapshotQueueIdle(coldPage, SNAPSHOT_QUEUE_TIMEOUT_MS);
      const coldHub = await readHub(coldPage, "(hub) => ({ marks: hub.marks, visibleSnapshotsAt: hub.visibleSnapshotsAt })");
      await clearLocalStorage(coldPage);
      await closePage(cdp, coldPage);
      await sleep(1_000);

      if (coldQueue.unsupported) {
        notes.push("this build shows no snapshot queue: snapshot timings are null");
      } else {
        const coldMarks = snapshotMarksOf(coldHub?.marks);
        // Second navigation: the snapshots the cold open stored.
        const cachedPage = await openPage(cdp, { ...baseConfig, mode: "flow", seed: null, watchSnapshots: true }, profileDir);
        await navigate(cachedPage, flowUrl);
        const cachedReady = await waitForReady(cachedPage, READY_TIMEOUT_MS);
        const visibleStarted = Date.now();
        let cachedHub = null;
        while (Date.now() - visibleStarted < VISIBLE_SNAPSHOTS_TIMEOUT_MS) {
          cachedHub = await readHub(cachedPage, "(hub) => ({ marks: hub.marks, visibleSnapshotsAt: hub.visibleSnapshotsAt, visibleSnapshotsInfo: hub.visibleSnapshotsInfo })");
          if (cachedHub?.visibleSnapshotsAt !== null && cachedHub?.visibleSnapshotsAt !== undefined) break;
          await sleep(100);
        }
        const cachedQueue = await waitForSnapshotQueueIdle(cachedPage, SNAPSHOT_QUEUE_TIMEOUT_MS);
        const cachedAfter = await readHub(cachedPage, "(hub) => ({ marks: hub.marks })");
        await clearLocalStorage(cachedPage);
        await closePage(cdp, cachedPage);
        await sleep(1_000);

        // Cold again, dragging a frame while snapshots are being captured.
        const dragPage = await openPage(cdp, { ...baseConfig, mode: "flow", seed: null }, profileDir);
        await clearSnapshotStore(dragPage);
        await navigate(dragPage, flowUrl);
        await waitForReady(dragPage, READY_TIMEOUT_MS);
        const capturingStarted = Date.now();
        let capturing = null;
        while (Date.now() - capturingStarted < 60_000) {
          capturing = await dragPage.evaluate(
            `(() => { const state = window.__piFlowBenchLib.snapshotState(); return { queue: state && state.queue, snapshots: performance.getEntriesByName(${JSON.stringify(MARK_SNAPSHOT)}).length }; })()`,
          );
          if (capturing.queue === "busy" && capturing.snapshots >= 1) break;
          await sleep(50);
        }
        const dragWhileCapturing = await dragPage.evaluate(`window.__piFlowBenchLib.drag(${JSON.stringify(DRAG)})`);
        await waitForSnapshotQueueIdle(dragPage, SNAPSHOT_QUEUE_TIMEOUT_MS);
        await clearLocalStorage(dragPage);
        await closePage(cdp, dragPage);
        await sleep(1_000);

        snapshotTimings = {
          cold: {
            readyMs: coldReady.readyAt === null ? null : round(coldReady.readyAt, 1),
            snapshots: coldMarks.length,
            allSnapshotsMs: coldMarks.length ? round(coldMarks.at(-1).t, 1) : null,
            visibleSnapshotsMs: coldHub?.visibleSnapshotsAt == null ? null : round(coldHub.visibleSnapshotsAt, 1),
            queueTimedOut: coldQueue.timedOut,
            snapshotTier: coldQueue.state?.snapshotTier ?? null,
            snapshotTierShown: coldQueue.state?.snapshotTierShown ?? null,
          },
          cached: {
            readyMs: cachedReady.readyAt === null ? null : round(cachedReady.readyAt, 1),
            visibleSnapshotsMs: cachedHub?.visibleSnapshotsAt == null ? null : round(cachedHub.visibleSnapshotsAt, 1),
            visibleSnapshotFrames: cachedHub?.visibleSnapshotsInfo?.visibleSnapshotTier ?? null,
            // Snapshots replaced by the once-per-session revalidation.
            revalidationTiles: snapshotMarksOf(cachedAfter?.marks).length,
            revalidationMs: cachedQueue.timedOut ? null : cachedQueue.waitedMs,
          },
          dragWhileCapturing: dragWhileCapturing.error
            ? { error: dragWhileCapturing.error }
            : {
                queueAtStart: capturing?.queue ?? null,
                snapshotsBeforeDrag: capturing?.snapshots ?? null,
                syncCostMs: { ...summarize(dragWhileCapturing.costs), samples: dragWhileCapturing.costs.map((cost) => round(cost)) },
              },
        };
        progress(
          `snapshots: cold ${snapshotTimings.cold.snapshots} in ${snapshotTimings.cold.allSnapshotsMs} ms, cached visible in ${snapshotTimings.cached.visibleSnapshotsMs} ms, drag while capturing p95 ${snapshotTimings.dragWhileCapturing.syncCostMs?.p95 ?? "n/a"} ms`,
        );
      }
    }

    // UI Flow: seed a saved layout with an unknown node id before the app runs
    // (the positions of --layout when given, with its lanes).
    const seedKey = `${FLOW_LAYOUT_PREFIX}${prototype.id}`;
    const seedPositions = {};
    const seedExtra = [];
    if (layoutExport) {
      Object.assign(seedPositions, layoutExport.positions ?? {});
      if (Array.isArray(layoutExport.lanes) && layoutExport.lanes.length) {
        seedExtra.push([
          `prototype-inspector:flow-lanes:${prototype.id}`,
          JSON.stringify({ labels: layoutExport.lanes, version: 1, viewport: viewportSignature(prototype.viewport) }),
        ]);
      }
    } else if (prototype.firstPositionedRoute) {
      seedPositions[prototype.firstPositionedRoute.id] = {
        x: prototype.firstPositionedRoute.x,
        y: prototype.firstPositionedRoute.y,
      };
    }
    seedPositions[UNKNOWN_NODE_ID] = { x: 0, y: 0 };
    const seedValue = JSON.stringify({
      exportedAt: new Date().toISOString(),
      positions: seedPositions,
      prototypeId: prototype.id,
      schema: "storybook-template.prototype-flow-layout",
      version: 2,
      viewport: viewportSignature(prototype.viewport),
    });
    const flowPage = await openPage(
      cdp,
      { ...baseConfig, mode: "flow", seed: { extra: seedExtra, key: seedKey, value: seedValue } },
      profileDir,
    );
    await navigate(flowPage, flowUrl);
    const flowReady = await waitForReady(flowPage, READY_TIMEOUT_MS);
    if (flowReady.stalled) {
      notes.push(`UI Flow readiness stalled: no route iframe finished loading for ${READY_STALL_MS} ms`);
    } else if (flowReady.timedOut) {
      notes.push(`UI Flow did not reach readiness within ${READY_TIMEOUT_MS} ms`);
    }
    progress(`UI Flow ${flowReady.stalled ? `stalled (no iframe progress for ${READY_STALL_MS} ms)` : flowReady.timedOut ? "timed out" : `ready in ${round(flowReady.readyAt, 0)} ms`}`);
    const navigationsAtReady = flowPage.mainFrameNavigations;
    // Without readiness there is no open phase to count; report null instead of
    // folding every later write (for example the drag's) into it.
    const openPhaseEnd = flowReady.timedOut ? null : flowReady.readyAt;
    const seedPreserved = await flowPage.evaluate(`localStorage.getItem(${JSON.stringify(seedKey)}) === ${JSON.stringify(seedValue)}`);
    const openHub = await readHub(flowPage, "(hub) => ({ marks: hub.marks, seed: hub.seed })");
    const exists = {
      commit: Boolean(openHub?.marks.some((mark) => mark.name === MARK_COMMIT)) || inspector.declares?.commitMark === true,
      labelPlacement:
        Boolean(openHub?.marks.some((mark) => mark.name === MARK_LABEL_PLACEMENT)) ||
        inspector.declares?.labelPlacementMark === true,
      strokeZoom: inspector.declares?.strokeZoomVariable === true,
    };
    const settle = await waitForQuiet(flowPage, exists.commit);
    // Memory and gestures are measured once the snapshot queue is idle (the
    // open's revalidation captures run first).
    const openQueue = snapshotTimings ? await waitForSnapshotQueueIdle(flowPage, SNAPSHOT_QUEUE_TIMEOUT_MS) : null;
    if (openQueue?.timedOut) notes.push("the snapshot queue was still busy before the fit memory sample");
    const flowMemory = await sampleMemory(flowPage, profileDir);
    await sleep(500);

    // Route iframes at fit and at 100%: Shift+0 and Shift+1 go through the
    // canvas key dispatcher, which listens on document in the bubble phase.
    const pressCanvasKey = (code, key) =>
      flowPage.evaluate(
        `document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: ${JSON.stringify(code)}, key: ${JSON.stringify(key)}, shiftKey: true }))`,
      );
    const waitForLiveFrames = async (timeoutMs) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const state = await flowPage.evaluate("window.__piFlowBenchLib.flowState()");
        if (!state?.liveLoading) return true;
        await sleep(200);
      }
      return false;
    };
    const fitIframes = await flowPage.evaluate("window.__piFlowBenchLib.iframeCounts()");
    await pressCanvasKey("Digit0", ")");
    await sleep(CAMERA_IDLE_MS + 300);
    await waitForQuiet(flowPage, exists.commit);
    if (!(await waitForLiveFrames(ZOOM_100_LOAD_TIMEOUT_MS))) {
      notes.push(`live frames were still loading ${ZOOM_100_LOAD_TIMEOUT_MS} ms after zooming to 100%`);
    }
    const zoom100Iframes = await flowPage.evaluate("window.__piFlowBenchLib.iframeCounts()");
    if (snapshotTimings) await waitForSnapshotQueueIdle(flowPage, SNAPSHOT_QUEUE_TIMEOUT_MS);
    const zoom100Memory = await sampleMemory(flowPage, profileDir);
    await pressCanvasKey("Digit1", "!");
    await sleep(CAMERA_IDLE_MS + 300);
    await waitForQuiet(flowPage, exists.commit);
    if (snapshotTimings) await waitForSnapshotQueueIdle(flowPage, SNAPSHOT_QUEUE_TIMEOUT_MS);
    progress(`route iframes: fit ${fitIframes.route}, 100% ${zoom100Iframes.route} (renderer ${fitIframes.renderer}/${zoom100Iframes.renderer})`);
    const selectorSet = await flowPage.evaluate("window.__piFlowBenchLib.flowState().selectorSet");
    const gestureStart = await flowPage.evaluate("performance.now()");

    const gestures = async () => {
      const pinch = await flowPage.evaluate(
        `window.__piFlowBenchLib.pinch(${JSON.stringify({ deltaY: -100 * Math.log(PINCH.scalePerEvent), events: PINCH.events })})`,
      );
      await sleep(CAMERA_IDLE_MS + AFTER_IDLE_WINDOW_MS + 150);
      const afterPinch = await waitForQuiet(flowPage, exists.commit);
      const pan = await flowPage.evaluate(
        `window.__piFlowBenchLib.pan(${JSON.stringify({ deltaX: PAN.deltaX, deltaY: PAN.deltaY, events: PAN.events })})`,
      );
      await sleep(CAMERA_IDLE_MS + AFTER_IDLE_WINDOW_MS + 150);
      const afterPan = await waitForQuiet(flowPage, exists.commit);
      const drag = await flowPage.evaluate(`window.__piFlowBenchLib.drag(${JSON.stringify(DRAG)})`);
      await sleep(DRAG_STORAGE_WINDOW_MS + 100);
      const afterDrag = await waitForQuiet(flowPage, exists.commit);
      const dragRectAfter = await flowPage.evaluate("window.__piFlowBenchLib.dragFrameRect()");
      return { afterDrag, afterPan, afterPinch, drag, dragRectAfter, pan, pinch };
    };
    progress("gestures: pinch, pan, drag");
    const measured = args.trace ? await recordTrace(cdp, args.trace, gestures) : await gestures();
    if (flowPage.mainFrameNavigations !== navigationsAtReady) {
      const error = new Error(
        "The UI Flow page reloaded after it became ready (for example a dev-server full reload); " +
          "gesture results would mix two documents.",
      );
      error.transient = true;
      throw error;
    }
    progress("gestures done");
    const hub = await readHub(
      flowPage,
      "(hub) => ({ longFrames: hub.longFrames, longFramesSupported: hub.longFramesSupported, marks: hub.marks, storage: hub.storage, strokeZoomWrites: hub.strokeZoomWrites, errors: hub.errors })",
    );
    if (!hub) throw new Error("Lost the UI Flow page context before the results were read (did the page reload?).");
    exists.commit = exists.commit || hub.marks.some((mark) => mark.name === MARK_COMMIT);
    exists.labelPlacement = exists.labelPlacement || hub.marks.some((mark) => mark.name === MARK_LABEL_PLACEMENT);
    exists.strokeZoom = exists.strokeZoom || hub.strokeZoomWrites.length > 0;
    const flowErrors = flowPage.errors.slice();
    const mainFrameNavigations = flowPage.mainFrameNavigations;
    await closePage(cdp, flowPage);

    // Open-phase layout storage writes.
    const layoutOps = hub.storage.filter(
      (entry) => entry.area === "local" && entry.key?.startsWith(FLOW_LAYOUT_PREFIX),
    );
    const countOps = (op, until) => layoutOps.filter((entry) => entry.op === op && entry.t <= until).length;

    // Pinch.
    const { pinch, pan, drag } = measured;
    const pinchSummary = wheelGestureSummary(hub, pinch, exists);
    const zoomPath = [pinch.before?.zoom, ...pinch.samples.map((sample) => sample.zoom)];
    let bucketsCrossed = null;
    if (exists.strokeZoom && zoomPath.every((zoom) => Number.isFinite(zoom) && zoom > 0)) {
      bucketsCrossed = 0;
      for (let index = 1; index < zoomPath.length; index += 1) {
        bucketsCrossed += Math.abs(getZoomBucket(zoomPath[index]) - getZoomBucket(zoomPath[index - 1]));
      }
    }
    const pinchStrokeWrites = hub.strokeZoomWrites.filter(
      (write) => write.t >= pinch.t0 && write.t < pinch.tLast + CAMERA_IDLE_MS + AFTER_IDLE_WINDOW_MS,
    );
    // The idle commit re-renders the world layer, so React may set the variable
    // again with the value the gesture already wrote; only value changes count
    // as bucket writes.
    const pinchStrokeGestureWrites = pinchStrokeWrites.filter((write) => write.t < pinch.tLast + CAMERA_IDLE_MS);
    const lastStrokeBefore = hub.strokeZoomWrites.filter((write) => write.t < pinch.t0).at(-1);
    let previousStrokeValue = lastStrokeBefore ? lastStrokeBefore.value : pinch.strokeZoomBefore;
    let pinchStrokeValueChanges = 0;
    for (const write of pinchStrokeWrites) {
      if (Number(write.value) !== Number(previousStrokeValue)) pinchStrokeValueChanges += 1;
      previousStrokeValue = write.value;
    }

    // Drag.
    let dragResult;
    if (drag.error) {
      notes.push(`drag skipped: ${drag.error}`);
      dragResult = { error: drag.error };
    } else {
      const localWrites = hub.storage.filter(
        (entry) =>
          entry.op === "setItem" &&
          entry.area === "local" &&
          entry.t >= drag.tDown &&
          entry.t <= drag.tUp + DRAG_STORAGE_WINDOW_MS,
      );
      const byKey = {};
      for (const entry of localWrites) byKey[entry.key] = (byKey[entry.key] ?? 0) + 1;
      const releaseWindowEnd = drag.tUp + AFTER_IDLE_WINDOW_MS + 0.001;
      dragResult = {
        pointerMoves: DRAG.moves,
        stepPx: { x: DRAG.stepX, y: DRAG.stepY },
        frame: drag.frameName ?? drag.frame,
        dispatchTarget: drag.dispatchTarget,
        syncCostMs: { ...summarize(drag.costs), samples: drag.costs.map((cost) => round(cost)) },
        msPerMove: round((drag.tUp - drag.tFirstMove) / DRAG.moves),
        commitMarks: {
          duringGesture: countMarks(hub.marks, MARK_COMMIT, drag.tFirstMove, drag.tUp, exists.commit),
          afterRelease100ms: countMarks(hub.marks, MARK_COMMIT, drag.tUp, releaseWindowEnd, exists.commit),
          firstAfterReleaseMs: firstCommitAfter(hub, drag.tUp, drag.tUp, exists),
        },
        labelPlacementMarks: {
          duringGesture: countMarks(hub.marks, MARK_LABEL_PLACEMENT, drag.tFirstMove, drag.tUp, exists.labelPlacement),
          afterRelease100ms: countMarks(hub.marks, MARK_LABEL_PLACEMENT, drag.tUp, releaseWindowEnd, exists.labelPlacement),
        },
        localStorageSetItem: localWrites.length,
        localStorageSetItemByKey: byKey,
        frameDeltaPx: measured.dragRectAfter
          ? {
              x: round(measured.dragRectAfter.left - drag.rectBefore.left),
              y: round(measured.dragRectAfter.top - drag.rectBefore.top),
            }
          : null,
        longAnimationFrames: longFrameSummary(hub, drag.tFirstMove, drag.tUp),
        settleAfter: measured.afterDrag,
      };
    }

    const placements = hub.marks.filter((mark) => mark.name === MARK_LABEL_PLACEMENT);
    const placementDurations = placements.map((mark) => mark.durationMs).filter((value) => Number.isFinite(value));
    const pinchCamera = cameraSummary(pinch.before);
    const pinchCameraAfter = cameraSummary(pinch.after);
    const panCamera = cameraSummary(pan.before);
    const panCameraAfter = cameraSummary(pan.after);

    if (selectorSet === "scroll") {
      notes.push(
        "pre-camera canvas: ctrl+wheel and plain wheel events are synthetic, so they neither zoom (only Alt+wheel zooms) nor scroll the native container; the drag runs the real drag handlers",
      );
    }
    if (!exists.commit) notes.push(`${MARK_COMMIT} is not emitted by this build: commit counts are null`);
    if (!exists.labelPlacement) notes.push(`${MARK_LABEL_PLACEMENT} is not emitted by this build: placement counts and durations are null`);
    if (!exists.strokeZoom) notes.push(`${STROKE_ZOOM_VARIABLE} does not exist in this build: stroke-zoom writes and buckets are null`);
    if (mainFrameNavigations > 1) notes.push(`the UI Flow page navigated ${mainFrameNavigations} times (dev-server reload?)`);
    if (pinchSummary.durationMs > 1000) {
      notes.push(`the ${PINCH.events} pinch events took ${pinchSummary.durationMs} ms (one per animation frame), longer than 1 s`);
    }
    const machine = machineInfo();
    const overStory = (memory) =>
      Number.isFinite(memory?.rendererRssMb) && Number.isFinite(storyMemory?.rendererRssMb)
        ? round(memory.rendererRssMb - storyMemory.rendererRssMb, 1)
        : null;
    const target = (value, limit) => ({ limit, met: value === null || value === undefined ? null : value <= limit, value: value ?? null });
    const pinchSummaryForTargets = wheelGestureSummary(hub, pinch, exists);
    const panSummaryForTargets = wheelGestureSummary(hub, pan, exists);
    const targets = {
      fitRouteIframes: target(fitIframes.route, LOD_TARGETS.fitRouteIframes),
      fitRendererIframes: target(fitIframes.renderer, LOD_TARGETS.fitRendererIframes),
      zoom100Iframes: target(zoom100Iframes.route + zoom100Iframes.renderer, LOD_TARGETS.zoom100Iframes),
      openLayoutWrites: target(
        openPhaseEnd === null ? null : countOps("setItem", openPhaseEnd) + countOps("removeItem", openPhaseEnd),
        0,
      ),
      oneCommitAfterIdle: {
        drag: dragResult.commitMarks?.afterRelease100ms ?? null,
        met: exists.commit
          ? pinchSummaryForTargets.commitMarks.afterIdle100ms === 1 &&
            panSummaryForTargets.commitMarks.afterIdle100ms === 1 &&
            dragResult.commitMarks?.afterRelease100ms === 1
          : null,
        pan: panSummaryForTargets.commitMarks.afterIdle100ms,
        pinch: pinchSummaryForTargets.commitMarks.afterIdle100ms,
      },
      fitRendererMemoryOverStoryMb: target(overStory(flowMemory), LOD_TARGETS.fitRendererMemoryOverStoryMb),
      cachedVisibleSnapshotsMs: target(snapshotTimings?.cached.visibleSnapshotsMs, LOD_TARGETS.cachedVisibleSnapshotsMs),
      coldAllSnapshotsMs: target(snapshotTimings?.cold.allSnapshotsMs, LOD_TARGETS.coldAllSnapshotsMs),
      dragDuringCaptureP95Ms: target(snapshotTimings?.dragWhileCapturing.syncCostMs?.p95, LOD_TARGETS.dragDuringCaptureP95Ms),
    };

    return {
      schema: "prototype-flow-canvas-bench/1",
      label: args.label,
      journey: args.journey,
      layout: args.layout ? path.basename(args.layout) : null,
      measuredAt: new Date().toISOString(),
      url: flowUrl,
      storyUrl,
      environment: {
        chromeVersion: version.product,
        chromeUserAgent: version.userAgent,
        chromePath: chrome,
        headless: !args.headed,
        storybookMode: storybookMode.mode,
        storybookModeEvidence: storybookMode.evidence,
        machineModel: machine.model,
        machine,
        viewport: VIEWPORT,
        projectRoot: args.projectRoot,
        prototypeInspectorBuildTag: inspector.buildTag,
        inspectorPreviewFile: inspector.previewFile,
        inspectorDeclares: inspector.declares,
      },
      prototype: {
        id: prototype.id,
        storyId: prototype.storyId,
        title: prototype.title,
        routes: prototype.routes,
        flowNodes: prototype.flowNodes,
        transitions: prototype.transitions,
        keyEdges: prototype.keyEdges,
        declaredViewport: prototype.viewport,
      },
      method: {
        input: "synthetic DOM events dispatched in the page (WheelEvent, PointerEvent pointerId 1)",
        warmup: "one unmeasured UI Flow visit before measuring",
        readiness:
          "Story: #storybook-root rendered; UI Flow: when route frames carry data-tier, every route frame has data-tier and none is data-live-loading (the snapshot renderer does not count); otherwise every iframe in the canvas shows [data-prototype-route-preview] or #storybook-root content",
        zoom100:
          "after settling: Shift+0 (keydown on document.body), camera idle, no commit for the quiet period and no loading live frame (bounded), count iframes, then Shift+1 back to fit before the gestures",
        settleBeforeGestures: `no ${MARK_COMMIT} for ${QUIET_MS} ms when the build emits it, otherwise a fixed ${FIXED_SETTLE_MS} ms`,
        cameraIdleMs: CAMERA_IDLE_MS,
        wheelWindows: `duringGesture = [first event, last event + ${CAMERA_IDLE_MS} ms); afterIdle100ms = the next ${AFTER_IDLE_WINDOW_MS} ms`,
        dragWindows: `duringGesture = [first pointermove, pointerup); afterRelease100ms = [pointerup, pointerup + ${AFTER_IDLE_WINDOW_MS} ms]`,
        pinch: {
          events: PINCH.events,
          ctrlKey: true,
          deltaY: round(-100 * Math.log(PINCH.scalePerEvent), 4),
          cadence: "one event per animation frame",
          anchor: "centre of the on-screen route frames (canvas centre when none is on screen)",
        },
        pan: {
          events: PAN.events,
          deltaX: PAN.deltaX,
          deltaY: PAN.deltaY,
          cadence: "one event per animation frame",
          anchor: "centre of the on-screen route frames (canvas centre when none is on screen)",
        },
        drag: {
          moves: DRAG.moves,
          stepPx: { x: DRAG.stepX, y: DRAG.stepY },
          target:
            "route frame whose preview shows the largest on-screen area (ties: nearest the canvas centre), " +
            "pressed at the centre of the visible part of its preview",
          syncCost:
            "pointermove dispatch until both a setTimeout(0) and a MessageChannel round trip have run " +
            "(includes the React render the move scheduled); next move after requestAnimationFrame",
          msPerMove: "(pointerup - first pointermove) / moves; 16.7 means one move per frame at 60 Hz",
          localStorageWindow: `[pointerdown, pointerup + ${DRAG_STORAGE_WINDOW_MS} ms]`,
        },
        memory:
          "after HeapProfiler.collectGarbage; rendererRssMb sums the RSS of the --type=renderer processes that appeared " +
          "after the page's target was created (spare renderer disabled); instanceRenderer* covers every renderer of this Chrome; " +
          "UI Flow samples at fit (after the snapshot queue is idle) and at 100% (live frames loaded)",
        snapshots:
          "cold: IndexedDB of the Storybook origin cleared (Storage.clearDataForOrigin), allSnapshotsMs = the last " +
          `${MARK_SNAPSHOT} mark after navigation start once the queue stays idle for ${SNAPSHOT_IDLE_STABLE_MS} ms; ` +
          "cached: the next navigation, visibleSnapshotsMs = first animation frame with the canvas shown and every on-screen " +
          "snapshot-tier frame's image loaded; dragWhileCapturing: IndexedDB cleared again, the drag starts once the queue is busy " +
          "and one snapshot exists",
        percentiles: "median interpolated; p95 nearest-rank",
      },
      storyMode: {
        readyMs: round(storyReady.readyAt, 1),
        ...storyMemory,
        pageErrors: storyErrors,
      },
      idleRenderer: idleMemory,
      uiFlow: {
        selectorSet,
        selectors: SELECTOR_SETS.find((set) => set.name === selectorSet) ?? null,
        readyMs: round(flowReady.readyAt, 1),
        readyTimedOut: flowReady.timedOut,
        routeFrames: flowReady.readyInfo?.routeFrames ?? null,
        flowNodes: flowReady.readyInfo?.flowNodes ?? null,
        iframes: flowReady.readyInfo?.iframes ?? null,
        iframeErrors: flowReady.readyInfo?.iframeErrors ?? null,
        tiered: flowReady.readyInfo?.tiered ?? null,
        journeyFocus: flowReady.readyInfo?.journeyFocus ?? null,
        routeIframes: { fit: fitIframes.route, zoom100: zoom100Iframes.route },
        rendererIframes: { fit: fitIframes.renderer, zoom100: zoom100Iframes.renderer },
        // Resets other than the first load and the scheduled reloads; null
        // while the build has no snapshot renderer.
        rendererSrcResetFallbacks:
          fitIframes.renderer + zoom100Iframes.renderer === 0 && !hub.marks.some((mark) => mark.name === MARK_RENDERER_RESET)
            ? null
            : hub.marks.filter((mark) => mark.name === MARK_RENDERER_RESET && !PLANNED_RENDERER_RESETS.has(mark.reason)).length,
        ...flowMemory,
        memoryZoom100: zoom100Memory,
        rendererMemoryOverStoryMb: { fit: overStory(flowMemory), zoom100: overStory(zoom100Memory) },
        settle,
        openLayoutStorage: {
          key: seedKey,
          seededPositions: Object.keys(seedPositions),
          seeded: openHub?.seed?.written ?? false,
          setItem: openPhaseEnd === null ? null : countOps("setItem", openPhaseEnd),
          removeItem: openPhaseEnd === null ? null : countOps("removeItem", openPhaseEnd),
          untilGestureStart: {
            setItem: countOps("setItem", gestureStart),
            removeItem: countOps("removeItem", gestureStart),
          },
          seedPreservedAtReady: seedPreserved,
        },
        mainFrameNavigations,
        pageErrors: flowErrors,
        instrumentationErrors: hub.errors,
      },
      marks: {
        commit: exists.commit,
        labelPlacement: exists.labelPlacement,
        strokeZoomVariable: exists.strokeZoom,
      },
      gestures: {
        pinch: {
          events: PINCH.events,
          ...pinchSummary,
          target: pinch.target,
          anchor: pinch.anchor,
          cameraBefore: pinchCamera,
          cameraAfter: pinchCameraAfter,
          zoomLabelBefore: pinch.zoomLabelBefore,
          zoomLabelAfter: pinch.zoomLabelAfter,
          zoomSamples: zoomPath.map((zoom) => round(zoom, 4)),
          strokeZoom: {
            writes: exists.strokeZoom ? pinchStrokeWrites.length : null,
            writesDuringGesture: exists.strokeZoom ? pinchStrokeGestureWrites.length : null,
            writesAfterIdle: exists.strokeZoom ? pinchStrokeWrites.length - pinchStrokeGestureWrites.length : null,
            valueChanges: exists.strokeZoom ? pinchStrokeValueChanges : null,
            bucketsCrossed,
            valueBefore: pinch.strokeZoomBefore,
            valueAfter: pinch.strokeZoomAfter,
          },
          settleAfter: measured.afterPinch,
        },
        pan: {
          events: PAN.events,
          ...wheelGestureSummary(hub, pan, exists),
          target: pan.target,
          anchor: pan.anchor,
          cameraBefore: panCamera,
          cameraAfter: panCameraAfter,
          zoomLabelBefore: pan.zoomLabelBefore,
          zoomLabelAfter: pan.zoomLabelAfter,
          settleAfter: measured.afterPan,
        },
        drag: dragResult,
      },
      snapshots: snapshotTimings,
      targets,
      labelPlacement: exists.labelPlacement
        ? {
            count: placements.length,
            durationsMs: placementDurations.map((value) => round(value, 3)),
            durationSummaryMs: summarize(placementDurations),
          }
        : null,
      traceFile: args.trace,
      diagnostics: {
        cdpMessages: cdp.stats.messages,
        cdpMegabytes: round(cdp.stats.bytes / 1048576, 1),
        largestCdpMessageChars: cdp.stats.largest,
        largestCdpMessage: cdp.stats.largestMethod,
      },
      notes,
    };
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await cleanup();
  }
}

function consistent(runs, pick) {
  const values = [...new Set(runs.map(pick).map((value) => JSON.stringify(value ?? null)))];
  return values.length === 1 ? JSON.parse(values[0]) : "mixed";
}

async function writeOutput(file, label, result) {
  let document = result;

  if (label) {
    let existing = null;
    try {
      existing = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      existing = null;
    }
    const now = new Date().toISOString();
    const runs = { ...(isRecord(existing?.runs) ? existing.runs : {}), [label]: result };
    const runList = Object.values(runs);
    document = {
      schema: "prototype-flow-canvas-bench-set/1",
      createdAt: isRecord(existing) && typeof existing.createdAt === "string" ? existing.createdAt : now,
      updatedAt: now,
      storybookMode: consistent(runList, (run) => run.environment?.storybookMode),
      headless: consistent(runList, (run) => run.environment?.headless),
      chromeVersion: consistent(runList, (run) => run.environment?.chromeVersion),
      machineModel: consistent(runList, (run) => run.environment?.machineModel),
      prototypeInspectorBuildTag: consistent(runList, (run) => run.environment?.prototypeInspectorBuildTag),
      runs,
    };
  }

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n\n${usage()}`);
    process.exit(2);
  }

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.url) {
    console.error(`--url is required.\n\n${usage()}`);
    process.exit(2);
  }

  try {
    new URL(args.url);
  } catch (error) {
    console.error(`--url is not a valid URL: ${args.url}`);
    process.exit(2);
  }

  // A closed DevTools socket or a dev-server reload after readiness is
  // retried once with a fresh Chrome; anything else fails the run.
  // A run whose UI Flow never became ready, or whose route iframes failed to
  // load, measures something else; it is retried the same way and never merged.
  let result = null;
  let firstError = null;
  for (let attempt = 1; attempt <= 2 && !result; attempt += 1) {
    try {
      const run = await runBench(args);
      run.attempts = attempt;
      const problems = invalidRunReasons(run);
      if (problems.length && attempt === 1) {
        firstError = new Error(problems.join("; "));
        process.stderr.write(`[flow-bench] attempt ${attempt} is not a valid run: ${firstError.message}\n[flow-bench] retrying once with a fresh Chrome\n`);
        continue;
      }
      result = run;
    } catch (error) {
      if (!error.transient || attempt === 2) throw error;
      firstError = error;
      process.stderr.write(`[flow-bench] attempt ${attempt} failed: ${error.message}\n[flow-bench] retrying once with a fresh Chrome\n`);
    }
  }
  if (firstError) result.notes.push(`attempt 1 failed and was retried: ${firstError.message}`);
  console.log(JSON.stringify(result, null, 2));
  const problems = invalidRunReasons(result);
  if (problems.length) {
    console.error(`[flow-bench] invalid run (${problems.join("; ")}); nothing was written to --out`);
    process.exit(1);
  }
  if (args.out) await writeOutput(args.out, args.label, result);
}

function invalidRunReasons(run) {
  const reasons = [];
  if (run?.uiFlow?.readyTimedOut) reasons.push("the UI Flow did not become ready");
  const iframeErrors = run?.uiFlow?.iframeErrors ?? 0;
  if (iframeErrors > 0) reasons.push(`${iframeErrors} route iframe(s) failed to load`);
  return reasons;
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
