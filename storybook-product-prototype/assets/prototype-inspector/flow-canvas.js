// The Prototype Inspector UI Flow canvas: the PrototypeFlow component, its
// route and flow-node frames, layout persistence and the Storybook links the
// canvas opens. Pure geometry lives in flow-canvas-geometry.js; preview.js
// mounts PrototypeFlow and reuses the exported viewport and link helpers.
import {
  createElement,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { UPDATE_GLOBALS } from "storybook/internal/core-events";
import { addons } from "storybook/preview-api";

import {
  createPrototypeFlowLayoutPayload,
  getPrototypeFlowLayoutStorageKey,
  getPrototypeFlowLayoutViewportSignature,
  normalizePrototypeFlowLayoutPositions,
  readPrototypeFlowLayoutPositions,
  writePrototypeFlowLayoutPositions,
} from "../../src/pages/prototypes/prototypeFlowLayout";
import {
  acceptMeasuredSize,
  addFlowEdgeColorVariants,
  aggregateTransitions,
  applyWheelZoom,
  classifyPointerDown,
  classifyWheel,
  createPolyline,
  defaultNodeHeight,
  defaultPrototypeModeGlobalName,
  DRAG_THRESHOLD_PX,
  fitCamera,
  getEdgeLabelPrefix,
  getFallbackGridPitch,
  getFlowArrowPoints,
  getFlowBounds,
  getFlowMetadataNodeSize,
  getFrameVisibleRect,
  getNodeWidth,
  getPrototypeFlowExportStoryId,
  getRouteBottom,
  getRoutePosition,
  getVisibleWorldRect,
  getZoomBucket,
  isRecord,
  isVisibleFlowEdge,
  LOD_THRESHOLDS,
  MAX_ZOOM,
  MIN_ZOOM,
  nodeFrameSize,
  nodeHeaderHeight,
  normalizeComponentRoutes,
  normalizeFlowNodes,
  normalizeRouteComponents,
  normalizeRoutes,
  normalizeStorybookGlobals,
  normalizeTransitions,
  placeEdgeLabels,
  resolveCanvasShortcut,
  resolvePrototypeViewport,
  selectFrameTiers,
  stepZoom,
  zoomAtPoint,
} from "./flow-canvas-geometry.js";
import { getCodeUpdateCount, subscribeToCodeUpdates } from "./flow-canvas-hmr.js";
import { captureFrameSnapshot, SNAPSHOT_FORMAT_VERSION } from "./flow-snapshot.js";
import { createIndexedDbAdapter, createSnapshotCache, getSnapshotKey } from "./flow-snapshot-cache.js";

const routePreviewMeasurementSelector = '[data-prototype-route-preview="true"]';

const canvasPadding = 96;





function isEditableEventTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, button, [contenteditable='true']"),
  );
}



function getFlowLayoutStorageKey(prototype) {
  return getPrototypeFlowLayoutStorageKey(prototype.id);
}

function sanitizeFilename(value) {
  return String(value ?? "prototype")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "prototype";
}

function readStoredFlowLayoutPositions(storageKey, nodeIds, expectedViewport) {
  return readPrototypeFlowLayoutPositions(storageKey, nodeIds, expectedViewport);
}

function writeStoredFlowLayout(
  storageKey,
  prototype,
  positions,
  nodeIds,
  viewportSignature,
) {
  writePrototypeFlowLayoutPositions(
    storageKey,
    prototype.id,
    positions,
    nodeIds,
    viewportSignature,
  );
}

function getFlowLayoutPositions(routePositionMap) {
  const positions = {};

  routePositionMap.forEach((position, routeId) => {
    positions[routeId] = {
      x: Math.round(position.x),
      y: Math.round(position.y),
    };
  });

  return positions;
}

function getDefaultPreviewDimension(cssVariableName, fallbackValue) {
  if (typeof document === "undefined") {
    return fallbackValue;
  }

  // The documented token bridge (--sbt-* → --pi-* → --prototype-inspector-*)
  // lives on the .prototype-inspector scope; read it first so the bridge
  // actually reaches iframe sizing, then fall back to :root for installs
  // that set the variables on documentElement directly.
  const elements = [
    document.querySelector(".prototype-inspector"),
    document.documentElement,
  ];

  for (const element of elements) {
    if (!element) {
      continue;
    }

    const tokenValue = getComputedStyle(element)
      .getPropertyValue(cssVariableName)
      .trim();
    const parsedValue = Number.parseFloat(tokenValue);

    if (Number.isFinite(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }
  }

  return fallbackValue;
}

// The flow's viewport, with tier tokens read from the Inspector scope (see
// resolvePrototypeViewport in flow-canvas-geometry.js for the chain).
export function getPrototypeViewport(prototype, route) {
  return resolvePrototypeViewport(prototype, route, getDefaultPreviewDimension);
}

function getPrototypeViewportSignature(prototype) {
  const viewport = getPrototypeViewport(prototype, null);

  // Legacy prototypes (no declared viewport) keep their pre-signature
  // behavior: no expectation on reads, unsigned payloads on writes.
  return viewport.declared
    ? getPrototypeFlowLayoutViewportSignature(viewport)
    : null;
}

function getPrototypeViewportBadge(viewport) {
  return viewport.declared
    ? `${viewport.formFactor} · ${viewport.width}x${viewport.height}`
    : null;
}

function getCanvasMetrics(routePositionMap) {
  const positions = [...routePositionMap.values()];

  if (positions.length === 0) {
    return {
      height: canvasPadding * 2,
      offsetX: canvasPadding,
      offsetY: canvasPadding,
      width: canvasPadding * 2,
    };
  }

  const minX = Math.min(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxX = Math.max(
    ...positions.map((position) => position.x + getNodeWidth(position)),
  );
  const maxY = Math.max(...positions.map((position) => getRouteBottom(position)));
  const offsetX = canvasPadding - minX;
  const offsetY = canvasPadding - minY;

  return {
    height: maxY - minY + canvasPadding * 2,
    offsetX,
    offsetY,
    width: maxX - minX + canvasPadding * 2,
  };
}

function createDisplayRoutePositionMap(routePositionMap, canvasMetrics) {
  const map = new Map();

  routePositionMap.forEach((position, routeId) => {
    map.set(routeId, {
      ...position,
      x: position.x + canvasMetrics.offsetX,
      y: position.y + canvasMetrics.offsetY,
    });
  });

  return map;
}

export function getRoutePreviewSource(routeId, compositionId, propOverrides) {
  if (typeof window === "undefined") {
    return "";
  }

  const storyId = new URLSearchParams(window.location.search).get("id");
  if (!storyId) {
    return "";
  }

  const params = new URLSearchParams({
    globals: `${defaultPrototypeModeGlobalName}:story`,
    id: storyId,
    prototypeFlowPreview: "true",
    prototypeRoute: routeId,
    viewMode: "story",
  });

  if (typeof compositionId === "string" && compositionId !== "default") {
    params.set("prototypeComposition", compositionId);
  }

  if (propOverrides && Object.keys(propOverrides).length > 0) {
    params.set("prototypePropOverrides", JSON.stringify(propOverrides));
  }

  return `${window.location.pathname}?${params.toString()}`;
}

export function createStorybookGlobals(overrides) {
  const params = new URLSearchParams(window.location.search);
  const globals = normalizeStorybookGlobals(params.get("globals"));

  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      globals.delete(key);
      return;
    }

    globals.set(key, String(value));
  });

  return [...globals.entries()].map(([key, value]) => `${key}:${value}`).join(";");
}

function getPrototypeFlowExportStoryUrl(prototype) {
  if (typeof window === "undefined") {
    return "";
  }

  const storyId = getPrototypeFlowExportStoryId(prototype);
  if (!storyId) {
    return "";
  }

  const url = new URL(window.location.href);

  if (url.pathname.endsWith("/iframe.html")) {
    url.pathname = url.pathname.replace(/\/iframe\.html$/, "/");
  }

  url.hash = "";
  url.search = "";
  url.searchParams.set("path", `/story/${storyId}`);
  url.searchParams.set(
    "globals",
    createStorybookGlobals({
      figmaExport: "on",
      [defaultPrototypeModeGlobalName]: "story",
    }),
  );

  return url.toString();
}

export function openPrototypeExternalUrl(url) {
  // Single code path: a synthetic anchor click under the user gesture. Pairing
  // window.open with an anchor fallback double-opens the tab in browsers that
  // open the window yet return null, and the return value cannot distinguish
  // that from a blocked popup. NEVER navigate the hosting page away.
  try {
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.rel = "noopener noreferrer";
    anchor.target = "_blank";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } catch (error) {
    // Opening another story is best-effort; the current page must stay put.
  }
}

function openPrototypeFlowExportStory(prototype) {
  const url = getPrototypeFlowExportStoryUrl(prototype);
  if (!url) {
    return;
  }

  openPrototypeExternalUrl(url);
}

function openPrototypeComponentsMode() {
  try {
    addons.getChannel().emit(UPDATE_GLOBALS, {
      globals: { [defaultPrototypeModeGlobalName]: "components" },
    });
  } catch (error) {
    console.warn(
      "Unable to switch the Prototype Inspector to Components mode.",
      error,
    );
  }
}

function getMeasuredFramePreviewSize(iframe) {
  const doc = iframe.contentDocument;

  if (!doc?.body) {
    return null;
  }

  const routePreview = doc.querySelector(routePreviewMeasurementSelector);

  if (routePreview) {
    const rect = routePreview.getBoundingClientRect();

    return {
      height: Math.ceil(Math.max(rect.height, routePreview.scrollHeight)),
      width: Math.ceil(Math.max(rect.width, routePreview.scrollWidth)),
    };
  }

  if (
    doc.body.classList.contains("sb-show-preparing-story") ||
    doc.body.classList.contains("sb-show-preparing-docs")
  ) {
    return null;
  }

  const storyRoot = doc.querySelector("#storybook-root");
  const content = storyRoot?.firstElementChild ?? storyRoot ?? doc.body;
  const rect = content.getBoundingClientRect();

  return {
    height: Math.ceil(
      Math.max(
        rect.height,
        content.scrollHeight,
        doc.body.scrollHeight,
        doc.documentElement.scrollHeight,
      ),
    ),
    width: Math.ceil(
      Math.max(
        rect.width,
        content.scrollWidth,
        doc.body.scrollWidth,
        doc.documentElement.scrollWidth,
      ),
    ),
  };
}

// The size cache after one measurement: the measured size when
// acceptMeasuredSize takes it, the cache unchanged otherwise. Each cached size
// remembers the preview height the frame had when its height was measured, so
// the iframe's own growth since then is known however often it is
// re-measured. A frame is never narrower than its resolved viewport: content
// taller than the frame shows a scrollbar that would otherwise narrow the
// frame, which shows the scrollbar again, without end.
function applyMeasuredSize(sizes, routeId, entry) {
  const previous = sizes[routeId] ?? entry.fallback;
  const iframeGrowth =
    typeof previous?.measuredInHeight === "number" ? entry.appliedHeight - previous.measuredInHeight : 0;
  const size = { height: entry.size.height, width: Math.max(entry.size.width, entry.fallback?.width ?? 0) };
  const accepted = acceptMeasuredSize(previous, size, iframeGrowth, entry.viewportHeight);

  if (!accepted) {
    return sizes;
  }

  const measuredInHeight =
    accepted.height !== previous?.height || typeof previous?.measuredInHeight !== "number"
      ? entry.appliedHeight
      : previous.measuredInHeight;

  return { ...sizes, [routeId]: { ...accepted, measuredInHeight } };
}

// Binds a live frame's document after each load: a ResizeObserver from the
// frame's own window watches #storybook-root (static in iframe.html) and the
// route preview marker, rebound on every callback because Storybook renders
// the story after the load event; the frame's storyRenderPhaseChanged
// "completed" channel message (matched by MessageEvent.source) reports a
// finished render, and its storyHotUpdated message a code update the frame
// applied. The returned release runs before the frame reloads (pagehide) or
// is removed: an observer from the child realm left behind would keep the
// detached window alive.
function attachFrameMeasurement(iframe, { onHotUpdated, onRendered, onSize }) {
  let frameWindow = null;
  let frameDocument = null;

  try {
    frameWindow = iframe.contentWindow;
    frameDocument = iframe.contentDocument;
  } catch {
    return () => {};
  }

  if (!frameWindow || !frameDocument || typeof frameWindow.ResizeObserver !== "function") {
    return () => {};
  }

  let marker = null;
  let released = false;
  const observer = new frameWindow.ResizeObserver(() => {
    bindMarker();
    onSize();
  });
  const bindMarker = () => {
    const storyRoot = frameDocument.querySelector("#storybook-root");
    const next =
      frameDocument.querySelector(routePreviewMeasurementSelector) ?? storyRoot?.firstElementChild ?? null;

    if (next !== marker) {
      if (marker) observer.unobserve(marker);
      marker = next;
      if (marker) observer.observe(marker);
    }
  };
  const handleMessage = (event) => {
    if (
      event.source !== frameWindow ||
      typeof event.data !== "string" ||
      !(event.data.includes("storyRenderPhaseChanged") || event.data.includes("storyHotUpdated"))
    ) {
      return;
    }

    try {
      const message = JSON.parse(event.data);

      if (message?.event?.type === "storyHotUpdated") {
        onHotUpdated?.();
        return;
      }

      const phase = message?.event?.type === "storyRenderPhaseChanged" ? message.event.args?.[0]?.newPhase : null;

      if (phase === "completed") {
        bindMarker();
        onRendered?.();
      }
    } catch {
      // Not a Storybook channel message.
    }
  };
  const release = () => {
    if (released) return;
    released = true;
    observer.disconnect();
    window.removeEventListener("message", handleMessage);
    frameWindow.removeEventListener("pagehide", release);
    marker = null;
  };

  observer.observe(frameDocument.querySelector("#storybook-root") ?? frameDocument.body);
  bindMarker();
  window.addEventListener("message", handleMessage);
  frameWindow.addEventListener("pagehide", release);
  return release;
}

// Memoized frames: a drag moves frames through the DOM, and props are plain
// values plus stable handlers, so unrelated renders skip every frame.
const PrototypeFlowNode = memo(function PrototypeFlowNode({
  height,
  node,
  onPointerCancel,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  width,
  x,
  y,
}) {
  const isDecision = node.shape === "decision";

  return createElement(
    "article",
    {
      "aria-label": node.title ?? node.id,
      className: "prototype-inspector__flow-node",
      "data-frame-id": node.id,
      "data-sbfx-anchor": `node:${node.id}`,
      "data-sbfx-anchor-label": node.title ?? node.id,
      "data-shape": node.shape ?? "state",
      "data-tone": node.tone ?? "default",
      onPointerCancel,
      onPointerDown,
      onPointerEnter,
      onPointerLeave,
      onPointerMove,
      onPointerUp,
      style: {
        "--prototype-flow-node-height": `${height}px`,
        "--prototype-flow-node-width": `${width}px`,
        "--prototype-flow-node-x": `${x}px`,
        "--prototype-flow-node-y": `${y}px`,
      },
    },
    createElement(
      "div",
      { className: "prototype-inspector__flow-node-surface" },
      createElement(
        "div",
        { className: "prototype-inspector__flow-node-copy" },
        createElement(
          "span",
          { className: "prototype-inspector__flow-node-eyebrow" },
          isDecision ? "IF / ELSE" : (node.flowGroup ?? "state"),
        ),
        createElement("strong", null, node.title ?? node.id),
        node.description
          ? createElement("p", null, node.description)
          : null,
      ),
    ),
  );
});

// A story that never reports its render still frees the load slot after this.
const frameRenderedFallbackMs = 6_000;

// A route frame at its level of detail. The preview element keeps the comment
// anchor and the preview size in every tier. Its first child is the live
// iframe, present only while the frame is live and holds a load slot; until
// that iframe's story has rendered, a cover (the snapshot or a skeleton with
// the route title and id) lies above it. No route iframe takes focus or
// pointer input.
const PrototypeRouteCard = memo(function PrototypeRouteCard({
  height,
  instanceKey,
  isAnchor = true,
  isRendered,
  isSnapshotStale = false,
  mountIframe,
  onFrameHotUpdated,
  onFrameLoaded,
  onFrameRendered,
  onPointerCancel,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  onPreviewSizeChange,
  previewHeight,
  previewSource,
  previewWidth,
  route,
  snapshotUrl = null,
  tier,
  width,
  x,
  y,
}) {
  const iframeRef = useRef(null);
  const releaseMeasurementRef = useRef(null);
  const measureFrameRef = useRef(0);
  const renderedFallbackRef = useRef(0);
  // The preview height the frame has now, sent with each measurement so the
  // size cache can tell 100vh content feedback from real growth.
  const appliedHeightRef = useRef(previewHeight);
  appliedHeightRef.current = previewHeight;
  // At most one measurement per frame, whatever triggered it.
  const scheduleMeasure = () => {
    if (measureFrameRef.current) {
      return;
    }

    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = 0;
      const iframe = iframeRef.current;
      const measuredSize = iframe ? getMeasuredFramePreviewSize(iframe) : null;

      if (!measuredSize?.height || !measuredSize?.width) {
        return;
      }

      onPreviewSizeChange(route.id, measuredSize, appliedHeightRef.current);
    });
  };
  const releaseFrame = () => {
    window.cancelAnimationFrame(measureFrameRef.current);
    measureFrameRef.current = 0;
    window.clearTimeout(renderedFallbackRef.current);
    releaseMeasurementRef.current?.();
    releaseMeasurementRef.current = null;
  };

  useEffect(() => releaseFrame, []);

  // The iframe comes and goes with the live tier; a removed iframe releases
  // everything bound to its window. React 18 hosts drop inert={true}, so the
  // property is also set here.
  const setIframe = useCallback((element) => {
    if (!element) {
      releaseFrame();
    } else {
      element.inert = true;
    }
    iframeRef.current = element;
  }, []);

  // Every load (first load, reload, HMR full reload) binds the new document.
  // A completed render reports the iframe (it may refresh the route's
  // snapshot); the fallback only ends the loading state.
  const handlePreviewLoad = (event) => {
    const iframe = event.currentTarget;

    releaseFrame();
    onFrameLoaded?.(instanceKey, iframe);
    releaseMeasurementRef.current = attachFrameMeasurement(iframe, {
      onHotUpdated: () => onFrameHotUpdated?.(instanceKey, iframe),
      onRendered: () => {
        window.clearTimeout(renderedFallbackRef.current);
        onFrameRendered(instanceKey, iframe);
        scheduleMeasure();
      },
      onSize: scheduleMeasure,
    });
    renderedFallbackRef.current = window.setTimeout(() => onFrameRendered(instanceKey), frameRenderedFallbackMs);
    scheduleMeasure();
  };

  const isLive = tier === "live";
  const showIframe = isLive && mountIframe && Boolean(previewSource);
  const cover =
    tier === "culled" || (showIframe && isRendered)
      ? null
      : tier === "placeholder"
        ? createElement("div", {
            "aria-hidden": "true",
            className: "prototype-inspector__flow-frame-placeholder",
            key: "cover",
          })
        : snapshotUrl
          ? createElement("img", {
              alt: "",
              "aria-hidden": "true",
              className: "prototype-inspector__flow-frame-snapshot",
              decoding: "async",
              draggable: false,
              key: "cover",
              src: snapshotUrl,
            })
          : createElement(
              "div",
              { "aria-hidden": "true", className: "prototype-inspector__flow-frame-skeleton", key: "cover" },
              createElement("strong", null, route.title ?? route.id),
              createElement("span", null, route.id),
            );

  return createElement(
    "article",
    {
      "aria-label": route.title ?? route.id,
      className: "prototype-inspector__flow-frame",
      "data-frame-id": instanceKey,
      "data-live-loading": isLive && !isRendered ? "true" : undefined,
      "data-snapshot-stale": isSnapshotStale ? "true" : undefined,
      "data-tier": tier,
      onPointerCancel,
      onPointerDown,
      onPointerEnter,
      onPointerLeave,
      onPointerMove,
      onPointerUp,
      style: {
        "--prototype-flow-card-x": `${x}px`,
        "--prototype-flow-card-y": `${y}px`,
        "--prototype-flow-card-width": `${width}px`,
        "--prototype-flow-card-height": `${height}px`,
        "--prototype-flow-preview-height": `${previewHeight}px`,
        "--prototype-flow-preview-width": `${previewWidth}px`,
      },
    },
    createElement(
      "div",
      {
        className: "prototype-inspector__flow-frame-preview",
        // The visible rect is the frame's comment anchor, so a pin keeps its
        // point on the route page (the name area above is not part of it).
        // Only this element carries it, in every tier.
        ...(isAnchor
          ? {
              "data-sbfx-anchor": `route:${route.id}`,
              "data-sbfx-anchor-label": route.title ?? route.id,
              "data-sbfx-anchor-route": route.id,
            }
          : {}),
      },
      previewSource
        ? [
            showIframe
              ? createElement("iframe", {
                  "aria-hidden": "true",
                  inert: true,
                  key: "live",
                  onLoad: handlePreviewLoad,
                  ref: setIframe,
                  src: previewSource,
                  tabIndex: -1,
                  title: `${route.title ?? route.id} preview`,
                })
              : null,
            cover,
          ]
        : createElement(FlowEmpty, {
            message: "無法取得 route 預覽。",
          }),
    ),
  );
});

// The live frame that takes the single load slot next: the pinned frame, then
// promoted, then hovered frames, then the one nearest the canvas center.
function pickLoadingFrame(tiers, frames, rendered, { camera, canvasSize, hoveredKey, pinnedId, promotedIds }) {
  const waiting = frames.filter((frame) => tiers.get(frame.key) === "live" && !rendered.has(frame.key));

  if (!waiting.length) {
    return null;
  }

  const rank = (frame) =>
    frame.key === pinnedId ? 0 : promotedIds.has(frame.key) ? 1 : frame.key === hoveredKey ? 2 : 3;
  const distance = (frame) =>
    camera && canvasSize
      ? Math.hypot(
          (frame.x + frame.width / 2) * camera.z + camera.x - canvasSize.width / 2,
          (frame.y + frame.height / 2) * camera.z + camera.y - canvasSize.height / 2,
        )
      : 0;

  return [...waiting].sort((a, b) => rank(a) - rank(b) || distance(a) - distance(b))[0].key;
}

// ---------------------------------------------------------------------------
// Snapshot renderer: one hidden iframe, outside the canvas, that switches
// routes in place (history.replaceState and a Storybook FORCE_REMOUNT channel
// message posted to its window) and captures each route. Its src and size are
// written to the DOM directly, so switching routes sets no React state. The
// same one-at-a-time queue also captures live frames from their own iframes
// ("live" items) when they refresh their route's snapshot.

const rendererLimits = Object.freeze({
  completedMs: 6_000,
  completingMs: 2_000,
  finishedMs: 2_000,
  frameCapMs: 120,
  // After a code update, captures wait for the renderer's own
  // storyHotUpdated and this long without further notifications; without
  // that signal the renderer reloads its src after hotSignalMs.
  hotQuietMs: 100,
  hotSignalMs: 2_000,
  loadMs: 20_000,
  // Resizes to the measured size before a capture.
  maxResizes: 2,
  // A route whose story never renders is given up after this many tries
  // (the first can be a cold dev-server load).
  renderAttempts: 2,
  switchesBeforeReload: 25,
});
function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// One animation frame, at most frameCapMs (hidden or headless pages may not
// run animation frames).
function nextFrameWithin(ms) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);

    window.requestAnimationFrame(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

function scheduleIdle(callback) {
  return typeof window.requestIdleCallback === "function"
    ? window.requestIdleCallback(callback, { timeout: 500 })
    : window.setTimeout(callback, 50);
}

function cancelIdle(handle) {
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle);
  }
  window.clearTimeout(handle);
}

// Queue items are { kind: "renderer" | "live", routeId, minCodeVersion, frame }
// (frame: the live frame's iframe). A capture reports its result with the
// code version it ran on: the count of code updates the renderer had applied
// when a renderer capture started, liveCodeVersion() for a live capture.
function createSnapshotRenderer({
  codeVersion: initialCodeVersion = 0,
  isPaused,
  layer,
  liveCodeVersion,
  markupHashFor,
  onBusyChange,
  onFailure,
  onLoadingChange,
  onResult,
  onSettled,
  onSize,
  routeIds,
  sizeFor,
  sourceFor,
  storyId,
}) {
  let iframe = null;
  let currentRouteId = null;
  let inFlight = null;
  let needsReload = true;
  // Why the next load happens; marked once, when it happens.
  let reloadReason = "initial";
  let switches = 0;
  let queue = [];
  let running = false;
  let destroyed = false;
  let controller = null;
  let expectingLoad = false;
  let lastPhase = null;
  let phasesSeen = [];
  let phaseWaiters = [];
  let idleHandle = 0;
  let busy = false;
  // Code updates notified, and applied by the renderer's document. Renderer
  // captures wait while the renderer is behind (live captures do not).
  let codeVersion = initialCodeVersion;
  let notifiedCodeVersion = initialCodeVersion;
  let hotQuietTimer = 0;
  let hotSignalTimer = 0;
  // Every switch reloads the src once a route's snapshot differed from a
  // clean live capture (state left behind by in-place remounts).
  let reloadEverySwitch = false;
  const renderFailures = new Map();

  const markReset = (reason) => {
    try {
      performance.mark("pi:flow:renderer-reset", { detail: { reason } });
    } catch {
      // Marks are diagnostics only.
    }
  };
  const setBusy = (next) => {
    if (busy !== next) {
      busy = next;
      onBusyChange(next);
    }
  };
  const isBehind = () => notifiedCodeVersion > codeVersion;
  const clearHotTimers = () => {
    window.clearTimeout(hotQuietTimer);
    window.clearTimeout(hotSignalTimer);
    hotQuietTimer = 0;
    hotSignalTimer = 0;
  };
  // The renderer has applied every notified update.
  const catchUp = () => {
    clearHotTimers();
    codeVersion = notifiedCodeVersion;
    kick();
  };
  const handleHotUpdated = () => {
    if (!isBehind()) {
      return;
    }

    window.clearTimeout(hotQuietTimer);
    hotQuietTimer = window.setTimeout(catchUp, rendererLimits.hotQuietMs);
  };
  const handleMessage = (event) => {
    if (
      !iframe ||
      event.source !== iframe.contentWindow ||
      typeof event.data !== "string" ||
      !(event.data.includes("storyRenderPhaseChanged") || event.data.includes("storyHotUpdated"))
    ) {
      return;
    }

    try {
      const message = JSON.parse(event.data);

      if (message?.event?.type === "storyHotUpdated") {
        handleHotUpdated();
        return;
      }

      const phase = message?.event?.type === "storyRenderPhaseChanged" ? message.event.args?.[0]?.newPhase : null;

      if (!phase) {
        return;
      }

      lastPhase = phase;
      phasesSeen.push(phase);
      phaseWaiters = phaseWaiters.filter((waiter) => {
        if (waiter.phase !== phase) {
          return true;
        }

        waiter.resolve(true);
        return false;
      });
    } catch {
      // Not a Storybook channel message.
    }
  };
  // Resolves true when the phase arrives (or, with fromHistory, was already
  // seen since the last switch), false after ms.
  const waitForPhase = (phase, ms, { fromHistory = true } = {}) =>
    fromHistory && phasesSeen.includes(phase)
      ? Promise.resolve(true)
      : new Promise((resolve) => {
          const waiter = { phase, resolve };
          const timer = window.setTimeout(() => {
            phaseWaiters = phaseWaiters.filter((entry) => entry !== waiter);
            resolve(false);
          }, ms);

          waiter.resolve = (value) => {
            window.clearTimeout(timer);
            resolve(value);
          };
          phaseWaiters.push(waiter);
        });
  const handleLoad = () => {
    // A new iframe first loads about:blank; that is not a reload.
    if (!expectingLoad && iframe?.getAttribute("src")) {
      // A load nobody asked for: Storybook's teardown reloaded the document.
      currentRouteId = null;
      needsReload = true;
      reloadReason = "teardown-reload";
    }
  };
  const ensureIframe = () => {
    if (iframe?.isConnected) {
      return;
    }

    iframe = document.createElement("iframe");
    iframe.className = "prototype-inspector__flow-renderer";
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("data-prototype-inspector-renderer", "true");
    iframe.setAttribute("inert", "");
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("title", "Route snapshot renderer");
    iframe.inert = true;
    iframe.addEventListener("load", handleLoad);
    layer.append(iframe);
    needsReload = true;
  };
  const setFrameSize = (size) => {
    iframe.style.width = `${size.width}px`;
    iframe.style.height = `${size.height}px`;
  };
  // Loads the route's preview URL and waits for its first completed render.
  const load = async (routeId, reason) => {
    markReset(reason);
    expectingLoad = true;
    onLoadingChange?.(true);
    phasesSeen = [];
    lastPhase = null;
    const loaded = new Promise((resolve) => iframe.addEventListener("load", () => resolve(true), { once: true }));
    // Updates notified before the src changes are in the document it loads.
    const loadingCodeVersion = notifiedCodeVersion;

    iframe.src = sourceFor(routeId);
    const ok = await Promise.race([loaded, sleep(rendererLimits.loadMs).then(() => false)]);

    expectingLoad = false;
    if (!ok || destroyed) {
      onLoadingChange?.(false);
      return false;
    }

    if (loadingCodeVersion > codeVersion) {
      codeVersion = loadingCodeVersion;
      if (!isBehind()) {
        clearHotTimers();
      }
    }

    switches = 0;
    needsReload = false;
    currentRouteId = (await waitForPhase("completed", rendererLimits.completedMs)) ? routeId : null;
    onLoadingChange?.(false);
    return currentRouteId === routeId;
  };
  // Switches routes in place; falls back to reloading the src when the
  // render does not start or finish in time.
  const switchTo = async (routeId) => {
    // A FORCE_REMOUNT while the previous render is still pending (afterEach)
    // makes Storybook reload the document: the next one is posted only after
    // "finished", and a render that does not get there reloads the src.
    if (lastPhase !== "finished" && !(await waitForPhase("finished", rendererLimits.finishedMs, { fromHistory: false }))) {
      return load(routeId, "timeout-finished");
    }

    switches += 1;
    if (reloadEverySwitch || switches >= rendererLimits.switchesBeforeReload) {
      return load(routeId, "scheduled");
    }

    const frameWindow = iframe.contentWindow;
    const postedAt = performance.now();
    const remaining = (ms) => Math.max(0, postedAt + ms - performance.now());

    phasesSeen = [];
    frameWindow.history.replaceState(frameWindow.history.state, "", sourceFor(routeId));
    const loading = waitForPhase("loading", rendererLimits.completingMs);

    frameWindow.postMessage(
      JSON.stringify({
        event: { args: [{ storyId }], from: "prototype-inspector", type: "forceRemount" },
        key: "storybook-channel",
      }),
      window.location.origin,
    );
    if (!(await loading)) {
      return load(routeId, "timeout-completing");
    }
    // Only phases of the new render count; they start with its "loading".
    phasesSeen = phasesSeen.slice(phasesSeen.indexOf("loading"));
    if (!(await waitForPhase("completing", remaining(rendererLimits.completingMs)))) {
      return load(routeId, "timeout-completing");
    }
    if (!(await waitForPhase("completed", remaining(rendererLimits.completedMs)))) {
      return load(routeId, "timeout-completed");
    }

    // A prototype that keeps its route through a remount still shows the
    // previous route: reload the src now, and on every later switch.
    const rootRoute = iframe.contentDocument?.querySelector("[data-prototype-root]")?.getAttribute("data-route");

    if (rootRoute && routeIds.has(rootRoute) && rootRoute !== routeId) {
      reloadEverySwitch = true;
      return load(routeId, "wrong-route");
    }

    currentRouteId = routeId;
    return true;
  };
  const ensureRoute = async (routeId) => {
    ensureIframe();
    // The route renders at its own size, not the previous route's (or the
    // iframe default on the first load).
    const { cached, fallback } = sizeFor(routeId);

    setFrameSize(cached ?? fallback);
    if (needsReload || !currentRouteId) {
      const reason = reloadReason;

      reloadReason = "capture-failed";
      return load(routeId, reason);
    }

    return currentRouteId === routeId ? true : switchTo(routeId);
  };
  // Fonts, images and two animation frames after the story completed.
  const settleDocument = async () => {
    const frameDocument = iframe.contentDocument;

    if (!frameDocument) {
      return;
    }

    await Promise.race([frameDocument.fonts?.ready ?? Promise.resolve(), sleep(1_000)]);
    await Promise.race([
      Promise.all([...frameDocument.images].map((image) => image.decode?.().catch(() => {}))),
      sleep(1_000),
    ]);
    await nextFrameWithin(rendererLimits.frameCapMs);
    await nextFrameWithin(rendererLimits.frameCapMs);
  };
  // Lays the renderer out at the route's cached size, measures it the way
  // live frames are measured and resizes (then measures again) at most
  // twice. The size reaches the size cache with the capture's result.
  const measureRoute = async (routeId) => {
    const { cached, fallback, viewportHeight } = sizeFor(routeId);
    let sizes = { [routeId]: cached ?? fallback };
    let resizes = 0;

    setFrameSize(sizes[routeId]);
    for (;;) {
      await nextFrameWithin(rendererLimits.frameCapMs);
      const measured = getMeasuredFramePreviewSize(iframe);

      if (!measured?.width || !measured?.height) {
        break;
      }

      const next = applyMeasuredSize(sizes, routeId, {
        appliedHeight: sizes[routeId].height,
        fallback,
        size: measured,
        viewportHeight,
      });

      if (next === sizes || resizes >= rendererLimits.maxResizes) {
        break;
      }

      sizes = next;
      resizes += 1;
      setFrameSize(sizes[routeId]);
    }

    return sizes[routeId];
  };
  const capture = async ({ routeId }, signal) => {
    const startedCodeVersion = codeVersion;

    if (!(await ensureRoute(routeId)) || signal.aborted) {
      if (signal.aborted) {
        return "aborted";
      }

      const failures = (renderFailures.get(routeId) ?? 0) + 1;

      renderFailures.set(routeId, failures);
      if (failures >= rendererLimits.renderAttempts) {
        renderFailures.delete(routeId);
        onFailure(routeId, "not-rendered");
      }
      return "failed";
    }

    const rootRoute = iframe.contentDocument?.querySelector("[data-prototype-root]")?.getAttribute("data-route");

    // Some prototypes put a navigation id in data-route; only a flow route id is compared.
    if (rootRoute && routeIds.has(rootRoute) && rootRoute !== routeId) {
      needsReload = true;
      reloadReason = "capture-failed";
      onFailure(routeId, "wrong-route");
      return "failed";
    }

    await settleDocument();
    if (signal.aborted) {
      return "aborted";
    }

    const size = await measureRoute(routeId);

    if (signal.aborted) {
      return "aborted";
    }

    const result = await captureFrameSnapshot(iframe, {
      devicePixelRatio: window.devicePixelRatio || 1,
      previewHeight: size.height,
      previewWidth: size.width,
      previousMarkupHash: markupHashFor(routeId),
      signal,
    });

    // Encoding does not check the signal: a result that comes back after the
    // abort is dropped, whether it succeeded or failed.
    if (signal.aborted || (!result.ok && result.reason === "aborted")) {
      return "aborted";
    }
    if (!result.ok) {
      needsReload = true;
      reloadReason = "capture-failed";
      onFailure(routeId, result.reason);
      return "failed";
    }

    renderFailures.delete(routeId);
    onSize(routeId, size);
    onResult(
      routeId,
      { ...result, measuredInHeight: size.measuredInHeight, previewHeight: size.height, previewWidth: size.width },
      { codeVersion: startedCodeVersion, kind: "renderer" },
    );
    return "done";
  };
  // A live frame captured from its own iframe at its cached preview size. A
  // frame that is gone or cannot be captured leaves the stored snapshot alone.
  const captureLive = async ({ frame, routeId }, signal) => {
    if (!frame?.isConnected) {
      return "skipped";
    }

    const startedCodeVersion = liveCodeVersion();
    const { cached, fallback } = sizeFor(routeId);
    const size = cached ?? fallback;
    const result = await captureFrameSnapshot(frame, {
      devicePixelRatio: window.devicePixelRatio || 1,
      previewHeight: size.height,
      previewWidth: size.width,
      previousMarkupHash: markupHashFor(routeId),
      signal,
    });

    if (signal.aborted || (!result.ok && result.reason === "aborted")) {
      return "aborted";
    }
    if (!result.ok) {
      console.debug(`[prototype-inspector] No snapshot from live route "${routeId}": ${result.reason}`);
      return "skipped";
    }

    onResult(
      routeId,
      { ...result, measuredInHeight: size.measuredInHeight, previewHeight: size.height, previewWidth: size.width },
      { codeVersion: startedCodeVersion, kind: "live" },
    );
    return "done";
  };
  // Live items run whenever the queue runs; renderer items wait while the
  // renderer has not applied the latest code update.
  const nextRunnableIndex = () => queue.findIndex((item) => item.kind === "live" || !isBehind());
  const runNext = async () => {
    idleHandle = 0;
    const index = nextRunnableIndex();

    if (destroyed || running || index < 0 || isPaused()) {
      setBusy(running || queue.length > 0);
      return;
    }

    running = true;
    setBusy(true);
    const [item] = queue.splice(index, 1);
    const current = new AbortController();

    controller = current;
    inFlight = { codeVersion: item.kind === "live" ? liveCodeVersion() : codeVersion, kind: item.kind, routeId: item.routeId };
    let outcome = "failed";

    try {
      outcome = await (item.kind === "live" ? captureLive : capture)(item, current.signal);
    } catch (error) {
      if (current.signal.aborted) {
        outcome = "aborted";
      } else if (item.kind === "live") {
        outcome = "skipped";
      } else {
        needsReload = true;
        reloadReason = "capture-failed";
        onFailure(item.routeId, error?.message ?? "error");
      }
    } finally {
      running = false;
      controller = null;
      inFlight = null;
    }

    if (outcome === "aborted" && !destroyed) {
      queue = [item, ...queue.filter((entry) => entry.routeId !== item.routeId || entry.kind !== item.kind)];
    }
    if (destroyed) {
      return;
    }
    onSettled?.(item, outcome);
    if (queue.length) {
      kick();
    } else {
      setBusy(false);
    }
  };
  const kick = () => {
    if (destroyed || running || idleHandle || nextRunnableIndex() < 0) {
      setBusy(running || queue.length > 0);
      return;
    }

    if (isPaused()) {
      setBusy(true);
      return;
    }

    idleHandle = scheduleIdle(runNext);
  };

  window.addEventListener("message", handleMessage);

  return {
    // An in-flight capture stops at its next yield point and is requeued.
    abort() {
      controller?.abort();
      if (idleHandle) {
        cancelIdle(idleHandle);
        idleHandle = 0;
      }
    },
    destroy() {
      destroyed = true;
      controller?.abort();
      cancelIdle(idleHandle);
      clearHotTimers();
      window.removeEventListener("message", handleMessage);
      phaseWaiters.forEach((waiter) => waiter.resolve(false));
      phaseWaiters = [];
      iframe?.remove();
      iframe = null;
    },
    // A code update reached the Inspector's document. A loaded renderer
    // catches up after its own storyHotUpdated and a quiet period, or reloads
    // its src when that signal does not arrive in time; a renderer that has
    // no document yet loads the new code anyway.
    notifyCodeUpdate() {
      notifiedCodeVersion += 1;
      if (!iframe || ((needsReload || !currentRouteId) && !expectingLoad)) {
        catchUp();
        return;
      }

      window.clearTimeout(hotQuietTimer);
      hotQuietTimer = 0;
      window.clearTimeout(hotSignalTimer);
      hotSignalTimer = window.setTimeout(() => {
        hotSignalTimer = 0;
        if (!isBehind() || destroyed) {
          return;
        }

        needsReload = true;
        reloadReason = "hmr-no-signal";
        catchUp();
      }, rendererLimits.hotSignalMs);
      setBusy(running || queue.length > 0);
    },
    // From now on every switch reloads the src (for this prototype, for the
    // rest of the page session).
    reloadEverySwitch() {
      reloadEverySwitch = true;
    },
    resume() {
      kick();
    },
    // Items in capture order. An item the in-flight capture already covers
    // (same kind and route, and new enough code) is left out.
    setQueue(items) {
      queue = items.filter(
        (item) =>
          !inFlight ||
          item.kind !== inFlight.kind ||
          item.routeId !== inFlight.routeId ||
          inFlight.codeVersion < (item.minCodeVersion ?? 0),
      );
      kick();
    },
  };
}

// Tells figma-export review that anchored elements moved without a React
// render, so it repositions its pins in the same animation frame.
function dispatchAnchorsMoved(root) {
  root?.dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }));
}

// An empty UI Flow offers neither comments nor Figma export.
const flowEmptyDeclarations = {
  "data-sbfx-comments": "unavailable",
  "data-sbfx-export": "unavailable",
};

const flowCameraStoragePrefix = "prototype-inspector:flow-camera:";
// The camera is handed back to React once it has been still this long.
const cameraIdleMs = 120;
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function getFlowCameraStorageKey(prototype) {
  return `${flowCameraStoragePrefix}${prototype.id}`;
}

// The complete-flow camera saved in this tab, or null when it is missing,
// malformed or unreadable (the canvas then fits instead).
function readStoredFlowCamera(storageKey) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null");

    return isRecord(value) &&
      value.version === 1 &&
      [value.x, value.y, value.z].every(Number.isFinite) &&
      value.z >= MIN_ZOOM &&
      value.z <= MAX_ZOOM
      ? { x: value.x, y: value.y, z: value.z }
      : null;
  } catch (error) {
    return null;
  }
}

function writeStoredFlowCamera(storageKey, camera) {
  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({ version: 1, x: camera.x, y: camera.y, z: camera.z }),
    );
  } catch (error) {
    // Camera memory is a convenience: without sessionStorage every mount fits.
  }
}

const nonTextInputTypes = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);
// Elements whose Space, Enter and arrow keys must keep their native behavior:
// controls, lists and anything inside a dialog.
const keyboardControlSelector = [
  "button",
  "a[href]",
  "summary",
  "ul",
  "ol",
  "li",
  "dialog",
  ...[
    "button",
    "link",
    "menu",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "listbox",
    "option",
    "tab",
    "checkbox",
    "switch",
    "list",
    "listitem",
    "dialog",
  ].map((role) => `[role="${role}"]`),
].join(", ");

function isTextEntryTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest("[contenteditable=''], [contenteditable='true'], [role='textbox']")) {
    return true;
  }

  return (
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    (target.tagName === "INPUT" && !nonTextInputTypes.has(target.type))
  );
}

function isControlTarget(target) {
  return target instanceof Element && Boolean(target.closest(keyboardControlSelector));
}

function isMacPlatform() {
  return typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

// Whether a wheel over `target` should keep native scrolling: some element
// between it and the flow root can still scroll.
function isInScrollableArea(target, root) {
  for (
    let element = target instanceof Element ? target : null;
    element && element !== root;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);

    if (
      (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) ||
      (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth)
    ) {
      return true;
    }
  }

  return false;
}

function getCameraTransform(camera) {
  return `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`;
}

// A route frame's label, drawn in the screen-space overlay above the frame's
// preview: fixed 12 px text that follows the camera through CSS variables.
// It is also a hit area for the frame (the components button excepted). While
// the frame shows a snapshot older than the latest code update, the label
// carries an Updating snapshot badge.
const PrototypeFrameLabel = memo(function PrototypeFrameLabel({
  componentCount,
  isHidden,
  isHovered,
  isUpdating = false,
  onPointerCancel,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  route,
  viewportBadge,
  visibleWidth,
  x,
  y,
}) {
  const groupName = route.flowGroup ?? route.navigationId ?? null;

  return createElement(
    "div",
    {
      className: "prototype-inspector__flow-frame-label",
      "data-frame-id": route.id,
      "data-hidden": isHidden ? "true" : undefined,
      "data-hovered": isHovered ? "true" : undefined,
      onPointerCancel,
      onPointerDown,
      onPointerEnter,
      onPointerLeave,
      onPointerMove,
      onPointerUp,
      style: {
        "--prototype-flow-frame-visible-width": visibleWidth,
        "--prototype-flow-label-wx": `${x}px`,
        "--prototype-flow-label-wy": `${y}px`,
      },
    },
    createElement(
      "span",
      { className: "prototype-inspector__flow-frame-title" },
      route.title ?? route.id,
    ),
    viewportBadge
      ? createElement(
          "span",
          { className: "prototype-inspector__flow-frame-badge" },
          viewportBadge,
        )
      : null,
    // Icon-sized, so the route title keeps the room on narrow labels.
    isUpdating
      ? createElement(
          "span",
          { className: "prototype-inspector__flow-frame-badge", "data-updating": "true", title: "Updating snapshot" },
          createElement("span", { "aria-hidden": "true" }, "↻"),
          createElement("span", { className: "prototype-inspector__visually-hidden" }, "Updating snapshot"),
        )
      : null,
    componentCount > 0
      ? createElement(
          "button",
          {
            "aria-label": `Show ${componentCount} components for ${route.title ?? route.id}`,
            className: "prototype-inspector__components-count",
            onClick: (event) => {
              event.stopPropagation();
              openPrototypeComponentsMode();
            },
            onPointerDown: (event) => event.stopPropagation(),
            title: "Open the Components mode",
            type: "button",
          },
          `⧉ ${componentCount}`,
        )
      : null,
    createElement(
      "span",
      { className: "prototype-inspector__flow-frame-reveal" },
      createElement("code", null, route.id),
      groupName ? createElement("span", null, groupName) : null,
    ),
  );
});
// Labels hide while their frame is narrower than this on screen (unless hovered).
const frameLabelMinScreenWidth = 48;
// An edge label hides while both of its frames are narrower than this on
// screen and neither is hovered.
const edgeLabelMinFrameScreenWidth = 150;
// Below this zoom the dashed-line animation pauses.
const dashAnimationMinZoom = 0.4;

function getEdgeLabelText(edge) {
  return `${getEdgeLabelPrefix(edge)} ${edge.labels.join(" / ")}`;
}

// Edge paint lives in inline styles: DOM-to-image captures (for example the
// figma-export addon's comment screenshots) clone an <svg> without applying
// stylesheet rules to its children, so class-based fill and stroke would render
// as black filled shapes. The values reference the --pi-* tokens directly, which
// the svg inherits, instead of a class-scoped variable the clone would lack.
const flowEdgeColorTokens = {
  primary: "var(--pi-sys-color-annotation-flow)",
  secondary: "var(--pi-sys-color-annotation-ratio)",
  tertiary: "var(--pi-sys-color-portfolio-allocation-series-4)",
  quaternary: "var(--pi-ref-color-blue-60)",
};
const flowEdgeOpacityTokens = {
  active: "var(--pi-sys-state-opacity-annotation-strong)",
  muted: "var(--pi-sys-state-opacity-subtle)",
};
const flowEdgeDefaultOpacity = "var(--pi-sys-state-opacity-annotation-medium)";

function getFlowEdgeColor(colorVariant) {
  return flowEdgeColorTokens[colorVariant] ?? flowEdgeColorTokens.primary;
}

function getFlowLineStyle(colorVariant, focus) {
  return {
    fill: "none",
    opacity: flowEdgeOpacityTokens[focus] ?? flowEdgeDefaultOpacity,
    stroke: getFlowEdgeColor(colorVariant),
    strokeDasharray: "var(--pi-sys-spacing-screen-gutter) var(--pi-sys-spacing-sm)",
    strokeLinecap: "square",
    strokeLinejoin: "miter",
    // Divided by the representative zoom of the camera's zoom bucket, written on
    // the world layer only when the bucket changes: about 2 px on screen.
    strokeWidth:
      "calc(var(--pi-sys-size-control-border-width-strong) / var(--prototype-flow-stroke-zoom, 1))",
  };
}

function getFlowArrowStyle(colorVariant, focus) {
  return {
    fill: getFlowEdgeColor(colorVariant),
    opacity: flowEdgeOpacityTokens[focus] ?? flowEdgeDefaultOpacity,
  };
}

// Representative zoom of a zoom bucket: stroke widths, arrowheads and label
// placement are computed for it, so they only change when the bucket does.
function getBucketZoom(bucket) {
  return 2 ** (bucket / 2);
}

function markLabelPlacement(startedAt) {
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    performance.mark("pi:flow:label-placement", {
      detail: { durationMs: performance.now() - startedAt },
    });
  }
}

// Snapshot keys revalidated in this page session, with the code update count
// the capture ran on: a cached snapshot is recaptured once per session and
// again once the count has moved on, also when the update happened while the
// UI Flow was not mounted.
const revalidatedSnapshotKeys = new Map();

function isSnapshotRevalidated(key) {
  return (revalidatedSnapshotKeys.get(key) ?? -1) >= getCodeUpdateCount();
}
// How long opening waits for the cached snapshots before rendering frames at
// their declared sizes.
const snapshotPreloadWaitMs = 150;
// A live frame refreshes its snapshot this long after its own last
// storyHotUpdated (restarted by further notifications).
const liveHotQuietMs = 100;

// Revokes a snapshot object URL no element shows any more. While a comment
// is being placed its screenshot may still clone snapshot images, so the URL
// waits in `deferred` for an idle moment after capture mode ends.
function revokeSnapshotUrlWhenSafe(url, deferred) {
  if (typeof document !== "undefined" && document.documentElement.dataset.sbfxCaptureMode === "true") {
    if (!deferred.size) {
      scheduleIdle(() => {
        const waiting = [...deferred];

        deferred.clear();
        waiting.forEach((entry) => revokeSnapshotUrlWhenSafe(entry, deferred));
      });
    }
    deferred.add(url);
    return;
  }

  URL.revokeObjectURL(url);
}

// initialTiers (instance key -> tier) is for test_flow_canvas_ssr.mjs only:
// it replaces the computed level of detail so server renders can show tiers.
export function PrototypeFlow({ initialTiers = null, prototype }) {
  const flow = prototype.flow;
  const routes = useMemo(() => normalizeRoutes(flow), [flow]);
  const flowNodes = useMemo(() => normalizeFlowNodes(flow), [flow]);
  const transitions = useMemo(() => normalizeTransitions(flow), [flow]);
  const routeComponentCounts = useMemo(() => {
    const counts = new Map();
    const seenRouteIds = new Set();

    normalizeComponentRoutes(prototype.components).forEach((componentRoute) => {
      if (
        typeof componentRoute.route !== "string" ||
        seenRouteIds.has(componentRoute.route)
      ) {
        return;
      }

      seenRouteIds.add(componentRoute.route);

      const componentCount = normalizeRouteComponents(componentRoute).length;

      if (componentCount > 0) {
        counts.set(componentRoute.route, componentCount);
      }
    });

    return counts;
  }, [prototype.components]);
  const canvasNodeIds = useMemo(
    () => new Set([...routes.map((route) => route.id), ...flowNodes.map((node) => node.id)]),
    [flowNodes, routes],
  );
  const layoutStorageKey = useMemo(
    () => getFlowLayoutStorageKey(prototype),
    [prototype.id],
  );
  const rootRef = useRef(null);
  const viewportRef = useRef(null);
  const worldRef = useRef(null);
  const overlayRef = useRef(null);
  const scaleTextRef = useRef(null);
  const fitButtonRef = useRef(null);
  const zoomGroupRef = useRef(null);
  const importInputRef = useRef(null);
  const isPanModifierActiveRef = useRef(false);
  const resetConfirmButtonRef = useRef(null);
  const viewportSignature = getPrototypeViewportSignature(prototype);
  // What the saved layout was last read for. Mounting reads it once (the
  // useState initializer); the re-read effect only runs when this changes.
  const storedLayoutSource = useMemo(
    () =>
      JSON.stringify([
        layoutStorageKey,
        viewportSignature,
        [...canvasNodeIds].sort(),
      ]),
    [canvasNodeIds, layoutStorageKey, viewportSignature],
  );
  const storedLayoutSourceRef = useRef(storedLayoutSource);
  const [draggedPositions, setDraggedPositions] = useState(() =>
    readStoredFlowLayoutPositions(layoutStorageKey, canvasNodeIds, viewportSignature),
  );
  const [focusedRouteId, setFocusedRouteId] = useState(null);
  const [isPanModifierActive, setIsPanModifierActive] = useState(false);
  const [panState, setPanState] = useState(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false);
  const [routePreviewSizes, setRoutePreviewSizes] = useState({});
  // Measured sizes that arrive while the camera moves or a frame is dragged
  // wait here and join the commit that settles the camera or ends the drag.
  const pendingSizesRef = useRef(new Map());
  // Frames whose measurements must not touch the size cache (a later canvas
  // capability, such as interact mode, suspends them by instance key).
  const measurementSuspendedFrameIdsRef = useRef(new Set());
  // Each route's resolved viewport: the size cache's initial value and the
  // height the 8x runaway guard compares with.
  const resolvedViewportsRef = useRef(new Map());
  // Level of detail. React sees the canvas size, whether the camera has
  // settled once, the hover that has dwelled long enough and a version bump
  // when live frames finish rendering; tiers are derived from them in render.
  // Hover changes and render reports that arrive while the camera moves or a
  // frame is dragged wait for the commit that ends the gesture.
  const [canvasSize, setCanvasSize] = useState(null);
  const [hasSettledCamera, setHasSettledCamera] = useState(false);
  const [hoverDwellKey, setHoverDwellKey] = useState(null);
  const [, setRenderedVersion] = useState(0);
  const hoverDwellTimerRef = useRef(0);
  const pendingHoverRef = useRef(undefined);
  const pendingDwellRef = useRef(undefined);
  const pendingRenderedRef = useRef(false);
  const renderedFramesRef = useRef(new Set());
  const loadingFrameRef = useRef(null);
  // The single load slot: a live frame loading or waiting to load keeps the
  // snapshot renderer paused, and the renderer loading its document keeps
  // live frames waiting.
  const liveLoadPendingRef = useRef(false);
  const rendererLoadingRef = useRef(false);
  const pendingCanvasSizeRef = useRef(null);
  const frameBoxesRef = useRef([]);
  const previousTiersRef = useRef(new Map());
  // Measurement suspension is per instance key; a route counts as suspended
  // while any of its instances is, because its instances share one cached
  // size and one snapshot record.
  const isRouteMeasurementSuspended = (routeId) =>
    measurementSuspendedFrameIdsRef.current.size > 0 &&
    frameBoxesRef.current.some(
      (frame) => frame.routeId === routeId && measurementSuspendedFrameIdsRef.current.has(frame.key),
    );
  // Interfaces for later canvas capabilities, all keyed by instance key: one
  // frame pinned live (interact mode), promoted frames (selection), frames
  // interacted with since their last plain load.
  const [pinnedFrameId, setPinnedFrameId] = useState(null);
  const [promotedFrameIds, setPromotedFrameIds] = useState(() => new Set());
  const interactedFrameIdsRef = useRef(new Set());
  // Route snapshots: object URLs of the snapshot images shown for frames that
  // are not live, by route; results that arrive during a gesture wait.
  // Snapshots are captured for the current story only; the flow export story
  // (Static Flow) loads the whole flow export in every route iframe.
  const currentStoryId =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("id");
  const snapshotsAllowed =
    Boolean(currentStoryId) && currentStoryId !== getPrototypeFlowExportStoryId(prototype);
  // Key prefix of this prototype's snapshot records (see getSnapshotKey).
  const snapshotPrefix = [SNAPSHOT_FORMAT_VERSION, currentStoryId, prototype.id, ""].join("|");
  const [snapshotUrls, setSnapshotUrls] = useState(() => new Map());
  // Until the cached snapshots are read (at most snapshotPreloadWaitMs) the
  // canvas layers stay hidden, so frames first appear at their cached sizes.
  const [snapshotPreload, setSnapshotPreload] = useState(snapshotsAllowed ? "pending" : "done");
  // Routes whose shown snapshot predates the latest code update.
  const [staleRoutes, setStaleRoutes] = useState(() => new Set());
  const staleRoutesRef = useRef(staleRoutes);
  staleRoutesRef.current = staleRoutes;
  const pendingSnapshotsRef = useRef(new Map());
  const pendingStaleRef = useRef(new Map());
  const pendingPreloadRef = useRef(null);
  const failedSnapshotRoutesRef = useRef(new Set());
  // routeId -> { key, record } of the stored snapshot the route shows.
  const routeRecordsRef = useRef(new Map());
  // Per route, the code update count its snapshot must reach.
  const staleVersionsRef = useRef(new Map());
  // Live frames by instance key: whether the last load used the plain route
  // preview URL and has refreshed the route's snapshot, refresh requests for
  // the capture queue, and quiet timers after the frame's storyHotUpdated.
  const liveLoadsRef = useRef(new Map());
  const liveRefreshRef = useRef(new Map());
  const liveHotTimersRef = useRef(new Map());
  const frameLiveHandlersRef = useRef(null);
  const shownSnapshotUrlsRef = useRef(new Map());
  const deferredRevokesRef = useRef(new Set());
  const rendererLayerRef = useRef(null);
  const rendererRef = useRef(null);
  const snapshotCacheRef = useRef(null);
  const snapshotHandlersRef = useRef(null);
  const syncSnapshotQueueRef = useRef(() => {});
  const handleCodeUpdateRef = useRef(() => {});
  const routePreviewSizesRef = useRef(routePreviewSizes);
  routePreviewSizesRef.current = routePreviewSizes;
  const levelOfDetailRef = useRef(null);
  levelOfDetailRef.current = {
    interactedFrameIds: interactedFrameIdsRef.current,
    measurementSuspendedFrameIds: measurementSuspendedFrameIdsRef.current,
    setPinnedFrameId,
    setPromotedFrameIds,
  };
  // Camera { x, y, z }: world point (wx, wy) draws at (wx * z + x, wy * z + y).
  // The ref is the live value; React only sees the snapshot taken once the
  // camera has been still for cameraIdleMs.
  const cameraStorageKey = getFlowCameraStorageKey(prototype);
  const [storedCamera] = useState(() => readStoredFlowCamera(cameraStorageKey));
  const cameraRef = useRef(storedCamera ?? { x: 0, y: 0, z: 1 });
  const fitTrackingRef = useRef(!storedCamera);
  const cameraFrameRef = useRef(0);
  const cameraIdleTimerRef = useRef(0);
  const gestureRef = useRef({ active: false, startZoom: 1 });
  const [cameraSnapshot, setCameraSnapshot] = useState(cameraRef.current);
  const strokeBucketRef = useRef(getZoomBucket(cameraRef.current.z));
  // Rendered edge label sizes in screen pixels, measured once per label text.
  const [labelSizes, setLabelSizes] = useState(() => new Map());
  const [isFitTracking, setIsFitTracking] = useState(!storedCamera);
  const prototypeViewport = getPrototypeViewport(prototype, null);
  const defaultPreviewHeight = prototypeViewport.height;
  const defaultPreviewWidth = prototypeViewport.width;
  const fallbackGridPitch = getFallbackGridPitch({
    height: defaultPreviewHeight + nodeHeaderHeight + nodeFrameSize,
    width: defaultPreviewWidth + nodeFrameSize,
  });
  const setPanModifierActive = useCallback((isActive) => {
    isPanModifierActiveRef.current = isActive;
    setIsPanModifierActive(isActive);
  }, []);
  const hasCustomLayout = Object.keys(draggedPositions).length > 0;
  const flowExportStoryId = getPrototypeFlowExportStoryId(prototype);
  const flowExportHref = useMemo(
    () => (flowExportStoryId ? getPrototypeFlowExportStoryUrl(prototype) : ""),
    [flowExportStoryId, prototype],
  );
  useEffect(() => {
    if (storedLayoutSourceRef.current === storedLayoutSource) {
      return;
    }

    storedLayoutSourceRef.current = storedLayoutSource;
    setDraggedPositions(
      readStoredFlowLayoutPositions(layoutStorageKey, canvasNodeIds, viewportSignature),
    );
  }, [canvasNodeIds, layoutStorageKey, storedLayoutSource, viewportSignature]);
  useEffect(() => {
    if (!hasCustomLayout) {
      setIsResetDialogOpen(false);
    }
  }, [hasCustomLayout]);
  useEffect(() => {
    if (!isResetDialogOpen) {
      return undefined;
    }

    const focusTimer = window.setTimeout(() => {
      resetConfirmButtonRef.current?.focus();
    });

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isResetDialogOpen]);
  const routePositionMap = useMemo(() => {
    const map = new Map();

    resolvedViewportsRef.current = new Map(
      routes.map((route) => [route.id, getPrototypeViewport(prototype, route)]),
    );
    routes.forEach((route, index) => {
      const position =
        draggedPositions[route.id] ??
        getRoutePosition(route, index, fallbackGridPitch);
      const routeViewport = getPrototypeViewport(prototype, route);
      const previewSize = routePreviewSizes[route.id] ?? {};
      const previewHeight = previewSize.height ?? routeViewport.height;
      const previewWidth = previewSize.width ?? routeViewport.width;

      map.set(route.id, {
        ...position,
        height: previewHeight + nodeHeaderHeight + nodeFrameSize,
        nodeType: "route",
        previewHeight,
        previewWidth,
        viewportBadge: getPrototypeViewportBadge(routeViewport),
        width: previewWidth + nodeFrameSize,
      });
    });

    flowNodes.forEach((node, index) => {
      const size = getFlowMetadataNodeSize(node);
      const position =
        draggedPositions[node.id] ??
        getRoutePosition(node, routes.length + index, fallbackGridPitch);

      map.set(node.id, {
        ...position,
        ...size,
        description: node.description,
        flowGroup: node.flowGroup,
        nodeType: "flow",
        shape: node.shape,
        title: node.title,
        tone: node.tone,
      });
    });

    return map;
  }, [
    defaultPreviewHeight,
    defaultPreviewWidth,
    draggedPositions,
    fallbackGridPitch.x,
    fallbackGridPitch.y,
    flowNodes,
    prototype,
    routePreviewSizes,
    routes,
  ]);
  const aggregatedEdges = useMemo(
    () =>
      addFlowEdgeColorVariants(
        aggregateTransitions(transitions, canvasNodeIds).filter(isVisibleFlowEdge),
      ),
    [canvasNodeIds, transitions],
  );
  const reverseEdgeKeys = useMemo(() => {
    const edgeKeys = new Set(aggregatedEdges.map((edge) => edge.key));
    return new Set(
      aggregatedEdges
        .filter((edge) => edgeKeys.has(`${edge.to}->${edge.from}`))
        .map((edge) => edge.key),
    );
  }, [aggregatedEdges]);
  const canvasMetrics = useMemo(
    () => getCanvasMetrics(routePositionMap),
    [routePositionMap],
  );
  const displayRoutePositionMap = useMemo(
    () => createDisplayRoutePositionMap(routePositionMap, canvasMetrics),
    [canvasMetrics, routePositionMap],
  );
  const flowBounds = useMemo(
    () => getFlowBounds(routePositionMap.values()),
    [routePositionMap],
  );
  // Level of detail. Tiers come from the camera snapshot React holds (it
  // changes only when the camera settles), so a gesture keeps the tiers it
  // started with and the settle commit applies the new ones. No frame is live
  // before the camera has settled once, unless a stored camera was restored
  // and the canvas has been measured.
  const frameBoxes = useMemo(
    () =>
      routes.map((route, index) => {
        const position = routePositionMap.get(route.id) ?? getRoutePosition(route, index);

        return {
          height: position.height ?? defaultNodeHeight,
          key: route.id,
          routeId: route.id,
          width: position.width ?? defaultPreviewWidth + nodeFrameSize,
          x: position.x,
          y: position.y,
        };
      }),
    [defaultPreviewWidth, routePositionMap, routes],
  );
  const cameraReady = Boolean(canvasSize) && (hasSettledCamera || Boolean(storedCamera));
  const frameTiers = useMemo(() => {
    if (initialTiers) {
      return new Map(frameBoxes.map((frame) => [frame.key, initialTiers[frame.key] ?? "snapshot"]));
    }

    if (!cameraReady) {
      return new Map(
        frameBoxes.map((frame) => [
          frame.key,
          frame.width * cameraSnapshot.z < LOD_THRESHOLDS.placeholderMaxWidth ? "placeholder" : "snapshot",
        ]),
      );
    }

    if (typeof performance !== "undefined") {
      performance.mark("pi:flow:tiers");
    }

    return selectFrameTiers({
      camera: cameraSnapshot,
      canvasSize,
      frames: frameBoxes,
      hovered: hoverDwellKey ? { dwellMs: LOD_THRESHOLDS.hoverDwellMs, key: hoverDwellKey } : null,
      pinnedId: pinnedFrameId,
      previousTiers: previousTiersRef.current,
      promotedIds: promotedFrameIds,
    });
  }, [cameraReady, cameraSnapshot, canvasSize, frameBoxes, hoverDwellKey, initialTiers, pinnedFrameId, promotedFrameIds]);
  useIsomorphicLayoutEffect(() => {
    previousTiersRef.current = frameTiers;
  }, [frameTiers]);
  // Live frames whose story has rendered keep their iframe; one more live
  // frame at a time loads (the slot stays with a frame until it renders or
  // stops being live). Frames that left the live tier lose their iframe and
  // start over when they come back.
  renderedFramesRef.current.forEach((key) => {
    if (frameTiers.get(key) !== "live") {
      renderedFramesRef.current.delete(key);
    }
  });
  liveLoadsRef.current.forEach((_load, key) => {
    if (frameTiers.get(key) !== "live") {
      liveLoadsRef.current.delete(key);
    }
  });
  if (
    loadingFrameRef.current &&
    (frameTiers.get(loadingFrameRef.current) !== "live" || renderedFramesRef.current.has(loadingFrameRef.current))
  ) {
    loadingFrameRef.current = null;
  }
  if (!loadingFrameRef.current && !rendererLoadingRef.current) {
    loadingFrameRef.current = pickLoadingFrame(frameTiers, frameBoxes, renderedFramesRef.current, {
      camera: cameraSnapshot,
      canvasSize,
      hoveredKey: hoverDwellKey,
      pinnedId: pinnedFrameId,
      promotedIds: promotedFrameIds,
    });
  }
  liveLoadPendingRef.current = frameBoxes.some(
    (frame) => frameTiers.get(frame.key) === "live" && !renderedFramesRef.current.has(frame.key),
  );
  frameBoxesRef.current = frameBoxes;
  const isGestureActive = () => Boolean(cameraIdleTimerRef.current) || Boolean(dragRef.current?.started);
  const getRouteSnapshotKey = (routeId) =>
    getSnapshotKey({
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      prototypeId: prototype.id,
      routeId,
      storyId: currentStoryId,
      viewportSignature: getPrototypeFlowLayoutViewportSignature(
        getPrototypeViewport(prototype, routes.find((entry) => entry.id === routeId) ?? null),
      ),
    });
  const hasSnapshotUrl = (routeId) => snapshotUrls.has(routeId) || pendingSnapshotsRef.current.has(routeId);
  // Updating marks change state only when they change; during a gesture they
  // wait like snapshot results.
  const setRouteStale = (routeId, isStale) => {
    const current = pendingStaleRef.current.has(routeId)
      ? pendingStaleRef.current.get(routeId)
      : staleRoutesRef.current.has(routeId);

    if (current === isStale) {
      return;
    }
    if (isGestureActive()) {
      pendingStaleRef.current.set(routeId, isStale);
      return;
    }

    setStaleRoutes((routesNow) => {
      const next = new Set(routesNow);

      if (isStale) {
        next.add(routeId);
      } else {
        next.delete(routeId);
      }
      return next;
    });
  };
  // Read by the renderer's callbacks, which outlive renders.
  snapshotHandlersRef.current = {
    isPaused: () => isGestureActive() || liveLoadPendingRef.current || document.visibilityState === "hidden",
    // The stored hash a capture compares with (unchanged markup skips drawing).
    markupHashFor: (routeId) => {
      const entry = routeRecordsRef.current.get(routeId);

      return entry && entry.key === getRouteSnapshotKey(routeId) ? entry.record.markupHash ?? null : null;
    },
    onFailure: (routeId, reason) => {
      // Not retried until the next revalidation or code update.
      failedSnapshotRoutesRef.current.add(routeId);
      console.debug(`[prototype-inspector] No snapshot of route "${routeId}": ${reason}`);
    },
    // Every finished capture revalidates the route for this page session. A
    // capture that ran on code older than the route's last code update leaves
    // (or puts) the updating mark on its tile.
    onResult: (routeId, result, { codeVersion = 0, kind = "renderer" } = {}) => {
      // A route whose measurement another canvas capability suspended keeps
      // its stored record; it is captured again after the suspension.
      if (isRouteMeasurementSuspended(routeId)) {
        return;
      }

      const key = getRouteSnapshotKey(routeId);
      const isCurrent = codeVersion >= (staleVersionsRef.current.get(routeId) ?? 0);
      const previous = routeRecordsRef.current.get(routeId);

      revalidatedSnapshotKeys.set(key, Math.max(revalidatedSnapshotKeys.get(key) ?? -1, codeVersion));
      if (result.unchanged) {
        if (previous) {
          routeRecordsRef.current.set(routeId, { ...previous, codeVersion, source: kind });
        }
        snapshotCacheRef.current?.touch(key).catch(() => {});
        if (isCurrent) {
          setRouteStale(routeId, false);
        }
        return;
      }

      // A clean live capture that differs from the renderer's capture of the
      // same code: in-place remounts leave state behind in this prototype.
      if (kind === "live" && previous?.source === "renderer" && previous.codeVersion === codeVersion) {
        console.debug(`[prototype-inspector] Route "${routeId}" differs live; snapshots reload the renderer on every switch.`);
        rendererRef.current?.reloadEverySwitch();
      }

      const url = URL.createObjectURL(result.blob);
      const record = {
        blob: result.blob,
        capturedAt: Date.now(),
        height: result.height,
        markupHash: result.markupHash,
        measuredInHeight: result.measuredInHeight,
        previewHeight: result.previewHeight,
        previewWidth: result.previewWidth,
        width: result.width,
      };

      try {
        performance.mark("pi:flow:snapshot", { detail: { routeId } });
      } catch {
        // Marks are diagnostics only.
      }
      routeRecordsRef.current.set(routeId, { codeVersion, key, record, source: kind });
      snapshotCacheRef.current?.put(key, record).catch(() => {});
      setRouteStale(routeId, !isCurrent);
      if (isGestureActive()) {
        const replaced = pendingSnapshotsRef.current.get(routeId);

        if (replaced) {
          revokeSnapshotUrlWhenSafe(replaced, deferredRevokesRef.current);
        }
        pendingSnapshotsRef.current.set(routeId, url);
        return;
      }

      setSnapshotUrls((current) => new Map(current).set(routeId, url));
    },
    onSettled: (item, outcome) => {
      if (item.kind === "live" && outcome !== "aborted" && liveRefreshRef.current.get(item.key)?.frame === item.frame) {
        liveRefreshRef.current.delete(item.key);
      }
    },
    onSize: (routeId, size) =>
      handlePreviewSizeChange(routeId, { height: size.height, width: size.width }, size.measuredInHeight ?? size.height),
    sizeFor: (routeId) => {
      const viewport = resolvedViewportsRef.current.get(routeId);
      const fallback = viewport ? { height: viewport.height, width: viewport.width } : { height: defaultPreviewHeight, width: defaultPreviewWidth };

      return { cached: routePreviewSizesRef.current[routeId] ?? null, fallback, viewportHeight: fallback.height };
    },
  };
  // Live frames refresh their route's snapshot from their own iframe: after
  // the first completed render of each plain route preview load, and after
  // their own storyHotUpdated plus a quiet period. A frame loaded from another
  // URL, or marked interacted since its last load, does not.
  const getFrameRouteId = (key) => frameBoxes.find((frame) => frame.key === key)?.routeId ?? key;
  const requestLiveRefresh = (key, iframe) => {
    if (
      !snapshotsAllowed ||
      !iframe?.isConnected ||
      !liveLoadsRef.current.get(key)?.plain ||
      interactedFrameIdsRef.current.has(key)
    ) {
      return;
    }

    liveRefreshRef.current.set(key, { frame: iframe, routeId: getFrameRouteId(key) });
    syncSnapshotQueueRef.current();
  };
  frameLiveHandlersRef.current = {
    hotUpdated: (key, iframe) => {
      const restart = () => {
        window.clearTimeout(liveHotTimersRef.current.get(key)?.timer);
        liveHotTimersRef.current.set(key, { restart, timer: window.setTimeout(run, liveHotQuietMs) });
      };
      const run = () => {
        liveHotTimersRef.current.delete(key);
        requestLiveRefresh(key, iframe);
      };

      restart();
    },
    // A plain route preview load also clears the frame's interacted mark.
    loaded: (key, iframe) => {
      const plain = iframe.getAttribute("src") === getRoutePreviewSource(getFrameRouteId(key));

      liveLoadsRef.current.set(key, { plain, refreshed: false });
      if (plain) {
        interactedFrameIdsRef.current.delete(key);
      }
    },
    rendered: (key, iframe) => {
      const load = liveLoadsRef.current.get(key);

      if (!iframe || !load || load.refreshed) {
        return;
      }

      load.refreshed = true;
      requestLiveRefresh(key, iframe);
    },
  };
  // Opening reads this prototype's stored snapshots once and shows them, at
  // their cached preview sizes, in the commit that reveals the canvas; after
  // snapshotPreloadWaitMs the canvas renders at declared sizes and late
  // records still apply. Another story or prototype starts over.
  useEffect(() => {
    if (!snapshotsAllowed) {
      setSnapshotPreload("done");
      return undefined;
    }

    const cache = createSnapshotCache({ adapter: createIndexedDbAdapter(), formatVersion: SNAPSHOT_FORMAT_VERSION });
    const routeIdsByKey = new Map(routes.map((route) => [getRouteSnapshotKey(route.id), route.id]));
    let active = true;
    let waiting = true;
    const stopWaiting = () => {
      if (waiting) {
        waiting = false;
        setSnapshotPreload("done");
      }
    };
    const timer = window.setTimeout(stopWaiting, snapshotPreloadWaitMs);

    snapshotCacheRef.current = cache;
    cache.getAllWithPrefix(snapshotPrefix).then((entries) => {
      if (!active) {
        return;
      }

      window.clearTimeout(timer);
      const urls = new Map();
      const sizes = {};

      entries.forEach(([key, record]) => {
        const routeId = routeIdsByKey.get(key);

        // A capture of this session is newer than the stored record.
        if (!routeId || !record?.blob || routeRecordsRef.current.has(routeId)) {
          return;
        }

        routeRecordsRef.current.set(routeId, { codeVersion: -1, key, record, source: "cache" });
        urls.set(routeId, URL.createObjectURL(record.blob));
        if (record.previewWidth > 0 && record.previewHeight > 0) {
          sizes[routeId] = {
            height: record.previewHeight,
            width: record.previewWidth,
            ...(typeof record.measuredInHeight === "number" ? { measuredInHeight: record.measuredInHeight } : {}),
          };
        }
      });

      // Revalidated earlier in this page session, before a code update made
      // while the UI Flow was not mounted: shown as updating.
      const codeVersion = getCodeUpdateCount();
      const outdated = [...urls.keys()].filter((routeId) => {
        const recorded = revalidatedSnapshotKeys.get(routeRecordsRef.current.get(routeId)?.key);

        return recorded !== undefined && recorded < codeVersion;
      });
      const apply = () => {
        if (Object.keys(sizes).length) {
          setRoutePreviewSizes((current) => ({ ...sizes, ...current }));
        }
        if (urls.size) {
          setSnapshotUrls((current) => new Map([...urls, ...current]));
        }
        if (outdated.length) {
          outdated.forEach((routeId) => staleVersionsRef.current.set(routeId, codeVersion));
          setStaleRoutes((current) => new Set([...current, ...outdated]));
        }
        stopWaiting();
      };

      // The hidden canvas shows no gesture (the opening fit's idle timer must
      // not delay the reveal); records that arrive after the reveal wait for
      // the end of a gesture like other async results.
      if (!waiting && isGestureActive()) {
        pendingPreloadRef.current = apply;
      } else {
        apply();
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timer);
      rendererRef.current?.destroy();
      rendererRef.current = null;
      routeRecordsRef.current = new Map();
      failedSnapshotRoutesRef.current.clear();
      liveRefreshRef.current.clear();
      pendingPreloadRef.current = null;
      pendingSnapshotsRef.current.forEach((url) => revokeSnapshotUrlWhenSafe(url, deferredRevokesRef.current));
      pendingSnapshotsRef.current.clear();
      setSnapshotUrls(new Map());
      setStaleRoutes(new Set());
      setSnapshotPreload("pending");
    };
  }, [snapshotPrefix, snapshotsAllowed]);
  // Capture order: live frames refreshing their route, then frames that are
  // not live: visible frames, frames inside the expanded viewport, then the
  // rest, each group nearest the canvas center first. A frame that is not live
  // is captured when it has no snapshot, when its snapshot was not
  // revalidated in this page session, or when it predates a code update.
  syncSnapshotQueueRef.current = () => {
    if (!snapshotsAllowed || snapshotPreload !== "done" || !rendererLayerRef.current || !canvasSize) {
      return;
    }

    const visible = getVisibleWorldRect(cameraSnapshot, canvasSize, 0);
    const expanded = getVisibleWorldRect(cameraSnapshot, canvasSize, 0.5);
    const centerX = visible.x + visible.width / 2;
    const centerY = visible.y + visible.height / 2;
    const overlaps = (frame, rect) =>
      frame.x < rect.x + rect.width && frame.x + frame.width > rect.x && frame.y < rect.y + rect.height && frame.y + frame.height > rect.y;
    const liveItems = [];

    liveRefreshRef.current.forEach((request, key) => {
      if (!request.frame.isConnected || frameTiers.get(key) !== "live") {
        liveRefreshRef.current.delete(key);
        return;
      }

      liveItems.push({ frame: request.frame, key, kind: "live", minCodeVersion: 0, routeId: request.routeId });
    });

    const seen = new Set();
    const rendererItems = frameBoxes
      .filter((frame) => {
        if (
          seen.has(frame.routeId) ||
          frameTiers.get(frame.key) === "live" ||
          failedSnapshotRoutesRef.current.has(frame.routeId) ||
          !getRoutePreviewSource(frame.routeId) ||
          (hasSnapshotUrl(frame.routeId) &&
            !staleRoutes.has(frame.routeId) &&
            isSnapshotRevalidated(getRouteSnapshotKey(frame.routeId)))
        ) {
          return false;
        }

        seen.add(frame.routeId);
        return true;
      })
      .map((frame) => ({
        distance: Math.hypot(frame.x + frame.width / 2 - centerX, frame.y + frame.height / 2 - centerY),
        group: overlaps(frame, visible) ? 0 : overlaps(frame, expanded) ? 1 : 2,
        routeId: frame.routeId,
      }))
      .sort((a, b) => a.group - b.group || a.distance - b.distance)
      .map(({ routeId }) => ({ kind: "renderer", minCodeVersion: staleVersionsRef.current.get(routeId) ?? 0, routeId }));
    const items = [...liveItems, ...rendererItems];

    if (!items.length) {
      rendererRef.current?.setQueue([]);
      return;
    }

    rendererRef.current ??= createSnapshotRenderer({
      codeVersion: getCodeUpdateCount(),
      isPaused: () => snapshotHandlersRef.current.isPaused(),
      layer: rendererLayerRef.current,
      liveCodeVersion: () => getCodeUpdateCount(),
      markupHashFor: (...args) => snapshotHandlersRef.current.markupHashFor(...args),
      onBusyChange: (isBusy) => {
        if (rootRef.current) {
          rootRef.current.dataset.snapshotQueue = isBusy ? "busy" : "idle";
        }
      },
      onFailure: (...args) => snapshotHandlersRef.current.onFailure(...args),
      onLoadingChange: (isLoading) => {
        rendererLoadingRef.current = isLoading;
        // A live frame waiting for the slot can load now.
        if (!isLoading && liveLoadPendingRef.current && !loadingFrameRef.current) {
          if (isGestureActive()) {
            pendingRenderedRef.current = true;
          } else {
            setRenderedVersion((version) => version + 1);
          }
        }
      },
      onResult: (...args) => snapshotHandlersRef.current.onResult(...args),
      onSettled: (...args) => snapshotHandlersRef.current.onSettled(...args),
      onSize: (...args) => snapshotHandlersRef.current.onSize(...args),
      routeIds: new Set(routes.map((route) => route.id)),
      sizeFor: (...args) => snapshotHandlersRef.current.sizeFor(...args),
      sourceFor: (routeId) => getRoutePreviewSource(routeId),
      storyId: currentStoryId,
    });
    rendererRef.current.setQueue(items);
  };
  useEffect(() => {
    syncSnapshotQueueRef.current();
  }, [cameraSnapshot, canvasSize, frameBoxes, frameTiers, snapshotPreload, snapshotUrls, snapshotsAllowed, staleRoutes]);
  // The renderer waits while a live frame loads; resume it once none does.
  useEffect(() => {
    if (!liveLoadPendingRef.current) {
      rendererRef.current?.resume();
    }
  });
  // A code update (Vite HMR in Storybook dev) marks every snapshot of this
  // prototype stale and queues one more capture of each route, visible
  // frames first; failed routes are tried again.
  handleCodeUpdateRef.current = () => {
    const version = getCodeUpdateCount();
    const shown = [];

    routes.forEach((route) => {
      staleVersionsRef.current.set(route.id, version);
      if (hasSnapshotUrl(route.id)) {
        shown.push(route.id);
      }
    });
    failedSnapshotRoutesRef.current.clear();
    snapshotCacheRef.current?.markStale((key) => key.startsWith(snapshotPrefix));
    rendererRef.current?.notifyCodeUpdate();
    // A live frame still in its quiet period waits again.
    liveHotTimersRef.current.forEach((entry) => entry.restart());
    if (isGestureActive()) {
      shown.forEach((routeId) => pendingStaleRef.current.set(routeId, true));
    } else if (shown.some((routeId) => !staleRoutesRef.current.has(routeId))) {
      setStaleRoutes((current) => new Set([...current, ...shown]));
    }
    syncSnapshotQueueRef.current();
  };
  useEffect(() => {
    if (!snapshotsAllowed) {
      return undefined;
    }

    return subscribeToCodeUpdates(() => handleCodeUpdateRef.current());
  }, [snapshotsAllowed]);
  // Snapshot URLs no frame shows any more are revoked once the commit that
  // replaced them is on screen.
  useIsomorphicLayoutEffect(() => {
    const previous = shownSnapshotUrlsRef.current;

    shownSnapshotUrlsRef.current = snapshotUrls;
    previous.forEach((url, routeId) => {
      if (snapshotUrls.get(routeId) !== url) {
        revokeSnapshotUrlWhenSafe(url, deferredRevokesRef.current);
      }
    });
  }, [snapshotUrls]);
  useEffect(() => {
    const resumeWhenVisible = () => {
      if (document.visibilityState === "visible") {
        rendererRef.current?.resume();
      }
    };

    document.addEventListener("visibilitychange", resumeWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", resumeWhenVisible);
      rendererRef.current?.destroy();
      rendererRef.current = null;
      liveHotTimersRef.current.forEach((entry) => window.clearTimeout(entry.timer));
      liveHotTimersRef.current.clear();
      [...shownSnapshotUrlsRef.current.values(), ...pendingSnapshotsRef.current.values()].forEach((url) =>
        revokeSnapshotUrlWhenSafe(url, deferredRevokesRef.current),
      );
      shownSnapshotUrlsRef.current = new Map();
      pendingSnapshotsRef.current.clear();
    };
  }, []);
  const writeCameraToDom = useCallback(() => {
    const camera = cameraRef.current;

    cameraFrameRef.current = 0;
    if (worldRef.current) {
      worldRef.current.style.transform = getCameraTransform(camera);
      const bucket = getZoomBucket(camera.z);

      if (bucket !== strokeBucketRef.current) {
        strokeBucketRef.current = bucket;
        worldRef.current.style.setProperty(
          "--prototype-flow-stroke-zoom",
          String(getBucketZoom(bucket)),
        );
      }
    }
    if (overlayRef.current) {
      overlayRef.current.style.setProperty("--prototype-flow-camera-x", `${camera.x}px`);
      overlayRef.current.style.setProperty("--prototype-flow-camera-y", `${camera.y}px`);
      overlayRef.current.style.setProperty("--prototype-flow-camera-zoom", String(camera.z));
    }
    if (scaleTextRef.current) {
      scaleTextRef.current.textContent = `${Math.round(camera.z * 100)}%`;
    }
    dispatchAnchorsMoved(rootRef.current);
  }, []);
  // Applies the held measurements in the caller's batch, each against the
  // size it would replace.
  const flushPendingSizes = useCallback(() => {
    if (!pendingSizesRef.current.size) {
      return;
    }

    const pending = [...pendingSizesRef.current];

    pendingSizesRef.current.clear();
    setRoutePreviewSizes((sizes) =>
      pending.reduce((next, [routeId, entry]) => applyMeasuredSize(next, routeId, entry), sizes),
    );
  }, []);
  // Hover changes, dwell and render reports held during a gesture.
  const flushPendingFrameState = useCallback(() => {
    if (pendingHoverRef.current !== undefined) {
      setFocusedRouteId(pendingHoverRef.current);
      pendingHoverRef.current = undefined;
    }
    if (pendingDwellRef.current !== undefined) {
      setHoverDwellKey(pendingDwellRef.current);
      pendingDwellRef.current = undefined;
    }
    if (pendingRenderedRef.current) {
      pendingRenderedRef.current = false;
      setRenderedVersion((version) => version + 1);
    }
    if (pendingCanvasSizeRef.current) {
      const size = pendingCanvasSizeRef.current;

      pendingCanvasSizeRef.current = null;
      setCanvasSize((current) =>
        current && Math.abs(current.width - size.width) < 1 && Math.abs(current.height - size.height) < 1
          ? current
          : size,
      );
    }
    if (pendingPreloadRef.current) {
      const applyPreload = pendingPreloadRef.current;

      pendingPreloadRef.current = null;
      applyPreload();
    }
    if (pendingSnapshotsRef.current.size) {
      const pending = [...pendingSnapshotsRef.current];

      pendingSnapshotsRef.current.clear();
      setSnapshotUrls((current) => new Map([...current, ...pending]));
    }
    if (pendingStaleRef.current.size) {
      const changes = [...pendingStaleRef.current];

      pendingStaleRef.current.clear();
      setStaleRoutes((current) => {
        const next = new Set(current);

        changes.forEach(([routeId, isStale]) => (isStale ? next.add(routeId) : next.delete(routeId)));
        return next;
      });
    }
  }, []);
  const settleCamera = useCallback(() => {
    const camera = { ...cameraRef.current };

    cameraIdleTimerRef.current = 0;
    worldRef.current?.removeAttribute("data-camera-moving");
    flushPendingSizes();
    flushPendingFrameState();
    setHasSettledCamera(true);
    setCameraSnapshot(camera);
    rendererRef.current?.resume();
    setIsFitTracking(fitTrackingRef.current);
    writeStoredFlowCamera(cameraStorageKey, camera);
  }, [cameraStorageKey, flushPendingFrameState, flushPendingSizes]);
  const setFitTracking = useCallback((isTracking) => {
    if (fitTrackingRef.current === isTracking) {
      return;
    }

    // Written to the DOM now so a gesture causes no React commit; React
    // catches up when the camera settles.
    fitTrackingRef.current = isTracking;
    fitButtonRef.current?.setAttribute("aria-pressed", String(isTracking));
  }, []);
  // Every camera change: the ref updates at once, the DOM in the next animation
  // frame (or now with `immediate`), React once the camera is still. A change
  // that is not a fit ends fit tracking.
  const setCamera = useCallback(
    (nextCamera, { fit = false, immediate = false } = {}) => {
      cameraRef.current = nextCamera;
      setFitTracking(fit);
      // A reviewer moving the camera stops an in-flight snapshot (it is
      // requeued); a fit only pauses the queue until the camera settles.
      if (!fit) {
        rendererRef.current?.abort();
      }
      if (immediate) {
        window.cancelAnimationFrame(cameraFrameRef.current);
        writeCameraToDom();
      } else {
        worldRef.current?.setAttribute("data-camera-moving", "true");
        if (!cameraFrameRef.current) {
          cameraFrameRef.current = window.requestAnimationFrame(writeCameraToDom);
        }
      }
      window.clearTimeout(cameraIdleTimerRef.current);
      cameraIdleTimerRef.current = window.setTimeout(settleCamera, cameraIdleMs);
    },
    [setFitTracking, settleCamera, writeCameraToDom],
  );
  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    setCamera(
      fitCamera(flowBounds, {
        height: viewport.clientHeight,
        width: viewport.clientWidth,
      }),
      { fit: true, immediate: true },
    );
  }, [flowBounds, setCamera]);
  const fitToViewRef = useRef(fitToView);
  fitToViewRef.current = fitToView;
  // figma-export review asks the canvas to show a comment's location (its pin
  // is off screen). Only ui-flow comments whose frame, line or point is in
  // this view are handled; anything else is left to the addon's message.
  const revealAnchorRef = useRef(null);
  revealAnchorRef.current = (event) => {
    const { anchor, view } = event.detail ?? {};
    const viewport = viewportRef.current;

    if (view !== "ui-flow" || !anchor || !viewport) {
      return;
    }

    const canvasSize = { height: viewport.clientHeight, width: viewport.clientWidth };
    const visibleRectOf = (id) => {
      const position = routePositionMap.get(id);

      return position
        ? getFrameVisibleRect(position, position.nodeType === "route" ? "route" : "flow")
        : null;
    };
    let nextCamera = null;

    if (anchor.type === "element") {
      const match = /^(?:route|node):(.+)$/.exec(anchor.id ?? "");
      const rect = match ? visibleRectOf(match[1]) : null;

      nextCamera = rect ? fitCamera(rect, canvasSize) : null;
    } else if (anchor.type === "path") {
      const key = /^edge:(.+)$/.exec(anchor.id ?? "")?.[1];
      const edge = key ? renderedEdges.find((candidate) => candidate.key === key) : null;
      const ends = edge ? [visibleRectOf(edge.from), visibleRectOf(edge.to)] : [];

      nextCamera = ends.length === 2 && ends.every(Boolean)
        ? fitCamera(getFlowBounds(ends), canvasSize)
        : null;
    } else if (anchor.type === "canvas" && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
      const { z } = cameraRef.current;

      nextCamera = {
        x: canvasSize.width / 2 - anchor.x * z,
        y: canvasSize.height / 2 - anchor.y * z,
        z,
      };
    }

    if (!nextCamera) {
      return;
    }

    event.preventDefault();
    setCamera(nextCamera, { immediate: true });
  };
  useEffect(() => {
    const handleRevealAnchor = (event) => revealAnchorRef.current?.(event);

    document.addEventListener("sbfx:reveal-anchor", handleRevealAnchor);

    return () => {
      document.removeEventListener("sbfx:reveal-anchor", handleRevealAnchor);
    };
  }, []);
  // Fit on open (unless a stored camera was restored) and re-fit whenever the
  // displayed frames change size while fit tracking is active.
  useIsomorphicLayoutEffect(() => {
    if (fitTrackingRef.current) {
      fitToView();
    }
  }, [fitToView]);
  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return undefined;
    }

    const refitWhileTracking = () => {
      if (fitTrackingRef.current) {
        fitToViewRef.current();
      }
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            refitWhileTracking();
            updateCanvasSize(viewport);
            dispatchAnchorsMoved(rootRef.current);
          });

    resizeObserver?.observe(viewport);
    window.addEventListener("resize", refitWhileTracking);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", refitWhileTracking);
    };
  }, []);
  useIsomorphicLayoutEffect(() => {
    if (viewportRef.current) {
      updateCanvasSize(viewportRef.current);
    }
  }, []);
  // The hover that has lasted LOD_THRESHOLDS.hoverDwellMs; it waits for the
  // end of a gesture that is under way when the time is up.
  useEffect(() => {
    window.clearTimeout(hoverDwellTimerRef.current);
    pendingDwellRef.current = undefined;
    if (!focusedRouteId) {
      setHoverDwellKey(null);
      return undefined;
    }

    hoverDwellTimerRef.current = window.setTimeout(() => {
      if (cameraIdleTimerRef.current || dragRef.current?.started) {
        pendingDwellRef.current = focusedRouteId;
      } else {
        setHoverDwellKey(focusedRouteId);
      }
    }, LOD_THRESHOLDS.hoverDwellMs);

    return () => window.clearTimeout(hoverDwellTimerRef.current);
  }, [focusedRouteId]);
  useEffect(
    () => () => {
      window.cancelAnimationFrame(cameraFrameRef.current);
      if (cameraIdleTimerRef.current) {
        // Unmounting mid-gesture (for example a mode switch): keep the camera.
        window.clearTimeout(cameraIdleTimerRef.current);
        writeStoredFlowCamera(cameraStorageKey, cameraRef.current);
      }
    },
    [cameraStorageKey],
  );
  // Edges anchor on what the reviewer sees: a route frame's preview rect, not
  // the empty label band at the top of its box.
  const routingPositionMap = useMemo(() => {
    const map = new Map();

    displayRoutePositionMap.forEach((position, id) => {
      map.set(
        id,
        position.nodeType === "route"
          ? { ...position, ...getFrameVisibleRect(position, "route") }
          : position,
      );
    });

    return map;
  }, [displayRoutePositionMap]);
  // Route and node titles, for the comment anchor names of transition lines.
  const canvasTitles = useMemo(
    () =>
      new Map([
        ...routes.map((route) => [route.id, route.title ?? route.id]),
        ...flowNodes.map((node) => [node.id, node.title ?? node.id]),
      ]),
    [flowNodes, routes],
  );
  const renderedEdges = useMemo(
    () =>
      aggregatedEdges
        .map((edge) => ({
          ...edge,
          polyline: createPolyline(edge, routingPositionMap, reverseEdgeKeys),
        }))
        .filter((edge) => edge.polyline),
    [aggregatedEdges, reverseEdgeKeys, routingPositionMap],
  );
  // Labels are placed for the idle camera's zoom bucket, so pans, zooms within
  // a bucket and gestures never re-run placement.
  const labelBucketZoom = getBucketZoom(getZoomBucket(cameraSnapshot.z));
  const arrowScale = 1 / labelBucketZoom;
  const labeledEdges = useMemo(() => {
    const startedAt = typeof performance === "undefined" ? 0 : performance.now();
    const placed = placeEdgeLabels(
      renderedEdges,
      displayRoutePositionMap,
      canvasMetrics,
      1 / labelBucketZoom,
      (edge) => labelSizes.get(getEdgeLabelText(edge)) ?? null,
    );

    markLabelPlacement(startedAt);
    return placed;
  }, [canvasMetrics, displayRoutePositionMap, labelBucketZoom, labelSizes, renderedEdges]);
  useIsomorphicLayoutEffect(() => {
    const overlay = overlayRef.current;

    if (!overlay) {
      return;
    }

    let next = null;

    overlay.querySelectorAll("[data-label-text]").forEach((element) => {
      const text = element.getAttribute("data-label-text");
      const sizes = next ?? labelSizes;

      if (sizes.has(text) || !element.offsetWidth || !element.offsetHeight) {
        return;
      }

      next = next ?? new Map(labelSizes);
      next.set(text, { height: element.offsetHeight, width: element.offsetWidth });
    });

    if (next) {
      setLabelSizes(next);
    }
  });
  // The single edge label visibility rule of the complete flow; a canvas
  // capability that shows another view can apply its own rule to its edges.
  const isEdgeLabelVisible = (edge) => {
    if (focusedRouteId && (edge.from === focusedRouteId || edge.to === focusedRouteId)) {
      return true;
    }

    const screenWidth = (id) => {
      const position = routePositionMap.get(id);

      if (!position) {
        return 0;
      }

      const width =
        position.nodeType === "route"
          ? getFrameVisibleRect(position, "route").width
          : position.width;

      return width * cameraSnapshot.z;
    };

    return (
      screenWidth(edge.from) >= edgeLabelMinFrameScreenWidth ||
      screenWidth(edge.to) >= edgeLabelMinFrameScreenWidth
    );
  };
  const getEdgeFocusState = (edge) => {
    if (!focusedRouteId) {
      return undefined;
    }

    return edge.from === focusedRouteId || edge.to === focusedRouteId
      ? "active"
      : "muted";
  };
  // Changes under a pixel are not a resize.
  // Canvas size changes during a gesture (for example a resize while fit
  // tracking re-fits) wait for the commit that ends it.
  const updateCanvasSize = useCallback((viewport) => {
    const size = { height: viewport.clientHeight, width: viewport.clientWidth };

    if (cameraIdleTimerRef.current || dragRef.current?.started) {
      pendingCanvasSizeRef.current = size;
      return;
    }

    setCanvasSize((current) =>
      current && Math.abs(current.width - size.width) < 1 && Math.abs(current.height - size.height) < 1
        ? current
        : size,
    );
  }, []);
  // A live frame's story has rendered: it keeps its iframe, the cover goes,
  // and the load slot moves on.
  const handleFrameLoaded = useCallback((key, iframe) => frameLiveHandlersRef.current.loaded(key, iframe), []);
  const handleFrameHotUpdated = useCallback((key, iframe) => frameLiveHandlersRef.current.hotUpdated(key, iframe), []);
  const handleFrameRendered = useCallback((key, iframe = null) => {
    frameLiveHandlersRef.current.rendered(key, iframe);
    if (renderedFramesRef.current.has(key)) {
      return;
    }

    renderedFramesRef.current.add(key);
    if (cameraIdleTimerRef.current || dragRef.current?.started) {
      pendingRenderedRef.current = true;
      return;
    }

    setRenderedVersion((version) => version + 1);
  }, []);
  const handlePreviewSizeChange = useCallback((routeId, previewSize, appliedHeight) => {
    if (isRouteMeasurementSuspended(routeId)) {
      return;
    }

    const viewport = resolvedViewportsRef.current.get(routeId);
    const entry = {
      appliedHeight,
      fallback: viewport ? { height: viewport.height, width: viewport.width } : null,
      size: previewSize,
      viewportHeight: viewport?.height ?? 0,
    };

    // A moving camera or an active drag commits nothing until it ends; the
    // latest measurement of a frame replaces the one it held.
    if (cameraIdleTimerRef.current || dragRef.current?.started) {
      pendingSizesRef.current.set(routeId, entry);
      return;
    }

    setRoutePreviewSizes((sizes) => applyMeasuredSize(sizes, routeId, entry));
  }, []);
  useEffect(() => {
    const handleWindowBlur = () => {
      setPanModifierActive(false);
      setPanState(null);
    };
    // A modal outside the canvas makes the body inert: drop any pan in flight.
    const inertObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            if (document.body.hasAttribute("inert")) {
              handleWindowBlur();
            }
          });

    window.addEventListener("blur", handleWindowBlur);
    inertObserver?.observe(document.body, { attributeFilter: ["inert"], attributes: true });

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      inertObserver?.disconnect();
    };
  }, [setPanModifierActive]);
  // Storybook's toolbar zoom scales the preview body; pointer deltas in client
  // pixels are divided by that factor to get canvas pixels.
  const getScreenScale = () => {
    const viewport = viewportRef.current;

    if (!viewport || !viewport.offsetWidth) {
      return 1;
    }

    return viewport.getBoundingClientRect().width / viewport.offsetWidth || 1;
  };
  const toCanvasPoint = (clientX, clientY) => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return { x: 0, y: 0 };
    }

    const rect = viewport.getBoundingClientRect();
    const scale = viewport.offsetWidth ? rect.width / viewport.offsetWidth || 1 : 1;

    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };
  const toCanvasPointRef = useRef(toCanvasPoint);
  toCanvasPointRef.current = toCanvasPoint;
  // Native, non-passive listeners on the flow root (React registers wheel as
  // passive): zoom wheels and Safari gestures are cancelled anywhere in the
  // root so they never zoom the Storybook page, plain wheels pan the viewport.
  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return undefined;
    }

    const isMac = isMacPlatform();
    const handleWheel = (event) => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const result = classifyWheel(event, {
        canvasHeight: viewport.clientHeight,
        gestureActive: gestureRef.current.active,
        isMac,
        overScrollable: isInScrollableArea(event.target, root),
        overViewport: viewport.contains(event.target),
      });

      if (result.preventDefault) {
        event.preventDefault();
      }

      if (result.action === "zoom") {
        setCamera(
          applyWheelZoom(
            cameraRef.current,
            event,
            toCanvasPointRef.current(event.clientX, event.clientY),
            viewport.clientHeight,
          ),
        );
      } else if (result.action === "pan") {
        const camera = cameraRef.current;

        setCamera({ ...camera, x: camera.x - result.dx, y: camera.y - result.dy });
      }
    };
    const handleGestureStart = (event) => {
      event.preventDefault();
      gestureRef.current = { active: true, startZoom: cameraRef.current.z };
    };
    const handleGestureChange = (event) => {
      event.preventDefault();
      setCamera(
        zoomAtPoint(
          cameraRef.current,
          gestureRef.current.startZoom * event.scale,
          toCanvasPointRef.current(event.clientX, event.clientY),
        ),
      );
    };
    const handleGestureEnd = (event) => {
      event.preventDefault();
      gestureRef.current = { ...gestureRef.current, active: false };
    };

    root.addEventListener("wheel", handleWheel, { passive: false });
    root.addEventListener("gesturestart", handleGestureStart, { passive: false });
    root.addEventListener("gesturechange", handleGestureChange, { passive: false });
    root.addEventListener("gestureend", handleGestureEnd, { passive: false });

    return () => {
      root.removeEventListener("wheel", handleWheel);
      root.removeEventListener("gesturestart", handleGestureStart);
      root.removeEventListener("gesturechange", handleGestureChange);
      root.removeEventListener("gestureend", handleGestureEnd);
    };
  }, [setCamera]);
  const beginPan = (event) => {
    if (isEditableEventTarget(event.target)) {
      return;
    }

    const { action, preventDefault } = classifyPointerDown(event, {
      onFrame: false,
      spaceHeld: isPanModifierActiveRef.current,
    });

    if (action !== "pan") {
      return;
    }

    if (preventDefault) {
      // Also suppresses middle-button autoscroll.
      event.preventDefault();
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPanState({
      originX: cameraRef.current.x,
      originY: cameraRef.current.y,
      pointerId: event.pointerId,
      scale: getScreenScale(),
      startX: event.clientX,
      startY: event.clientY,
    });
  };
  const updatePan = (event) => {
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setCamera({
      ...cameraRef.current,
      x: panState.originX + (event.clientX - panState.startX) / panState.scale,
      y: panState.originY + (event.clientY - panState.startY) / panState.scale,
    });
  };
  const endPan = (event) => {
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setPanState(null);
  };
  // The only storage writer: each committed layout action (drag release,
  // Reset, Import) writes once; opening or re-rendering the UI Flow never does.
  const commitLayoutPositions = (positions) => {
    setDraggedPositions(positions);
    writeStoredFlowLayout(
      layoutStorageKey,
      prototype,
      positions,
      canvasNodeIds,
      viewportSignature,
    );
  };
  // Frame drag. Between crossing the 3 px threshold and release the drag only
  // touches the DOM: the dragged frames get a transform, the edges connected
  // to them get recomputed points and their labels are hidden. Release writes
  // the integer positions in one React commit (and one storage write).
  const dragRef = useRef(null);
  const dragFrameRef = useRef(0);
  const latestRef = useRef(null);
  latestRef.current = {
    commitLayoutPositions,
    flushPendingFrameState,
    flushPendingSizes,
    arrowScale,
    displayRoutePositionMap,
    draggedPositions,
    renderedEdges,
    reverseEdgeKeys,
    routePositionMap,
    routingPositionMap,
  };
  const writeDragToDom = useCallback(() => {
    const drag = dragRef.current;

    dragFrameRef.current = 0;
    if (!drag?.started) {
      return;
    }

    const { reverseEdgeKeys: reverseKeys, routingPositionMap: routingMap } = latestRef.current;
    const shiftedMap = new Map(routingMap);

    drag.frames.forEach(({ element, id, label, labelOrigin }) => {
      const position = routingMap.get(id);

      element.style.transform = `translate(${drag.delta.x}px, ${drag.delta.y}px)`;
      if (label && labelOrigin) {
        label.style.setProperty("--prototype-flow-label-wx", `${labelOrigin.x + drag.delta.x}px`);
        label.style.setProperty("--prototype-flow-label-wy", `${labelOrigin.y + drag.delta.y}px`);
      }
      if (position) {
        shiftedMap.set(id, {
          ...position,
          x: position.x + drag.delta.x,
          y: position.y + drag.delta.y,
        });
      }
    });
    drag.edges.forEach(({ arrow, edge, line }) => {
      const polyline = createPolyline(edge, shiftedMap, reverseKeys);

      if (!polyline) {
        return;
      }

      line?.setAttribute("points", polyline.points);
      const arrowPoints = getFlowArrowPoints(polyline.pointList, latestRef.current.arrowScale);

      if (arrow && arrowPoints) {
        arrow.setAttribute("points", arrowPoints);
      }
    });
    dispatchAnchorsMoved(rootRef.current);
  }, []);
  // Puts the DOM back the way React rendered it.
  const restoreDragDom = (drag) => {
    window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = 0;
    worldRef.current?.removeAttribute("data-dragging");
    drag.frames.forEach(({ element, label, labelOrigin }) => {
      element.style.removeProperty("transform");
      element.removeAttribute("data-dragging");
      if (label && labelOrigin) {
        label.style.setProperty("--prototype-flow-label-wx", `${labelOrigin.x}px`);
        label.style.setProperty("--prototype-flow-label-wy", `${labelOrigin.y}px`);
      }
    });
    drag.edges.forEach(({ arrow, arrowPoints, label, line, linePoints }) => {
      if (line && linePoints !== null) {
        line.setAttribute("points", linePoints);
      }
      if (arrow && arrowPoints !== null) {
        arrow.setAttribute("points", arrowPoints);
      }
      label?.style.removeProperty("visibility");
    });
    dispatchAnchorsMoved(rootRef.current);
  };
  const startDragDom = (drag) => {
    const world = worldRef.current;
    const ids = new Set(drag.frames.map(({ id }) => id));
    const findByKey = (selector, key) =>
      (selector === "g" ? world : overlayRef.current)?.querySelector(
        `${selector}[data-edge-key="${CSS.escape(key)}"]`,
      ) ?? null;

    world?.setAttribute("data-dragging", "true");

    drag.edges = latestRef.current.renderedEdges
      .filter((edge) => ids.has(edge.from) || ids.has(edge.to))
      .map((edge) => {
        const group = findByKey("g", edge.key);
        const line = group?.querySelector("polyline") ?? null;
        const arrow = group?.querySelector("polygon") ?? null;
        const label = findByKey(".prototype-inspector__flow-edge-label", edge.key);

        label?.style.setProperty("visibility", "hidden");
        return {
          arrow,
          arrowPoints: arrow?.getAttribute("points") ?? null,
          edge,
          label,
          line,
          linePoints: line?.getAttribute("points") ?? null,
        };
      });
    drag.frames.forEach(({ element }) => element.setAttribute("data-dragging", "true"));
  };
  const handleFramePointerDown = useCallback((event) => {
    const id = event.currentTarget.getAttribute("data-frame-id");
    const position = latestRef.current.routePositionMap.get(id);

    if (event.button !== 0 || isPanModifierActiveRef.current || !position) {
      return;
    }

    const frameSelector = `[data-frame-id="${CSS.escape(id)}"]`;
    const element = worldRef.current?.querySelector(frameSelector) ?? event.currentTarget;
    const label = overlayRef.current?.querySelector(frameSelector) ?? null;
    const labelOrigin = label
      ? {
          x: Number.parseFloat(label.style.getPropertyValue("--prototype-flow-label-wx")),
          y: Number.parseFloat(label.style.getPropertyValue("--prototype-flow-label-wy")),
        }
      : null;

    // Pressing the frame label also grabs the frame; the pointer is captured
    // by whichever element was pressed.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    // Group drag (a later canvas capability) adds frames to this list; every
    // dragged frame moves by the same delta.
    dragRef.current = {
      delta: { x: 0, y: 0 },
      edges: [],
      frames: [{ element, id, label, labelOrigin, origin: { x: position.x, y: position.y } }],
      pointerId: event.pointerId,
      scale: getScreenScale(),
      started: false,
      startX: event.clientX,
      startY: event.clientY,
    };
  }, []);
  const handleFramePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const screenX = (event.clientX - drag.startX) / drag.scale;
      const screenY = (event.clientY - drag.startY) / drag.scale;

      if (!drag.started) {
        if (Math.hypot(screenX, screenY) < DRAG_THRESHOLD_PX) {
          return;
        }

        drag.started = true;
        setFitTracking(false);
        rendererRef.current?.abort();
        startDragDom(drag);
      }

      drag.delta = { x: screenX / cameraRef.current.z, y: screenY / cameraRef.current.z };
      if (!dragFrameRef.current) {
        dragFrameRef.current = window.requestAnimationFrame(writeDragToDom);
      }
    },
    [setFitTracking, writeDragToDom],
  );
  const handleFramePointerUp = useCallback((event) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    if (!drag.started) {
      // A click: no layout action; the fit and storage stay as they were.
      return;
    }

    restoreDragDom(drag);
    // Sizes and frame state held during the drag join the release batch.
    latestRef.current.flushPendingSizes();
    latestRef.current.flushPendingFrameState();
    rendererRef.current?.resume();
    // pointercancel coordinates are unreliable, so the last delta is used.
    const moved = drag.frames
      .map(({ id, origin }) => [
        id,
        { x: Math.round(origin.x + drag.delta.x), y: Math.round(origin.y + drag.delta.y) },
        origin,
      ])
      .filter(
        ([, next, origin]) =>
          next.x !== Math.round(origin.x) || next.y !== Math.round(origin.y),
      );

    if (moved.length === 0) {
      return;
    }

    const { commitLayoutPositions: commit, draggedPositions: positions } = latestRef.current;

    setIsFitTracking(false);
    commit({ ...positions, ...Object.fromEntries(moved.map(([id, next]) => [id, next])) });
  }, []);
  const cancelDrag = () => {
    const drag = dragRef.current;

    if (!drag?.started) {
      return;
    }

    dragRef.current = null;
    restoreDragDom(drag);
    flushPendingSizes();
    flushPendingFrameState();
    rendererRef.current?.resume();
  };
  // Content sliding under a still pointer while the camera moves changes the
  // hover only once the camera settles.
  const handleFramePointerEnter = useCallback((event) => {
    if (dragRef.current?.started) {
      return;
    }

    const frameId = event.currentTarget.getAttribute("data-frame-id");

    if (cameraIdleTimerRef.current) {
      pendingHoverRef.current = frameId;
      return;
    }

    setFocusedRouteId(frameId);
  }, []);
  const handleFramePointerLeave = useCallback(() => {
    if (dragRef.current?.started) {
      return;
    }

    if (cameraIdleTimerRef.current) {
      pendingHoverRef.current = null;
      return;
    }

    setFocusedRouteId(null);
  }, []);
  const getCanvasCenter = () => {
    const viewport = viewportRef.current;

    return viewport
      ? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
      : { x: 0, y: 0 };
  };
  const zoomByStep = (direction) => {
    const camera = cameraRef.current;

    setCamera(zoomAtPoint(camera, stepZoom(camera.z, direction), getCanvasCenter()));
  };
  const zoomIn = () => {
    zoomByStep("in");
  };
  const zoomOut = () => {
    zoomByStep("out");
  };
  const zoomTo = (zoom) => {
    setCamera(zoomAtPoint(cameraRef.current, zoom, getCanvasCenter()));
  };
  const zoomTo100 = () => {
    zoomTo(1);
  };
  const chooseZoomMenuItem = (action) => {
    setIsZoomMenuOpen(false);
    action();
  };
  useEffect(() => {
    if (!isZoomMenuOpen) {
      return undefined;
    }

    const closeOnOutsidePress = (event) => {
      if (!zoomGroupRef.current?.contains(event.target)) {
        setIsZoomMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [isZoomMenuOpen]);
  // Keyboard shortcuts are read on the preview document in the bubble phase:
  // a handled key is stopped there, before Storybook's window.onkeydown would
  // forward it to the manager. Unhandled keys propagate unchanged.
  const handleCanvasKeyRef = useRef(null);
  handleCanvasKeyRef.current = (event) => {
    // A key another listener already handled (the comment composer's Escape,
    // a dialog) performs no canvas command.
    if (event.defaultPrevented) {
      return;
    }

    const target = event.composedPath?.()[0] ?? event.target;
    const command = resolveCanvasShortcut(event, {
      dragActive: Boolean(dragRef.current?.started),
      isMac: isMacPlatform(),
      isTextEntry: isTextEntryTarget(target),
      overlayOpen: isResetDialogOpen || isZoomMenuOpen,
      targetIsControl: isControlTarget(target),
    });

    if (!command) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (command === "fit") {
      fitToView();
    } else if (command === "zoom-100") {
      zoomTo100();
    } else if (command === "zoom-in") {
      zoomIn();
    } else if (command === "zoom-out") {
      zoomOut();
    } else if (command === "pan-start") {
      setPanModifierActive(true);
    } else if (command === "pan-end") {
      setPanModifierActive(false);
    } else if (command === "close-overlay") {
      if (isZoomMenuOpen) {
        setIsZoomMenuOpen(false);
      } else {
        setIsResetDialogOpen(false);
      }
    } else if (command === "cancel-drag") {
      cancelDrag();
    }
  };
  useEffect(() => {
    const handleKey = (event) => handleCanvasKeyRef.current?.(event);

    document.addEventListener("keydown", handleKey);
    document.addEventListener("keyup", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("keyup", handleKey);
    };
  }, []);
  const openResetDialog = () => {
    if (hasCustomLayout) {
      setIsResetDialogOpen(true);
    }
  };
  const closeResetDialog = () => {
    setIsResetDialogOpen(false);
  };
  const confirmResetLayout = () => {
    commitLayoutPositions({});
    setFocusedRouteId(null);
    setIsResetDialogOpen(false);
  };
  const exportLayout = () => {
    const payload = createPrototypeFlowLayoutPayload(
      prototype.id,
      getFlowLayoutPositions(routePositionMap),
      viewportSignature,
    );
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const downloadUrl = window.URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");

    downloadLink.download = `${sanitizeFilename(prototype.id)}-ui-flow-layout.json`;
    downloadLink.href = downloadUrl;
    downloadLink.style.display = "none";
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.URL.revokeObjectURL(downloadUrl);
  };
  const openImportPicker = () => {
    importInputRef.current?.click();
  };
  const importLayout = (event) => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.addEventListener("load", () => {
      try {
        const importedLayout = JSON.parse(String(reader.result ?? ""));
        const importedPositions = normalizePrototypeFlowLayoutPositions(
          importedLayout,
          canvasNodeIds,
        );

        if (Object.keys(importedPositions).length === 0) {
          window.alert("No matching UI Flow positions were found in this file.");
          return;
        }

        commitLayoutPositions(importedPositions);
        setFocusedRouteId(null);
      } catch (error) {
        console.warn("Unable to import prototype flow layout.", error);
        window.alert("Unable to import this UI Flow layout file.");
      }
    });
    reader.readAsText(file);
  };

  // One mark per React commit of the canvas, taken when the commit lands (a
  // layout effect, before paint); bench_flow_canvas.mjs counts them to prove
  // gestures and drags run outside React rendering.
  useIsomorphicLayoutEffect(() => {
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      performance.mark("pi:flow:commit");
    }
    // A commit can move frames (layout, sizes, reset), so pins follow it.
    dispatchAnchorsMoved(rootRef.current);
  });

  if (!flow || routes.length === 0) {
    return createElement(FlowEmpty, {
      declarations: flowEmptyDeclarations,
      message: "No UI flow found for this prototype.",
    });
  }

  return createElement(
    "div",
    {
      className: "prototype-inspector prototype-inspector--flow",
      // figma-export review reads these: comments here belong to the ui-flow
      // view, and Figma export points to the Static Flow story instead.
      "data-sbfx-export": "unavailable",
      "data-sbfx-export-href": flowExportHref || undefined,
      "data-sbfx-export-label": flowExportStoryId
        ? "Open Static Flow to export this flow."
        : "Figma export is not available in UI Flow.",
      "data-sbfx-view": "ui-flow",
      // Hides the canvas layers until the cached snapshots are read.
      "data-snapshot-preload": snapshotPreload === "pending" ? "pending" : undefined,
      ref: rootRef,
      style: {
        "--prototype-inspector-active-viewport-height": `${defaultPreviewHeight}px`,
        "--prototype-inspector-active-viewport-width": `${defaultPreviewWidth}px`,
      },
    },
    // The snapshot renderer sits outside the comment canvas, under the opaque
    // viewport: figma-export draws every hooked iframe inside the canvas into
    // line and canvas comment screenshots, whatever its opacity.
    createElement("div", {
      "aria-hidden": "true",
      className: "prototype-inspector__flow-renderer-layer",
      "data-sbfx-capture-ignore": "true",
      ref: rendererLayerRef,
    }),
    createElement(
      "div",
      {
        className: "prototype-inspector__flow-viewport",
        "data-pan-mode": isPanModifierActive || panState ? "true" : undefined,
        // The complete flow: world coordinates are layout coordinates, so a
        // comment on blank canvas can be stored as a canvas point.
        "data-sbfx-canvas": "",
        "data-panning": panState ? "true" : undefined,
        onPointerCancel: endPan,
        onPointerDown: beginPan,
        onPointerMove: updatePan,
        onAuxClick: (event) => {
          if (event.button === 1) {
            event.preventDefault();
          }
        },
        onPointerUp: endPan,
        ref: viewportRef,
      },
      createElement(
        "div",
        {
          className: "prototype-inspector__flow-world",
          "data-sbfx-canvas-world": "",
          "data-zoom-low": cameraSnapshot.z < dashAnimationMinZoom ? "true" : undefined,
          ref: worldRef,
          style: {
            "--prototype-flow-stroke-zoom": getBucketZoom(getZoomBucket(cameraRef.current.z)),
            transform: getCameraTransform(cameraRef.current),
          },
        },
        createElement(
          "svg",
          {
            "aria-hidden": "true",
            className: "prototype-inspector__flow-lines",
            height: canvasMetrics.height,
            style: {
              left: `${-canvasMetrics.offsetX}px`,
              top: `${-canvasMetrics.offsetY}px`,
            },
            viewBox: `0 0 ${canvasMetrics.width} ${canvasMetrics.height}`,
            width: canvasMetrics.width,
          },
          renderedEdges.map((edge) =>
            createElement(
              "g",
              {
                "data-edge-key": edge.key,
                key: edge.key,
              },
              createElement("title", null, edge.labels.join(" / ")),
              createElement("polyline", {
                className: "prototype-inspector__flow-line",
                "data-flow-color": edge.colorVariant,
                "data-sbfx-anchor": `edge:${edge.key}`,
                "data-sbfx-anchor-kind": "path",
                "data-sbfx-anchor-label": `${canvasTitles.get(edge.from) ?? edge.from} → ${canvasTitles.get(edge.to) ?? edge.to}`,
                "data-flow-focus": getEdgeFocusState(edge),
                points: edge.polyline.points,
                style: getFlowLineStyle(edge.colorVariant, getEdgeFocusState(edge)),
              }),
              getFlowArrowPoints(edge.polyline.pointList, arrowScale)
                ? createElement("polygon", {
                    className: "prototype-inspector__flow-arrow",
                    "data-flow-color": edge.colorVariant,
                    "data-flow-focus": getEdgeFocusState(edge),
                    points: getFlowArrowPoints(edge.polyline.pointList, arrowScale),
                    style: getFlowArrowStyle(edge.colorVariant, getEdgeFocusState(edge)),
                  })
                : null,
            ),
          ),
        ),
        flowNodes.map((node, index) => {
          const position =
            routePositionMap.get(node.id) ??
            getRoutePosition(node, routes.length + index);
          const size = getFlowMetadataNodeSize(node);

          return createElement(PrototypeFlowNode, {
            height: position.height ?? size.height,
            key: node.id,
            node,
            onPointerCancel: handleFramePointerUp,
            onPointerDown: handleFramePointerDown,
            onPointerEnter: handleFramePointerEnter,
            onPointerLeave: handleFramePointerLeave,
            onPointerMove: handleFramePointerMove,
            onPointerUp: handleFramePointerUp,
            width: position.width ?? size.width,
            x: position.x,
            y: position.y,
          });
        }),
        routes.map((route, index) => {
          const position =
            routePositionMap.get(route.id) ?? getRoutePosition(route, index);

          const tier = frameTiers.get(route.id) ?? "snapshot";
          const isRendered = renderedFramesRef.current.has(route.id);
          const snapshotUrl = snapshotUrls.get(route.id) ?? null;

          return createElement(PrototypeRouteCard, {
            height: position.height ?? defaultNodeHeight,
            instanceKey: route.id,
            isAnchor: true,
            isRendered,
            isSnapshotStale: tier !== "live" && Boolean(snapshotUrl) && staleRoutes.has(route.id),
            key: route.id,
            mountIframe: tier === "live" && (isRendered || loadingFrameRef.current === route.id),
            onFrameHotUpdated: handleFrameHotUpdated,
            onFrameLoaded: handleFrameLoaded,
            onFrameRendered: handleFrameRendered,
            onPointerCancel: handleFramePointerUp,
            onPointerDown: handleFramePointerDown,
            onPointerEnter: handleFramePointerEnter,
            onPointerLeave: handleFramePointerLeave,
            onPointerMove: handleFramePointerMove,
            onPointerUp: handleFramePointerUp,
            onPreviewSizeChange: handlePreviewSizeChange,
            previewHeight: position.previewHeight ?? defaultPreviewHeight,
            previewSource: getRoutePreviewSource(route.id),
            previewWidth: position.previewWidth ?? defaultPreviewWidth,
            route,
            snapshotUrl,
            tier,
            width: position.width ?? defaultPreviewWidth + nodeFrameSize,
            x: position.x,
            y: position.y,
          });
        }),
      ),
      createElement(
        "div",
        {
          className: "prototype-inspector__flow-overlay",
          ref: overlayRef,
          style: {
            "--prototype-flow-camera-x": `${cameraRef.current.x}px`,
            "--prototype-flow-camera-y": `${cameraRef.current.y}px`,
            "--prototype-flow-camera-zoom": cameraRef.current.z,
          },
        },
        labeledEdges.map((edge) =>
          createElement(
            "div",
            {
              className: "prototype-inspector__flow-edge-label",
              "data-edge-key": edge.key,
              "data-figma-layout-sizing-horizontal": "hug",
              "data-figma-layout-sizing-vertical": "hug",
              "data-figma-layout-strategy": "auto-layout",
              "data-flow-color": edge.colorVariant,
              "data-flow-focus": getEdgeFocusState(edge),
              "data-hidden": isEdgeLabelVisible(edge) ? undefined : "true",
              "data-label-text": getEdgeLabelText(edge),
              key: `${edge.key}-label`,
              style: {
                "--prototype-flow-label-wx": `${edge.polyline.labelPosition.x - canvasMetrics.offsetX}px`,
                "--prototype-flow-label-wy": `${edge.polyline.labelPosition.y - canvasMetrics.offsetY}px`,
              },
              title: edge.triggers.join(" / "),
            },
            createElement(
              "span",
              { "data-figma-text-auto-width": "true" },
              getEdgeLabelPrefix(edge),
            ),
            createElement(
              "strong",
              { "data-figma-text-auto-width": "true" },
              edge.labels.join(" / "),
            ),
          ),
        ),
        routes.map((route, index) => {
          const position =
            routePositionMap.get(route.id) ?? getRoutePosition(route, index);
          const box = {
            height: position.height ?? defaultNodeHeight,
            width: position.width ?? defaultPreviewWidth + nodeFrameSize,
            x: position.x,
            y: position.y,
          };
          const visible = getFrameVisibleRect(box, "route");
          const isHovered = focusedRouteId === route.id;

          return createElement(PrototypeFrameLabel, {
            componentCount: routeComponentCounts.get(route.id) ?? 0,
            isHidden:
              !isHovered && visible.width * cameraSnapshot.z < frameLabelMinScreenWidth,
            isHovered,
            isUpdating:
              frameTiers.get(route.id) !== "live" && snapshotUrls.has(route.id) && staleRoutes.has(route.id),
            key: route.id,
            onPointerCancel: handleFramePointerUp,
            onPointerDown: handleFramePointerDown,
            onPointerEnter: handleFramePointerEnter,
            onPointerLeave: handleFramePointerLeave,
            onPointerMove: handleFramePointerMove,
            onPointerUp: handleFramePointerUp,
            route,
            viewportBadge: position.viewportBadge ?? null,
            visibleWidth: visible.width,
            x: visible.x,
            y: visible.y,
          });
        }),
      ),
    ),
    createElement(
      "div",
      {
        className: "prototype-inspector__flow-control-layer",
        // A pointer press keeps keyboard focus where it was (Tab still reaches
        // the controls), so Space keeps panning after a click on Zoom in.
        onPointerDown: (event) => {
          if (event.target instanceof Element && event.target.closest("button")) {
            event.preventDefault();
          }
        },
      },
      createElement(
        "div",
        {
          className:
            "prototype-inspector__flow-controls prototype-inspector__flow-controls--zoom",
          ref: zoomGroupRef,
          role: "group",
          "aria-label": "UI Flow zoom controls",
        },
        createElement(
          "button",
          {
            "aria-label": "Zoom out",
            onClick: zoomOut,
            title: "Zoom out (-)",
            type: "button",
          },
          "-",
        ),
        // Visible text is the live percentage; the accessible name reads
        // "Zoom menu <percentage>".
        createElement(
          "button",
          {
            "aria-expanded": isZoomMenuOpen,
            "aria-haspopup": "menu",
            className: "prototype-inspector__flow-scale",
            onClick: () => setIsZoomMenuOpen((isOpen) => !isOpen),
            title: "Zoom menu",
            type: "button",
          },
          createElement(
            "span",
            { className: "prototype-inspector__visually-hidden" },
            "Zoom menu ",
          ),
          createElement(
            "span",
            { ref: scaleTextRef },
            `${Math.round(cameraRef.current.z * 100)}%`,
          ),
        ),
        createElement(
          "button",
          {
            "aria-label": "Zoom in",
            onClick: zoomIn,
            title: "Zoom in (=)",
            type: "button",
          },
          "+",
        ),
        createElement(
          "button",
          {
            "aria-label": "Fit canvas",
            "aria-pressed": isFitTracking,
            onClick: fitToView,
            ref: fitButtonRef,
            title: "Fit canvas (Shift+1)",
            type: "button",
          },
          "Fit",
        ),
        createElement(
          "div",
          {
            "aria-label": "Zoom",
            className: "prototype-inspector__flow-zoom-menu",
            hidden: !isZoomMenuOpen,
            role: "menu",
          },
          [
            ["Zoom to fit", "Shift+1", fitToView],
            ["50%", null, () => zoomTo(0.5)],
            ["100%", "Shift+0", zoomTo100],
            ["200%", null, () => zoomTo(2)],
          ].map(([label, shortcut, action]) =>
            createElement(
              "button",
              {
                className: "prototype-inspector__flow-zoom-menu-item",
                key: label,
                onClick: () => chooseZoomMenuItem(action),
                role: "menuitem",
                type: "button",
              },
              createElement("span", null, label),
              shortcut ? createElement("kbd", null, shortcut) : null,
            ),
          ),
          createElement(
            "dl",
            { className: "prototype-inspector__flow-zoom-menu-help" },
            [
              ["Zoom", "Pinch, ⌘/Ctrl + scroll, = / -"],
              ["Pan", "Two-finger scroll, Space + drag, middle-button drag"],
              ["Fit / 100%", "Shift+1 / Shift+0"],
            ].map(([term, detail]) =>
              createElement(
                "div",
                { key: term },
                createElement("dt", null, term),
                createElement("dd", null, detail),
              ),
            ),
          ),
        ),
      ),
      createElement(
        "div",
        {
          className:
            "prototype-inspector__flow-controls prototype-inspector__flow-controls--layout",
          role: "group",
          "aria-label": "UI Flow layout controls",
        },
        createElement("input", {
          accept: "application/json,.json",
          className: "prototype-inspector__flow-import-input",
          onChange: importLayout,
          ref: importInputRef,
          type: "file",
        }),
        createElement(
          "button",
          {
            "aria-label": "Reset UI Flow layout",
            disabled: !hasCustomLayout,
            onClick: openResetDialog,
            title: "Reset layout",
            type: "button",
          },
          "Reset Layout",
        ),
        createElement(
          "button",
          {
            "aria-label": "Import UI Flow layout",
            onClick: openImportPicker,
            title: "Import layout JSON",
            type: "button",
          },
          "Import Layout",
        ),
        createElement(
          "button",
          {
            "aria-label": "Export UI Flow layout",
            onClick: exportLayout,
            title: "Export layout JSON",
            type: "button",
          },
          "Export Layout",
        ),
        flowExportStoryId
          ? createElement(
              "button",
              {
                "aria-label": "Open Static Flow story for Figma export",
                className: "prototype-inspector__flow-export-button",
                onClick: () => openPrototypeFlowExportStory(prototype),
                title: "Open sibling Static Flow story for Figma export",
                type: "button",
              },
              "Open Static Flow",
            )
          : null,
      ),
    ),
    createElement(
      "div",
      { className: "prototype-inspector__flow-dialog-layer" },
      isResetDialogOpen
        ? createElement(
            "div",
            {
              className: "prototype-inspector__flow-reset-dialog-backdrop",
              onPointerDown: (event) => {
                if (event.target === event.currentTarget) {
                  closeResetDialog();
                }
              },
            },
            createElement(
              "section",
              {
                "aria-describedby": "prototype-flow-reset-description",
                "aria-labelledby": "prototype-flow-reset-title",
                "aria-modal": "true",
                className: "prototype-inspector__flow-reset-dialog",
                onPointerDown: (event) => event.stopPropagation(),
                role: "dialog",
              },
              createElement(
                "div",
                { className: "prototype-inspector__flow-reset-dialog-copy" },
                createElement(
                  "h2",
                  { id: "prototype-flow-reset-title" },
                  "Reset UI Flow layout?",
                ),
                createElement(
                  "p",
                  { id: "prototype-flow-reset-description" },
                  "This will clear the saved canvas positions and restore the default flow layout.",
                ),
              ),
              createElement(
                "div",
                { className: "prototype-inspector__flow-reset-dialog-actions" },
                createElement(
                  "button",
                  {
                    className:
                      "prototype-inspector__flow-reset-dialog-confirm",
                    onClick: confirmResetLayout,
                    ref: resetConfirmButtonRef,
                    type: "button",
                  },
                  "Reset",
                ),
                createElement(
                  "button",
                  {
                    className:
                      "prototype-inspector__flow-reset-dialog-cancel",
                    onClick: closeResetDialog,
                    type: "button",
                  },
                  "Cancel",
                ),
              ),
            ),
          )
        : null,
    ),
  );
}

// UI Flow's own empty state (preview.js keeps PrototypeEmpty for the other
// modes; importing it back would create a module cycle).
function FlowEmpty({ declarations, message }) {
  return createElement(
    "div",
    { className: "prototype-inspector prototype-inspector--empty", ...declarations },
    createElement("p", { className: "prototype-inspector__empty" }, message),
  );
}
