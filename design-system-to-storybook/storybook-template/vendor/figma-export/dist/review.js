// src/review.ts
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EditIcon,
  FigmaIcon,
  LinkIcon
} from "@storybook/icons";
import { Fragment, createElement as h, useEffect, useRef, useState } from "react";

// src/collapsePreference.ts
var exporterCollapseStorageKey = "sbfx:exporter-collapsed";
var reviewCollapseStorageKey = "sbfx:review-collapsed";
function readCollapsePreference(storageKey) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}
function writeCollapsePreference(storageKey, collapsed) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
  } catch {
  }
}

// src/options.ts
var defaultFigmaExportGlobalName = "figmaExport";
var defaultTokenLayers = {
  comp: "comp",
  ref: "ref",
  sys: "sys"
};
function normalizeTokenPrefix(prefix) {
  if (!prefix) return void 0;
  return prefix.replace(/^--/, "").replace(/-$/, "");
}
function normalizeStoryTitlePrefix(prefix) {
  if (prefix === false) return false;
  if (Array.isArray(prefix)) return prefix;
  if (typeof prefix === "string") return [prefix];
  return false;
}
function resolveFigmaExportAddonOptions(options) {
  return {
    absoluteFidelityComponents: new Set(options?.absoluteFidelityComponents ?? []),
    collections: {
      ...defaultTokenLayers,
      ...options?.collections
    },
    componentClassPrefixes: options?.componentClassPrefixes ?? [],
    embeddedSvgByDataGraphic: options?.embeddedSvgByDataGraphic ?? {},
    globalName: options?.globalName ?? defaultFigmaExportGlobalName,
    ...options?.payloadSyncUrl ? { payloadSyncUrl: options.payloadSyncUrl } : {},
    pluginDataKey: options?.pluginDataKey ?? "storybookCssToken",
    storyTitlePrefix: normalizeStoryTitlePrefix(options?.storyTitlePrefix),
    tokenLayers: {
      ...defaultTokenLayers,
      ...options?.tokenLayers
    },
    tokenPrefix: normalizeTokenPrefix(options?.tokenPrefix)
  };
}
function isStoryIncludedForFigmaExport(title, options) {
  if (!title) return true;
  if (options.storyTitlePrefix === false) return true;
  return options.storyTitlePrefix.some((prefix) => title.startsWith(prefix));
}

// src/color.ts
var colorContext;
var normalizedColorCache = /* @__PURE__ */ new Map();
var parsedColorCache = /* @__PURE__ */ new Map();
var simpleColorPattern = /^(#([0-9a-f]{3}|[0-9a-f]{6})|rgba?\([^()]*\))$/i;
function getColorContext() {
  if (colorContext !== void 0) return colorContext;
  if (typeof document === "undefined") {
    colorContext = null;
    return colorContext;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorContext = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    colorContext = null;
  }
  return colorContext;
}
function roundTripFillStyle(context, value, sentinel) {
  context.fillStyle = sentinel;
  context.fillStyle = value;
  return String(context.fillStyle);
}
function parseFillStyle(value) {
  const context = getColorContext();
  if (!context) return void 0;
  const first = roundTripFillStyle(context, value, "#010203");
  const second = roundTripFillStyle(context, value, "#030201");
  return first === second ? first : void 0;
}
function readPixelRgba(value) {
  const context = getColorContext();
  if (!context) return void 0;
  try {
    context.save();
    context.globalCompositeOperation = "copy";
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    context.restore();
    return {
      a: Math.round(a / 255 * 1e4) / 1e4,
      b: b / 255,
      g: g / 255,
      r: r / 255
    };
  } catch {
    return void 0;
  }
}
function parseHexChannel(hex) {
  return Number.parseInt(hex.length === 1 ? `${hex}${hex}` : hex, 16);
}
function rgbaFromNormalizedString(value) {
  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      return {
        a: digits.length === 4 ? parseHexChannel(digits[3]) / 255 : 1,
        b: parseHexChannel(digits[2]) / 255,
        g: parseHexChannel(digits[1]) / 255,
        r: parseHexChannel(digits[0]) / 255
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        a: digits.length === 8 ? parseHexChannel(digits.slice(6, 8)) / 255 : 1,
        b: parseHexChannel(digits.slice(4, 6)) / 255,
        g: parseHexChannel(digits.slice(2, 4)) / 255,
        r: parseHexChannel(digits.slice(0, 2)) / 255
      };
    }
    return void 0;
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return void 0;
  const parts = rgb[1].split(",").map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) {
    return void 0;
  }
  return {
    a: Number.isFinite(parts[3]) ? Math.min(1, Math.max(0, parts[3])) : 1,
    b: Math.min(1, Math.max(0, parts[2] / 255)),
    g: Math.min(1, Math.max(0, parts[1] / 255)),
    r: Math.min(1, Math.max(0, parts[0] / 255))
  };
}
function serializeRgba(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a >= 1) {
    const toHex = (channel) => channel.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.round(color.a * 1e4) / 1e4})`;
}
function normalizeCssColorString(value) {
  const input = value.trim();
  if (!input) return void 0;
  if (simpleColorPattern.test(input)) return input;
  const cached = normalizedColorCache.get(input);
  if (cached !== void 0 || normalizedColorCache.has(input)) return cached;
  let normalized;
  const parsed = parseFillStyle(input);
  if (parsed !== void 0) {
    if (simpleColorPattern.test(parsed)) {
      normalized = parsed;
    } else {
      const rgba = readPixelRgba(input);
      normalized = rgba ? serializeRgba(rgba) : void 0;
    }
  }
  normalizedColorCache.set(input, normalized);
  return normalized;
}
function parseCssColorToRgba(value) {
  const input = value.trim();
  if (!input) return void 0;
  const cached = parsedColorCache.get(input);
  if (cached !== void 0 || parsedColorCache.has(input)) return cached;
  let parsed;
  const fillStyle = parseFillStyle(input);
  if (fillStyle !== void 0) {
    parsed = rgbaFromNormalizedString(fillStyle) ?? readPixelRgba(input);
  }
  parsedColorCache.set(input, parsed);
  return parsed;
}
function isFullyTransparentColor(value) {
  const match = value.trim().match(/^rgba\([^)]*,\s*(-?\d*\.?\d+)\s*\)$/i);
  return match ? Number(match[1]) === 0 : false;
}

// src/tokenExport.ts
var tokenLayerOrder = {
  comp: 2,
  ref: 0,
  sys: 1
};
var tokenLayers = ["ref", "sys", "comp"];
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function getTokenFamily(name) {
  if (name.includes("-color-")) return "color";
  if (name.includes("-opacity-")) return "opacity";
  if (name.includes("-shadow-")) return "shadow";
  if (name.includes("-typeface-") || name.includes("-typescale-") || name.includes("-weight-") || name.includes("-line-height")) {
    return "type";
  }
  if (name.includes("-spacing-")) return "spacing";
  if (name.includes("-shape-") || name.includes("-radius-")) return "shape";
  if (name.includes("-duration-") || name.includes("-easing-")) return "motion";
  if (name.includes("-size-")) return "size";
  return "other";
}
function normalizeTokenValue(value) {
  return value.trim().replace(/\s+/g, " ");
}
function collectCssCustomProperties() {
  const tokens = /* @__PURE__ */ new Map();
  const targetElements = [document.documentElement, document.body].filter(Boolean);
  function collectFromStyle(style, overwrite) {
    for (const property of Array.from(style)) {
      if (!property.startsWith("--")) continue;
      const value = style.getPropertyValue(property).trim();
      if (!value) continue;
      if (!overwrite && tokens.has(property)) continue;
      tokens.set(property, normalizeTokenValue(value));
    }
  }
  function ruleMatchesTokenTarget(rule) {
    return targetElements.some((element) => {
      try {
        return element.matches(rule.selectorText);
      } catch {
        return false;
      }
    });
  }
  function mediaRuleIsActive(rule) {
    try {
      return window.matchMedia(rule.conditionText).matches;
    } catch {
      return true;
    }
  }
  function collectRuleList(ruleList) {
    for (const rule of Array.from(ruleList)) {
      if (rule instanceof CSSStyleRule) {
        if (ruleMatchesTokenTarget(rule)) {
          collectFromStyle(rule.style, true);
        }
        continue;
      }
      if (rule instanceof CSSImportRule) {
        try {
          if (rule.styleSheet) collectRuleList(rule.styleSheet.cssRules);
        } catch {
        }
        continue;
      }
      if (rule instanceof CSSMediaRule && !mediaRuleIsActive(rule)) {
        continue;
      }
      if ("cssRules" in rule) {
        try {
          collectRuleList(rule.cssRules);
        } catch {
        }
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectRuleList(sheet.cssRules);
    } catch {
    }
  }
  let adoptedSheets = [];
  try {
    adoptedSheets = Array.from(document.adoptedStyleSheets ?? []);
  } catch {
    adoptedSheets = [];
  }
  for (const sheet of adoptedSheets) {
    try {
      collectRuleList(sheet.cssRules);
    } catch {
    }
  }
  collectFromStyle(document.documentElement.style, true);
  if (document.body) collectFromStyle(document.body.style, true);
  collectFromStyle(window.getComputedStyle(document.documentElement), false);
  if (document.body) collectFromStyle(window.getComputedStyle(document.body), false);
  return tokens;
}
function getTokenLayer(name, prefix, layers) {
  for (const layer of tokenLayers) {
    const segment = layers[layer];
    if (name.startsWith(`--${prefix}-${segment}-`)) return layer;
  }
  return void 0;
}
function detectTokenPrefix(tokenNames, options) {
  if (options.tokenPrefix) return options.tokenPrefix;
  const candidates = /* @__PURE__ */ new Map();
  for (const name of tokenNames) {
    for (const layer of tokenLayers) {
      const segment = options.tokenLayers[layer];
      const match = name.match(new RegExp(`^--(.+?)-${escapeRegExp(segment)}-`));
      if (!match) continue;
      const prefix = match[1];
      const candidate = candidates.get(prefix) ?? {
        count: 0,
        layers: /* @__PURE__ */ new Set()
      };
      candidate.count += 1;
      candidate.layers.add(layer);
      candidates.set(prefix, candidate);
    }
  }
  if (candidates.size === 0) return void 0;
  const completeCandidates = Array.from(candidates.entries()).filter(([, candidate]) => tokenLayers.every((layer) => candidate.layers.has(layer))).sort(([, a], [, b]) => b.count - a.count);
  if (completeCandidates.length > 0) return completeCandidates[0][0];
  throw new Error(
    "Unable to detect a ref/sys/comp token prefix. Pass tokenPrefix in the Storybook Figma export addon options."
  );
}
var emptyTokenSystemPrefix = "";
function detectTokenSystem(options) {
  const customProperties = collectCssCustomProperties();
  const prefix = detectTokenPrefix(customProperties.keys(), options);
  if (prefix === void 0) {
    return {
      catalog: [],
      collections: options.collections,
      layers: options.tokenLayers,
      pluginDataKey: options.pluginDataKey,
      prefix: emptyTokenSystemPrefix
    };
  }
  const catalog = [];
  customProperties.forEach((value, name) => {
    const layer = getTokenLayer(name, prefix, options.tokenLayers);
    if (!layer) return;
    catalog.push({
      family: getTokenFamily(name),
      layer,
      name,
      value
    });
  });
  return {
    catalog,
    collections: options.collections,
    layers: options.tokenLayers,
    pluginDataKey: options.pluginDataKey,
    prefix
  };
}
function parseHexColor(value) {
  const normalized = value.trim();
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return void 0;
  const hex = match[1];
  const expanded = hex.length === 3 ? hex.split("").map((part) => `${part}${part}`).join("") : hex;
  const intValue = Number.parseInt(expanded, 16);
  return {
    r: (intValue >> 16 & 255) / 255,
    g: (intValue >> 8 & 255) / 255,
    b: (intValue & 255) / 255,
    a: 1
  };
}
function parseRawValue(value) {
  const trimmed = value.trim();
  const color = parseHexColor(trimmed);
  if (color) {
    return {
      type: "COLOR",
      value: color
    };
  }
  const px = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (px) {
    return {
      type: "FLOAT",
      value: Number(px[1])
    };
  }
  const number = trimmed.match(/^(-?\d+(?:\.\d+)?)$/);
  if (number) {
    return {
      type: "FLOAT",
      value: Number(number[1])
    };
  }
  if (trimmed === "true" || trimmed === "false") {
    return {
      type: "BOOLEAN",
      value: trimmed === "true"
    };
  }
  const cssColor = parseCssColorToRgba(trimmed);
  if (cssColor) {
    return {
      type: "COLOR",
      value: cssColor
    };
  }
  return {
    type: "STRING",
    value: trimmed.replace(/^["']|["']$/g, "")
  };
}
function getFallbackType(token) {
  if (token.family === "color") return "COLOR";
  if (token.family === "size" || token.family === "spacing" || token.family === "shape" || token.family === "opacity" || token.name.includes("-weight-") || token.name.includes("-typescale-")) {
    return "FLOAT";
  }
  return "STRING";
}
function getTokenType(token, tokenByName, tokenSystem, seen = /* @__PURE__ */ new Set()) {
  if (seen.has(token.name)) return getFallbackType(token);
  seen.add(token.name);
  const alias = getAliasTokenName(token, tokenSystem);
  const aliasToken = alias ? tokenByName.get(alias) : void 0;
  if (aliasToken) return getTokenType(aliasToken, tokenByName, tokenSystem, seen);
  return parseRawValue(token.value).type;
}
function getTokenScopes(token, type) {
  if (type === "COLOR") {
    return ["FRAME_FILL", "SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR"];
  }
  if (type === "STRING") {
    if (token.name.includes("-typeface-")) return ["FONT_FAMILY"];
    return ["TEXT_CONTENT"];
  }
  if (type !== "FLOAT") return [];
  if (token.name.includes("-opacity-")) return ["OPACITY"];
  if (token.name.includes("-radius-") || token.name.includes("-shape-")) {
    return ["CORNER_RADIUS"];
  }
  if (token.name.includes("-spacing-")) {
    return ["GAP", "WIDTH_HEIGHT"];
  }
  if (token.name.includes("-weight-")) return ["FONT_WEIGHT"];
  if (token.name.includes("-line-height")) return ["LINE_HEIGHT"];
  if (token.name.includes("-typescale-") && token.name.includes("-size")) {
    return ["FONT_SIZE"];
  }
  if (token.name.includes("-size-")) return ["WIDTH_HEIGHT"];
  return ["WIDTH_HEIGHT"];
}
function extractCssVariableNames(value, tokenSystem) {
  if (!tokenSystem.prefix) return [];
  const layerPattern = tokenLayers.map((layer) => escapeRegExp(tokenSystem.layers[layer])).join("|");
  const variablePattern = new RegExp(
    `var\\(\\s*(--${escapeRegExp(tokenSystem.prefix)}-(?:${layerPattern})-[a-z0-9-]+)`,
    "gi"
  );
  return Array.from(value.matchAll(variablePattern), (match) => match[1]);
}
function getAliasTokenName(token, tokenSystem) {
  return extractCssVariableNames(token.value, tokenSystem)[0];
}
function toFigmaVariableName(cssName) {
  return cssName.replace(/^--/, "").replaceAll("-", "/");
}
function getExportTokenValue(token, parsed) {
  if (token.family !== "opacity" || parsed?.type !== "FLOAT" || typeof parsed.value !== "number") {
    return parsed?.value;
  }
  return parsed.value >= 0 && parsed.value <= 1 ? parsed.value * 100 : parsed.value;
}
function toExportToken(token, tokenByName, tokenSystem) {
  const alias = getAliasTokenName(token, tokenSystem);
  const type = getTokenType(token, tokenByName, tokenSystem);
  const parsed = alias ? void 0 : parseRawValue(token.value);
  return {
    ...alias ? { alias } : { value: getExportTokenValue(token, parsed) },
    collection: token.layer,
    cssName: token.name,
    figmaName: toFigmaVariableName(token.name),
    rawValue: token.value,
    scopes: getTokenScopes(token, type),
    type
  };
}
function collectTokensForExport(cssNames, tokenSystem) {
  const visited = /* @__PURE__ */ new Set();
  const result = [];
  const tokenByName = new Map(
    tokenSystem.catalog.map((token) => [token.name, token])
  );
  function visit(cssName) {
    if (visited.has(cssName)) return;
    visited.add(cssName);
    const token = tokenByName.get(cssName);
    if (!token) return;
    const alias = getAliasTokenName(token, tokenSystem);
    if (alias) visit(alias);
    result.push(toExportToken(token, tokenByName, tokenSystem));
  }
  Array.from(cssNames).sort().forEach(visit);
  return result.sort((a, b) => {
    const byLayer = tokenLayerOrder[a.collection] - tokenLayerOrder[b.collection];
    if (byLayer !== 0) return byLayer;
    return a.figmaName.localeCompare(b.figmaName);
  });
}

// src/domExport.ts
var exportTraversalProgressIntervalMs = 160;
var exportTraversalYieldIntervalMs = 32;
var bindingProperties = {
  backgroundColor: ["background-color", "background"],
  borderColor: ["border-color", "border"],
  borderWidth: ["border-width", "border"],
  cornerRadius: ["border-radius"],
  fontFamily: ["font-family"],
  fontSize: ["font-size"],
  fontWeight: ["font-weight"],
  gap: ["gap", "column-gap", "row-gap"],
  height: ["block-size", "height"],
  lineHeight: ["line-height"],
  opacity: ["opacity"],
  paddingBottom: ["padding-bottom", "padding-block-end", "padding-block", "padding"],
  paddingLeft: ["padding-left", "padding-inline-start", "padding-inline", "padding"],
  paddingRight: ["padding-right", "padding-inline-end", "padding-inline", "padding"],
  paddingTop: ["padding-top", "padding-block-start", "padding-block", "padding"],
  textColor: ["color"],
  width: ["inline-size", "width"]
};
var transparentValues = /* @__PURE__ */ new Set([
  "rgba(0, 0, 0, 0)",
  "rgba(0,0,0,0)",
  "transparent"
]);
var inheritedBindings = /* @__PURE__ */ new Set([
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textColor"
]);
var borderSides = ["top", "right", "bottom", "left"];
function getExportTime() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}
function waitForExportFrame() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      window.requestAnimationFrame(settle);
      globalThis.setTimeout(settle, 120);
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
}
async function markExportNodeVisited(traversalState) {
  traversalState.nodeCount += 1;
  const now = getExportTime();
  if (traversalState.onProgress && (traversalState.nodeCount === 1 || now - traversalState.lastProgressAt >= exportTraversalProgressIntervalMs)) {
    traversalState.lastProgressAt = now;
    traversalState.onProgress({
      nodeCount: traversalState.nodeCount,
      phase: "nodes"
    });
  }
  if (now - traversalState.lastYieldAt >= exportTraversalYieldIntervalMs) {
    await waitForExportFrame();
    traversalState.lastYieldAt = getExportTime();
  }
}
function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
}
function cssLengthToNumber(value) {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : void 0;
}
function cssPercentToNumber(value, basis) {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) / 100 * basis : void 0;
}
function cssPositionToNumber(value, basis) {
  return cssLengthToNumber(value) ?? cssPercentToNumber(value, basis);
}
function cssMatrixTranslationToNumber(transform) {
  const matrix3d = transform.trim().match(/^matrix3d\((.+)\)$/);
  if (matrix3d) {
    const values2 = matrix3d[1].split(",").map((value) => Number(value.trim()));
    if (values2.length === 16 && values2.every(Number.isFinite)) {
      return { x: values2[12], y: values2[13] };
    }
  }
  const matrix = transform.trim().match(/^matrix\((.+)\)$/);
  if (!matrix) return void 0;
  const values = matrix[1].split(",").map((value) => Number(value.trim()));
  if (values.length !== 6 || !values.every(Number.isFinite)) return void 0;
  return { x: values[4], y: values[5] };
}
function cssLineHeightToNumber(value) {
  if (value === "normal") return "normal";
  return cssLengthToNumber(value);
}
function cssColorValue(value) {
  const normalized = value.trim();
  if (!normalized || transparentValues.has(normalized)) return void 0;
  const canonical = normalizeCssColorString(normalized) ?? normalized;
  if (transparentValues.has(canonical) || isFullyTransparentColor(canonical)) {
    return void 0;
  }
  return canonical;
}
function clampUnit(value) {
  return Math.min(1, Math.max(0, value));
}
function splitGradientArguments(value) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
function parseLinearGradientAngle(value) {
  if (!value) return void 0;
  const normalized = value.trim().toLowerCase();
  const degree = normalized.match(/^(-?\d*\.?\d+)deg$/);
  if (degree) return Number(degree[1]);
  if (normalized === "to right") return 90;
  if (normalized === "to bottom") return 180;
  if (normalized === "to left") return 270;
  if (normalized === "to top") return 0;
  return void 0;
}
function parseGradientStop(value, index, total) {
  const colorMatch = value.trim().match(/^(#[0-9a-f]{3,8}|[a-z][a-z-]*\((?:[^()]|\([^()]*\))*\))/i);
  if (!colorMatch) return void 0;
  const color = cssColorValue(colorMatch[1]);
  if (!color) return void 0;
  const positionMatch = value.slice(colorMatch[1].length).match(/(-?\d*\.?\d+)%/);
  const position = positionMatch ? clampUnit(Number(positionMatch[1]) / 100) : total > 1 ? index / (total - 1) : 0;
  return { color, position };
}
function parseLinearGradient(backgroundImage) {
  const match = backgroundImage.trim().match(/^linear-gradient\((.*)\)$/i);
  if (!match) return void 0;
  const parts = splitGradientArguments(match[1]);
  if (parts.length < 2) return void 0;
  const angle = parseLinearGradientAngle(parts[0]);
  const stopParts = angle === void 0 ? parts : parts.slice(1);
  const stops = stopParts.map((part, index) => parseGradientStop(part, index, stopParts.length)).filter((stop) => Boolean(stop));
  return stops.length >= 2 ? { angle: angle ?? 180, stops } : void 0;
}
function parseShadowListToEffects(value) {
  const normalized = value.trim();
  if (!normalized || normalized === "none") return [];
  const effects = [];
  for (const part of splitGradientArguments(normalized)) {
    const inset = /\binset\b/.test(part);
    let rest = part.replace(/\binset\b/g, " ");
    const colorMatch = rest.match(
      /(#[0-9a-f]{3,8}|[a-z][a-z-]*\((?:[^()]|\([^()]*\))*\))/i
    );
    if (!colorMatch) continue;
    rest = rest.replace(colorMatch[1], " ");
    const color = cssColorValue(colorMatch[1]);
    if (!color) continue;
    const lengths = Array.from(
      rest.matchAll(/(-?\d*\.?\d+)px/g),
      (match) => Number(match[1])
    );
    const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = lengths;
    effects.push({
      blur: toFiniteNumber(blur),
      color,
      offsetX: toFiniteNumber(offsetX),
      offsetY: toFiniteNumber(offsetY),
      spread: toFiniteNumber(spread),
      type: inset ? "INNER_SHADOW" : "DROP_SHADOW"
    });
  }
  return effects;
}
function getBoxShadowEffects(computed) {
  return parseShadowListToEffects(computed.boxShadow);
}
function getTextShadowEffects(computed) {
  return parseShadowListToEffects(computed.textShadow);
}
function cssRadiusToNumber(value, width, height) {
  const length = cssLengthToNumber(value);
  if (length !== void 0) return length;
  const percent = value.trim().match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percent) {
    return toFiniteNumber(Number(percent[1]) / 100 * Math.min(width, height));
  }
  return 0;
}
function getRadiusStyles(computed, width, height) {
  const topLeft = cssRadiusToNumber(computed.borderTopLeftRadius, width, height);
  const topRight = cssRadiusToNumber(computed.borderTopRightRadius, width, height);
  const bottomRight = cssRadiusToNumber(
    computed.borderBottomRightRadius,
    width,
    height
  );
  const bottomLeft = cssRadiusToNumber(
    computed.borderBottomLeftRadius,
    width,
    height
  );
  if (topLeft === topRight && topLeft === bottomRight && topLeft === bottomLeft) {
    return topLeft > 0 ? { radius: topLeft } : {};
  }
  return { radiusCorners: { bottomLeft, bottomRight, topLeft, topRight } };
}
function isColorTokenName(token) {
  return token.includes("-color-") || token.endsWith("-color");
}
function findLinearGradientTokens(declarations, tokenSystem) {
  if (!tokenSystem.prefix) return [];
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (!["background", "background-image"].includes(declaration.property)) {
      continue;
    }
    if (!declaration.value.includes("linear-gradient")) continue;
    const tokens = extractCssVariableNames(declaration.value, tokenSystem).filter(
      isColorTokenName
    );
    if (tokens.length >= 2) return tokens;
  }
  return [];
}
function addLinearGradientStopTokens(gradient, declarations, tokenSystem) {
  if (!gradient) return void 0;
  const tokens = findLinearGradientTokens(declarations, tokenSystem);
  if (tokens.length === 0) return gradient;
  return {
    ...gradient,
    stops: gradient.stops.map((stop, index) => ({
      ...stop,
      ...tokens[index] ? { token: tokens[index] } : {}
    }))
  };
}
function cssBorderWidth(computed, side) {
  return cssLengthToNumber(computed.getPropertyValue(`border-${side}-width`)) ?? 0;
}
function cssBorderStyle(computed, side) {
  return computed.getPropertyValue(`border-${side}-style`).trim();
}
function cssBorderColor(computed, side) {
  return computed.getPropertyValue(`border-${side}-color`).trim();
}
function isVisibleBorderSide(computed, side) {
  const width = cssBorderWidth(computed, side);
  const style = cssBorderStyle(computed, side);
  return width > 0 && style !== "none" && style !== "hidden";
}
function getUniformVisibleBorder(computed) {
  const visibleSides = borderSides.filter((side) => isVisibleBorderSide(computed, side));
  if (visibleSides.length !== borderSides.length) return void 0;
  const width = cssBorderWidth(computed, "top");
  const style = cssBorderStyle(computed, "top");
  const color = cssColorValue(cssBorderColor(computed, "top"));
  if (!color) return void 0;
  const isUniform = borderSides.every(
    (side) => cssBorderWidth(computed, side) === width && cssBorderStyle(computed, side) === style && cssBorderColor(computed, side) === cssBorderColor(computed, "top")
  );
  return isUniform ? { color, width } : void 0;
}
function getElementName(element, options) {
  const component = element.getAttribute("data-component");
  const variant = element.getAttribute("data-variant");
  const icon = element.getAttribute("data-icon");
  const classNames = Array.from(element.classList);
  const preferredClassName = options.componentClassPrefixes.length ? classNames.find(
    (name) => options.componentClassPrefixes.some((prefix) => name.startsWith(prefix))
  ) : void 0;
  const className = preferredClassName ?? classNames[0];
  const base = component || icon || className || element.tagName.toLowerCase();
  return variant ? `${base}/${variant}` : base;
}
function toComponentKey(value) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "component";
}
function toComponentLabel(value) {
  return value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").replace(/\b[a-z]/g, (match) => match.toUpperCase());
}
function getComponentReference(element, fallbackName) {
  const sourceName = element.getAttribute("data-component");
  if (!sourceName && !fallbackName) return void 0;
  const variant = element.getAttribute("data-figma-variant") || element.getAttribute("data-variant") || void 0;
  const source = sourceName || fallbackName || "component";
  const name = fallbackName || toComponentLabel(source);
  const baseKey = toComponentKey(source);
  const key = variant ? `${baseKey}--${toComponentKey(variant)}` : baseKey;
  return {
    key,
    name,
    sourceName: source,
    ...variant ? { variant, variantProperties: { Variant: variant } } : {}
  };
}
function getArtifactKind(storyTitle) {
  return storyTitle.startsWith("Pages/") ? "page" : "component";
}
function hasComponentReference(node) {
  return Boolean(node.component) || node.children.some(hasComponentReference);
}
function stripComponentReferences(node) {
  delete node.component;
  node.children.forEach(stripComponentReferences);
}
function isAbsoluteFidelityRoot(element, options) {
  const component = element.getAttribute("data-component");
  return Boolean(component && options.absoluteFidelityComponents.has(component));
}
function isFlexDisplay(display) {
  return display.includes("flex");
}
function isOutOfFlowPositioned(computed) {
  return computed.position === "absolute" || computed.position === "fixed";
}
function isFlexItem(element, computed) {
  if (isOutOfFlowPositioned(computed)) return false;
  const parentElement = element.parentElement;
  if (!parentElement) return false;
  return isFlexDisplay(window.getComputedStyle(parentElement).display);
}
function getLayoutStrategy(element, computed, forceAbsoluteLayout) {
  if (forceAbsoluteLayout) return "absolute";
  return isFlexDisplay(computed.display) || isFlexItem(element, computed) ? "autoLayout" : "absolute";
}
function getExportDisplay(computed, layoutStrategy) {
  if (layoutStrategy === "absolute" && isFlexDisplay(computed.display)) {
    return "block";
  }
  return computed.display;
}
function escapeSvgAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function normalizeSvgStrokeDashValue(value) {
  const normalized = value.trim();
  if (!normalized || normalized === "none") return void 0;
  return normalized.replace(/(-?\d+(?:\.\d+)?)px\b/g, "$1");
}
function serializeInlineSvg(element, width, height) {
  const clone = element.cloneNode(true);
  const originalNodes = [element, ...Array.from(element.querySelectorAll("*"))];
  const clonedNodes = [clone, ...Array.from(clone.querySelectorAll("*"))];
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clonedNodes.forEach((clonedNode, index) => {
    const originalNode = originalNodes[index];
    if (!(originalNode instanceof Element) || !(clonedNode instanceof Element)) return;
    const originalStyle = window.getComputedStyle(originalNode);
    const fill = cssColorValue(originalStyle.fill);
    const stroke = cssColorValue(originalStyle.stroke);
    const strokeWidth = originalStyle.strokeWidth;
    const strokeLinecap = originalStyle.strokeLinecap;
    const strokeLinejoin = originalStyle.strokeLinejoin;
    const strokeDasharray = normalizeSvgStrokeDashValue(
      originalStyle.strokeDasharray
    );
    const strokeDashoffset = normalizeSvgStrokeDashValue(
      originalStyle.strokeDashoffset
    );
    if (fill) clonedNode.setAttribute("fill", fill);
    if (originalStyle.fill === "none") clonedNode.setAttribute("fill", "none");
    if (stroke) clonedNode.setAttribute("stroke", stroke);
    if (strokeWidth && strokeWidth !== "0px") {
      clonedNode.setAttribute("stroke-width", strokeWidth.replace("px", ""));
    }
    if (strokeLinecap) clonedNode.setAttribute("stroke-linecap", strokeLinecap);
    if (strokeLinejoin) clonedNode.setAttribute("stroke-linejoin", strokeLinejoin);
    if (strokeDasharray) clonedNode.setAttribute("stroke-dasharray", strokeDasharray);
    if (strokeDashoffset) clonedNode.setAttribute("stroke-dashoffset", strokeDashoffset);
  });
  return clone.outerHTML;
}
function splitTopLevelComma(value) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
    }
  }
  return [value.trim(), void 0];
}
function resolveCssVarInSvgValue(value, fallbackValue = "#000000") {
  let result = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("var(", cursor);
    if (start === -1) {
      result += value.slice(cursor);
      break;
    }
    result += value.slice(cursor, start);
    let depth = 0;
    let end = start;
    for (; end < value.length; end += 1) {
      const character = value[end];
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (end >= value.length) {
      result += fallbackValue;
      break;
    }
    const content = value.slice(start + 4, end);
    const [propertyName, fallback] = splitTopLevelComma(content);
    const resolved = document.documentElement.style.getPropertyValue(propertyName).trim() || window.getComputedStyle(document.documentElement).getPropertyValue(propertyName).trim() || (document.body ? window.getComputedStyle(document.body).getPropertyValue(propertyName).trim() : "") || fallback || fallbackValue;
    result += resolved.trim();
    cursor = end + 1;
  }
  return result;
}
function sanitizeSvgTextForFigma(svgText) {
  if (!svgText.includes("var(")) return svgText;
  try {
    const documentValue = new DOMParser().parseFromString(svgText, "image/svg+xml");
    if (documentValue.querySelector("parsererror")) {
      return resolveCssVarInSvgValue(svgText);
    }
    documentValue.querySelectorAll("*").forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        if (!attribute.value.includes("var(")) return;
        element.setAttribute(attribute.name, resolveCssVarInSvgValue(attribute.value));
      });
    });
    return new XMLSerializer().serializeToString(documentValue.documentElement);
  } catch {
    return resolveCssVarInSvgValue(svgText);
  }
}
function parsePolygonPoint(value, size) {
  const normalized = value.trim();
  if (normalized.endsWith("%")) {
    return Number(normalized.slice(0, -1)) / 100 * size;
  }
  return Number(normalized.replace("px", ""));
}
function getPolygonPoints(clipPath, width, height) {
  const match = clipPath.trim().match(/^polygon\((.+)\)$/);
  if (!match) return void 0;
  const points = match[1].split(",").map((point) => point.trim().split(/\s+/)).filter((parts) => parts.length >= 2).map(([xValue, yValue]) => {
    const x = toFiniteNumber(parsePolygonPoint(xValue, width));
    const y = toFiniteNumber(parsePolygonPoint(yValue, height));
    return `${x},${y}`;
  });
  return points.length >= 3 ? points.join(" ") : void 0;
}
function createClipPathSvgNode(element, computed, rect, parentRect, rules, tokenSystem, options) {
  if (!computed.clipPath || computed.clipPath === "none") return void 0;
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  const points = getPolygonPoints(computed.clipPath, width, height);
  if (!points) return void 0;
  const fill = cssColorValue(computed.backgroundColor) ?? cssColorValue(computed.color);
  if (!fill) return void 0;
  const transform = computed.transform && computed.transform.startsWith("matrix(-1") ? ` transform="rotate(180 ${width / 2} ${height / 2})"` : "";
  const layoutStrategy = element.getAttribute("data-figma-layout-strategy") === "auto-layout" || isFlexItem(element, computed) ? "autoLayout" : "absolute";
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${escapeSvgAttribute(points)}" fill="${escapeSvgAttribute(fill)}"${transform}/></svg>`;
  return {
    bindings: collectBindings(element, rules, false, tokenSystem),
    children: [],
    kind: "svg",
    layoutStrategy,
    name: getElementName(element, options),
    svgText,
    styles: {
      display: computed.display,
      height,
      opacity: Number(computed.opacity),
      overflow: computed.overflow,
      width,
      x: toFiniteNumber(rect.left - parentRect.left),
      y: toFiniteNumber(rect.top - parentRect.top)
    }
  };
}
function createInlineSvgNode(element, computed, rect, parentRect, options) {
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  const component = getComponentReference(element);
  return {
    bindings: {},
    children: [],
    ...component ? { component } : {},
    kind: "svg",
    layoutStrategy: "absolute",
    name: getElementName(element, options),
    svgText: serializeInlineSvg(element, width, height),
    styles: {
      display: computed.display,
      height,
      opacity: Number(computed.opacity),
      overflow: computed.overflow,
      width,
      x: toFiniteNumber(rect.left - parentRect.left),
      y: toFiniteNumber(rect.top - parentRect.top)
    }
  };
}
function mediaRuleMatches(rule) {
  try {
    return window.matchMedia(rule.conditionText).matches;
  } catch {
    return true;
  }
}
function collectRulesFromStyleSheets(sheets) {
  const rules = [];
  function collect(ruleList) {
    for (const rule of Array.from(ruleList)) {
      if (rule instanceof CSSStyleRule) {
        rules.push(rule);
        continue;
      }
      if (rule instanceof CSSMediaRule && !mediaRuleMatches(rule)) {
        continue;
      }
      if ("cssRules" in rule) {
        try {
          collect(rule.cssRules);
        } catch {
        }
      }
    }
  }
  for (const sheet of sheets) {
    try {
      collect(sheet.cssRules);
    } catch {
    }
  }
  return rules;
}
function getDocumentAdoptedStyleSheets() {
  try {
    return Array.from(document.adoptedStyleSheets ?? []);
  } catch {
    return [];
  }
}
function createCssRuleIndex() {
  return {
    documentRules: collectRulesFromStyleSheets([
      ...Array.from(document.styleSheets),
      ...getDocumentAdoptedStyleSheets()
    ]),
    rulesByShadowRoot: /* @__PURE__ */ new Map()
  };
}
function getRulesForElement(index, element) {
  const root = element.getRootNode();
  if (!(root instanceof ShadowRoot)) return index.documentRules;
  let combined = index.rulesByShadowRoot.get(root);
  if (!combined) {
    let adopted = [];
    try {
      adopted = Array.from(root.adoptedStyleSheets ?? []);
    } catch {
      adopted = [];
    }
    combined = index.documentRules.concat(
      collectRulesFromStyleSheets([...Array.from(root.styleSheets), ...adopted])
    );
    index.rulesByShadowRoot.set(root, combined);
  }
  return combined;
}
function getRenderChildren(element) {
  const shadowRoot = element.shadowRoot;
  const baseChildren = shadowRoot ? Array.from(shadowRoot.children) : Array.from(element.children);
  const expanded = [];
  for (const child of baseChildren) {
    if (child instanceof HTMLSlotElement) {
      const assigned = child.assignedElements({ flatten: true });
      expanded.push(...assigned.length > 0 ? assigned : Array.from(child.children));
      continue;
    }
    expanded.push(child);
  }
  return expanded;
}
function calculateSelectorSpecificity(selector) {
  const withoutPseudoElements = selector.replace(/::[a-z-]+(\([^)]*\))?/gi, " x");
  const ids = withoutPseudoElements.match(/#[\w-]+/g)?.length ?? 0;
  const classLike = withoutPseudoElements.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(\([^)]*\))?/g)?.length ?? 0;
  const typeLike = withoutPseudoElements.match(/(^|[\s>+~(,])[a-z][\w-]*/gi)?.length ?? 0;
  const pseudoElements = selector.match(/::[a-z-]+/gi)?.length ?? 0;
  return ids * 1e6 + classLike * 1e3 + typeLike + pseudoElements;
}
function getMatchedSelectorSpecificity(element, selectorText) {
  let best;
  for (const selector of selectorText.split(",")) {
    const trimmed = selector.trim();
    if (!trimmed || trimmed.includes(":hover") || trimmed.includes(":focus")) {
      continue;
    }
    try {
      if (!element.matches(trimmed)) continue;
    } catch {
      continue;
    }
    const specificity = calculateSelectorSpecificity(trimmed);
    if (best === void 0 || specificity > best) best = specificity;
  }
  return best;
}
function parseCssTextDeclarations(cssText) {
  const declarations = [];
  let current = "";
  let depth = 0;
  const chunks = [];
  for (const character of cssText) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === ";" && depth === 0) {
      chunks.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) chunks.push(current);
  chunks.forEach((chunk) => {
    const separatorIndex = chunk.indexOf(":");
    if (separatorIndex === -1) return;
    const property = chunk.slice(0, separatorIndex).trim();
    const value = chunk.slice(separatorIndex + 1).trim();
    if (!property || !value) return;
    declarations.push({ property, value });
  });
  return declarations;
}
function getMatchedDeclarations(element, rules) {
  const collected = [];
  let order = 0;
  const push = (property, value, specificity) => {
    collected.push({ order: order += 1, property, specificity, value });
  };
  for (const rule of rules) {
    const specificity = getMatchedSelectorSpecificity(element, rule.selectorText);
    if (specificity === void 0) continue;
    for (const property of Array.from(rule.style)) {
      push(property, rule.style.getPropertyValue(property).trim(), specificity);
    }
    for (const declaration of parseCssTextDeclarations(rule.style.cssText)) {
      push(declaration.property, declaration.value, specificity);
    }
  }
  const inlineStyle = element.getAttribute("style");
  if (inlineStyle && element instanceof HTMLElement) {
    for (const declaration of parseCssTextDeclarations(element.style.cssText)) {
      push(declaration.property, declaration.value, Number.MAX_SAFE_INTEGER);
    }
    for (const property of Array.from(element.style)) {
      push(
        property,
        element.style.getPropertyValue(property).trim(),
        Number.MAX_SAFE_INTEGER
      );
    }
  }
  return collected.sort((a, b) => a.specificity - b.specificity || a.order - b.order).map(({ property, value }) => ({ property, value }));
}
function findTokenForProperty(declarations, bindingName, tokenSystem) {
  const properties = bindingProperties[bindingName];
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (!properties.includes(declaration.property)) continue;
    const tokens = extractCssVariableNames(declaration.value, tokenSystem);
    if (tokens.length === 0) return void 0;
    if (declaration.property === "padding") {
      if (bindingName === "paddingTop" || bindingName === "paddingBottom") {
        return tokens[0];
      }
      if (bindingName === "paddingLeft" || bindingName === "paddingRight") {
        return tokens[1] || tokens[0];
      }
    }
    if (declaration.property === "padding-inline") {
      if (bindingName === "paddingLeft" || bindingName === "paddingRight") {
        return tokens[0];
      }
    }
    if (declaration.property === "padding-block") {
      if (bindingName === "paddingTop" || bindingName === "paddingBottom") {
        return tokens[0];
      }
    }
    if (declaration.property === "border") {
      if (bindingName === "borderColor") {
        return tokens.find(isColorTokenName);
      }
      if (bindingName === "borderWidth") {
        return tokens.find((token) => !isColorTokenName(token)) || tokens[0];
      }
    }
    if (bindingName === "backgroundColor" || bindingName === "textColor") {
      return tokens.find(isColorTokenName) || tokens[0];
    }
    return tokens[0];
  }
  return void 0;
}
function pickBindings(bindings, names) {
  const picked = {};
  names.forEach((name) => {
    const token = bindings[name];
    if (token) picked[name] = token;
  });
  return picked;
}
function getTextExportWidth({
  computed,
  text,
  width
}) {
  if (!text.trim()) return width;
  const fontSize = cssLengthToNumber(computed.fontSize) ?? 14;
  const safetyWidth = Math.max(12, fontSize);
  return toFiniteNumber(width + safetyWidth);
}
function getTextExportX({
  computed,
  exportWidth,
  width,
  x
}) {
  const extraWidth = Math.max(0, exportWidth - width);
  const textAlign = computed.textAlign.toLowerCase();
  if (textAlign === "right" || textAlign === "end") {
    return toFiniteNumber(x - extraWidth);
  }
  if (textAlign === "center") return toFiniteNumber(x - extraWidth / 2);
  return x;
}
function justifyContentFromTextAlign(textAlign) {
  const normalized = textAlign.trim().toLowerCase();
  if (normalized === "center") return "center";
  if (normalized === "right" || normalized === "end") return "flex-end";
  return "flex-start";
}
function hasFixedFlexBasis(computed) {
  if (!computed.flexBasis || computed.flexBasis === "auto" || computed.flexBasis === "content") {
    return false;
  }
  return cssLengthToNumber(computed.flexBasis) !== void 0;
}
function isClippedSingleLineText(computed) {
  const overflowX = computed.overflowX.toLowerCase();
  const overflow = computed.overflow.toLowerCase();
  const textOverflow = computed.textOverflow.toLowerCase();
  const whiteSpace = computed.whiteSpace.toLowerCase();
  const clipsInline = overflowX === "hidden" || overflowX === "clip" || overflow === "hidden" || overflow === "clip";
  return clipsInline && textOverflow === "ellipsis" && whiteSpace === "nowrap";
}
function shouldAutoResizeText(element, computed) {
  if (isClippedSingleLineText(computed)) return false;
  if (element.getAttribute("data-figma-text-auto-width") === "true") return true;
  const textAlign = computed.textAlign.toLowerCase();
  if (textAlign === "center" || textAlign === "right" || textAlign === "end") {
    const isSingleLine = computed.whiteSpace.toLowerCase().includes("nowrap");
    if (!isFlexItem(element, computed) || !isSingleLine) return false;
  }
  if (!isFlexItem(element, computed)) return false;
  if (hasFixedFlexBasis(computed)) return false;
  return Number.parseFloat(computed.flexGrow || "0") === 0;
}
function getTextAutoResize(element, computed) {
  return shouldAutoResizeText(element, computed) ? "WIDTH_AND_HEIGHT" : void 0;
}
function getLayoutAlign(element) {
  return element.getAttribute("data-figma-layout-align") === "stretch" ? "STRETCH" : void 0;
}
var verticalSizeProperties = [
  "height",
  "block-size",
  "min-height",
  "min-block-size"
];
var horizontalSizeProperties = [
  "width",
  "inline-size",
  "min-width",
  "min-inline-size"
];
function hasExplicitSizeDeclaration(declarations, properties) {
  return declarations.some(
    (declaration) => properties.includes(declaration.property) && declaration.value.trim().toLowerCase() !== "auto"
  );
}
function isStretchAlignment(value) {
  return value === "stretch" || value === "normal";
}
function getResolvedFlexAlignment(element, computed) {
  const alignSelf = computed.alignSelf;
  if (alignSelf && alignSelf !== "auto") return alignSelf;
  const parentElement = element.parentElement;
  if (!parentElement) return "auto";
  return window.getComputedStyle(parentElement).alignItems || "auto";
}
function getFlexParentCrossAxisInfo(element, computed) {
  if (!isFlexItem(element, computed)) return void 0;
  const parentElement = element.parentElement;
  if (!parentElement) return void 0;
  const parentComputed = window.getComputedStyle(parentElement);
  if (!isFlexDisplay(parentComputed.display)) return void 0;
  return {
    crossAxis: parentComputed.flexDirection.startsWith("column") ? "horizontal" : "vertical",
    stretched: isStretchAlignment(getResolvedFlexAlignment(element, computed))
  };
}
function getInferredFrameLayoutAlign(element, computed, declarations) {
  const crossAxisInfo = getFlexParentCrossAxisInfo(element, computed);
  if (!crossAxisInfo || !crossAxisInfo.stretched) return void 0;
  const crossSizeProperties = crossAxisInfo.crossAxis === "horizontal" ? horizontalSizeProperties : verticalSizeProperties;
  if (hasExplicitSizeDeclaration(declarations, crossSizeProperties)) {
    return void 0;
  }
  return "STRETCH";
}
function getLayoutSizingVertical(element, computed, bindings, declarations) {
  if (bindings.height) return void 0;
  if (hasExplicitSizeDeclaration(declarations, verticalSizeProperties)) {
    return void 0;
  }
  if (element.getAttribute("data-figma-layout-sizing-vertical") === "hug") {
    return "HUG";
  }
  if (!isFlexDisplay(computed.display)) return void 0;
  const crossAxisInfo = getFlexParentCrossAxisInfo(element, computed);
  if (crossAxisInfo?.crossAxis === "vertical" && crossAxisInfo.stretched) {
    return void 0;
  }
  return "HUG";
}
function getLayoutGrow(element, computed) {
  if (element.getAttribute("data-figma-layout-grow") === "1") return 1;
  const flexGrow = Number.parseFloat(computed.flexGrow || "0");
  return Number.isFinite(flexGrow) && flexGrow > 0 ? flexGrow : void 0;
}
function getLayoutSizingHorizontal(element, computed, bindings, declarations) {
  if (bindings.width) return void 0;
  if (hasExplicitSizeDeclaration(declarations, horizontalSizeProperties)) {
    return void 0;
  }
  if (element.getAttribute("data-figma-layout-sizing-horizontal") === "hug") {
    return "HUG";
  }
  if (isFlexItem(element, computed) || computed.display.includes("inline-flex")) {
    if (hasFixedFlexBasis(computed)) return void 0;
    if (Number.parseFloat(computed.flexGrow || "0") > 0) return void 0;
    return "HUG";
  }
  if (isFlexDisplay(computed.display) && isOutOfFlowPositioned(computed)) {
    return "HUG";
  }
  const parentElement = element.parentElement;
  if (parentElement && isFlexDisplay(computed.display) && !isOutOfFlowPositioned(computed)) {
    const parentComputed = window.getComputedStyle(parentElement);
    if (parentComputed.display.includes("grid")) {
      const justifySelf = computed.justifySelf;
      const resolved = justifySelf && justifySelf !== "auto" ? justifySelf : parentComputed.justifyItems;
      if (["start", "center", "end", "flex-start", "flex-end"].includes(resolved)) {
        return "HUG";
      }
    }
  }
  return void 0;
}
function getTextAlignVertical(element) {
  return element.getAttribute("data-figma-text-align-vertical") === "center" ? "CENTER" : void 0;
}
function createTextLeafNode({
  bindings,
  computed,
  height,
  layoutStrategy,
  name,
  outOfFlow,
  text,
  textAutoResize,
  layoutAlign,
  layoutGrow,
  textAlignVertical,
  width,
  x,
  y
}) {
  const color = cssColorValue(computed.color);
  const fontWeight = Number.parseInt(computed.fontWeight, 10);
  const lineHeight = cssLineHeightToNumber(computed.lineHeight);
  const textShadowEffects = getTextShadowEffects(computed);
  const letterSpacing = cssLengthToNumber(computed.letterSpacing);
  const textDecoration = getTextDecoration(computed);
  const italic = isItalicFontStyle(computed);
  const isSingleLineTruncatedText = isClippedSingleLineText(computed);
  const exportWidth = isSingleLineTruncatedText || Boolean(textAutoResize) || layoutGrow === 1 || hasFixedFlexBasis(computed) ? width : getTextExportWidth({ computed, text, width });
  const exportX = getTextExportX({ computed, exportWidth, width, x });
  return {
    bindings: pickBindings(bindings, [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "textColor"
    ]),
    children: [],
    kind: "text",
    layoutStrategy: layoutStrategy ?? (layoutAlign ? "autoLayout" : "absolute"),
    name,
    text,
    styles: {
      ...color ? { color } : {},
      display: computed.display,
      ...textShadowEffects.length > 0 ? { effects: textShadowEffects } : {},
      fontFamily: computed.fontFamily,
      fontSize: cssLengthToNumber(computed.fontSize) ?? 14,
      ...italic ? { fontStyle: "italic" } : {},
      ...Number.isFinite(fontWeight) ? { fontWeight } : {},
      height,
      ...letterSpacing !== void 0 && letterSpacing !== 0 ? { letterSpacing } : {},
      ...textDecoration ? { textDecoration } : {},
      ...layoutAlign ? { layoutAlign } : {},
      ...layoutGrow ? { layoutGrow } : {},
      ...lineHeight ? { lineHeight } : {},
      opacity: Number(computed.opacity),
      ...outOfFlow ? { outOfFlow: true } : {},
      overflow: computed.overflow,
      ...isSingleLineTruncatedText ? { maxLines: 1, textTruncation: "ENDING" } : {},
      textAlign: computed.textAlign,
      ...textAlignVertical ? { textAlignVertical } : {},
      ...textAutoResize ? { textAutoResize } : {},
      width: exportWidth,
      x: exportX,
      y
    }
  };
}
function hasBoxedTextStyle(computed, border) {
  return Boolean(
    cssColorValue(computed.backgroundColor) || border || cssLengthToNumber(computed.borderTopLeftRadius) || cssLengthToNumber(computed.paddingBottom) || cssLengthToNumber(computed.paddingLeft) || cssLengthToNumber(computed.paddingRight) || cssLengthToNumber(computed.paddingTop)
  );
}
function getPseudoMatchedDeclarations(element, rules, pseudo) {
  const declarations = [];
  const pseudoSelector = `::${pseudo}`;
  for (const rule of rules) {
    const matchesPseudoSelector = rule.selectorText.split(",").some((selector) => {
      if (!selector.includes(pseudoSelector)) return false;
      const baseSelector = selector.replace(pseudoSelector, "").trim();
      if (!baseSelector || baseSelector.includes(":hover") || baseSelector.includes(":focus")) {
        return false;
      }
      try {
        return element.matches(baseSelector);
      } catch {
        return false;
      }
    });
    if (!matchesPseudoSelector) continue;
    for (const property of Array.from(rule.style)) {
      declarations.push({
        property,
        value: rule.style.getPropertyValue(property).trim()
      });
    }
    declarations.push(...parseCssTextDeclarations(rule.style.cssText));
  }
  return declarations;
}
function collectPseudoBindings(element, rules, pseudo, tokenSystem) {
  if (!tokenSystem.prefix) return {};
  const declarations = getPseudoMatchedDeclarations(element, rules, pseudo);
  const bindings = {};
  for (const bindingName of ["backgroundColor", "height", "width"]) {
    const token = findTokenForProperty(declarations, bindingName, tokenSystem);
    if (token) bindings[bindingName] = token;
  }
  return bindings;
}
function declarationsIncludeProperty(declarations, properties) {
  return declarations.some(
    (declaration) => properties.includes(declaration.property)
  );
}
function getPseudoConstraints(declarations) {
  const hasTop = declarationsIncludeProperty(declarations, [
    "top",
    "inset-block-start",
    "inset-block",
    "inset"
  ]);
  const hasBottom = declarationsIncludeProperty(declarations, [
    "bottom",
    "inset-block-end",
    "inset-block",
    "inset"
  ]);
  const hasLeft = declarationsIncludeProperty(declarations, [
    "left",
    "inset-inline-start",
    "inset-inline",
    "inset"
  ]);
  const hasRight = declarationsIncludeProperty(declarations, [
    "right",
    "inset-inline-end",
    "inset-inline",
    "inset"
  ]);
  return {
    horizontal: hasLeft && hasRight ? "STRETCH" : hasRight && !hasLeft ? "MAX" : "MIN",
    vertical: hasTop && hasBottom ? "STRETCH" : hasBottom && !hasTop ? "MAX" : "MIN"
  };
}
function createPseudoNode(element, rules, pseudo, parentWidth, parentHeight, tokenSystem, options) {
  const style = window.getComputedStyle(element, `::${pseudo}`);
  const content = style.content.trim();
  const width = cssLengthToNumber(style.width) ?? 0;
  const height = cssLengthToNumber(style.height) ?? 0;
  const backgroundColor = cssColorValue(style.backgroundColor);
  if (content === "none" || content === "normal" || width <= 0 || height <= 0 || !backgroundColor) {
    return void 0;
  }
  const left = cssPositionToNumber(style.left, parentWidth) ?? 0;
  const top = cssPositionToNumber(style.top, parentHeight) ?? 0;
  const transformTranslation = cssMatrixTranslationToNumber(style.transform);
  const fallbackTranslateX = style.transform.includes("translate") ? -width / 2 : 0;
  const fallbackTranslateY = style.transform.includes("translate") ? -height / 2 : 0;
  const translateX = transformTranslation?.x ?? fallbackTranslateX;
  const translateY = transformTranslation?.y ?? fallbackTranslateY;
  return {
    bindings: collectPseudoBindings(element, rules, pseudo, tokenSystem),
    children: [],
    kind: "frame",
    layoutStrategy: "absolute",
    name: `${getElementName(element, options)}::${pseudo}`,
    styles: {
      backgroundColor,
      constraints: getPseudoConstraints(
        getPseudoMatchedDeclarations(element, rules, pseudo)
      ),
      display: style.display,
      height,
      opacity: Number(style.opacity),
      outOfFlow: true,
      overflow: style.overflow,
      width,
      x: toFiniteNumber(left + translateX),
      y: toFiniteNumber(top + translateY)
    }
  };
}
function getBorderLineProperties(side) {
  const logicalProperties = {
    bottom: ["border-block-end", "border-block"],
    left: ["border-inline-start", "border-inline"],
    right: ["border-inline-end", "border-inline"],
    top: ["border-block-start", "border-block"]
  };
  return [
    `border-${side}`,
    `border-${side}-color`,
    `border-${side}-width`,
    ...logicalProperties[side],
    ...logicalProperties[side].map((property) => `${property}-color`),
    ...logicalProperties[side].map((property) => `${property}-width`),
    "border",
    "border-color",
    "border-width"
  ];
}
function findBorderLineToken(declarations, side, target, tokenSystem) {
  const properties = getBorderLineProperties(side);
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (!properties.includes(declaration.property)) continue;
    const tokens = extractCssVariableNames(declaration.value, tokenSystem);
    if (tokens.length === 0) continue;
    if (target === "color") {
      return tokens.find(isColorTokenName) || tokens[0];
    }
    return tokens.find((token) => !isColorTokenName(token)) || tokens[0];
  }
  return void 0;
}
function getVisibleBorderSides(computed) {
  if (getUniformVisibleBorder(computed)) return void 0;
  const sides = {};
  for (const side of borderSides) {
    if (!isVisibleBorderSide(computed, side)) continue;
    const width = cssBorderWidth(computed, side);
    const color = cssColorValue(cssBorderColor(computed, side));
    if (!color || width <= 0) continue;
    sides[side] = { color, width };
  }
  return Object.keys(sides).length > 0 ? sides : void 0;
}
function collectBorderSideBindings(element, rules, sides, tokenSystem) {
  if (!tokenSystem.prefix) return {};
  const declarations = getMatchedDeclarations(element, rules);
  const bindings = {};
  for (const side of borderSides) {
    if (!sides[side]) continue;
    if (!bindings.borderColor) {
      const colorToken = findBorderLineToken(declarations, side, "color", tokenSystem);
      if (colorToken) bindings.borderColor = colorToken;
    }
    if (!bindings.borderWidth) {
      const widthToken = findBorderLineToken(declarations, side, "width", tokenSystem);
      if (widthToken) bindings.borderWidth = widthToken;
    }
  }
  return bindings;
}
function collectBindings(element, rules, hasUniformVisibleBorder, tokenSystem) {
  if (!tokenSystem.prefix) return {};
  const declarations = getMatchedDeclarations(element, rules);
  const bindings = {};
  Object.keys(bindingProperties).forEach((bindingName) => {
    if (!hasUniformVisibleBorder && (bindingName === "borderColor" || bindingName === "borderWidth")) {
      return;
    }
    let token = findTokenForProperty(declarations, bindingName, tokenSystem);
    let ancestor = element.parentElement;
    while (!token && inheritedBindings.has(bindingName) && ancestor) {
      token = findTokenForProperty(
        getMatchedDeclarations(ancestor, rules),
        bindingName,
        tokenSystem
      );
      ancestor = ancestor.parentElement;
    }
    if (token) bindings[bindingName] = token;
  });
  return bindings;
}
function getDirectText(element) {
  return Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "").join("").replace(/\s+/g, " ").trim();
}
function getRenderedLeafText(element) {
  if (element instanceof HTMLElement) {
    const rendered = element.innerText.trim();
    if (rendered) return rendered;
  }
  return getDirectText(element);
}
function applyTextTransformToText(text, computed) {
  const transform = computed.textTransform.trim().toLowerCase();
  if (transform.includes("uppercase")) return text.toUpperCase();
  if (transform.includes("lowercase")) return text.toLowerCase();
  if (transform.includes("capitalize")) {
    return text.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
  }
  return text;
}
function getTextDecoration(computed) {
  const line = (computed.textDecorationLine || "").toLowerCase();
  if (line.includes("line-through")) return "STRIKETHROUGH";
  if (line.includes("underline")) return "UNDERLINE";
  return void 0;
}
function isItalicFontStyle(computed) {
  const fontStyle = computed.fontStyle.trim().toLowerCase();
  return fontStyle.startsWith("italic") || fontStyle.startsWith("oblique");
}
function hasElementChildren(element) {
  return Array.from(element.children).some((child) => {
    if (child.tagName === "BR") return false;
    const style = window.getComputedStyle(child);
    return style.display !== "none";
  });
}
function hasOutOfFlowPositionedChildren(elements) {
  return elements.some((child) => {
    const position = window.getComputedStyle(child).position;
    return position === "absolute" || position === "fixed";
  });
}
function getCommonAncestor(elements, boundary) {
  if (elements.length === 0) return boundary;
  let ancestor = elements[0];
  while (ancestor && ancestor !== boundary) {
    if (elements.every((element) => ancestor?.contains(element))) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return boundary;
}
function findExportRoot(scope) {
  const components = Array.from(scope.querySelectorAll("[data-component]"));
  if (components.length === 1) return components[0];
  if (components.length > 1) {
    const ancestor = getCommonAncestor(components, scope);
    if (ancestor !== scope) return ancestor;
  }
  return scope.firstElementChild ?? void 0;
}
var rasterImageMaxDimension = 2048;
function getImageScaleMode(computed) {
  const objectFit = (computed.objectFit || "").trim().toLowerCase();
  if (objectFit === "contain" || objectFit === "none" || objectFit === "scale-down") {
    return "FIT";
  }
  return "FILL";
}
function dataUrlToRasterCapture(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return void 0;
  return { imageBase64: match[2], imageMimeType: match[1] };
}
function drawSourceToRasterCapture(source, naturalWidth, naturalHeight) {
  if (naturalWidth <= 0 || naturalHeight <= 0) return void 0;
  const scale = Math.min(
    1,
    rasterImageMaxDimension / Math.max(naturalWidth, naturalHeight)
  );
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return void 0;
    context.drawImage(source, 0, 0, width, height);
    return dataUrlToRasterCapture(canvas.toDataURL("image/png"));
  } catch {
    return void 0;
  }
}
async function fetchRasterCapture(src) {
  try {
    const response = await fetch(src);
    if (!response.ok) return void 0;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.type === "image/svg+xml") {
      return void 0;
    }
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(blob);
        const capture = drawSourceToRasterCapture(bitmap, bitmap.width, bitmap.height);
        bitmap.close();
        if (capture) return capture;
      } catch {
      }
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return dataUrlToRasterCapture(dataUrl);
  } catch {
    return void 0;
  }
}
async function captureRasterImage(element) {
  const src = element.currentSrc || element.src;
  if (!src || src.startsWith("data:image/svg+xml")) return void 0;
  const drawn = drawSourceToRasterCapture(
    element,
    element.naturalWidth,
    element.naturalHeight
  );
  if (drawn) return drawn;
  return fetchRasterCapture(src);
}
async function fetchSvgText(element, options) {
  const graphicName = element.getAttribute("data-graphic");
  if (element.getAttribute("data-component") === "graphic" && graphicName) {
    const svgText = options.embeddedSvgByDataGraphic[graphicName];
    return svgText ? sanitizeSvgTextForFigma(svgText) : void 0;
  }
  const src = element.currentSrc || element.src;
  if (!src) return void 0;
  if (src.startsWith("data:image/svg+xml")) {
    const [, encodedSvg = ""] = src.split(",", 2);
    return sanitizeSvgTextForFigma(decodeURIComponent(encodedSvg));
  }
  try {
    const response = await fetch(src);
    if (!response.ok) return void 0;
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("svg") || text.trimStart().startsWith("<svg")) {
      return sanitizeSvgTextForFigma(text);
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function isUniformSpacing(values) {
  if (values.length === 0) return true;
  return Math.max(...values) - Math.min(...values) <= 1;
}
function averageSpacing(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function measureAutoLayoutChildren({
  childEntries,
  computed,
  containerRect
}) {
  const flowEntries = childEntries.filter((entry) => !entry.node.styles.outOfFlow);
  const outOfFlowNodes = childEntries.filter((entry) => entry.node.styles.outOfFlow).map((entry) => entry.node);
  if (flowEntries.length === 0) return void 0;
  const isColumn = computed.flexDirection.startsWith("column");
  const measured = flowEntries.map(({ element, node }) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left - containerRect.left;
    const y = rect.top - containerRect.top;
    return {
      crossEnd: isColumn ? x + rect.width : y + rect.height,
      crossStart: isColumn ? x : y,
      mainEnd: isColumn ? y + rect.height : x + rect.width,
      mainStart: isColumn ? y : x,
      node
    };
  });
  const sortedByCross = [...measured].sort(
    (a, b) => a.crossStart - b.crossStart || a.mainStart - b.mainStart
  );
  const lines = [];
  for (const item of sortedByCross) {
    const line = lines[lines.length - 1];
    const lineEnd = line ? Math.max(...line.map((entry) => entry.crossEnd)) : Number.NEGATIVE_INFINITY;
    if (!line || item.crossStart >= lineEnd - 0.5) {
      lines.push([item]);
    } else {
      line.push(item);
    }
  }
  lines.forEach((line) => line.sort((a, b) => a.mainStart - b.mainStart));
  const mainGaps = [];
  for (const line of lines) {
    for (let index = 0; index < line.length - 1; index += 1) {
      mainGaps.push(line[index + 1].mainStart - line[index].mainEnd);
    }
  }
  const crossGaps = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const currentEnd = Math.max(...lines[index].map((entry) => entry.crossEnd));
    const nextStart = Math.min(...lines[index + 1].map((entry) => entry.crossStart));
    crossGaps.push(nextStart - currentEnd);
  }
  const justify = computed.justifyContent.trim();
  const isSpaceBetween = justify === "space-between";
  const hasOverlap = mainGaps.some((value) => value < -0.5) || crossGaps.some((value) => value < -0.5);
  if (hasOverlap || !isUniformSpacing(crossGaps) || !isUniformSpacing(mainGaps) && !isSpaceBetween) {
    return {
      children: childEntries.map((entry) => entry.node),
      strategy: "absolute"
    };
  }
  const wrapDeclared = computed.flexWrap === "wrap" || computed.flexWrap === "wrap-reverse";
  const measurement = {
    children: [
      ...lines.flatMap((line) => line.map((entry) => entry.node)),
      ...outOfFlowNodes
    ],
    strategy: "autoLayout"
  };
  if (mainGaps.length > 0 && !isSpaceBetween) {
    measurement.gap = Math.max(0, toFiniteNumber(averageSpacing(mainGaps)));
  }
  if (wrapDeclared && lines.length > 1) {
    measurement.layoutWrap = "WRAP";
    if (crossGaps.length > 0) {
      measurement.counterAxisSpacing = Math.max(
        0,
        toFiniteNumber(averageSpacing(crossGaps))
      );
    }
  }
  const isStartJustified = justify === "" || ["flex-start", "left", "normal", "start"].includes(justify);
  if (isStartJustified) {
    const leading = Math.min(...measured.map((entry) => entry.mainStart));
    const containerMainSize = isColumn ? containerRect.height : containerRect.width;
    const trailing = containerMainSize - Math.max(...measured.map((entry) => entry.mainEnd));
    const leadingPadding = Math.max(0, toFiniteNumber(leading));
    const trailingPadding = Math.max(0, toFiniteNumber(trailing));
    measurement.paddingOverrides = isColumn ? { bottom: trailingPadding, top: leadingPadding } : { left: leadingPadding, right: trailingPadding };
  }
  return measurement;
}
async function createExportNode(element, rootRect, parentRect, ruleIndex, tokenSystem, options, traversalState, forceAbsoluteLayout = false) {
  await markExportNodeVisited(traversalState);
  const computed = window.getComputedStyle(element);
  if (computed.display === "none" || computed.visibility === "hidden" || Number(computed.opacity) === 0) {
    return void 0;
  }
  const rect = element.getBoundingClientRect();
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  if (width <= 0 || height <= 0) return void 0;
  const rules = getRulesForElement(ruleIndex, element);
  const forceAutoLayout = element.getAttribute("data-figma-layout-strategy") === "auto-layout";
  const nextForceAbsoluteLayout = !forceAutoLayout && (forceAbsoluteLayout || isAbsoluteFidelityRoot(element, options));
  const component = getComponentReference(element);
  if (element instanceof SVGElement) {
    return createInlineSvgNode(element, computed, rect, parentRect, options);
  }
  const clipPathNode = createClipPathSvgNode(
    element,
    computed,
    rect,
    parentRect,
    rules,
    tokenSystem,
    options
  );
  if (clipPathNode) return clipPathNode;
  const childElements = getRenderChildren(element);
  const hasPositionedChildren = hasOutOfFlowPositionedChildren(childElements);
  const childNodeResults = await Promise.all(
    childElements.map(
      (child) => createExportNode(
        child,
        rootRect,
        rect,
        ruleIndex,
        tokenSystem,
        options,
        traversalState,
        nextForceAbsoluteLayout && !child.hasAttribute("data-component")
      )
    )
  );
  const childEntries = [];
  childElements.forEach((childElement, index) => {
    const node = childNodeResults[index];
    if (node) childEntries.push({ element: childElement, node });
  });
  const childNodes = childEntries.map((entry) => entry.node);
  const directText = getDirectText(element);
  const backgroundColor = cssColorValue(computed.backgroundColor);
  const declarations = getMatchedDeclarations(element, rules);
  const backgroundLinearGradient = addLinearGradientStopTokens(
    parseLinearGradient(computed.backgroundImage),
    declarations,
    tokenSystem
  );
  const color = cssColorValue(computed.color);
  const border = getUniformVisibleBorder(computed);
  const borderSideMap = getVisibleBorderSides(computed);
  const fontWeight = Number.parseInt(computed.fontWeight, 10);
  const radiusStyles = getRadiusStyles(computed, width, height);
  const boxShadowEffects = getBoxShadowEffects(computed);
  const lineHeight = cssLineHeightToNumber(computed.lineHeight);
  const gap = cssLengthToNumber(computed.columnGap) ?? cssLengthToNumber(computed.gap);
  const layoutAlign = getLayoutAlign(element);
  const layoutGrow = getLayoutGrow(element, computed);
  const textLayoutStrategy = element.getAttribute("data-figma-layout-strategy") === "auto-layout" ? "autoLayout" : getLayoutStrategy(element, computed, nextForceAbsoluteLayout);
  const textAlignVertical = getTextAlignVertical(element);
  const bindings = collectBindings(element, rules, Boolean(border), tokenSystem);
  if (borderSideMap) {
    Object.assign(
      bindings,
      collectBorderSideBindings(element, rules, borderSideMap, tokenSystem)
    );
  }
  const layoutSizingHorizontal = getLayoutSizingHorizontal(
    element,
    computed,
    bindings,
    declarations
  );
  const layoutSizingVertical = getLayoutSizingVertical(
    element,
    computed,
    bindings,
    declarations
  );
  const frameLayoutAlign = layoutAlign ?? getInferredFrameLayoutAlign(element, computed, declarations);
  if (backgroundLinearGradient) {
    delete bindings.backgroundColor;
  }
  const layoutStrategy = getLayoutStrategy(element, computed, nextForceAbsoluteLayout);
  const pseudoNodes = ["before", "after"].map(
    (pseudo) => createPseudoNode(element, rules, pseudo, width, height, tokenSystem, options)
  ).filter((node) => Boolean(node));
  const shouldPreserveComputedAutoLayout = layoutStrategy === "autoLayout" && isFlexDisplay(computed.display) && !hasPositionedChildren;
  const frameLayoutStrategy = element.getAttribute("data-figma-layout-strategy") === "auto-layout" ? layoutStrategy : shouldPreserveComputedAutoLayout ? layoutStrategy : pseudoNodes.length > 0 || hasPositionedChildren ? "absolute" : layoutStrategy;
  const elementOutOfFlow = isOutOfFlowPositioned(computed);
  if (directText && !hasElementChildren(element) && !element.shadowRoot) {
    const leafText = applyTextTransformToText(getRenderedLeafText(element), computed);
    if (hasBoxedTextStyle(computed, border)) {
      const paddingLeft = cssLengthToNumber(computed.paddingLeft) ?? 0;
      const paddingRight = cssLengthToNumber(computed.paddingRight) ?? 0;
      const paddingTop = cssLengthToNumber(computed.paddingTop) ?? 0;
      const paddingBottom = cssLengthToNumber(computed.paddingBottom) ?? 0;
      const textNode = createTextLeafNode({
        bindings,
        computed,
        height: Math.max(1, height - paddingTop - paddingBottom),
        layoutStrategy: textLayoutStrategy,
        name: `${getElementName(element, options)}__text`,
        text: leafText,
        textAutoResize: getTextAutoResize(element, computed),
        layoutAlign,
        layoutGrow,
        textAlignVertical,
        width: Math.max(1, width - paddingLeft - paddingRight),
        x: paddingLeft,
        y: paddingTop
      });
      if (textLayoutStrategy === "autoLayout") {
        return {
          bindings,
          children: [textNode],
          ...component ? { component } : {},
          kind: "frame",
          layoutStrategy: "autoLayout",
          name: getElementName(element, options),
          styles: {
            alignItems: "center",
            ...backgroundColor ? { backgroundColor } : {},
            ...backgroundLinearGradient ? { backgroundLinearGradient } : {},
            ...boxShadowEffects.length > 0 ? { effects: boxShadowEffects } : {},
            ...border ? { borderColor: border.color, borderWidth: border.width } : {},
            ...borderSideMap ? { borderSides: borderSideMap } : {},
            display: "flex",
            flexDirection: "row",
            height,
            justifyContent: justifyContentFromTextAlign(computed.textAlign),
            opacity: Number(computed.opacity),
            ...elementOutOfFlow ? { outOfFlow: true } : {},
            overflow: computed.overflow,
            paddingBottom,
            paddingLeft,
            paddingRight,
            paddingTop,
            ...radiusStyles,
            ...layoutSizingHorizontal ? { layoutSizingHorizontal } : {},
            ...layoutSizingHorizontal && !bindings.height ? { layoutSizingVertical: "HUG" } : {},
            width,
            x: toFiniteNumber(rect.left - parentRect.left),
            y: toFiniteNumber(rect.top - parentRect.top)
          }
        };
      }
      return {
        bindings,
        children: [textNode],
        ...component ? { component } : {},
        kind: "frame",
        layoutStrategy: "absolute",
        name: getElementName(element, options),
        styles: {
          ...backgroundColor ? { backgroundColor } : {},
          ...backgroundLinearGradient ? { backgroundLinearGradient } : {},
          ...boxShadowEffects.length > 0 ? { effects: boxShadowEffects } : {},
          ...border ? { borderColor: border.color, borderWidth: border.width } : {},
          ...borderSideMap ? { borderSides: borderSideMap } : {},
          display: getExportDisplay(computed, "absolute"),
          height,
          opacity: Number(computed.opacity),
          ...elementOutOfFlow ? { outOfFlow: true } : {},
          overflow: computed.overflow,
          paddingBottom,
          paddingLeft,
          paddingRight,
          paddingTop,
          ...radiusStyles,
          ...layoutSizingHorizontal ? { layoutSizingHorizontal } : {},
          width,
          x: toFiniteNumber(rect.left - parentRect.left),
          y: toFiniteNumber(rect.top - parentRect.top)
        }
      };
    }
    return createTextLeafNode({
      bindings,
      computed,
      height,
      layoutStrategy: textLayoutStrategy,
      name: getElementName(element, options),
      outOfFlow: elementOutOfFlow,
      text: leafText,
      textAutoResize: getTextAutoResize(element, computed),
      layoutAlign,
      layoutGrow,
      textAlignVertical,
      width,
      x: toFiniteNumber(rect.left - parentRect.left),
      y: toFiniteNumber(rect.top - parentRect.top)
    });
  }
  const kind = element instanceof HTMLImageElement || element instanceof HTMLCanvasElement ? "image" : "frame";
  let imageSvgText;
  let imageCapture;
  if (element instanceof HTMLImageElement) {
    imageSvgText = await fetchSvgText(element, options);
    if (!imageSvgText) imageCapture = await captureRasterImage(element);
  } else if (element instanceof HTMLCanvasElement) {
    imageCapture = drawSourceToRasterCapture(element, element.width, element.height);
  }
  const elementName = getElementName(element, options);
  const autoLayoutMeasurement = kind === "frame" && frameLayoutStrategy === "autoLayout" && isFlexDisplay(computed.display) && childEntries.length > 0 ? measureAutoLayoutChildren({ childEntries, computed, containerRect: rect }) : void 0;
  const effectiveLayoutStrategy = autoLayoutMeasurement?.strategy ?? frameLayoutStrategy;
  const orderedChildNodes = autoLayoutMeasurement?.children ?? childNodes;
  const paddingOverrides = effectiveLayoutStrategy === "autoLayout" ? autoLayoutMeasurement?.paddingOverrides : void 0;
  const measuredGap = effectiveLayoutStrategy === "autoLayout" ? autoLayoutMeasurement?.gap : void 0;
  const effectiveGap = measuredGap ?? gap;
  const frameStyles = {
    ...computed.alignItems ? { alignItems: computed.alignItems } : {},
    ...backgroundColor ? { backgroundColor } : {},
    ...backgroundLinearGradient ? { backgroundLinearGradient } : {},
    ...boxShadowEffects.length > 0 ? { effects: boxShadowEffects } : {},
    ...border ? { borderColor: border.color, borderWidth: border.width } : {},
    ...borderSideMap ? { borderSides: borderSideMap } : {},
    ...color ? { color } : {},
    ...effectiveLayoutStrategy === "autoLayout" && autoLayoutMeasurement?.counterAxisSpacing !== void 0 ? { counterAxisSpacing: autoLayoutMeasurement.counterAxisSpacing } : {},
    display: getExportDisplay(computed, effectiveLayoutStrategy),
    ...effectiveLayoutStrategy === "autoLayout" ? { flexDirection: computed.flexDirection.replace("-reverse", "") } : {},
    fontFamily: computed.fontFamily,
    fontSize: cssLengthToNumber(computed.fontSize) ?? 14,
    ...Number.isFinite(fontWeight) ? { fontWeight } : {},
    ...effectiveGap !== void 0 && effectiveGap >= 0 ? { gap: effectiveGap } : {},
    height,
    ...computed.justifyContent ? { justifyContent: computed.justifyContent } : {},
    ...frameLayoutAlign ? { layoutAlign: frameLayoutAlign } : {},
    ...layoutGrow ? { layoutGrow } : {},
    ...layoutSizingHorizontal ? { layoutSizingHorizontal } : {},
    ...layoutSizingVertical ? { layoutSizingVertical } : {},
    ...effectiveLayoutStrategy === "autoLayout" && autoLayoutMeasurement?.layoutWrap ? { layoutWrap: autoLayoutMeasurement.layoutWrap } : {},
    ...lineHeight ? { lineHeight } : {},
    opacity: Number(computed.opacity),
    ...elementOutOfFlow ? { outOfFlow: true } : {},
    overflow: computed.overflow,
    paddingBottom: paddingOverrides?.bottom ?? (cssLengthToNumber(computed.paddingBottom) ?? 0),
    paddingLeft: paddingOverrides?.left ?? (cssLengthToNumber(computed.paddingLeft) ?? 0),
    paddingRight: paddingOverrides?.right ?? (cssLengthToNumber(computed.paddingRight) ?? 0),
    paddingTop: paddingOverrides?.top ?? (cssLengthToNumber(computed.paddingTop) ?? 0),
    ...radiusStyles,
    ...textAlignVertical ? { textAlignVertical } : {},
    width,
    x: toFiniteNumber(rect.left - parentRect.left),
    y: toFiniteNumber(rect.top - parentRect.top)
  };
  return {
    bindings,
    children: kind === "image" ? [] : [...orderedChildNodes, ...pseudoNodes],
    ...component ? { component } : {},
    ...imageCapture ? { ...imageCapture } : {},
    kind,
    layoutStrategy: kind === "image" ? "absolute" : effectiveLayoutStrategy,
    name: elementName,
    ...imageSvgText ? { svgText: imageSvgText } : {},
    styles: imageCapture ? { ...frameStyles, imageScaleMode: getImageScaleMode(computed) } : frameStyles
  };
}
async function createFigmaExportPayload({
  componentTitle,
  onProgress,
  options,
  scope,
  storyId,
  storyName,
  storyTitle
}) {
  const root = findExportRoot(scope);
  if (!root) {
    throw new Error("No exportable story root was found.");
  }
  const artifactKind = getArtifactKind(storyTitle);
  onProgress?.({ phase: "preparing" });
  await waitForExportFrame();
  const ruleIndex = createCssRuleIndex();
  const tokenSystem = detectTokenSystem(options);
  const rootRect = root.getBoundingClientRect();
  const traversalState = {
    lastProgressAt: 0,
    lastYieldAt: getExportTime(),
    nodeCount: 0,
    onProgress
  };
  const rootNode = await createExportNode(
    root,
    rootRect,
    rootRect,
    ruleIndex,
    tokenSystem,
    options,
    traversalState
  );
  if (!rootNode) {
    throw new Error("The story root has no visible exportable bounds.");
  }
  rootNode.styles.x = 0;
  rootNode.styles.y = 0;
  if (artifactKind === "page") {
    stripComponentReferences(rootNode);
  }
  const component = artifactKind === "component" ? rootNode.component ?? (!hasComponentReference(rootNode) ? getComponentReference(root, componentTitle) : void 0) : void 0;
  const tokenNames = /* @__PURE__ */ new Set();
  onProgress?.({ nodeCount: traversalState.nodeCount, phase: "tokens" });
  await waitForExportFrame();
  function collectNodeTokens(node) {
    Object.values(node.bindings).forEach((token) => {
      if (token) tokenNames.add(token);
    });
    node.styles.backgroundLinearGradient?.stops.forEach((stop) => {
      if (stop.token) tokenNames.add(stop.token);
    });
    node.children.forEach(collectNodeTokens);
  }
  collectNodeTokens(rootNode);
  return {
    artifactKind,
    ...component ? { component } : {},
    componentTitle,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    root: rootNode,
    storyId,
    storyName,
    storyTitle,
    tokenSystem: {
      collections: tokenSystem.collections,
      layers: tokenSystem.layers,
      pluginDataKey: tokenSystem.pluginDataKey,
      prefix: tokenSystem.prefix
    },
    tokens: collectTokensForExport(tokenNames, tokenSystem),
    version: 2
  };
}

// src/pluginCode.ts
function createFigmaExportJson(payload) {
  return JSON.stringify(payload, null, 2);
}
function createFigmaPluginCode(payload) {
  const serializedPayload = createFigmaExportJson(payload);
  return `// Storybook -> Figma
// Legacy fallback: paste this script into a Figma plugin main context or the plugin console.
// Primary flow: use Storybook "Copy JSON", then paste it into your Storybook Figma importer plugin.
// It upserts ref/sys/comp variables, creates the selected story as Figma layers,
// and binds supported properties to variables without creating duplicates.

const STORYBOOK_FIGMA_EXPORT = ${serializedPayload};

void (async function importStorybookStory(payload) {
  const tokenSystem = payload.tokenSystem || {};
  const componentSystem = payload.componentSystem || {};
  const COLLECTION_NAMES = tokenSystem.collections || {
    ref: "ref",
    sys: "sys",
    comp: "comp",
  };
  const PLUGIN_DATA_TOKEN_KEY =
    tokenSystem.pluginDataKey || "storybookCssToken";
  const PLUGIN_DATA_COMPONENT_KEY =
    componentSystem.pluginDataKey || "storybookComponentKey";

  const BINDABLE_RADIUS_FIELDS = [
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
  ];

  const layerOrder = { ref: 0, sys: 1, comp: 2 };
  const registry = new Map();
  const componentRegistry = new Map();
  let componentDefinitionOffsetY = 0;
  const rawTokenByName = new Map(
    (payload.tokens || []).map((token) => [token.cssName, token]),
  );

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function valueOr(value, fallback) {
    return value === undefined || value === null ? fallback : value;
  }

  function cloneColor(color) {
    const source = color || {};
    return {
      r: clamp(Number(source.r) || 0, 0, 1),
      g: clamp(Number(source.g) || 0, 0, 1),
      b: clamp(Number(source.b) || 0, 0, 1),
      a: clamp(Number(valueOr(source.a, 1)), 0, 1),
    };
  }

  function colorFromCss(cssValue) {
    if (!cssValue) return { r: 0, g: 0, b: 0, a: 1 };
    const hex = String(cssValue).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const expanded = hex[1].length === 3
        ? hex[1].split("").map((part) => part + part).join("")
        : hex[1];
      const intValue = parseInt(expanded, 16);
      return {
        r: ((intValue >> 16) & 255) / 255,
        g: ((intValue >> 8) & 255) / 255,
        b: (intValue & 255) / 255,
        a: 1,
      };
    }

    const rgba = String(cssValue).match(/rgba?\\(([^)]+)\\)/i);
    if (rgba) {
      const parts = rgba[1].split(",").map((part) => Number(part.trim()));
      return {
        r: clamp((parts[0] || 0) / 255, 0, 1),
        g: clamp((parts[1] || 0) / 255, 0, 1),
        b: clamp((parts[2] || 0) / 255, 0, 1),
        a: clamp(valueOr(parts[3], 1), 0, 1),
      };
    }

    return { r: 0, g: 0, b: 0, a: 1 };
  }

  function solidPaint(cssValue, variable) {
    const color = variable && variable.resolvedType === "COLOR" && variable.valuesByMode
      ? { r: 0, g: 0, b: 0 }
      : colorFromCss(cssValue);
    const paint = {
      type: "SOLID",
      color: { r: color.r, g: color.g, b: color.b },
      opacity: valueOr(color.a, 1),
    };

    if (variable && figma.variables && figma.variables.setBoundVariableForPaint) {
      try {
        return figma.variables.setBoundVariableForPaint(paint, "color", variable);
      } catch (_error) {
        return paint;
      }
    }

    return paint;
  }

  async function getCollection(layer) {
    const name = COLLECTION_NAMES[layer] || layer;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const existing = collections.find((collection) => collection.name === name);
    if (existing) return existing;

    const created = figma.variables.createVariableCollection(name);
    if (created.modes[0] && created.modes[0].name !== "Default") {
      created.renameMode(created.modes[0].modeId, "Default");
    }
    return created;
  }

  function getVariablePluginData(variable, key) {
    try {
      return typeof variable.getPluginData === "function" ? variable.getPluginData(key) : "";
    } catch (_error) {
      return "";
    }
  }

  function setVariablePluginData(variable, key, value) {
    try {
      if (typeof variable.setPluginData === "function") {
        variable.setPluginData(key, value);
      }
    } catch (_error) {
      // Older Figma runtimes may not support plugin data on variables.
    }
  }

  function getNodePluginData(node, key) {
    try {
      return typeof node.getPluginData === "function" ? node.getPluginData(key) : "";
    } catch (_error) {
      return "";
    }
  }

  function setNodePluginData(node, key, value) {
    try {
      if (typeof node.setPluginData === "function") {
        node.setPluginData(key, value);
      }
    } catch (_error) {
      // Plugin data is metadata only; continue if unsupported.
    }
  }

  function getComponentDisplayName(component) {
    if (!component) return "";
    if (component.variant) {
      return component.name + ", Variant=" + component.variant;
    }
    return component.name;
  }

  function findLocalComponent(component) {
    if (!component || !component.key) return undefined;
    const cached = componentRegistry.get(component.key);
    if (cached) return cached;

    const nodes = figma.root.findAll((node) => node.type === "COMPONENT");
    const displayName = getComponentDisplayName(component);
    const sourceName = component.sourceName || component.key;
    const found = nodes.find((node) => {
      const nodeKey = getNodePluginData(node, PLUGIN_DATA_COMPONENT_KEY);
      if (nodeKey === component.key) {
        return true;
      }
      if (nodeKey) return false;

      const nodeSource = getNodePluginData(node, "storybookComponentSource");
      const parentSource =
        node.parent && node.parent.type === "COMPONENT_SET"
          ? getNodePluginData(node.parent, "storybookComponentSource")
          : "";
      const knownSource = nodeSource || parentSource;
      if (knownSource && knownSource !== sourceName) return false;

      if (component.variant) return node.name === displayName;
      return node.name === displayName || node.name === component.name;
    });

    if (found) componentRegistry.set(component.key, found);
    return found;
  }

  function tagComponentNode(node, component) {
    if (!component || !component.key) return;
    setNodePluginData(node, PLUGIN_DATA_COMPONENT_KEY, component.key);
    setNodePluginData(node, "storybookComponentName", component.name);
    setNodePluginData(node, "storybookComponentSource", component.sourceName || component.key);
  }

  function getOrCreatePage(name) {
    const normalizedName = String(name || "").trim() || "Components";
    const existing = figma.root.children.find(
      (page) => page.name.toLowerCase() === normalizedName.toLowerCase(),
    );
    if (existing) return existing;

    const page = figma.createPage();
    page.name = normalizedName;
    return page;
  }

  function getComponentsPageName() {
    return componentSystem.componentsPageName || "Components";
  }

  function isComponentsPage(page) {
    return String((page && page.name) || "").toLowerCase() ===
      String(getComponentsPageName()).toLowerCase();
  }

  function getPageArtifactPageName() {
    const title = String(payload.storyTitle || payload.componentTitle || "").trim();
    const normalizedTitle = title.startsWith("Pages/")
      ? title.slice("Pages/".length)
      : title;
    return normalizedTitle.replace(/\\//g, " / ") || "Storybook Pages";
  }

  function getPageArtifactTargetPage() {
    if (!isComponentsPage(figma.currentPage)) return figma.currentPage;
    return getOrCreatePage(getPageArtifactPageName());
  }

  function getComponentDefinitionParentPage() {
    return getOrCreatePage(getComponentsPageName());
  }

  function getNextComponentDefinitionY(page) {
    if (componentDefinitionOffsetY === 0 && page.children.length > 0) {
      componentDefinitionOffsetY = page.children.reduce((maxBottom, child) => {
        const bottom = (child.y || 0) + (child.height || 0);
        return Math.max(maxBottom, bottom);
      }, 0);
      if (componentDefinitionOffsetY > 0) componentDefinitionOffsetY += 24;
    }

    return componentDefinitionOffsetY;
  }

  function parkComponentDefinition(node) {
    const parentPage = getComponentDefinitionParentPage();
    const nextY = getNextComponentDefinitionY(parentPage);
    if (node.parent !== parentPage) parentPage.appendChild(node);
    const rootWidth = (payload.root && payload.root.styles && payload.root.styles.width) || 0;
    node.x = payload.artifactKind === "page" ? 0 : rootWidth + 80;
    node.y = nextY;
    componentDefinitionOffsetY += (node.height || 0) + 24;
  }

  function moveExistingComponentDefinitionToTargetPage(componentNode) {
    if (payload.artifactKind !== "page" || !componentNode) return;

    const parentPage = getComponentDefinitionParentPage();
    const definitionNode = getComponentSetParent(componentNode) || componentNode;
    if (definitionNode.parent === parentPage) return;

    const nextY = getNextComponentDefinitionY(parentPage);
    parentPage.appendChild(definitionNode);
    definitionNode.x = 0;
    definitionNode.y = nextY;
    componentDefinitionOffsetY += (definitionNode.height || 0) + 24;
  }

  function createSvgSceneNode(spec) {
    const svgNode = figma.createNodeFromSvg(spec.svgText || "");
    svgNode.name = spec.name || "svg";
    safeResize(svgNode, spec.styles.width, spec.styles.height);
    svgNode.x = spec.styles.x || 0;
    svgNode.y = spec.styles.y || 0;
    return svgNode;
  }

  function getLinearGradientTransform(angle) {
    const normalized = ((Number(angle) % 360) + 360) % 360;
    if (normalized === 270) return [[-1, 0, 1], [0, 1, 0]];
    if (normalized === 180) return [[0, 1, 0], [-1, 0, 1]];
    if (normalized === 0) return [[0, -1, 1], [1, 0, 0]];
    return [[1, 0, 0], [0, 1, 0]];
  }

  function linearGradientPaint(gradient) {
    return {
      type: "GRADIENT_LINEAR",
      gradientTransform: getLinearGradientTransform(valueOr(gradient && gradient.angle, 90)),
      gradientStops: ((gradient && gradient.stops) || []).map((stop, index, stops) => {
        const variable = registry.get(stop.token);
        const colorStop = {
          position:
            typeof stop.position === "number"
              ? clamp(stop.position, 0, 1)
              : stops.length > 1
                ? index / (stops.length - 1)
                : 0,
          color: cloneColor(colorFromCss(stop.color)),
        };
        if (variable && variable.id) {
          colorStop.boundVariables = {
            color: { type: "VARIABLE_ALIAS", id: variable.id },
          };
        }
        return colorStop;
      }),
    };
  }

  function canCreateComponentDefinition(spec) {
    return spec.kind === "frame" || ((spec.kind === "image" || spec.kind === "svg") && Boolean(spec.svgText));
  }

  function shouldCreateComponentInstance(spec, context) {
    const importContext = context || {};
    return (
      importContext.reuseComponents !== false &&
      importContext.isRoot !== true &&
      spec.component &&
      spec.component.key &&
      canCreateComponentDefinition(spec)
    );
  }

  function collectComponentDefinitionSpecs(spec, componentTitle, output, seen) {
    const specs = output || [];
    const seenKeys = seen || new Set();
    if (!spec) return specs;

    const component = spec.component;
    if (
      component &&
      component.key &&
      component.name === componentTitle &&
      canCreateComponentDefinition(spec) &&
      !seenKeys.has(component.key)
    ) {
      seenKeys.add(component.key);
      specs.push(spec);
      return specs;
    }

    for (const childSpec of spec.children || []) {
      collectComponentDefinitionSpecs(childSpec, componentTitle, specs, seenKeys);
    }
    return specs;
  }

  function collectPageComponentDefinitionSpecs(spec, output, seen, isRoot) {
    const specs = output || [];
    const seenKeys = seen || new Set();
    const isRootNode = isRoot !== false;
    if (!spec) return specs;

    const component = spec.component;
    if (
      !isRootNode &&
      component &&
      component.key &&
      canCreateComponentDefinition(spec) &&
      !seenKeys.has(component.key)
    ) {
      seenKeys.add(component.key);
      specs.push(spec);
    }

    for (const childSpec of spec.children || []) {
      collectPageComponentDefinitionSpecs(childSpec, specs, seenKeys, false);
    }
    return specs;
  }

  function getComponentSetParent(node) {
    return node && node.parent && node.parent.type === "COMPONENT_SET" ? node.parent : undefined;
  }

  async function importComponentVariantSet(specs) {
    const existingComponents = specs
      .map((spec) => ({ spec, component: findLocalComponent(spec.component) }))
      .filter((entry) => Boolean(entry.component));
    const existingSet = existingComponents.map((entry) => getComponentSetParent(entry.component)).find(Boolean);
    if (existingSet) {
      for (const { spec, component } of existingComponents) {
        await updateExistingComponentDefinition(component, spec);
      }
      return existingSet;
    }

    const componentNodes = [];
    for (const spec of specs) {
      componentNodes.push(
        await ensureComponentDefinition(spec, spec.component, {
          reuseComponents: true,
        }),
      );
    }

    if (componentNodes.length > 1 && typeof figma.combineAsVariants === "function") {
      const parentPage = getComponentDefinitionParentPage();
      const componentSet = figma.combineAsVariants(componentNodes, parentPage);
      const nextY = payload.artifactKind === "page" ? getNextComponentDefinitionY(parentPage) : 0;
      componentSet.name = payload.componentTitle;
      componentSet.x = 0;
      componentSet.y = nextY;
      if (payload.artifactKind === "page") {
        componentDefinitionOffsetY = nextY + (componentSet.height || 0) + 24;
      }
      setNodePluginData(componentSet, "storybookComponentName", payload.componentTitle);
      setNodePluginData(
        componentSet,
        "storybookComponentSource",
        (specs[0] && specs[0].component && specs[0].component.sourceName) || payload.componentTitle,
      );
      return componentSet;
    }

    return componentNodes[0];
  }

  async function applyInstanceOverrides(node, spec) {
    if (!node || !spec) return;

    if (spec.kind === "text" && node.type === "TEXT") {
      await loadTextNodeFonts(node);
      const nextText = spec.text || "";
      if (node.characters !== nextText) {
        node.characters = nextText;
      }

      if (spec.styles && spec.styles.textAutoResize && "textAutoResize" in node) {
        try {
          node.textAutoResize = spec.styles.textAutoResize;
        } catch (_error) {
          // Some instance text overrides cannot change auto-resize mode.
        }
      } else {
        safeResize(node, spec.styles && spec.styles.width, spec.styles && spec.styles.height);
      }
      applyTextTruncation(node, spec.styles || {});
      return;
    }

    if (!("children" in node)) return;

    const nodeChildren = Array.from(node.children || []);
    const specChildren = spec.children || [];
    for (let index = 0; index < specChildren.length; index += 1) {
      await applyInstanceOverrides(nodeChildren[index], specChildren[index]);
    }
  }

  async function updateExistingComponentDefinition(node, spec) {
    if (!node || !spec) return;

    if (spec.kind === "text" && node.type === "TEXT") {
      await applyInstanceOverrides(node, spec);
      const styles = spec.styles || {};
      const bindings = spec.bindings || {};
      if (styles.color) {
        node.fills = [solidPaint(styles.color, registry.get(bindings.textColor))];
      }
      safeBind(node, "fontSize", bindings.fontSize);
      safeBind(node, "fontWeight", bindings.fontWeight);
      safeBind(node, "lineHeight", bindings.lineHeight);
      return;
    }

    if ("fills" in node && spec.kind !== "text") {
      const styles = spec.styles || {};
      const bindings = spec.bindings || {};
      safeResize(node, styles.width, styles.height);
      if ("clipsContent" in node) node.clipsContent = styles.overflow === "hidden";
      if ("opacity" in node) node.opacity = valueOr(styles.opacity, 1);
      setFrameFills(node, styles, bindings);
      setStrokes(node, styles, bindings);
      applyRadius(node, styles, bindings);
      applyAutoLayout(node, spec, styles, bindings);
      safeBind(node, "width", bindings.width);
      safeBind(node, "height", bindings.height);
      safeBind(node, "opacity", bindings.opacity);
      if (!styles.borderSides) safeBind(node, "strokeWeight", bindings.borderWidth);
    }

    if (!("children" in node)) return;

    const nodeChildren = Array.from(node.children || []);
    const specChildren = spec.children || [];
    for (let index = 0; index < specChildren.length; index += 1) {
      const childSpec = specChildren[index];
      const childNode = nodeChildren[index];
      await updateExistingComponentDefinition(childNode, childSpec);
      if (childNode) {
        applyAutoLayoutChildSizing(node, childNode, childSpec);
        positionChildNode(node, childNode, childSpec);
      }
    }
  }

  async function findExistingVariable(collection, spec) {
    const variables = await figma.variables.getLocalVariablesAsync();
    return variables.find((variable) => {
      if (variable.variableCollectionId !== collection.id) return false;
      if (getVariablePluginData(variable, PLUGIN_DATA_TOKEN_KEY) === spec.cssName) return true;
      return variable.name === spec.figmaName;
    });
  }

  function isOpacityVariableSpec(spec) {
    return spec.type === "FLOAT" && (
      (Array.isArray(spec.scopes) && spec.scopes.includes("OPACITY")) ||
      String(spec.cssName || "").includes("-opacity-") ||
      String(spec.figmaName || "").includes("/opacity/")
    );
  }

  function getVariableValueForMode(spec) {
    if (!isOpacityVariableSpec(spec)) return spec.value;

    const value = Number(spec.value);
    if (!Number.isFinite(value)) return spec.value;
    return value >= 0 && value <= 1 ? value * 100 : value;
  }

  async function upsertVariable(spec) {
    const collection = await getCollection(spec.collection);
    const modeId = collection.modes[0].modeId;
    let variable = await findExistingVariable(collection, spec);

    if (variable && variable.resolvedType !== spec.type) {
      throw new Error(
        "Variable type mismatch for " + spec.cssName + ": existing " +
          variable.resolvedType + ", export " + spec.type,
      );
    }

    if (!variable) {
      variable = figma.variables.createVariable(spec.figmaName, collection, spec.type);
    }

    if (Array.isArray(spec.scopes)) {
      try {
        variable.scopes = spec.scopes;
      } catch (_error) {
        // Scope support differs by variable type and Figma runtime.
      }
    }

    try {
      variable.setVariableCodeSyntax("WEB", "var(" + spec.cssName + ")");
    } catch (_error) {
      // Code syntax is metadata only; continue if unsupported.
    }

    setVariablePluginData(variable, PLUGIN_DATA_TOKEN_KEY, spec.cssName);

    if (spec.alias) {
      const target = registry.get(spec.alias);
      if (!target) {
        throw new Error("Missing alias target " + spec.alias + " for " + spec.cssName);
      }
      variable.setValueForMode(modeId, { type: "VARIABLE_ALIAS", id: target.id });
    } else if (spec.type === "COLOR") {
      variable.setValueForMode(modeId, cloneColor(spec.value));
    } else {
      variable.setValueForMode(modeId, getVariableValueForMode(spec));
    }

    registry.set(spec.cssName, variable);
    return variable;
  }

  async function upsertVariables(tokens) {
    const sorted = [...tokens].sort((a, b) => {
      const byLayer = valueOr(layerOrder[a.collection], 9) - valueOr(layerOrder[b.collection], 9);
      if (byLayer !== 0) return byLayer;
      return a.figmaName.localeCompare(b.figmaName);
    });

    for (const token of sorted) {
      await upsertVariable(token);
    }
  }

  function safeResize(node, width, height) {
    if (typeof node.resize !== "function") return;
    try {
      node.resize(Math.max(1, width || 1), Math.max(1, height || 1));
    } catch (_error) {
      // Some imported nodes do not allow direct resize.
    }
  }

  function safeBind(node, field, tokenName) {
    const variable = registry.get(tokenName);
    if (!variable || typeof node.setBoundVariable !== "function") return;

    try {
      node.setBoundVariable(field, variable);
    } catch (_error) {
      // Not every node supports every variable binding field.
    }
  }

  function setFrameLayoutMode(node, mode) {
    if (!("layoutMode" in node)) return;

    try {
      node.layoutMode = mode;
    } catch (_error) {
      // Some nodes cannot change layout mode after import.
    }
  }

  function isBorderFallbackNode(spec) {
    return String((spec && spec.name) || "").includes("__border-");
  }

  function isAbsoluteLayoutNodeSpec(spec) {
    return (spec && spec.layoutStrategy) === "absolute" || isBorderFallbackNode(spec);
  }

  function applyNodeConstraints(child, constraints) {
    if (!constraints || !("constraints" in child)) return;

    try {
      child.constraints = constraints;
    } catch (_error) {
      // Some Figma nodes do not support constraints.
    }
  }

  function getAbsoluteChildX(parent, child, childSpec, styles) {
    const name = String((childSpec && childSpec.name) || "");
    if (!name.includes("__border-right")) return styles.x || 0;

    const parentWidth = typeof parent.width === "number" ? parent.width : 0;
    const childWidth = styles.width || child.width || 1;
    return Math.max(0, parentWidth - childWidth);
  }

  function getAbsoluteChildY(parent, child, childSpec, styles) {
    const name = String((childSpec && childSpec.name) || "");
    if (!name.includes("__border-bottom")) return styles.y || 0;

    const parentHeight = typeof parent.height === "number" ? parent.height : 0;
    const childHeight = styles.height || child.height || 1;
    return Math.max(0, parentHeight - childHeight);
  }

  function positionChildNode(parent, child, childSpec) {
    const styles = childSpec.styles || {};
    applyNodeConstraints(child, styles.constraints);

    if (isAbsoluteLayoutNodeSpec(childSpec)) {
      if ("layoutPositioning" in child) {
        try {
          child.layoutPositioning = "ABSOLUTE";
        } catch (_error) {
          // Older Figma nodes may not allow absolute positioning.
        }
      }

      child.x = getAbsoluteChildX(parent, child, childSpec, styles);
      child.y = getAbsoluteChildY(parent, child, childSpec, styles);
      return;
    }

    if ("layoutPositioning" in child) {
      try {
        child.layoutPositioning = "AUTO";
      } catch (_error) {
        // Older Figma nodes may not allow layout positioning changes.
      }
    }

    if (parent.layoutMode === "NONE") {
      child.x = styles.x || 0;
      child.y = styles.y || 0;
    }
  }

  function setFrameFills(node, styles, bindings) {
    const variable = registry.get(bindings.backgroundColor);
    if (styles.backgroundLinearGradient) {
      node.fills = [linearGradientPaint(styles.backgroundLinearGradient)];
    } else if (styles.backgroundColor || variable) {
      node.fills = [solidPaint(styles.backgroundColor, variable)];
    } else {
      node.fills = [];
    }
  }

  function setStrokes(node, styles, bindings) {
    const colorVariable = registry.get(bindings.borderColor);

    if (styles.borderSides) {
      const firstSide = ["top", "right", "bottom", "left"]
        .map((side) => styles.borderSides[side])
        .find(Boolean);
      if (!firstSide) return;

      node.strokes = [solidPaint(firstSide.color, colorVariable)];
      try {
        node.strokeAlign = "INSIDE";
        node.strokeTopWeight = valueOr(styles.borderSides.top && styles.borderSides.top.width, 0);
        node.strokeRightWeight = valueOr(styles.borderSides.right && styles.borderSides.right.width, 0);
        node.strokeBottomWeight = valueOr(styles.borderSides.bottom && styles.borderSides.bottom.width, 0);
        node.strokeLeftWeight = valueOr(styles.borderSides.left && styles.borderSides.left.width, 0);
      } catch (_error) {
        // Per-side stroke weights are unsupported on some node types.
      }
      return;
    }

    const widthVariable = registry.get(bindings.borderWidth);
    if (!styles.borderWidth && !widthVariable) return;
    if (!styles.borderColor && !colorVariable) return;

    node.strokes = [solidPaint(styles.borderColor, colorVariable)];
    if (styles.borderWidth) node.strokeWeight = styles.borderWidth;
  }

  function applyRadius(node, styles, bindings) {
    if ("cornerRadius" in node && styles.radius !== undefined) {
      node.cornerRadius = styles.radius;
    }

    if (bindings.cornerRadius) {
      for (const field of BINDABLE_RADIUS_FIELDS) {
        safeBind(node, field, bindings.cornerRadius);
      }
    }
  }

  function mapAxisAlignment(value) {
    if (value === "center") return "CENTER";
    if (value === "flex-end" || value === "end") return "MAX";
    if (value === "space-between") return "SPACE_BETWEEN";
    return "MIN";
  }

  function mapCounterAlignment(value) {
    if (value === "center") return "CENTER";
    if (value === "flex-end" || value === "end") return "MAX";
    return "MIN";
  }

  function mapTextAlignHorizontal(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "center") return "CENTER";
    if (normalized === "right" || normalized === "end") return "RIGHT";
    if (normalized === "justify") return "JUSTIFIED";
    return "LEFT";
  }

  function applyAutoLayout(node, spec, styles, bindings) {
    if (spec.layoutStrategy !== "autoLayout") {
      setFrameLayoutMode(node, "NONE");
      return;
    }

    if (!String(styles.display || "").includes("flex")) {
      setFrameLayoutMode(node, "NONE");
      return;
    }

    setFrameLayoutMode(
      node,
      String(styles.flexDirection || "").startsWith("column")
        ? "VERTICAL"
        : "HORIZONTAL",
    );
    const isHorizontalLayout = !String(styles.flexDirection || "").startsWith("column");
    const horizontalSizingMode =
      styles.layoutSizingHorizontal === "HUG" ? "AUTO" : "FIXED";
    const verticalSizingMode =
      styles.layoutSizingVertical === "HUG" ? "AUTO" : "FIXED";
    node.primaryAxisSizingMode = isHorizontalLayout
      ? horizontalSizingMode
      : verticalSizingMode;
    node.counterAxisSizingMode = isHorizontalLayout
      ? verticalSizingMode
      : horizontalSizingMode;
    node.primaryAxisAlignItems = mapAxisAlignment(styles.justifyContent);
    node.counterAxisAlignItems = mapCounterAlignment(styles.alignItems);
    node.itemSpacing = valueOr(styles.gap, 0);
    node.paddingLeft = valueOr(styles.paddingLeft, 0);
    node.paddingRight = valueOr(styles.paddingRight, 0);
    node.paddingTop = valueOr(styles.paddingTop, 0);
    node.paddingBottom = valueOr(styles.paddingBottom, 0);

    safeBind(node, "itemSpacing", bindings.gap);
    safeBind(node, "paddingLeft", bindings.paddingLeft);
    safeBind(node, "paddingRight", bindings.paddingRight);
    safeBind(node, "paddingTop", bindings.paddingTop);
    safeBind(node, "paddingBottom", bindings.paddingBottom);
  }

  function applyAutoLayoutChildSizing(parent, child, spec) {
    if (parent.layoutMode === "NONE") return;

    const styles = spec.styles || {};
    const layoutGrow = Number(styles.layoutGrow || 0);
    if (layoutGrow > 0 && "layoutGrow" in child) {
      try {
        child.layoutGrow = 1;
      } catch (_error) {
        // Some Figma nodes do not support fill-container sizing.
      }
    }

    if (styles.layoutAlign !== "STRETCH") return;

    try {
      child.layoutAlign = "STRETCH";
    } catch (_error) {
      // Some Figma nodes do not support auto-layout child sizing.
    }
  }

  const loadedFontKeys = new Set();

  function getFontStyleFromWeight(weight) {
    if (weight >= 700) return "Bold";
    if (weight >= 600) return "Semibold";
    if (weight >= 500) return "Medium";
    return "Regular";
  }

  function getFontStyleCandidates(weight) {
    const preferred = getFontStyleFromWeight(weight);
    const candidates = [preferred];

    if (preferred === "Semibold") candidates.push("SemiBold", "Medium");
    if (preferred === "Bold") candidates.push("Semibold", "SemiBold", "Medium");
    if (preferred === "Medium") candidates.push("Regular");
    if (!candidates.includes("Regular")) candidates.push("Regular");

    return candidates;
  }

  function getFontFamily(fontFamily) {
    const first = String(fontFamily || "Inter").split(",")[0];
    const trimmed = first ? first.trim() : "";
    return trimmed ? trimmed.replace(/^["']|["']$/g, "") : "Inter";
  }

  function normalizeFontName(fontName) {
    if (!fontName || fontName === figma.mixed) return undefined;
    if (typeof fontName === "string") {
      const parts = fontName.trim().split(/\\s+/);
      if (parts.length >= 2) {
        return {
          family: parts.slice(0, -1).join(" "),
          style: parts[parts.length - 1],
        };
      }
      return { family: fontName, style: "Regular" };
    }
    if (fontName.family && fontName.style) return fontName;
    return undefined;
  }

  function resolveTokenValue(tokenName, seen) {
    if (!tokenName) return undefined;

    const visited = seen || new Set();
    if (visited.has(tokenName)) return undefined;
    visited.add(tokenName);

    const token = rawTokenByName.get(tokenName);
    if (!token) return undefined;
    if (token.alias) return resolveTokenValue(token.alias, visited);
    return valueOr(token.value, token.rawValue);
  }

  function getFontFamilyFromToken(tokenName) {
    const value = resolveTokenValue(tokenName);
    if (typeof value !== "string") return undefined;
    return getFontFamily(value);
  }

  async function loadFont(fontName) {
    const normalizedFontName = normalizeFontName(fontName);
    if (!normalizedFontName) return false;

    const key = normalizedFontName.family + "\\n" + normalizedFontName.style;
    if (loadedFontKeys.has(key)) return true;

    await figma.loadFontAsync(normalizedFontName);
    loadedFontKeys.add(key);
    return true;
  }

  async function loadBoundFontFamily(tokenName, fontWeight) {
    const family = getFontFamilyFromToken(tokenName);
    if (!family) return false;

    const styleCandidates = getFontStyleCandidates(fontWeight || 400);
    for (const style of styleCandidates) {
      try {
        await loadFont({ family, style });
        return true;
      } catch (_error) {
        // Try next style before skipping the font-family binding.
      }
    }

    return false;
  }

  async function loadTextFont(styles) {
    const family = getFontFamily(styles.fontFamily);
    const styleCandidates = getFontStyleCandidates(styles.fontWeight || 400);

    for (const style of styleCandidates) {
      const fontName = { family, style };
      try {
        await loadFont(fontName);
        return fontName;
      } catch (_error) {
        // Try the next style for the same family before falling back.
      }
    }

    const fallback = { family: "Inter", style: "Regular" };
    await loadFont(fallback);
    return fallback;
  }

  async function loadTextNodeFonts(node) {
    const fonts = [];

    if (node.fontName && node.fontName !== figma.mixed) {
      fonts.push(node.fontName);
    }

    if (typeof node.getRangeAllFontNames === "function" && node.characters.length > 0) {
      try {
        fonts.push(...node.getRangeAllFontNames(0, node.characters.length));
      } catch (_error) {
        // Some runtimes do not allow range font inspection before insertion.
      }
    }

    for (const fontName of fonts) {
      try {
        await loadFont(fontName);
      } catch (_error) {
        const fallback = { family: "Inter", style: "Regular" };
        await loadFont(fallback);
        node.fontName = fallback;
        return;
      }
    }
  }

  async function loadNodeFonts(node) {
    if (node.type === "TEXT") {
      await loadTextNodeFonts(node);
      return;
    }

    if ("children" in node) {
      for (const child of node.children) {
        await loadNodeFonts(child);
      }
    }
  }

  function applyTextTruncation(node, styles) {
    if (!node || !styles) return;

    if (styles.maxLines !== undefined && "maxLines" in node) {
      try {
        node.maxLines = styles.maxLines;
      } catch (_error) {
        // Some Figma runtimes may not support max line limits.
      }
    }

    if (styles.textTruncation && "textTruncation" in node) {
      try {
        node.textTruncation = styles.textTruncation;
      } catch (_error) {
        // Some Figma runtimes may not support text truncation.
      }
    }
  }

  async function createTextNode(spec) {
    const node = figma.createText();
    const styles = spec.styles;
    const bindings = spec.bindings || {};
    node.name = spec.name;
    node.fontName = await loadTextFont(styles);
    node.characters = spec.text || "";
    node.fontSize = styles.fontSize || 14;
    if ("textAutoResize" in node) {
      try {
        node.textAutoResize = "NONE";
      } catch (_error) {
        // Keep default text sizing if fixed text resize is not supported.
      }
    }
    if (styles.lineHeight && styles.lineHeight !== "normal") {
      node.lineHeight = { unit: "PIXELS", value: styles.lineHeight };
    }
    node.fills = [solidPaint(styles.color, registry.get(bindings.textColor))];
    safeResize(node, styles.width, styles.height);
    applyTextTruncation(node, styles);
    if (styles.textAlign && "textAlignHorizontal" in node) {
      try {
        node.textAlignHorizontal = mapTextAlignHorizontal(styles.textAlign);
      } catch (_error) {
        // Some imported text nodes may not allow text alignment changes.
      }
    }
    if (styles.textAutoResize && "textAutoResize" in node) {
      try {
        node.textAutoResize = styles.textAutoResize;
      } catch (_error) {
        // Some imported text nodes may not allow auto-resize changes.
      }
    }
    if (
      !bindings.fontFamily ||
      (await loadBoundFontFamily(bindings.fontFamily, styles.fontWeight || 400))
    ) {
      safeBind(node, "fontFamily", bindings.fontFamily);
    }
    safeBind(node, "fontSize", bindings.fontSize);
    safeBind(node, "fontWeight", bindings.fontWeight);
    safeBind(node, "lineHeight", bindings.lineHeight);
    await loadTextNodeFonts(node);
    return node;
  }

  async function createImageNode(spec) {
    const wrapper = figma.createFrame();
    wrapper.name = spec.name;
    wrapper.fills = [];
    wrapper.clipsContent = false;
    safeResize(wrapper, spec.styles.width, spec.styles.height);

    if (spec.svgText) {
      try {
        const svgNode = figma.createNodeFromSvg(spec.svgText);
        svgNode.name = spec.name + "/svg";
        safeResize(svgNode, spec.styles.width, spec.styles.height);
        svgNode.x = 0;
        svgNode.y = 0;
        await loadNodeFonts(svgNode);
        wrapper.appendChild(svgNode);
      } catch (_error) {
        // Keep an empty wrapper if SVG import fails.
      }
    }

    return wrapper;
  }

  async function createFrameNode(spec, context, asComponent) {
    const node = asComponent ? figma.createComponent() : figma.createFrame();
    const styles = spec.styles;
    const bindings = spec.bindings || {};
    node.name = spec.name;
    safeResize(node, styles.width, styles.height);
    node.clipsContent = styles.overflow === "hidden";
    node.opacity = valueOr(styles.opacity, 1);
    setFrameFills(node, styles, bindings);
    setStrokes(node, styles, bindings);
    applyRadius(node, styles, bindings);
    applyAutoLayout(node, spec, styles, bindings);
    safeBind(node, "width", bindings.width);
    safeBind(node, "height", bindings.height);
    safeBind(node, "opacity", bindings.opacity);
    if (!styles.borderSides) safeBind(node, "strokeWeight", bindings.borderWidth);

    const childContext = {
      ...(context || {}),
      isRoot: false,
      reuseComponents: !context || context.reuseComponents !== false,
    };
    for (const childSpec of spec.children || []) {
      const child = await createNode(childSpec, childContext);
      await loadNodeFonts(child);
      node.appendChild(child);
      applyAutoLayoutChildSizing(node, child, childSpec);
      positionChildNode(node, child, childSpec);
    }

    if (spec.layoutStrategy === "absolute") {
      setFrameLayoutMode(node, "NONE");
    }

    return node;
  }

  async function ensureComponentDefinition(spec, component, context) {
    const existing = findLocalComponent(component);
    if (existing) {
      if (!context || context.updateExistingComponent !== false) {
        await updateExistingComponentDefinition(existing, spec);
        tagComponentNode(existing, component);
        moveExistingComponentDefinitionToTargetPage(existing);
      }
      return existing;
    }

    const componentNode =
      (spec.kind === "image" || spec.kind === "svg") && spec.svgText
        ? figma.createComponentFromNode(createSvgSceneNode(spec))
        : await createFrameNode(
            spec,
            { ...(context || {}), reuseComponents: true },
            true,
          );
    componentNode.name = getComponentDisplayName(component);
    tagComponentNode(componentNode, component);
    parkComponentDefinition(componentNode);
    componentRegistry.set(component.key, componentNode);
    return componentNode;
  }

  async function createComponentInstance(spec, context) {
    const component = await ensureComponentDefinition(
      spec,
      spec.component,
      { ...(context || {}), updateExistingComponent: false },
    );
    const instance = component.createInstance();
    instance.name = spec.component.name;
    safeResize(instance, spec.styles.width, spec.styles.height);
    instance.x = spec.styles.x || 0;
    instance.y = spec.styles.y || 0;
    await applyInstanceOverrides(instance, spec);
    return instance;
  }

  async function createNode(spec, context) {
    const importContext = context || {};
    if (shouldCreateComponentInstance(spec, importContext)) {
      return createComponentInstance(spec, importContext);
    }

    const node =
      spec.kind === "text"
        ? await createTextNode(spec)
        : spec.kind === "image" || spec.kind === "svg"
          ? await createImageNode(spec)
          : await createFrameNode(spec, importContext, false);

    node.x = spec.styles.x || 0;
    node.y = spec.styles.y || 0;
    return node;
  }

  await upsertVariables(payload.tokens || []);
  const shouldImportAsComponent = payload.artifactKind === "component";
  const rootComponent = payload.component || (payload.root && payload.root.component);
  const componentVariantSpecs =
    shouldImportAsComponent && !rootComponent
      ? collectComponentDefinitionSpecs(payload.root, payload.componentTitle)
      : [];
  const pageComponentSpecs =
    shouldImportAsComponent
      ? collectPageComponentDefinitionSpecs(payload.root)
      : [];
  for (const spec of pageComponentSpecs) {
    await ensureComponentDefinition(spec, spec.component, {
      reuseComponents: true,
    });
  }

  const rootNode =
    shouldImportAsComponent && rootComponent && canCreateComponentDefinition(payload.root)
      ? await ensureComponentDefinition(
          payload.root,
          rootComponent,
          { reuseComponents: true },
        )
      : componentVariantSpecs.length > 1
        ? await importComponentVariantSet(componentVariantSpecs)
      : await createNode(payload.root, {
          isRoot: true,
          reuseComponents: shouldImportAsComponent,
        });

  rootNode.name = shouldImportAsComponent && rootComponent
    ? getComponentDisplayName(rootComponent)
    : componentVariantSpecs.length > 1
      ? payload.componentTitle
    : payload.componentTitle + " / " + payload.storyName;
  rootNode.x = 0;
  rootNode.y = 0;
  await loadNodeFonts(rootNode);
  const targetPage = shouldImportAsComponent
    ? getComponentDefinitionParentPage()
    : getPageArtifactTargetPage();
  if (!rootNode.parent) targetPage.appendChild(rootNode);
  if (figma.currentPage.id !== targetPage.id && typeof figma.setCurrentPageAsync === "function") {
    await figma.setCurrentPageAsync(targetPage);
  }
  figma.viewport.scrollAndZoomIntoView([rootNode]);

  figma.notify(
    "Imported " + (payload.artifactKind || "story") + " " + payload.componentTitle + " with " +
      (payload.tokens || []).length + " variables checked.",
  );
})(STORYBOOK_FIGMA_EXPORT).catch((error) => {
  console.error(error);
  figma.notify("Storybook import failed: " + ((error && error.message) || String(error)));
});
`;
}

// src/version.ts
function getAddonVersion() {
  return true ? "0.3.0" : "dev";
}

// src/overlay.ts
var statusLabels = {
  copied: "Copied",
  copying: "Exporting",
  error: "Failed",
  idle: "Ready"
};
var actionLabels = {
  design: { busy: "", done: "", idle: "" },
  file: { busy: "Preparing", done: "Downloaded", idle: "Download JSON" },
  json: { busy: "Copying", done: "Copied", idle: "Copy JSON" },
  script: { busy: "Copying", done: "Copied", idle: "Plugin Console Script" }
};
var svgIcons = {
  check: '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 7.5 5.5 10.5 11.5 3.5"/></svg>',
  chevronDown: '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3.5 5.5 7 9l3.5-3.5"/></svg>',
  chevronUp: '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3.5 8.5 7 5l3.5 3.5"/></svg>',
  command: '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M5 5h4v4H5zM5 5H3.5A1.5 1.5 0 1 1 5 3.5V5zm4 0h1.5A1.5 1.5 0 1 0 9 3.5V5zM5 9H3.5A1.5 1.5 0 1 0 5 10.5V9zm4 0h1.5A1.5 1.5 0 1 1 9 10.5V9z"/></svg>',
  copy: '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1"/><path d="M9.5 4.5v-1a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1"/></svg>',
  download: '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M7 2v7m0 0L4.5 6.5M7 9l2.5-2.5M2.5 11.5h9"/></svg>',
  figma: '<svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5.5 1.5h3a2 2 0 1 1 0 4 2 2 0 1 1 0 4 2 2 0 1 1-4 0v-2a2 2 0 0 1-1-3.73A2 2 0 0 1 5.5 1.5z" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8.5" cy="7.5" r="1.1"/></svg>',
  close: '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5"/></svg>'
};
function getExportComponentTitle(title, options) {
  if (!title) return "Component";
  if (options.storyTitlePrefix === false) return title;
  const matchingPrefix = options.storyTitlePrefix.find(
    (prefix) => title.startsWith(prefix)
  );
  return matchingPrefix ? title.slice(matchingPrefix.length) : title;
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}
function sanitizeExportFilename(value) {
  return String(value ?? "storybook-figma-export").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "storybook-figma-export";
}
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.download = filename;
  downloadLink.href = downloadUrl;
  downloadLink.style.display = "none";
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
function getExporterTime() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}
function waitForExporterPanelPaint() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(settle);
      });
      globalThis.setTimeout(settle, 120);
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
}
function formatExportDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "0.0s";
  return `${(durationMs / 1e3).toFixed(1)}s`;
}
function getTextSizeLabel(text) {
  const bytes = new Blob([text]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeSvgAttribute2(value) {
  return escapeXml(value).replace(/"/g, "&quot;");
}
function formatSvgNumber(value) {
  const numberValue = Number.isFinite(value) ? Number(value) : 0;
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
}
function svgDataUrl(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}
function getSvgPaint(value, fallback = "none") {
  return value ? escapeSvgAttribute2(value) : fallback;
}
function renderSvgImageNode(node, isRoot) {
  const { height, width, x, y } = node.styles;
  const transform = isRoot ? "" : ` transform="translate(${formatSvgNumber(x)} ${formatSvgNumber(y)})"`;
  if (!node.svgText) {
    return "";
  }
  return `<g${transform}><image href="${escapeSvgAttribute2(svgDataUrl(node.svgText))}" width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" preserveAspectRatio="none"/></g>`;
}
function renderSvgTextNode(node, isRoot) {
  const { color, fontFamily, fontSize, fontWeight, height, textAlign, textAlignVertical, width, x, y } = node.styles;
  const transform = isRoot ? "" : ` transform="translate(${formatSvgNumber(x)} ${formatSvgNumber(y)})"`;
  const resolvedFontSize = fontSize ?? 12;
  const textAnchor = textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start";
  const textX = textAnchor === "middle" ? width / 2 : textAnchor === "end" ? width : 0;
  const isCentered = textAlignVertical === "CENTER";
  const textY = isCentered ? height / 2 : resolvedFontSize;
  const baseline = isCentered ? "middle" : "alphabetic";
  return `<text${transform} x="${formatSvgNumber(textX)}" y="${formatSvgNumber(textY)}" fill="${getSvgPaint(color, "#000000")}" font-family="${escapeSvgAttribute2(fontFamily ?? "sans-serif")}" font-size="${formatSvgNumber(resolvedFontSize)}" font-weight="${escapeSvgAttribute2(String(fontWeight ?? 400))}" text-anchor="${textAnchor}" dominant-baseline="${baseline}">${escapeXml(node.text ?? "")}</text>`;
}
function renderSvgFrameNode(node, isRoot) {
  const {
    backgroundColor,
    borderColor,
    borderWidth,
    height,
    opacity,
    radius,
    width,
    x,
    y
  } = node.styles;
  const transform = isRoot ? "" : ` transform="translate(${formatSvgNumber(x)} ${formatSvgNumber(y)})"`;
  const groupOpacity = typeof opacity === "number" && opacity >= 0 && opacity < 1 ? ` opacity="${formatSvgNumber(opacity)}"` : "";
  const hasRect = Boolean(backgroundColor || borderColor && borderWidth);
  const rect = hasRect ? `<rect width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" rx="${formatSvgNumber(radius)}" fill="${getSvgPaint(backgroundColor)}"${borderColor && borderWidth ? ` stroke="${getSvgPaint(borderColor)}" stroke-width="${formatSvgNumber(borderWidth)}"` : ""}/>` : "";
  const children = node.children.map((child) => renderSvgNode(child)).join("");
  return `<g${transform}${groupOpacity}>${rect}${children}</g>`;
}
function renderSvgNode(node, isRoot = false) {
  if (node.kind === "text") return renderSvgTextNode(node, isRoot);
  if (node.kind === "image" || node.kind === "svg") {
    return renderSvgImageNode(node, isRoot);
  }
  return renderSvgFrameNode(node, isRoot);
}
function createFigmaDesignSvg(payload) {
  const width = Math.max(1, payload.root.styles.width);
  const height = Math.max(1, payload.root.styles.height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" viewBox="0 0 ${formatSvgNumber(width)} ${formatSvgNumber(height)}" role="img" aria-label="${escapeSvgAttribute2(payload.root.name)}">${renderSvgNode(payload.root, true)}</svg>`;
}
async function copySvgDesign(svgText) {
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const plainText = new Blob([svgText], { type: "text/plain" });
    const htmlText = new Blob([svgText], { type: "text/html" });
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/svg+xml": new Blob([svgText], { type: "image/svg+xml" }),
          "text/html": htmlText,
          "text/plain": plainText
        })
      ]);
      return;
    } catch {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlText,
          "text/plain": plainText
        })
      ]);
      return;
    }
  }
  await copyText(svgText);
}
function syncPayloadToBridge(payload, syncUrl) {
  try {
    return fetch(syncUrl, {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST"
    }).then(
      (response) => response.ok ? "synced" : "sync failed",
      () => "sync failed"
    );
  } catch {
    return Promise.resolve("sync failed");
  }
}
function resolveExportScope() {
  const root = document.getElementById("storybook-root");
  if (root) return { scope: root };
  return {
    scope: document.body,
    warning: "storybook-root not found; exported from document.body"
  };
}
var overlayRefs = null;
var overlayState = null;
var overlayCollapsed = null;
function isOverlayCollapsed() {
  if (overlayCollapsed === null) {
    overlayCollapsed = readCollapsePreference(exporterCollapseStorageKey);
  }
  return overlayCollapsed;
}
function setOverlayCollapsed(collapsed) {
  overlayCollapsed = collapsed;
  writeCollapsePreference(exporterCollapseStorageKey, collapsed);
  renderOverlay();
}
function createIconSpan(icon) {
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  span.style.display = "inline-flex";
  span.innerHTML = icon;
  return span;
}
function createActionButton(format, icon, className, ariaLabel) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  if (ariaLabel) {
    button.setAttribute("aria-label", ariaLabel);
    button.title = ariaLabel;
  }
  const iconSpan = createIconSpan(icon);
  button.append(iconSpan);
  let label = null;
  if (actionLabels[format].idle) {
    label = document.createTextNode(actionLabels[format].idle);
    button.append(label);
  }
  button.addEventListener("click", () => {
    void handleCopy(format);
  });
  return { button, iconSpan, label };
}
function buildOverlay() {
  const aside = document.createElement("aside");
  aside.setAttribute("aria-label", "Figma export");
  aside.className = "sbfx-exporter";
  aside.dataset.status = "idle";
  aside.dataset.version = getAddonVersion();
  const header = document.createElement("header");
  header.className = "sbfx-exporter__header";
  const mark = createIconSpan(svgIcons.figma);
  mark.className = "sbfx-exporter__mark";
  const heading = document.createElement("span");
  heading.className = "sbfx-exporter__heading";
  const title = document.createElement("span");
  title.className = "sbfx-exporter__title";
  title.textContent = "Figma export";
  const versionBadge = document.createElement("span");
  versionBadge.className = "sbfx-exporter__version";
  versionBadge.textContent = `v${getAddonVersion()}`;
  versionBadge.title = `Figma export addon v${getAddonVersion()}`;
  title.append(versionBadge);
  const subtitle = document.createElement("span");
  subtitle.className = "sbfx-exporter__subtitle";
  heading.append(title, subtitle);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sbfx-exporter__toggle";
  const toggleIcon = createIconSpan(svgIcons.chevronDown);
  toggle.append(toggleIcon);
  toggle.addEventListener("click", () => {
    setOverlayCollapsed(!isOverlayCollapsed());
  });
  header.append(mark, heading, toggle);
  const info = document.createElement("div");
  info.className = "sbfx-exporter__info";
  const status = document.createElement("span");
  status.className = "sbfx-exporter__status";
  const statusDot = document.createElement("span");
  statusDot.className = "sbfx-exporter__status-dot";
  statusDot.setAttribute("aria-hidden", "true");
  const statusLabel = document.createTextNode(statusLabels.idle);
  status.append(statusDot, statusLabel);
  const summary = document.createElement("p");
  summary.className = "sbfx-exporter__summary";
  summary.style.display = "none";
  info.append(status, summary);
  const actions = document.createElement("div");
  actions.className = "sbfx-exporter__actions";
  const json = createActionButton("json", svgIcons.copy, "sbfx-exporter__button");
  const file = createActionButton("file", svgIcons.download, "sbfx-exporter__button");
  const script = createActionButton(
    "script",
    svgIcons.command,
    "sbfx-exporter__button sbfx-exporter__button--secondary"
  );
  const design = createActionButton(
    "design",
    svgIcons.figma,
    "sbfx-exporter__button sbfx-exporter__button--secondary sbfx-exporter__button--icon",
    "Copy design to Figma"
  );
  actions.append(json.button, file.button, script.button, design.button);
  aside.append(header, info, actions);
  return {
    aside,
    buttons: {
      design: { button: design.button, icon: design.iconSpan, label: design.label },
      file: { button: file.button, icon: file.iconSpan, label: file.label },
      json: { button: json.button, icon: json.iconSpan, label: json.label },
      script: { button: script.button, icon: script.iconSpan, label: script.label }
    },
    info,
    statusLabel,
    subtitle,
    summary,
    toggle,
    toggleIcon
  };
}
function renderOverlay() {
  if (!overlayRefs || !overlayState) return;
  const { aside, buttons, info, statusLabel, subtitle, summary, toggle, toggleIcon } = overlayRefs;
  const { activeFormat, copiedFormat, options, status } = overlayState;
  const componentTitle = getExportComponentTitle(overlayState.context.title, options);
  aside.dataset.status = status;
  const collapsed = isOverlayCollapsed();
  aside.dataset.collapsed = collapsed ? "true" : "false";
  const toggleLabel = collapsed ? "Expand Figma export panel" : "Collapse Figma export panel";
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.setAttribute("aria-label", toggleLabel);
  toggle.title = toggleLabel;
  toggleIcon.innerHTML = collapsed ? svgIcons.chevronUp : svgIcons.chevronDown;
  subtitle.textContent = componentTitle;
  subtitle.title = componentTitle;
  statusLabel.textContent = statusLabels[status];
  summary.textContent = overlayState.summary;
  summary.title = overlayState.summary;
  summary.style.display = overlayState.summary ? "" : "none";
  let progress = info.querySelector(".sbfx-exporter__progress");
  if (status === "copying" && !progress) {
    progress = document.createElement("span");
    progress.className = "sbfx-exporter__progress";
    progress.setAttribute("aria-hidden", "true");
    info.append(progress);
  } else if (status !== "copying" && progress) {
    progress.remove();
  }
  Object.keys(buttons).forEach((format) => {
    const entry = buttons[format];
    if (!entry) return;
    entry.button.disabled = status === "copying";
    const isDone = copiedFormat === format && status === "copied";
    entry.icon.innerHTML = isDone ? svgIcons.check : format === "json" || format === "file" ? format === "file" ? svgIcons.download : svgIcons.copy : format === "script" ? svgIcons.command : svgIcons.figma;
    if (entry.label) {
      entry.label.textContent = activeFormat === format ? actionLabels[format].busy : isDone ? actionLabels[format].done : actionLabels[format].idle;
    }
  });
}
function setOverlayStatus(status, summary) {
  if (!overlayState) return;
  overlayState.status = status;
  if (summary !== void 0) overlayState.summary = summary;
  renderOverlay();
}
async function handleCopy(format) {
  if (!overlayState) return;
  const { context, options } = overlayState;
  const componentTitle = getExportComponentTitle(context.title, options);
  const { scope, warning } = resolveExportScope();
  overlayState.activeFormat = format;
  overlayState.copiedFormat = void 0;
  setOverlayStatus(
    "copying",
    format === "design" ? "Generating SVG design..." : format === "file" ? "Preparing export file..." : format === "json" ? "Generating JSON payload..." : "Generating console script..."
  );
  try {
    const startedAt = getExporterTime();
    await waitForExporterPanelPaint();
    const payload = await createFigmaExportPayload({
      componentTitle,
      onProgress: (progress) => {
        if (progress.phase === "preparing") {
          setOverlayStatus("copying", "Preparing story surface...");
          return;
        }
        if (progress.phase === "nodes") {
          setOverlayStatus(
            "copying",
            `Reading ${progress.nodeCount ?? 0} layers from the story...`
          );
          return;
        }
        setOverlayStatus(
          "copying",
          `Resolving design tokens from ${progress.nodeCount ?? 0} layers...`
        );
      },
      options,
      scope,
      storyId: context.id ?? "unknown-story",
      storyName: context.name ?? "Story",
      storyTitle: context.title ?? ""
    });
    let exportSizeLabel = "";
    if (format === "design") {
      setOverlayStatus("copying", "Copying SVG design...");
      await waitForExporterPanelPaint();
      const svgText = createFigmaDesignSvg(payload);
      exportSizeLabel = getTextSizeLabel(svgText);
      await copySvgDesign(svgText);
    } else if (format === "file") {
      const exportText = createFigmaExportJson(payload);
      exportSizeLabel = getTextSizeLabel(exportText);
      setOverlayStatus("copying", `Starting ${exportSizeLabel} download...`);
      await waitForExporterPanelPaint();
      downloadTextFile(
        `${sanitizeExportFilename(context.id ?? payload.storyId)}.sbfx.json`,
        exportText
      );
    } else {
      const exportText = format === "json" ? createFigmaExportJson(payload) : createFigmaPluginCode(payload);
      exportSizeLabel = getTextSizeLabel(exportText);
      setOverlayStatus(
        "copying",
        format === "json" ? `Copying ${exportSizeLabel} JSON...` : `Copying ${exportSizeLabel} plugin script...`
      );
      await waitForExporterPanelPaint();
      await copyText(exportText);
    }
    overlayState.copiedFormat = format;
    overlayState.activeFormat = void 0;
    const elapsedLabel = formatExportDuration(getExporterTime() - startedAt);
    const sizeSummary = exportSizeLabel ? ` (${exportSizeLabel})` : "";
    const scopeNote = warning ? ` [${warning}]` : "";
    setOverlayStatus(
      "copied",
      format === "design" ? `Visual SVG copied from ${payload.root.name}${sizeSummary} in ${elapsedLabel}.${scopeNote}` : format === "file" ? `${payload.tokens.length} variables exported from ${payload.root.name}${sizeSummary} in ${elapsedLabel}; .sbfx.json downloaded.${scopeNote}` : format === "json" ? `${payload.tokens.length} variables exported from ${payload.root.name}${sizeSummary} in ${elapsedLabel}; JSON copied.${scopeNote}` : `${payload.tokens.length} variables exported from ${payload.root.name}${sizeSummary} in ${elapsedLabel}; script copied.${scopeNote}`
    );
    if (options.payloadSyncUrl) {
      const syncedStoryId = payload.storyId;
      void syncPayloadToBridge(payload, options.payloadSyncUrl).then((result) => {
        if (!overlayState || overlayState.status !== "copied" || overlayState.context.id !== syncedStoryId) {
          return;
        }
        setOverlayStatus("copied", `${overlayState.summary} [${result}]`);
      });
    }
  } catch (error) {
    overlayState.activeFormat = void 0;
    overlayState.copiedFormat = void 0;
    setOverlayStatus(
      "error",
      error instanceof Error ? error.message : "Export failed."
    );
  }
}
function unmountOverlay() {
  if (overlayRefs) {
    overlayRefs.aside.remove();
    overlayRefs = null;
  }
  overlayState = null;
}
var noticeElement = null;
var mountedNoticeKey = null;
var dismissedNoticeKey = null;
function getNoticeMessage(reason, options) {
  if (reason === "not-story-view") {
    return "Figma export overlay is available in Story view only. Open this entry as a story to export it.";
  }
  const prefixes = options.storyTitlePrefix === false ? [] : options.storyTitlePrefix;
  const prefixList = prefixes.length ? ` (${prefixes.join(", ")})` : "";
  return `This story is excluded by storyTitlePrefix${prefixList}. Add this story's top-level namespace to storyTitlePrefix, or set it to false to include all stories.`;
}
function unmountNotice() {
  if (noticeElement) {
    noticeElement.remove();
    noticeElement = null;
  }
  mountedNoticeKey = null;
}
function syncFigmaExportNotice(context, options, reason) {
  const noticeKey = `${context.id ?? ""}|${reason}`;
  if (dismissedNoticeKey === noticeKey) {
    unmountNotice();
    return;
  }
  if (noticeElement && mountedNoticeKey === noticeKey) {
    if (!noticeElement.isConnected) document.body.append(noticeElement);
    return;
  }
  unmountNotice();
  const aside = document.createElement("aside");
  aside.setAttribute("aria-label", "Figma export status");
  aside.setAttribute("role", "status");
  aside.className = "sbfx-exporter-notice";
  aside.dataset.reason = reason;
  aside.dataset.version = getAddonVersion();
  const mark = createIconSpan(svgIcons.figma);
  mark.className = "sbfx-exporter-notice__mark";
  const body = document.createElement("div");
  body.className = "sbfx-exporter-notice__body";
  const title = document.createElement("span");
  title.className = "sbfx-exporter-notice__title";
  title.textContent = "Figma export";
  const message = document.createElement("p");
  message.className = "sbfx-exporter-notice__message";
  message.textContent = getNoticeMessage(reason, options);
  body.append(title, message);
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "sbfx-exporter-notice__dismiss";
  dismiss.setAttribute("aria-label", "Dismiss Figma export notice");
  dismiss.title = "Dismiss";
  dismiss.append(createIconSpan(svgIcons.close));
  dismiss.addEventListener("click", () => {
    dismissedNoticeKey = noticeKey;
    unmountNotice();
  });
  aside.append(mark, body, dismiss);
  document.body.append(aside);
  noticeElement = aside;
  mountedNoticeKey = noticeKey;
}
function syncFigmaExportOverlay(context, options) {
  if (typeof document === "undefined") return;
  const resolvedOptions = resolveFigmaExportAddonOptions(options);
  const enabled = context.globals?.[resolvedOptions.globalName] === "on";
  const includedStory = isStoryIncludedForFigmaExport(context.title, resolvedOptions);
  const isStoryView = (context.viewMode ?? "story") === "story";
  if (!enabled) {
    unmountOverlay();
    unmountNotice();
    dismissedNoticeKey = null;
    return;
  }
  if (!isStoryView || !includedStory) {
    unmountOverlay();
    syncFigmaExportNotice(
      context,
      resolvedOptions,
      !isStoryView ? "not-story-view" : "excluded-story"
    );
    return;
  }
  unmountNotice();
  if (!overlayRefs) {
    overlayRefs = buildOverlay();
  }
  const isNewStory = overlayState?.context.id !== context.id;
  overlayState = {
    activeFormat: void 0,
    context,
    copiedFormat: isNewStory ? void 0 : overlayState?.copiedFormat,
    options: resolvedOptions,
    status: isNewStory ? "idle" : overlayState?.status ?? "idle",
    summary: isNewStory ? "" : overlayState?.summary ?? ""
  };
  if (!overlayRefs.aside.isConnected) {
    document.body.append(overlayRefs.aside);
  }
  renderOverlay();
}

// src/preview.ts
function createFigmaExportDecorator(options) {
  return function figmaExportDecorator(storyFn, context) {
    syncFigmaExportOverlay(context, options);
    return storyFn();
  };
}

// src/source.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getParameterUrl(value) {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return void 0;
  return typeof value.url === "string" ? value.url : void 0;
}

// src/review.ts
var defaultFigmaReviewStatusApiPath = "/__figma_export_review_status";
var defaultLabels = {
  approved: "Approved",
  closeNotes: "Close",
  editFigmaSource: "Edit Figma source",
  exported: "Exported",
  figmaSource: "Figma source",
  imported: "Imported",
  needsFix: "Needs fix",
  notStarted: "Not started",
  notes: "Notes",
  notesSaved: "Notes saved",
  openNotes: "Open",
  openSource: "Open source",
  review: "Review",
  sourcePlaceholder: "https://www.figma.com/design/...",
  title: "Export review"
};
var defaultEntry = {
  figmaReviewStatus: "not-started"
};
function normalizeEntry(entry) {
  const notes = entry?.notes ?? "";
  return {
    componentTitle: entry?.componentTitle,
    figmaNodeUrl: entry?.figmaNodeUrl,
    figmaReviewStatus: entry?.figmaReviewStatus ?? defaultEntry.figmaReviewStatus,
    name: entry?.name,
    notes,
    notesOpen: typeof entry?.notesOpen === "boolean" ? entry.notesOpen : Boolean(notes),
    storyTitle: entry?.storyTitle,
    updatedAt: entry?.updatedAt
  };
}
function normalizeFigmaSourceUrl(value) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";
  if (trimmedValue.startsWith("figma.com/") || trimmedValue.startsWith("www.figma.com/")) {
    return `https://${trimmedValue}`;
  }
  return trimmedValue;
}
function getOpenableUrl(value) {
  const normalizedValue = normalizeFigmaSourceUrl(value ?? "");
  if (!normalizedValue) return "";
  try {
    const url = new URL(normalizedValue);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return "";
  }
  return "";
}
function getStatusText(state) {
  if (state === "loading") return "Loading";
  if (state === "saving") return "Saving";
  if (state === "saved") return "Saved";
  if (state === "error") return "Save failed";
  return "Ready";
}
function getDefaultFigmaExportComponentTitle(title, options) {
  if (!title) return "Component";
  if (options.storyTitlePrefix === false) return title;
  const matchingPrefix = options.storyTitlePrefix.find(
    (prefix) => title.startsWith(prefix)
  );
  return matchingPrefix ? title.slice(matchingPrefix.length) : title;
}
function getDefaultFigmaSourceUrl(parameters) {
  if (!parameters) return void 0;
  return (typeof parameters.figmaSourceUrl === "string" ? parameters.figmaSourceUrl : void 0) ?? getParameterUrl(parameters.figma) ?? getParameterUrl(parameters.design);
}
function getReviewStatusOptions(labels) {
  return [
    { label: labels.notStarted, value: "not-started" },
    { label: labels.exported, value: "exported" },
    { label: labels.imported, value: "imported" },
    { label: labels.needsFix, value: "needs-fix" },
    { label: labels.approved, value: "approved" }
  ];
}
function FigmaExportReview({
  apiPath = defaultFigmaReviewStatusApiPath,
  autoMarkExported = true,
  children,
  componentTitle,
  enabled,
  figmaSourceUrl,
  labels: labelsOverride,
  showNotes = true,
  storyId,
  storyName,
  storyTitle
}) {
  const labels = { ...defaultLabels, ...labelsOverride };
  const initialFigmaSourceUrl = normalizeFigmaSourceUrl(figmaSourceUrl ?? "");
  const [entry, setEntry] = useState(() => normalizeEntry(null));
  const [draftDetails, setDraftDetails] = useState(() => ({
    figmaNodeUrl: initialFigmaSourceUrl,
    notes: ""
  }));
  const [isSourceEditing, setIsSourceEditing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    () => readCollapsePreference(reviewCollapseStorageKey)
  );
  const [saveState, setSaveState] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const autoExportStoryRef = useRef(void 0);
  const entryRef = useRef(entry);
  const saveQueueRef = useRef(Promise.resolve());
  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);
  useEffect(() => {
    if (!enabled || !storyId) return;
    const controller = new AbortController();
    setSaveState("loading");
    setErrorMessage("");
    async function loadReviewStatus() {
      try {
        const response = await fetch(
          `${apiPath}?storyId=${encodeURIComponent(storyId)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const savedFigmaNodeUrl = normalizeFigmaSourceUrl(
          payload.entry?.figmaNodeUrl ?? ""
        );
        const nextEntry = normalizeEntry({
          ...payload.entry ?? {},
          figmaNodeUrl: savedFigmaNodeUrl || initialFigmaSourceUrl
        });
        entryRef.current = nextEntry;
        setEntry(nextEntry);
        setDraftDetails({
          figmaNodeUrl: nextEntry.figmaNodeUrl ?? "",
          notes: nextEntry.notes ?? ""
        });
        setIsSourceEditing(false);
        setSaveState("idle");
      } catch (error) {
        if (controller.signal.aborted) return;
        setSaveState("error");
        setErrorMessage(error instanceof Error ? error.message : "Unable to load status.");
      }
    }
    void loadReviewStatus();
    return () => {
      controller.abort();
    };
  }, [apiPath, enabled, initialFigmaSourceUrl, storyId]);
  async function saveReviewStatus(patch) {
    const nextEntry = normalizeEntry({
      ...entryRef.current,
      ...patch,
      componentTitle,
      name: storyName,
      storyTitle
    });
    entryRef.current = nextEntry;
    setEntry(nextEntry);
    setSaveState("saving");
    setErrorMessage("");
    saveQueueRef.current = saveQueueRef.current.catch(() => void 0).then(async () => {
      const entryToSave = entryRef.current;
      const response = await fetch(apiPath, {
        body: JSON.stringify({
          entry: entryToSave,
          storyId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PUT"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const savedEntry = normalizeEntry(payload.entry ?? entryToSave);
      entryRef.current = savedEntry;
      setEntry(savedEntry);
      setDraftDetails({
        figmaNodeUrl: savedEntry.figmaNodeUrl ?? "",
        notes: savedEntry.notes ?? ""
      });
      setSaveState("saved");
    }).catch((error) => {
      setSaveState("error");
      setErrorMessage(error instanceof Error ? error.message : "Unable to save status.");
    });
    await saveQueueRef.current;
  }
  useEffect(() => {
    if (!enabled || !storyId || !autoMarkExported) return;
    const markExported = () => {
      if (autoExportStoryRef.current === storyId) return;
      if (entry.figmaReviewStatus !== "not-started") return;
      const exporter = document.querySelector(".sbfx-exporter");
      const summary = exporter?.querySelector(".sbfx-exporter__summary");
      if (exporter?.dataset.status === "copied" && summary?.textContent?.includes("JSON copied")) {
        autoExportStoryRef.current = storyId;
        void saveReviewStatus({ figmaReviewStatus: "exported" });
      }
    };
    const observer = new MutationObserver(markExported);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true
    });
    markExported();
    return () => {
      observer.disconnect();
    };
  }, [autoMarkExported, enabled, entry.figmaReviewStatus, storyId]);
  const shouldShowPanel = enabled && Boolean(storyId);
  const openableFigmaSourceUrl = getOpenableUrl(entry.figmaNodeUrl);
  const shouldEditFigmaSource = isSourceEditing || !openableFigmaSourceUrl;
  function toggleCollapsed() {
    setIsCollapsed((current) => {
      const next = !current;
      writeCollapsePreference(reviewCollapseStorageKey, next);
      return next;
    });
  }
  function saveFigmaSourceUrl() {
    const figmaNodeUrl = normalizeFigmaSourceUrl(draftDetails.figmaNodeUrl);
    setDraftDetails((current) => ({
      ...current,
      figmaNodeUrl
    }));
    setIsSourceEditing(!figmaNodeUrl);
    void saveReviewStatus({ figmaNodeUrl });
  }
  const reviewStatusOptions = getReviewStatusOptions(labels);
  return h(
    Fragment,
    null,
    children,
    shouldShowPanel ? h(
      "aside",
      {
        "aria-label": "Figma export review",
        className: "sbfx-review",
        "data-collapsed": isCollapsed ? "true" : "false",
        "data-save-state": saveState,
        "data-version": getAddonVersion()
      },
      h(
        "header",
        { className: "sbfx-review__header" },
        h(
          "span",
          { "aria-hidden": "true", className: "sbfx-review__mark" },
          h(FigmaIcon, { size: 14 })
        ),
        h(
          "span",
          { className: "sbfx-review__heading" },
          h(
            "span",
            { className: "sbfx-review__title" },
            labels.title,
            h(
              "span",
              {
                className: "sbfx-review__version",
                title: `Figma export addon v${getAddonVersion()}`
              },
              `v${getAddonVersion()}`
            )
          ),
          h(
            "span",
            { className: "sbfx-review__subtitle", title: componentTitle },
            componentTitle
          )
        ),
        h(
          "span",
          { className: "sbfx-review__status" },
          h("span", { "aria-hidden": "true", className: "sbfx-review__status-dot" }),
          getStatusText(saveState)
        ),
        h(
          "button",
          {
            "aria-expanded": !isCollapsed,
            "aria-label": isCollapsed ? "Expand export review panel" : "Collapse export review panel",
            className: "sbfx-review__toggle",
            onClick: toggleCollapsed,
            title: isCollapsed ? "Expand export review panel" : "Collapse export review panel",
            type: "button"
          },
          h(isCollapsed ? ChevronDownIcon : ChevronUpIcon, { size: 14 })
        )
      ),
      h(
        "div",
        { className: "sbfx-review__body" },
        h(
          "label",
          { className: "sbfx-review__field" },
          h("span", null, labels.review),
          h(
            "select",
            {
              onChange: (event) => {
                void saveReviewStatus({
                  figmaReviewStatus: event.currentTarget.value
                });
              },
              value: entry.figmaReviewStatus
            },
            ...reviewStatusOptions.map(
              (option) => h("option", { key: option.value, value: option.value }, option.label)
            )
          )
        )
      ),
      shouldEditFigmaSource ? h(
        "label",
        { className: "sbfx-review__field" },
        h("span", null, labels.figmaSource),
        h("input", {
          onBlur: saveFigmaSourceUrl,
          onChange: (event) => {
            const figmaNodeUrl = event.currentTarget.value;
            setDraftDetails((current) => ({
              ...current,
              figmaNodeUrl
            }));
          },
          onKeyDown: (event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          },
          placeholder: labels.sourcePlaceholder,
          type: "url",
          value: draftDetails.figmaNodeUrl
        })
      ) : h(
        "div",
        { className: "sbfx-review__source" },
        h("span", { className: "sbfx-review__label" }, labels.figmaSource),
        h(
          "div",
          { className: "sbfx-review__source-actions" },
          h(
            "a",
            {
              className: "sbfx-review__button sbfx-review__button--outline",
              href: openableFigmaSourceUrl,
              rel: "noreferrer",
              target: "_blank"
            },
            h(LinkIcon, { size: 14 }),
            labels.openSource
          ),
          h(
            "button",
            {
              "aria-label": labels.editFigmaSource,
              className: "sbfx-review__icon-button",
              onClick: () => setIsSourceEditing(true),
              type: "button"
            },
            h(EditIcon, { size: 14 })
          )
        )
      ),
      showNotes ? h(
        "div",
        { className: "sbfx-review__notes" },
        h(
          "button",
          {
            "aria-expanded": entry.notesOpen,
            className: "sbfx-review__button sbfx-review__button--secondary sbfx-review__notes-toggle",
            onClick: () => {
              void saveReviewStatus({ notesOpen: !entry.notesOpen });
            },
            type: "button"
          },
          h("span", null, labels.notes),
          h(
            "span",
            { className: "sbfx-review__notes-state" },
            entry.notesOpen ? labels.closeNotes : labels.openNotes
          )
        ),
        entry.notesOpen ? h(
          "label",
          { className: "sbfx-review__field" },
          h("textarea", {
            onBlur: () => {
              void saveReviewStatus({ notes: draftDetails.notes });
            },
            onChange: (event) => {
              const notes = event.currentTarget.value;
              setDraftDetails((current) => ({
                ...current,
                notes
              }));
            },
            rows: 2,
            value: draftDetails.notes
          })
        ) : draftDetails.notes ? h("p", { className: "sbfx-review__notes-summary" }, labels.notesSaved) : null
      ) : null,
      entry.updatedAt ? h(
        "p",
        { className: "sbfx-review__meta" },
        `Updated ${new Date(entry.updatedAt).toLocaleString()}`
      ) : null,
      errorMessage ? h("p", { className: "sbfx-review__error" }, errorMessage) : null
    ) : null
  );
}
function createFigmaExportReviewDecorator(figmaExportOptions, reviewOptions) {
  const figmaExportDecorator = createFigmaExportDecorator(figmaExportOptions);
  const resolvedOptions = resolveFigmaExportAddonOptions(figmaExportOptions);
  return (Story, context) => {
    const includedStory = isStoryIncludedForFigmaExport(
      context.title,
      resolvedOptions
    );
    const componentTitle = reviewOptions?.getComponentTitle?.(context, resolvedOptions) ?? getDefaultFigmaExportComponentTitle(context.title, resolvedOptions);
    const figmaSourceUrl = reviewOptions?.getFigmaSourceUrl?.(context, componentTitle) ?? getDefaultFigmaSourceUrl(context.parameters);
    const enabled = reviewOptions?.enabled !== false && includedStory && context.globals?.[resolvedOptions.globalName] === "on";
    return h(
      FigmaExportReview,
      {
        apiPath: reviewOptions?.apiPath,
        autoMarkExported: reviewOptions?.autoMarkExported,
        componentTitle,
        enabled,
        figmaSourceUrl,
        labels: reviewOptions?.labels,
        showNotes: reviewOptions?.showNotes,
        storyId: context.id ?? "unknown-story",
        storyName: context.name ?? "Story",
        storyTitle: context.title ?? ""
      },
      figmaExportDecorator(Story, context)
    );
  };
}
export {
  FigmaExportReview,
  createFigmaExportReviewDecorator,
  defaultFigmaReviewStatusApiPath,
  getDefaultFigmaExportComponentTitle,
  getDefaultFigmaSourceUrl
};
//# sourceMappingURL=review.js.map