// Node verification for the ui.html bridge helpers (Load from Storybook).
// The helpers are pure (no fetch/DOM), delimited by marker comments so this
// script can evaluate them outside Figma.
// Run from the plugin root: node test/verify-bridge-helpers.cjs
"use strict";

const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const uiHtml = readFileSync(path.join(__dirname, "..", "ui.html"), "utf8");
const start = uiHtml.indexOf("// sbfx-bridge-helpers-start");
const end = uiHtml.indexOf("// sbfx-bridge-helpers-end");
assert.ok(start >= 0 && end > start, "bridge helper markers exist in ui.html");

const helpers = {};
new Function(
  "exports",
  `${uiHtml.slice(start, end)}
  exports.buildBridgePayloadListUrl = buildBridgePayloadListUrl;
  exports.buildBridgePayloadUrl = buildBridgePayloadUrl;
  exports.parseBridgePayloadList = parseBridgePayloadList;`,
)(helpers);

// URL building
assert.strictEqual(
  helpers.buildBridgePayloadListUrl("http://localhost:6006"),
  "http://localhost:6006/__figma-export/payloads",
  "default URL",
);
assert.strictEqual(
  helpers.buildBridgePayloadListUrl("http://127.0.0.1:6007///"),
  "http://127.0.0.1:6007/__figma-export/payloads",
  "trailing slashes trimmed",
);
assert.strictEqual(helpers.buildBridgePayloadListUrl(""), null, "empty URL rejected");
assert.strictEqual(
  helpers.buildBridgePayloadListUrl("localhost:6006"),
  null,
  "missing scheme rejected",
);
assert.strictEqual(
  helpers.buildBridgePayloadUrl("http://localhost:6006", "components-button--primary"),
  "http://localhost:6006/__figma-export/payloads/components-button--primary",
  "single payload URL",
);
assert.strictEqual(
  helpers.buildBridgePayloadUrl("http://localhost:6006", ""),
  null,
  "empty storyId rejected",
);
assert.ok(
  helpers
    .buildBridgePayloadUrl("http://localhost:6006", "a/b c")
    .endsWith("/__figma-export/payloads/a%2Fb%20c"),
  "storyId is URI-encoded",
);

// List parsing
const parsed = helpers.parseBridgePayloadList([
  {
    componentTitle: "Button",
    generatedAt: "2026-01-01T00:00:00.000Z",
    storyId: "components-button--primary",
    storyName: "Primary",
  },
  { storyId: "minimal-entry" },
  { storyName: "no story id" },
  "not-an-object",
  null,
]);
assert.strictEqual(parsed.length, 2, "invalid entries filtered");
assert.deepStrictEqual(
  parsed[0],
  {
    componentTitle: "Button",
    generatedAt: "2026-01-01T00:00:00.000Z",
    storyId: "components-button--primary",
    storyName: "Primary",
  },
  "full entry normalized",
);
assert.deepStrictEqual(
  parsed[1],
  { componentTitle: "", generatedAt: "", storyId: "minimal-entry", storyName: "" },
  "missing fields default to empty strings",
);
assert.throws(
  () => helpers.parseBridgePayloadList({ not: "an array" }),
  /array/i,
  "non-array response throws",
);

console.log("verify-bridge-helpers: all assertions passed");
