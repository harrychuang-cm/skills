// src/visualComment.ts
import { toCanvas } from "html-to-image";

// src/captureStyleProperties.ts
var sharedListKey = /* @__PURE__ */ Symbol.for("sbfx.captureStyleProperties");
function sharedList() {
  const host = globalThis;
  return host[sharedListKey] ??= [];
}
var customPropertyReference = /var\(\s*(--[^\s,)]+)/g;
function collectReferencedCustomProperties(markup) {
  const names = /* @__PURE__ */ new Set();
  for (const match of markup.matchAll(customPropertyReference)) {
    names.add(match[1]);
  }
  return [...names];
}
function getCaptureStyleProperties(target) {
  const list = sharedList();
  if (list.length === 0) {
    for (const name of Array.from(getComputedStyle(document.documentElement))) {
      if (!name.startsWith("--")) list.push(name);
    }
  }
  for (const name of collectReferencedCustomProperties(target.outerHTML)) {
    if (!list.includes(name)) list.push(name);
  }
  return list;
}

// src/visualComment.ts
var defaultVisualCommentsCaptureSelector = "#storybook-root";
var VISUAL_COMMENT_LIMITS = {
  maxRequestBytes: 4 * 1024 * 1024,
  maxImageBytes: 2 * 1024 * 1024,
  maxImageLongestSide: 2048,
  maxImagePixels: 4 * 1024 * 1024,
  maxSessionAssetsBytes: 100 * 1024 * 1024,
  maxTitleLength: 120,
  maxAuthorLength: 80,
  maxBodyLength: 2e3
};
function clampRatio(value) {
  return Math.min(1, Math.max(0, value));
}
function resolveVisualCommentTarget(selector, documentRef = document) {
  const candidates = [selector, defaultVisualCommentsCaptureSelector, "body"].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
  for (const candidate of candidates) {
    const element = documentRef.querySelector(candidate);
    if (element) return element;
  }
  return null;
}
function getVisualCommentPin(rect, clientX, clientY) {
  return {
    xRatio: clampRatio((clientX - rect.left) / rect.width),
    yRatio: clampRatio((clientY - rect.top) / rect.height)
  };
}
function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read capture."));
    reader.readAsDataURL(blob);
  });
}
function encodeCanvas(canvas, quality) {
  return new Promise(
    (resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("Unable to encode capture.")),
      "image/webp",
      quality
    )
  );
}
function isTransparentColor(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "transparent") return true;
  const functional = normalized.match(/^rgba?\((.*)\)$/);
  if (!functional) return false;
  const channels = functional[1].trim().split(/[\s,\/]+/).filter(Boolean);
  return channels.length >= 4 && Number.parseFloat(channels.at(-1) ?? "1") === 0;
}
function resolveCaptureBackground(target) {
  let current = target;
  while (current) {
    const backgroundColor = getComputedStyle(current).backgroundColor;
    if (!isTransparentColor(backgroundColor)) return backgroundColor;
    current = current.parentElement;
  }
  return "rgb(255 255 255)";
}
function hasVisibleCanvasPixels(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to inspect captured UI pixels.");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 0) return true;
  }
  return false;
}
var svgPaintProperties = [
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
  "display"
];
function inlineSvgChildPaint(target) {
  const elements = Array.from(target.querySelectorAll("svg *")).filter(
    (element) => element instanceof SVGElement
  );
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
  const written = elements.map((element) => element.getAttribute("style"));
  const writtenValues = elements.map(
    (element) => svgPaintProperties.map((property) => element.style.getPropertyValue(property))
  );
  return () => {
    elements.forEach((element, index) => {
      const original = originals[index];
      if (element.getAttribute("style") === written[index]) {
        if (original === null) element.removeAttribute("style");
        else element.setAttribute("style", original);
        return;
      }
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
async function captureVisualCommentTarget(target, options = {}) {
  const clientRect = target.getBoundingClientRect();
  if (!clientRect.width || !clientRect.height) throw new Error("Capture target has zero bounds.");
  const rect = {
    height: options.layout && target.offsetHeight > 0 ? target.offsetHeight : clientRect.height,
    left: clientRect.left,
    top: clientRect.top,
    width: options.layout && target.offsetWidth > 0 ? target.offsetWidth : clientRect.width
  };
  await nextAnimationFrame();
  await nextAnimationFrame();
  const scale = Math.min(
    2,
    options.maxScale ?? 2,
    VISUAL_COMMENT_LIMITS.maxImageLongestSide / Math.max(rect.width, rect.height),
    Math.sqrt(VISUAL_COMMENT_LIMITS.maxImagePixels / (rect.width * rect.height))
  );
  const intendedWidth = Math.max(1, Math.trunc(rect.width * scale));
  const intendedHeight = Math.max(1, Math.trunc(rect.height * scale));
  const restoreSvgPaint = inlineSvgChildPaint(target);
  let canvas;
  try {
    canvas = await Promise.race([
      toCanvas(target, {
        backgroundColor: resolveCaptureBackground(target),
        canvasHeight: rect.height,
        canvasWidth: rect.width,
        filter: (node) => !(node instanceof Element && node.hasAttribute("data-sbfx-capture-ignore")) && // A canvas capture leaves frame previews empty instead of cloning
        // every embedded page.
        !(options.omitIframes && node instanceof HTMLIFrameElement),
        fontEmbedCSS: "",
        height: rect.height,
        includeStyleProperties: getCaptureStyleProperties(target),
        pixelRatio: scale,
        skipFonts: true,
        skipAutoScale: true,
        ...options.layout ? {
          style: {
            inset: "0px auto auto 0px",
            margin: "0px",
            position: "relative",
            rotate: "none",
            scale: "none",
            transform: "none",
            translate: "none"
          }
        } : {},
        width: rect.width
      }),
      new Promise(
        (_, reject) => window.setTimeout(
          () => reject(new Error("Timed out rendering captured UI.")),
          options.renderTimeoutMs ?? 8e3
        )
      )
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
  if (width < 1 || height < 1 || Math.abs(width - intendedWidth) > 1 || Math.abs(height - intendedHeight) > 1) {
    throw new Error(
      `Captured image dimensions are invalid (${width}\xD7${height}; expected ${intendedWidth}\xD7${intendedHeight}).`
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
var captureSequenceWindowMs = 500;
var activeSequenceGuard = null;
function guardClickSequence(documentRef, selector, until) {
  activeSequenceGuard?.();
  const types = ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"];
  const swallow = (event) => {
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
function beginVisualCommentCapture({
  capture = captureVisualCommentTarget,
  documentRef = document,
  onCancel,
  onCaptured,
  onError,
  onPointSelected,
  resolveAnchor,
  captureAnchor,
  selector
}) {
  let active = true;
  let cancelled = false;
  let pointerStarted = false;
  let pressedAt = 0;
  let cleanupTimer;
  activeSequenceGuard?.();
  const cleanup = () => {
    if (!active) return;
    active = false;
    if (cleanupTimer !== void 0) window.clearTimeout(cleanupTimer);
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
  const swallowPointer = (event) => {
    if (!pointerStarted) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const onClick = (event) => {
    if (!pointerStarted) return;
    swallowPointer(event);
    cleanup();
    guardClickSequence(documentRef, selector, pressedAt + captureSequenceWindowMs);
  };
  const onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  };
  const onPointerDown = (event) => {
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
    const anchor = resolveAnchor?.(target, event.clientX, event.clientY, eventTarget);
    const view = documentRef.defaultView ?? window;
    const viewport = {
      width: view.innerWidth,
      height: view.innerHeight,
      devicePixelRatio: view.devicePixelRatio,
      scrollX: view.scrollX,
      scrollY: view.scrollY
    };
    onPointSelected?.({ pin, ...anchor ? { anchor } : {}, viewport });
    const { clientX, clientY } = event;
    const captureWork = anchor && captureAnchor ? captureAnchor(target, anchor).then(async (anchored) => {
      if (!anchored) return { capture: await capture(target), pin, anchor, viewport };
      return {
        anchor,
        capture: anchored.capture,
        pin: getVisualCommentPin(anchored.rect, clientX, clientY),
        pinFrame: anchored.rect,
        ...anchored.reference ? { pinFrameReference: anchored.reference } : {},
        viewport
      };
    }) : capture(target).then((captured) => ({
      capture: captured,
      pin,
      ...anchor ? { anchor } : {},
      viewport
    }));
    void captureWork.then((result) => {
      if (!cancelled) onCaptured(result);
    }).catch((error) => {
      if (!cancelled) {
        onError(error instanceof Error ? error : new Error("Unable to capture UI."));
      }
    }).finally(() => {
      if (active) cleanupTimer = window.setTimeout(cleanup, 2e3);
    });
  };
  documentRef.documentElement.dataset.sbfxCaptureMode = "true";
  documentRef.addEventListener("pointerdown", onPointerDown, true);
  documentRef.addEventListener("pointerup", swallowPointer, true);
  documentRef.addEventListener("click", onClick, true);
  documentRef.addEventListener("keydown", onKeyDown, true);
  return { cancel };
}

// src/reviewController.ts
function createReviewStatusController({
  apiPath,
  fetcher = globalThis.fetch
}) {
  return {
    async load(storyId, signal) {
      const payload = await requestJson(
        fetcher,
        `${apiPath}?storyId=${encodeURIComponent(storyId)}`,
        { signal },
        `Review status GET ${apiPath}`
      );
      return payload.entry ?? null;
    },
    async save(storyId, entry) {
      return requestJson(
        fetcher,
        apiPath,
        {
          body: JSON.stringify({ entry, storyId }),
          headers: { "Content-Type": "application/json" },
          method: "PUT"
        },
        `Review status PUT ${apiPath}`
      );
    }
  };
}
function createVisualCommentsController({
  apiPath,
  fetcher = globalThis.fetch
}) {
  return {
    beginCapture(options) {
      return beginVisualCommentCapture(options);
    },
    delete(path) {
      return requestJson(
        fetcher,
        `${apiPath}${path}`,
        { method: "DELETE" },
        `Visual comments DELETE ${apiPath}${path}`
      );
    },
    // Returns the active meeting, creating one with this title when none exists.
    // HTTP 409 means another browser started one first; that meeting is used.
    async ensureMeeting(title) {
      const operation = `Visual comments POST ${apiPath}/sessions`;
      const response = await fetcher(`${apiPath}/sessions`, {
        body: JSON.stringify({ title }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await response.json().catch(() => ({}));
      const createdId = response.ok ? payload.meeting?.session?.id : void 0;
      if (createdId) return createdId;
      const activeId = response.status === 409 ? payload.activeMeeting?.id : void 0;
      if (activeId) return activeId;
      throw new Error(
        `${operation} returned HTTP ${response.status}${payload.error ? `: ${payload.error}` : "."}`
      );
    },
    // The whole meeting, including the captures of every Story.
    getMeeting(sessionId) {
      return requestJson(
        fetcher,
        `${apiPath}/sessions/${encodeURIComponent(sessionId)}`,
        void 0,
        `Visual comments GET ${apiPath}/sessions`
      );
    },
    getOverview(storyId) {
      return requestJson(
        fetcher,
        `${apiPath}?storyId=${encodeURIComponent(storyId)}`,
        void 0,
        `Visual comments GET ${apiPath}`
      );
    },
    patch(path, body) {
      return requestJson(
        fetcher,
        `${apiPath}${path}`,
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          method: "PATCH"
        },
        `Visual comments PATCH ${apiPath}${path}`
      );
    },
    post(path, body) {
      return requestJson(
        fetcher,
        `${apiPath}${path}`,
        {
          body: body === void 0 ? void 0 : JSON.stringify(body),
          headers: body === void 0 ? void 0 : { "Content-Type": "application/json" },
          method: "POST"
        },
        `Visual comments POST ${apiPath}${path}`
      );
    },
    resolveTarget(selector) {
      return resolveVisualCommentTarget(selector);
    }
  };
}
async function requestJson(fetcher, url, init, operation) {
  const response = await fetcher(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${operation} returned HTTP ${response.status}${payload.error ? `: ${payload.error}` : "."}`
    );
  }
  return payload;
}
export {
  createReviewStatusController,
  createVisualCommentsController
};
//# sourceMappingURL=review-controller.js.map