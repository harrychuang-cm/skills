// Host declarations: DOM attributes a host (for example the Prototype
// Inspector's UI Flow canvas) places inside the capture target to tell the
// addon which comment view is shown, whether comments or Figma export are
// available, and where comments can be anchored. The addon knows no host; it
// only reads these attributes. Nothing here imports React, so both the preview
// and the review bundles can use it.
import {
  VISUAL_COMMENT_ANCHOR_LIMITS,
  captureVisualCommentTarget,
  defaultVisualCommentView,
  resolveVisualCommentTarget,
  resolveVisualCommentView,
  type VisualCommentAnchor,
  type VisualCommentAnchoredCapture,
  type VisualCommentCapture,
  type VisualCommentFrameReference,
  type VisualCommentNearbyAnchor,
  type VisualCommentRect,
} from "./visualComment";

function closestOrInside(target: Element | null | undefined, selector: string): Element | null {
  if (!target) return null;
  return target.matches(selector) ? target : target.querySelector(selector);
}

/** The current comment view: the first data-sbfx-view in the target, else story. */
export function readCommentView(target: Element | null | undefined): string {
  const element = closestOrInside(target, "[data-sbfx-view]");
  return element
    ? resolveVisualCommentView(element.getAttribute("data-sbfx-view"))
    : defaultVisualCommentView;
}

/** True while the target is, or contains, data-sbfx-comments="unavailable". */
export function areCommentsUnavailable(target: Element | null | undefined): boolean {
  return Boolean(closestOrInside(target, '[data-sbfx-comments="unavailable"]'));
}

export type ExportAvailability =
  | { available: true }
  | { available: false; label: string; href?: string };

export const defaultExportUnavailableLabel = "Figma export is not available in this view.";

/** Reads data-sbfx-export="unavailable" (with its label and same-origin href). */
export function readExportAvailability(scope: Element | null | undefined): ExportAvailability {
  const element = closestOrInside(scope, '[data-sbfx-export="unavailable"]');
  if (!element) return { available: true };
  const label = element.getAttribute("data-sbfx-export-label")?.trim() || defaultExportUnavailableLabel;
  const hrefValue = element.getAttribute("data-sbfx-export-href");
  let href: string | undefined;
  if (hrefValue) {
    try {
      const url = new URL(hrefValue, window.location.href);
      if (url.origin === window.location.origin) href = url.href;
    } catch {
      // An unparsable href shows no link.
    }
  }
  return { available: false, label, ...(href ? { href } : {}) };
}

// ---------------------------------------------------------------------------
// Comment anchors
// ---------------------------------------------------------------------------

/** Path anchors within this many CSS pixels of the press win over the canvas. */
export const pathAnchorHitDistance = 8;
// Sampling steps in screen pixels, converted to the path's user units, so a
// zoomed-out canvas is not oversampled.
const pathSampleScreenStep = 8;
const pathRefineScreenStep = 0.5;

const anchorSelector = "[data-sbfx-anchor]";
const elementAnchorSelector = '[data-sbfx-anchor]:not([data-sbfx-anchor-kind="path"])';
const pathAnchorSelector = '[data-sbfx-anchor][data-sbfx-anchor-kind="path"]';

function anchorLabel(element: Element): { label?: string } {
  const label = element.getAttribute("data-sbfx-anchor-label");
  return label ? { label: label.slice(0, VISUAL_COMMENT_ANCHOR_LIMITS.maxLabelLength) } : {};
}

function anchorId(element: Element): string {
  return (element.getAttribute("data-sbfx-anchor") ?? "").slice(0, VISUAL_COMMENT_ANCHOR_LIMITS.maxIdLength);
}

/**
 * The first element carrying this anchor id. Values are compared directly, not
 * through a CSS selector, so ids may contain any character (`edge:a->b`).
 */
export function findAnchorElement(scope: ParentNode, id: string): Element | null {
  for (const element of scope.querySelectorAll(anchorSelector)) {
    if (element.getAttribute("data-sbfx-anchor") === id) return element;
  }
  return null;
}

/** The topmost page element at a point inside the target, skipping addon chrome. */
export function hitElementAt(target: Element, clientX: number, clientY: number): Element | null {
  const documentRef = target.ownerDocument;
  for (const element of documentRef.elementsFromPoint(clientX, clientY)) {
    if (element.closest("[data-sbfx-capture-ignore]")) continue;
    if (target === element || target.contains(element)) return element;
  }
  return null;
}

/** Rendered-to-layout scale of an HTML element (1 when it has no layout size). */
export function elementLayoutScale(element: Element): { x: number; y: number; rect: DOMRect } {
  const rect = element.getBoundingClientRect();
  const html = element as HTMLElement;
  const width = html.offsetWidth ?? 0;
  const height = html.offsetHeight ?? 0;
  return {
    rect,
    x: width > 0 ? rect.width / width : 1,
    y: height > 0 ? rect.height / height : 1,
  };
}

export type CanvasFrame = {
  canvas: Element;
  originX: number;
  originY: number;
  scale: number;
};

/**
 * Maps the declared canvas: the world element (data-sbfx-canvas-world) is
 * moved by a translation and a uniform scale with transform-origin 0 0, so its
 * border box's top-left is the client position of world (0, 0).
 */
export function getCanvasFrame(canvas: Element): CanvasFrame | null {
  const world = canvas.querySelector<HTMLElement>("[data-sbfx-canvas-world]");
  if (!world) return null;
  const worldRect = world.getBoundingClientRect();
  let scale: number;
  if (world.offsetWidth > 0) {
    scale = worldRect.width / world.offsetWidth;
  } else {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform);
    const canvasHtml = canvas as HTMLElement;
    const outer =
      canvasHtml.offsetWidth > 0 ? canvas.getBoundingClientRect().width / canvasHtml.offsetWidth : 1;
    scale = (matrix.a || 1) * outer;
  }
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return { canvas, originX: worldRect.left, originY: worldRect.top, scale };
}

export function clientToWorld(frame: CanvasFrame, clientX: number, clientY: number) {
  return { x: (clientX - frame.originX) / frame.scale, y: (clientY - frame.originY) / frame.scale };
}

export function worldToClient(frame: CanvasFrame, x: number, y: number) {
  return { x: frame.originX + x * frame.scale, y: frame.originY + y * frame.scale };
}

function isGeometryElement(element: Element): element is SVGGeometryElement {
  return typeof (element as SVGGeometryElement).getTotalLength === "function";
}

// User units of an SVG geometry element to client pixels, through the owning
// <svg> box (whose client rect already includes CSS transforms of ancestors).
function svgPointMapper(element: SVGGeometryElement) {
  const svg = element.ownerSVGElement;
  const ctm = element.getCTM();
  if (svg && ctm && svg.clientWidth > 0 && svg.clientHeight > 0) {
    const svgRect = svg.getBoundingClientRect();
    const scaleX = svgRect.width / svg.clientWidth;
    const scaleY = svgRect.height / svg.clientHeight;
    return (point: DOMPoint) => {
      const local = point.matrixTransform(ctm);
      return { x: svgRect.left + local.x * scaleX, y: svgRect.top + local.y * scaleY };
    };
  }
  const screen = element.getScreenCTM();
  if (!screen) return null;
  return (point: DOMPoint) => {
    const mapped = point.matrixTransform(screen);
    return { x: mapped.x, y: mapped.y };
  };
}

/** Client position of the point at fraction t of a path anchor's length. */
export function pathPointAt(element: Element, t: number): { x: number; y: number } | null {
  if (!isGeometryElement(element)) return null;
  const map = svgPointMapper(element);
  if (!map) return null;
  const length = element.getTotalLength();
  return map(element.getPointAtLength(Math.min(1, Math.max(0, t)) * length));
}

// Straight-segment shapes (polyline, polygon, line): exact nearest point from
// their vertices, mapped to client pixels; fractions along a segment survive the
// linear mapping, so t follows the user-unit length like getTotalLength.
function nearestOnSegments(
  element: SVGGeometryElement,
  map: (point: DOMPoint) => { x: number; y: number },
  clientX: number,
  clientY: number,
): { t: number; distance: number } | null {
  let vertices: DOMPoint[] = [];
  if (element instanceof SVGPolylineElement || element instanceof SVGPolygonElement) {
    vertices = Array.from(element.points, (point) => new DOMPoint(point.x, point.y));
    if (element instanceof SVGPolygonElement && vertices.length > 1) vertices.push(vertices[0]);
  } else if (element instanceof SVGLineElement) {
    vertices = [
      new DOMPoint(element.x1.baseVal.value, element.y1.baseVal.value),
      new DOMPoint(element.x2.baseVal.value, element.y2.baseVal.value),
    ];
  } else {
    return null;
  }
  if (vertices.length < 2) return null;
  const client = vertices.map(map);
  const lengths = vertices.slice(1).map((vertex, index) =>
    Math.hypot(vertex.x - vertices[index].x, vertex.y - vertices[index].y),
  );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!(total > 0)) return null;
  let best = { distance: Infinity, position: 0 };
  let travelled = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const start = client[index];
    const end = client[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const squared = dx * dx + dy * dy;
    const u = squared > 0
      ? Math.min(1, Math.max(0, ((clientX - start.x) * dx + (clientY - start.y) * dy) / squared))
      : 0;
    const distance = Math.hypot(start.x + dx * u - clientX, start.y + dy * u - clientY);
    if (distance < best.distance) best = { distance, position: travelled + lengths[index] * u };
    travelled += lengths[index];
  }
  return { distance: best.distance, t: best.position / total };
}

/** The path anchor passing nearest to a client point, within the hit distance. */
export function findPathAnchorAt(
  target: Element,
  clientX: number,
  clientY: number,
): { element: SVGGeometryElement; t: number; distance: number } | null {
  let best: { element: SVGGeometryElement; t: number; distance: number } | null = null;
  for (const element of target.querySelectorAll(pathAnchorSelector)) {
    if (!isGeometryElement(element) || element.closest("[data-sbfx-capture-ignore]")) continue;
    const bounds = element.getBoundingClientRect();
    if (
      clientX < bounds.left - pathAnchorHitDistance ||
      clientX > bounds.right + pathAnchorHitDistance ||
      clientY < bounds.top - pathAnchorHitDistance ||
      clientY > bounds.bottom + pathAnchorHitDistance
    ) {
      continue;
    }
    const map = svgPointMapper(element);
    if (!map) continue;
    const exact = nearestOnSegments(element, map, clientX, clientY);
    if (exact) {
      if (exact.distance <= pathAnchorHitDistance && (!best || exact.distance < best.distance)) {
        best = { element, ...exact };
      }
      continue;
    }
    const length = element.getTotalLength();
    if (!(length > 0)) continue;
    const origin = map(new DOMPoint(0, 0));
    const unit = map(new DOMPoint(1, 0));
    const pixelsPerUnit = Math.hypot(unit.x - origin.x, unit.y - origin.y) || 1;
    const sampleStep = pathSampleScreenStep / pixelsPerUnit;
    const refineStep = pathRefineScreenStep / pixelsPerUnit;
    const distanceAt = (position: number) => {
      const point = map(element.getPointAtLength(position));
      return Math.hypot(point.x - clientX, point.y - clientY);
    };
    let nearest = 0;
    let nearestDistance = Infinity;
    for (let position = 0; position <= length + sampleStep; position += sampleStep) {
      const clamped = Math.min(length, position);
      const distance = distanceAt(clamped);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = clamped;
      }
    }
    const from = Math.max(0, nearest - sampleStep);
    const to = Math.min(length, nearest + sampleStep);
    for (let position = from; position <= to; position += refineStep) {
      const distance = distanceAt(position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = position;
      }
    }
    if (nearestDistance <= pathAnchorHitDistance && (!best || nearestDistance < best.distance)) {
      best = { element, t: nearest / length, distance: nearestDistance };
    }
  }
  return best;
}

function worldRectOf(frame: CanvasFrame, element: Element) {
  const rect = element.getBoundingClientRect();
  const topLeft = clientToWorld(frame, rect.left, rect.top);
  const bottomRight = clientToWorld(frame, rect.right, rect.bottom);
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
}

function nearbyAnchors(frame: CanvasFrame, worldX: number, worldY: number) {
  const candidates: Array<{ distance: number; entry: VisualCommentNearbyAnchor }> = [];
  for (const element of frame.canvas.querySelectorAll(elementAnchorSelector)) {
    if (element.closest("[data-sbfx-capture-ignore]")) continue;
    const id = anchorId(element);
    if (!id || candidates.some((candidate) => candidate.entry.id === id)) continue;
    const rect = worldRectOf(frame, element);
    const dx = Math.max(rect.left - worldX, 0, worldX - rect.right);
    const dy = Math.max(rect.top - worldY, 0, worldY - rect.bottom);
    candidates.push({
      distance: Math.hypot(dx, dy),
      entry: { id, ...anchorLabel(element), dx: worldX - rect.left, dy: worldY - rect.top },
    });
  }
  return candidates
    .sort((left, right) => left.distance - right.distance)
    .slice(0, VISUAL_COMMENT_ANCHOR_LIMITS.maxNearby)
    .map((candidate) => candidate.entry);
}

/**
 * The anchor for a comment pressed at a client point inside the capture
 * target: an element anchor around the pressed element, else the nearest path
 * anchor within the hit distance, else a canvas point, else none.
 */
export function resolveCommentAnchor(
  target: Element,
  clientX: number,
  clientY: number,
  pressed?: Element | null,
): VisualCommentAnchor | undefined {
  const hit =
    pressed && (target === pressed || target.contains(pressed)) && !pressed.closest("[data-sbfx-capture-ignore]")
      ? pressed
      : hitElementAt(target, clientX, clientY);
  const elementAnchor = hit?.closest(elementAnchorSelector);
  if (elementAnchor && target.contains(elementAnchor) && !elementAnchor.closest("[data-sbfx-capture-ignore]")) {
    const id = anchorId(elementAnchor);
    const html = elementAnchor as HTMLElement;
    const { rect, x: scaleX, y: scaleY } = elementLayoutScale(elementAnchor);
    const width = html.offsetWidth > 0 ? html.offsetWidth : rect.width;
    const height = html.offsetHeight > 0 ? html.offsetHeight : rect.height;
    const route = elementAnchor.getAttribute("data-sbfx-anchor-route");
    if (id && width > 0 && height > 0) {
      return {
        type: "element",
        id,
        ...anchorLabel(elementAnchor),
        ...(route ? { route: route.slice(0, VISUAL_COMMENT_ANCHOR_LIMITS.maxRouteLength) } : {}),
        x: (clientX - rect.left) / scaleX,
        y: (clientY - rect.top) / scaleY,
        width,
        height,
      };
    }
  }
  const path = findPathAnchorAt(target, clientX, clientY);
  if (path) {
    return { type: "path", id: anchorId(path.element), ...anchorLabel(path.element), t: path.t };
  }
  const canvas = hit?.closest("[data-sbfx-canvas]");
  if (canvas && target.contains(canvas)) {
    const frame = getCanvasFrame(canvas);
    if (frame) {
      const world = clientToWorld(frame, clientX, clientY);
      const nearby = nearbyAnchors(frame, world.x, world.y);
      return { type: "canvas", x: world.x, y: world.y, ...(nearby.length ? { nearby } : {}) };
    }
  }
  return undefined;
}

function containsPoint(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function visibleIn(target: Element, element: Element | null, x: number, y: number): boolean {
  const view = target.ownerDocument.defaultView ?? window;
  if (x < 0 || y < 0 || x > view.innerWidth || y > view.innerHeight) return false;
  if (!containsPoint(target.getBoundingClientRect(), x, y)) return false;
  const canvas = element?.closest("[data-sbfx-canvas]");
  return !canvas || containsPoint(canvas.getBoundingClientRect(), x, y);
}

/**
 * Client position of an anchored pin, or null while it cannot be shown: the
 * anchor element (or the canvas) is missing, or the point lies outside the
 * capture target or the canvas element that holds the anchor.
 */
export function placeAnchoredPin(
  target: Element,
  anchor: VisualCommentAnchor,
): { left: number; top: number } | null {
  if (anchor.type === "canvas") {
    const canvas = target.matches("[data-sbfx-canvas]")
      ? target
      : target.querySelector("[data-sbfx-canvas]");
    const frame = canvas ? getCanvasFrame(canvas) : null;
    if (!canvas || !frame) return null;
    const point = worldToClient(frame, anchor.x, anchor.y);
    return visibleIn(target, canvas, point.x, point.y) ? { left: point.x, top: point.y } : null;
  }
  const element = findAnchorElement(target, anchor.id);
  if (!element) return null;
  let point: { x: number; y: number } | null;
  if (anchor.type === "path") {
    point = pathPointAt(element, anchor.t);
  } else {
    const { rect, x: scaleX, y: scaleY } = elementLayoutScale(element);
    point = { x: rect.left + anchor.x * scaleX, y: rect.top + anchor.y * scaleY };
  }
  if (!point || !visibleIn(target, element, point.x, point.y)) return null;
  return { left: point.x, top: point.y };
}

/**
 * Where a dragged saved pin may go: the visible part of the capture target and,
 * when the host declares a canvas, of that canvas, the same area pins are shown in.
 */
export function getPinDragBounds(target: Element): VisualCommentRect {
  const view = target.ownerDocument.defaultView ?? window;
  const bounds = target.getBoundingClientRect();
  let left = Math.max(0, bounds.left);
  let top = Math.max(0, bounds.top);
  let right = Math.min(view.innerWidth, bounds.right);
  let bottom = Math.min(view.innerHeight, bounds.bottom);
  const canvas = target.matches("[data-sbfx-canvas]")
    ? target
    : target.querySelector("[data-sbfx-canvas]");
  if (canvas) {
    const canvasRect = canvas.getBoundingClientRect();
    left = Math.max(left, canvasRect.left);
    top = Math.max(top, canvasRect.top);
    right = Math.min(right, canvasRect.right);
    bottom = Math.min(bottom, canvasRect.bottom);
  }
  return { height: Math.max(0, bottom - top), left, top, width: Math.max(0, right - left) };
}

/** The event a host dispatches after it moved anchors without resize or scroll. */
export const anchorsMovedEvent = "sbfx:anchors-moved";

/**
 * True when a recorded nearby anchor of a canvas comment is present but no
 * longer where it was relative to the comment point (more than 1 world pixel
 * on either axis), for example after a frame was dragged.
 */
export function hasCanvasLayoutChanged(target: Element, anchor: VisualCommentAnchor): boolean {
  if (anchor.type !== "canvas" || !anchor.nearby?.length) return false;
  const canvas = target.matches("[data-sbfx-canvas]") ? target : target.querySelector("[data-sbfx-canvas]");
  const frame = canvas ? getCanvasFrame(canvas) : null;
  if (!canvas || !frame) return false;
  return anchor.nearby.some((entry) => {
    const element = findAnchorElement(canvas, entry.id);
    if (!element) return false;
    const rect = worldRectOf(frame, element);
    return Math.abs(rect.left + entry.dx - anchor.x) > 1 || Math.abs(rect.top + entry.dy - anchor.y) > 1;
  });
}

/** The event the addon dispatches to ask the host to bring an anchor into view. */
export const revealAnchorEvent = "sbfx:reveal-anchor";

// ---------------------------------------------------------------------------
// Anchored capture evidence
// ---------------------------------------------------------------------------

const captureHookKey = Symbol.for("sbfx.captureHook");

export type VisualCommentCaptureHook = (options?: {
  maxScale?: number;
}) => Promise<VisualCommentAnchoredCapture>;

function plainRect(rect: DOMRect): VisualCommentRect {
  return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
}

/**
 * Registers this window's capture hook. Every review runtime does so on load,
 * so a parent page can ask an embedded same-origin Storybook preview to capture
 * itself with its own styles.
 */
export function registerVisualCommentCaptureHook(captureSelector?: string): void {
  if (typeof window === "undefined") return;
  const hook: VisualCommentCaptureHook = async (options) => {
    const target = resolveVisualCommentTarget(captureSelector);
    if (!target) throw new Error("The embedded preview has no capture target.");
    const rect = plainRect(target.getBoundingClientRect());
    return { capture: await captureVisualCommentTarget(target, { maxScale: options?.maxScale }), rect };
  };
  (window as unknown as Record<symbol, unknown>)[captureHookKey] = hook;
}

function frameCaptureHook(frame: HTMLIFrameElement): VisualCommentCaptureHook | null {
  try {
    const hook = (frame.contentWindow as unknown as Record<symbol, unknown> | null)?.[captureHookKey];
    return typeof hook === "function" ? (hook as VisualCommentCaptureHook) : null;
  } catch {
    // A cross-origin frame exposes nothing.
    return null;
  }
}

// A canvas screenshot draws in the pages of its largest visible frames, a few
// at a time, within one shared time budget.
const canvasFrameLimit = 12;
const canvasFrameMinSize = 24;
const canvasFrameBudgetMs = 4_000;
const canvasFrameConcurrency = 2;

// Maps a rect inside an iframe's viewport to page client coordinates, using
// the iframe's position read when this is called.
function frameToClientMapper(frame: HTMLIFrameElement) {
  const frameRect = frame.getBoundingClientRect();
  const scaleX = frame.clientWidth > 0 ? frameRect.width / frame.clientWidth : 1;
  const scaleY = frame.clientHeight > 0 ? frameRect.height / frame.clientHeight : 1;
  const { clientLeft, clientTop } = frame;
  return {
    frameRect,
    scaleX,
    toClient: (rect: VisualCommentRect): VisualCommentRect => ({
      height: rect.height * scaleY,
      left: frameRect.left + (clientLeft + rect.left) * scaleX,
      top: frameRect.top + (clientTop + rect.top) * scaleY,
      width: rect.width * scaleX,
    }),
  };
}

function intersectRects(first: DOMRect, second: DOMRect): VisualCommentRect | null {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  return right > left && bottom > top ? { height: bottom - top, left, top, width: right - left } : null;
}

async function loadCaptureImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

// The canvas element without iframe content, then the pages of up to
// canvasFrameLimit visible frames drawn in through each frame's own capture
// hook, each clipped to what of its iframe the canvas shows. A frame that
// fails or takes longer than canvasFrameTimeoutMs stays empty.
function captureCanvasWithFrames(canvas: HTMLElement): Promise<VisualCommentCapture> {
  // Read now, in the task of the press, so the frames line up with the pin.
  const bounds = canvas.getBoundingClientRect();
  const frames = Array.from(canvas.querySelectorAll("iframe"))
    .map((frame) => {
      const mapper = frameToClientMapper(frame);
      return { hook: frameCaptureHook(frame), mapper, visible: intersectRects(mapper.frameRect, bounds) };
    })
    .filter(
      (entry): entry is typeof entry & { hook: VisualCommentCaptureHook; visible: VisualCommentRect } =>
        Boolean(entry.hook && entry.visible) &&
        entry.visible!.width >= canvasFrameMinSize &&
        entry.visible!.height >= canvasFrameMinSize,
    )
    .sort((first, second) => second.visible.width * second.visible.height - first.visible.width * first.visible.height)
    .slice(0, canvasFrameLimit);
  return captureVisualCommentTarget(canvas, {
    omitIframes: true,
    drawOver: async (context, origin) => {
      const layers: Array<{ image: HTMLImageElement; rect: VisualCommentRect; visible: VisualCommentRect } | null> =
        frames.map(() => null);
      const deadline = performance.now() + canvasFrameBudgetMs;
      let next = 0;
      // Largest frames first, a few at a time; none starts once the budget is spent.
      const worker = async () => {
        while (next < frames.length && performance.now() < deadline) {
          const index = next;
          next += 1;
          const { hook, mapper, visible } = frames[index];
          try {
            const framed = await Promise.race([
              hook({ maxScale: Math.min(2, Math.max(0.25, mapper.scaleX * origin.scale)) }),
              new Promise<never>((_, reject) =>
                window.setTimeout(
                  () => reject(new Error("Frame capture ran out of time.")),
                  Math.max(0, deadline - performance.now()),
                ),
              ),
            ]);
            if (performance.now() > deadline) continue;
            layers[index] = {
              image: await loadCaptureImage(framed.capture.dataUrl),
              rect: mapper.toClient(framed.rect),
              visible,
            };
          } catch {
            // The frame stays empty.
          }
        }
      };
      await Promise.all(Array.from({ length: canvasFrameConcurrency }, worker));
      const { left, scale, top } = origin;
      for (const layer of layers) {
        if (!layer) continue;
        context.save();
        context.beginPath();
        context.rect(
          (layer.visible.left - left) * scale,
          (layer.visible.top - top) * scale,
          layer.visible.width * scale,
          layer.visible.height * scale,
        );
        context.clip();
        context.drawImage(
          layer.image,
          (layer.rect.left - left) * scale,
          (layer.rect.top - top) * scale,
          layer.rect.width * scale,
          layer.rect.height * scale,
        );
        context.restore();
      }
    },
  });
}

// The captured area relative to its anchor, read at the same moment as `rect`:
// a share of the anchor element's box, or the canvas world rect it covers.
function referenceFrame(
  anchorElement: Element,
  anchor: VisualCommentAnchor,
  rect: VisualCommentRect,
  box: DOMRect = anchorElement.getBoundingClientRect(),
): VisualCommentFrameReference | undefined {
  if (anchor.type === "element") {
    if (!box.width || !box.height) return undefined;
    return {
      kind: "element",
      id: anchor.id,
      left: (rect.left - box.left) / box.width,
      top: (rect.top - box.top) / box.height,
      width: rect.width / box.width,
      height: rect.height / box.height,
    };
  }
  const frame = getCanvasFrame(anchorElement);
  if (!frame) return undefined;
  const start = clientToWorld(frame, rect.left, rect.top);
  const end = clientToWorld(frame, rect.left + rect.width, rect.top + rect.height);
  return { kind: "world", x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
}

/**
 * Where a captured area is now: the reference mapped through the anchor
 * element's or the canvas world's current position, or null when that element
 * is gone.
 */
export function resolveFrameReference(
  target: Element,
  reference: VisualCommentFrameReference,
): VisualCommentRect | null {
  if (reference.kind === "element") {
    const element = findAnchorElement(target, reference.id);
    const box = element?.getBoundingClientRect();
    if (!box?.width || !box.height) return null;
    return {
      height: reference.height * box.height,
      left: box.left + reference.left * box.width,
      top: box.top + reference.top * box.height,
      width: reference.width * box.width,
    };
  }
  const canvas = target.matches("[data-sbfx-canvas]") ? target : target.querySelector("[data-sbfx-canvas]");
  const frame = canvas ? getCanvasFrame(canvas) : null;
  if (!frame) return null;
  const start = worldToClient(frame, reference.x, reference.y);
  const end = worldToClient(frame, reference.x + reference.width, reference.y + reference.height);
  return { height: end.y - start.y, left: start.x, top: start.y, width: end.x - start.x };
}

/**
 * Captures an anchored comment's own evidence: for a frame, the embedded page
 * through its review runtime's hook, else the anchor element; for a line or a
 * canvas point, the canvas element with the pages of its visible frames drawn
 * in. A failed capture is retried once without iframe content. Resolves null
 * when the anchor has no element, so the caller captures the target instead.
 */
export async function captureAnchoredComment(
  target: HTMLElement,
  anchor: VisualCommentAnchor,
): Promise<VisualCommentAnchoredCapture | null> {
  let element: HTMLElement | null;
  if (anchor.type === "element") {
    element = findAnchorElement(target, anchor.id) as HTMLElement | null;
  } else {
    const line = anchor.type === "path" ? findAnchorElement(target, anchor.id) : null;
    element = (line?.closest("[data-sbfx-canvas]") ??
      (target.matches("[data-sbfx-canvas]") ? target : target.querySelector("[data-sbfx-canvas]"))) as
      | HTMLElement
      | null;
  }
  if (!element) return null;
  const rect = plainRect(element.getBoundingClientRect());
  const reference = referenceFrame(element, anchor, rect);
  if (anchor.type !== "element") {
    try {
      return { capture: await captureCanvasWithFrames(element), rect, reference };
    } catch {
      return { capture: await captureVisualCommentTarget(element, { omitIframes: true }), rect, reference };
    }
  }
  const frame = element.querySelector("iframe");
  const hook = frame ? frameCaptureHook(frame) : null;
  if (frame && hook) {
    // The frame's and the anchor element's positions are read before the hook
    // runs: the host can move the canvas while the frame captures its page.
    const mapper = frameToClientMapper(frame);
    const anchorBox = element.getBoundingClientRect();
    try {
      const framed = await hook();
      const framedRect = mapper.toClient(framed.rect);
      return {
        capture: framed.capture,
        rect: framedRect,
        reference: referenceFrame(element, anchor, framedRect, anchorBox),
      };
    } catch {
      return {
        capture: await captureVisualCommentTarget(element, { layout: true, omitIframes: true }),
        rect,
        reference,
      };
    }
  }
  try {
    return { capture: await captureVisualCommentTarget(element, { layout: true }), rect, reference };
  } catch {
    return {
      capture: await captureVisualCommentTarget(element, { layout: true, omitIframes: true }),
      rect,
      reference,
    };
  }
}
