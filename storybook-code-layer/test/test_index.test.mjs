import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { addon, loadPostcss, makeWorkspace, testProject } from "./helpers.mjs";

const { buildIndex, indexSummary, serializeIndex } = await addon("server/index-builder.mjs");
const { walkStyleRules } = await addon("server/css-index.mjs");
const { loadConfig } = await addon("server/config.mjs");
const { inferKind, kindsCompatible } = await addon("server/type-infer.mjs");
const postcss = await loadPostcss();

test("fixture: tokens, chains, read-only sources and shadowing", async () => {
  const { config } = await makeWorkspace();
  const index = buildIndex({ config, postcss });
  const summary = indexSummary(index);
  assert.deepEqual(summary.tokens.byTier, { ref: 5, sys: 5, comp: 2 });
  assert.equal(summary.tokens.readonlyNames, 1);
  assert.equal(summary.tokens.shadowed, 1);
  assert.ok(summary.tokens.editing.ok, JSON.stringify(summary.tokens.editing));
  assert.ok(summary.tokens.mirrors.every((m) => m.inSync));
  const tokens = index.tokenIndex.tokens;
  const container = tokens.get("--t-comp-seal-container-color");
  assert.deepEqual(container.chain, ["--t-sys-color-primary", "--t-ref-color-red-60"]);
  assert.equal(container.resolvedValue, "#FE0B05");
  assert.equal(container.kind, "color");
  assert.equal(container.line, 3);
  assert.equal(container.writable, true);
  assert.equal(tokens.get("--t-sys-color-primary").shadowedBy[0].selector, ':root[data-theme="dark"]');
  assert.equal(tokens.get("--t-sys-chrome-only").source, "readonly");
  assert.deepEqual(tokens.get("--t-sys-color-primary").aliasedBy, ["--t-comp-seal-container-color"]);
  assert.equal(index.tokenIndex.entry.blocks.map((b) => b.tier).join(","), "ref,sys,comp");
  assert.equal(index.tokenIndex.entry.devId, fs.realpathSync(path.join(config.projectRoot, "tokens", "tokens.css")));
});

test("fixture: css index rules, refs and served-text identity", async () => {
  const { config } = await makeWorkspace();
  const index = buildIndex({ config, postcss });
  const [file] = index.cssIndex.files;
  assert.equal(file.file, "src/components/seal/Seal.css");
  assert.equal(file.componentId, "seal");
  assert.equal(file.styleRuleCount, 2);
  assert.ok(file.identityEligible);
  assert.match(file.servedTextHash, /^sha256:[0-9a-f]{64}$/);
  const seal = file.rules[0];
  assert.equal(seal.selector, ".t-seal");
  assert.deepEqual(seal.declarations.map((d) => [d.property, d.shape]), [["background", "single-var"], ["border-radius", "single-var"]]);
  assert.equal(file.rules[1].declarations[0].shape, "expression");
  const used = index.tokenIndex.tokens.get("--t-sys-shape-corner-sm").usedBy;
  assert.deepEqual(used.map((u) => [u.selector, u.property, u.line]), [[".t-seal", "border-radius", 4]]);
  const json = serializeIndex(index, config);
  assert.equal(json.css.files[0].rules[0].declarations[1].refs[0].tier, "sys");
  assert.ok(!JSON.stringify(json).includes(config.stateDir), "state dir path is not exposed");
});

test("fixture: problems disable token editing; mirror drift is reported", async () => {
  const twoRoots = await makeWorkspace({
    files: { "tokens/tokens-comp.css": ":root { --t-comp-a: var(--t-sys-color-primary); }\n:root { --t-comp-b: var(--t-sys-color-primary); }\n" },
  });
  const twoRootsIndex = buildIndex({ config: twoRoots.config, postcss });
  assert.equal(twoRootsIndex.tokenIndex.tokenEditing.ok, false);
  assert.match(twoRootsIndex.tokenIndex.tokenEditing.problems.join("\n"), /exactly one top-level :root/);

  const duplicate = await makeWorkspace({
    files: { "tokens/tokens-sys.css": ":root {\n  --t-sys-color-primary: var(--t-ref-color-red-60);\n  --t-sys-color-primary: var(--t-ref-color-blue-70);\n}\n" },
  });
  const duplicateIndex = buildIndex({ config: duplicate.config, postcss });
  assert.equal(duplicateIndex.tokenIndex.tokens.get("--t-sys-color-primary").duplicate, true);

  const drift = await makeWorkspace({ files: { "sb/tokens/tokens-comp.css": ":root {}\n" } });
  const driftIndex = buildIndex({ config: drift.config, postcss });
  const comp = driftIndex.tokenIndex.mirrors.find((m) => m.id === "tokens:comp");
  assert.equal(comp.inSync, false);
  assert.ok(comp.diffLines > 0);
});

test("ordinal walk: keyframes skipped, every grouping rule entered, nested parent first", () => {
  const css = [
    ".a { color: red }",
    "@keyframes spin { from { opacity: 0 } 50% { opacity: .5 } to { opacity: 1 } }",
    "@font-face { font-family: X; src: local(X) }",
    ".b { color: red }",
    "@media (max-width: 1px) { .c { color: red } }",
    "@supports (display: grid) { .d { color: red } @media print { .e { color: red } } }",
    "@-webkit-keyframes old { from { opacity: 0 } }",
    ".f { color: red; & .g { color: blue } .h { color: green } }",
    "@layer base { .i { color: red } }",
    "::-moz-selection { color: red }",
    ".j { color: red }",
  ].join("\n");
  const selectors = [];
  walkStyleRules(postcss.parse(css), (rule) => selectors.push(rule.selector));
  assert.deepEqual(selectors, [".a", ".b", ".c", ".d", ".e", ".f", "& .g", ".h", ".i", "::-moz-selection", ".j"]);
});

test("declaration overlap: only real overrides count", async () => {
  const { overlaps } = await addon("server/css-index.mjs");
  assert.ok(overlaps("padding", "padding-top"));
  assert.ok(overlaps("padding-top", "padding"));
  assert.ok(overlaps("background", "background-color"));
  assert.ok(overlaps("font", "font-size"));
  assert.ok(overlaps("padding-top", "padding-block-start"), "logical and physical may hit the same side");
  assert.ok(overlaps("padding-block", "padding-top"));
  assert.ok(!overlaps("font-family", "font-size"));
  assert.ok(!overlaps("padding-top", "padding-bottom"));
  assert.ok(!overlaps("background-color", "background-image"));
  assert.ok(!overlaps("border-radius", "color"));
});

test("type inference and compatibility", () => {
  assert.equal(inferKind("#FE0B05"), "color");
  assert.equal(inferKind("rgb(1 2 3 / 50%)"), "color");
  assert.equal(inferKind("4px"), "dimension");
  assert.equal(inferKind("0.08em"), "dimension");
  assert.equal(inferKind("8deg"), "angle");
  assert.equal(inferKind("700"), "number");
  assert.equal(inferKind("0"), "zero");
  assert.equal(inferKind('"M PLUS Rounded 1c", sans-serif'), "font-family");
  assert.ok(kindsCompatible("dimension", "dimension"));
  assert.ok(kindsCompatible("zero", "dimension"));
  assert.ok(!kindsCompatible("color", "dimension"));
  assert.ok(!kindsCompatible("unknown", "unknown"));
});

test("lab (optional): numbers match the plan when CODE_LAYER_LAB_CONFIG is set", { skip: !process.env.CODE_LAYER_LAB_CONFIG }, () => {
  const project = testProject();
  const config = loadConfig({ projectRoot: project, configFile: process.env.CODE_LAYER_LAB_CONFIG });
  const summary = indexSummary(buildIndex({ config, postcss }));
  assert.deepEqual(summary.tokens.byTier, { ref: 82, sys: 120, comp: 102 });
  assert.equal(summary.tokens.readonlyNames, 44);
  assert.equal(summary.tokens.shadowed, 4);
  assert.equal(summary.css.files, 7);
  assert.equal(summary.css.rules, 82);
  assert.equal(summary.css.declarations, 244);
  assert.equal(summary.css.refs, 162);
});
