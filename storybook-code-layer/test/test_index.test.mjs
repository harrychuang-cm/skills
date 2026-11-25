import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { addon, fixtureConfig, loadPostcss, makeWorkspace, testProject } from "./helpers.mjs";

const { buildIndex, indexSummary, serializeIndex } = await addon("server/index-builder.mjs");
const { walkStyleRules } = await addon("server/css-index.mjs");
const { loadConfig, resolveConfig } = await addon("server/config.mjs");
const { rebindTargets } = await addon("shared/candidates.mjs");
const { inferKind, isKeywordValue, kindsCompatible, parseScalar, sameScale } = await addon("server/type-infer.mjs");
const { classifyValue, splitTopLevel } = await addon("shared/value-refs.mjs");
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

test("splitTopLevel: whitespace outside parentheses, strings and comments; commas and slashes stand alone", () => {
  const texts = (value) => splitTopLevel(value).map((p) => p.text);
  assert.deepEqual(texts("var(--a) var(--b)"), ["var(--a)", "var(--b)"]);
  assert.deepEqual(texts("  var(--w)\n    solid\tvar(--c)  "), ["var(--w)", "solid", "var(--c)"], "newlines and tabs separate");
  assert.deepEqual(texts("var(--a) /* gap */ var(--b)"), ["var(--a)", "var(--b)"], "a comment is not a component");
  assert.deepEqual(texts("calc(var(--a) * 3) min(100%, var(--b))"), ["calc(var(--a) * 3)", "min(100%, var(--b))"], "spaces and commas inside functions do not split");
  assert.deepEqual(texts("rotate(calc(-1 * var(--t)))"), ["rotate(calc(-1 * var(--t)))"], "nested functions stay whole");
  assert.deepEqual(texts('"M PLUS Rounded 1c", sans-serif'), ['"M PLUS Rounded 1c"', ",", "sans-serif"], "spaces inside a string do not split");
  assert.deepEqual(texts("var(--a) var(--b) / var(--c)"), ["var(--a)", "var(--b)", "/", "var(--c)"]);
  assert.deepEqual(splitTopLevel("a, b").map((p) => p.separator), [null, ",", null]);
  const parts = splitTopLevel("0 0 var(--gap)");
  assert.deepEqual(parts.map((p) => [p.start, p.end]), [[0, 1], [2, 3], [4, 14]], "offsets address the original text");
  assert.deepEqual(texts(""), []);
});

test("value shapes: the examples of the specification get their shape and reference positions", () => {
  const shapeOf = (value) => {
    const shape = classifyValue(value);
    return { kind: shape.kind, detail: shape.detail ?? null, refs: shape.components.filter((c) => c.shape !== "separator").map((c) => c.refIndex) };
  };
  assert.deepEqual(shapeOf("var(--md-comp-x-color)"), { kind: "single-var", detail: null, refs: [0] });
  assert.deepEqual(shapeOf("var(--a) var(--b)"), { kind: "var-list", detail: null, refs: [0, 1] }, "padding: block sides at reference 0, inline sides at 1");
  assert.deepEqual(shapeOf("var(--w) solid var(--c)"), { kind: "var-list", detail: null, refs: [0, null, 1] }, "border: width 0, style literal, color 1");
  assert.deepEqual(shapeOf("0 0 var(--gap)"), { kind: "var-list", detail: null, refs: [null, null, 0] }, "margin: only the third component is a reference");
  assert.deepEqual(shapeOf("calc(var(--a) * 3)"), { kind: "expression", detail: "function", refs: [0] });
  assert.equal(shapeOf("var(--a, 4px)").kind, "var-with-fallback");
  assert.deepEqual(shapeOf("var(--a), var(--b), sans-serif"), { kind: "expression", detail: "list", refs: [0, 1, null] });
  assert.deepEqual(shapeOf("12px"), { kind: "raw", detail: null, refs: [null] });
  assert.equal(shapeOf("fit-content").kind, "raw");
  assert.ok(isKeywordValue("fit-content"), "the index reports an identifier literal as a keyword");
  // Shapes next to the table: still not re-bindable.
  assert.deepEqual(shapeOf("var(--a) var(--b) / var(--c)"), { kind: "expression", detail: "slash", refs: [0, 1, 2] });
  assert.deepEqual(shapeOf("var(--a) var(--b, 2px)"), { kind: "expression", detail: "fallback", refs: [0, 1] });
  assert.deepEqual(shapeOf("var(--a) calc(var(--b) * 2)"), { kind: "expression", detail: "function", refs: [0, 1] });
  assert.equal(shapeOf("var(--a) var(nope)").kind, "expression", "a var() without a custom property name");
  // A comment or a line break inside a list does not change positions.
  assert.deepEqual(shapeOf("var(--w) /* rule */\n    solid var(--c)"), { kind: "var-list", detail: null, refs: [0, null, 1] });
});

test("keyword literals, scalars and scales", () => {
  assert.ok(isKeywordValue("inline-flex"));
  assert.ok(isKeywordValue("row wrap"));
  assert.ok(!isKeywordValue("12px"));
  assert.ok(!isKeywordValue("red"), "a named color is a literal color, not a keyword");
  assert.ok(!isKeywordValue("1px solid currentcolor"));
  assert.ok(!isKeywordValue("system-ui, sans-serif"));
  assert.deepEqual(parseScalar("4px"), { value: 4, unit: "px" });
  assert.deepEqual(parseScalar("0.06em"), { value: 0.06, unit: "em" });
  assert.deepEqual(parseScalar("700"), { value: 700, unit: "" });
  assert.deepEqual(parseScalar("50%"), { value: 50, unit: "%" });
  assert.deepEqual(parseScalar("0"), { value: 0, unit: "" });
  assert.equal(parseScalar("#FE0B05"), null);
  assert.equal(parseScalar("8deg"), null, "angles are not on a length scale");
  assert.equal(parseScalar("calc(1px + 2px)"), null);
  const scale = (category, family, value, unit) => ({ category, family, value, unit });
  assert.ok(sameScale(scale("shape", "radius", 4, "px"), scale("shape", "radius", 8, "px")));
  assert.ok(sameScale(scale("shape", "radius", 0, ""), scale("shape", "radius", 8, "px")), "zero fits every unit");
  assert.ok(!sameScale(scale("typescale", "font-weight", 700, ""), scale("typescale", "line-height", 1.2, "")), "same category and unit, another reference family");
  assert.ok(!sameScale(scale("spacing", "space", 8, "px"), scale("size", "space", 8, "px")));
  assert.ok(!sameScale(scale("spacing", "space", 8, "px"), scale("spacing", "space", 0.5, "rem")));
  assert.ok(!sameScale(null, scale("shape", "radius", 8, "px")));
});

test("index schema 2: declarations carry components and var-list, tokens carry their scale", async () => {
  const { config } = await makeWorkspace({ fixture: "v1" });
  const json = serializeIndex(buildIndex({ config, postcss }), config);
  assert.equal(json.schemaVersion, 2);
  const seal = json.css.files.find((f) => f.file === "src/components/seal/Seal.css");
  const decl = (selector, property, atRules = 0) => seal.rules.find((r) => r.selector === selector && r.atRules.length === atRules).declarations.filter((d) => d.property === property).at(-1);
  const border = decl(".fx-seal", "border");
  assert.equal(border.shape, "var-list");
  assert.deepEqual(border.components, [
    { text: "var(--fx-comp-seal-rule-width)", shape: "single-var", refIndex: 0, overridden: false },
    { text: "solid", shape: "keyword", refIndex: null, overridden: false },
    { text: "var(--fx-comp-seal-rule-color)", shape: "single-var", refIndex: 1, overridden: false },
  ]);
  const ribbon = seal.rules.find((r) => r.selector === ".fx-seal--ribbon").declarations.filter((d) => d.property === "padding");
  assert.deepEqual(ribbon.map((d) => [d.duplicateInRule, d.overriddenInRule, d.components.map((c) => c.overridden)]), [[true, true, [true, true]], [true, false, [false, false]]]);
  assert.equal(decl(".fx-seal", "padding-block").overriddenInRule, false, "padding-inline after padding-block overrides nothing");
  assert.deepEqual(border.refs.map((r) => [r.refIndex, r.name, r.tier]), [[0, "--fx-comp-seal-rule-width", "comp"], [1, "--fx-comp-seal-rule-color", "comp"]]);
  assert.deepEqual(decl(".fx-seal--stamp", "margin").components.map((c) => [c.text, c.shape, c.refIndex]), [["0", "raw", null], ["0", "raw", null], ["var(--fx-sys-spacing-sm)", "single-var", 0]]);
  assert.deepEqual([decl(".fx-seal--stamp", "inline-size").shape, decl(".fx-seal--stamp", "inline-size").shapeDetail], ["expression", "function"]);
  assert.deepEqual([decl(".fx-seal", "display").shape, decl(".fx-seal--stamp", "border-radius").shape, decl(".fx-seal__label", "font-weight").shape], ["keyword", "raw", "keyword"]);
  assert.equal(decl(".fx-seal--stamp", "opacity").important, true);
  assert.equal(decl(".fx-seal", "background").components.length, 1);
  const title = json.css.files.find((f) => f.file === "src/components/title/Title.css");
  const plate = title.rules.find((r) => r.selector === ".fx-title__plate").declarations;
  assert.deepEqual(plate.map((d) => [d.property, d.shape, d.shapeDetail]), [
    ["background", "single-var", null],
    ["color", "single-var", null],
    ["border-block-start", "var-list", null],
    ["border-radius", "expression", "slash"],
    ["font-family", "expression", "list"],
    ["outline", "raw", null],
  ]);
  assert.equal(title.rules[0].declarations.find((d) => d.property === "margin-block-end").shape, "var-with-fallback");

  const token = (name) => json.tokens.items.find((t) => t.name === name);
  assert.deepEqual(token("--fx-sys-shape-corner-sm").scale, { category: "shape", family: "radius", value: 4, unit: "px" });
  assert.deepEqual(token("--fx-sys-shape-corner-none").scale, { category: "shape", family: "radius", value: 0, unit: "" });
  assert.deepEqual(token("--fx-comp-seal-shape").scale, { category: "seal", family: "radius", value: 4, unit: "px" }, "a component token keeps the family of the reference it resolves to");
  assert.deepEqual(token("--fx-sys-typescale-display-weight").scale, { category: "typescale", family: "font-weight", value: 700, unit: "" });
  assert.deepEqual(token("--fx-sys-typescale-display-line-height").scale, { category: "typescale", family: "line-height", value: 1.2, unit: "" });
  assert.equal(token("--fx-sys-color-primary").scale, null);
  assert.equal(token("--fx-sys-typescale-display-family").scale, null);
  const corners = json.tokens.items.filter((t) => t.tier === "sys" && sameScale(t.scale, token("--fx-sys-shape-corner-sm").scale)).sort((a, b) => a.scale.value - b.scale.value);
  assert.deepEqual(corners.map((t) => t.resolvedValue), ["0", "2px", "4px", "8px", "16px"], "the corner scale of the specification example");
});

test("binding: a proof-phase configuration resolves as before; the v1 keys are optional and validated", () => {
  const projectRoot = "/ws/sb";
  const resolve = (overrides = {}) => resolveConfig(fixtureConfig(overrides), { projectRoot, configFile: "/ws/sb/.storybook/code-layer/code-layer.config.json" });
  const config = resolve();
  // Everything a 0.1.0 binding produced is still there, unchanged.
  assert.deepEqual(
    { projectId: config.projectId, apiPath: config.apiPath, workspaceRoot: config.workspaceRoot, stateDir: config.stateDir, tokens: config.tokens, components: config.components, checks: config.checks, limits: config.limits },
    {
      projectId: "fixture",
      apiPath: "/__code-layer",
      workspaceRoot: "/ws",
      stateDir: "/ws/.code-layer",
      tokens: {
        prefix: "t",
        entry: { source: "/ws/tokens/tokens.css", mirror: "/ws/sb/tokens/tokens.css" },
        tiers: [
          { tier: "ref", source: "/ws/tokens/tokens-ref.css", mirror: "/ws/sb/tokens/tokens-ref.css", writable: false },
          { tier: "sys", source: "/ws/tokens/tokens-sys.css", mirror: "/ws/sb/tokens/tokens-sys.css", writable: false },
          { tier: "comp", source: "/ws/tokens/tokens-comp.css", mirror: "/ws/sb/tokens/tokens-comp.css", writable: true },
        ],
        readonlySources: ["/ws/sb/src/styles/chrome.css"],
      },
      components: { roots: ["/ws/sb/src/components"], classPrefixes: ["t-"] },
      checks: [],
      limits: { maxOperations: 50, maxApplyBodyBytes: 262144, maxOtherBodyBytes: 16384, maxStringLength: 512 },
    },
  );
  // The v1 keys default to "off".
  assert.equal(config.locale, null);
  assert.deepEqual(config.governance, { componentSpecsDir: null, pairing: { containerSuffix: "-container-color", contentSuffix: "-text-color" }, proseScan: true });
  assert.deepEqual(config.postApply, []);

  const tiers = (writable) => ["ref", "sys", "comp"].map((tier) => ({ tier, source: `../tokens/tokens-${tier}.css`, mirror: `tokens/tokens-${tier}.css`, writable: writable.includes(tier) }));
  const withTiers = (writable) => resolve({ tokens: { ...fixtureConfig().tokens, tiers: tiers(writable) } });
  assert.deepEqual(withTiers(["sys", "comp"]).tokens.tiers.map((t) => t.writable), [false, true, true], "the system tier can be opened");
  assert.throws(() => withTiers(["ref"]), /ref tier cannot be writable/);

  const v1 = resolve({
    locale: "en",
    governance: { componentSpecsDir: "../design-system/components", pairing: { containerSuffix: "-fill", contentSuffix: "-ink" }, proseScan: false },
    postApply: [{ id: "docs", command: "node", args: ["gen.mjs", 1], writes: ["../docs/design-system"] }],
  });
  assert.equal(v1.locale, "en");
  assert.deepEqual(v1.governance, { componentSpecsDir: "/ws/design-system/components", pairing: { containerSuffix: "-fill", contentSuffix: "-ink" }, proseScan: false });
  assert.deepEqual(v1.postApply, [{ id: "docs", command: "node", args: ["gen.mjs", "1"], cwd: "/ws/sb", timeoutMs: 120000, writes: ["/ws/docs/design-system"] }]);

  assert.throws(() => resolve({ postApply: [{ id: "docs", command: "node", args: [] }] }), /writes is required/);
  assert.throws(() => resolve({ postApply: [{ id: "docs", command: "node", writes: [], shell: true }] }), /unknown key "shell"/);
  assert.throws(() => resolve({ postApply: [{ id: "a", command: "node", writes: [] }, { id: "a", command: "node", writes: [] }] }), /duplicated/);
  assert.throws(() => resolve({ locale: "fr" }), /config\.locale/);
  assert.throws(() => resolve({ governance: { specs: "x" } }), /unknown key "specs"/);
  assert.throws(() => resolve({ governance: { pairing: { containerSuffix: "container" } } }), /must start with "-"/);
  assert.throws(() => resolve({ governance: { proseScan: "yes" } }), /proseScan must be boolean/);
  assert.throws(() => resolve({ agent: {} }), /unknown key "agent"/, "an unknown key is still an error");
});

test("index: the governance summary lists the bound specifications; names outside the binding never become tokens", async () => {
  const { config } = await makeWorkspace({
    fixture: "v1",
    config: { governance: { componentSpecsDir: "../design-system/components" } },
    files: {
      // Named like a system token, declared only in a stylesheet the binding does not list.
      "sb/src/legacy/ghost.css": ":root {\n  --fx-sys-color-ghost: #123456;\n}\n",
      "sb/src/components/seal/Extra.css": ".fx-seal--ghost {\n  color: var(--fx-sys-color-ghost);\n  outline-color: var(--fx-sys-chrome-only);\n}\n",
    },
  });
  const index = buildIndex({ config, postcss });
  const json = serializeIndex(index, config);
  assert.equal(json.governance.componentSpecsDir, "design-system/components");
  assert.deepEqual(json.governance.specs, [
    { componentId: "seal", file: "design-system/components/seal.md" },
    { componentId: "title", file: "design-system/components/title.md" },
  ]);
  assert.deepEqual(json.governance.pairing, { containerSuffix: "-container-color", contentSuffix: "-text-color" });
  assert.ok(!JSON.stringify(json.governance).includes(config.workspaceRoot), "no absolute path is exposed");

  assert.equal(index.tokenIndex.tokens.has("--fx-sys-color-ghost"), false, "the name pattern alone does not make a token");
  const extra = json.css.files.find((f) => f.file === "src/components/seal/Extra.css").rules[0].declarations;
  assert.deepEqual(extra[0].refs, [{ name: "--fx-sys-color-ghost", refIndex: 0, known: false, tier: null, source: null }]);
  assert.equal(extra[1].refs[0].source, "readonly");
  const targets = rebindTargets(json.tokens.items).map((t) => t.name);
  assert.equal(targets.length, 83, "exactly the tokens declared in the three tier files");
  assert.ok(!targets.includes("--fx-sys-color-ghost"));
  assert.ok(!targets.includes("--fx-sys-chrome-only"), "a name declared only in a read-only source is not a target");

  const none = await makeWorkspace({ fixture: "v1" });
  assert.deepEqual(serializeIndex(buildIndex({ config: none.config, postcss }), none.config).governance.specs, [], "no directory bound, no specification listed");
});

test("lab (optional): numbers match the plan when CODE_LAYER_LAB_CONFIG is set", { skip: !process.env.CODE_LAYER_LAB_CONFIG }, () => {
  const project = testProject();
  const config = loadConfig({ projectRoot: project, configFile: process.env.CODE_LAYER_LAB_CONFIG });
  const index = buildIndex({ config, postcss });
  const summary = indexSummary(index);
  assert.deepEqual(summary.tokens.byTier, { ref: 82, sys: 120, comp: 102 });
  assert.equal(summary.tokens.readonlyNames, 44);
  assert.equal(summary.tokens.shadowed, 4);
  assert.equal(summary.css.files, 7);
  assert.equal(summary.css.rules, 82);
  assert.equal(summary.css.declarations, 244);
  assert.equal(summary.css.refs, 162);

  // Schema 2 re-classification of the 244 declarations. Before it: single-var 143,
  // expression 15 (the survey's 4 multi-var and 2 var-plus-literal among them).
  const decls = serializeIndex(index, config).css.files.flatMap((f) => f.rules.flatMap((r) => r.declarations.map((d) => ({ ...d, file: f.file.split("/").at(-1), selector: r.selector }))));
  const by = (shape) => decls.filter((d) => d.shape === shape);
  assert.equal(by("single-var").length, 143, "unchanged: 142 in the panel's property scope plus one box-shadow");
  assert.deepEqual(
    by("var-list").map((d) => `${d.file} ${d.property}: ${d.value}`),
    [
      "CornerBrandPlate.css outline: var(--md-sys-border-seal) solid var(--md-sys-color-ink)",
      "ExampleCard.css border: var(--md-sys-spacing-hairline) solid var(--md-sys-color-outline)",
      "ExampleCard.css padding: var(--md-sys-spacing-xxs) var(--md-sys-spacing-xs)",
      "FootnoteLegalBlock.css border-block-start: var(--md-comp-footnote-legal-block-rule-width) solid var(--md-comp-footnote-legal-block-rule-color)",
      "HeroTitleLockup.css margin: 0 0 var(--md-comp-hero-title-lockup-kicker-gap)",
      "HeroTitleLockup.css margin: var(--md-comp-hero-title-lockup-subhead-gap) 0 0",
    ],
    "the four multi-var and the two var-plus-literal declarations of the survey",
  );
  assert.equal(by("expression").length, 9, "three calc(), one min() and five rotate(calc()) transforms");
  assert.ok(by("expression").every((d) => d.shapeDetail === "function"));
  assert.equal(by("var-with-fallback").length, 0);
  assert.equal(by("raw").length + by("keyword").length, 86, "the 84 literals and 2 CSS-wide keywords of schema 1, now split by isKeywordValue");
});
