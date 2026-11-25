// The v1 fixture is a fixed input for the other tests. Its numbers are written
// down by hand in fixtures/v1/EXPECTED.json; this test keeps the two in step.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { FIXTURE_V1_EXPECTED as EXPECTED, FIXTURE_V1_ROOT, addon, loadPostcss, makeWorkspace } from "./helpers.mjs";

const { buildIndex, indexSummary, serializeIndex } = await addon("server/index-builder.mjs");
const postcss = await loadPostcss();

const count = (items) => {
  const out = {};
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
};

test("v1 fixture: the server indexes it without throwing and reports the written-down numbers", async () => {
  const { config } = await makeWorkspace({ fixture: "v1" });
  assert.ok(config, "the fixture binding is valid");
  const index = buildIndex({ config, postcss });
  const summary = indexSummary(index);
  assert.deepEqual(summary.tokens.byTier, { ref: EXPECTED.tokens.ref, sys: EXPECTED.tokens.sys, comp: EXPECTED.tokens.comp });
  assert.equal(summary.tokens.readonlyNames, EXPECTED.tokens.readonlyNames);
  assert.equal(summary.tokens.shadowed, EXPECTED.tokens.shadowed);
  assert.equal(summary.tokens.unresolved, 0);
  assert.ok(summary.tokens.editing.ok, JSON.stringify(summary.tokens.editing));
  assert.ok(summary.tokens.mirrors.every((m) => m.inSync), "mirrors start identical to the source of truth");
  assert.equal(summary.css.files, EXPECTED.css.files);
  assert.equal(summary.css.rules, EXPECTED.css.rules);
  assert.equal(summary.css.declarations, EXPECTED.css.declarations);
  assert.equal(summary.css.refs, EXPECTED.css.refs);
  assert.deepEqual(summary.css.identityIneligible, []);

  const json = serializeIndex(index, config);
  const rules = json.css.files.flatMap((f) => f.rules.map((r) => ({ ...r, file: f.file })));
  const decls = rules.flatMap((r) => r.declarations.map((d) => ({ ...d, file: r.file, selector: r.selector, atRules: r.atRules })));
  assert.deepEqual(count(decls.map((d) => d.shape)), EXPECTED.shapes[`schema${json.schemaVersion}`]);
  assert.equal(decls.filter((d) => d.important).length, EXPECTED.css.important);
  assert.equal(decls.filter((d) => d.duplicateInRule).length, EXPECTED.css.duplicateInRule);
  assert.equal(rules.filter((r) => r.atRules.length > 0).length, EXPECTED.css.insideMedia);
  if (json.schemaVersion >= 2) {
    assert.deepEqual(decls.filter((d) => d.shape === "var-list").map((d) => [d.file, d.selector, d.property]), EXPECTED.varLists);
  }
});

test("v1 fixture: every feature a later test relies on is present in the files", () => {
  const read = (relative) => fs.readFileSync(path.join(FIXTURE_V1_ROOT, "workspace", relative), "utf8");
  const seal = read("sb/src/components/seal/Seal.css");
  const title = read("sb/src/components/title/Title.css");
  for (const [name, text, pattern] of [
    ["logical properties", seal, /padding-block:.*\n\s*padding-inline:/],
    ["a vertical variant", seal, /writing-mode: vertical-rl/],
    ["a var() list shorthand with two references", seal, /border: var\([^)]+\) solid var\([^)]+\)/],
    ["a var() list shorthand with literals", seal, /margin: 0 0 var\(/],
    ["calc()", seal, /calc\(var\(/],
    ["a literal", seal, /border-radius: 50%/],
    ["!important", seal, /!important/],
    ["@media", seal, /@media \(min-width: 720px\)/],
    ["a duplicated declaration in one rule", seal, /padding: var\([^;]+;\n\s*padding: var\(/],
    ["a comment on the line of a declaration", seal, /background: var\([^)]+\); \/\* primary pop \*\//],
    ["a reference with a fallback", title, /var\(--fx-sys-spacing-lg, 16px\)/],
    ["a slash-separated radius", title, /border-radius: var\([^)]+\) var\([^)]+\) \/ var\(/],
    ["a comma-separated list of references", title, /font-family: var\([^)]+\), var\(/],
    ["an outer component styling a part of an inner one", title, /\.fx-title__slot \.fx-seal__label/],
  ]) {
    assert.match(text, pattern, name);
  }
  assert.match(read("sb/src/components/title/Title.stories.tsx"), /slot: <Seal /, "a story nests Seal inside Title");

  // Specifications: plain rows, a range row, a duplicated row, a drifting row.
  const rowsOf = (text) => {
    const body = text.split(/^## Token Contract$/m)[1].split(/^## /m)[0];
    return body.split("\n").filter((line) => /^\| --/.test(line)).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
  };
  const sealRows = rowsOf(read("design-system/components/seal.md"));
  const titleRows = rowsOf(read("design-system/components/title.md"));
  assert.equal(sealRows.length, EXPECTED.specs["seal.md"].rows);
  assert.equal(titleRows.length, EXPECTED.specs["title.md"].rows);
  const firstCells = sealRows.map((r) => r[0]);
  assert.deepEqual([...new Set(firstCells.filter((c, i) => firstCells.indexOf(c) !== i))], EXPECTED.specs["seal.md"].duplicateFirstCell);
  assert.deepEqual(titleRows.filter((r) => /\.\.\d+$/.test(r[0])).map((r) => r[0]), EXPECTED.specs["title.md"].rangeRows);

  const comp = read("tokens/tokens-comp.css");
  const aliasOf = (token) => new RegExp(`${token}: var\\((--[a-z0-9-]+)\\)`).exec(comp)?.[1] ?? null;
  const drifting = titleRows.filter((r) => aliasOf(r[0]) && aliasOf(r[0]) !== r[1]).map((r) => r[0]);
  assert.deepEqual(drifting, EXPECTED.specs["title.md"].drifting);
  const documented = new Set([...sealRows, ...titleRows].map((r) => r[0]));
  const sealTokens = [...comp.matchAll(/(--fx-comp-seal-[a-z0-9-]+):/g)].map((m) => m[1]);
  assert.deepEqual(sealTokens.filter((t) => !documented.has(t)), EXPECTED.specs["seal.md"].missing);

  // Pairs: container and content tokens, a role without an on- partner, a container without a sibling.
  const sys = read("tokens/tokens-sys.css");
  const hasToken = (name) => sys.includes(`${name}:`) || comp.includes(`${name}:`);
  for (const container of EXPECTED.pairs.withPartner) {
    const role = aliasOf(container).replace("--fx-sys-color-", "");
    assert.ok(hasToken(`--fx-sys-color-on-${role}`), `${role} has an on- partner`);
    assert.equal(aliasOf(container.replace("-container-color", "-text-color")), `--fx-sys-color-on-${role}`);
  }
  for (const container of EXPECTED.pairs.roleWithoutPartner) {
    const role = aliasOf(container).replace("--fx-sys-color-", "");
    assert.ok(!hasToken(`--fx-sys-color-on-${role}`), `${role} has no on- partner`);
    assert.ok(hasToken(container.replace("-container-color", "-text-color")));
  }
  for (const container of EXPECTED.pairs.noSiblingContentToken) {
    assert.ok(!hasToken(container.replace("-container-color", "-text-color")));
  }
  assert.ok(hasToken("--fx-sys-color-primary-warm"), "a role whose name extends another role's name");
});
