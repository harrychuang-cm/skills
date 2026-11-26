// Layout editing: the fixed keyword lists, which rules can take a new
// declaration, the two layout operations with their refusals, the byte proofs
// for a replaced keyword and an inserted declaration, undo and reverse apply,
// and the documents a layout change leaves pending.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { addon, loadPostcss, makeWorkspace, testProject } from "./helpers.mjs";

const { createEngine } = await addon("server/transaction.mjs");
const { appendability, buildCssIndex, walkStyleRules } = await addon("server/css-index.mjs");
const { readCssSource } = await addon("server/css-source.mjs");
const { patchFile } = await addon("server/patcher.mjs");
const layout = await addon("shared/layout.mjs");
const { affectedSlots, sidesOf } = await addon("shared/sides.mjs");
const { replaceComponent } = await addon("shared/value-refs.mjs");
const postcss = await loadPostcss();
const quiet = { info() {}, warn() {}, error() {} };

const BOX = "sb/src/components/box/Box.css";
const BOX_FILE = "src/components/box/Box.css";
const BOX_CSS = [
  "/* box — 版面 */",
  ".t-box {",
  "  display: flex;",
  "  justify-content: center;",
  "  gap: 4px;",
  "}",
  ".t-box--flow {",
  "  display: inline-flex;",
  "  flex-flow: column /* stacked */ wrap;",
  "}",
  ".t-box--start {",
  "  display: flex;",
  "  align-items: start;",
  "}",
  ".t-box--plain {",
  "  color: red;",
  "}",
  ".t-box--place {",
  "  display: flex;",
  "  place-items: center;",
  "}",
  ".t-box--nosemi {",
  "  display: flex;",
  "  gap: 4px",
  "}",
  ".t-box--var {",
  "  display: flex;",
  "  justify-content: var(--t-sys-shape-corner-sm);",
  "}",
  "",
].join("\n");
const RULES = { box: [0, ".t-box"], flow: [1, ".t-box--flow"], start: [2, ".t-box--start"], plain: [3, ".t-box--plain"], place: [4, ".t-box--place"], nosemi: [5, ".t-box--nosemi"], variable: [6, ".t-box--var"] };

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const facts = (file) => {
  const s = fs.statSync(file);
  return { hash: sha(file), ino: s.ino, mtimeMs: s.mtimeMs };
};
const ruleOf = (name) => ({ ordinal: RULES[name][0], selector: RULES[name][1], atRules: [], occurrence: 0 });

function setOp(rule, property, component, from, to, before, after, id = "op-1") {
  return { id, type: "set-keyword", file: BOX_FILE, rule: ruleOf(rule), declaration: { property }, component, fromKeyword: from, toKeyword: to, before: { value: before }, after: { value: after } };
}
function addOp(rule, property, keyword, id = "op-1") {
  return { id, type: "add-declaration", file: BOX_FILE, rule: ruleOf(rule), declaration: { property }, toKeyword: keyword, after: { value: keyword } };
}

let counter = 0;
const batch = (operations) => ({ schemaVersion: 1, batchId: `layout-${(counter += 1)}`, indexRevision: "sha256:test", operations });

async function workspace(css = BOX_CSS) {
  const made = await makeWorkspace({ files: { [BOX]: css } });
  return { ...made, css: path.join(made.ws, BOX), engine: createEngine({ config: made.config, postcss, log: quiet }) };
}

// ---- the fixed lists ----------------------------------------------------------------

test("layout keywords: exactly the lists of the specification, and display is not one of the properties", () => {
  assert.deepEqual(layout.LAYOUT_OPTIONS, {
    "flex-direction": ["row", "column", "row-reverse", "column-reverse"],
    "flex-wrap": ["nowrap", "wrap"],
    "align-items": ["flex-start", "center", "flex-end", "stretch", "baseline"],
    "justify-content": ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
  });
  assert.equal(layout.isLayoutProperty("display"), false);
  assert.equal(layout.isLayoutKeyword("align-items", "start"), false);
  assert.equal(layout.isLayoutKeyword("flex-wrap", "wrap-reverse"), false);
  assert.deepEqual([layout.isFlexDisplay("flex"), layout.isFlexDisplay(" Inline-Flex "), layout.isFlexDisplay("grid"), layout.isFlexDisplay("block")], [true, true, false, false]);
  assert.deepEqual(layout.settersOf("flex-wrap"), ["flex-wrap", "flex-flow"]);
  assert.deepEqual(layout.settersOf("align-items"), ["align-items", "place-items"]);
  assert.deepEqual(layout.settersOf("justify-content"), ["justify-content", "place-content"]);
  // The probe's sentinel is another keyword of the list than the one in effect.
  assert.equal(layout.layoutSentinel("flex-direction", "row"), "column");
  assert.equal(layout.layoutSentinel("flex-direction", "column"), "row");
  assert.equal(layout.layoutSentinel("justify-content", "normal"), "flex-start");
  assert.equal(layout.layoutSentinel("color", "red"), null);
});

test("sides: place-items and place-content set a layout slot and cannot be split; flex-flow still splits", () => {
  assert.deepEqual(affectedSlots("place-items"), ["align-items"]);
  assert.deepEqual(affectedSlots("place-content"), ["justify-content"]);
  assert.deepEqual(sidesOf("place-items", ["center"]), { ok: false, reason: "unsupported-shorthand", affected: ["align-items"] });
  assert.deepEqual(sidesOf("place-content", ["center", "start"]), { ok: false, reason: "unsupported-shorthand", affected: ["justify-content"] });
  assert.deepEqual(sidesOf("flex-flow", ["column", "wrap"]).slots, [
    { slot: "flex-direction", component: 0 },
    { slot: "flex-wrap", component: 1 },
  ]);
});

test("the index marks which rules can take a new declaration", () => {
  const mark = (text) => appendability(postcss.parse(text).first);
  assert.deepEqual(mark(".a { display: flex; gap: 4px; }"), { ok: true, reason: null });
  assert.deepEqual(mark(".b { display: flex; gap: 4px }"), { ok: false, reason: "no-trailing-semicolon" });
  assert.deepEqual(mark(".c { }"), { ok: false, reason: "empty-rule" });
  assert.deepEqual(mark(".d { display: flex; .e { color: red; } }"), { ok: false, reason: "nested-content" });
  assert.deepEqual(mark(".f { display: flex; /* layout */ }"), { ok: true, reason: null });
});

test("the index carries the mark for every rule of a component stylesheet", async () => {
  const { config } = await workspace();
  const { buildTokenIndex } = await addon("server/token-index.mjs");
  const tokens = buildTokenIndex({ config, postcss }).tokens;
  const file = buildCssIndex({ config, postcss, tokens }).files.find((f) => f.file === BOX_FILE);
  assert.deepEqual(file.rules.map((rule) => [rule.selector, rule.append.ok, rule.append.reason]), [
    [".t-box", true, null],
    [".t-box--flow", true, null],
    [".t-box--start", true, null],
    [".t-box--plain", true, null],
    [".t-box--place", true, null],
    [".t-box--nosemi", false, "no-trailing-semicolon"],
    [".t-box--var", true, null],
  ]);
});

// ---- the two operations ---------------------------------------------------------------

test("set-keyword replaces one keyword; a dry run writes nothing; a component of flex-flow keeps the comment beside it", async () => {
  const { engine, css } = await workspace();
  const before = facts(css);
  const dry = await engine.apply(batch([setOp("box", "justify-content", 0, "center", "space-between", "center", "space-between")]), { dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.deepEqual(facts(css), before, "a dry run wrote nothing");
  assert.deepEqual(dry.files[0].edits, [{ line: 4, before: "center", after: "space-between" }]);

  const applied = await engine.apply(
    batch([
      setOp("box", "justify-content", 0, "center", "space-between", "center", "space-between", "a"),
      setOp("flow", "flex-flow", 1, "wrap", "nowrap", "column wrap", "column nowrap", "b"),
      setOp("flow", "flex-flow", 0, "column", "row", "column wrap", "row wrap", "c"),
    ]),
  );
  assert.equal(
    fs.readFileSync(css, "utf8"),
    BOX_CSS.replace("justify-content: center;", "justify-content: space-between;").replace("flex-flow: column /* stacked */ wrap;", "flex-flow: row /* stacked */ nowrap;"),
    "only the keywords changed; the comment between them is where it was",
  );
  assert.deepEqual(applied.results.map((r) => [r.id, r.type, r.slot, r.component, r.fromKeyword, r.toKeyword, r.before, r.after]), [
    ["a", "set-keyword", "justify-content", 0, "center", "space-between", "center", "space-between"],
    ["b", "set-keyword", "flex-wrap", 1, "wrap", "nowrap", "column wrap", "column nowrap"],
    ["c", "set-keyword", "flex-direction", 0, "column", "row", "column wrap", "row wrap"],
  ]);
  assert.deepEqual(applied.expect.css.map((c) => c.file), [BOX_FILE], "the page is told which stylesheet to wait for");
  assert.deepEqual(applied.expect.tokens, []);
});

test("add-declaration appends one line to the rule that declares flex, in the file's own formatting", async () => {
  const { engine, css } = await workspace();
  const applied = await engine.apply(batch([addOp("box", "flex-wrap", "wrap")]));
  assert.equal(fs.readFileSync(css, "utf8"), BOX_CSS.replace("  gap: 4px;\n}", "  gap: 4px;\n  flex-wrap: wrap;\n}"));
  assert.deepEqual(
    applied.results.map((r) => [r.type, r.slot, r.fromKeyword, r.toKeyword, r.before, r.after, r.line, r.inserted]),
    [["add-declaration", "flex-wrap", null, "wrap", null, "wrap", 6, "\n  flex-wrap: wrap;"]],
  );
  assert.deepEqual(applied.files[0].edits, [{ line: 2, before: "", after: "\n  flex-wrap: wrap;" }]);
});

test("every refusal of a layout operation names its code and changes nothing", async () => {
  const { engine, css } = await workspace();
  const before = facts(css);
  const refused = async (operations, code, check = () => true) => {
    await assert.rejects(engine.apply(batch(operations)), (error) => {
      assert.equal(error.code, code, error.message);
      assert.ok(check(error), `details of ${code}: ${JSON.stringify(error.details)}`);
      return true;
    });
    assert.deepEqual(facts(css), before, `${code}: nothing was written`);
  };
  // A keyword outside the fixed list: a valid CSS value that is not offered, a second keyword, a color.
  await refused([setOp("start", "align-items", 0, "start", "safe center", "start", "safe center")], "keyword-not-allowed");
  await refused([setOp("box", "justify-content", 0, "center", "red", "center", "red")], "keyword-not-allowed");
  await refused([setOp("box", "justify-content", 0, "center", "start", "center", "start")], "keyword-not-allowed");
  await refused([addOp("box", "flex-wrap", "wrap-reverse")], "keyword-not-allowed");
  // Not a layout property, or not a single keyword.
  await refused([setOp("box", "display", 0, "flex", "grid", "flex", "grid")], "unsupported-value-shape");
  await refused([setOp("box", "gap", 0, "4px", "center", "4px", "center")], "schema-invalid");
  await refused([setOp("variable", "justify-content", 0, "center", "flex-end", "var(--t-sys-shape-corner-sm)", "flex-end")], "unsupported-value-shape");
  await refused([addOp("box", "color", "red")], "unsupported-value-shape");
  // The rule of an added declaration.
  await refused([addOp("plain", "justify-content", "center")], "rule-not-eligible", (e) => e.details.reason === "not-flex");
  await refused([addOp("box", "justify-content", "flex-end")], "rule-not-eligible", (e) => e.details.reason === "already-declared" && e.details.declaration === "justify-content");
  await refused([addOp("flow", "flex-wrap", "wrap")], "rule-not-eligible", (e) => e.details.declaration === "flex-flow");
  await refused([addOp("flow", "flex-direction", "row")], "rule-not-eligible", (e) => e.details.declaration === "flex-flow");
  await refused([addOp("place", "align-items", "center")], "rule-not-eligible", (e) => e.details.declaration === "place-items");
  await refused([addOp("nosemi", "flex-wrap", "wrap")], "rule-not-eligible", (e) => e.details.reason === "no-trailing-semicolon");
  await refused([addOp("box", "flex-wrap", "wrap", "a"), addOp("box", "flex-wrap", "nowrap", "b")], "duplicate-target");
  await refused([setOp("box", "justify-content", 0, "center", "flex-end", "center", "flex-end", "a"), setOp("box", "justify-content", 0, "center", "flex-start", "center", "flex-start", "b")], "duplicate-target");
  // What the request states about the file.
  await refused([setOp("box", "justify-content", 0, "flex-start", "center", "flex-start", "center")], "stale-before");
  await refused([setOp("box", "justify-content", 0, "center", "center", "center", "center")], "no-op");
  await refused([setOp("box", "justify-content", 0, "center", "flex-end", "center", "flex-start")], "after-value-mismatch");
  await refused([{ ...addOp("box", "flex-wrap", "wrap"), after: { value: "nowrap" } }], "after-value-mismatch");
  await refused([setOp("box", "justify-content", 0, "center", "flex-end", "center", "flex-end").rule.selector === ".t-box" ? { ...setOp("box", "justify-content", 0, "center", "flex-end", "center", "flex-end"), rule: { ...ruleOf("box"), selector: ".t-other" } } : null], "locator-mismatch");
  // The operation that removes a declaration is the server's own: a request cannot send it.
  await refused([{ id: "op-1", type: "remove-declaration", file: BOX_FILE, rule: ruleOf("box"), declaration: { property: "gap" }, fromKeyword: "x", inserted: "\n  gap: 4px;" }], "schema-invalid");
  await refused([{ ...addOp("box", "flex-wrap", "wrap"), inserted: "\n  color: red;" }], "schema-invalid");
});

// ---- byte proofs ------------------------------------------------------------------------

/** Patch a stylesheet text in memory. */
function patch(text, build, { bom = false } = {}) {
  const bytes = Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(text, "utf8")]);
  const source = { bytes, text, hasBom: bom };
  const root = postcss.parse(text);
  const rules = [];
  walkStyleRules(root, (rule) => rules.push(rule));
  return { ...patchFile(postcss, source, root, build(rules)), source };
}
const insert = (rule, property, value, opId = "x") => ({ kind: "insert", rule, property, value, opId });

test("an added declaration follows the file's formatting: CRLF and tabs, one-line rules, a trailing comment, a byte order mark", () => {
  const crlf = ".a {\r\n\tdisplay: flex;\r\n\tgap: 4px;\r\n}\r\n";
  assert.equal(patch(crlf, (r) => [insert(r[0], "flex-wrap", "wrap")]).newText, ".a {\r\n\tdisplay: flex;\r\n\tgap: 4px;\r\n\tflex-wrap: wrap;\r\n}\r\n");
  const oneLine = ".a { display: flex; gap: 4px; }\n.b { color: red; }\n";
  assert.equal(patch(oneLine, (r) => [insert(r[0], "flex-wrap", "wrap")]).newText, ".a { display: flex; gap: 4px; flex-wrap: wrap; }\n.b { color: red; }\n");
  const comment = ".a {\n  display: flex; /* layout */\n}\n";
  assert.equal(patch(comment, (r) => [insert(r[0], "align-items", "center")]).newText, ".a {\n  display: flex; /* layout */\n  align-items: center;\n}\n");
  const ownLine = ".a {\n  display: flex;\n  /* end */\n}\n";
  assert.equal(patch(ownLine, (r) => [insert(r[0], "align-items", "center")]).newText, ".a {\n  display: flex;\n  /* end */\n  align-items: center;\n}\n");
  const withBom = patch("/* ō */\n.a {\n  display: flex;\n}\n", (r) => [insert(r[0], "flex-direction", "column")], { bom: true });
  assert.deepEqual([...withBom.newBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(withBom.newText, "/* ō */\n.a {\n  display: flex;\n  flex-direction: column;\n}\n");
  // Two declarations added to one rule keep the order they were asked in; other rules are untouched.
  const two = patch(".a {\n  display: flex;\n}\n.b {\n  display: flex;\n}\n", (r) => [insert(r[0], "flex-wrap", "wrap", "1"), insert(r[0], "align-items", "center", "2")]);
  assert.equal(two.newText, ".a {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n}\n.b {\n  display: flex;\n}\n");
});

test("the proofs refuse an edit that would change the structure, and a rule that cannot take a declaration", () => {
  const text = ".a {\n  display: flex;\n}\n";
  assert.throws(() => patch(text, (r) => [insert(r[0], "flex-wrap", "wrap; } .x { color: red")]), (e) => e.code === "unsupported-value-shape");
  assert.throws(() => patch(text, (r) => [insert(r[0], "flex-wrap; color", "wrap")]), (e) => e.code === "unsupported-value-shape");
  assert.throws(() => patch(".a {\n  display: flex\n}\n", (r) => [insert(r[0], "flex-wrap", "wrap")]), (e) => e.code === "unsupported-value-shape");
  assert.throws(() => patch(".a { }\n", (r) => [insert(r[0], "flex-wrap", "wrap")]), (e) => e.code === "unsupported-value-shape");
  // A component edit whose keyword is not an identifier never reaches the file.
  assert.throws(
    () => patch(".a {\n  align-items: center;\n}\n", (r) => [{ kind: "component", decl: r[0].nodes[0], component: 0, fromText: "center", toText: "start; color: red", opId: "x" }]),
    (e) => e.code === "unsupported-value-shape",
  );
  // The component must hold what the edit says it holds.
  assert.throws(
    () => patch(".a {\n  align-items: center;\n}\n", (r) => [{ kind: "component", decl: r[0].nodes[0], component: 0, fromText: "start", toText: "center", opId: "x" }]),
    (e) => e.code === "locator-mismatch",
  );
});

test("a name edit, a keyword edit and an insert in one file are proven together", async () => {
  const { engine, css } = await workspace();
  await engine.apply(
    batch([
      {
        id: "token",
        type: "rebind-declaration",
        file: BOX_FILE,
        rule: ruleOf("variable"),
        declaration: { property: "justify-content" },
        replacements: [{ refIndex: 0, fromToken: "--t-sys-shape-corner-sm", toToken: "--t-sys-shape-corner-md" }],
        fromToken: "--t-sys-shape-corner-sm",
        toToken: "--t-sys-shape-corner-md",
        before: { value: "var(--t-sys-shape-corner-sm)" },
        after: { value: "var(--t-sys-shape-corner-md)" },
      },
      setOp("start", "align-items", 0, "start", "center", "start", "center", "keyword"),
      addOp("box", "flex-direction", "column", "added"),
      addOp("box", "flex-wrap", "wrap", "added-2"),
    ]),
  );
  assert.equal(
    fs.readFileSync(css, "utf8"),
    BOX_CSS.replace("  gap: 4px;\n}\n.t-box--flow", "  gap: 4px;\n  flex-direction: column;\n  flex-wrap: wrap;\n}\n.t-box--flow")
      .replace("align-items: start;", "align-items: center;")
      .replace("var(--t-sys-shape-corner-sm)", "var(--t-sys-shape-corner-md)"),
  );
});

test("the lab's component stylesheets: every layout keyword and every flex rule round-trips to the same bytes (read only)", () => {
  const root = path.join(testProject(), "src", "components");
  if (!fs.existsSync(root)) return;
  let keywords = 0;
  let additions = 0;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith(".css")) check(full);
    }
  };
  const rulesOf = (text) => {
    const parsed = postcss.parse(text);
    const rules = [];
    walkStyleRules(parsed, (rule) => rules.push(rule));
    return { parsed, rules };
  };
  const check = (file) => {
    const source = readCssSource(file);
    assert.ok(source.ok, file);
    const { parsed, rules } = rulesOf(source.text);
    rules.forEach((rule, ordinal) => {
      const decls = (rule.nodes ?? []).filter((node) => node.type === "decl");
      for (const decl of decls) {
        if (!layout.isLayoutProperty(decl.prop) || !layout.KEYWORD_PATTERN.test(decl.value)) continue;
        const other = layout.layoutSentinel(decl.prop, decl.value);
        const there = patchFile(postcss, source, parsed, [{ kind: "component", decl, component: 0, fromText: decl.value, toText: other, opId: "x" }]);
        assert.notEqual(there.newText, source.text);
        const second = rulesOf(there.newText);
        const back = patchFile(postcss, { bytes: there.newBytes, text: there.newText, hasBom: source.hasBom }, second.parsed, [
          { kind: "component", decl: second.rules[ordinal].nodes.filter((node) => node.type === "decl")[decls.indexOf(decl)], component: 0, fromText: other, toText: decl.value, opId: "x" },
        ]);
        assert.ok(back.newBytes.equals(source.bytes), `${file}: ${decl.prop} of ${rule.selector}`);
        keywords += 1;
      }
      const display = decls.filter((decl) => decl.prop === "display").at(-1);
      if (!display || !layout.isFlexDisplay(display.value) || !appendability(rule).ok) return;
      const property = layout.LAYOUT_PROPERTIES.find((name) => !decls.some((decl) => layout.settersOf(name).includes(decl.prop)));
      if (!property) return;
      const added = patchFile(postcss, source, parsed, [insert(rule, property, layout.LAYOUT_OPTIONS[property][1])]);
      const second = rulesOf(added.newText);
      const last = second.rules[ordinal].nodes.filter((node) => node.type === "decl").at(-1);
      assert.equal(last.prop, property);
      const removed = patchFile(postcss, { bytes: added.newBytes, text: added.newText, hasBom: source.hasBom }, second.parsed, [{ kind: "remove", decl: last, inserted: added.spans[0].toName, opId: "x" }]);
      assert.ok(removed.newBytes.equals(source.bytes), `${file}: adding to ${rule.selector}`);
      additions += 1;
    });
  };
  visit(root);
  assert.ok(keywords > 0 && additions > 0, `layout keywords ${keywords}, flex rules ${additions}`);
});

// ---- undo and reverse apply ---------------------------------------------------------------

test("undo restores the exact bytes after layout operations", async () => {
  const { engine, css } = await workspace();
  const applied = await engine.apply(batch([setOp("box", "justify-content", 0, "center", "flex-end", "center", "flex-end", "a"), addOp("box", "flex-wrap", "wrap", "b")]));
  assert.notEqual(fs.readFileSync(css, "utf8"), BOX_CSS);
  assert.deepEqual(engine.state().undoStack.map((entry) => entry.applyId), [applied.applyId]);
  await engine.undo({ applyId: applied.applyId });
  assert.equal(fs.readFileSync(css, "utf8"), BOX_CSS);
  assert.deepEqual(engine.state().undoStack, []);
});

test("reverse apply puts back a keyword that was outside the list and removes an added line, keeping a later edit", async () => {
  const { engine, css } = await workspace();
  const applied = await engine.apply(batch([setOp("start", "align-items", 0, "start", "center", "start", "center", "a"), addOp("box", "flex-wrap", "wrap", "b"), addOp("start", "justify-content", "space-between", "c")]));
  const journaled = engine.journal.transactions().get(applied.applyId).pending.operations;
  assert.deepEqual(journaled.map((o) => [o.type, o.property, o.component, o.fromKeyword, o.toKeyword, o.inserted ?? null]), [
    ["set-keyword", "align-items", 0, "start", "center", null],
    ["add-declaration", "flex-wrap", null, null, "wrap", "\n  flex-wrap: wrap;"],
    ["add-declaration", "justify-content", null, null, "space-between", "\n  justify-content: space-between;"],
  ]);
  // A person edits another line of the same file.
  fs.writeFileSync(css, fs.readFileSync(css, "utf8").replace("  color: red;", "  color: blue;"));
  const edited = facts(css);
  await assert.rejects(engine.undo({ applyId: applied.applyId }), (e) => e.code === "undo-conflict" && e.details.canReverse === true);
  assert.deepEqual(facts(css), edited, "the refused undo wrote nothing");

  const reversed = await engine.reverse({ applyId: applied.applyId });
  assert.equal(reversed.mode, "reverse");
  assert.equal(fs.readFileSync(css, "utf8"), BOX_CSS.replace("  color: red;", "  color: blue;"), "the keyword is `start` again, both added lines are gone, the person's edit is kept");
  assert.deepEqual(engine.state().undoStack, []);
});

test("a reverse apply is refused when what the apply wrote is no longer there", async () => {
  const { engine, css } = await workspace();
  const added = await engine.apply(batch([addOp("box", "flex-wrap", "wrap")]));
  // The added declaration was changed by hand, and so was another line (so the exact undo is not possible either).
  fs.writeFileSync(css, fs.readFileSync(css, "utf8").replace("flex-wrap: wrap;", "flex-wrap: nowrap;").replace("  color: red;", "  color: blue;"));
  const edited = facts(css);
  await assert.rejects(engine.reverse({ applyId: added.applyId }), (e) => e.code === "stale-before");
  assert.deepEqual(facts(css), edited);

  const second = await workspace();
  const set = await second.engine.apply(batch([setOp("box", "justify-content", 0, "center", "flex-end", "center", "flex-end")]));
  fs.writeFileSync(second.css, fs.readFileSync(second.css, "utf8").replace("justify-content: flex-end;", "justify-content: space-around;"));
  await assert.rejects(second.engine.reverse({ applyId: set.applyId }), (e) => e.code === "stale-before");

  // The line was added, then re-indented by hand: the bytes around it are no longer what was inserted.
  const third = await workspace();
  const again = await third.engine.apply(batch([addOp("box", "flex-wrap", "wrap")]));
  fs.writeFileSync(third.css, fs.readFileSync(third.css, "utf8").replace("\n  flex-wrap: wrap;", "\n      flex-wrap: wrap;"));
  const reindented = facts(third.css);
  await assert.rejects(third.engine.reverse({ applyId: again.applyId }), (e) => e.code === "stale-before");
  assert.deepEqual(facts(third.css), reindented);
});

// ---- documents pending sync -----------------------------------------------------------------

test("a layout change leaves one pending entry for its declaration, never a prose search, and undo clears it", async () => {
  const { engine, ws } = await workspace();
  fs.mkdirSync(path.join(ws, "sb/src/components/box"), { recursive: true });
  fs.writeFileSync(path.join(ws, "sb/src/components/box/Box.tsx"), "// children are centered; center them again here; row and wrap\n");
  const applied = await engine.apply(batch([setOp("box", "justify-content", 0, "center", "space-between", "center", "space-between", "a"), addOp("box", "flex-wrap", "wrap", "b")]));
  assert.deepEqual(
    applied.pending.map((e) => [e.operation, e.kind, e.reason, e.property, e.oldToken, e.newToken, e.oldValue, e.newValue, e.file, e.line]),
    [
      ["a", "declaration", "declaration-not-documented", "justify-content", null, null, "center", "space-between", "sb/src/components/box/Box.css", 4],
      ["b", "declaration", "declaration-not-documented", "flex-wrap", null, null, null, "wrap", "sb/src/components/box/Box.css", 6],
    ],
  );
  assert.equal(engine.state().pendingDocs.length, 2);
  await engine.undo({ applyId: applied.applyId });
  assert.equal(engine.state().pendingDocs.length, 0);
});

test("replaceComponent addresses a component by position and keeps what surrounds it", () => {
  assert.equal(replaceComponent("column /* stacked */ wrap", 1, "wrap", "nowrap"), "column /* stacked */ nowrap");
  assert.equal(replaceComponent("column wrap", 0, "column", "row"), "row wrap");
  assert.throws(() => replaceComponent("column wrap", 0, "row", "column"), (e) => e.code === "locator-mismatch");
  assert.throws(() => replaceComponent("column wrap", 2, "wrap", "nowrap"), (e) => e.code === "locator-mismatch");
});
