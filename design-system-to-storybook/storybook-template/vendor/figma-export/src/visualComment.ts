import { toCanvas } from "html-to-image";

import { getCaptureStyleProperties } from "./captureStyleProperties";

export const defaultVisualCommentsApiPath = "/__figma_export_review_comments";
export const defaultVisualCommentsDir = "design-system/figma-export-review";
export const defaultVisualCommentsAuthorStorageKey = "sbfx:review-author";
export const defaultVisualCommentsCaptureSelector = "#storybook-root";

export const VISUAL_COMMENT_KINDS = ["visual-fix", "tracking"] as const;

export type VisualCommentKind = (typeof VISUAL_COMMENT_KINDS)[number];

export const defaultVisualCommentKind: VisualCommentKind = "visual-fix";

export function isVisualCommentKind(value: unknown): value is VisualCommentKind {
  return (VISUAL_COMMENT_KINDS as readonly unknown[]).includes(value);
}

// Comments stored before kinds existed have no kind; they read as visual-fix.
export function resolveVisualCommentKind(value: unknown): VisualCommentKind {
  return isVisualCommentKind(value) ? value : defaultVisualCommentKind;
}

export type VisualCommentOptions = {
  enabled?: boolean;
  apiPath?: string;
  captureSelector?: string;
  authorStorageKey?: string;
  // C starts a comment and Meta/Control+Enter saves it; false leaves only Escape.
  shortcuts?: boolean;
};

export type VisualCommentStoryMetadata = {
  id: string;
  title: string;
  name: string;
  url?: string;
  prototypeId?: string;
  routeId?: string;
  stateId?: string;
  // The host-declared comment view (data-sbfx-view). Omitted for `story`,
  // which is also how comments stored before views existed read.
  view?: string;
};

export const defaultVisualCommentView = "story";
export const visualCommentViewPattern = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isVisualCommentView(value: unknown): value is string {
  return typeof value === "string" && visualCommentViewPattern.test(value);
}

export function resolveVisualCommentView(value: unknown): string {
  return isVisualCommentView(value) ? value : defaultVisualCommentView;
}

export type VisualCommentNearbyAnchor = {
  id: string;
  label?: string;
  // World-space offset from the nearby anchor element's top-left corner to
  // the comment point.
  dx: number;
  dy: number;
};

// Where a comment is pinned in a host-declared canvas. The screenshot pin
// (VisualCommentPin) is kept next to it for reports and AI context.
export type VisualCommentAnchor =
  | {
      type: "element";
      id: string;
      label?: string;
      route?: string;
      // Press position and element size in the element's layout pixels.
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | { type: "path"; id: string; label?: string; t: number }
  | { type: "canvas"; x: number; y: number; nearby?: VisualCommentNearbyAnchor[] };

/**
 * Plain-text location of an anchored comment, shared by the panel, the meeting
 * report and the AI prompt: a frame by its label, a line by its label, a canvas
 * point by the labels of the anchors recorded near it (ids when unlabelled).
 */
export function describeVisualCommentAnchor(anchor: VisualCommentAnchor): string {
  if (anchor.type === "element") return `On ${anchor.label ?? anchor.id}`;
  if (anchor.type === "path") return `On line ${anchor.label ?? anchor.id}`;
  const names = (anchor.nearby ?? []).map((entry) => entry.label ?? entry.id);
  return names.length
    ? `Canvas near ${names.join(", ")}`
    : `Canvas point (${Math.round(anchor.x)}, ${Math.round(anchor.y)})`;
}

export const VISUAL_COMMENT_ANCHOR_LIMITS = {
  maxIdLength: 200,
  maxLabelLength: 120,
  maxRouteLength: 240,
  maxNearby: 2,
} as const;

export type VisualCommentPin = { xRatio: number; yRatio: number };

export type VisualCommentViewport = {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
};

export type VisualCommentCapture = {
  dataUrl: string;
  mimeType: "image/webp" | "image/png";
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
};

export type CreateVisualCommentRequest = {
  clientRequestId: string;
  authorName: string;
  body: string;
  kind?: VisualCommentKind;
  story: VisualCommentStoryMetadata;
  pin: VisualCommentPin;
  anchor?: VisualCommentAnchor;
  viewport: VisualCommentViewport;
  capture: VisualCommentCapture;
};

export type VisualCommentRect = { left: number; top: number; width: number; height: number };

export type VisualCommentCaptureResult = {
  capture: VisualCommentCapture;
  pin: VisualCommentPin;
  anchor?: VisualCommentAnchor;
  // Client rect the pin ratios refer to when it is not the capture target (an
  // anchored capture of a frame or canvas), frozen at capture time.
  pinFrame?: VisualCommentRect;
  // The pin frame relative to the anchor, taken when the capture started.
  pinFrameReference?: VisualCommentFrameReference;
  viewport: VisualCommentViewport;
};

/** An anchored capture: the image and the client rect it shows. */
// Where an anchored capture's area is relative to its anchor, so the area can
// be found again after the host moved it: a share of the anchor element's box,
// or a rect in the canvas world.
export type VisualCommentFrameReference =
  | { kind: "element"; id: string; left: number; top: number; width: number; height: number }
  | { kind: "world"; x: number; y: number; width: number; height: number };

export type VisualCommentAnchoredCapture = {
  capture: VisualCommentCapture;
  rect: VisualCommentRect;
  reference?: VisualCommentFrameReference;
};

export type VisualCommentPointSelection = {
  pin: VisualCommentPin;
  anchor?: VisualCommentAnchor;
  viewport: VisualCommentViewport;
};

/** Resolves the host-declared anchor at a press inside the capture target. */
export type VisualCommentAnchorResolver = (
  target: HTMLElement,
  clientX: number,
  clientY: number,
  pressed: Element | null,
) => VisualCommentAnchor | undefined;

export type VisualCommentCaptureController = {
  cancel(): void;
};

export const VISUAL_COMMENT_LIMITS = {
  maxRequestBytes: 4 * 1024 * 1024,
  maxImageBytes: 2 * 1024 * 1024,
  maxImageLongestSide: 2048,
  maxImagePixels: 4 * 1024 * 1024,
  maxSessionAssetsBytes: 100 * 1024 * 1024,
  maxTitleLength: 120,
  maxAuthorLength: 80,
  maxBodyLength: 2000,
} as const;

export function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function isFiniteRatio(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeAuthorName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  return name || "Anonymous";
}

export function resolveVisualCommentTarget(
  selector?: string,
  documentRef: Document = document,
): HTMLElement | null {
  const candidates = [selector, defaultVisualCommentsCaptureSelector, "body"]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  for (const candidate of candidates) {
    const element = documentRef.querySelector<HTMLElement>(candidate);
    if (element) return element;
  }
  return null;
}

export function getVisualCommentPin(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  clientX: number,
  clientY: number,
): VisualCommentPin {
  return {
    xRatio: clampRatio((clientX - rect.left) / rect.width),
    yRatio: clampRatio((clientY - rect.top) / rect.height),
  };
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read capture."));
    reader.readAsDataURL(blob);
  });
}

function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Unable to encode capture.")),
      "image/webp",
      quality,
    ),
  );
}

function isTransparentColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "transparent") return true;
  const functional = normalized.match(/^rgba?\((.*)\)$/);
  if (!functional) return false;
  const channels = functional[1].trim().split(/[\s,\/]+/).filter(Boolean);
  return channels.length >= 4 && Number.parseFloat(channels.at(-1) ?? "1") === 0;
}

function resolveCaptureBackground(target: HTMLElement): string {
  let current: HTMLElement | null = target;
  while (current) {
    const backgroundColor = getComputedStyle(current).backgroundColor;
    if (!isTransparentColor(backgroundColor)) return backgroundColor;
    current = current.parentElement;
  }
  // Browsers composite a transparent document canvas over white by default.
  return "rgb(255 255 255)";
}

export function hasVisibleCanvasPixels(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to inspect captured UI pixels.");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 0) return true;
  }
  return false;
}

/** Browser capture seam backed by html-to-image; API and storage stay backend-agnostic. */
const svgPaintProperties = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "visibility",
  "display",
] as const;

// html-to-image deep-clones an <svg> and only inlines styles on the svg root,
// so stylesheet rules on its children (class-styled lines and icons) are lost
// and render black. Inline their computed paint for the duration of a capture;
// the returned function puts every original style attribute back.
function inlineSvgChildPaint(target: HTMLElement): () => void {
  const elements = Array.from(target.querySelectorAll("svg *")).filter(
    (element): element is SVGElement => element instanceof SVGElement,
  );
  // Read everything before writing so the writes do not force style recalcs.
  const paints = elements.map((element) => {
    const computed = getComputedStyle(element);
    return svgPaintProperties.map((property) => computed.getPropertyValue(property));
  });
  const originals = elements.map((element) => element.getAttribute("style"));
  elements.forEach((element, index) => {
    svgPaintProperties.forEach((property, propertyIndex) => {
      const value = paints[index][propertyIndex];
      if (value) element.style.setProperty(property, value);
    });
  });
  // What this capture left on each element, to tell its writes from the host's.
  const written = elements.map((element) => element.getAttribute("style"));
  const writtenValues = elements.map((element) =>
    svgPaintProperties.map((property) => element.style.getPropertyValue(property)),
  );
  return () => {
    elements.forEach((element, index) => {
      const original = originals[index];
      if (element.getAttribute("style") === written[index]) {
        if (original === null) element.removeAttribute("style");
        else element.setAttribute("style", original);
        return;
      }
      // The host changed this style during the capture (a hover, say): keep
      // its changes and undo only the paint still holding what was written.
      const originalStyle = document.createElement("div").style;
      if (original !== null) originalStyle.cssText = original;
      svgPaintProperties.forEach((property, propertyIndex) => {
        if (!paints[index][propertyIndex]) return;
        if (element.style.getPropertyValue(property) !== writtenValues[index][propertyIndex]) return;
        const originalValue = originalStyle.getPropertyValue(property);
        if (originalValue) {
          element.style.setProperty(property, originalValue, originalStyle.getPropertyPriority(property));
        } else {
          element.style.removeProperty(property);
        }
      });
    });
  };
}

export async function captureVisualCommentTarget(
  target: HTMLElement,
  options: {
    // Draws more content onto the rendered bitmap before it is encoded, with
    // the bitmap's pixels per CSS pixel and the target's client origin.
    drawOver?: (
      context: CanvasRenderingContext2D,
      frame: { left: number; scale: number; top: number },
    ) => Promise<void>;
    // Captures the element at its layout size, without its own position
    // offsets or transform: an element placed inside a translated and scaled
    // canvas would otherwise render outside the image.
    layout?: boolean;
    // Caps the pixels per CSS pixel, for a capture shown smaller elsewhere.
    maxScale?: number;
    omitIframes?: boolean;
    // Test seam: how long the render may take before the capture fails.
    renderTimeoutMs?: number;
  } = {},
): Promise<VisualCommentCapture> {
  const clientRect = target.getBoundingClientRect();
  if (!clientRect.width || !clientRect.height) throw new Error("Capture target has zero bounds.");
  // The size the capture renders at: the on-screen box, or the layout box.
  const rect = {
    height: options.layout && target.offsetHeight > 0 ? target.offsetHeight : clientRect.height,
    left: clientRect.left,
    top: clientRect.top,
    width: options.layout && target.offsetWidth > 0 ? target.offsetWidth : clientRect.width,
  };

  await nextAnimationFrame();
  await nextAnimationFrame();
  const scale = Math.min(
    2,
    options.maxScale ?? 2,
    VISUAL_COMMENT_LIMITS.maxImageLongestSide / Math.max(rect.width, rect.height),
    Math.sqrt(VISUAL_COMMENT_LIMITS.maxImagePixels / (rect.width * rect.height)),
  );
  // `canvas.width = width * pixelRatio` truncates the fraction, so a target with a
  // sub-pixel box legitimately lands up to one pixel short of the scaled intent.
  const intendedWidth = Math.max(1, Math.trunc(rect.width * scale));
  const intendedHeight = Math.max(1, Math.trunc(rect.height * scale));
  const restoreSvgPaint = inlineSvgChildPaint(target);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await Promise.race([
      toCanvas(target, {
        backgroundColor: resolveCaptureBackground(target),
        canvasHeight: rect.height,
        canvasWidth: rect.width,
        filter: (node) =>
          !(node instanceof Element && node.hasAttribute("data-sbfx-capture-ignore")) &&
          // A canvas capture leaves frame previews empty instead of cloning
          // every embedded page.
          !(options.omitIframes && node instanceof HTMLIFrameElement),
        fontEmbedCSS: "",
        height: rect.height,
        includeStyleProperties: getCaptureStyleProperties(target),
        pixelRatio: scale,
        skipFonts: true,
        skipAutoScale: true,
        ...(options.layout
          ? {
              style: {
                inset: "0px auto auto 0px",
                margin: "0px",
                position: "relative",
                rotate: "none",
                scale: "none",
                transform: "none",
                translate: "none",
              },
            }
          : {}),
        width: rect.width,
      }),
      new Promise<never>((_, reject) =>
        window.setTimeout(
          () => reject(new Error("Timed out rendering captured UI.")),
          options.renderTimeoutMs ?? 8_000,
        ),
      ),
    ]);
  } finally {
    restoreSvgPaint();
  }
  if (options.drawOver) {
    const context = canvas.getContext("2d");
    if (context) await options.drawOver(context, { left: rect.left, scale, top: rect.top });
  }
  let width = canvas.width;
  let height = canvas.height;
  if (
    width < 1 ||
    height < 1 ||
    Math.abs(width - intendedWidth) > 1 ||
    Math.abs(height - intendedHeight) > 1
  ) {
    throw new Error(
      `Captured image dimensions are invalid (${width}×${height}; expected ${intendedWidth}×${intendedHeight}).`,
    );
  }
  if (!hasVisibleCanvasPixels(canvas)) {
    throw new Error("Captured image contains no visible pixels. Try again after the UI finishes rendering.");
  }
  try {
    let encoded = await encodeCanvas(canvas, 0.82);
    for (let attempt = 0; encoded.size > VISUAL_COMMENT_LIMITS.maxImageBytes && attempt < 4; attempt += 1) {
      const ratio = Math.min(0.85, Math.sqrt(VISUAL_COMMENT_LIMITS.maxImageBytes / encoded.size) * 0.92);
      width = Math.max(1, Math.floor(width * ratio));
      height = Math.max(1, Math.floor(height * ratio));
      const previous = document.createElement("canvas");
      previous.width = canvas.width;
      previous.height = canvas.height;
      previous.getContext("2d")?.drawImage(canvas, 0, 0);
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to resize capture canvas.");
      context.drawImage(previous, 0, 0, width, height);
      encoded = await encodeCanvas(canvas, Math.max(0.5, 0.76 - attempt * 0.08));
    }
    if (encoded.size > VISUAL_COMMENT_LIMITS.maxImageBytes) {
      throw new Error("Captured image exceeds the 2 MiB limit.");
    }
    const mimeType = encoded.type === "image/webp" ? "image/webp" : "image/png";
    const dataUrl = await blobToDataUrl(encoded);
    return { dataUrl, mimeType, width, height, cssWidth: rect.width, cssHeight: rect.height };
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unable to encode captured UI.");
  }
}

export type CommentComposerPlacement =
  | { dock: "bottom" | "top" }
  | { left: number; top: number };

const composerWidth = 320;
const composerPinGap = 24;
const composerViewportMargin = 12;
const composerDockBreakpoint = 720;

// Where the comment composer sits for a pin at this viewport position: beside
// the pin on wide viewports, docked to an edge that leaves the pin visible on
// narrow ones.
export function getCommentComposerPlacement(
  pin: { left: number; top: number } | null,
  viewport: { height: number; width: number },
  composerHeight: number,
): CommentComposerPlacement {
  const margin = composerViewportMargin;
  if (!pin) return { dock: "bottom" };
  if (viewport.width < composerDockBreakpoint) {
    const bottomDockStart = viewport.height - composerHeight - margin;
    return { dock: pin.top + 16 > bottomDockStart ? "top" : "bottom" };
  }
  const width = Math.min(composerWidth, viewport.width - margin * 2);
  let left = pin.left + composerPinGap;
  if (left + width > viewport.width - margin) {
    left = pin.left - composerPinGap - width;
  }
  return {
    left: Math.max(margin, left),
    top: Math.min(
      Math.max(margin, pin.top - composerPinGap),
      Math.max(margin, viewport.height - composerHeight - margin),
    ),
  };
}

// The saved pin card: at most 264px wide (a 240px thumbnail plus 12px padding
// on each side) and never wider than the viewport minus its 12px margins.
const savedPinCardMaxWidth = 264;
const savedPinCardGap = 12;
const savedPinHalfSize = 12;

export type SavedPinCardPlacement = { left: number; top: number; width: number };

/**
 * Beside the pin on the inline-end side, else the inline-start side; when
 * neither side has room, below the pin (above near the bottom edge) so the
 * card never covers the pin it describes.
 */
export function getSavedPinCardPlacement(
  pin: { left: number; top: number },
  viewport: { height: number; width: number },
  cardHeight: number,
): SavedPinCardPlacement {
  const margin = composerViewportMargin;
  const width = Math.min(savedPinCardMaxWidth, viewport.width - margin * 2);
  const offset = savedPinHalfSize + savedPinCardGap;
  const clampTop = (top: number) =>
    Math.min(Math.max(margin, top), Math.max(margin, viewport.height - margin - cardHeight));
  const sideTop = clampTop(pin.top - cardHeight / 2);
  if (pin.left + offset + width <= viewport.width - margin) {
    return { left: pin.left + offset, top: sideTop, width };
  }
  if (pin.left - offset - width >= margin) {
    return { left: pin.left - offset - width, top: sideTop, width };
  }
  const left = Math.min(
    Math.max(margin, pin.left - width / 2),
    Math.max(margin, viewport.width - margin - width),
  );
  const below = pin.top + offset;
  const top =
    below + cardHeight <= viewport.height - margin
      ? below
      : clampTop(pin.top - offset - cardHeight);
  return { left, top, width };
}

/** How long after the placing press its click sequence (double-click included) is swallowed. */
export const captureSequenceWindowMs = 500;

let activeSequenceGuard: (() => void) | null = null;

// After a pin is placed, the rest of that click sequence on the capture target
// (a quick second press, its click, dblclick, contextmenu) never reaches the
// page, so a host does not read it as "enter the frame" or "select". The guard
// is independent of the capture: it leaves the capture-mode marker alone and a
// newly armed capture removes it.
function guardClickSequence(documentRef: Document, selector: string | undefined, until: number) {
  activeSequenceGuard?.();
  const types = ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"] as const;
  const swallow = (event: Event) => {
    if (performance.now() > until) {
      dispose();
      return;
    }
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget?.closest("[data-sbfx-capture-ignore]")) return;
    const target = resolveVisualCommentTarget(selector, documentRef);
    if (!target || !eventTarget || !target.contains(eventTarget)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const timer = window.setTimeout(() => dispose(), Math.max(0, until - performance.now()));
  function dispose() {
    window.clearTimeout(timer);
    for (const type of types) documentRef.removeEventListener(type, swallow, true);
    if (activeSequenceGuard === dispose) activeSequenceGuard = null;
  }
  for (const type of types) documentRef.addEventListener(type, swallow, true);
  activeSequenceGuard = dispose;
}

/**
 * Arms the next pointer sequence before prototype handlers run. The returned
 * controller is also used by the panel Cancel action and unmount cleanup.
 */
export function beginVisualCommentCapture({
  capture = captureVisualCommentTarget,
  documentRef = document,
  onCancel,
  onCaptured,
  onError,
  onPointSelected,
  resolveAnchor,
  captureAnchor,
  selector,
}: {
  capture?: (target: HTMLElement) => Promise<VisualCommentCapture>;
  // Captures an anchored comment's own element (a frame's page, a canvas);
  // resolves null to fall back to capturing the target.
  captureAnchor?: (
    target: HTMLElement,
    anchor: VisualCommentAnchor,
  ) => Promise<VisualCommentAnchoredCapture | null>;
  documentRef?: Document;
  onCancel?: () => void;
  onCaptured(result: VisualCommentCaptureResult): void;
  onError(error: Error): void;
  onPointSelected?: (selection: VisualCommentPointSelection) => void;
  resolveAnchor?: VisualCommentAnchorResolver;
  selector?: string;
}): VisualCommentCaptureController {
  let active = true;
  let cancelled = false;
  let pointerStarted = false;
  let pressedAt = 0;
  let cleanupTimer: number | undefined;
  // A new capture never inherits the previous one's click-sequence guard.
  activeSequenceGuard?.();

  const cleanup = () => {
    if (!active) return;
    active = false;
    if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
    documentRef.removeEventListener("pointerdown", onPointerDown, true);
    documentRef.removeEventListener("pointerup", swallowPointer, true);
    documentRef.removeEventListener("click", onClick, true);
    documentRef.removeEventListener("keydown", onKeyDown, true);
    delete documentRef.documentElement.dataset.sbfxCaptureMode;
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    cleanup();
    onCancel?.();
  };
  const swallowPointer = (event: Event) => {
    if (!pointerStarted) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const onClick = (event: MouseEvent) => {
    if (!pointerStarted) return;
    swallowPointer(event);
    cleanup();
    guardClickSequence(documentRef, selector, pressedAt + captureSequenceWindowMs);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  };
  const onPointerDown = (event: PointerEvent) => {
    // Only the primary button places a pin; middle-button panning and the
    // context menu keep working while a capture is armed.
    if (event.button !== 0) return;
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget?.closest("[data-sbfx-capture-ignore]")) return;
    const target = resolveVisualCommentTarget(selector, documentRef);
    if (!target || !eventTarget || !target.contains(eventTarget)) return;
    pointerStarted = true;
    pressedAt = performance.now();
    swallowPointer(event);
    const rect = target.getBoundingClientRect();
    const pin = getVisualCommentPin(rect, event.clientX, event.clientY);
    // Resolved before the capture starts, from the layout the participant saw.
    const anchor = resolveAnchor?.(target, event.clientX, event.clientY, eventTarget);
    const view = documentRef.defaultView ?? window;
    const viewport: VisualCommentViewport = {
      width: view.innerWidth,
      height: view.innerHeight,
      devicePixelRatio: view.devicePixelRatio,
      scrollX: view.scrollX,
      scrollY: view.scrollY,
    };
    onPointSelected?.({ pin, ...(anchor ? { anchor } : {}), viewport });
    const { clientX, clientY } = event;
    const captureWork: Promise<VisualCommentCaptureResult> =
      anchor && captureAnchor
        ? captureAnchor(target, anchor).then(async (anchored) => {
            if (!anchored) return { capture: await capture(target), pin, anchor, viewport };
            // The screenshot pin is relative to the captured element.
            return {
              anchor,
              capture: anchored.capture,
              pin: getVisualCommentPin(anchored.rect, clientX, clientY),
              pinFrame: anchored.rect,
              ...(anchored.reference ? { pinFrameReference: anchored.reference } : {}),
              viewport,
            };
          })
        : capture(target).then((captured) => ({
            capture: captured,
            pin,
            ...(anchor ? { anchor } : {}),
            viewport,
          }));
    void captureWork
      .then((result) => {
        if (!cancelled) onCaptured(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onError(error instanceof Error ? error : new Error("Unable to capture UI."));
        }
      })
      .finally(() => {
        if (active) cleanupTimer = window.setTimeout(cleanup, 2_000);
      });
  };

  documentRef.documentElement.dataset.sbfxCaptureMode = "true";
  documentRef.addEventListener("pointerdown", onPointerDown, true);
  documentRef.addEventListener("pointerup", swallowPointer, true);
  documentRef.addEventListener("click", onClick, true);
  documentRef.addEventListener("keydown", onKeyDown, true);
  return { cancel };
}
