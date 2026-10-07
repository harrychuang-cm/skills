#!/usr/bin/env node
// Checks the Prototype Inspector UI Flow canvas against figma-export review
// comments in system Chrome over CDP (Node built-in WebSocket, no packages).
// Run it against a Storybook started from create_flow_bench_fixture.mjs, which
// carries figma-export addon 0.14.0 or later:
//
//   node storybook-product-prototype/scripts/check_flow_canvas_comments.mjs \
//     --url "http://localhost:6006/iframe.html?id=pages-prototypes-example-prototype--default&viewMode=story" \
//     [--frame review] [--line "intake->review"] [--headed]
//
// The end-to-end case saves real comments through the fixture's review server
// (into the fixture's design-system/figma-export-review folder).
//
// The URL's globals are replaced: each case opens the story in the mode it
// needs. Exits non-zero when a case fails.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 1 };
const READY_TIMEOUT_MS = 120_000;
// Settled: no commit-driven move for this long.
const SETTLE_MS = 800;
const PAN = { events: 30, deltaX: 10, deltaY: 4 };
const DRAG = { moves: 20, stepX: 6, stepY: 3 };

function usage() {
  return [
    "Usage: node storybook-product-prototype/scripts/check_flow_canvas_comments.mjs --url <prototype story iframe URL> [--headed]",
    "",
    "  --url <url>   Storybook iframe URL of a prototype story (required); globals are set per case.",
    "  --frame <id>  Route commented on in the end-to-end case (default review).",
    "  --line <a->b> Key transition commented on in the end-to-end case (default intake->review).",
    "  --move-to <id> Route the frame comment's pin is dragged onto (default handoff).",
    "  --headed      Run Chrome with a window instead of --headless=new.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    frameAnchor: "route:review",
    headed: false,
    lineAnchor: "edge:intake->review",
    moveTargetAnchor: "route:handoff",
    url: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url") args.url = argv[++index];
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--frame") args.frameAnchor = `route:${argv[++index]}`;
    else if (arg === "--line") args.lineAnchor = `edge:${argv[++index]}`;
    else if (arg === "--move-to") args.moveTargetAnchor = `route:${argv[++index]}`;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// In-page helpers (serialized into the preview document)
// ---------------------------------------------------------------------------

function installCheckLibrary(config) {
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const root = () => document.querySelector(".prototype-inspector--flow");
  const viewport = () => document.querySelector(".prototype-inspector__flow-viewport");
  const world = () => document.querySelector(".prototype-inspector__flow-world");
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
  };
  const visibleArea = (element) => {
    const rect = element.getBoundingClientRect();
    const bounds = viewport().getBoundingClientRect();
    const width = Math.min(rect.right, bounds.right - 40) - Math.max(rect.left, bounds.left + 40);
    const height = Math.min(rect.bottom, bounds.bottom - 40) - Math.max(rect.top, bounds.top + 40);
    return width > 24 && height > 24 ? width * height : 0;
  };
  // The route frame preview that shows the most on screen.
  const mostVisiblePreview = () =>
    [...document.querySelectorAll('[data-sbfx-anchor^="route:"]')]
      .map((element) => ({ area: visibleArea(element), element }))
      .filter((entry) => entry.area > 0)
      .sort((first, second) => second.area - first.area)[0]?.element ?? null;
  const centerOfVisiblePart = (element) => {
    const rect = element.getBoundingClientRect();
    const bounds = viewport().getBoundingClientRect();
    const left = Math.max(rect.left, bounds.left + 40);
    const right = Math.min(rect.right, bounds.right - 40);
    const top = Math.max(rect.top, bounds.top + 40);
    const bottom = Math.min(rect.bottom, bounds.bottom - 40);
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
  };
  const pointer = (x, y, buttons) => ({
    bubbles: true,
    button: 0,
    buttons,
    cancelable: true,
    clientX: x,
    clientY: y,
    composed: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
    pressure: buttons ? 0.5 : 0,
    view: window,
  });

  // Samples the watched geometry at the start of every animation frame (the
  // probe's callback is registered a frame ahead, so it runs before any
  // callback the canvas schedules for that frame) and records what every
  // sbfx:anchors-moved listener call sees.
  const startProbe = (watch) => {
    const probe = { events: [], frame: 0, frames: [], running: true };
    const read = () => ({ ...rectOf(watch.anchor), transform: watch.transform() });
    const onMoved = () => {
      probe.events.push({ frame: probe.frame, ...read() });
    };
    document.addEventListener("sbfx:anchors-moved", onMoved);
    const tick = () => {
      if (!probe.running) return;
      probe.frame += 1;
      probe.frames.push({ frame: probe.frame, ...read() });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    probe.stop = () => {
      probe.running = false;
      document.removeEventListener("sbfx:anchors-moved", onMoved);
    };
    return probe;
  };
  // Every frame that changed the watched geometry delivered a notification,
  // and the last one in that frame saw the geometry that was painted.
  const analyzeProbe = (probe) => {
    const changed = [];
    const failures = [];
    for (let index = 0; index + 1 < probe.frames.length; index += 1) {
      const before = probe.frames[index];
      const after = probe.frames[index + 1];
      const moved =
        before.transform !== after.transform ||
        Math.abs(before.left - after.left) > 0.01 ||
        Math.abs(before.top - after.top) > 0.01;
      if (!moved) continue;
      changed.push(before.frame);
      const events = probe.events.filter((event) => event.frame === before.frame);
      const last = events[events.length - 1];
      if (!last) {
        failures.push(`frame ${before.frame}: geometry moved with no sbfx:anchors-moved`);
      } else if (Math.abs(last.left - after.left) > 0.5 || Math.abs(last.top - after.top) > 0.5) {
        failures.push(
          `frame ${before.frame}: listener saw (${last.left.toFixed(1)}, ${last.top.toFixed(1)}), painted (${after.left.toFixed(1)}, ${after.top.toFixed(1)})`,
        );
      }
    }
    return { changedFrames: changed.length, events: probe.events.length, failures, frames: probe.frames.length };
  };

  const viewportCenter = () => {
    const bounds = viewport().getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  };
  const cameraState = () => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(world()).transform);
    return { x: matrix.e, y: matrix.f, z: matrix.a };
  };
  // Client position of a world point under the current camera.
  const worldToClient = (point) => {
    const bounds = viewport().getBoundingClientRect();
    const camera = cameraState();
    return {
      x: bounds.left + world().offsetLeft + camera.x + point.x * camera.z,
      y: bounds.top + world().offsetTop + camera.y + point.y * camera.z,
    };
  };
  const fitButtonPressed = () =>
    document.querySelector('[aria-label="Fit canvas"]')?.getAttribute("aria-pressed");
  const revealRequest = (detail) => {
    const event = new CustomEvent("sbfx:reveal-anchor", { bubbles: true, cancelable: true, detail });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const settle = async () => {
    await nextFrame();
    await nextFrame();
  };

  const lib = {
    ready() {
      const flowRoot = root();
      if (!flowRoot) return { ready: false, reason: "no UI Flow root" };
      const frames = document.querySelectorAll(".prototype-inspector__flow-frame").length;
      return { frames, ready: frames > 0 && Boolean(world()) };
    },
    commitCount() {
      return performance.getEntriesByName("pi:flow:commit").length;
    },
    // Pans with wheel events while the probe watches the most visible frame.
    async panNotifications({ deltaX, deltaY, events }) {
      const anchor = mostVisiblePreview();
      if (!anchor) return { error: "no route frame on screen" };
      const probe = startProbe({ anchor, transform: () => world().style.transform });
      await nextFrame();
      await nextFrame();
      const point = centerOfVisiblePart(anchor);
      const target = document.elementFromPoint(point.x, point.y) ?? viewport();
      const commitsBefore = lib.commitCount();
      for (let index = 0; index < events; index += 1) {
        target.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: point.x,
            clientY: point.y,
            composed: true,
            deltaMode: 0,
            deltaX,
            deltaY,
            view: window,
          }),
        );
        await nextFrame();
      }
      const commitsDuringGesture = lib.commitCount() - commitsBefore;
      await wait(config.settleMs);
      probe.stop();
      return { anchor: anchor.dataset.sbfxAnchor, commitsDuringGesture, ...analyzeProbe(probe) };
    },
    // Drags the most visible frame while the probe watches its preview.
    async dragNotifications({ moves, stepX, stepY }) {
      const anchor = mostVisiblePreview();
      if (!anchor) return { error: "no route frame on screen" };
      const frame = anchor.closest(".prototype-inspector__flow-frame");
      const probe = startProbe({ anchor, transform: () => frame.style.transform });
      await nextFrame();
      await nextFrame();
      const start = centerOfVisiblePart(anchor);
      const target = document.elementFromPoint(start.x, start.y) ?? anchor;
      const commitsBefore = lib.commitCount();
      target.dispatchEvent(new PointerEvent("pointerdown", pointer(start.x, start.y, 1)));
      await nextFrame();
      for (let index = 1; index <= moves; index += 1) {
        target.dispatchEvent(
          new PointerEvent("pointermove", pointer(start.x + index * stepX, start.y + index * stepY, 1)),
        );
        await nextFrame();
      }
      const commitsDuringGesture = lib.commitCount() - commitsBefore;
      target.dispatchEvent(
        new PointerEvent("pointerup", pointer(start.x + moves * stepX, start.y + moves * stepY, 0)),
      );
      await wait(config.settleMs);
      probe.stop();
      return { anchor: anchor.dataset.sbfxAnchor, commitsDuringGesture, ...analyzeProbe(probe) };
    },
  };
  // Location requests: an element anchor fits its frame, a path anchor its
  // two end frames, a canvas anchor centres its point; other views are left.
  lib.revealRequests = async () => {
    const results = {};
    const center = viewportCenter();
    // The route frame farthest from the centre, so the camera has to move.
    const target = [...document.querySelectorAll('[data-sbfx-anchor^="route:"]')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { distance: Math.hypot(rect.left + rect.width / 2 - center.x, rect.top + rect.height / 2 - center.y), element };
      })
      .sort((first, second) => second.distance - first.distance)[0]?.element;
    if (!target) return { error: "no route frame anchor" };
    const before = cameraState();
    const prevented = revealRequest({
      anchor: { height: 10, id: target.dataset.sbfxAnchor, type: "element", width: 10, x: 1, y: 1 },
      commentId: "check-element",
      view: "ui-flow",
    });
    await settle();
    const rect = target.getBoundingClientRect();
    const bounds = viewport().getBoundingClientRect();
    results.element = {
      anchor: target.dataset.sbfxAnchor,
      centered:
        Math.abs(rect.left + rect.width / 2 - center.x) <= 1 && Math.abs(rect.top + rect.height / 2 - center.y) <= 1,
      fitPressed: fitButtonPressed(),
      inside:
        rect.left >= bounds.left - 0.5 &&
        rect.right <= bounds.right + 0.5 &&
        rect.top >= bounds.top - 0.5 &&
        rect.bottom <= bounds.bottom + 0.5,
      moved: Math.hypot(cameraState().x - before.x, cameraState().y - before.y) > 1,
      prevented,
      zoom: cameraState().z,
    };

    const storyBefore = cameraState();
    const storyPrevented = revealRequest({
      anchor: { height: 10, id: target.dataset.sbfxAnchor, type: "element", width: 10, x: 1, y: 1 },
      commentId: "check-story",
      view: "story",
    });
    await settle();
    const storyAfter = cameraState();
    results.story = {
      moved:
        Math.abs(storyAfter.x - storyBefore.x) > 0.01 ||
        Math.abs(storyAfter.y - storyBefore.y) > 0.01 ||
        Math.abs(storyAfter.z - storyBefore.z) > 0.0001,
      prevented: storyPrevented,
    };

    const line = document.querySelector('[data-sbfx-anchor^="edge:"]');
    if (line) {
      const [from, to] = line.dataset.sbfxAnchor.slice("edge:".length).split("->");
      const linePrevented = revealRequest({ anchor: { id: line.dataset.sbfxAnchor, t: 0.5, type: "path" }, commentId: "check-path", view: "ui-flow" });
      await settle();
      const ends = [from, to].map((id) => document.querySelector(`[data-sbfx-anchor="route:${CSS.escape(id)}"], [data-sbfx-anchor="node:${CSS.escape(id)}"]`));
      const bounds = viewport().getBoundingClientRect();
      results.path = {
        anchor: line.dataset.sbfxAnchor,
        endsVisible: ends.every((element) => {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          return rect.left >= bounds.left - 0.5 && rect.right <= bounds.right + 0.5 && rect.top >= bounds.top - 0.5 && rect.bottom <= bounds.bottom + 0.5;
        }),
        prevented: linePrevented,
      };
    }

    // A world point well away from the current centre.
    const camera = cameraState();
    const point = {
      x: Math.round((center.x - viewport().getBoundingClientRect().left - camera.x) / camera.z + 400),
      y: Math.round((center.y - viewport().getBoundingClientRect().top - camera.y) / camera.z + 250),
    };
    const zoomBefore = camera.z;
    const canvasPrevented = revealRequest({ anchor: { type: "canvas", x: point.x, y: point.y }, commentId: "check-canvas", view: "ui-flow" });
    await settle();
    const client = worldToClient(point);
    results.canvas = {
      offset: { x: client.x - center.x, y: client.y - center.y },
      prevented: canvasPrevented,
      zoomKept: Math.abs(cameraState().z - zoomBefore) < 0.0001,
    };
    return results;
  };
  // Drags the most visible frame and presses Escape halfway; `handled` makes
  // an earlier listener call preventDefault, as the comment composer does.
  lib.escapeDuringDrag = async ({ handled, moves, stepX, stepY }) => {
    const anchor = mostVisiblePreview();
    if (!anchor) return { error: "no route frame on screen" };
    const before = rectOf(anchor);
    const start = centerOfVisiblePart(anchor);
    const target = document.elementFromPoint(start.x, start.y) ?? anchor;
    target.dispatchEvent(new PointerEvent("pointerdown", pointer(start.x, start.y, 1)));
    await nextFrame();
    const half = Math.floor(moves / 2);
    for (let index = 1; index <= moves; index += 1) {
      target.dispatchEvent(new PointerEvent("pointermove", pointer(start.x + index * stepX, start.y + index * stepY, 1)));
      await nextFrame();
      if (index === half) {
        const markHandled = (event) => {
          if (event.key === "Escape") event.preventDefault();
        };
        if (handled) window.addEventListener("keydown", markHandled, true);
        document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Escape", key: "Escape" }));
        window.removeEventListener("keydown", markHandled, true);
        await nextFrame();
      }
    }
    target.dispatchEvent(new PointerEvent("pointerup", pointer(start.x + moves * stepX, start.y + moves * stepY, 0)));
    await wait(config.settleMs);
    const after = rectOf(anchor.isConnected ? anchor : document.querySelector(`[data-sbfx-anchor="${CSS.escape(anchor.dataset.sbfxAnchor)}"]`));
    return {
      anchor: anchor.dataset.sbfxAnchor,
      delta: { x: after.left - before.left, y: after.top - before.top },
      expected: { x: moves * stepX, y: moves * stepY },
    };
  };
  // Frame iframes under a rule that lets them take pointer events (as a frame
  // interaction mode would), with and without comment capture mode.
  lib.capturePointerEvents = () => {
    const iframe = document.querySelector(".prototype-inspector__flow-frame-preview iframe");
    if (!iframe) return { error: "no frame iframe" };
    const style = document.createElement("style");
    style.textContent = ".prototype-inspector__flow-frame-preview iframe { pointer-events: auto; }";
    document.head.append(style);
    const interacting = getComputedStyle(iframe).pointerEvents;
    document.documentElement.dataset.sbfxCaptureMode = "true";
    const capturing = getComputedStyle(iframe).pointerEvents;
    delete document.documentElement.dataset.sbfxCaptureMode;
    const afterCapture = getComputedStyle(iframe).pointerEvents;
    style.remove();
    return { afterCapture, capturing, interacting };
  };
  // ----- figma-export review panel (end to end) -----
  const waitFor = async (test, timeoutMs = 20_000, label = "condition") => {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      const value = test();
      if (value) return value;
      await wait(50);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const button = (label) =>
    [...document.querySelectorAll("button")].find(
      (element) => element.getAttribute("aria-label") === label || element.textContent.trim() === label,
    );
  const setNativeValue = (element, value) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const clickAt = (x, y, { double = false } = {}) => {
    const target = document.elementFromPoint(x, y);
    const sequence = () => {
      target.dispatchEvent(new PointerEvent("pointerdown", pointer(x, y, 1)));
      target.dispatchEvent(new PointerEvent("pointerup", pointer(x, y, 0)));
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1, view: window }));
    };
    sequence();
    if (double) {
      sequence();
      target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 2, view: window }));
    }
    return target;
  };
  // Every comment the panel saves: request body and the stored comment id.
  lib.recordComments = () => {
    if (window.__piSavedComments) return;
    const saved = [];
    window.__piSavedComments = saved;
    const originalFetch = window.fetch.bind(window);
    const patches = [];
    window.__piCommentPatches = patches;
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      try {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST" && body?.clientRequestId) {
          const json = await response.clone().json();
          saved.push({ body, id: json?.comment?.id ?? null, status: response.status });
        } else if (method === "PATCH" && body) {
          const json = await response.clone().json();
          patches.push({ body, comment: json?.comment ?? null, status: response.status });
        }
      } catch (error) {
        // Not a comment request.
      }
      return response;
    };
  };
  lib.openComments = async () => {
    await waitFor(() => button("Open comments") || button("Close comments"), 30_000, "the comments launcher");
    if (button("Open comments")) button("Open comments").click();
    await waitFor(() => document.querySelector(".sbfx-comments-panel__detail:not([hidden])"), 10_000, "the comments panel");
    await waitFor(() => document.querySelector('[data-comments-capability="available"]'), 10_000, "comments to be available");
  };
  // Places a comment at a client point and saves it; returns what was saved.
  lib.placeComment = async ({ text, x, y }) => {
    const before = window.__piSavedComments.length;
    document.querySelector(".sbfx-comments-panel__add").click();
    await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true", 5_000, "capture mode");
    clickAt(x, y);
    const textarea = await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 30_000, "the comment composer");
    setNativeValue(textarea, text);
    await nextFrame();
    button("Save comment").click();
    await waitFor(() => window.__piSavedComments.length > before, 20_000, "the saved comment");
    await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"), 10_000, "the composer to close");
    return window.__piSavedComments[window.__piSavedComments.length - 1];
  };
  lib.pointOnFrame = (anchorId) => {
    const element = document.querySelector(`[data-sbfx-anchor="${CSS.escape(anchorId)}"]`);
    return element ? centerOfVisiblePart(element) : null;
  };
  // The client point halfway along a line anchor.
  lib.pointOnLine = (anchorId) => {
    const line = document.querySelector(`[data-sbfx-anchor="${CSS.escape(anchorId)}"]`);
    if (!line) return null;
    const point = line.getPointAtLength(line.getTotalLength() / 2);
    const client = new DOMPoint(point.x, point.y).matrixTransform(line.getScreenCTM());
    return { x: client.x, y: client.y };
  };
  // A blank canvas point: on the viewport or world layer, at least 30 px from
  // every line, outside frames, nodes, labels, controls and the addon chrome.
  lib.pointOnBlankCanvas = () => {
    const bounds = viewport().getBoundingClientRect();
    const segments = [...document.querySelectorAll('[data-sbfx-anchor-kind="path"]')].flatMap((line) => {
      const matrix = line.getScreenCTM();
      const points = [...line.points].map((point) => new DOMPoint(point.x, point.y).matrixTransform(matrix));
      return points.slice(1).map((point, index) => [points[index], point]);
    });
    const distanceToSegment = (x, y, [a, b]) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
      return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    };
    for (let y = bounds.top + 80; y < bounds.bottom - 80; y += 20) {
      for (let x = bounds.left + 80; x < bounds.right - 80; x += 20) {
        const hit = document.elementFromPoint(x, y);
        const onCanvas = hit === viewport() || hit === world() || hit?.closest(".prototype-inspector__flow-lines");
        if (!onCanvas || hit.closest("[data-sbfx-anchor]:not([data-sbfx-anchor-kind])")) continue;
        if (segments.every((segment) => distanceToSegment(x, y, segment) > 30)) return { x, y };
      }
    }
    return null;
  };
  // Double-clicks a frame in capture mode: one pending pin, no dblclick on
  // the page; the composer is then cancelled.
  lib.doubleClickInCapture = async (anchorId) => {
    const point = lib.pointOnFrame(anchorId);
    if (!point) return { error: `no ${anchorId}` };
    let pageDoubleClicks = 0;
    const countDoubleClick = () => {
      pageDoubleClicks += 1;
    };
    root().addEventListener("dblclick", countDoubleClick);
    document.querySelector(".sbfx-comments-panel__add").click();
    await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true", 5_000, "capture mode");
    clickAt(point.x, point.y, { double: true });
    await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 30_000, "the comment composer");
    await wait(600);
    const pendingPins = document.querySelectorAll("[data-pending-comment-pin]").length;
    const composers = document.querySelectorAll(".sbfx-comment-composer textarea").length;
    root().removeEventListener("dblclick", countDoubleClick);
    button("Cancel")?.click();
    await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"), 10_000, "the composer to close");
    return { composers, pageDoubleClicks, pendingPins };
  };
  // Drags a frame while sampling its saved pin's offset from the frame's
  // visible rect at the start of every animation frame.
  lib.pinFollowsDrag = async ({ anchorId, commentId, moves, stepX, stepY }) => {
    const preview = document.querySelector(`[data-sbfx-anchor="${CSS.escape(anchorId)}"]`);
    const pin = () => document.querySelector(`[data-saved-comment-pin="${CSS.escape(commentId)}"]`);
    if (!preview || !pin()) return { error: `no ${preview ? "saved pin" : anchorId}` };
    const offset = () => {
      const pinRect = pin().getBoundingClientRect();
      const frameRect = preview.getBoundingClientRect();
      return { x: pinRect.left + pinRect.width / 2 - frameRect.left, y: pinRect.top + pinRect.height / 2 - frameRect.top };
    };
    const start = offset();
    const samples = [];
    let sampling = true;
    const tick = () => {
      if (!sampling) return;
      samples.push(offset());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Press the visible rect away from the pin.
    const rect = preview.getBoundingClientRect();
    const pinRect = pin().getBoundingClientRect();
    const x = pinRect.left - rect.left > rect.width / 2 ? rect.left + rect.width * 0.25 : rect.left + rect.width * 0.75;
    const y = rect.top + Math.min(rect.height / 2, 200);
    const target = document.elementFromPoint(x, y);
    target.dispatchEvent(new PointerEvent("pointerdown", pointer(x, y, 1)));
    await nextFrame();
    for (let index = 1; index <= moves; index += 1) {
      target.dispatchEvent(new PointerEvent("pointermove", pointer(x + index * stepX, y + index * stepY, 1)));
      await nextFrame();
    }
    target.dispatchEvent(new PointerEvent("pointerup", pointer(x + moves * stepX, y + moves * stepY, 0)));
    await wait(config.settleMs);
    sampling = false;
    const end = offset();
    const worst = samples.reduce((max, sample) => Math.max(max, Math.abs(sample.x - start.x), Math.abs(sample.y - start.y)), 0);
    const moved = Math.hypot(preview.getBoundingClientRect().left - rect.left, preview.getBoundingClientRect().top - rect.top);
    return { end, frameMovedPx: moved, samples: samples.length, start, worstOffsetDriftPx: worst };
  };
  // Drags a saved pin onto another frame's visible rect and waits for the save.
  lib.dragPinOntoFrame = async ({ anchorId, commentId }) => {
    const pin = document.querySelector(`[data-saved-comment-pin="${CSS.escape(commentId)}"]`);
    const frame = document.querySelector(`[data-sbfx-anchor="${CSS.escape(anchorId)}"]`);
    if (!pin || !frame) return { error: `no ${pin ? anchorId : "saved pin"}` };
    const before = window.__piCommentPatches.length;
    const startRect = pin.getBoundingClientRect();
    const start = { x: startRect.left + startRect.width / 2, y: startRect.top + startRect.height / 2 };
    const end = centerOfVisiblePart(frame);
    pin.dispatchEvent(new PointerEvent("pointerdown", pointer(start.x, start.y, 1)));
    for (let step = 1; step <= 8; step += 1) {
      const x = start.x + ((end.x - start.x) * step) / 8;
      const y = start.y + ((end.y - start.y) * step) / 8;
      pin.dispatchEvent(new PointerEvent("pointermove", pointer(x, y, 1)));
      await nextFrame();
    }
    pin.dispatchEvent(new PointerEvent("pointerup", pointer(end.x, end.y, 0)));
    pin.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: end.x, clientY: end.y, view: window }));
    await waitFor(() => window.__piCommentPatches.length > before, 10_000, "the move request");
    await waitFor(() => !pin.hasAttribute("data-saving"), 10_000, "the move to settle");
    await wait(config.settleMs);
    const pinRect = pin.getBoundingClientRect();
    return {
      patch: window.__piCommentPatches.at(-1),
      pinOffFromRelease: Math.hypot(pinRect.left + pinRect.width / 2 - end.x, pinRect.top + pinRect.height / 2 - end.y),
    };
  };
  // Opens Edit on a listed comment; reports which editor opened and where.
  lib.editComment = async (commentId) => {
    const editButton = document.querySelector(
      `.sbfx-comments-panel [data-comment-id="${CSS.escape(commentId)}"] button[aria-label="Edit comment"]`,
    );
    if (!editButton) return { error: "no Edit button" };
    editButton.click();
    await waitFor(
      () => document.querySelector("[data-comment-edit-panel], [data-comment-edit-modal]"),
      10_000,
      "an editor",
    );
    await nextFrame();
    const panel = document.querySelector("[data-comment-edit-panel]");
    const pin = document.querySelector(`[data-saved-comment-pin="${CSS.escape(commentId)}"]`);
    const panelRect = panel?.getBoundingClientRect();
    const pinRect = pin?.getBoundingClientRect();
    const pinX = pinRect ? pinRect.left + pinRect.width / 2 : null;
    const result = {
      beside:
        Boolean(panelRect && pinX !== null) &&
        (Math.abs(panelRect.left - (pinX + 24)) <= 1 || Math.abs(panelRect.right - (pinX - 24)) <= 1),
      modal: Boolean(document.querySelector("[data-comment-edit-modal]")),
      panel: panel?.dataset.commentEditPanel ?? null,
    };
    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    await waitFor(() => !document.querySelector("[data-comment-edit-panel], [data-comment-edit-modal]"), 5_000, "the editor to close");
    return result;
  };
  // Clicks a saved pin; reports the edit panel it opens and its screenshot.
  lib.clickPinToEdit = async (commentId) => {
    const pin = document.querySelector(`[data-saved-comment-pin="${CSS.escape(commentId)}"]`);
    if (!pin) return { error: "no saved pin" };
    const pinRect = pin.getBoundingClientRect();
    const x = pinRect.left + pinRect.width / 2;
    const y = pinRect.top + pinRect.height / 2;
    pin.focus();
    pin.dispatchEvent(new PointerEvent("pointerdown", pointer(x, y, 1)));
    pin.dispatchEvent(new PointerEvent("pointerup", pointer(x, y, 0)));
    pin.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));
    await waitFor(() => document.querySelector(`[data-comment-edit-panel="${CSS.escape(commentId)}"]`), 10_000, "the edit panel");
    const panel = document.querySelector(`[data-comment-edit-panel="${CSS.escape(commentId)}"]`);
    const image = panel.querySelector("[data-comment-edit-panel-preview] img");
    await waitFor(() => image?.complete, 5_000, "the screenshot").catch(() => undefined);
    await waitFor(() => document.activeElement === panel.querySelector("textarea"), 3_000, "the body focus").catch(() => undefined);
    const panelRect = panel.getBoundingClientRect();
    const result = {
      beside: Math.abs(panelRect.left - (x + 24)) <= 1 || Math.abs(panelRect.right - (x - 24)) <= 1,
      bodyFocused: document.activeElement === panel.querySelector("textarea"),
      modal: Boolean(document.querySelector("[data-comment-edit-modal]")),
      screenshotLoaded: Boolean(image && image.naturalWidth > 0),
    };
    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    await waitFor(() => !document.querySelector("[data-comment-edit-panel]"), 5_000, "the panel to close");
    return result;
  };
  // Turns on the View switch of the meeting that holds this Story's comments.
  lib.viewMeeting = async () => {
    const toggle = await waitFor(
      () => document.querySelector('[data-meeting-active="true"] [data-meeting-view]') ?? document.querySelector("[data-meeting-view]"),
      20_000,
      "a meeting View switch",
    );
    if (toggle.getAttribute("aria-checked") !== "true") toggle.click();
    await waitFor(() => toggle.getAttribute("aria-checked") === "true", 5_000, "the meeting to be viewed");
    await wait(300);
  };
  lib.listedComments = () =>
    [...document.querySelectorAll(".sbfx-comments-panel__list [data-comment-id]")].map((item) => item.dataset.commentId);
  lib.viewOption = (view) => document.querySelector(`[data-comment-view-option="${CSS.escape(view)}"]`)?.textContent ?? null;
  lib.exportNotice = async () => {
    const notice = await waitFor(
      () => {
        const element = document.querySelector(".sbfx-exporter__unavailable");
        return element && !element.hidden ? element : null;
      },
      10_000,
      "the export notice",
    );
    const link = notice.querySelector(".sbfx-exporter__unavailable-link");
    return {
      actionsHidden: document.querySelector(".sbfx-exporter__actions")?.hidden ?? null,
      href: link && !link.hidden ? link.href : null,
      text: notice.textContent,
    };
  };
  lib.storyPoint = () => {
    const story = document.querySelector("#storybook-root");
    const rect = story.getBoundingClientRect();
    return { x: rect.left + Math.min(rect.width / 2, 200), y: rect.top + Math.min(rect.height / 2, 200) };
  };
  Object.defineProperty(window, "__piCommentsCheck", { configurable: true, value: lib });
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
  ]
    .filter(Boolean)
    .find(existsSync);
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

async function openPage(cdp) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { flatten: true, targetId });
  const page = {
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
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, mobile: false });
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Page.bringToFront");
  return page;
}

async function openFlow(page, url) {
  const response = await page.send("Page.navigate", { url });
  if (response.errorText) throw new Error(`Navigation to ${url} failed: ${response.errorText}`);
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    const ready = await page
      .evaluate(
        `(() => { const flow = document.querySelector(".prototype-inspector--flow"); const frames = document.querySelectorAll(".prototype-inspector__flow-frame").length; return Boolean(flow) && frames > 0; })()`,
        10_000,
      )
      .catch(() => false);
    if (ready) break;
    await sleep(200);
  }
  await page.evaluate(`(${installCheckLibrary.toString()})(${JSON.stringify({ settleMs: SETTLE_MS })})`);
  const state = await page.evaluate("window.__piCommentsCheck.ready()");
  if (!state?.ready) throw new Error(`UI Flow did not render: ${JSON.stringify(state)}`);
  // Route previews load and resize their frames; let those commits finish.
  await sleep(2_000);
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const results = [];
function check(name, passed, detail) {
  results.push({ detail, name, passed: Boolean(passed) });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function caseAnchorNotifications(page, args) {
  await openFlow(page, withGlobals(args.url, { prototypeMode: "flow" }));
  const pan = await page.evaluate(`window.__piCommentsCheck.panNotifications(${JSON.stringify(PAN)})`);
  check(
    "pan: every frame that moves a frame notifies sbfx:anchors-moved with the painted position",
    !pan.error && pan.changedFrames >= 10 && pan.failures.length === 0,
    pan.error ?? `${pan.changedFrames} moving frames, ${pan.events} events${pan.failures.length ? `; ${pan.failures.slice(0, 3).join("; ")}` : ""}`,
  );
  check(
    "pan: notifications add no React commit during the gesture",
    !pan.error && pan.commitsDuringGesture === 0,
    pan.error ?? `${pan.commitsDuringGesture} pi:flow:commit marks`,
  );
  const drag = await page.evaluate(`window.__piCommentsCheck.dragNotifications(${JSON.stringify(DRAG)})`);
  check(
    "drag: every frame that moves the dragged frame notifies sbfx:anchors-moved with the painted position",
    !drag.error && drag.changedFrames >= DRAG.moves / 2 && drag.failures.length === 0,
    drag.error ?? `${drag.changedFrames} moving frames, ${drag.events} events${drag.failures.length ? `; ${drag.failures.slice(0, 3).join("; ")}` : ""}`,
  );
  check(
    "drag: notifications add no React commit while dragging",
    !drag.error && drag.commitsDuringGesture === 0,
    drag.error ?? `${drag.commitsDuringGesture} pi:flow:commit marks`,
  );
}

async function caseLocationRequests(page, args) {
  await openFlow(page, withGlobals(args.url, { prototypeMode: "flow" }));
  const reveal = await page.evaluate("window.__piCommentsCheck.revealRequests()");
  if (reveal.error) {
    check("location requests", false, reveal.error);
    return;
  }
  const { canvas, element, path: line, story } = reveal;
  check(
    "reveal: an element anchor request fits that frame, ends fit tracking and is handled",
    element.prevented && element.moved && element.centered && element.inside && element.zoom <= 1 && element.fitPressed === "false",
    JSON.stringify(element),
  );
  check(
    "reveal: a request for the story view leaves the camera and the event alone",
    !story.prevented && !story.moved,
    JSON.stringify(story),
  );
  if (line) {
    check("reveal: a path anchor request shows both end frames", line.prevented && line.endsVisible, JSON.stringify(line));
  }
  check(
    "reveal: a canvas anchor request centres its world point at the current zoom",
    canvas.prevented && Math.abs(canvas.offset.x) <= 1 && Math.abs(canvas.offset.y) <= 1 && canvas.zoomKept,
    JSON.stringify(canvas),
  );
}

async function caseKeysAndCapture(page, args) {
  await openFlow(page, withGlobals(args.url, { prototypeMode: "flow" }));
  const handled = await page.evaluate(`window.__piCommentsCheck.escapeDuringDrag(${JSON.stringify({ ...DRAG, handled: true })})`);
  check(
    "keys: an Escape another listener handled does not cancel a frame drag",
    !handled.error && Math.abs(handled.delta.x - handled.expected.x) <= 1 && Math.abs(handled.delta.y - handled.expected.y) <= 1,
    handled.error ?? JSON.stringify(handled),
  );
  const unhandled = await page.evaluate(`window.__piCommentsCheck.escapeDuringDrag(${JSON.stringify({ ...DRAG, handled: false })})`);
  check(
    "keys: an unhandled Escape still cancels the frame drag (control)",
    !unhandled.error && Math.abs(unhandled.delta.x) <= 1 && Math.abs(unhandled.delta.y) <= 1,
    unhandled.error ?? JSON.stringify(unhandled),
  );
  const pointerEvents = await page.evaluate("window.__piCommentsCheck.capturePointerEvents()");
  check(
    "capture: frame iframes take no pointer events while comment capture mode is on",
    !pointerEvents.error && pointerEvents.interacting === "auto" && pointerEvents.capturing === "none" && pointerEvents.afterCapture === "auto",
    pointerEvents.error ?? JSON.stringify(pointerEvents),
  );
}

// The figma-export dock floats over the UI Flow canvas: the canvas keeps the
// full preview size, and the layout group stays clear of the expanded dock,
// beside it (wrapping when the width runs out) or above it below 720 pixels.
async function caseWorkspaceOverCanvas(page, args) {
  const measure = `(() => {
    const rect = (element) => (element ? element.getBoundingClientRect().toJSON() : null);
    const workspace = document.querySelector(".sbfx-workspace");
    return {
      collapsed: workspace?.getAttribute("data-export-collapsed") ?? null,
      layout: rect(document.querySelector(".prototype-inspector__flow-controls--layout")),
      open: document.documentElement.dataset.sbfxWorkspaceOpen ?? null,
      orientation: document.documentElement.dataset.sbfxWorkspaceOrientation ?? null,
      viewport: rect(document.querySelector(".prototype-inspector__flow-viewport")),
      window: { height: window.innerHeight, width: window.innerWidth },
      workspace: rect(workspace),
    };
  })()`;
  const resize = async (size) => {
    await page.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, ...size, mobile: false });
    await sleep(800);
    return page.evaluate(measure);
  };
  try {
    await openFlow(page, withGlobals(args.url, { figmaExport: "on", prototypeMode: "flow" }));
    // A previous run can leave the export panel collapsed; the check needs it expanded.
    await page.evaluate(`(async () => {
      const workspace = document.querySelector(".sbfx-workspace");
      if (workspace?.getAttribute("data-export-collapsed") === "true") {
        workspace.querySelector(".sbfx-exporter__toggle")?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    })()`);
    const wide = await page.evaluate(measure);
    const expanded = (state) => state.open === "true" && state.collapsed !== "true" && Boolean(state.workspace && state.layout && state.viewport);
    check(
      "workspace: the expanded export dock floats over the UI Flow canvas, which keeps the full preview width",
      expanded(wide) &&
        wide.orientation === "side" &&
        Math.abs(wide.viewport.width - wide.window.width) <= 1 &&
        wide.layout.right <= wide.workspace.left + 0.5,
      JSON.stringify(wide),
    );
    const medium = await resize({ height: 1000, width: 800 });
    check(
      "workspace: at 800 pixels the layout group wraps clear of the side dock",
      expanded(medium) &&
        medium.orientation === "side" &&
        Math.abs(medium.viewport.width - medium.window.width) <= 1 &&
        medium.layout.right <= medium.workspace.left + 0.5,
      JSON.stringify(medium),
    );
    const narrow = await resize({ height: 800, width: 640 });
    check(
      "workspace: at 640 pixels the canvas keeps the full height and the layout group sits above the bottom dock",
      expanded(narrow) &&
        narrow.orientation === "bottom" &&
        Math.abs(narrow.viewport.height - narrow.window.height) <= 1 &&
        narrow.layout.bottom <= narrow.workspace.top + 0.5,
      JSON.stringify(narrow),
    );
  } finally {
    await page.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, mobile: false });
  }
}

// Opens the story in a mode with figma-export on, with the panel recording
// saved comments. Story mode has no UI Flow root, so it waits for the story.
async function openReview(page, args, prototypeMode) {
  const url = withGlobals(args.url, { figmaExport: "on", prototypeMode });
  if (prototypeMode === "flow") {
    await openFlow(page, url);
  } else {
    const response = await page.send("Page.navigate", { url });
    if (response.errorText) throw new Error(`Navigation to ${url} failed: ${response.errorText}`);
    await sleep(4_000);
    await page.evaluate(`(${installCheckLibrary.toString()})(${JSON.stringify({ settleMs: SETTLE_MS })})`);
  }
  await page.evaluate("window.__piCommentsCheck.recordComments()");
  await page.evaluate("window.__piCommentsCheck.openComments()");
}

async function caseCommentsEndToEnd(page, args) {
  const lib = (call) => page.evaluate(`window.__piCommentsCheck.${call}`);
  const stamp = new Date().toISOString();
  await openReview(page, args, "flow");

  const notice = await lib("exportNotice()");
  const href = notice.href ? new URL(notice.href) : null;
  check(
    "export: UI Flow shows the Static Flow notice and link instead of the export actions",
    notice.text.includes("Open Static Flow to export this flow.") && notice.actionsHidden === true && href?.searchParams.get("path")?.startsWith("/story/") && href.searchParams.get("path").endsWith("--static-flow"),
    JSON.stringify(notice),
  );

  const firstRoute = await lib(`pointOnFrame(${JSON.stringify(args.frameAnchor)})`);
  if (!firstRoute) throw new Error(`No ${args.frameAnchor} frame on screen`);
  const frame = await lib(`placeComment(${JSON.stringify({ text: `Frame comment ${stamp}`, ...firstRoute })})`);
  check(
    "comment: a comment on a frame is anchored to that route in the ui-flow view",
    frame.body.anchor?.type === "element" && frame.body.anchor.id === args.frameAnchor && frame.body.story.view === "ui-flow" && frame.status < 300,
    JSON.stringify({ anchor: frame.body.anchor, view: frame.body.story.view, status: frame.status }),
  );
  const linePoint = await lib(`pointOnLine(${JSON.stringify(args.lineAnchor)})`);
  if (!linePoint) throw new Error(`No ${args.lineAnchor} line`);
  const line = await lib(`placeComment(${JSON.stringify({ text: `Line comment ${stamp}`, ...linePoint })})`);
  check(
    "comment: a comment on a transition line is anchored along that line",
    line.body.anchor?.type === "path" && line.body.anchor.id === args.lineAnchor && line.body.story.view === "ui-flow",
    JSON.stringify({ anchor: line.body.anchor, view: line.body.story.view }),
  );
  const blankPoint = await lib("pointOnBlankCanvas()");
  if (!blankPoint) throw new Error("No blank canvas point on screen");
  const blank = await lib(`placeComment(${JSON.stringify({ text: `Canvas comment ${stamp}`, ...blankPoint })})`);
  check(
    "comment: a comment on blank canvas stores a canvas point",
    blank.body.anchor?.type === "canvas" && Number.isFinite(blank.body.anchor.x) && Number.isFinite(blank.body.anchor.y) && blank.body.story.view === "ui-flow",
    JSON.stringify({ anchor: blank.body.anchor, view: blank.body.story.view }),
  );

  const doubleClick = await lib(`doubleClickInCapture(${JSON.stringify(args.frameAnchor)})`);
  check(
    "capture: double-clicking a frame places one pin and the page gets no dblclick",
    !doubleClick.error && doubleClick.pendingPins === 1 && doubleClick.composers === 1 && doubleClick.pageDoubleClicks === 0,
    JSON.stringify(doubleClick),
  );

  const follow = await lib(`pinFollowsDrag(${JSON.stringify({ anchorId: args.frameAnchor, commentId: frame.id, ...DRAG })})`);
  check(
    "pins: a frame comment's pin follows the frame while it is dragged",
    !follow.error && follow.frameMovedPx > 20 && follow.worstOffsetDriftPx <= 1,
    JSON.stringify(follow),
  );
  const edit = await lib(`editComment(${JSON.stringify(frame.id)})`);
  check(
    "edit: Edit on a frame comment opens the edit panel beside its pin, not the centered modal",
    !edit.error && edit.panel === frame.id && edit.beside && !edit.modal,
    JSON.stringify(edit),
  );
  const moved = await lib(`dragPinOntoFrame(${JSON.stringify({ anchorId: args.moveTargetAnchor, commentId: frame.id })})`);
  check(
    "pins: dragging a frame comment's pin onto another frame re-anchors it there and marks it moved",
    !moved.error &&
      moved.patch?.status === 200 &&
      moved.patch.body.anchor?.id === args.moveTargetAnchor &&
      moved.patch.comment?.anchor?.id === args.moveTargetAnchor &&
      typeof moved.patch.comment?.movedAt === "string" &&
      moved.pinOffFromRelease <= 2,
    JSON.stringify(moved),
  );
  const clicked = await lib(`clickPinToEdit(${JSON.stringify(frame.id)})`);
  check(
    "edit: clicking a frame comment's pin opens the edit panel beside it with the screenshot and the body focused",
    !clicked.error && clicked.beside && clicked.screenshotLoaded && clicked.bodyFocused && !clicked.modal,
    JSON.stringify(clicked),
  );
  const flowIds = [frame.id, line.id, blank.id];

  await openReview(page, args, "story");
  await lib("viewMeeting()");
  const storyListed = await lib("listedComments()");
  const flowOption = await lib('viewOption("ui-flow")');
  check(
    "views: the Story view's list leaves out the UI Flow comments",
    flowIds.every((id) => !storyListed.includes(id)) && /^ui-flow · \d+$/.test(flowOption ?? ""),
    JSON.stringify({ flowOption, storyListed }),
  );
  const storyPoint = await lib("storyPoint()");
  const story = await lib(`placeComment(${JSON.stringify({ text: `Story comment ${stamp}`, ...storyPoint })})`);
  check("views: a Story comment records no view (story)", story.body.story.view === undefined, JSON.stringify(story.body.story));

  await openReview(page, args, "flow");
  await lib("viewMeeting()");
  const flowListed = await lib("listedComments()");
  check(
    "views: the UI Flow list shows its comments and leaves out the Story comment",
    flowIds.every((id) => flowListed.includes(id)) && !flowListed.includes(story.id),
    JSON.stringify({ flowIds, flowListed, storyId: story.id }),
  );
}

const cases = [caseAnchorNotifications, caseLocationRequests, caseKeysAndCapture, caseWorkspaceOverCanvas, caseCommentsEndToEnd];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chrome = findChrome();
  if (!chrome) throw new Error("No Chrome/Chromium binary found. Set CHROME_PATH.");
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "flow-comments-check-"));
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
  console.log(`${failed.length === 0 ? "PASS" : "FAIL"} ${results.length - failed.length}/${results.length} UI Flow comment checks`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
