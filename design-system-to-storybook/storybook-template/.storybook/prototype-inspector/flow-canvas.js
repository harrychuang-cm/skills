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
  getZoomBucket,
  isRecord,
  isVisibleFlowEdge,
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
  stepZoom,
  zoomAtPoint,
} from "./flow-canvas-geometry.js";

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

const PrototypeRouteCard = memo(function PrototypeRouteCard({
  height,
  onPreviewSizeChange,
  onPointerCancel,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  previewHeight,
  previewWidth,
  route,
  width,
  x,
  y,
}) {
  const previewSource = getRoutePreviewSource(route.id);
  const iframeRef = useRef(null);
  const measurePreviewSize = (iframe) => {
    const measuredSize = getMeasuredFramePreviewSize(iframe);

    if (measuredSize?.height && measuredSize?.width) {
      onPreviewSizeChange(route.id, measuredSize);
      return true;
    }

    return false;
  };

  useEffect(() => {
    let isActive = true;
    let retryCount = 80;
    let retryTimer = null;

    const updateMeasuredSize = () => {
      if (!isActive) {
        return;
      }

      const iframe = iframeRef.current;

      if (iframe && measurePreviewSize(iframe)) {
        return;
      }

      if (retryCount > 0) {
        retryCount -= 1;
        retryTimer = window.setTimeout(updateMeasuredSize, 250);
      }
    };

    updateMeasuredSize();

    return () => {
      isActive = false;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [onPreviewSizeChange, previewSource, route.id]);

  const handlePreviewLoad = (event) => {
    measurePreviewSize(event.currentTarget);
  };

  return createElement(
    "article",
    {
      "aria-label": route.title ?? route.id,
      className: "prototype-inspector__flow-frame",
      "data-frame-id": route.id,
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
        "data-sbfx-anchor": `route:${route.id}`,
        "data-sbfx-anchor-label": route.title ?? route.id,
        "data-sbfx-anchor-route": route.id,
      },
      previewSource
        ? createElement("iframe", {
            loading: "eager",
            onLoad: handlePreviewLoad,
            ref: iframeRef,
            src: previewSource,
            title: `${route.title ?? route.id} preview`,
          })
        : createElement(FlowEmpty, {
            message: "無法取得 route 預覽。",
          }),
    ),
  );
});

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
// It is also a hit area for the frame (the components button excepted).
const PrototypeFrameLabel = memo(function PrototypeFrameLabel({
  componentCount,
  isHidden,
  isHovered,
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

export function PrototypeFlow({ prototype }) {
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
  const settleCamera = useCallback(() => {
    const camera = { ...cameraRef.current };

    cameraIdleTimerRef.current = 0;
    worldRef.current?.removeAttribute("data-camera-moving");
    setCameraSnapshot(camera);
    setIsFitTracking(fitTrackingRef.current);
    writeStoredFlowCamera(cameraStorageKey, camera);
  }, [cameraStorageKey]);
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
            dispatchAnchorsMoved(rootRef.current);
          });

    resizeObserver?.observe(viewport);
    window.addEventListener("resize", refitWhileTracking);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", refitWhileTracking);
    };
  }, []);
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
  const handlePreviewSizeChange = useCallback((routeId, previewSize) => {
    setRoutePreviewSizes((sizes) => {
      const currentSize = sizes[routeId];

      if (
        currentSize &&
        Math.abs(currentSize.height - previewSize.height) < 2 &&
        Math.abs(currentSize.width - previewSize.width) < 2
      ) {
        return sizes;
      }

      return {
        ...sizes,
        [routeId]: previewSize,
      };
    });
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
  };
  const handleFramePointerEnter = useCallback((event) => {
    if (!dragRef.current?.started) {
      setFocusedRouteId(event.currentTarget.getAttribute("data-frame-id"));
    }
  }, []);
  const handleFramePointerLeave = useCallback(() => {
    if (!dragRef.current?.started) {
      setFocusedRouteId(null);
    }
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
      ref: rootRef,
      style: {
        "--prototype-inspector-active-viewport-height": `${defaultPreviewHeight}px`,
        "--prototype-inspector-active-viewport-width": `${defaultPreviewWidth}px`,
      },
    },
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

          return createElement(PrototypeRouteCard, {
            height: position.height ?? defaultNodeHeight,
            key: route.id,
            onPointerCancel: handleFramePointerUp,
            onPointerDown: handleFramePointerDown,
            onPointerEnter: handleFramePointerEnter,
            onPointerLeave: handleFramePointerLeave,
            onPointerMove: handleFramePointerMove,
            onPointerUp: handleFramePointerUp,
            onPreviewSizeChange: handlePreviewSizeChange,
            previewHeight: position.previewHeight ?? defaultPreviewHeight,
            previewWidth: position.previewWidth ?? defaultPreviewWidth,
            route,
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
