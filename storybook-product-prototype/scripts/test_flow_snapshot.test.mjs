// Pure parts of the route snapshot module: node --test storybook-product-prototype/scripts/test_flow_snapshot.test.mjs
// (the browser parts run in test_flow_snapshot_fidelity.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_LIMITS,
  getFrameNotReadyReason,
  getSnapshotScale,
  getStandardPropertyNames,
} from "../assets/prototype-inspector/flow-snapshot.js";

test("the module imports only the geometry hash and reads no browser global at load", () => {
  const source = fs.readFileSync(new URL("../assets/prototype-inspector/flow-snapshot.js", import.meta.url), "utf8");
  const imports = source.match(/^import[\s\S]*?;$/gm) ?? [];

  assert.deepEqual(imports, ['import { hashMarkup } from "./flow-canvas-geometry.js";']);
  assert.equal(Number.isInteger(SNAPSHOT_FORMAT_VERSION) && SNAPSHOT_FORMAT_VERSION > 0, true);
  assert.deepEqual({ ...SNAPSHOT_LIMITS }, { maxArea: 4_000_000, maxSide: 4096, quality: 0.8, timeoutMs: 8_000, yieldMs: 32 });
});

test("snapshots draw at 0.8 of the device pixel ratio, never above 1:1", () => {
  assert.equal(getSnapshotScale(375, 812, 1), 0.8);
  assert.equal(getSnapshotScale(375, 812, 1.25), 1);
  assert.equal(getSnapshotScale(375, 812, 2), 1);
  assert.equal(getSnapshotScale(375, 812, undefined), 0.8);
});

test("the longest side stays within 4096 pixels and the area within 4 megapixels", () => {
  const tall = getSnapshotScale(375, 8000, 2);

  assert.ok(Math.abs(tall - 4096 / 8000) < 1e-12, `tall scale ${tall}`);
  const wide = getSnapshotScale(1440, 3000, 2);

  assert.ok(1440 * wide * 3000 * wide <= 4_000_000 + 1e-6, `area ${1440 * wide * 3000 * wide}`);
  assert.ok(Math.max(1440, 3000) * wide <= 4096);
});

test("only standard properties are compared, never custom properties", () => {
  const declaration = ["color", "--token-1", "margin-top", "--sb-theme", "animation-name", "transition-duration", "fill"];
  const like = { item: (index) => declaration[index], length: declaration.length };

  assert.deepEqual(getStandardPropertyNames(like), ["color", "margin-top", "fill"]);
  assert.deepEqual(getStandardPropertyNames({ length: 0 }), []);
});

test("Storybook's preparing and error displays are not captured", () => {
  const body = (...classes) => ({ body: { classList: { contains: (name) => classes.includes(name) } } });

  assert.equal(getFrameNotReadyReason(body()), null);
  assert.equal(getFrameNotReadyReason(body("sb-show-main")), null);
  assert.equal(getFrameNotReadyReason(body("sb-show-preparing-story")), "not-ready");
  assert.equal(getFrameNotReadyReason(body("sb-show-errordisplay")), "not-ready");
  assert.equal(getFrameNotReadyReason({ body: null }), "not-ready");
  assert.equal(getFrameNotReadyReason(null), "not-ready");
});
