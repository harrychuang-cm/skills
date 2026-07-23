// Node-based verification for the plugin's pure helpers.
// Run: node test/verify-pure-functions.cjs   (from the plugin root, after npm run build)
"use strict";

const assert = require("node:assert");

// code.js calls figma.showUI / figma.ui.postMessage at load time; stub the
// plugin globals so the script body can execute under Node.
globalThis.figma = {
  notify() {},
  showUI() {},
  ui: {
    onmessage: null,
    postMessage() {},
  },
};
globalThis.__html__ = "";

const plugin = require("../code.js");

function approx(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

// --- Robust color parsing -------------------------------------------------

// Spec example: eight-digit hex with alpha (#33667780).
const eightDigitHex = plugin.colorFromCss("#33667780");
approx(eightDigitHex.r, 0.2, 0.01, "#33667780 r");
approx(eightDigitHex.g, 0.4, 0.01, "#33667780 g");
approx(eightDigitHex.b, 0.4667, 0.01, "#33667780 b");
approx(eightDigitHex.a, 0.5, 0.01, "#33667780 a");

// Spec scenario: hsl token value hsl(210, 50%, 40%) -> rgb(0.2, 0.4, 0.6).
const hsl = plugin.colorFromCss("hsl(210, 50%, 40%)");
approx(hsl.r, 0.2, 0.005, "hsl r");
approx(hsl.g, 0.4, 0.005, "hsl g");
approx(hsl.b, 0.6, 0.005, "hsl b");
approx(hsl.a, 1, 0.001, "hsl a");

// Modern space syntax with slash alpha.
const spaceSyntax = plugin.colorFromCss("rgb(255 0 0 / 0.5)");
approx(spaceSyntax.r, 1, 0.001, "rgb space r");
approx(spaceSyntax.g, 0, 0.001, "rgb space g");
approx(spaceSyntax.a, 0.5, 0.001, "rgb space a");

// Four-digit hex.
const fourDigitHex = plugin.colorFromCss("#f008");
approx(fourDigitHex.r, 1, 0.001, "#f008 r");
approx(fourDigitHex.a, 0x88 / 255, 0.005, "#f008 a");

// Legacy forms keep working.
const legacyRgba = plugin.colorFromCss("rgba(51, 102, 119, 0.25)");
approx(legacyRgba.r, 0.2, 0.005, "legacy rgba r");
approx(legacyRgba.a, 0.25, 0.001, "legacy rgba a");

// Unparseable values keep the black fallback.
const fallback = plugin.colorFromCss("definitely-not-a-color");
assert.deepStrictEqual(fallback, { a: 1, b: 0, g: 0, r: 0 }, "fallback black");

// --- Arbitrary gradient angle ----------------------------------------------

// Spec scenario: 45deg diagonal (bottom-left toward top-right).
const transform45 = plugin.getLinearGradientTransform(45);
approx(transform45[0][0], Math.SQRT1_2, 0.001, "45deg m00");
approx(transform45[0][1], -Math.SQRT1_2, 0.001, "45deg m01");
approx(transform45[0][2], 0.5, 0.001, "45deg m02");
approx(transform45[1][0], Math.SQRT1_2, 0.001, "45deg m10");
approx(transform45[1][1], Math.SQRT1_2, 0.001, "45deg m11");
approx(transform45[1][2], 0.5 - Math.SQRT1_2, 0.001, "45deg m12");

// Axis-aligned angles keep their previous meaning.
const transform90 = plugin.getLinearGradientTransform(90);
approx(transform90[0][0], 1, 0.001, "90deg m00");
approx(transform90[0][1], 0, 0.001, "90deg m01");
approx(transform90[1][0], 0, 0.001, "90deg m10");
const transform180 = plugin.getLinearGradientTransform(180);
approx(transform180[0][0], 0, 0.001, "180deg m00");
approx(transform180[0][1], 1, 0.001, "180deg m01");
approx(transform180[0][2], 0, 0.001, "180deg m02");
approx(transform180[1][0], -1, 0.001, "180deg m10");
approx(transform180[1][2], 1, 0.001, "180deg m12");

// --- Weight/italic font style candidates ------------------------------------

// Spec examples: weight-to-style candidates.
assert.strictEqual(plugin.getFontStyleCandidates(300)[0], "Light", "300 -> Light");
assert.strictEqual(
  plugin.getFontStyleCandidates(300)[1],
  "Regular",
  "300 fallback Regular",
);
assert.strictEqual(
  plugin.getFontStyleCandidates(400, true)[0],
  "Italic",
  "400 italic -> Italic",
);
assert.strictEqual(
  plugin.getFontStyleCandidates(700, true)[0],
  "Bold Italic",
  "700 italic -> Bold Italic",
);
assert.ok(
  plugin.getFontStyleCandidates(700, true).includes("Bold"),
  "700 italic falls back to Bold",
);
assert.strictEqual(plugin.getFontStyleCandidates(900)[0], "Black", "900 -> Black");
assert.ok(
  plugin.getFontStyleCandidates(900).includes("ExtraBold") &&
    plugin.getFontStyleCandidates(900).includes("Bold"),
  "900 falls back through ExtraBold and Bold",
);
assert.strictEqual(plugin.getFontStyleCandidates(100)[0], "Thin", "100 -> Thin");

// --- CSS font-family fallback normalization -------------------------------

const cssFontStack = '"Helvetica Neue", Helvetica, "Arial Narrow", Arial, sans-serif';
assert.deepStrictEqual(
  plugin.getFontFamilyCandidates(cssFontStack),
  ["Helvetica Neue", "Helvetica", "Arial Narrow", "Arial"],
  "quoted CSS fallback list parses in source order and omits the generic family",
);
assert.deepStrictEqual(
  plugin.getFontFamilyCandidates('"Font, Display", Inter, serif'),
  ["Font, Display", "Inter"],
  "commas inside quoted family names are preserved",
);
assert.strictEqual(
  plugin.normalizeVariableValue({
    collection: "ref",
    cssName: "--fx-ref-typeface-grotesque",
    figmaName: "ref/typeface/grotesque",
    rawValue: cssFontStack,
    scopes: ["FONT_FAMILY"],
    type: "STRING",
    value: 'Helvetica Neue", Helvetica, "Arial Narrow", Arial, sans-serif',
  }),
  "Helvetica Neue",
  "legacy multi-family token values normalize before Figma variable write",
);
assert.strictEqual(
  plugin.normalizeVariableValue({
    collection: "ref",
    cssName: "--fx-ref-copy-example",
    figmaName: "ref/copy/example",
    rawValue: "Hello, world",
    scopes: ["TEXT_CONTENT"],
    type: "STRING",
    value: "Hello, world",
  }),
  "Hello, world",
  "non-font string variables retain commas",
);
const fontTokenMap = new Map([
  [
    "--fx-comp-caption-font-family",
    { alias: "--fx-sys-label-family", cssName: "--fx-comp-caption-font-family" },
  ],
  [
    "--fx-sys-label-family",
    { alias: "--fx-ref-copy-example", cssName: "--fx-sys-label-family" },
  ],
  ["--fx-ref-copy-example", { cssName: "--fx-ref-copy-example" }],
]);
const fontFamilyTokenNames = plugin.collectFontFamilyTokenNames(
  {
    bindings: { fontFamily: "--fx-comp-caption-font-family" },
    children: [],
  },
  fontTokenMap,
);
assert.deepStrictEqual(
  Array.from(fontFamilyTokenNames),
  [
    "--fx-comp-caption-font-family",
    "--fx-sys-label-family",
    "--fx-ref-copy-example",
  ],
  "font-family binding marks its complete alias chain for legacy normalization",
);
assert.strictEqual(
  plugin.normalizeVariableValue(
    {
      collection: "ref",
      cssName: "--fx-ref-copy-example",
      figmaName: "ref/copy/example",
      rawValue: cssFontStack,
      scopes: ["TEXT_CONTENT"],
      type: "STRING",
      value: 'Helvetica Neue", Helvetica, "Arial Narrow", Arial, sans-serif',
    },
    fontFamilyTokenNames,
  ),
  "Helvetica Neue",
  "binding-derived font tokens normalize even when an old payload has TEXT_CONTENT scope",
);

// --- Payload compatibility ---------------------------------------------------

// A minimal legacy payload (no new fields) parses without throwing.
const legacyPayload = {
  componentTitle: "Button",
  generatedAt: "2026-01-01T00:00:00.000Z",
  root: {
    kind: "frame",
    name: "button",
    styles: { height: 32, width: 120, x: 0, y: 0 },
    children: [
      {
        kind: "text",
        name: "label",
        text: "OK",
        styles: { height: 16, width: 24, x: 8, y: 8 },
      },
    ],
  },
  storyId: "components-button--primary",
  storyName: "Primary",
  tokens: [],
  version: 1,
};
assert.doesNotThrow(
  () => plugin.parsePayload(JSON.stringify(legacyPayload)),
  "legacy v1 payload parses",
);

// A payload using the new optional fields parses.
const modernPayload = {
  ...legacyPayload,
  version: 2,
  root: {
    ...legacyPayload.root,
    styles: {
      ...legacyPayload.root.styles,
      counterAxisSpacing: 12,
      effects: [
        {
          blur: 12,
          color: "rgba(0, 0, 0, 0.25)",
          offsetX: 0,
          offsetY: 4,
          spread: 0,
          type: "DROP_SHADOW",
        },
      ],
      layoutWrap: "WRAP",
      letterSpacing: 0.5,
      radiusCorners: { bottomLeft: 0, bottomRight: 0, topLeft: 8, topRight: 8 },
      textDecoration: "UNDERLINE",
    },
  },
};
assert.doesNotThrow(
  () => plugin.parsePayload(JSON.stringify(modernPayload)),
  "payload with new optional fields parses",
);

// Spec scenario: effects with an invalid type is rejected with a path.
const badPayload = {
  ...legacyPayload,
  root: {
    ...legacyPayload.root,
    styles: { ...legacyPayload.root.styles, effects: "shadow" },
  },
};
assert.throws(
  () => plugin.parsePayload(JSON.stringify(badPayload)),
  (error) => error.message.includes("root") && error.message.includes("effects"),
  "string effects rejected with node path",
);

// --- Fidelity fields added in payload schema 2 (plugin 1.3.0) ---------------

// Named colors and transparent fall back sensibly instead of black.
const white = plugin.colorFromCss("white");
approx(white.r, 1, 0.001, "named white r");
approx(white.g, 1, 0.001, "named white g");
approx(white.b, 1, 0.001, "named white b");
const transparent = plugin.colorFromCss("transparent");
approx(transparent.a, 0, 0.001, "transparent alpha");

// overflow auto/scroll clip like the browser; visible does not.
assert.strictEqual(plugin.shouldClipContent("auto"), true, "overflow auto clips");
assert.strictEqual(plugin.shouldClipContent("scroll"), true, "overflow scroll clips");
assert.strictEqual(plugin.shouldClipContent("hidden auto"), true, "mixed overflow clips");
assert.strictEqual(plugin.shouldClipContent("visible"), false, "overflow visible does not clip");
assert.strictEqual(plugin.shouldClipContent(undefined), false, "missing overflow does not clip");

// SVG root sizing: intrinsic size becomes the viewBox so resizing scales.
const resized = plugin.setSvgRootSize(
  '<svg width="24" height="24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z"/></svg>',
  16,
  16,
);
assert.match(resized, /viewBox="0 0 24 24"/, "intrinsic size becomes viewBox");
assert.match(resized, /width="16"/, "root width rewritten to rendered size");
assert.match(resized, /height="16"/, "root height rewritten to rendered size");
const keepsViewBox = plugin.setSvgRootSize(
  '<svg viewBox="0 0 48 48" width="48"><rect/></svg>',
  20,
  20,
);
assert.match(keepsViewBox, /viewBox="0 0 48 48"/, "existing viewBox preserved");
assert.match(keepsViewBox, /width="20"/, "width rewritten alongside viewBox");
assert.match(keepsViewBox, /height="20"/, "missing height attribute added");
const percentSvg = plugin.setSvgRootSize('<svg width="100%"><rect/></svg>', 32, 8);
assert.doesNotMatch(percentSvg, /viewBox/, "percentage size never fabricates a viewBox");

// New payload fields parse: fixed-width height growth, blur effects, border
// style, radial gradients, frame-level background images. Blur types are
// also tolerated inside `effects` for hand-written payloads.
const fidelityPayload = {
  ...legacyPayload,
  version: 2,
  reference: {
    height: 120,
    imageBase64: "aGVsbG8=",
    imageMimeType: "image/png",
    width: 240,
  },
  root: {
    ...legacyPayload.root,
    imageBase64: "aGVsbG8=",
    imageMimeType: "image/png",
    styles: {
      ...legacyPayload.root.styles,
      transformMatrix: [
        [0.707107, -0.707107, 40],
        [0.707107, 0.707107, 11.72],
      ],
      backgroundRadialGradient: {
        stops: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
      },
      blurEffects: [
        { blur: 6, offsetX: 0, offsetY: 0, spread: 0, type: "LAYER_BLUR" },
        { blur: 10, offsetX: 0, offsetY: 0, spread: 0, type: "BACKGROUND_BLUR" },
      ],
      borderStyle: "dashed",
      effects: [
        { blur: 4, offsetX: 0, offsetY: 0, spread: 0, type: "LAYER_BLUR" },
      ],
    },
    children: [
      {
        kind: "text",
        name: "wrapped-paragraph",
        text: "wraps across lines",
        styles: {
          height: 40,
          textGrowHeight: true,
          width: 200,
          x: 0,
          y: 0,
        },
      },
      {
        kind: "text",
        name: "hand-written-height",
        text: "explicit HEIGHT mode",
        styles: {
          height: 40,
          textAutoResize: "HEIGHT",
          width: 200,
          x: 0,
          y: 44,
        },
      },
    ],
  },
};
assert.doesNotThrow(
  () => plugin.parsePayload(JSON.stringify(fidelityPayload)),
  "payload with 1.3.0 fidelity fields parses",
);

assert.throws(
  () =>
    plugin.parsePayload(
      JSON.stringify({
        ...legacyPayload,
        root: {
          ...legacyPayload.root,
          styles: { ...legacyPayload.root.styles, textGrowHeight: "yes" },
        },
      }),
    ),
  (error) => error.message.includes("textGrowHeight"),
  "non-boolean textGrowHeight rejected",
);

assert.throws(
  () =>
    plugin.parsePayload(
      JSON.stringify({
        ...legacyPayload,
        root: {
          ...legacyPayload.root,
          styles: {
            ...legacyPayload.root.styles,
            transformMatrix: [[1, 0], [0, 1]],
          },
        },
      }),
    ),
  (error) => error.message.includes("transformMatrix"),
  "malformed transform matrix rejected",
);

assert.throws(
  () =>
    plugin.parsePayload(
      JSON.stringify({
        ...legacyPayload,
        reference: { imageBase64: "", imageMimeType: "image/png", height: 1, width: 1 },
      }),
    ),
  (error) => error.message.includes("reference"),
  "empty reference image rejected",
);

assert.throws(
  () =>
    plugin.parsePayload(
      JSON.stringify({
        ...legacyPayload,
        root: {
          ...legacyPayload.root,
          styles: { ...legacyPayload.root.styles, borderStyle: "double" },
        },
      }),
    ),
  (error) => error.message.includes("borderStyle"),
  "unsupported borderStyle rejected",
);

assert.throws(
  () =>
    plugin.parsePayload(
      JSON.stringify({
        ...legacyPayload,
        root: {
          ...legacyPayload.root,
          styles: {
            ...legacyPayload.root.styles,
            backgroundRadialGradient: { stops: [{ color: "#fff", position: 0 }] },
          },
        },
      }),
    ),
  (error) => error.message.includes("backgroundRadialGradient"),
  "radial gradient with a single stop rejected",
);

console.log("verify-pure-functions: all assertions passed");
