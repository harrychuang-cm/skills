// Route snapshots for the UI Flow level of detail. The inspector window clones
// a same-origin route frame's document with the computed styles that differ
// from the user agent's inlined, draws the clone through an SVG foreignObject
// image loaded from a data: URL and encodes the bitmap. No package dependency;
// nothing reads window or document at load time, so node can import it.
import { hashMarkup } from "./flow-canvas-geometry.js";

// Bump when the stored snapshot format changes: earlier records go unused.
export const SNAPSHOT_FORMAT_VERSION = 1;
export const SNAPSHOT_LIMITS = Object.freeze({
  maxArea: 4_000_000,
  maxSide: 4096,
  quality: 0.8,
  timeoutMs: 8_000,
  yieldMs: 32,
});

const xhtmlNamespace = "http://www.w3.org/1999/xhtml";
const svgNamespace = "http://www.w3.org/2000/svg";
const elementNode = 1;
const textNode = 3;
// Never cloned: they do not paint, and a <style> would style the clone twice.
const skippedTags = new Set(["base", "head", "link", "meta", "noscript", "script", "style", "template", "title"]);
// Storybook's preparing and error displays: not a route to capture.
const notReadyBodyClasses = ["sb-show-preparing-story", "sb-show-preparing-docs", "sb-show-errordisplay"];
// Inherited properties compare with the parent's computed value; every other
// property compares with the user agent's default for the element type.
// Listing a non-inherited property here would drop author styles, so the list
// keeps to properties CSS defines as inherited.
const inheritedProperties = new Set([
  "border-collapse", "border-spacing", "caption-side", "caret-color", "clip-rule", "color",
  "color-interpolation", "color-interpolation-filters", "color-rendering", "cursor", "direction",
  "dominant-baseline", "empty-cells", "fill", "fill-opacity", "fill-rule", "font-family",
  "font-feature-settings", "font-kerning", "font-optical-sizing", "font-palette", "font-size",
  "font-size-adjust", "font-stretch", "font-style", "font-synthesis-small-caps",
  "font-synthesis-style", "font-synthesis-weight", "font-variant-alternates", "font-variant-caps",
  "font-variant-east-asian", "font-variant-ligatures", "font-variant-numeric",
  "font-variant-position", "font-variation-settings", "font-weight", "hyphenate-character",
  "hyphens", "image-orientation", "image-rendering", "letter-spacing", "line-break", "line-height",
  "list-style-image", "list-style-position", "list-style-type", "marker-end", "marker-mid",
  "marker-start", "orphans", "overflow-wrap", "paint-order", "pointer-events", "quotes",
  "ruby-position", "shape-rendering", "stroke", "stroke-dasharray", "stroke-dashoffset",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-width",
  "tab-size", "text-align", "text-align-last", "text-anchor", "text-decoration-skip-ink",
  "text-emphasis-color", "text-emphasis-position", "text-emphasis-style", "text-indent",
  "text-orientation", "text-rendering", "text-shadow", "text-transform",
  "text-underline-offset", "text-underline-position", "text-wrap-mode", "text-wrap-style",
  "visibility", "white-space-collapse", "widows", "word-break", "word-spacing", "writing-mode",
  "-webkit-border-horizontal-spacing", "-webkit-border-vertical-spacing", "-webkit-font-smoothing",
  "-webkit-locale", "-webkit-text-fill-color", "-webkit-text-stroke-color",
  "-webkit-text-stroke-width", "-webkit-text-security",
]);
// A parent with unusual inherited values: a child whose inherited property
// does not follow it has that property set by the user agent (the font
// shorthand on button resets line-height, links set color).
const probeParentStyle = [
  "color:rgb(1, 2, 3)",
  "cursor:crosshair",
  "fill:rgb(4, 5, 6)",
  "font-family:monospace",
  "font-size:21px",
  "font-style:italic",
  "font-variant-caps:small-caps",
  "font-weight:700",
  "letter-spacing:3px",
  "line-height:37px",
  "list-style-type:square",
  "overflow-wrap:anywhere",
  "stroke:rgb(7, 8, 9)",
  "stroke-width:3px",
  "tab-size:3",
  "text-align:right",
  "text-indent:5px",
  "text-shadow:rgb(10, 11, 12) 1px 1px 0px",
  "text-transform:uppercase",
  "white-space:pre",
  "word-break:break-all",
  "word-spacing:7px",
].join(";");
// Properties with no effect on a still image.
const ignoredPropertyPrefixes = ["animation", "transition", "view-transition"];

function createAbortError() {
  const error = new Error("The snapshot was aborted.");
  error.name = "AbortError";
  return error;
}

function createTimeoutError() {
  const error = new Error("The snapshot took too long.");
  error.name = "TimeoutError";
  return error;
}

// Draw scale: 0.8 of the device pixel ratio, never above 1:1, with the
// longest side at most 4096 pixels and the area at most 4 megapixels.
export function getSnapshotScale(width, height, devicePixelRatio = 1) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  let scale = Math.min(1, 0.8 * ratio);

  if (width > 0 && height > 0) {
    scale = Math.min(
      scale,
      SNAPSHOT_LIMITS.maxSide / Math.max(width, height),
      Math.sqrt(SNAPSHOT_LIMITS.maxArea / (width * height)),
    );
  }

  return scale;
}

// The standard properties a computed style declaration lists: every name
// except custom properties, which are never enumerated or inlined.
export function getStandardPropertyNames(declaration) {
  const names = [];

  for (let index = 0; index < (declaration?.length ?? 0); index += 1) {
    const name = typeof declaration.item === "function" ? declaration.item(index) : declaration[index];

    if (
      typeof name === "string" &&
      name &&
      !name.startsWith("--") &&
      !ignoredPropertyPrefixes.some((prefix) => name.startsWith(prefix))
    ) {
      names.push(name);
    }
  }

  return names;
}

// Properties whose computed value can reference resources by url().
const urlProperties = new Set(["background-image", "border-image-source", "list-style-image", "mask-image", "-webkit-mask-image"]);
// Embedded @font-face rules, per font URL, for the whole page session.
const fontDataCache = new Map();

// The reason a frame cannot be captured yet, or null when it can.
export function getFrameNotReadyReason(frameDocument) {
  const body = frameDocument?.body;

  if (!body) {
    return "not-ready";
  }

  return notReadyBodyClasses.some((name) => body.classList?.contains(name)) ? "not-ready" : null;
}

// User agent defaults, read once per element type from a hidden standards-mode
// about:blank document of the inspector window.
const sandboxes = new WeakMap();

function getSandbox(ownerDocument) {
  const existing = sandboxes.get(ownerDocument);

  if (existing?.frame.isConnected && existing.frame.contentDocument) {
    return existing;
  }

  const frame = ownerDocument.createElement("iframe");

  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("inert", "");
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("data-prototype-inspector-style-sandbox", "true");
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:200px;height:200px;border:0;opacity:0;pointer-events:none;";
  ownerDocument.body.append(frame);

  const sandboxDocument = frame.contentDocument;

  sandboxDocument.open();
  sandboxDocument.write("<!doctype html><html><head></head><body></body></html>");
  sandboxDocument.close();

  const bodyStyle = frame.contentWindow.getComputedStyle(sandboxDocument.body);
  const names = getStandardPropertyNames(bodyStyle);
  const probe = sandboxDocument.createElement("div");

  probe.setAttribute("style", probeParentStyle);
  sandboxDocument.body.append(probe);

  const probeStyle = frame.contentWindow.getComputedStyle(probe);
  const sandbox = {
    defaults: new Map(),
    frame,
    names,
    probe,
    probeValues: new Map(names.map((name) => [name, probeStyle.getPropertyValue(name)])),
  };

  sandboxes.set(ownerDocument, sandbox);
  return sandbox;
}

function getDefaultStyle(sandbox, namespace, tagName) {
  const key = `${namespace}|${tagName}`;
  const cached = sandbox.defaults.get(key);

  if (cached) {
    return cached;
  }

  const sandboxDocument = sandbox.frame.contentDocument;
  const isSvg = namespace === svgNamespace;
  const element = isSvg
    ? sandboxDocument.createElementNS(svgNamespace, tagName)
    : sandboxDocument.createElement(tagName);
  const host = isSvg && tagName !== "svg" ? sandboxDocument.createElementNS(svgNamespace, "svg") : null;

  if (host) {
    host.append(element);
    sandboxDocument.body.append(host);
  } else {
    sandboxDocument.body.append(element);
  }

  const computed = sandbox.frame.contentWindow.getComputedStyle(element);
  const values = new Map(sandbox.names.map((name) => [name, computed.getPropertyValue(name)]));
  // The same element type under the probe parent: an inherited property that
  // does not follow the parent is set by the user agent on this type, so it
  // compares with the default, not with the parent.
  const probeElement = isSvg
    ? sandboxDocument.createElementNS(svgNamespace, tagName)
    : sandboxDocument.createElement(tagName);
  const probeHost = isSvg && tagName !== "svg" ? sandboxDocument.createElementNS(svgNamespace, "svg") : null;

  if (probeHost) {
    probeHost.append(probeElement);
    sandbox.probe.append(probeHost);
  } else {
    sandbox.probe.append(probeElement);
  }

  const probeComputed = sandbox.frame.contentWindow.getComputedStyle(probeElement);
  const setByAgent = new Set(
    sandbox.names.filter(
      (name) =>
        inheritedProperties.has(name) &&
        probeComputed.getPropertyValue(name) !== sandbox.probeValues.get(name),
    ),
  );

  (host ?? element).remove();
  (probeHost ?? probeElement).remove();

  const style = { setByAgent, values };

  sandbox.defaults.set(key, style);
  return style;
}

function getStyleText(context, computed, parentComputed, defaults) {
  const declarations = [];

  for (const name of context.names) {
    const value = computed.getPropertyValue(name);

    if (!value) {
      continue;
    }

    const compareWith =
      inheritedProperties.has(name) && parentComputed && !defaults.setByAgent.has(name)
        ? parentComputed.getPropertyValue(name)
        : defaults.values.get(name);

    if (value !== compareWith) {
      declarations.push(`${name}:${value}`);
    }
  }

  return declarations.join(";");
}

async function maybeYield(context) {
  const now = context.hostWindow.performance.now();

  if (now - context.lastYield < SNAPSHOT_LIMITS.yieldMs) {
    return;
  }

  await new Promise((resolve) => context.hostWindow.setTimeout(resolve, 0));
  context.lastYield = context.hostWindow.performance.now();

  if (context.signal?.aborted) {
    throw createAbortError();
  }

  if (context.lastYield > context.deadline) {
    throw createTimeoutError();
  }
}

function copyFormState(source, clone) {
  const tag = source.localName;

  if (tag === "input") {
    if (source.type === "checkbox" || source.type === "radio") {
      if (source.checked) clone.setAttribute("checked", "");
      else clone.removeAttribute("checked");
    } else {
      clone.setAttribute("value", source.value);
    }
  } else if (tag === "textarea") {
    clone.textContent = source.value;
  } else if (tag === "option") {
    if (source.selected) clone.setAttribute("selected", "");
    else clone.removeAttribute("selected");
  }
}

// A same-origin resource as a data: URL, or null when it cannot be read (the
// clone then paints nothing in its place).
function readAsDataUrl(context, url) {
  if (!url || url.startsWith("data:")) {
    return Promise.resolve(url || null);
  }

  let pending = context.resources.get(url);

  if (!pending) {
    pending = (async () => {
      try {
        const response = await context.hostWindow.fetch(url, { credentials: "same-origin" });

        if (!response.ok) {
          return null;
        }

        const blob = await response.blob();

        return await new Promise((resolve) => {
          const reader = new context.hostWindow.FileReader();

          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();
    context.resources.set(url, pending);
  }

  return pending;
}

// Replaces every url(...) in a computed value with a data: URL.
async function inlineUrls(context, value) {
  const matches = [...value.matchAll(/url\((['"]?)(.*?)\1\)/g)];
  let result = value;

  for (const match of matches) {
    const dataUrl = await readAsDataUrl(context, match[2]);

    result = result.replace(match[0], dataUrl ? `url("${dataUrl}")` : "none");
  }

  return result;
}

async function getInlinedStyle(context, computed, parentComputed, defaults) {
  const style = getStyleText(context, computed, parentComputed, defaults);

  if (!style.includes("url(")) {
    return style;
  }

  const declarations = [];

  for (const declaration of style.split(/;(?![^(]*\))/)) {
    const separator = declaration.indexOf(":");
    const name = declaration.slice(0, separator);

    declarations.push(
      urlProperties.has(name) ? `${name}:${await inlineUrls(context, declaration.slice(separator + 1))}` : declaration,
    );
  }

  return declarations.join(";");
}

// ::before and ::after become rules of a <style> in the clone, keyed by a
// class the clone carries.
async function clonePseudoElements(context, source, computed, clone) {
  for (const pseudo of ["::before", "::after"]) {
    const pseudoComputed = context.sourceWindow.getComputedStyle(source, pseudo);
    const content = pseudoComputed.getPropertyValue("content");

    if (!content || content === "none" || content === "normal" || pseudoComputed.display === "none") {
      continue;
    }

    const className = `sbfx-snapshot-${context.pseudoRules.length}`;
    const style = await getInlinedStyle(
      context,
      pseudoComputed,
      computed,
      getDefaultStyle(context.sandbox, xhtmlNamespace, "span"),
    );

    clone.classList.add(className);
    context.pseudoRules.push(`.${className}${pseudo}{content:${content};${style}}`);
  }
}

// Nested frames and videos paint a neutral box of their size.
function createPlaceholder(context, style) {
  const placeholder = context.ownerDocument.createElementNS(xhtmlNamespace, "div");

  placeholder.setAttribute("style", `${style};background-color:rgb(127 127 127 / 0.16)`);
  return placeholder;
}

async function cloneElement(context, source, parentComputed, cloneTagName) {
  await maybeYield(context);

  if (source.hasAttribute?.("data-sbfx-capture-ignore")) {
    return null;
  }

  const computed = context.sourceWindow.getComputedStyle(source);

  if (computed.display === "none") {
    return null;
  }

  if (source.localName === "iframe" || source.localName === "video") {
    return createPlaceholder(
      context,
      await getInlinedStyle(context, computed, parentComputed, getDefaultStyle(context.sandbox, xhtmlNamespace, "div")),
    );
  }

  if (source.localName === "canvas") {
    const image = context.ownerDocument.createElementNS(xhtmlNamespace, "img");
    const style = await getInlinedStyle(context, computed, parentComputed, getDefaultStyle(context.sandbox, xhtmlNamespace, "img"));

    try {
      image.setAttribute("src", source.toDataURL("image/png"));
    } catch {
      return createPlaceholder(context, style);
    }
    image.setAttribute("style", style);
    return image;
  }

  const namespace = source.namespaceURI === svgNamespace ? svgNamespace : xhtmlNamespace;
  const tagName = cloneTagName ?? source.localName;
  const clone =
    namespace === svgNamespace
      ? context.ownerDocument.createElementNS(svgNamespace, tagName)
      : context.ownerDocument.createElementNS(xhtmlNamespace, tagName);

  for (const attribute of source.attributes) {
    if (attribute.name === "style" || attribute.name.startsWith("on")) {
      continue;
    }

    try {
      if (attribute.namespaceURI) {
        clone.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
      } else {
        clone.setAttribute(attribute.name, attribute.value);
      }
    } catch {
      // A name the clone's document rejects is not needed to paint.
    }
  }

  copyFormState(source, clone);

  if (source.localName === "img") {
    const dataUrl = await readAsDataUrl(context, source.currentSrc || source.src);

    clone.removeAttribute("srcset");
    clone.removeAttribute("loading");
    if (dataUrl) {
      clone.setAttribute("src", dataUrl);
    } else {
      clone.removeAttribute("src");
    }
  } else if (namespace === svgNamespace && (tagName === "image" || tagName === "use")) {
    const reference = source.getAttribute("href") ?? source.getAttributeNS("http://www.w3.org/1999/xlink", "href");

    if (tagName === "image" && reference) {
      const dataUrl = await readAsDataUrl(context, new context.hostWindow.URL(reference, source.baseURI).href);

      clone.setAttribute("href", dataUrl ?? "");
    }
  }

  let style = await getInlinedStyle(
    context,
    computed,
    parentComputed,
    getDefaultStyle(context.sandbox, namespace, tagName),
  );

  // Scrollbars do not belong in a still image of the frame.
  if (/(auto|scroll)/.test(`${computed.overflowX} ${computed.overflowY}`)) {
    style = `${style}${style ? ";" : ""}scrollbar-width:none`;
  }

  if (style) {
    clone.setAttribute("style", style);
  }

  if (namespace === xhtmlNamespace) {
    await clonePseudoElements(context, source, computed, clone);
  }

  if (source.localName !== "textarea") {
    for (const child of source.childNodes) {
      const childClone = await cloneNode(context, child, computed);

      if (childClone) {
        clone.append(childClone);
      }
    }
  }

  return clone;
}

async function cloneNode(context, source, parentComputed) {
  if (source.nodeType === textNode) {
    return context.ownerDocument.createTextNode(source.data);
  }

  if (source.nodeType !== elementNode || skippedTags.has(source.localName)) {
    return null;
  }

  return cloneElement(context, source, parentComputed);
}

function normalizeFontFamily(value) {
  return String(value ?? "").replace(/['"]/g, "").trim().toLowerCase();
}

function getFontFaceKey(family, weight, style, unicodeRange) {
  const normalize = (value, fallback) => (String(value ?? "").trim().toLowerCase() || fallback).replace(/\s+/g, "");

  return [family, normalize(weight, "normal"), normalize(style, "normal"), normalize(unicodeRange, "u+0-10ffff")].join("|");
}

// The faces the frame document has loaded, or null when the browser exposes
// no font set (every face of a used family then counts).
function getLoadedFontFaceKeys(sourceDocument) {
  const fonts = sourceDocument.fonts;

  if (!fonts || typeof fonts.forEach !== "function") {
    return null;
  }

  const keys = new Set();

  fonts.forEach((face) => {
    if (face.status === "loaded") {
      keys.add(getFontFaceKey(normalizeFontFamily(face.family), face.weight, face.style, face.unicodeRange));
    }
  });
  return keys;
}

// The @font-face rules the frame has loaded, of the families it uses, from
// its same-origin style sheets. Each keeps only its first url() source (the
// one the browser picks; woff fallbacks and unused unicode-range subsets
// would multiply the font data), with the absolute URL in referenceText.
function collectFontFaces(hostWindow, sourceDocument, families) {
  const loaded = getLoadedFontFaceKeys(sourceDocument);
  const faces = [];

  for (const sheet of sourceDocument.styleSheets) {
    let cssRules;

    try {
      cssRules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of cssRules ?? []) {
      if (rule.type !== 5) {
        continue;
      }

      const family = normalizeFontFamily(rule.style.getPropertyValue("font-family"));

      if (!families.has(family)) {
        continue;
      }

      const key = getFontFaceKey(
        family,
        rule.style.getPropertyValue("font-weight"),
        rule.style.getPropertyValue("font-style"),
        rule.style.getPropertyValue("unicode-range"),
      );

      if (loaded && !loaded.has(key)) {
        continue;
      }

      const sourceText = rule.style.getPropertyValue("src");
      const first = sourceText.match(/url\((['"]?)(.*?)\1\)(\s*format\([^)]*\))?/);

      if (!first) {
        // local() sources only: nothing to embed.
        faces.push({ cssText: rule.cssText, referenceText: rule.cssText, url: null });
        continue;
      }

      const url = new hostWindow.URL(first[2], sheet.href ?? sourceDocument.baseURI).href;
      const format = first[3] ?? "";

      faces.push({
        cssText: rule.cssText,
        format,
        referenceText: rule.cssText.replace(sourceText, `url("${url}")${format}`),
        sourceText,
        url,
      });
    }
  }

  return faces;
}

// The face rules with their sources embedded as data: URLs (fetched once per
// page session).
async function embedFontFaces(context, faces) {
  const rules = [];

  for (const face of faces) {
    if (!face.url) {
      rules.push(face.cssText);
      continue;
    }

    let dataUrl = fontDataCache.get(face.url);

    if (dataUrl === undefined) {
      dataUrl = await readAsDataUrl(context, face.url);
      fontDataCache.set(face.url, dataUrl);
    }

    rules.push(face.cssText.replace(face.sourceText, dataUrl ? `url("${dataUrl}")${face.format}` : "none"));
  }

  return rules;
}

function collectFontFamilies(root) {
  const families = new Set();

  for (const element of [root, ...root.querySelectorAll("[style*='font-family']")]) {
    const value = element.style?.getPropertyValue("font-family") ?? "";

    for (const family of value.split(",")) {
      const name = family.replace(/['"]/g, "").trim().toLowerCase();

      if (name) {
        families.add(name);
      }
    }
  }

  return families;
}

function isTransparent(color) {
  return !color || color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color);
}

// The frame document's body cloned with its styles inlined, inside a box of
// the preview size that stands in for the root element, serialized to XHTML.
// background is the color the document paints behind everything. markupHash
// covers the markup with font URLs instead of font data, so a capture whose
// hash equals previousMarkupHash returns { unchanged: true } before fonts are
// embedded.
export async function serializeFrameDocument(iframe, { previewHeight, previewWidth, previousMarkupHash, signal, deadline } = {}) {
  const sourceWindow = iframe.contentWindow;
  const sourceDocument = iframe.contentDocument;
  const ownerDocument = iframe.ownerDocument;
  const hostWindow = ownerDocument.defaultView;
  const sandbox = getSandbox(ownerDocument);
  const context = {
    deadline: deadline ?? hostWindow.performance.now() + SNAPSHOT_LIMITS.timeoutMs,
    hostWindow,
    lastYield: hostWindow.performance.now(),
    names: sandbox.names,
    ownerDocument,
    pseudoRules: [],
    resources: new Map(),
    sandbox,
    signal,
    sourceWindow,
  };
  const width = Math.max(1, Math.ceil(previewWidth));
  const height = Math.max(1, Math.ceil(previewHeight));
  const rootComputed = sourceWindow.getComputedStyle(sourceDocument.documentElement);
  const bodyComputed = sourceWindow.getComputedStyle(sourceDocument.body);
  // CSS propagates the body background to the canvas when the root has none.
  const background = !isTransparent(rootComputed.backgroundColor)
    ? rootComputed.backgroundColor
    : bodyComputed.backgroundColor;
  const root = ownerDocument.createElementNS(xhtmlNamespace, "div");
  const rootStyle = getStyleText(context, rootComputed, null, getDefaultStyle(sandbox, xhtmlNamespace, "div"));

  root.setAttribute(
    "style",
    `${rootStyle};margin:0;position:relative;overflow:hidden;width:${width}px;height:${height}px;box-sizing:border-box`,
  );

  const body = await cloneElement(context, sourceDocument.body, rootComputed, "div");

  if (body) {
    if (isTransparent(rootComputed.backgroundColor)) {
      body.style.setProperty("background-color", "transparent");
    }
    root.append(body);
  }

  const faces = collectFontFaces(hostWindow, sourceDocument, collectFontFamilies(root));
  const sheet = ownerDocument.createElementNS(xhtmlNamespace, "style");
  const setSheet = (fontRules) => {
    const text = [...fontRules, ...context.pseudoRules].join("\n");

    sheet.textContent = text;
    if (text && !sheet.isConnected) {
      root.prepend(sheet);
    }
  };
  const serializer = new hostWindow.XMLSerializer();
  const result = { background: isTransparent(background) ? null : background, height, width };

  setSheet(faces.map((face) => face.referenceText));
  const referenceMarkup = serializer.serializeToString(root);
  const markupHash = hashMarkup(referenceMarkup);

  if (previousMarkupHash && previousMarkupHash === markupHash) {
    return { ...result, markupHash, unchanged: true };
  }
  if (!faces.some((face) => face.url)) {
    return { ...result, markup: referenceMarkup, markupHash };
  }

  setSheet(await embedFontFaces(context, faces));
  return { ...result, markup: serializer.serializeToString(root), markupHash };
}

function loadImage(hostWindow, url, deadline) {
  return new Promise((resolve, reject) => {
    const image = new hostWindow.Image();
    const timer = hostWindow.setTimeout(
      () => reject(createTimeoutError()),
      Math.max(0, deadline - hostWindow.performance.now()),
    );

    image.onload = () => {
      hostWindow.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      hostWindow.clearTimeout(timer);
      reject(new Error("The snapshot image did not load."));
    };
    image.src = url;
  });
}

function hasVisiblePixels(context2d, width, height) {
  const { data } = context2d.getImageData(0, 0, width, height);

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 0) {
      return true;
    }
  }

  return false;
}

function encode(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Captures a route frame: { ok: true, blob, width, height, markupHash },
// { ok: true, unchanged: true, markupHash } when the markup hashes to
// previousMarkupHash (nothing is drawn or encoded), or { ok: false, reason }.
export async function captureFrameSnapshot(
  iframe,
  { devicePixelRatio = 1, previewHeight, previewWidth, previousMarkupHash, signal } = {},
) {
  const ownerDocument = iframe?.ownerDocument;
  const hostWindow = ownerDocument?.defaultView;

  if (!hostWindow) {
    return { ok: false, reason: "unsupported" };
  }

  const deadline = hostWindow.performance.now() + SNAPSHOT_LIMITS.timeoutMs;

  try {
    if (signal?.aborted) {
      return { ok: false, reason: "aborted" };
    }

    let sourceDocument = null;

    try {
      sourceDocument = iframe.contentDocument;
    } catch {
      return { ok: false, reason: "unsupported" };
    }

    const notReady = getFrameNotReadyReason(sourceDocument);

    if (notReady) {
      return { ok: false, reason: notReady };
    }

    // An iframe without layout (display: none) computes a wrong document.
    if (!iframe.getClientRects().length) {
      return { ok: false, reason: "not-ready" };
    }

    const serialized = await serializeFrameDocument(iframe, { deadline, previewHeight, previewWidth, previousMarkupHash, signal });
    const { markupHash } = serialized;

    if (serialized.unchanged) {
      return { markupHash, ok: true, unchanged: true };
    }

    const { height, width } = serialized;
    const svg =
      `<svg xmlns="${svgNamespace}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<foreignObject x="0" y="0" width="${width}" height="${height}">${serialized.markup}</foreignObject></svg>`;
    // A blob: URL would taint the canvas; a data: URL does not.
    const image = await loadImage(hostWindow, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, deadline);

    if (signal?.aborted) {
      return { ok: false, reason: "aborted" };
    }

    const scale = getSnapshotScale(width, height, devicePixelRatio);
    const canvas = ownerDocument.createElement("canvas");

    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context2d = canvas.getContext("2d");

    if (!context2d) {
      return { ok: false, reason: "unsupported" };
    }

    context2d.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    if (serialized.background) {
      context2d.fillStyle = serialized.background;
      context2d.fillRect(0, 0, width, height);
    }
    context2d.drawImage(image, 0, 0, width, height);

    if (!hasVisiblePixels(context2d, canvas.width, canvas.height)) {
      return { ok: false, reason: "blank" };
    }

    if (hostWindow.performance.now() > deadline) {
      return { ok: false, reason: "timeout" };
    }

    const blob =
      (await encode(canvas, "image/webp", SNAPSHOT_LIMITS.quality)) ?? (await encode(canvas, "image/png"));

    if (!blob) {
      return { ok: false, reason: "error" };
    }

    return { blob, height: canvas.height, markupHash, ok: true, width: canvas.width };
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, reason: "aborted" };
    if (error?.name === "TimeoutError") return { ok: false, reason: "timeout" };
    if (error?.name === "SecurityError") return { ok: false, reason: "unsupported" };
    return { ok: false, reason: "error" };
  }
}
