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
  computeAutoLayout,
  computeSectionShapes,
  computeSnap,
  createLayoutHistory,
  computeJourneyLayout,
  createPolyline,
  deriveBranchJourneys,
  defaultNodeHeight,
  defaultPrototypeModeGlobalName,
  DRAG_THRESHOLD_PX,
  fitCamera,
  getAdjacentRouteId,
  getAdjacentStepIndex,
  getAutoLayoutFrameSize,
  getEdgeLabelPrefix,
  getFallbackGridPitch,
  getJourneyBounds,
  getJourneyEdges,
  getMarqueeSelection,
  getMinimapTransform,
  getSnapThreshold,
  nudgeOffset,
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
  isJourneyLabelHidden,
  isRecord,
  isVisibleFlowEdge,
  LOD_THRESHOLDS,
  minimapPointToWorld,
  MAX_ZOOM,
  MIN_ZOOM,
  nodeFrameSize,
  nodeHeaderHeight,
  normalizeComponentRoutes,
  normalizeFlowNodes,
  normalizeJourneys,
  normalizeRouteComponents,
  normalizeRoutes,
  normalizeStorybookGlobals,
  normalizeTransitions,
  placeEdgeLabels,
  resolveAutoLayoutLanes,
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
  instanceKey = node.id,
  isAnchor = true,
  isSelected = false,
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
      "data-frame-id": instanceKey,
      // A journey view anchors comments to the first instance of a node only.
      ...(isAnchor
        ? { "data-sbfx-anchor": `node:${node.id}`, "data-sbfx-anchor-label": node.title ?? node.id }
        : {}),
      "data-selected": isSelected ? "true" : undefined,
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
  isSelected = false,
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
      "data-selected": isSelected ? "true" : undefined,
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

// The journey list selection of a prototype in this tab: "all",
// "declared:<journey id>" or a derived journey key (flow-journey-focus).
const flowJourneyStoragePrefix = "prototype-inspector:flow-journey:";

function getFlowJourneyStorageKey(prototype) {
  return `${flowJourneyStoragePrefix}${prototype.id}`;
}

function readStoredFlowJourney(storageKey) {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(storageKey);
  } catch (error) {
    return null;
  }
}

function writeStoredFlowJourney(storageKey, entryKey) {
  try {
    window.sessionStorage.setItem(storageKey, entryKey);
  } catch (error) {
    // Without sessionStorage every mount starts at the complete flow.
  }
}

// Auto layout feature names (flow-auto-layout), stored beside the layout
// under the same normalized prototype id: { version: 1, viewport, labels }.
const flowLanesStoragePrefix = "prototype-inspector:flow-lanes:";
// Names fit in 216 px plus their 24 px gap; a fit keeps this much room free
// at the canvas's left edge while names are shown.
const laneLabelReservePx = 240;

function getFlowLanesStorageKey(layoutStorageKey) {
  const marker = "flow-layout:";

  return `${flowLanesStoragePrefix}${layoutStorageKey.slice(layoutStorageKey.indexOf(marker) + marker.length)}`;
}

function normalizeLaneLabels(labels, nodeIds = null) {
  return Array.isArray(labels)
    ? labels.filter(
        (label) =>
          isRecord(label) &&
          typeof label.key === "string" &&
          typeof label.title === "string" &&
          typeof label.anchor === "string" &&
          (!nodeIds || nodeIds.has(label.anchor)),
      )
    : [];
}

// The stored names, or null when missing, malformed, unreadable or saved for
// another viewport (an unsigned record counts as the phone frame; a flow
// without a signature accepts any record). Reading never writes.
function readStoredFlowLanes(storageKey, expectedViewport) {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");

    if (!isRecord(value) || value.version !== 1) {
      return null;
    }

    const signature = typeof value.viewport === "string" ? value.viewport : "phone:375x812";

    if (expectedViewport != null && signature !== expectedViewport) {
      return null;
    }

    const labels = normalizeLaneLabels(value.labels);

    return labels.length ? labels : null;
  } catch (error) {
    return null;
  }
}

function writeStoredFlowLanes(storageKey, labels, viewportSignature) {
  try {
    if (!labels?.length) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify({ labels, version: 1, viewport: viewportSignature ?? null }));
  } catch (error) {
    // Without localStorage the names live for this page only.
  }
}

// Minimap and section preferences (flow-canvas-editing): "shown" or
// "hidden" per browser; missing or unreadable means the default.
const flowMinimapStorageKey = "prototype-inspector:flow-minimap";
const flowSectionsStorageKey = "prototype-inspector:flow-sections";
// The minimap panel in CSS pixels (176 x 120, the size the CSS gives it).
const minimapPanelSize = Object.freeze({ height: 120, width: 176 });

function readStoredPreference(storageKey) {
  try {
    const value = typeof window === "undefined" ? null : window.localStorage.getItem(storageKey);

    return value === "shown" || value === "hidden" ? value : null;
  } catch (error) {
    return null;
  }
}

function writeStoredPreference(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch (error) {
    // Without localStorage the choice lasts for this page only.
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
  frameId = null,
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
      "data-frame-id": frameId ?? route.id,
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

// Journey edges: transitions draw like the complete flow in the primary color;
// a step pair without a transition is a static dotted line in the outline color.
function getJourneyLineStyle(edge, focus) {
  const style = getFlowLineStyle("primary", focus);

  return edge.dotted
    ? {
        ...style,
        stroke: "var(--pi-sys-color-outline-strong)",
        strokeDasharray: "0 calc(var(--pi-sys-spacing-sm) / var(--prototype-flow-stroke-zoom, 1))",
        strokeLinecap: "round",
      }
    : style;
}

// The invisible, wider stroke that shows a journey label's full text on hover.
const journeyEdgeHitStyle = {
  fill: "none",
  stroke: "var(--pi-sys-color-transparent)",
  strokeWidth: "calc(var(--pi-sys-spacing-md) / var(--prototype-flow-stroke-zoom, 1))",
};

// A flow group section's fill: inline, so comment screenshots keep it.
const sectionFillStyle = { fill: "var(--pi-sys-color-surface-raised)" };

// The journey list (flow-journey-focus): a column beside the canvas viewport
// with "全部", the declared journeys and the derived journeys grouped by
// branch node. Visible copy is Traditional Chinese, accessible names English.
function PrototypeJourneyList({ derivedTruncatedCount, detail, entries, isCollapsed, onSelect, onToggle, selectedKey }) {
  const declared = entries.filter((entry) => entry.kind === "declared");
  const groups = [];

  entries
    .filter((entry) => entry.kind === "derived")
    .forEach((entry) => {
      const group = groups.find((candidate) => candidate.branchId === entry.branchId);

      if (group) {
        group.entries.push(entry);
      } else {
        groups.push({ branchId: entry.branchId, entries: [entry], title: entry.branchTitle });
      }
    });

  const renderEntry = (entry) => {
    const isSelected = entry.key === selectedKey;

    return createElement(
      "li",
      { key: entry.key },
      createElement(
        "button",
        {
          "aria-label": entry.kind === "all" ? "All" : entry.title,
          "aria-pressed": isSelected,
          className: "prototype-inspector__flow-journey",
          onClick: () => onSelect(entry.key),
          type: "button",
        },
        createElement("span", { className: "prototype-inspector__flow-journey-title" }, entry.title),
        entry.steps
          ? createElement("span", { className: "prototype-inspector__flow-journey-count" }, `${entry.steps.length} 步`)
          : null,
      ),
      isSelected && detail
        ? createElement(
            "ol",
            { className: "prototype-inspector__flow-journey-steps" },
            detail.steps.map((step, index) =>
              createElement(
                "li",
                { key: step.key },
                createElement("span", null, step.title),
                step.edgeText
                  ? createElement("span", { className: "prototype-inspector__flow-journey-step-edge" }, `↓ ${step.edgeText}`)
                  : null,
                index === detail.steps.length - 1 && detail.loopText
                  ? createElement("span", { className: "prototype-inspector__flow-journey-step-loop" }, detail.loopText)
                  : null,
              ),
            ),
          )
        : null,
    );
  };

  return createElement(
    "section",
    {
      "aria-label": "UI Flow journeys",
      className: "prototype-inspector__flow-journeys",
      // Comment screenshots leave the list out; comments stay available.
      "data-sbfx-capture-ignore": "true",
      role: "region",
    },
    createElement(
      "div",
      { className: "prototype-inspector__flow-journeys-header" },
      isCollapsed ? null : createElement("h2", null, "功能流程"),
      createElement(
        "button",
        {
          "aria-expanded": !isCollapsed,
          "aria-label": isCollapsed ? "Expand journey list" : "Collapse journey list",
          className: "prototype-inspector__flow-journeys-toggle",
          onClick: onToggle,
          type: "button",
        },
        isCollapsed ? "›" : "‹",
      ),
    ),
    isCollapsed
      ? null
      : createElement(
          "div",
          { className: "prototype-inspector__flow-journeys-body" },
          createElement("ul", null, entries.filter((entry) => entry.kind === "all").map(renderEntry), declared.map(renderEntry)),
          groups.length
            ? createElement(
                "div",
                { className: "prototype-inspector__flow-journeys-derived" },
                createElement("h3", null, "自動分支"),
                groups.map((group) =>
                  createElement(
                    "div",
                    { className: "prototype-inspector__flow-journeys-group", key: group.branchId },
                    createElement("h4", null, group.title),
                    createElement("ul", null, group.entries.map(renderEntry)),
                  ),
                ),
                derivedTruncatedCount > 0
                  ? createElement(
                      "p",
                      { className: "prototype-inspector__flow-journeys-note" },
                      `另有 ${derivedTruncatedCount} 條未列出，建議在 flow 宣告 journeys`,
                    )
                  : null,
              )
            : null,
        ),
  );
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

// initialTiers (instance key -> tier) and initialSelection (instance keys)
// are for test_flow_canvas_ssr.mjs only: they replace the computed level of
// detail and the empty selection so server renders can show them.
export function PrototypeFlow({ initialSelection = null, initialTiers = null, prototype }) {
  const flow = prototype.flow;
  const routes = useMemo(() => normalizeRoutes(flow), [flow]);
  const flowNodes = useMemo(() => normalizeFlowNodes(flow), [flow]);
  const transitions = useMemo(() => normalizeTransitions(flow), [flow]);
  // Feature journeys (flow-journey-focus): "全部", the declared journeys, then
  // one derived journey per branch edge that no declaration covers. Selecting
  // one shows a read-only, single-line view of its steps.
  const journeyStorageKey = getFlowJourneyStorageKey(prototype);
  const declaredJourneys = useMemo(() => normalizeJourneys(flow), [flow]);
  const derivedJourneys = useMemo(
    () => deriveBranchJourneys(flow, { declared: declaredJourneys }),
    [declaredJourneys, flow],
  );
  const journeyEntries = useMemo(
    () => [
      { key: "all", kind: "all", title: "全部" },
      ...declaredJourneys.map((journey) => ({
        key: `declared:${journey.id}`,
        kind: "declared",
        loopTarget: null,
        steps: journey.steps,
        title: journey.title,
      })),
      ...derivedJourneys.journeys.map((journey) => ({
        branchId: journey.branchId,
        branchTitle: journey.branchTitle,
        key: journey.key,
        kind: "derived",
        loopTarget: journey.loopTarget ?? null,
        steps: journey.steps,
        title: journey.title,
      })),
    ],
    [declaredJourneys, derivedJourneys],
  );
  const hasJourneyList = journeyEntries.length > 1;
  // The stored entry is read once; a stored entry that no longer exists falls
  // back to the complete flow here, in render, without another commit.
  const [selectedJourneyKey, setSelectedJourneyKey] = useState(
    () => readStoredFlowJourney(journeyStorageKey) ?? "all",
  );
  const activeJourney = hasJourneyList
    ? (journeyEntries.find((entry) => entry.kind !== "all" && entry.key === selectedJourneyKey) ?? null)
    : null;
  const journeyFocusKey = activeJourney ? activeJourney.key : "all";
  // A journey view is a read-only view (flow-canvas-navigation): no frame
  // drag, Reset and Import disabled, and the camera is not remembered.
  const isReadOnlyView = Boolean(activeJourney);
  const journeyFocusRef = useRef(activeJourney);
  journeyFocusRef.current = activeJourney;
  const [isJourneyListCollapsed, setIsJourneyListCollapsed] = useState(false);
  const frameTitles = useMemo(
    () =>
      new Map([
        ...routes.map((route) => [route.id, route.title ?? route.id]),
        ...flowNodes.map((node) => [node.id, node.title ?? node.id]),
      ]),
    [flowNodes, routes],
  );
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
  // The saved positions as of the latest commit, also between a commit and
  // the render it causes (two layout actions can commit in one event).
  const savedPositionsRef = useRef(draggedPositions);
  savedPositionsRef.current = draggedPositions;
  // Auto layout (flow-auto-layout): the stored feature names, the dialog
  // asked when a saved layout exists, and the snapshot Undo restores while
  // its notice is shown.
  const lanesStorageKey = getFlowLanesStorageKey(layoutStorageKey);
  const [laneLabels, setLaneLabels] = useState(() => readStoredFlowLanes(lanesStorageKey, viewportSignature));
  const [isAutoLayoutDialogOpen, setIsAutoLayoutDialogOpen] = useState(false);
  // Minimap: the stored choice, else shown for 8 frames or more.
  const [minimapPreference, setMinimapPreference] = useState(() => readStoredPreference(flowMinimapStorageKey));
  const minimapRef = useRef(null);
  const minimapViewportRef = useRef(null);
  const minimapStateRef = useRef({ content: null, drag: null });
  // Flow group sections: shown unless the stored choice hides them; the
  // rendered frames and shapes are kept for drags and nudges.
  const [sectionsPreference, setSectionsPreference] = useState(() => readStoredPreference(flowSectionsStorageKey));
  const sectionsRef = useRef({ frames: [], sections: [] });
  const [autoLayoutUndo, setAutoLayoutUndo] = useState(null);
  const autoLayoutConfirmButtonRef = useRef(null);
  // The frame sizes the last auto layout of this mount used, while no later
  // layout action changed its result: a frame measured larger afterwards
  // (a route measured after applying) arranges the flow again.
  const autoLayoutBasisRef = useRef(null);
  // Layout undo history (flow-canvas-editing), in memory for this mount.
  const historyRef = useRef(null);
  historyRef.current ??= createLayoutHistory(100);
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
  // Frame selection (flow-canvas-editing): instance keys, changed only when a
  // press, a marquee or a key ends; selected routes are promoted frames.
  const [selection, setSelection] = useState(() => new Set(initialSelection ?? []));
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const tierPromotedIds = useMemo(
    () => (selection.size ? new Set([...promotedFrameIds, ...selection]) : promotedFrameIds),
    [promotedFrameIds, selection],
  );
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
  // Only the complete flow restores its camera; a journey view opens fitted.
  // fullCameraRef keeps the complete-flow camera while a journey is shown.
  const [restoredCamera] = useState(() => (journeyFocusRef.current ? null : storedCamera));
  const fullCameraRef = useRef(storedCamera);
  // Whether the complete flow was fit tracking when the reviewer left it; it
  // then fits again on return instead of taking back a stale fitted camera.
  const fullFitTrackingRef = useRef(!storedCamera);
  const cameraRef = useRef(restoredCamera ?? { x: 0, y: 0, z: 1 });
  const fitTrackingRef = useRef(!restoredCamera);
  const cameraFrameRef = useRef(0);
  const cameraIdleTimerRef = useRef(0);
  const gestureRef = useRef({ active: false, startZoom: 1 });
  const [cameraSnapshot, setCameraSnapshot] = useState(cameraRef.current);
  const strokeBucketRef = useRef(getZoomBucket(cameraRef.current.z));
  // Rendered edge label sizes in screen pixels, measured once per label text.
  const [labelSizes, setLabelSizes] = useState(() => new Map());
  const [isFitTracking, setIsFitTracking] = useState(!restoredCamera);
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
    setLaneLabels(readStoredFlowLanes(lanesStorageKey, viewportSignature));
    setAutoLayoutUndo(null);
    autoLayoutBasisRef.current = null;
    setSelection(new Set());
    historyRef.current.clear();
  }, [canvasNodeIds, lanesStorageKey, layoutStorageKey, storedLayoutSource, viewportSignature]);
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
  useEffect(() => {
    if (!isAutoLayoutDialogOpen) {
      return undefined;
    }

    const focusTimer = window.setTimeout(() => {
      autoLayoutConfirmButtonRef.current?.focus();
    });

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isAutoLayoutDialogOpen]);
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
  // The selected journey's single-line layout, computed from the cached frame
  // sizes and never written to the layout payload.
  const journeyLayout = useMemo(() => {
    if (!activeJourney) {
      return null;
    }

    const sizeOf = (id) => {
      const box = routePositionMap.get(id) ?? { height: defaultNodeHeight, width: defaultPreviewWidth + nodeFrameSize };
      const visible = getFrameVisibleRect(
        { height: box.height, width: box.width, x: 0, y: 0 },
        box.nodeType === "route" ? "route" : "flow",
      );

      return {
        height: box.height,
        visibleHeight: visible.height,
        visibleLeft: visible.x,
        visibleTop: visible.y,
        visibleWidth: visible.width,
        width: box.width,
      };
    };
    const layout = computeJourneyLayout(activeJourney.steps, sizeOf);
    const { edges, loopMarker } = getJourneyEdges(layout, transitions, {
      loopTarget: activeJourney.loopTarget,
      titleOf: (id) => frameTitles.get(id) ?? id,
    });
    // The first instance of each route or node carries its comment anchor.
    const anchorKeys = new Set();
    const seenSteps = new Set();

    for (const step of layout) {
      if (!seenSteps.has(step.nodeId)) {
        seenSteps.add(step.nodeId);
        anchorKeys.add(step.instanceKey);
      }
    }

    return { anchorKeys, bounds: getJourneyBounds(layout, { loopMarker }), edges, layout, loopMarker };
  }, [activeJourney, defaultPreviewWidth, frameTitles, routePositionMap, transitions]);
  // What fitting frames: the journey in a journey view, else the whole flow.
  const displayedBounds = journeyLayout?.bounds ?? flowBounds;
  // Feature names whose anchor frame is in the flow, on the complete flow only.
  const shownLaneLabels = useMemo(
    () => (activeJourney || !laneLabels ? [] : laneLabels.filter((label) => routePositionMap.has(label.anchor))),
    [activeJourney, laneLabels, routePositionMap],
  );
  const laneLabelReserve = shownLaneLabels.length ? laneLabelReservePx : 0;
  // Flow group sections, on the complete flow only. Route groups come from
  // the routes array (route positions carry no flowGroup); a section wraps
  // its members' frame boxes, and its name avoids the frame label that sits
  // on the top member's visible rect.
  const showSections = sectionsPreference !== "hidden";
  const sectionFrames = useMemo(() => {
    if (activeJourney || !showSections) {
      return [];
    }

    const routeGroups = new Map(routes.map((route) => [route.id, route.flowGroup]));

    return [...routePositionMap].map(([id, position]) => {
      const type = position.nodeType === "route" ? "route" : "flow";

      return {
        group: type === "route" ? routeGroups.get(id) : position.flowGroup,
        height: position.height ?? defaultNodeHeight,
        id,
        labelY: getFrameVisibleRect(position, type).y,
        type,
        width: position.width ?? defaultPreviewWidth + nodeFrameSize,
        x: position.x,
        y: position.y,
      };
    });
  }, [activeJourney, routePositionMap, routes, showSections]);
  const sections = useMemo(() => computeSectionShapes(sectionFrames), [sectionFrames]);
  const sectionBounds = sections.length ? getFlowBounds(sections.flatMap((section) => section.rects)) : null;
  // An auto layout name for the same flowGroup replaces the section name.
  const laneGroupNames = new Set(shownLaneLabels.map((label) => label.key));

  sectionsRef.current = { frames: sectionFrames, sections };
  // Level of detail. Tiers come from the camera snapshot React holds (it
  // changes only when the camera settles), so a gesture keeps the tiers it
  // started with and the settle commit applies the new ones. No frame is live
  // before the camera has settled once, unless a stored camera was restored
  // and the canvas has been measured.
  const routeIdSet = useMemo(() => new Set(routes.map((route) => route.id)), [routes]);
  const frameBoxes = useMemo(
    () =>
      journeyLayout
        ? journeyLayout.layout
            .filter((step) => routeIdSet.has(step.nodeId))
            .map((step) => ({
              height: step.height,
              key: step.instanceKey,
              routeId: step.nodeId,
              width: step.width,
              x: step.x,
              y: step.y,
            }))
        : routes.map((route, index) => {
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
    [defaultPreviewWidth, journeyLayout, routeIdSet, routePositionMap, routes],
  );
  const cameraReady = Boolean(canvasSize) && (hasSettledCamera || Boolean(restoredCamera));
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
      promotedIds: tierPromotedIds,
    });
  }, [cameraReady, cameraSnapshot, canvasSize, frameBoxes, hoverDwellKey, initialTiers, pinnedFrameId, tierPromotedIds]);
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
      promotedIds: tierPromotedIds,
    });
  }
  liveLoadPendingRef.current = frameBoxes.some(
    (frame) => frameTiers.get(frame.key) === "live" && !renderedFramesRef.current.has(frame.key),
  );
  frameBoxesRef.current = frameBoxes;
  const isGestureActive = () => Boolean(cameraIdleTimerRef.current) || Boolean(dragRef.current?.started || marqueeRef.current);
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
    writeMinimapToDom();
    dispatchAnchorsMoved(rootRef.current);
  }, []);
  // The minimap draws frames in world coordinates; its viewBox (the union of
  // the frames and the visible world rect) and its viewport rectangle follow
  // the camera here, in the camera's animation frame, without a commit. A
  // drag of the viewport rectangle freezes the viewBox.
  const getMinimapTransformNow = () => {
    const viewport = viewportRef.current;
    const camera = cameraRef.current;
    const { content, drag } = minimapStateRef.current;

    if (drag?.transform) {
      return drag.transform;
    }
    if (!viewport || !content) {
      return null;
    }

    const visible = { height: viewport.clientHeight / camera.z, width: viewport.clientWidth / camera.z, x: -camera.x / camera.z, y: -camera.y / camera.z };

    return { ...getMinimapTransform(content, visible, minimapPanelSize), visible };
  };
  const writeMinimapToDom = () => {
    const svg = minimapRef.current;
    const rect = minimapViewportRef.current;
    const viewport = viewportRef.current;
    const camera = cameraRef.current;
    const transform = getMinimapTransformNow();

    if (!svg || !rect || !viewport || !transform) {
      return;
    }
    if (!minimapStateRef.current.drag) {
      svg.setAttribute(
        "viewBox",
        `${transform.originX - transform.offsetX / transform.scale} ${transform.originY - transform.offsetY / transform.scale} ${minimapPanelSize.width / transform.scale} ${minimapPanelSize.height / transform.scale}`,
      );
    }
    rect.setAttribute("x", String(-camera.x / camera.z));
    rect.setAttribute("y", String(-camera.y / camera.z));
    rect.setAttribute("width", String(viewport.clientWidth / camera.z));
    rect.setAttribute("height", String(viewport.clientHeight / camera.z));
  };
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
    // Only the complete flow's camera is remembered (in memory for a journey
    // visit, in sessionStorage for a remount).
    if (!journeyFocusRef.current) {
      fullCameraRef.current = camera;
      writeStoredFlowCamera(cameraStorageKey, camera);
    }
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

    // Shown feature names sit left of the frames: the fit leaves them room.
    const reserve = Math.min(laneLabelReserve, viewport.clientWidth / 2);
    const fitted = fitCamera(displayedBounds, {
      height: viewport.clientHeight,
      width: viewport.clientWidth - reserve,
    });

    setCamera({ ...fitted, x: fitted.x + reserve }, { fit: true, immediate: true });
  }, [displayedBounds, laneLabelReserve, setCamera]);
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

    // A journey view shows the first instance of an element anchor, or both
    // ends of the first journey edge of a path anchor; canvas anchors have no
    // place in it.
    if (journeyLayout) {
      const instanceRect = (step) => (step ? getFrameVisibleRect(step, routeIdSet.has(step.nodeId) ? "route" : "flow") : null);
      const instanceOf = (instanceKey) => journeyLayout.layout.find((step) => step.instanceKey === instanceKey);

      if (anchor.type === "element") {
        const id = /^(?:route|node):(.+)$/.exec(anchor.id ?? "")?.[1];
        const rect = instanceRect(journeyLayout.layout.find((step) => step.nodeId === id));

        nextCamera = rect ? fitCamera(rect, canvasSize) : null;
      } else if (anchor.type === "path") {
        const key = /^edge:(.+)$/.exec(anchor.id ?? "")?.[1];
        const edge = journeyLayout.edges.find((candidate) => candidate.firstOccurrence && `${candidate.from}->${candidate.to}` === key);
        const ends = edge ? [instanceRect(instanceOf(edge.fromKey)), instanceRect(instanceOf(edge.toKey))] : [];

        nextCamera = ends.length === 2 && ends.every(Boolean) ? fitCamera(getFlowBounds(ends), canvasSize) : null;
      }
    } else if (anchor.type === "element") {
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
  // After the view changes, by a switch or by a flow change that removes the
  // selected journey (or brings it back); declared after the fit above, so it
  // wins: a journey fits and keeps fit tracking, the complete flow fits again
  // if it was fit tracking when left, else gets its remembered camera back
  // (memory, then sessionStorage), else fits. The
  // snapshot follows at once, so tiers are not chosen for the new frames with
  // the old view's camera.
  const shownJourneyKeyRef = useRef(journeyFocusKey);
  useIsomorphicLayoutEffect(() => {
    if (shownJourneyKeyRef.current === journeyFocusKey) {
      return;
    }

    const restored =
      journeyFocusKey === "all" && !fullFitTrackingRef.current
        ? (fullCameraRef.current ?? readStoredFlowCamera(cameraStorageKey))
        : null;

    shownJourneyKeyRef.current = journeyFocusKey;
    if (restored) {
      setCamera(restored, { immediate: true });
    } else {
      fitToView();
    }
    setCameraSnapshot({ ...cameraRef.current });
  }, [journeyFocusKey]);
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
      if (cameraIdleTimerRef.current || dragRef.current?.started || marqueeRef.current) {
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
        // Unmounting mid-gesture (for example a mode switch): keep the camera
        // of the complete flow.
        window.clearTimeout(cameraIdleTimerRef.current);
        if (!journeyFocusRef.current) {
          writeStoredFlowCamera(cameraStorageKey, cameraRef.current);
        }
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
  // The complete flow's routed edges and placed labels; a journey view draws
  // its own edges, so neither is computed while it is shown.
  const isJourneyView = Boolean(journeyLayout);
  const renderedEdges = useMemo(
    () =>
      isJourneyView
        ? []
        : aggregatedEdges
            .map((edge) => ({
              ...edge,
              polyline: createPolyline(edge, routingPositionMap, reverseEdgeKeys),
            }))
            .filter((edge) => edge.polyline),
    [aggregatedEdges, isJourneyView, reverseEdgeKeys, routingPositionMap],
  );
  // Labels are placed for the idle camera's zoom bucket, so pans, zooms within
  // a bucket and gestures never re-run placement.
  const labelBucketZoom = getBucketZoom(getZoomBucket(cameraSnapshot.z));
  const arrowScale = 1 / labelBucketZoom;
  const labeledEdges = useMemo(() => {
    if (isJourneyView) {
      return [];
    }

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
  }, [canvasMetrics, displayRoutePositionMap, isJourneyView, labelBucketZoom, labelSizes, renderedEdges]);
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

    if (cameraIdleTimerRef.current || dragRef.current?.started || marqueeRef.current) {
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
    if (cameraIdleTimerRef.current || dragRef.current?.started || marqueeRef.current) {
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
    if (cameraIdleTimerRef.current || dragRef.current?.started || marqueeRef.current) {
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
  // A primary press on empty canvas: a click clears the selection, a drag
  // becomes a marquee.
  const blankPressRef = useRef(null);
  // Marquee selection: world-anchored, drawn and reflected in the outlines
  // through the DOM only; the selection commits once on release.
  const marqueeRef = useRef(null);
  const marqueeFrameRef = useRef(0);
  const marqueeElementRef = useRef(null);
  const frameVisibleRectsRef = useRef([]);
  const toWorldPoint = (clientX, clientY) => {
    const point = toCanvasPoint(clientX, clientY);
    const camera = cameraRef.current;

    return { x: (point.x - camera.x) / camera.z, y: (point.y - camera.y) / camera.z };
  };
  const getMarqueeHits = (marquee) => {
    const rect = {
      height: Math.abs(marquee.end.y - marquee.start.y),
      width: Math.abs(marquee.end.x - marquee.start.x),
      x: Math.min(marquee.start.x, marquee.end.x),
      y: Math.min(marquee.start.y, marquee.end.y),
    };

    return { hits: getMarqueeSelection(frameVisibleRectsRef.current, rect, { additive: marquee.additive, base: marquee.base }), rect };
  };
  const setOutlinesSelected = (keys) => {
    overlayRef.current?.querySelectorAll("[data-frame-outline]").forEach((outline) => {
      if (keys.has(outline.getAttribute("data-frame-outline"))) {
        outline.setAttribute("data-selected", "true");
      } else {
        outline.removeAttribute("data-selected");
      }
    });
  };
  const writeMarqueeToDom = () => {
    const marquee = marqueeRef.current;
    const element = marqueeElementRef.current;

    marqueeFrameRef.current = 0;
    if (!marquee || !element) {
      return;
    }

    const { hits, rect } = getMarqueeHits(marquee);
    const camera = cameraRef.current;

    element.hidden = false;
    element.style.setProperty("transform", `translate(${rect.x * camera.z + camera.x}px, ${rect.y * camera.z + camera.y}px)`);
    element.style.setProperty("inline-size", `${rect.width * camera.z}px`);
    element.style.setProperty("block-size", `${rect.height * camera.z}px`);
    setOutlinesSelected(new Set(hits));
  };
  const updateMarquee = (event, press) => {
    if (press.cancelled) {
      return;
    }
    if (!marqueeRef.current) {
      if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) < DRAG_THRESHOLD_PX) {
        return;
      }

      event.currentTarget.setPointerCapture?.(event.pointerId);
      const start = toWorldPoint(press.startX, press.startY);

      marqueeRef.current = { additive: press.additive, base: [...selectionRef.current], end: start, start };
    }

    marqueeRef.current.end = toWorldPoint(event.clientX, event.clientY);
    if (!marqueeFrameRef.current) {
      marqueeFrameRef.current = window.requestAnimationFrame(writeMarqueeToDom);
    }
  };
  // Puts the outlines back the way React rendered them, then (on release)
  // commits the marquee's selection.
  const finishMarquee = (commit) => {
    const marquee = marqueeRef.current;

    window.cancelAnimationFrame(marqueeFrameRef.current);
    marqueeFrameRef.current = 0;
    marqueeRef.current = null;
    if (marqueeElementRef.current) {
      marqueeElementRef.current.hidden = true;
    }
    setOutlinesSelected(selectionRef.current);
    if (commit && marquee) {
      setSelection(new Set(getMarqueeHits(marquee).hits));
    }
    // Results held during the marquee join this batch, like a drag release.
    flushPendingSizes();
    flushPendingFrameState();
    rendererRef.current?.resume();
  };
  const cancelMarquee = () => {
    if (blankPressRef.current) {
      blankPressRef.current = { ...blankPressRef.current, cancelled: true };
    }
    finishMarquee(false);
  };
  const minimapWorldPoint = (event, transform) => {
    const bounds = minimapRef.current.getBoundingClientRect();
    const scale = bounds.width / minimapPanelSize.width || 1;

    return minimapPointToWorld({ x: (event.clientX - bounds.left) / scale, y: (event.clientY - bounds.top) / scale }, transform);
  };
  const centerCameraOn = (point, viewport) => {
    const { z } = cameraRef.current;

    setCamera({ x: viewport.clientWidth / 2 - point.x * z, y: viewport.clientHeight / 2 - point.y * z, z }, { immediate: true });
  };
  const handleMinimapPointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    // The minimap starts no marquee and no pan of the canvas.
    event.stopPropagation();
    event.preventDefault();
    const viewport = viewportRef.current;
    const transform = getMinimapTransformNow();

    if (!viewport || !transform) {
      return;
    }

    const point = minimapWorldPoint(event, transform);
    const visible = transform.visible;
    const onViewport =
      point.x >= visible.x && point.x <= visible.x + visible.width && point.y >= visible.y && point.y <= visible.y + visible.height;

    if (!onViewport) {
      centerCameraOn(point, viewport);
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    minimapStateRef.current.drag = {
      grab: { x: point.x - (visible.x + visible.width / 2), y: point.y - (visible.y + visible.height / 2) },
      pointerId: event.pointerId,
      transform,
    };
  };
  const handleMinimapPointerMove = (event) => {
    const drag = minimapStateRef.current.drag;

    if (!drag || drag.pointerId !== event.pointerId || !viewportRef.current) {
      return;
    }

    event.stopPropagation();
    const point = minimapWorldPoint(event, drag.transform);

    centerCameraOn({ x: point.x - drag.grab.x, y: point.y - drag.grab.y }, viewportRef.current);
  };
  const handleMinimapPointerUp = (event) => {
    const drag = minimapStateRef.current.drag;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    minimapStateRef.current.drag = null;
    writeMinimapToDom();
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

    latestRef.current.flushNudge?.();
    // A primary press on empty canvas (frame presses bubble here too): a
    // click clears the selection, a drag draws a marquee. On macOS a
    // Ctrl+press opens the context menu instead.
    if (action === "canvas" && !(event.target instanceof Element && event.target.closest("[data-frame-id]"))) {
      if (!(isMacPlatform() && event.ctrlKey)) {
        // Captured at once, like a pan, so the release reaches the viewport
        // even over the controls or outside the canvas.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        blankPressRef.current = {
          additive: event.shiftKey,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
        };
      }
      return;
    }

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
    const blankPress = blankPressRef.current;

    if (blankPress && blankPress.pointerId === event.pointerId) {
      // A move with the primary button up means the release never arrived:
      // the press and any marquee end without selecting.
      if ((event.buttons & 1) === 0) {
        blankPressRef.current = null;
        if (marqueeRef.current) {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          finishMarquee(false);
        }
        return;
      }
      updateMarquee(event, blankPress);
      return;
    }

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
    const blankPress = blankPressRef.current;

    // A marquee ends (selecting on release), or a click on empty canvas
    // clears the selection.
    if (blankPress && blankPress.pointerId === event.pointerId) {
      blankPressRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (marqueeRef.current) {
        finishMarquee(event.type === "pointerup");
        return;
      }
      if (
        !blankPress.cancelled &&
        event.type === "pointerup" &&
        Math.hypot(event.clientX - blankPress.startX, event.clientY - blankPress.startY) < DRAG_THRESHOLD_PX &&
        selectionRef.current.size
      ) {
        setSelection(new Set());
      }
      return;
    }

    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setPanState(null);
  };
  // The only storage writer: each committed layout action (drag release,
  // nudge, Reset, Import, Auto Layout, undo, redo) writes once; opening or
  // re-rendering the UI Flow never does. Every committed layout action ends
  // an auto layout's notice (applying one sets its own right after) and,
  // unless it replays history, records a history entry with the complete
  // saved positions before and after (and the feature names when `lanes`
  // gives them).
  const commitLayoutPositions = (positions, { lanes = null, record = true } = {}) => {
    setAutoLayoutUndo(null);
    autoLayoutBasisRef.current = null;
    if (record) {
      historyRef.current.push({
        after: positions,
        before: savedPositionsRef.current,
        ...(lanes ? { lanesAfter: lanes.after, lanesBefore: lanes.before } : {}),
      });
    }
    savedPositionsRef.current = positions;
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
  // Presses that select on release on a frame in a read-only view.
  const framePressRef = useRef(null);
  const selectFrame = useCallback((id, toggle) => {
    latestRef.current.flushNudge?.();
    setSelection((current) => {
      if (toggle) {
        const next = new Set(current);

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      }
      return current.size === 1 && current.has(id) ? current : new Set([id]);
    });
  }, []);
  const latestRef = useRef(null);
  latestRef.current = {
    commitLayoutPositions,
    flushPendingFrameState,
    flushPendingSizes,
    arrowScale,
    displayRoutePositionMap,
    draggedPositions,
    isReadOnlyView,
    renderedEdges,
    reverseEdgeKeys,
    routePositionMap,
    routingPositionMap,
  };
  // Writes a move (a frame drag or a keyboard nudge) to the DOM only: the
  // moved frames, their labels, feature names and selection outlines, and
  // the edges connected to them.
  const writeMoveToDom = useCallback((drag) => {
    const { reverseEdgeKeys: reverseKeys, routingPositionMap: routingMap } = latestRef.current;
    const shiftedMap = new Map(routingMap);

    drag.frames.forEach(({ element, id, label, labelOrigin, lanes = [], outline, outlineOrigin }) => {
      const position = routingMap.get(id);

      element.style.transform = `translate(${drag.delta.x}px, ${drag.delta.y}px)`;
      if (label && labelOrigin) {
        label.style.setProperty("--prototype-flow-label-wx", `${labelOrigin.x + drag.delta.x}px`);
        label.style.setProperty("--prototype-flow-label-wy", `${labelOrigin.y + drag.delta.y}px`);
      }
      lanes.forEach((lane) => {
        lane.element.style.setProperty("--prototype-flow-label-wx", `${lane.origin.x + drag.delta.x}px`);
        lane.element.style.setProperty("--prototype-flow-label-wy", `${lane.origin.y + drag.delta.y}px`);
      });
      if (outline && outlineOrigin) {
        outline.style.setProperty("--prototype-flow-outline-wx", `${outlineOrigin.x + drag.delta.x}px`);
        outline.style.setProperty("--prototype-flow-outline-wy", `${outlineOrigin.y + drag.delta.y}px`);
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
    drawGuides(drag.guides ?? []);
    drawSections(drag.delta, new Set(drag.frames.map((frame) => frame.id)));
    dispatchAnchorsMoved(rootRef.current);
  }, []);
  const writeDragToDom = useCallback(() => {
    const drag = dragRef.current;

    dragFrameRef.current = 0;
    if (drag?.started) {
      writeMoveToDom(drag);
    }
  }, [writeMoveToDom]);
  // The DOM of a dragged or nudged frame: its element, label, feature names
  // and outline with their rendered positions, and its saved origin.
  const collectMovedFrame = (id) => {
    const position = latestRef.current.routePositionMap.get(id);

    if (!position) {
      return null;
    }

    const frameSelector = `[data-frame-id="${CSS.escape(id)}"]`;
    const element = worldRef.current?.querySelector(frameSelector);

    if (!element) {
      return null;
    }

    const readVars = (target, prefix) =>
      target
        ? {
            x: Number.parseFloat(target.style.getPropertyValue(`${prefix}x`)),
            y: Number.parseFloat(target.style.getPropertyValue(`${prefix}y`)),
          }
        : null;
    const label = overlayRef.current?.querySelector(`.prototype-inspector__flow-frame-label${frameSelector}`) ?? null;
    const outline = overlayRef.current?.querySelector(`[data-frame-outline="${CSS.escape(id)}"]`) ?? null;

    return {
      element,
      id,
      label,
      labelOrigin: readVars(label, "--prototype-flow-label-w"),
      lanes: [...(overlayRef.current?.querySelectorAll(`[data-lane-anchor="${CSS.escape(id)}"]`) ?? [])].map((lane) => ({
        element: lane,
        origin: readVars(lane, "--prototype-flow-label-w"),
      })),
      origin: { x: position.x, y: position.y },
      outline,
      outlineOrigin: readVars(outline, "--prototype-flow-outline-w"),
    };
  };
  // Snapping guides: two pre-rendered lines (x and y), shown while a drag
  // snaps; world positions in CSS variables like the outlines.
  const drawGuides = (guides) => {
    overlayRef.current?.querySelectorAll(".prototype-inspector__flow-guide").forEach((element) => {
      const guide = guides.find((candidate) => candidate.axis === element.getAttribute("data-axis"));

      element.hidden = !guide;
      if (guide) {
        element.style.setProperty("--prototype-flow-guide-wx", `${guide.axis === "x" ? guide.position : guide.start}px`);
        element.style.setProperty("--prototype-flow-guide-wy", `${guide.axis === "x" ? guide.start : guide.position}px`);
        element.style.setProperty("--prototype-flow-guide-wlen", `${guide.end - guide.start}px`);
      }
    });
  };
  // Sections follow a drag or a nudge through the DOM. Every section is
  // recomputed, since a padding depends on the nearest foreign frame; without
  // a delta the rendered shapes are written back.
  const drawSections = (delta, movedIds) => {
    const { frames, sections: rendered } = sectionsRef.current;

    if (!rendered.length) {
      return;
    }

    const shapes = delta
      ? computeSectionShapes(
          frames.map((frame) => (movedIds.has(frame.id) ? { ...frame, x: frame.x + delta.x, y: frame.y + delta.y } : frame)),
        )
      : rendered;

    shapes.forEach((shape) => {
      const selector = `[data-section-group="${CSS.escape(shape.group)}"]`;
      const label = overlayRef.current?.querySelector(`.prototype-inspector__flow-section-label${selector}`);

      worldRef.current?.querySelector(`.prototype-inspector__flow-section${selector}`)?.setAttribute("d", shape.path);
      if (label) {
        label.style.setProperty("--prototype-flow-label-wx", `${shape.label.x}px`);
        label.style.setProperty("--prototype-flow-label-wy", `${shape.label.y}px`);
        label.style.setProperty("--prototype-flow-section-member-wy", `${shape.memberTop}px`);
      }
    });
  };
  // Puts the DOM back the way React rendered it.
  const restoreDragDom = (drag) => {
    window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = 0;
    worldRef.current?.removeAttribute("data-dragging");
    drag.frames.forEach(({ element, label, labelOrigin, lanes = [], outline, outlineOrigin }) => {
      element.style.removeProperty("transform");
      element.removeAttribute("data-dragging");
      if (label && labelOrigin) {
        label.style.setProperty("--prototype-flow-label-wx", `${labelOrigin.x}px`);
        label.style.setProperty("--prototype-flow-label-wy", `${labelOrigin.y}px`);
      }
      lanes.forEach((lane) => {
        lane.element.style.setProperty("--prototype-flow-label-wx", `${lane.origin.x}px`);
        lane.element.style.setProperty("--prototype-flow-label-wy", `${lane.origin.y}px`);
      });
      if (outline && outlineOrigin) {
        outline.style.setProperty("--prototype-flow-outline-wx", `${outlineOrigin.x}px`);
        outline.style.setProperty("--prototype-flow-outline-wy", `${outlineOrigin.y}px`);
      }
    });
    setOutlinesSelected(selectionRef.current);
    drawGuides([]);
    drawSections(null);
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

    if (event.button !== 0 || isPanModifierActiveRef.current) {
      return;
    }

    // A read-only view never starts a frame drag; pans and clicks (which
    // select on release) still work. The pointer is captured so the release
    // comes back here wherever it happens.
    if (latestRef.current.isReadOnlyView) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      framePressRef.current = { id, pointerId: event.pointerId, shiftKey: event.shiftKey, startX: event.clientX, startY: event.clientY };
      return;
    }
    framePressRef.current = null;

    if (!latestRef.current.routePositionMap.get(id)) {
      return;
    }

    // A pending nudge commits first. Its render lands before the next pointer
    // move, so the dragged frames are collected when the drag starts.
    latestRef.current.flushNudge();
    const pressedSelected = selectionRef.current.has(id);
    // Group drag: pressing a selected frame moves the whole selection.
    const ids = pressedSelected ? [...selectionRef.current].filter((key) => latestRef.current.routePositionMap.has(key)) : [id];

    // Pressing the frame label also grabs the frame; the pointer is captured
    // by whichever element was pressed.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    dragRef.current = {
      delta: { x: 0, y: 0 },
      edges: [],
      frameIds: ids,
      frames: [],
      pointerId: event.pointerId,
      pressedId: id,
      pressedSelected,
      scale: getScreenScale(),
      shiftKey: event.shiftKey,
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

        drag.frames = drag.frameIds.map((key) => collectMovedFrame(key)).filter(Boolean);
        if (!drag.frames.length) {
          dragRef.current = null;
          return;
        }
        drag.started = true;
        setFitTracking(false);
        rendererRef.current?.abort();
        startDragDom(drag);
        if (!drag.pressedSelected) {
          setOutlinesSelected(new Set([drag.pressedId]));
        }
        // Snapping compares the dragged frames' visible bounding box with the
        // other frames on screen.
        const ids = new Set(drag.frames.map(({ id }) => id));
        const rects = frameVisibleRectsRef.current;
        const dragged = rects.filter((rect) => ids.has(rect.key));
        const viewport = viewportRef.current;
        const camera = cameraRef.current;
        const onScreen = viewport
          ? { height: viewport.clientHeight / camera.z, width: viewport.clientWidth / camera.z, x: -camera.x / camera.z, y: -camera.y / camera.z }
          : null;

        drag.snapBase = dragged.length ? getFlowBounds(dragged) : null;
        drag.candidates = rects.filter(
          (rect) =>
            !ids.has(rect.key) &&
            onScreen &&
            rect.x < onScreen.x + onScreen.width &&
            rect.x + rect.width > onScreen.x &&
            rect.y < onScreen.y + onScreen.height &&
            rect.y + rect.height > onScreen.y,
        );
      }

      let deltaX = screenX / cameraRef.current.z;
      let deltaY = screenY / cameraRef.current.z;

      // Shift keeps the axis with the larger movement.
      let lockedAxis = null;

      if (event.shiftKey) {
        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          deltaY = 0;
          lockedAxis = "y";
        } else {
          deltaX = 0;
          lockedAxis = "x";
        }
      }
      // Snapping (Ctrl held: none), on the axes Shift leaves free.
      drag.guides = [];
      if (!event.ctrlKey && drag.snapBase && drag.candidates?.length) {
        const snap = computeSnap(
          { ...drag.snapBase, x: drag.snapBase.x + deltaX, y: drag.snapBase.y + deltaY },
          drag.candidates,
          getSnapThreshold(cameraRef.current.z),
        );

        if (lockedAxis !== "x") {
          deltaX += snap.dx;
        }
        if (lockedAxis !== "y") {
          deltaY += snap.dy;
        }
        drag.guides = snap.guides.filter((guide) => guide.axis !== lockedAxis);
      }
      drag.delta = { x: deltaX, y: deltaY };
      if (!dragFrameRef.current) {
        dragFrameRef.current = window.requestAnimationFrame(writeDragToDom);
      }
    },
    [setFitTracking, writeDragToDom],
  );
  const handleFramePointerUp = useCallback((event) => {
    const press = framePressRef.current;

    // A click in a read-only view selects the step instance.
    if (press && press.pointerId === event.pointerId) {
      framePressRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (event.type === "pointerup" && Math.hypot(event.clientX - press.startX, event.clientY - press.startY) < DRAG_THRESHOLD_PX) {
        selectFrame(press.id, press.shiftKey);
      }
      return;
    }

    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    if (!drag.started) {
      // A click selects (Shift toggles); no layout action, the fit and
      // storage stay as they were.
      if (event.type === "pointerup") {
        selectFrame(drag.pressedId, drag.shiftKey);
      }
      return;
    }

    restoreDragDom(drag);
    // Dragging an unselected frame selected it alone (same batch).
    if (!drag.pressedSelected) {
      setSelection(new Set([drag.pressedId]));
    }
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

    setIsFitTracking(false);
    latestRef.current.commitLayoutPositions({ ...savedPositionsRef.current, ...Object.fromEntries(moved.map(([id, next]) => [id, next])) });
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
  // A route measured after the auto layout grew beyond the size it used:
  // arrange again and save, keeping the Undo snapshot (sizes reach React only
  // when no gesture is under way).
  useEffect(() => {
    const basis = autoLayoutBasisRef.current;

    if (!basis) {
      return;
    }

    const grew = [...basis.sizes].some(([id, used]) => {
      const size = getAutoLayoutSize(id);

      return size.width > used.width + 1 || size.height > used.height + 1;
    });

    if (!grew) {
      return;
    }

    const { positions, sizes } = computeCurrentAutoLayout();

    autoLayoutBasisRef.current = { sizes };
    historyRef.current.updateLatestAfter(positions);
    savedPositionsRef.current = positions;
    setDraggedPositions(positions);
    writeStoredFlowLayout(layoutStorageKey, prototype, positions, canvasNodeIds, viewportSignature);
  }, [routePositionMap]);
  // Keyboard nudges: one DOM-only move per run of arrow presses, committed
  // 500 ms after the last arrow keyup (later if a gesture is under way), or
  // at once before another layout action, an undo or redo, a selection
  // change, a lost window focus or unmounting.
  const nudgeRef = useRef(null);
  const commitNudge = (force) => {
    const nudge = nudgeRef.current;

    if (!nudge) {
      return false;
    }

    window.clearTimeout(nudge.timer);
    if (!force && (cameraIdleTimerRef.current || dragRef.current?.started || marqueeRef.current)) {
      nudge.timer = window.setTimeout(() => commitNudge(false), 250);
      return false;
    }

    nudgeRef.current = null;
    restoreDragDom(nudge);
    const moved = nudge.frames.map(({ id, origin }) => [id, { x: Math.round(origin.x + nudge.delta.x), y: Math.round(origin.y + nudge.delta.y) }]);

    setFitTracking(false);
    setIsFitTracking(false);
    latestRef.current.commitLayoutPositions({ ...savedPositionsRef.current, ...Object.fromEntries(moved) });
    return true;
  };
  const flushPendingNudge = () => commitNudge(true);
  latestRef.current.flushNudge = flushPendingNudge;
  const applyNudge = (code, shiftKey) => {
    const offset = nudgeOffset(code, shiftKey);

    if (!offset) {
      return;
    }
    if (!nudgeRef.current) {
      const frames = [...selectionRef.current].map((key) => collectMovedFrame(key)).filter(Boolean);

      if (!frames.length) {
        return;
      }
      nudgeRef.current = { delta: { x: 0, y: 0 }, edges: [], frames, started: true, timer: 0 };
      // A nudge ends the auto layout notice's undo period.
      if (autoLayoutUndo) {
        setAutoLayoutUndo(null);
      }
      startDragDom(nudgeRef.current);
      rendererRef.current?.abort();
    }

    const nudge = nudgeRef.current;

    window.clearTimeout(nudge.timer);
    nudge.delta = { x: nudge.delta.x + offset.dx, y: nudge.delta.y + offset.dy };
    writeMoveToDom(nudge);
  };
  const scheduleNudgeCommit = () => {
    const nudge = nudgeRef.current;

    if (nudge) {
      window.clearTimeout(nudge.timer);
      nudge.timer = window.setTimeout(() => commitNudge(false), 500);
    }
  };
  useIsomorphicLayoutEffect(() => {
    writeMinimapToDom();
  });
  // Another commit can rewrite what a nudge wrote to the DOM: write it again.
  useIsomorphicLayoutEffect(() => {
    if (nudgeRef.current) {
      writeMoveToDom(nudgeRef.current);
    }
  });
  useEffect(() => {
    const flushOnBlur = () => latestRef.current.flushNudge?.();

    window.addEventListener("blur", flushOnBlur);
    return () => {
      window.removeEventListener("blur", flushOnBlur);
      // Unmounting still writes a pending nudge to storage.
      latestRef.current.flushNudge?.();
    };
  }, []);
  // The Undo notice lasts 8000 ms; ending during a gesture would commit, so
  // it waits for the gesture to end.
  useEffect(() => {
    if (!autoLayoutUndo) {
      return undefined;
    }

    let timer = 0;
    const expire = () => {
      if (cameraIdleTimerRef.current || dragRef.current?.started || marqueeRef.current) {
        timer = window.setTimeout(expire, 250);
        return;
      }

      setAutoLayoutUndo(null);
    };

    timer = window.setTimeout(expire, 8000);
    return () => window.clearTimeout(timer);
  }, [autoLayoutUndo]);
  // Run in order before every journey switch. Later canvas capabilities add
  // their own steps (clearing a selection, ending interact mode).
  const beforeJourneySwitchRef = useRef([]);
  beforeJourneySwitchRef.current = [
    cancelDrag,
    () => flushPendingNudge(),
    () => {
      window.clearTimeout(hoverDwellTimerRef.current);
      pendingHoverRef.current = undefined;
      pendingDwellRef.current = undefined;
      setFocusedRouteId(null);
      setHoverDwellKey(null);
    },
    () => {
      framePressRef.current = null;
      setPinnedFrameId(null);
      setPromotedFrameIds(new Set());
      setSelection(new Set());
    },
    () => setIsResetDialogOpen(false),
    () => {
      setIsAutoLayoutDialogOpen(false);
      setAutoLayoutUndo(null);
      autoLayoutBasisRef.current = null;
    },
  ];
  // Selects a journey list entry. Leaving the complete flow keeps its camera
  // (in memory and in sessionStorage, also mid-gesture); the camera itself
  // changes in the view-change layout effect once the new view has rendered.
  const selectJourney = (entryKey) => {
    const nextKey = journeyEntries.some((entry) => entry.key === entryKey) ? entryKey : "all";

    if (nextKey === journeyFocusKey) {
      return;
    }

    beforeJourneySwitchRef.current.forEach((step) => step());
    if (!journeyFocusRef.current) {
      fullCameraRef.current = { ...cameraRef.current };
      fullFitTrackingRef.current = fitTrackingRef.current;
      writeStoredFlowCamera(cameraStorageKey, cameraRef.current);
    }
    writeStoredFlowJourney(journeyStorageKey, nextKey);
    setSelectedJourneyKey(nextKey);
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

    // Releasing an arrow key starts the pending nudge's 500 ms wait.
    if (event.type === "keyup" && nudgeRef.current && nudgeOffset(event.code, false)) {
      scheduleNudgeCommit();
    }

    const target = event.composedPath?.()[0] ?? event.target;
    const command = resolveCanvasShortcut(event, {
      dragActive: Boolean(dragRef.current?.started),
      isMac: isMacPlatform(),
      isTextEntry: isTextEntryTarget(target),
      journeyEntryCount: hasJourneyList ? journeyEntries.length : 0,
      // A pending nudge commits before an undo, so it is undoable, and it
      // discards what could have been redone.
      canRedo: historyRef.current.canRedo() && !nudgeRef.current,
      canUndo: historyRef.current.canUndo() || Boolean(nudgeRef.current),
      journeyFocus: Boolean(activeJourney),
      marqueeActive: Boolean(marqueeRef.current),
      selectedRouteCount: [...selection].filter((key) => routeInstanceKeys.has(key)).length,
      selectionSize: selection.size,
      overlayOpen: isResetDialogOpen || isZoomMenuOpen || isAutoLayoutDialogOpen,
      targetIsControl: isControlTarget(target),
    });

    if (!command) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (command === "nudge") {
      applyNudge(event.code, event.shiftKey);
      return;
    }
    flushPendingNudge();

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
      } else if (isAutoLayoutDialogOpen) {
        setIsAutoLayoutDialogOpen(false);
      } else {
        setIsResetDialogOpen(false);
      }
    } else if (command === "cancel-drag") {
      cancelDrag();
    } else if (command === "undo") {
      undoLayout();
    } else if (command === "redo") {
      redoLayout();
    } else if (command === "cancel-marquee") {
      cancelMarquee();
    } else if (command === "clear-selection") {
      setSelection(new Set());
    } else if (command === "select-all") {
      setSelection(new Set(displayedFrameKeys));
    } else if (command === "zoom-to-selection") {
      fitFrames(selection);
    } else if (command === "next-frame" || command === "previous-frame") {
      selectAdjacentFrame(command === "next-frame" ? 1 : -1);
    } else if (command === "previous-journey" || command === "next-journey") {
      const index = journeyEntries.findIndex((entry) => entry.key === journeyFocusKey);
      const offset = command === "next-journey" ? 1 : -1;

      selectJourney(journeyEntries[(index + offset + journeyEntries.length) % journeyEntries.length].key);
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
    if (hasCustomLayout && !isReadOnlyView) {
      setIsResetDialogOpen(true);
    }
  };
  const closeResetDialog = () => {
    setIsResetDialogOpen(false);
  };
  const confirmResetLayout = () => {
    flushPendingNudge();
    commitLayoutPositions({}, { lanes: { after: null, before: laneLabels } });
    writeStoredFlowLanes(lanesStorageKey, [], viewportSignature);
    setLaneLabels(null);
    setFocusedRouteId(null);
    setIsResetDialogOpen(false);
  };
  // Auto layout: frame sizes are the larger of the measured preview and the
  // resolved viewport (the Static Flow sizes frames from the viewport).
  const getAutoLayoutSize = (id) =>
    getAutoLayoutFrameSize(
      routePositionMap.get(id) ?? { height: defaultNodeHeight, nodeType: "flow", width: defaultPreviewWidth + nodeFrameSize },
      resolvedViewportsRef.current.get(id) ?? prototypeViewport,
    );
  // One batch: fit tracking (the fit effect fits the new bounds after the
  // commit), the positions, the names, no hover, the dialog closed and the
  // Undo snapshot of what was saved before.
  // The auto layout of the flow with the current frame sizes, recording the
  // sizes it used.
  const computeCurrentAutoLayout = () => {
    const { lanes, showTitles } = resolveAutoLayoutLanes(flow, { declared: declaredJourneys, derived: derivedJourneys });
    const sizes = new Map();
    const { labels, positions } = computeAutoLayout(lanes, transitions, (id) => {
      const size = getAutoLayoutSize(id);

      sizes.set(id, size);
      return size;
    });

    return { labels: showTitles ? labels.filter((label) => label.title) : [], positions, sizes };
  };
  const applyAutoLayout = () => {
    flushPendingNudge();
    const { labels, positions, sizes } = computeCurrentAutoLayout();

    setFitTracking(true);
    setIsFitTracking(true);
    commitLayoutPositions(positions, { lanes: { after: labels.length ? labels : null, before: laneLabels } });
    // The notice's Undo undoes this history entry while it is the latest.
    const undo = historyRef.current.peekUndo();

    autoLayoutBasisRef.current = { sizes };
    writeStoredFlowLanes(lanesStorageKey, labels, viewportSignature);
    setLaneLabels(labels.length ? labels : null);
    setFocusedRouteId(null);
    setIsAutoLayoutDialogOpen(false);
    setAutoLayoutUndo(undo);
  };
  const requestAutoLayout = () => {
    if (isReadOnlyView) {
      return;
    }
    if (hasCustomLayout) {
      setIsAutoLayoutDialogOpen(true);
    } else {
      applyAutoLayout();
    }
  };
  const closeAutoLayoutDialog = () => {
    setIsAutoLayoutDialogOpen(false);
  };
  // Undo and redo replay a history entry: one committed layout action, one
  // write, no new entry; the names come back when the entry holds them.
  const replayHistory = (positions, lanes) => {
    setAutoLayoutUndo(null);
    autoLayoutBasisRef.current = null;
    savedPositionsRef.current = positions;
    setDraggedPositions(positions);
    writeStoredFlowLayout(layoutStorageKey, prototype, positions, canvasNodeIds, viewportSignature);
    if (lanes !== undefined) {
      writeStoredFlowLanes(lanesStorageKey, lanes ?? [], viewportSignature);
      setLaneLabels(lanes?.length ? lanes : null);
    }
  };
  const undoLayout = () => {
    flushPendingNudge();
    const entry = historyRef.current.undo();

    if (entry) {
      replayHistory(entry.before, "lanesBefore" in entry ? entry.lanesBefore : undefined);
    }
  };
  const redoLayout = () => {
    flushPendingNudge();
    const entry = historyRef.current.redo();

    if (entry) {
      replayHistory(entry.after, "lanesAfter" in entry ? entry.lanesAfter : undefined);
    }
  };
  const exportLayout = () => {
    const exportedLaneLabels = (laneLabels ?? []).filter((label) => routePositionMap.has(label.anchor));
    const payload = {
      ...createPrototypeFlowLayoutPayload(
        prototype.id,
        getFlowLayoutPositions(routePositionMap),
        viewportSignature,
      ),
      // The stored feature names whose frame is in the flow (flow-auto-layout),
      // also from a journey view, which hides them.
      ...(exportedLaneLabels.length ? { lanes: exportedLaneLabels } : {}),
    };
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
    if (!isReadOnlyView) {
      importInputRef.current?.click();
    }
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

        flushPendingNudge();
        // Feature names come with the file, signed for this flow; names on
        // frames the flow lacks are dropped.
        const importedLanes = normalizeLaneLabels(importedLayout.lanes, canvasNodeIds);

        commitLayoutPositions(importedPositions, { lanes: { after: importedLanes.length ? importedLanes : null, before: laneLabels } });

        writeStoredFlowLanes(lanesStorageKey, importedLanes, viewportSignature);
        setLaneLabels(importedLanes.length ? importedLanes : null);
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

  // What the world layer draws: every route and node of the complete flow at
  // its layout position, or one instance per step of the selected journey.
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const nodeById = new Map(flowNodes.map((node) => [node.id, node]));
  const toInstance = (step) => ({
    isAnchor: journeyLayout.anchorKeys.has(step.instanceKey),
    key: step.instanceKey,
    position: { ...routePositionMap.get(step.nodeId), x: step.x, y: step.y },
  });
  const routeInstances = journeyLayout
    ? journeyLayout.layout
        .filter((step) => routeById.has(step.nodeId))
        .map((step) => ({ ...toInstance(step), route: routeById.get(step.nodeId) }))
    : routes.map((route, index) => ({
        isAnchor: true,
        key: route.id,
        position: routePositionMap.get(route.id) ?? getRoutePosition(route, index),
        route,
      }));
  const nodeInstances = journeyLayout
    ? journeyLayout.layout
        .filter((step) => nodeById.has(step.nodeId))
        .map((step) => ({ ...toInstance(step), node: nodeById.get(step.nodeId) }))
    : flowNodes.map((node, index) => ({
        isAnchor: true,
        key: node.id,
        node,
        position: routePositionMap.get(node.id) ?? getRoutePosition(node, routes.length + index),
      }));
  // The minimap shows by the stored choice, else for 8 frames or more.
  const showMinimap = minimapPreference ? minimapPreference === "shown" : routes.length + flowNodes.length >= 8;
  const toggleMinimap = () => {
    const next = showMinimap ? "hidden" : "shown";

    setMinimapPreference(next);
    writeStoredPreference(flowMinimapStorageKey, next);
  };
  const toggleSections = () => {
    const next = showSections ? "hidden" : "shown";

    setSectionsPreference(next);
    writeStoredPreference(flowSectionsStorageKey, next);
  };
  // Shift+2, N and Shift+N fit the given frames (fitCamera never zooms past
  // 100%). Fitting every displayed frame is a plain Fit, which keeps fit
  // tracking; any other fit is a programmatic move that ends it.
  const fitFrames = (keys) => {
    const viewport = viewportRef.current;
    const rects = frameVisibleRectsRef.current.filter((rect) => keys.has(rect.key));

    if (!viewport || !rects.length) {
      return;
    }
    if (displayedFrameKeys.every((key) => keys.has(key))) {
      fitToView();
      return;
    }
    setCamera(fitCamera(getFlowBounds(rects), { height: viewport.clientHeight, width: viewport.clientWidth }), { immediate: true });
  };
  // N / Shift+N select the next or previous frame and fit it: in the complete
  // flow by route order after the first selected route, in a journey view by
  // step index after the lowest selected step; both wrap.
  const selectAdjacentFrame = (direction) => {
    let nextKey = null;

    if (journeyLayout) {
      const steps = journeyLayout.layout;
      const selectedIndices = steps.filter((step) => selection.has(step.instanceKey)).map((step) => step.stepIndex);
      const nextIndex = getAdjacentStepIndex(steps.length, selectedIndices.length ? Math.min(...selectedIndices) : null, direction);

      nextKey = steps.find((step) => step.stepIndex === nextIndex)?.instanceKey ?? null;
    } else {
      const routeIds = routes.map((route) => route.id);

      nextKey = getAdjacentRouteId(routeIds, routeIds.find((id) => selection.has(id)) ?? null, direction);
    }
    if (!nextKey) {
      return;
    }

    const next = new Set([nextKey]);

    setSelection(next);
    fitFrames(next);
  };
  // Every displayed frame by instance key (Mod+A, outlines, route counts).
  const routeInstanceKeys = new Set(routeInstances.map((instance) => instance.key));
  frameVisibleRectsRef.current = [
    ...routeInstances.map((instance) => ({ instance, type: "route" })),
    ...nodeInstances.map((instance) => ({ instance, type: "flow" })),
  ].map(({ instance: { key, position }, type }) => ({
    key,
    ...getFrameVisibleRect(
      { height: position.height ?? defaultNodeHeight, width: position.width ?? defaultPreviewWidth + nodeFrameSize, x: position.x, y: position.y },
      type,
    ),
  }));
  const displayedFrameKeys = [...routeInstances, ...nodeInstances].map((instance) => instance.key);
  const minimapContent = frameVisibleRectsRef.current.length ? getFlowBounds(frameVisibleRectsRef.current) : null;

  minimapStateRef.current.content = minimapContent;
  // The first viewBox (later ones come from writeMinimapToDom): the frames.
  const minimapViewBox = minimapContent
    ? `${minimapContent.x} ${minimapContent.y} ${Math.max(1, minimapContent.width)} ${Math.max(1, minimapContent.height)}`
    : "0 0 1 1";
  // Journey edges are hovered by instance key.
  const getJourneyEdgeFocus = (edge) => {
    if (!focusedRouteId) {
      return undefined;
    }

    return edge.fromKey === focusedRouteId || edge.toKey === focusedRouteId ? "active" : "muted";
  };
  // The journey svg covers the journey bounds plus the turns of its row
  // connectors; its viewBox is in world coordinates.
  const journeyCanvas = journeyLayout?.bounds
    ? {
        height: journeyLayout.bounds.height + canvasPadding * 2,
        width: journeyLayout.bounds.width + canvasPadding * 2,
        x: journeyLayout.bounds.x - canvasPadding,
        y: journeyLayout.bounds.y - canvasPadding,
      }
    : null;
  // Hovering a journey connector shows its label's full text, without a
  // React commit (hovering the label itself does so in CSS).
  const setJourneyLabelExpanded = (index, isExpanded) => {
    const label = overlayRef.current?.querySelector(`[data-journey-edge="${index}"]`);

    if (isExpanded) {
      label?.setAttribute("data-expanded", "true");
    } else {
      label?.removeAttribute("data-expanded");
    }
  };
  // The selected journey's steps with the label of the edge after each one,
  // for the list entry that explains truncated labels.
  const journeyDetail = journeyLayout
    ? {
        loopText: journeyLayout.loopMarker?.label ?? null,
        steps: journeyLayout.layout.map((step, index) => {
          const edge = journeyLayout.edges[index];

          return {
            edgeText: edge ? (edge.label ?? "沒有連線") : null,
            key: step.instanceKey,
            title: frameTitles.get(step.nodeId) ?? step.nodeId,
          };
        }),
      }
    : null;

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
      "data-journey-focus": activeJourney ? activeJourney.key : undefined,
      "data-journey-list": hasJourneyList ? (isJourneyListCollapsed ? "collapsed" : "expanded") : undefined,
      // Hides the canvas layers until the cached snapshots are read.
      "data-snapshot-preload": snapshotPreload === "pending" ? "pending" : undefined,
      ref: rootRef,
      style: {
        "--prototype-inspector-active-viewport-height": `${defaultPreviewHeight}px`,
        "--prototype-inspector-active-viewport-width": `${defaultPreviewWidth}px`,
        // The viewport and the control layer start at the list's right edge.
        ...(hasJourneyList
          ? {
              "--prototype-flow-journey-list-width": isJourneyListCollapsed
                ? "var(--pi-ref-size-40)"
                : "calc(var(--pi-ref-size-80) * 3)",
            }
          : {}),
      },
    },
    hasJourneyList
      ? createElement(PrototypeJourneyList, {
          derivedTruncatedCount: derivedJourneys.truncatedCount,
          detail: journeyDetail,
          entries: journeyEntries,
          isCollapsed: isJourneyListCollapsed,
          onSelect: selectJourney,
          onToggle: () => setIsJourneyListCollapsed((isCollapsed) => !isCollapsed),
          selectedKey: journeyFocusKey,
        })
      : null,
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
        // Every view declares the comment canvas (screenshots, pin clipping).
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
          // Only the complete flow's world coordinates are layout coordinates,
          // so only there is a comment on blank canvas stored as a canvas point.
          "data-sbfx-canvas-world": activeJourney ? undefined : "",
          "data-zoom-low": cameraSnapshot.z < dashAnimationMinZoom ? "true" : undefined,
          ref: worldRef,
          style: {
            "--prototype-flow-stroke-zoom": getBucketZoom(getZoomBucket(cameraRef.current.z)),
            transform: getCameraTransform(cameraRef.current),
          },
        },
        // Flow group sections: behind edges and frames, no pointer input; the
        // inline fill survives comment screenshots, which keep sections.
        sectionBounds
          ? createElement(
              "svg",
              {
                "aria-hidden": "true",
                className: "prototype-inspector__flow-sections",
                height: sectionBounds.height,
                style: { left: `${sectionBounds.x}px`, top: `${sectionBounds.y}px` },
                viewBox: `${sectionBounds.x} ${sectionBounds.y} ${sectionBounds.width} ${sectionBounds.height}`,
                width: sectionBounds.width,
              },
              sections.map((section) =>
                createElement("path", {
                  className: "prototype-inspector__flow-section",
                  d: section.path,
                  "data-section-group": section.group,
                  key: section.group,
                  style: sectionFillStyle,
                }),
              ),
            )
          : null,
        journeyCanvas
          ? createElement(
              "svg",
              {
                "aria-hidden": "true",
                className: "prototype-inspector__flow-lines",
                height: journeyCanvas.height,
                style: { left: `${journeyCanvas.x}px`, top: `${journeyCanvas.y}px` },
                viewBox: `${journeyCanvas.x} ${journeyCanvas.y} ${journeyCanvas.width} ${journeyCanvas.height}`,
                width: journeyCanvas.width,
              },
              journeyLayout.edges.map((edge, index) => {
                const focus = getJourneyEdgeFocus(edge);
                const points = edge.points.map((point) => `${point.x},${point.y}`).join(" ");
                const arrowPoints = edge.dotted ? null : getFlowArrowPoints(edge.points, arrowScale);

                return createElement(
                  "g",
                  { "data-journey-edge": index, key: `${edge.fromKey}->${edge.toKey ?? "loop"}` },
                  edge.label ? createElement("title", null, edge.label) : null,
                  createElement("polyline", {
                    className: edge.dotted
                      ? "prototype-inspector__flow-journey-dotted"
                      : "prototype-inspector__flow-line",
                    "data-flow-color": "primary",
                    "data-flow-focus": focus,
                    // Only the first occurrence of a transition pair is its
                    // comment anchor; dotted edges have none.
                    ...(edge.firstOccurrence
                      ? {
                          "data-sbfx-anchor": `edge:${edge.from}->${edge.to}`,
                          "data-sbfx-anchor-kind": "path",
                          "data-sbfx-anchor-label": `${frameTitles.get(edge.from) ?? edge.from} → ${frameTitles.get(edge.to) ?? edge.to}`,
                        }
                      : {}),
                    points,
                    style: getJourneyLineStyle(edge, focus),
                  }),
                  arrowPoints
                    ? createElement("polygon", {
                        className: "prototype-inspector__flow-arrow",
                        "data-flow-color": "primary",
                        "data-flow-focus": focus,
                        points: arrowPoints,
                        style: getFlowArrowStyle("primary", focus),
                      })
                    : null,
                  edge.label
                    ? createElement("polyline", {
                        className: "prototype-inspector__flow-journey-edge-hit",
                        onPointerEnter: () => setJourneyLabelExpanded(index, true),
                        onPointerLeave: () => setJourneyLabelExpanded(index, false),
                        points,
                        style: journeyEdgeHitStyle,
                      })
                    : null,
                );
              }),
            )
          : createElement(
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
                "data-sbfx-anchor-label": `${frameTitles.get(edge.from) ?? edge.from} → ${frameTitles.get(edge.to) ?? edge.to}`,
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
        nodeInstances.map(({ isAnchor, key, node, position }) => {
          const size = getFlowMetadataNodeSize(node);

          return createElement(PrototypeFlowNode, {
            height: position.height ?? size.height,
            instanceKey: key,
            isAnchor,
            isSelected: selection.has(key),
            key,
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
        routeInstances.map(({ isAnchor, key, position, route }) => {
          const tier = frameTiers.get(key) ?? "snapshot";
          const isRendered = renderedFramesRef.current.has(key);
          const snapshotUrl = snapshotUrls.get(route.id) ?? null;

          return createElement(PrototypeRouteCard, {
            height: position.height ?? defaultNodeHeight,
            instanceKey: key,
            isAnchor,
            isRendered,
            isSelected: selection.has(key),
            isSnapshotStale: tier !== "live" && Boolean(snapshotUrl) && staleRoutes.has(route.id),
            key,
            mountIframe: tier === "live" && (isRendered || loadingFrameRef.current === key),
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
        // Section names: constant size, above the top-left corner of the
        // section's top member (and above that member's frame label); first in
        // the overlay, so frame and edge labels paint over them.
        sections
          .filter((section) => !laneGroupNames.has(`group:${section.group}`))
          .map((section) =>
            createElement(
              "div",
              {
                className: "prototype-inspector__flow-section-label",
                "data-section-group": section.group,
                key: `section:${section.group}`,
                style: {
                  "--prototype-flow-label-wx": `${section.label.x}px`,
                  "--prototype-flow-label-wy": `${section.label.y}px`,
                  "--prototype-flow-section-member-wy": `${section.memberTop}px`,
                },
              },
              section.group,
            ),
          ),
        journeyLayout
          ? [
              // Journey labels: fixed 12 px, truncated to the room between the
              // frames on screen, hidden only below 24 px of room.
              ...journeyLayout.edges.map((edge, index) =>
                edge.label
                  ? createElement(
                      "div",
                      {
                        className: "prototype-inspector__flow-edge-label prototype-inspector__flow-journey-label",
                        "data-flow-color": "primary",
                        "data-flow-focus": getJourneyEdgeFocus(edge),
                        "data-hidden": isJourneyLabelHidden(edge.labelWidth, cameraSnapshot.z) ? "true" : undefined,
                        "data-journey-edge": index,
                        key: `${edge.fromKey}->${edge.toKey ?? "loop"}-label`,
                        style: {
                          "--prototype-flow-journey-label-room": edge.labelWidth,
                          "--prototype-flow-label-wx": `${edge.labelX}px`,
                          "--prototype-flow-label-wy": `${edge.labelY}px`,
                        },
                      },
                      edge.label,
                    )
                  : null,
              ),
              journeyLayout.loopMarker
                ? createElement(
                    "div",
                    {
                      className: "prototype-inspector__flow-journey-loop",
                      key: "loop-marker",
                      style: {
                        "--prototype-flow-label-wx": `${journeyLayout.loopMarker.x}px`,
                        "--prototype-flow-label-wy": `${journeyLayout.loopMarker.y}px`,
                      },
                    },
                    journeyLayout.loopMarker.label,
                  )
                : null,
            ]
          : labeledEdges.map((edge) =>
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
        routeInstances.map(({ key, position, route }) => {
          const box = {
            height: position.height ?? defaultNodeHeight,
            width: position.width ?? defaultPreviewWidth + nodeFrameSize,
            x: position.x,
            y: position.y,
          };
          const visible = getFrameVisibleRect(box, "route");
          const isHovered = focusedRouteId === key;

          return createElement(PrototypeFrameLabel, {
            componentCount: routeComponentCounts.get(route.id) ?? 0,
            frameId: key,
            isHidden:
              !isHovered && visible.width * cameraSnapshot.z < frameLabelMinScreenWidth,
            isHovered,
            isUpdating:
              frameTiers.get(key) !== "live" && snapshotUrls.has(route.id) && staleRoutes.has(route.id),
            key,
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
        createElement(
          "div",
          { className: "prototype-inspector__flow-guides", "data-sbfx-capture-ignore": "true", key: "guides" },
          ["x", "y"].map((axis) => createElement("div", { className: "prototype-inspector__flow-guide", "data-axis": axis, hidden: true, key: axis })),
        ),
        createElement("div", {
          className: "prototype-inspector__flow-marquee",
          "data-sbfx-capture-ignore": "true",
          hidden: true,
          key: "marquee",
          ref: marqueeElementRef,
        }),
        // Selection outlines, one per displayed frame (hidden unless selected),
        // around the visible rect; marquee and drags only touch the DOM.
        createElement(
          "div",
          { className: "prototype-inspector__flow-selection", "data-sbfx-capture-ignore": "true", key: "selection" },
          frameVisibleRectsRef.current.map(({ height, key, width, x, y }) =>
            createElement("div", {
              className: "prototype-inspector__flow-selection-outline",
              "data-frame-outline": key,
              "data-selected": selection.has(key) ? "true" : undefined,
              key,
              style: {
                "--prototype-flow-outline-wx": `${x}px`,
                "--prototype-flow-outline-wy": `${y}px`,
                "--prototype-flow-outline-ww": `${width}px`,
                "--prototype-flow-outline-wh": `${height}px`,
              },
            }),
          ),
        ),
        // Auto layout feature names: right edge left of the anchor frame's
        // visible rect, top on its top; no pointer input, no comment anchor.
        shownLaneLabels.map((label) => {
          const position = routePositionMap.get(label.anchor);
          const visible = getFrameVisibleRect(position, position.nodeType === "route" ? "route" : "flow");

          return createElement(
            "div",
            {
              className: "prototype-inspector__flow-lane-label",
              "data-lane-anchor": label.anchor,
              "data-lane-key": label.key,
              key: `lane:${label.key}`,
              style: {
                "--prototype-flow-label-wx": `${visible.x}px`,
                "--prototype-flow-label-wy": `${visible.y}px`,
              },
            },
            label.title,
          );
        }),
      ),
      // Minimap (flow-canvas-editing): inside the viewport, so a wheel over
      // it pans the canvas; frames in world coordinates, the viewBox and the
      // viewport rectangle follow the camera through the DOM.
      showMinimap
        ? createElement(
            "svg",
            {
              "aria-hidden": "true",
              className: "prototype-inspector__flow-minimap",
              "data-sbfx-capture-ignore": "true",
              onPointerCancel: handleMinimapPointerUp,
              onPointerDown: handleMinimapPointerDown,
              onPointerMove: handleMinimapPointerMove,
              onPointerUp: handleMinimapPointerUp,
              preserveAspectRatio: "xMidYMid meet",
              ref: minimapRef,
              viewBox: minimapViewBox,
            },
            frameVisibleRectsRef.current.map((rect) =>
              createElement("rect", {
                className: "prototype-inspector__flow-minimap-frame",
                "data-selected": selection.has(rect.key) ? "true" : undefined,
                height: rect.height,
                key: rect.key,
                width: rect.width,
                x: rect.x,
                y: rect.y,
              }),
            ),
            createElement("rect", {
              className: "prototype-inspector__flow-minimap-viewport",
              height: 0,
              ref: minimapViewportRef,
              width: 0,
              x: 0,
              y: 0,
            }),
          )
        : null,
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
      isReadOnlyView
        ? createElement("p", { className: "prototype-inspector__flow-journey-notice" }, "簡化檢視：位置不會儲存")
        : null,
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
            "button",
            {
              "aria-checked": showMinimap,
              className: "prototype-inspector__flow-zoom-menu-item",
              key: "minimap",
              onClick: () => chooseZoomMenuItem(toggleMinimap),
              role: "menuitemcheckbox",
              type: "button",
            },
            createElement("span", null, "Minimap"),
            createElement("kbd", null, showMinimap ? "On" : "Off"),
          ),
          createElement(
            "button",
            {
              "aria-checked": showSections,
              className: "prototype-inspector__flow-zoom-menu-item",
              key: "sections",
              onClick: () => chooseZoomMenuItem(toggleSections),
              role: "menuitemcheckbox",
              type: "button",
            },
            createElement("span", null, "Sections"),
            createElement("kbd", null, showSections ? "On" : "Off"),
          ),
          createElement(
            "dl",
            { className: "prototype-inspector__flow-zoom-menu-help" },
            [
              ["Zoom", "Pinch, ⌘/Ctrl + scroll, = / -"],
              ["Pan", "Two-finger scroll, Space + drag, middle-button drag"],
              ["Fit / 100%", "Shift+1 / Shift+0"],
              ["Zoom to selection", "Shift+2"],
              ["Next / previous frame", "N / Shift+N"],
              ...(hasJourneyList ? [["切換功能流程", "[ / ]"]] : []),
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
        autoLayoutUndo
          ? createElement(
              "div",
              { className: "prototype-inspector__flow-auto-layout-notice", role: "status" },
              createElement("span", null, "Auto layout applied."),
              createElement("button", { onClick: undoLayout, type: "button" }, "Undo"),
            )
          : null,
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
            "aria-label": "Auto layout UI Flow",
            className: "prototype-inspector__flow-auto-layout-button",
            disabled: isReadOnlyView,
            onClick: requestAutoLayout,
            title: "Arrange frames by feature, left to right",
            type: "button",
          },
          "Auto Layout",
        ),
        createElement(
          "button",
          {
            "aria-label": "Reset UI Flow layout",
            disabled: !hasCustomLayout || isReadOnlyView,
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
            disabled: isReadOnlyView,
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
      isAutoLayoutDialogOpen
        ? createElement(
            "div",
            {
              className: "prototype-inspector__flow-reset-dialog-backdrop",
              onPointerDown: (event) => {
                if (event.target === event.currentTarget) {
                  closeAutoLayoutDialog();
                }
              },
            },
            createElement(
              "section",
              {
                "aria-describedby": "prototype-flow-auto-layout-description",
                "aria-labelledby": "prototype-flow-auto-layout-title",
                "aria-modal": "true",
                className: "prototype-inspector__flow-reset-dialog",
                onPointerDown: (event) => event.stopPropagation(),
                role: "dialog",
              },
              createElement(
                "div",
                { className: "prototype-inspector__flow-reset-dialog-copy" },
                createElement("h2", { id: "prototype-flow-auto-layout-title" }, "Auto layout this UI Flow?"),
                createElement(
                  "p",
                  { id: "prototype-flow-auto-layout-description" },
                  "Frames are rearranged by feature, left to right. You can undo right after.",
                ),
              ),
              createElement(
                "div",
                { className: "prototype-inspector__flow-reset-dialog-actions" },
                createElement(
                  "button",
                  {
                    className: "prototype-inspector__flow-reset-dialog-confirm",
                    onClick: applyAutoLayout,
                    ref: autoLayoutConfirmButtonRef,
                    type: "button",
                  },
                  "Auto Layout",
                ),
                createElement(
                  "button",
                  { className: "prototype-inspector__flow-reset-dialog-cancel", onClick: closeAutoLayoutDialog, type: "button" },
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
