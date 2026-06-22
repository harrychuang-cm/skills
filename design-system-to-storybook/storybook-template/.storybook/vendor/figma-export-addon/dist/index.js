// src/FigmaCodeExporter.tsx
import {
  CheckIcon,
  CommandIcon,
  CopyIcon,
  FigmaIcon
} from "@storybook/icons";
import { useRef, useState } from "react";

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
  const completeCandidates = Array.from(candidates.entries()).filter(([, candidate]) => tokenLayers.every((layer) => candidate.layers.has(layer))).sort(([, a], [, b]) => b.count - a.count);
  if (completeCandidates.length > 0) return completeCandidates[0][0];
  throw new Error(
    "Unable to detect a ref/sys/comp token prefix. Pass tokenPrefix in the Storybook Figma export addon options."
  );
}
function detectTokenSystem(options) {
  const customProperties = collectCssCustomProperties();
  const prefix = detectTokenPrefix(customProperties.keys(), options);
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
function isOpacityToken(token, type) {
  return type === "FLOAT" && (token.family === "opacity" || token.name.includes("-opacity-"));
}
function normalizeOpacityTokenValue(token, type, value) {
  if (!isOpacityToken(token, type) || typeof value !== "number") return value;
  return value >= 0 && value <= 1 ? value * 100 : value;
}
function extractCssVariableNames(value, tokenSystem) {
  const layerPattern = tokenLayers.map((layer) => escapeRegExp(tokenSystem.layers[layer])).join("|");
  const variablePattern = new RegExp(
    `var\\(\\s*(--${escapeRegExp(tokenSystem.prefix)}-(?:${layerPattern})-[a-z0-9-]+)`,
    "gi"
  );
  return Array.from(value.matchAll(variablePattern), (match) => match[1]);
}
function getAliasTokenName(token, tokenSystem) {
  const trimmedValue = token.value.trim();
  const layerPattern = tokenLayers.map((layer) => escapeRegExp(tokenSystem.layers[layer])).join("|");
  const variablePattern = new RegExp(
    `^var\\(\\s*(--${escapeRegExp(tokenSystem.prefix)}-(?:${layerPattern})-[a-z0-9-]+)(?:\\s*,[^)]*)?\\s*\\)$`,
    "i"
  );
  const match = trimmedValue.match(variablePattern);
  return match?.[1];
}
function toFigmaVariableName(cssName) {
  return cssName.replace(/^--/, "").replaceAll("-", "/");
}
function toExportToken(token, tokenByName, tokenSystem) {
  const alias = getAliasTokenName(token, tokenSystem);
  const type = getTokenType(token, tokenByName, tokenSystem);
  const parsed = alias ? void 0 : parseRawValue(token.value);
  const value = normalizeOpacityTokenValue(token, type, parsed?.value);
  return {
    ...alias ? { alias } : { value },
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
      window.requestAnimationFrame(() => resolve());
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
  return normalized;
}
function clampUnit(value) {
  if (!Number.isFinite(value)) return 0;
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
  const colorMatch = value.trim().match(/^(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i);
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
function isColorTokenName(token) {
  return token.includes("-color-") || token.endsWith("-color");
}
function findLinearGradientTokens(declarations, tokenSystem) {
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
function toComponentKeyPart(value) {
  const normalized = value.trim().toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  if (normalized) return normalized;
  let hash = 0;
  for (const char of value) {
    hash = hash * 31 + char.codePointAt(0) >>> 0;
  }
  return `component-${hash.toString(36)}`;
}
function toComponentLabel(value) {
  return value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").replace(/\b[a-z]/g, (match) => match.toUpperCase());
}
function getVariantProperties(variant) {
  const parts = variant.split(",").map((part) => part.trim()).filter(Boolean);
  const parsedEntries = parts.map((part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) return void 0;
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!name || !value) return void 0;
    return [name, value];
  });
  if (parsedEntries.length > 0 && parsedEntries.every((entry) => Boolean(entry))) {
    return Object.fromEntries(parsedEntries);
  }
  return { Variant: variant };
}
function getComponentReference(element) {
  const sourceName = element.getAttribute("data-component");
  if (!sourceName) return void 0;
  const variant = element.getAttribute("data-figma-variant") || element.getAttribute("data-variant") || void 0;
  const baseKey = `storybook:${toComponentKeyPart(sourceName)}`;
  const key = variant ? `${baseKey}--${toComponentKeyPart(variant)}` : baseKey;
  return {
    key,
    name: toComponentLabel(sourceName),
    sourceName,
    ...variant ? { variant, variantProperties: getVariantProperties(variant) } : {}
  };
}
function createRootComponentReference(componentTitle, storyName) {
  const name = componentTitle.trim() || "Component";
  const normalizedStoryName = storyName.trim();
  const isDefaultStory = normalizedStoryName.toLowerCase() === "default";
  const component = {
    key: `storybook:${toComponentKeyPart(name)}`,
    name,
    sourceName: name
  };
  if (normalizedStoryName && !isDefaultStory) {
    component.variant = normalizedStoryName;
    component.variantProperties = getVariantProperties(normalizedStoryName);
  }
  return component;
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
function getLayoutStrategy(computed, forceAbsoluteLayout) {
  if (forceAbsoluteLayout) return "absolute";
  return computed.display.includes("flex") ? "autoLayout" : "absolute";
}
function getExportDisplay(computed, layoutStrategy) {
  if (layoutStrategy === "absolute" && computed.display.includes("flex")) {
    return "block";
  }
  return computed.display;
}
function justifyContentFromTextAlign(textAlign) {
  const normalized = textAlign.trim().toLowerCase();
  if (normalized === "center") return "center";
  if (normalized === "right" || normalized === "end") return "flex-end";
  return "flex-start";
}
function escapeSvgAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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
    const strokeDasharray = originalStyle.getPropertyValue("stroke-dasharray").trim();
    const opacity = originalStyle.opacity;
    if (fill) clonedNode.setAttribute("fill", fill);
    if (originalStyle.fill === "none") clonedNode.setAttribute("fill", "none");
    if (stroke) clonedNode.setAttribute("stroke", stroke);
    if (strokeWidth && strokeWidth !== "0px") {
      clonedNode.setAttribute("stroke-width", strokeWidth.replace("px", ""));
    }
    if (strokeLinecap) clonedNode.setAttribute("stroke-linecap", strokeLinecap);
    if (strokeLinejoin) clonedNode.setAttribute("stroke-linejoin", strokeLinejoin);
    if (strokeDasharray && strokeDasharray !== "none") {
      clonedNode.setAttribute("stroke-dasharray", strokeDasharray.replaceAll("px", ""));
    }
    if (opacity && opacity !== "1") clonedNode.setAttribute("opacity", opacity);
    if (clonedNode.tagName.toLowerCase() === "stop") {
      const stopColor = originalStyle.getPropertyValue("stop-color").trim();
      const stopOpacity = originalStyle.getPropertyValue("stop-opacity").trim();
      if (stopColor) clonedNode.setAttribute("stop-color", stopColor);
      if (stopOpacity) clonedNode.setAttribute("stop-opacity", stopOpacity);
    }
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
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${escapeSvgAttribute(points)}" fill="${escapeSvgAttribute(fill)}"${transform}/></svg>`;
  return {
    bindings: collectBindings(element, rules, false, tokenSystem),
    children: [],
    kind: "svg",
    layoutStrategy: "absolute",
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
function createInlineSvgNode(element, computed, rect, parentRect, options, component) {
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
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
function getCssRules() {
  const rules = [];
  function collect(ruleList) {
    for (const rule of Array.from(ruleList)) {
      if (rule instanceof CSSStyleRule) {
        rules.push(rule);
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
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collect(sheet.cssRules);
    } catch {
    }
  }
  return rules;
}
function selectorMatches(element, selectorText) {
  return selectorText.split(",").some((selector) => {
    const trimmed = selector.trim();
    if (!trimmed || trimmed.includes(":hover") || trimmed.includes(":focus")) {
      return false;
    }
    try {
      return element.matches(trimmed);
    } catch {
      return false;
    }
  });
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
  const declarations = [];
  for (const rule of rules) {
    if (!selectorMatches(element, rule.selectorText)) continue;
    for (const property of Array.from(rule.style)) {
      declarations.push({
        property,
        value: rule.style.getPropertyValue(property).trim()
      });
    }
    declarations.push(...parseCssTextDeclarations(rule.style.cssText));
  }
  const inlineStyle = element.getAttribute("style");
  if (inlineStyle && element instanceof HTMLElement) {
    declarations.push(...parseCssTextDeclarations(element.style.cssText));
    for (const property of Array.from(element.style)) {
      declarations.push({
        property,
        value: element.style.getPropertyValue(property).trim()
      });
    }
  }
  return declarations;
}
function findTokenForProperty(declarations, bindingName, tokenSystem) {
  const properties = bindingProperties[bindingName];
  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index];
    if (!properties.includes(declaration.property)) continue;
    const tokens = extractCssVariableNames(declaration.value, tokenSystem);
    if (tokens.length === 0) continue;
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
        return tokens.find((token) => token.includes("-color-"));
      }
      if (bindingName === "borderWidth") {
        return tokens.find((token) => !token.includes("-color-")) || tokens[0];
      }
    }
    if (bindingName === "backgroundColor" || bindingName === "textColor") {
      return tokens.find((token) => token.includes("-color-")) || tokens[0];
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
function getTextAutoResize(element) {
  return element.getAttribute("data-figma-text-auto-width") === "true" ? "WIDTH_AND_HEIGHT" : void 0;
}
function shouldPreserveTextWidth(element) {
  return element.getAttribute("data-figma-text-fixed-width") === "true";
}
function getLayoutGrow(element) {
  const value = element.getAttribute("data-figma-layout-grow");
  if (!value) return void 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : void 0;
}
function getLayoutAlign(element) {
  const value = element.getAttribute("data-figma-layout-align");
  if (!value) return void 0;
  return value.trim().toLowerCase() === "stretch" ? "STRETCH" : void 0;
}
function getLayoutSizingHorizontal(element) {
  return element.getAttribute("data-figma-layout-sizing-horizontal") === "hug" ? "HUG" : void 0;
}
function getLayoutSizingVertical(element) {
  return element.getAttribute("data-figma-layout-sizing-vertical") === "hug" ? "HUG" : void 0;
}
function getExportOverflow(element, computed) {
  if (element.getAttribute("data-figma-clip-content") === "false") {
    return "visible";
  }
  return element.getAttribute("data-figma-overflow") || computed.overflow;
}
function getCornerRadii(computed) {
  return {
    bottomLeftRadius: cssLengthToNumber(computed.borderBottomLeftRadius) ?? 0,
    bottomRightRadius: cssLengthToNumber(computed.borderBottomRightRadius) ?? 0,
    topLeftRadius: cssLengthToNumber(computed.borderTopLeftRadius) ?? 0,
    topRightRadius: cssLengthToNumber(computed.borderTopRightRadius) ?? 0
  };
}
function createTextLeafNode({
  bindings,
  computed,
  height,
  layoutAlign,
  layoutGrow,
  layoutStrategy,
  name,
  preserveWidth,
  text,
  textAutoResize,
  width,
  x,
  y
}) {
  const color = cssColorValue(computed.color);
  const fontWeight = Number.parseInt(computed.fontWeight, 10);
  const lineHeight = cssLineHeightToNumber(computed.lineHeight);
  const exportWidth = textAutoResize ? width : preserveWidth ? width : getTextExportWidth({ computed, text, width });
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
    layoutStrategy: layoutStrategy ?? "absolute",
    name,
    text,
    styles: {
      ...color ? { color } : {},
      display: computed.display,
      fontFamily: computed.fontFamily,
      fontSize: cssLengthToNumber(computed.fontSize) ?? 14,
      ...Number.isFinite(fontWeight) ? { fontWeight } : {},
      height,
      ...layoutAlign ? { layoutAlign } : {},
      ...layoutGrow !== void 0 ? { layoutGrow } : {},
      ...lineHeight ? { lineHeight } : {},
      opacity: Number(computed.opacity),
      overflow: computed.overflow,
      textAlign: computed.textAlign,
      ...textAutoResize ? { textAutoResize } : {},
      width: exportWidth,
      x,
      y
    }
  };
}
function hasBoxedTextStyle(computed, border) {
  const cornerRadii = getCornerRadii(computed);
  return Boolean(
    cssColorValue(computed.backgroundColor) || border || Object.values(cornerRadii).some((radius) => radius > 0) || cssLengthToNumber(computed.paddingBottom) || cssLengthToNumber(computed.paddingLeft) || cssLengthToNumber(computed.paddingRight) || cssLengthToNumber(computed.paddingTop)
  );
}
function getCornerRadiusStyles(computed) {
  const { bottomLeftRadius, bottomRightRadius, topLeftRadius, topRightRadius } = getCornerRadii(computed);
  const radii = [topLeftRadius, topRightRadius, bottomRightRadius, bottomLeftRadius];
  if (radii.every((radius) => radius <= 0)) return {};
  if (radii.every((radius) => radius === topLeftRadius)) return { radius: topLeftRadius };
  return {
    bottomLeftRadius,
    bottomRightRadius,
    topLeftRadius,
    topRightRadius
  };
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
  const declarations = getPseudoMatchedDeclarations(element, rules, pseudo);
  const bindings = {};
  for (const bindingName of ["backgroundColor", "height", "width"]) {
    const token = findTokenForProperty(declarations, bindingName, tokenSystem);
    if (token) bindings[bindingName] = token;
  }
  return bindings;
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
      display: style.display,
      height,
      opacity: Number(style.opacity),
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
      return tokens.find((token) => token.includes("-color-")) || tokens[0];
    }
    return tokens.find((token) => !token.includes("-color-")) || tokens[0];
  }
  return void 0;
}
function collectBorderLineBindings(element, rules, side, tokenSystem) {
  const declarations = getMatchedDeclarations(element, rules);
  const colorToken = findBorderLineToken(declarations, side, "color", tokenSystem);
  const widthToken = findBorderLineToken(declarations, side, "width", tokenSystem);
  const bindings = {};
  if (colorToken) bindings.backgroundColor = colorToken;
  if (widthToken) {
    if (side === "left" || side === "right") {
      bindings.width = widthToken;
    } else {
      bindings.height = widthToken;
    }
  }
  return bindings;
}
function createBorderLineNode(element, rules, side, parentWidth, parentHeight, tokenSystem, options) {
  if (!isVisibleBorderSide(window.getComputedStyle(element), side)) return void 0;
  const computed = window.getComputedStyle(element);
  const borderWidth = cssBorderWidth(computed, side);
  const backgroundColor = cssColorValue(cssBorderColor(computed, side));
  if (!backgroundColor || borderWidth <= 0) return void 0;
  const isVertical = side === "left" || side === "right";
  const width = isVertical ? borderWidth : parentWidth;
  const height = isVertical ? parentHeight : borderWidth;
  const x = side === "right" ? parentWidth - borderWidth : 0;
  const y = side === "bottom" ? parentHeight - borderWidth : 0;
  return {
    bindings: collectBorderLineBindings(element, rules, side, tokenSystem),
    children: [],
    kind: "frame",
    layoutStrategy: "absolute",
    name: `${getElementName(element, options)}__border-${side}`,
    styles: {
      backgroundColor,
      display: "block",
      height: toFiniteNumber(height),
      opacity: Number(computed.opacity),
      overflow: "visible",
      width: toFiniteNumber(width),
      x: toFiniteNumber(x),
      y: toFiniteNumber(y)
    }
  };
}
function createBorderLineNodes(element, computed, rules, parentWidth, parentHeight, tokenSystem, options) {
  if (getUniformVisibleBorder(computed)) return [];
  return borderSides.map(
    (side) => createBorderLineNode(
      element,
      rules,
      side,
      parentWidth,
      parentHeight,
      tokenSystem,
      options
    )
  ).filter((node) => Boolean(node));
}
function collectBindings(element, rules, hasUniformVisibleBorder, tokenSystem) {
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
function hasElementChildren(element) {
  return Array.from(element.children).some((child) => {
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
async function createExportNode(element, rootRect, parentRect, rules, tokenSystem, options, traversalState, forceAbsoluteLayout = false) {
  await markExportNodeVisited(traversalState);
  const computed = window.getComputedStyle(element);
  if (computed.display === "none" || computed.visibility === "hidden" || Number(computed.opacity) === 0) {
    return void 0;
  }
  const rect = element.getBoundingClientRect();
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  if (width <= 0 || height <= 0) return void 0;
  const nextForceAbsoluteLayout = forceAbsoluteLayout || isAbsoluteFidelityRoot(element, options);
  const component = getComponentReference(element);
  if (element instanceof SVGElement) {
    return createInlineSvgNode(element, computed, rect, parentRect, options, component);
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
  const childElements = Array.from(element.children);
  const hasPositionedChildren = hasOutOfFlowPositionedChildren(childElements);
  const childNodes = (await Promise.all(
    childElements.map(
      (child) => createExportNode(
        child,
        rootRect,
        rect,
        rules,
        tokenSystem,
        options,
        traversalState,
        nextForceAbsoluteLayout
      )
    )
  )).filter((child) => Boolean(child));
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
  const fontWeight = Number.parseInt(computed.fontWeight, 10);
  const cornerRadiusStyles = getCornerRadiusStyles(computed);
  const lineHeight = cssLineHeightToNumber(computed.lineHeight);
  const gap = cssLengthToNumber(computed.columnGap) ?? cssLengthToNumber(computed.gap);
  const overflow = getExportOverflow(element, computed);
  const bindings = collectBindings(element, rules, Boolean(border), tokenSystem);
  const layoutSizingHorizontal = getLayoutSizingHorizontal(element);
  const layoutSizingVertical = getLayoutSizingVertical(element);
  if (backgroundLinearGradient) {
    delete bindings.backgroundColor;
  }
  const layoutStrategy = getLayoutStrategy(computed, nextForceAbsoluteLayout);
  const pseudoNodes = ["before", "after"].map(
    (pseudo) => createPseudoNode(element, rules, pseudo, width, height, tokenSystem, options)
  ).filter((node) => Boolean(node));
  const borderLineNodes = createBorderLineNodes(
    element,
    computed,
    rules,
    width,
    height,
    tokenSystem,
    options
  );
  const frameLayoutStrategy = pseudoNodes.length > 0 || borderLineNodes.length > 0 || hasPositionedChildren ? "absolute" : layoutStrategy;
  if (directText && !hasElementChildren(element)) {
    if (hasBoxedTextStyle(computed, border)) {
      const paddingLeft = cssLengthToNumber(computed.paddingLeft) ?? 0;
      const paddingRight = cssLengthToNumber(computed.paddingRight) ?? 0;
      const paddingTop = cssLengthToNumber(computed.paddingTop) ?? 0;
      const paddingBottom = cssLengthToNumber(computed.paddingBottom) ?? 0;
      const boxedTextLayoutStrategy = layoutStrategy === "autoLayout" && pseudoNodes.length === 0 && borderLineNodes.length === 0 ? "autoLayout" : "absolute";
      const textNode = createTextLeafNode({
        bindings,
        computed,
        height: Math.max(1, height - paddingTop - paddingBottom),
        layoutAlign: getLayoutAlign(element),
        layoutGrow: getLayoutGrow(element),
        layoutStrategy: boxedTextLayoutStrategy,
        name: `${getElementName(element, options)}__text`,
        preserveWidth: shouldPreserveTextWidth(element),
        text: directText,
        textAutoResize: getTextAutoResize(element),
        width: Math.max(1, width - paddingLeft - paddingRight),
        x: boxedTextLayoutStrategy === "autoLayout" ? 0 : paddingLeft,
        y: boxedTextLayoutStrategy === "autoLayout" ? 0 : paddingTop
      });
      if (boxedTextLayoutStrategy === "autoLayout") {
        return {
          bindings,
          children: [textNode],
          ...component ? { component } : {},
          kind: "frame",
          layoutStrategy: "autoLayout",
          name: getElementName(element, options),
          styles: {
            alignItems: "center",
            ...backgroundLinearGradient ? { backgroundLinearGradient } : backgroundColor ? { backgroundColor } : {},
            ...border ? { borderColor: border.color, borderWidth: border.width } : {},
            display: "flex",
            flexDirection: "row",
            height,
            justifyContent: computed.justifyContent || justifyContentFromTextAlign(computed.textAlign),
            ...layoutSizingHorizontal ? { layoutSizingHorizontal } : {},
            ...layoutSizingVertical ? { layoutSizingVertical } : {},
            opacity: Number(computed.opacity),
            overflow,
            paddingBottom,
            paddingLeft,
            paddingRight,
            paddingTop,
            ...cornerRadiusStyles,
            width,
            x: toFiniteNumber(rect.left - parentRect.left),
            y: toFiniteNumber(rect.top - parentRect.top)
          }
        };
      }
      return {
        bindings,
        children: [textNode, ...borderLineNodes],
        ...component ? { component } : {},
        kind: "frame",
        layoutStrategy: "absolute",
        name: getElementName(element, options),
        styles: {
          ...backgroundLinearGradient ? { backgroundLinearGradient } : backgroundColor ? { backgroundColor } : {},
          ...border ? { borderColor: border.color, borderWidth: border.width } : {},
          display: getExportDisplay(computed, "absolute"),
          height,
          ...layoutSizingHorizontal ? { layoutSizingHorizontal } : {},
          ...layoutSizingVertical ? { layoutSizingVertical } : {},
          opacity: Number(computed.opacity),
          overflow,
          paddingBottom,
          paddingLeft,
          paddingRight,
          paddingTop,
          ...cornerRadiusStyles,
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
      layoutAlign: getLayoutAlign(element),
      layoutGrow: getLayoutGrow(element),
      name: getElementName(element, options),
      preserveWidth: shouldPreserveTextWidth(element),
      text: directText,
      textAutoResize: getTextAutoResize(element),
      width,
      x: toFiniteNumber(rect.left - parentRect.left),
      y: toFiniteNumber(rect.top - parentRect.top)
    });
  }
  const kind = element instanceof HTMLImageElement ? "image" : "frame";
  return {
    bindings,
    children: kind === "image" ? [] : [...childNodes, ...pseudoNodes, ...borderLineNodes],
    ...component ? { component } : {},
    kind,
    layoutStrategy: kind === "image" ? "absolute" : frameLayoutStrategy,
    name: getElementName(element, options),
    ...kind === "image" && element instanceof HTMLImageElement ? { svgText: await fetchSvgText(element, options) } : {},
    styles: {
      ...computed.alignItems ? { alignItems: computed.alignItems } : {},
      ...backgroundLinearGradient ? { backgroundLinearGradient } : backgroundColor ? { backgroundColor } : {},
      ...border ? { borderColor: border.color, borderWidth: border.width } : {},
      ...color ? { color } : {},
      display: getExportDisplay(computed, frameLayoutStrategy),
      ...frameLayoutStrategy === "autoLayout" ? { flexDirection: computed.flexDirection } : {},
      fontFamily: computed.fontFamily,
      fontSize: cssLengthToNumber(computed.fontSize) ?? 14,
      ...Number.isFinite(fontWeight) ? { fontWeight } : {},
      ...gap !== void 0 && gap >= 0 ? { gap } : {},
      height,
      ...computed.justifyContent ? { justifyContent: computed.justifyContent } : {},
      ...lineHeight ? { lineHeight } : {},
      ...getLayoutAlign(element) ? { layoutAlign: getLayoutAlign(element) } : {},
      ...getLayoutGrow(element) !== void 0 ? { layoutGrow: getLayoutGrow(element) } : {},
      ...layoutSizingHorizontal ? { layoutSizingHorizontal } : {},
      ...layoutSizingVertical ? { layoutSizingVertical } : {},
      opacity: Number(computed.opacity),
      overflow,
      paddingBottom: cssLengthToNumber(computed.paddingBottom) ?? 0,
      paddingLeft: cssLengthToNumber(computed.paddingLeft) ?? 0,
      paddingRight: cssLengthToNumber(computed.paddingRight) ?? 0,
      paddingTop: cssLengthToNumber(computed.paddingTop) ?? 0,
      ...cornerRadiusStyles,
      width,
      x: toFiniteNumber(rect.left - parentRect.left),
      y: toFiniteNumber(rect.top - parentRect.top)
    }
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
  onProgress?.({ phase: "preparing" });
  await waitForExportFrame();
  const rules = getCssRules();
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
    rules,
    tokenSystem,
    options,
    traversalState
  );
  if (!rootNode) {
    throw new Error("The story root has no visible exportable bounds.");
  }
  const artifactKind = getArtifactKind(storyTitle);
  rootNode.styles.x = 0;
  rootNode.styles.y = 0;
  if (artifactKind === "page") {
    stripComponentReferences(rootNode);
  }
  const hasNestedComponent = rootNode.children.some(hasComponentReference);
  const component = artifactKind !== "component" ? void 0 : rootNode.component ? rootNode.component : hasNestedComponent ? void 0 : createRootComponentReference(componentTitle, storyName);
  if (component) rootNode.component = component;
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

// src/pluginCode.ts
function createFigmaExportJson(payload) {
  return JSON.stringify(payload, null, 2);
}
var figmaImporterExtractionPayload = {
  artifactKind: "component",
  componentTitle: "Storybook Export",
  generatedAt: "1970-01-01T00:00:00.000Z",
  root: {
    bindings: {},
    children: [],
    kind: "frame",
    name: "Storybook Export",
    styles: {
      height: 1,
      width: 1,
      x: 0,
      y: 0
    }
  },
  storyId: "storybook-export--default",
  storyName: "Default",
  storyTitle: "Storybook Export",
  tokenSystem: {
    collections: {
      comp: "comp",
      ref: "ref",
      sys: "sys"
    },
    layers: {
      comp: "comp",
      ref: "ref",
      sys: "sys"
    },
    pluginDataKey: "storybookCssToken",
    prefix: "storybook"
  },
  tokens: [],
  version: 2
};
function getFigmaImporterFunctionCode() {
  const script = createFigmaPluginCode(figmaImporterExtractionPayload);
  const startMarker = "void (async function importStorybookStory(payload) {";
  const endMarker = "\n})(STORYBOOK_FIGMA_EXPORT).catch";
  const startIndex = script.indexOf(startMarker);
  const endIndex = script.indexOf(endMarker, startIndex);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error("Unable to extract Storybook Figma importer function.");
  }
  return script.slice(startIndex + "void (".length, endIndex) + "\n}";
}
function createFigmaImporterPluginMainCode(options = {}) {
  const width = Math.max(240, Math.round(options.width ?? 360));
  const height = Math.max(240, Math.round(options.height ?? 420));
  const importerFunctionCode = getFigmaImporterFunctionCode();
  return `// Generated by @harrychuang/storybook-addon-figma-export.
// Do not edit this file directly. Regenerate it from the project template.

figma.showUI(__html__, { height: ${height}, themeColors: true, width: ${width} });

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStorybookFigmaExportPayload(payload) {
  if (!isRecord(payload)) {
    throw new Error("The selected file is not a Storybook Figma export payload.");
  }

  if (payload.version !== 2) {
    throw new Error("Unsupported export payload version. Expected version 2.");
  }

  if (!isRecord(payload.root)) {
    throw new Error("The export payload is missing its root node.");
  }

  if (!Array.isArray(payload.tokens)) {
    throw new Error("The export payload is missing token data.");
  }
}

function postImportMessage(type, message) {
  figma.ui.postMessage({ message, type });
}

function getImportTitle(payload) {
  return [payload.componentTitle, payload.storyName].filter(Boolean).join(" / ") ||
    "Storybook export";
}

${importerFunctionCode}

figma.ui.onmessage = async (message) => {
  if (!message || message.type !== "import-payload") return;

  try {
    validateStorybookFigmaExportPayload(message.payload);
    postImportMessage("import-progress", "Importing " + getImportTitle(message.payload) + "...");
    await importStorybookStory(message.payload);
    postImportMessage("import-complete", "Imported " + getImportTitle(message.payload) + ".");
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error(error);
    figma.notify("Storybook import failed: " + messageText, { error: true });
    postImportMessage("import-error", messageText);
  }
};
`;
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
  const COLLECTION_NAMES = (payload.tokenSystem && payload.tokenSystem.collections) || {
    ref: "ref",
    sys: "sys",
    comp: "comp",
  };
  const PLUGIN_DATA_TOKEN_KEY =
    (payload.tokenSystem && payload.tokenSystem.pluginDataKey) || "storybookCssToken";
  const PLUGIN_DATA_COMPONENT_KEY =
    (payload.componentSystem && payload.componentSystem.pluginDataKey) || "storybookComponentKey";

  const BINDABLE_RADIUS_FIELDS = [
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
  ];

  const layerOrder = { ref: 0, sys: 1, comp: 2 };
  const registry = new Map();
  const componentRegistry = new Map();
  const rawTokenByName = new Map(
    (payload.tokens || []).map((token) => [token.cssName, token]),
  );

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
    return (payload.componentSystem && payload.componentSystem.componentsPageName) || "Components";
  }

  function getComponentDefinitionParentPage() {
    return getOrCreatePage(getComponentsPageName());
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function valueOr(value, fallback) {
    return value === undefined || value === null ? fallback : value;
  }

  function mapTextAlignHorizontal(textAlign) {
    const normalized = String(textAlign || "left").toLowerCase();
    if (normalized === "center") return "CENTER";
    if (normalized === "right" || normalized === "end") return "RIGHT";
    if (normalized === "justify") return "JUSTIFIED";
    return "LEFT";
  }

  function applyTextOverflowBehavior(node, styles) {
    if (!styles.textAutoResize) return;

    if (styles.textAutoResize === "TRUNCATE" && "textTruncation" in node) {
      try {
        node.textTruncation = "ENDING";
        return;
      } catch (_error) {
        // Fall back to textAutoResize for older Figma runtimes.
      }
    }

    if ("textAutoResize" in node) {
      try {
        node.textAutoResize = styles.textAutoResize;
      } catch (_error) {
        // Some Figma runtimes may not allow text auto-resize changes.
      }
    }
  }

  function cloneColor(color) {
    return {
      r: clamp(Number(color.r) || 0, 0, 1),
      g: clamp(Number(color.g) || 0, 0, 1),
      b: clamp(Number(color.b) || 0, 0, 1),
      a: clamp(Number(valueOr(color.a, 1)), 0, 1),
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

  function getComponentVariantEntries(component) {
    if (!component) return [];
    const properties = component.variantProperties;
    if (properties && typeof properties === "object") {
      return Object.entries(properties)
        .map(([name, value]) => [String(name).trim(), String(value).trim()])
        .filter(([name, value]) => name && value);
    }
    return component.variant ? [["Variant", String(component.variant).trim()]] : [];
  }

  function getComponentVariantName(component) {
    const entries = getComponentVariantEntries(component);
    return entries.map(([name, value]) => name + "=" + value).join(", ");
  }

  function getComponentDisplayName(component) {
    if (!component) return "";
    const variantName = getComponentVariantName(component);
    return variantName ? component.name + ", " + variantName : component.name;
  }

  function componentVariantPropertiesMatch(node, component) {
    const expectedEntries = getComponentVariantEntries(component);
    if (expectedEntries.length === 0) return true;

    try {
      const currentProperties = node.variantProperties;
      if (currentProperties && typeof currentProperties === "object") {
        return expectedEntries.every(
          ([name, value]) => String(currentProperties[name] || "") === value,
        );
      }
    } catch (_error) {
      return false;
    }

    const displayName = getComponentDisplayName(component);
    const variantName = getComponentVariantName(component);
    return node.name === displayName || node.name === variantName;
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
        return componentVariantPropertiesMatch(node, component);
      }
      if (nodeKey) return false;

      const nodeSource = getNodePluginData(node, "storybookComponentSource");
      const parentSource =
        node.parent && node.parent.type === "COMPONENT_SET"
          ? getNodePluginData(node.parent, "storybookComponentSource")
          : "";
      const knownSource = nodeSource || parentSource;
      if (knownSource && knownSource !== sourceName) return false;

      if (component.variant) {
        return (
          componentVariantPropertiesMatch(node, component) &&
          (node.name === displayName || node.name === getComponentVariantName(component))
        );
      }
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

  function positionChildNode(parent, child, childSpec) {
    const styles = childSpec.styles || {};

    if (childSpec.layoutStrategy === "absolute") {
      if ("layoutPositioning" in child) {
        try {
          child.layoutPositioning = "ABSOLUTE";
        } catch (_error) {
          // Older Figma nodes may not allow absolute positioning.
        }
      }

      child.x = styles.x || 0;
      child.y = styles.y || 0;
      return;
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
    const widthVariable = registry.get(bindings.borderWidth);
    if (!styles.borderWidth && !widthVariable) return;
    if (!styles.borderColor && !colorVariable) return;

    node.strokes = [solidPaint(styles.borderColor, colorVariable)];
    if (styles.borderWidth) node.strokeWeight = styles.borderWidth;
  }

  function applyRadius(node, styles, bindings) {
    if ("cornerRadius" in node && styles.radius !== undefined) {
      node.cornerRadius = styles.radius;
    } else {
      const cornerRadiusEntries = [
        ["topLeftRadius", styles.topLeftRadius],
        ["topRightRadius", styles.topRightRadius],
        ["bottomRightRadius", styles.bottomRightRadius],
        ["bottomLeftRadius", styles.bottomLeftRadius],
      ];

      for (const [field, value] of cornerRadiusEntries) {
        if (value === undefined || !(field in node)) continue;
        try {
          node[field] = value;
        } catch (_error) {
          // Some imported nodes may not support per-corner radius.
        }
      }
    }

    if (bindings.cornerRadius) {
      for (const field of BINDABLE_RADIUS_FIELDS) {
        safeBind(node, field, bindings.cornerRadius);
      }
    }
  }

  function canCreateComponentDefinition(spec) {
    return spec.kind === "frame" || ((spec.kind === "image" || spec.kind === "svg") && Boolean(spec.svgText));
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

  function getComponentSetParent(node) {
    return node && node.parent && node.parent.type === "COMPONENT_SET" ? node.parent : undefined;
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

  function mapLayoutAlign(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "stretch") return "STRETCH";
    if (normalized === "center") return "CENTER";
    if (normalized === "flex-end" || normalized === "end" || normalized === "right") {
      return "MAX";
    }
    return "MIN";
  }

  function applyChildLayoutHints(node, styles) {
    if (!node || !styles) return;

    if (styles.layoutGrow !== undefined && "layoutGrow" in node) {
      try {
        node.layoutGrow = styles.layoutGrow;
      } catch (_error) {
        // Some nodes only accept layout grow after being appended to auto layout.
      }
    }

    if (styles.layoutAlign && "layoutAlign" in node) {
      try {
        node.layoutAlign = mapLayoutAlign(styles.layoutAlign);
      } catch (_error) {
        // Some nodes do not expose auto-layout child alignment.
      }
    }
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

  async function createTextNode(spec) {
    const node = figma.createText();
    const styles = spec.styles;
    const bindings = spec.bindings || {};
    node.name = spec.name;
    node.fontName = await loadTextFont(styles);
    node.characters = spec.text || "";
    node.fontSize = styles.fontSize || 14;
    if (styles.lineHeight && styles.lineHeight !== "normal") {
      node.lineHeight = { unit: "PIXELS", value: styles.lineHeight };
    }
    node.fills = [solidPaint(styles.color, registry.get(bindings.textColor))];
    safeResize(node, styles.width, styles.height);
    if (styles.textAlign && "textAlignHorizontal" in node) {
      try {
        node.textAlignHorizontal = mapTextAlignHorizontal(styles.textAlign);
      } catch (_error) {
        // Some imported text nodes may not allow text alignment changes.
      }
    }
    applyTextOverflowBehavior(node, styles);
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

  async function updateExistingComponentDefinition(node, spec) {
    if (!node || !spec) return;

    if (spec.kind === "text" && node.type === "TEXT") {
      const styles = spec.styles || {};
      const bindings = spec.bindings || {};
      await loadTextNodeFonts(node);
      const nextText = spec.text || "";
      if (node.characters !== nextText) {
        node.characters = nextText;
      }
      node.fontSize = styles.fontSize || 14;
      if (styles.lineHeight && styles.lineHeight !== "normal") {
        node.lineHeight = { unit: "PIXELS", value: styles.lineHeight };
      }
      if (styles.color) {
        node.fills = [solidPaint(styles.color, registry.get(bindings.textColor))];
      }
      safeResize(node, styles.width, styles.height);
      if (styles.textAlign && "textAlignHorizontal" in node) {
        try {
          node.textAlignHorizontal = mapTextAlignHorizontal(styles.textAlign);
        } catch (_error) {
          // Some imported text nodes may not allow text alignment changes.
        }
      }
      applyTextOverflowBehavior(node, styles);
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
      safeBind(node, "strokeWeight", bindings.borderWidth);
    }

    if (!("children" in node)) return;

    const nodeChildren = Array.from(node.children || []);
    const specChildren = spec.children || [];
    for (let index = 0; index < specChildren.length; index += 1) {
      const childSpec = specChildren[index];
      const childNode = nodeChildren[index];
      await updateExistingComponentDefinition(childNode, childSpec);
      if (childNode) {
        applyChildLayoutHints(childNode, childSpec.styles || {});
        positionChildNode(node, childNode, childSpec);
      }
    }
  }

  async function createFrameLikeNode(spec, createContainer) {
    const node = createContainer();
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
    safeBind(node, "strokeWeight", bindings.borderWidth);

    for (const childSpec of spec.children || []) {
      const child = await createNode(childSpec);
      await loadNodeFonts(child);
      node.appendChild(child);
      applyChildLayoutHints(child, childSpec.styles || {});
      positionChildNode(node, child, childSpec);
    }

    if (spec.layoutStrategy === "absolute") {
      setFrameLayoutMode(node, "NONE");
    }

    return node;
  }

  async function createFrameNode(spec) {
    return createFrameLikeNode(spec, () => figma.createFrame());
  }

  async function createComponentNode(spec) {
    return createFrameLikeNode(spec, () => figma.createComponent());
  }

  async function ensureComponentDefinition(spec, component) {
    const existing = findLocalComponent(component);
    if (existing) {
      await updateExistingComponentDefinition(existing, spec);
      tagComponentNode(existing, component);
      return existing;
    }

    const componentNode =
      (spec.kind === "image" || spec.kind === "svg") && spec.svgText
        ? figma.createComponentFromNode(figma.createNodeFromSvg(spec.svgText || ""))
        : await createComponentNode(spec);
    componentNode.name = getComponentDisplayName(component);
    tagComponentNode(componentNode, component);
    const parentPage = getComponentDefinitionParentPage();
    if (componentNode.parent !== parentPage) parentPage.appendChild(componentNode);
    componentRegistry.set(component.key, componentNode);
    return componentNode;
  }

  async function importComponentVariantSet(specs) {
    const existingComponents = specs
      .map((spec) => ({ spec, component: findLocalComponent(spec.component) }))
      .filter((entry) => Boolean(entry.component));
    const existingSet = existingComponents
      .map((entry) => getComponentSetParent(entry.component))
      .find(Boolean);
    if (existingSet) {
      for (const spec of specs) {
        const existingComponent = findLocalComponent(spec.component);
        if (existingComponent) {
          await updateExistingComponentDefinition(existingComponent, spec);
          tagComponentNode(existingComponent, spec.component);
          continue;
        }

        const createdComponent = await ensureComponentDefinition(spec, spec.component);
        if (createdComponent && createdComponent.parent !== existingSet) {
          try {
            existingSet.appendChild(createdComponent);
          } catch (_error) {
            // Keep the created component on the page if this Figma runtime cannot append variants.
          }
        }
      }
      setNodePluginData(existingSet, "storybookComponentName", payload.componentTitle);
      setNodePluginData(
        existingSet,
        "storybookComponentSource",
        (specs[0] && specs[0].component && specs[0].component.sourceName) || payload.componentTitle,
      );
      return existingSet;
    }

    const componentNodes = [];
    for (const spec of specs) {
      componentNodes.push(await ensureComponentDefinition(spec, spec.component));
    }

    if (componentNodes.length > 1 && typeof figma.combineAsVariants === "function") {
      const componentSet = figma.combineAsVariants(
        componentNodes,
        getComponentDefinitionParentPage(),
      );
      componentSet.name = payload.componentTitle;
      componentSet.x = 0;
      componentSet.y = 0;
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

  async function createComponentInstanceNode(spec) {
    const component = spec.component;
    if (!component || !component.key || !canCreateComponentDefinition(spec)) return undefined;

    const existing = findLocalComponent(component);
    const componentNode = existing || (await ensureComponentDefinition(spec, component));
    if (!componentNode || typeof componentNode.createInstance !== "function") {
      return undefined;
    }

    const instance = componentNode.createInstance();
    tagComponentNode(instance, component);
    await updateExistingComponentDefinition(instance, spec);
    return instance;
  }

  async function createNode(spec) {
    const shouldReuseComponents = payload.artifactKind === "component";
    const componentInstance =
      shouldReuseComponents && spec.component && spec.component.name !== payload.componentTitle
        ? await createComponentInstanceNode(spec)
        : undefined;
    const node =
      componentInstance ||
      (spec.kind === "text"
        ? await createTextNode(spec)
        : spec.kind === "image" || spec.kind === "svg"
          ? await createImageNode(spec)
          : await createFrameNode(spec));

    node.x = spec.styles.x || 0;
    node.y = spec.styles.y || 0;
    applyChildLayoutHints(node, spec.styles || {});
    return node;
  }

  await upsertVariables(payload.tokens || []);
  const shouldImportAsComponent = payload.artifactKind === "component";
  const rootComponent = payload.component || (payload.root && payload.root.component);
  const componentVariantSpecs =
    shouldImportAsComponent && !rootComponent
      ? collectComponentDefinitionSpecs(payload.root, payload.componentTitle)
      : [];
  const rootNode =
    shouldImportAsComponent && rootComponent && canCreateComponentDefinition(payload.root)
      ? await ensureComponentDefinition(payload.root, rootComponent)
      : componentVariantSpecs.length > 1
        ? await importComponentVariantSet(componentVariantSpecs)
        : await createNode(payload.root);
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
    "Imported " + payload.componentTitle + " with " +
      (payload.tokens || []).length + " variables checked.",
  );
})(STORYBOOK_FIGMA_EXPORT).catch((error) => {
  console.error(error);
  figma.notify("Storybook import failed: " + ((error && error.message) || String(error)));
});
`;
}

// src/FigmaCodeExporter.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var statusLabels = {
  copied: "Copied",
  copying: "Exporting",
  error: "Failed",
  idle: "Ready"
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
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
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
function exporterEscapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function exporterEscapeSvgAttribute(value) {
  return exporterEscapeXml(value).replace(/"/g, "&quot;");
}
function exporterFormatSvgNumber(value) {
  const numberValue = Number.isFinite(value) ? Number(value) : 0;
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
}
function exporterSvgDataUrl(svgText) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}
function exporterGetSvgPaint(value, fallback = "none") {
  return value ? exporterEscapeSvgAttribute(value) : fallback;
}
function renderSvgImageNode(node, isRoot) {
  const { height, width, x, y } = node.styles;
  const transform = isRoot ? "" : ` transform="translate(${exporterFormatSvgNumber(x)} ${exporterFormatSvgNumber(y)})"`;
  if (!node.svgText) return "";
  return `<g${transform}><image href="${exporterEscapeSvgAttribute(exporterSvgDataUrl(node.svgText))}" width="${exporterFormatSvgNumber(width)}" height="${exporterFormatSvgNumber(height)}" preserveAspectRatio="none"/></g>`;
}
function renderSvgTextNode(node, isRoot) {
  const { color, fontFamily, fontSize, fontWeight, textAlign, width, x, y } = node.styles;
  const transform = isRoot ? "" : ` transform="translate(${exporterFormatSvgNumber(x)} ${exporterFormatSvgNumber(y)})"`;
  const resolvedFontSize = fontSize ?? 12;
  const textAnchor = textAlign === "center" ? "middle" : textAlign === "right" || textAlign === "end" ? "end" : "start";
  const textX = textAnchor === "middle" ? width / 2 : textAnchor === "end" ? width : 0;
  return `<text${transform} x="${exporterFormatSvgNumber(textX)}" y="${exporterFormatSvgNumber(resolvedFontSize)}" fill="${exporterGetSvgPaint(color, "#000000")}" font-family="${exporterEscapeSvgAttribute(fontFamily ?? "sans-serif")}" font-size="${exporterFormatSvgNumber(resolvedFontSize)}" font-weight="${exporterEscapeSvgAttribute(String(fontWeight ?? 400))}" text-anchor="${textAnchor}">${exporterEscapeXml(node.text ?? "")}</text>`;
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
  const transform = isRoot ? "" : ` transform="translate(${exporterFormatSvgNumber(x)} ${exporterFormatSvgNumber(y)})"`;
  const groupOpacity = typeof opacity === "number" && opacity >= 0 && opacity < 1 ? ` opacity="${exporterFormatSvgNumber(opacity)}"` : "";
  const hasRect = Boolean(backgroundColor || borderColor && borderWidth);
  const rect = hasRect ? `<rect width="${exporterFormatSvgNumber(width)}" height="${exporterFormatSvgNumber(height)}" rx="${exporterFormatSvgNumber(radius)}" fill="${exporterGetSvgPaint(backgroundColor)}"${borderColor && borderWidth ? ` stroke="${exporterGetSvgPaint(borderColor)}" stroke-width="${exporterFormatSvgNumber(borderWidth)}"` : ""}/>` : "";
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${exporterFormatSvgNumber(width)}" height="${exporterFormatSvgNumber(height)}" viewBox="0 0 ${exporterFormatSvgNumber(width)} ${exporterFormatSvgNumber(height)}" role="img" aria-label="${exporterEscapeSvgAttribute(payload.root.name)}">${renderSvgNode(payload.root, true)}</svg>`;
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
function FigmaCodeExporter({
  children,
  context,
  options
}) {
  const scopeRef = useRef(null);
  const [activeFormat, setActiveFormat] = useState();
  const [copiedFormat, setCopiedFormat] = useState();
  const [status, setStatus] = useState("idle");
  const [summary, setSummary] = useState("");
  const resolvedOptions = resolveFigmaExportAddonOptions(options);
  const enabled = context.globals?.[resolvedOptions.globalName] === "on";
  const includedStory = isStoryIncludedForFigmaExport(context.title, resolvedOptions);
  const componentTitle = getExportComponentTitle(context.title, resolvedOptions);
  async function handleCopy(format) {
    const scope = scopeRef.current;
    if (!scope) return;
    setActiveFormat(format);
    setCopiedFormat(void 0);
    setStatus("copying");
    setSummary(
      format === "design" ? "Generating SVG design..." : format === "file" ? "Preparing export file..." : format === "json" ? "Generating JSON payload..." : "Generating console script..."
    );
    try {
      const startedAt = getExporterTime();
      await waitForExporterPanelPaint();
      const payload = await createFigmaExportPayload({
        componentTitle,
        onProgress: (progress) => {
          if (progress.phase === "preparing") {
            setSummary("Preparing story surface...");
            return;
          }
          if (progress.phase === "nodes") {
            setSummary(
              `Reading ${progress.nodeCount ?? 0} layers from the story...`
            );
            return;
          }
          setSummary(
            `Resolving design tokens from ${progress.nodeCount ?? 0} layers...`
          );
        },
        options: resolvedOptions,
        scope,
        storyId: context.id ?? "unknown-story",
        storyName: context.name ?? "Story",
        storyTitle: context.title ?? componentTitle
      });
      let exportSizeLabel = "";
      if (format === "design") {
        setSummary("Copying SVG design...");
        await waitForExporterPanelPaint();
        const svgText = createFigmaDesignSvg(payload);
        exportSizeLabel = getTextSizeLabel(svgText);
        await copySvgDesign(svgText);
      } else if (format === "file") {
        const exportText = createFigmaExportJson(payload);
        exportSizeLabel = getTextSizeLabel(exportText);
        setSummary(`Starting ${exportSizeLabel} download...`);
        await waitForExporterPanelPaint();
        downloadTextFile(
          `${sanitizeExportFilename(context.id ?? payload.storyId)}.sbfx.json`,
          exportText
        );
      } else {
        const exportText = format === "json" ? createFigmaExportJson(payload) : createFigmaPluginCode(payload);
        exportSizeLabel = getTextSizeLabel(exportText);
        setSummary(
          format === "json" ? `Copying ${exportSizeLabel} JSON...` : `Copying ${exportSizeLabel} plugin script...`
        );
        await waitForExporterPanelPaint();
        await copyText(exportText);
      }
      setCopiedFormat(format);
      setStatus("copied");
      const elapsedLabel = formatExportDuration(getExporterTime() - startedAt);
      const sizeSummary = exportSizeLabel ? ` (${exportSizeLabel})` : "";
      setSummary(
        format === "design" ? `Visual SVG copied from ${payload.root.name}${sizeSummary} in ${elapsedLabel}.` : format === "file" ? `${payload.tokens.length} variables exported from ${payload.root.name}${sizeSummary} in ${elapsedLabel}; .sbfx.json downloaded.` : format === "json" ? `${payload.tokens.length} variables exported from ${payload.root.name}${sizeSummary} in ${elapsedLabel}; JSON copied.` : `${payload.tokens.length} variables exported from ${payload.root.name}${sizeSummary} in ${elapsedLabel}; script copied.`
      );
    } catch (error) {
      setStatus("error");
      setCopiedFormat(void 0);
      setSummary(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setActiveFormat(void 0);
    }
  }
  if (!includedStory) {
    return /* @__PURE__ */ jsx(Fragment, { children });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "sbfx-story-scope", ref: scopeRef, children }),
    enabled ? /* @__PURE__ */ jsxs(
      "aside",
      {
        "aria-label": "Figma export",
        className: "sbfx-exporter",
        "data-status": status,
        children: [
          /* @__PURE__ */ jsxs("header", { className: "sbfx-exporter__header", children: [
            /* @__PURE__ */ jsx("span", { className: "sbfx-exporter__mark", "aria-hidden": "true", children: /* @__PURE__ */ jsx(FigmaIcon, { size: 14 }) }),
            /* @__PURE__ */ jsxs("span", { className: "sbfx-exporter__heading", children: [
              /* @__PURE__ */ jsx("span", { className: "sbfx-exporter__title", children: "Figma export" }),
              /* @__PURE__ */ jsx("span", { className: "sbfx-exporter__subtitle", title: componentTitle, children: componentTitle })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sbfx-exporter__info", children: [
            /* @__PURE__ */ jsxs("span", { className: "sbfx-exporter__status", children: [
              /* @__PURE__ */ jsx("span", { className: "sbfx-exporter__status-dot", "aria-hidden": "true" }),
              statusLabels[status]
            ] }),
            summary ? /* @__PURE__ */ jsx("p", { className: "sbfx-exporter__summary", title: summary, children: summary }) : null,
            status === "copying" ? /* @__PURE__ */ jsx("span", { className: "sbfx-exporter__progress", "aria-hidden": "true" }) : null
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "sbfx-exporter__actions", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                className: "sbfx-exporter__button",
                disabled: status === "copying",
                onClick: () => {
                  void handleCopy("json");
                },
                type: "button",
                children: [
                  copiedFormat === "json" && status === "copied" ? /* @__PURE__ */ jsx(CheckIcon, { size: 14 }) : /* @__PURE__ */ jsx(CopyIcon, { size: 14 }),
                  activeFormat === "json" ? "Copying" : copiedFormat === "json" && status === "copied" ? "Copied" : "Copy JSON"
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                className: "sbfx-exporter__button",
                disabled: status === "copying",
                onClick: () => {
                  void handleCopy("file");
                },
                type: "button",
                children: [
                  copiedFormat === "file" && status === "copied" ? /* @__PURE__ */ jsx(CheckIcon, { size: 14 }) : /* @__PURE__ */ jsx(CopyIcon, { size: 14 }),
                  activeFormat === "file" ? "Preparing" : copiedFormat === "file" && status === "copied" ? "Downloaded" : "Download JSON"
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                className: "sbfx-exporter__button sbfx-exporter__button--secondary",
                disabled: status === "copying",
                onClick: () => {
                  void handleCopy("script");
                },
                type: "button",
                children: [
                  copiedFormat === "script" && status === "copied" ? /* @__PURE__ */ jsx(CheckIcon, { size: 14 }) : /* @__PURE__ */ jsx(CommandIcon, { size: 14 }),
                  activeFormat === "script" ? "Copying" : copiedFormat === "script" && status === "copied" ? "Copied" : "Plugin Console Script"
                ]
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                "aria-label": "Copy design to Figma",
                className: "sbfx-exporter__button sbfx-exporter__button--secondary sbfx-exporter__button--icon",
                disabled: status === "copying",
                onClick: () => {
                  void handleCopy("design");
                },
                title: "Copy design to Figma",
                type: "button",
                children: copiedFormat === "design" && status === "copied" ? /* @__PURE__ */ jsx(CheckIcon, { size: 14 }) : /* @__PURE__ */ jsx(FigmaIcon, { size: 14 })
              }
            )
          ] })
        ]
      }
    ) : null
  ] });
}

// src/manager.tsx
import { CopyIcon as CopyIcon2 } from "@storybook/icons";
import { createElement } from "react";
import { ToggleButton } from "storybook/internal/components";
import { addons, types, useGlobals } from "storybook/manager-api";
var figmaExportAddonId = "storybook/figma-export";
function registerFigmaExportTool(options = {}) {
  const addonId = options.addonId ?? figmaExportAddonId;
  const globalName = options.globalName ?? defaultFigmaExportGlobalName;
  const toolId = `${addonId}/tool`;
  function FigmaExportToggle() {
    const [globals, updateGlobals] = useGlobals();
    const enabled = globals[globalName] === "on";
    const title = enabled ? "Figma export on" : "Figma export off";
    return createElement(
      ToggleButton,
      {
        ariaLabel: title,
        key: toolId,
        onClick: () => {
          updateGlobals({
            [globalName]: enabled ? "off" : "on"
          });
        },
        padding: "small",
        pressed: enabled,
        title,
        tooltip: title,
        variant: "ghost"
      },
      createElement(CopyIcon2),
      createElement("span", null, title)
    );
  }
  addons.register(addonId, () => {
    addons.add(toolId, {
      render: () => createElement(FigmaExportToggle),
      title: "Figma export",
      type: types.TOOL
    });
  });
}

// src/preview.tsx
import { createElement as createElement2 } from "react";
function getFigmaExportGlobalName(options) {
  return options?.globalName ?? defaultFigmaExportGlobalName;
}
function createFigmaExportDecorator(options) {
  return (Story, context) => createElement2(FigmaCodeExporter, { context, options }, Story());
}
function createFigmaExportGlobalTypes(options) {
  return {
    [getFigmaExportGlobalName(options)]: {
      defaultValue: "off",
      description: "Show the component-to-Figma code exporter."
    }
  };
}
function createFigmaExportInitialGlobals(options) {
  return {
    [getFigmaExportGlobalName(options)]: "off"
  };
}
export {
  FigmaCodeExporter,
  createFigmaExportDecorator,
  createFigmaExportGlobalTypes,
  createFigmaExportInitialGlobals,
  createFigmaExportJson,
  createFigmaImporterPluginMainCode,
  createFigmaPluginCode,
  defaultFigmaExportGlobalName,
  figmaExportAddonId,
  getFigmaExportGlobalName,
  isStoryIncludedForFigmaExport,
  registerFigmaExportTool,
  resolveFigmaExportAddonOptions
};
//# sourceMappingURL=index.js.map