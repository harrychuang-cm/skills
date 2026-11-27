import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { addon, loadPostcss, testProject } from "./helpers.mjs";

const { readCssSource, decodeCss } = await addon("server/css-source.mjs");
const { patchFile, PatchError } = await addon("server/patcher.mjs");
const { findVarRefs, classifyValue, normalizeValue, replaceVarName, scanDeclarations, findRootDeclaration } =
  await addon("shared/value-refs.mjs");
const postcss = await loadPostcss();

function sourceFromBytes(bytes) {
  const decoded = decodeCss(bytes);
  assert.ok(decoded.ok, `fixture must decode: ${decoded.reason}`);
  return { bytes, text: decoded.text, hasBom: decoded.hasBom };
}

function findDecl(root, prop, selector) {
  let found = null;
  root.walkDecls(prop, (decl) => {
    if (!selector || decl.parent.selector === selector) found = decl;
  });
  assert.ok(found, `declaration ${prop} not found`);
  return found;
}

function patch(bytes, specs) {
  const source = sourceFromBytes(bytes);
  const root = postcss.parse(source.text);
  const edits = specs.map((s) => ({
    decl: findDecl(root, s.prop, s.selector),
    refIndex: s.refIndex ?? 0,
    fromName: s.from,
    toName: s.to,
    opId: s.prop,
  }));
  return patchFile(postcss, source, root, edits);
}

function onlyDiff(oldBytes, newBytes, fromName, toName) {
  const oldText = oldBytes.toString("utf8");
  const newText = newBytes.toString("utf8");
  const index = oldText.indexOf(fromName);
  assert.equal(newText.slice(0, index), oldText.slice(0, index));
  assert.equal(newText.slice(index + toName.length), oldText.slice(index + fromName.length));
}

test("value-refs: classify value shapes", () => {
  const brief = (value) => {
    const { components, ...shape } = classifyValue(value);
    return shape;
  };
  assert.deepEqual(brief("var(--a)"), { kind: "single-var", name: "--a" });
  assert.deepEqual(brief("  var( /*x*/ --a ) "), { kind: "single-var", name: "--a" });
  assert.equal(classifyValue("var(--a, 4px)").kind, "var-with-fallback");
  assert.equal(classifyValue("var(--a, var(--b))").kind, "var-with-fallback");
  assert.equal(classifyValue("calc(var(--a) * 3)").kind, "expression");
  assert.equal(classifyValue("var(--a) var(--b)").kind, "var-list", "a var() list is re-bindable per reference since schema 2");
  assert.equal(classifyValue("var(--a) 2px").kind, "var-list");
  assert.equal(classifyValue("var(--a)2px").kind, "expression", "a reference glued to other text is not a component of its own");
  assert.equal(classifyValue("#fff").kind, "raw");
  assert.deepEqual(brief("currentColor"), { kind: "keyword", keyword: "currentcolor" });
  assert.equal(classifyValue('"var(--a)"').kind, "raw", "var inside a string is not a reference");
  assert.equal(classifyValue("/* var(--a) */ red").kind, "raw", "var inside a comment is not a reference");
});

test("value-refs: replace and normalise", () => {
  assert.equal(replaceVarName("calc(var(--a) * 3)", 0, "--a", "--bb"), "calc(var(--bb) * 3)");
  assert.equal(replaceVarName("var(--a) var(--b)", 1, "--b", "--c"), "var(--a) var(--c)");
  assert.throws(() => replaceVarName("var(--a)", 0, "--z", "--c"), /not --z/);
  assert.equal(normalizeValue(" var( --a )  /* c */ \n"), "var( --a )");
  assert.equal(findVarRefs("var(--a, var(--b))")[1].depth, 1);
});

test("value-refs: scanDeclarations reads :root blocks from text", () => {
  const text = ":root {\n  --a: var(--b);\n  --c: 1px; /* x; y */\n}\n:root[data-t=\"dark\"] { --a: red }\n.x { color: var(--a) !important }\n";
  const decls = scanDeclarations(text);
  assert.deepEqual(
    decls.map((d) => [d.prelude, d.property, d.value, d.important]),
    [
      [":root", "--a", "var(--b)", false],
      [":root", "--c", "1px", false],
      [':root[data-t="dark"]', "--a", "red", false],
      [".x", "color", "var(--a)", true],
    ],
  );
  assert.equal(findRootDeclaration(text, "--a").value, "var(--b)");
  assert.equal(findRootDeclaration(text, "--missing"), null);
  assert.equal(findRootDeclaration(":root{--a:1}:root{--a:2}", "--a"), "ambiguous");
});

test("value-refs: a declaration right after a comment is still found", () => {
  const text = [
    "/* header; with { braces } and a colon: here */",
    ":root {",
    "  /* --- section: one (E01) --- */",
    "  --a: var(--b); /* trailing note: about a */",
    "  --c: 4px;",
    "  /* a note */ --d: var(--a) /* inside */;",
    "}",
  ].join("\n");
  assert.deepEqual(scanDeclarations(text).map((d) => [d.prelude, d.property]), [[":root", "--a"], [":root", "--c"], [":root", "--d"]]);
  assert.equal(findRootDeclaration(text, "--a").value, "var(--b)");
  assert.equal(findRootDeclaration(text, "--c").value, "4px");
  assert.equal(normalizeValue(findRootDeclaration(text, "--d").value), "var(--a)");
});

test("patch: BOM and non-ASCII text before the target", () => {
  const bytes = Buffer.from("﻿/* 昭和 — ō */\n.a { border-radius: var(--md-sys-shape-corner-sm); }\n", "utf8");
  const result = patch(bytes, [{ prop: "border-radius", from: "--md-sys-shape-corner-sm", to: "--md-sys-shape-corner-md" }]);
  assert.equal(result.newBytes.subarray(0, 3).toString("hex"), "efbbbf", "BOM kept");
  onlyDiff(bytes, result.newBytes, "--md-sys-shape-corner-sm", "--md-sys-shape-corner-md");
  assert.equal(result.spans[0].line, 2);
});

test("patch: comment inside the value, CRLF, multi-line value", () => {
  const bytes = Buffer.from(".a {\r\n  padding:\r\n    var( /* inset */ --x-inset )\r\n    var(--x-gap);\r\n}\r\n", "utf8");
  const result = patch(bytes, [{ prop: "padding", refIndex: 1, from: "--x-gap", to: "--x-gap-lg" }]);
  assert.match(result.newBytes.toString("utf8"), /var\( \/\* inset \*\/ --x-inset \)\r\n    var\(--x-gap-lg\);\r\n/);
  onlyDiff(bytes, result.newBytes, "--x-gap", "--x-gap-lg");
});

test("patch: !important and calc() keep their text", () => {
  const bytes = Buffer.from(".a { color: var(--c)!important; padding-block-end: calc(var(--inset) * 3); }\n", "utf8");
  const result = patch(bytes, [
    { prop: "color", from: "--c", to: "--c2" },
    { prop: "padding-block-end", from: "--inset", to: "--inset-lg" },
  ]);
  assert.equal(
    result.newBytes.toString("utf8"),
    ".a { color: var(--c2)!important; padding-block-end: calc(var(--inset-lg) * 3); }\n",
  );
});

test("patch: custom property declaration with trailing comment", () => {
  const bytes = Buffer.from(":root {\n  --md-comp-x: var(--md-sys-color-primary);        /* voice */\n  --md-comp-y:var(--md-sys-color-primary) ;\n}\n", "utf8");
  const result = patch(bytes, [
    { prop: "--md-comp-x", from: "--md-sys-color-primary", to: "--md-sys-color-secondary" },
    { prop: "--md-comp-y", from: "--md-sys-color-primary", to: "--md-sys-color-secondary" },
  ]);
  assert.equal(
    result.newBytes.toString("utf8"),
    ":root {\n  --md-comp-x: var(--md-sys-color-secondary);        /* voice */\n  --md-comp-y:var(--md-sys-color-secondary) ;\n}\n",
  );
});

test("patch: rejects a wrong old name and duplicate targets", () => {
  const bytes = Buffer.from(".a { color: var(--c); }\n", "utf8");
  assert.throws(() => patch(bytes, [{ prop: "color", from: "--nope", to: "--d" }]), (e) => e instanceof PatchError && e.code === "locator-mismatch");
  assert.throws(
    () => patch(bytes, [
      { prop: "color", from: "--c", to: "--d" },
      { prop: "color", from: "--c", to: "--e" },
    ]),
    (e) => e instanceof PatchError && e.code === "duplicate-target",
  );
  assert.throws(() => patch(bytes, [{ prop: "color", from: "--c", to: "--d;x" }]), (e) => e.code === "unsupported-value-shape");
});

test("decode: invalid UTF-8 is refused", () => {
  const bytes = Buffer.concat([Buffer.from(".a { color: var(--c); } /* ", "utf8"), Buffer.from([0xff, 0xfe]), Buffer.from(" */\n")]);
  const decoded = decodeCss(bytes);
  assert.equal(decoded.ok, false);
  assert.equal(decoded.reason, "invalid-utf8");
});

test("real files: patch every var() name and patch it back, byte-exact", () => {
  const project = testProject();
  const files = [
    ...fs.readdirSync(path.join(project, "src", "components")).flatMap((dir) => {
      const folder = path.join(project, "src", "components", dir);
      return fs.statSync(folder).isDirectory()
        ? fs.readdirSync(folder).filter((f) => f.endsWith(".css")).map((f) => path.join(folder, f))
        : [];
    }),
  ];
  const tokenFile = path.join(project, "tokens", "tokens-comp.css");
  let componentRefs = 0;
  let tokenDecls = 0;
  for (const file of [...files, tokenFile]) {
    const original = readCssSource(file);
    assert.ok(original.ok, `${file} decodes`);
    const root = postcss.parse(original.text);
    const decls = [];
    root.walkDecls((decl) => decls.push(decl));
    for (let d = 0; d < decls.length; d += 1) {
      const raw = decls[d].raws.value?.raw ?? decls[d].value;
      const refs = findVarRefs(raw);
      refs.forEach((ref, refIndex) => {
        if (!ref.name) return;
        if (file === tokenFile) tokenDecls += 1;
        else componentRefs += 1;
        const toName = `${ref.name}-zz`;
        const forward = patchFile(postcss, original, root, [{ decl: decls[d], refIndex, fromName: ref.name, toName, opId: "f" }]);
        assert.equal(forward.newBytes.length, original.bytes.length + 3);
        const forwardSource = { bytes: forward.newBytes, text: forward.newText, hasBom: original.hasBom };
        const forwardRoot = postcss.parse(forward.newText);
        const forwardDecls = [];
        forwardRoot.walkDecls((decl) => forwardDecls.push(decl));
        const back = patchFile(postcss, forwardSource, forwardRoot, [{ decl: forwardDecls[d], refIndex, fromName: toName, toName: ref.name, opId: "b" }]);
        assert.ok(back.newBytes.equals(original.bytes), `${path.basename(file)} ${decls[d].prop} round trip`);
      });
    }
  }
  assert.equal(files.length, 7, "7 component CSS files");
  assert.equal(componentRefs, 162, "162 var() references in component CSS");
  assert.equal(tokenDecls, 102, "102 comp token declarations");
});

// ---- literal components: tokenize and restore (add-code-layer-tokenize-literals) ----------

const { proveReparse } = await addon("server/patcher.mjs");
const { splitTopLevel } = await addon("shared/value-refs.mjs");
const { inferKind } = await addon("shared/kinds.mjs");
const { LITERAL_KINDS } = await addon("shared/literals.mjs");
const { kindsOfSlot } = await addon("shared/property-table.mjs");
const { SUPPORTED_FLOWS, sidesOf } = await addon("shared/sides.mjs");

/** Literal edits on one stylesheet in memory: { prop, selector, kind, component, from, to } or a name edit { prop, refIndex, from, to }. */
function literalPatch(bytes, specs) {
  const source = sourceFromBytes(bytes);
  const root = postcss.parse(source.text);
  const edits = specs.map((s, i) =>
    s.kind ? { kind: s.kind, decl: findDecl(root, s.prop, s.selector), component: s.component, fromText: s.from, toText: s.to, opId: `op-${i}` } : { decl: findDecl(root, s.prop, s.selector), refIndex: s.refIndex ?? 0, fromName: s.from, toName: s.to, opId: `op-${i}` },
  );
  return patchFile(postcss, source, root, edits);
}

/** The expected new bytes, computed without the patcher: the one occurrence of `marker` holds the bytes to replace at `offset`. */
function splice(bytes, marker, offset, from, to) {
  const at = bytes.indexOf(Buffer.from(marker, "utf8"));
  assert.ok(at >= 0 && bytes.indexOf(Buffer.from(marker, "utf8"), at + 1) === -1, `${marker} occurs once`);
  const start = at + Buffer.byteLength(marker.slice(0, offset), "utf8");
  assert.equal(bytes.subarray(start, start + Buffer.byteLength(from)).toString("utf8"), from);
  return Buffer.concat([bytes.subarray(0, start), Buffer.from(to, "utf8"), bytes.subarray(start + Buffer.byteLength(from))]);
}

test("tokenizing a literal replaces only its bytes: beside a comment, with a BOM, CRLF, non-ASCII text and a value over several lines", () => {
  const cases = [
    { name: "a comment beside it", text: ".a {\n  padding: 8px /* tight */ 16px;\n}\n", marker: "padding: 8px", offset: 9, prop: "padding", component: 0, from: "8px" },
    { name: "a BOM", text: ".a {\n  margin: 0 12px;\n}\n", bom: true, marker: "margin: 0 12px", offset: 10, prop: "margin", component: 1, from: "12px" },
    { name: "CRLF", text: ".a {\r\n  margin: 0 12px;\r\n  color: red;\r\n}\r\n", marker: "margin: 0 12px", offset: 8, prop: "margin", component: 0, from: "0" },
    { name: "non-ASCII text before it", text: "/* 印章：昭和 */\n.a {\n  border: 1px solid #000; /* 黑框 */\n}\n", marker: "solid #000", offset: 6, prop: "border", component: 2, from: "#000" },
    { name: "a value over several lines", text: ".a {\n  margin:\n    0\n    12px;\n}\n", marker: "    12px", offset: 4, prop: "margin", component: 1, from: "12px" },
  ];
  for (const c of cases) {
    const bytes = Buffer.concat([c.bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(c.text, "utf8")]);
    const result = literalPatch(bytes, [{ kind: "tokenize", prop: c.prop, component: c.component, from: c.from, to: "var(--fx-sys-spacing-sm)" }]);
    assert.ok(result.newBytes.equals(splice(bytes, c.marker, c.offset, c.from, "var(--fx-sys-spacing-sm)")), `${c.name}: only the literal's bytes changed`);
    // And back: the recorded literal restores the original bytes exactly.
    const back = literalPatch(result.newBytes, [{ kind: "restore", prop: c.prop, component: c.component, from: "var(--fx-sys-spacing-sm)", to: c.from }]);
    assert.ok(back.newBytes.equals(bytes), `${c.name}: tokenizing and restoring gives back the file`);
  }
});

test("two edits on one declaration: a tokenized literal and a re-bound reference", () => {
  const bytes = Buffer.from(".a {\n  margin: 0 var(--fx-sys-spacing-xs);\n}\n", "utf8");
  const result = literalPatch(bytes, [
    { kind: "tokenize", prop: "margin", component: 0, from: "0", to: "var(--fx-sys-spacing-sm)" },
    { prop: "margin", refIndex: 0, from: "--fx-sys-spacing-xs", to: "--fx-sys-spacing-md" },
  ]);
  assert.equal(result.newText, ".a {\n  margin: var(--fx-sys-spacing-sm) var(--fx-sys-spacing-md);\n}\n");
  assert.equal(result.spans.length, 2);
});

test("what a literal edit may write is checked, and a change of structure fails the proof", () => {
  const bytes = Buffer.from(".a {\n  margin: 0 12px;\n}\n", "utf8");
  const refused = (spec, code) => assert.throws(() => literalPatch(bytes, [spec]), (e) => e instanceof PatchError && e.code === code, JSON.stringify(spec));
  refused({ kind: "tokenize", prop: "margin", component: 1, from: "12px", to: "var(--a, 4px)" }, "unsupported-value-shape");
  refused({ kind: "tokenize", prop: "margin", component: 1, from: "12px", to: "12px; color: red" }, "unsupported-value-shape");
  refused({ kind: "tokenize", prop: "margin", component: 1, from: "13px", to: "var(--a)" }, "locator-mismatch");
  const tokenized = Buffer.from(".a {\n  margin: 0 var(--a);\n}\n", "utf8");
  for (const literal of ["12px; color: red", "8px 8px", "var(--b)", "1px /* x */", "a{b}"]) {
    assert.throws(() => literalPatch(tokenized, [{ kind: "restore", prop: "margin", component: 1, from: "var(--a)", to: literal }]), (e) => e instanceof PatchError && e.code === "unsupported-value-shape", literal);
  }
  // Injected past the checks: text that adds a declaration changes the node count, and the re-parse proof fails.
  const text = bytes.toString("utf8");
  const root = postcss.parse(text);
  const decl = findDecl(root, "margin");
  const start = text.indexOf("12px");
  const injected = `${text.slice(0, start)}12px; color: red${text.slice(start + 4)}`;
  const span = { kind: "tokenize", decl, fromName: "12px", toName: "12px; color: red", start, end: start + 4, valueStart: text.indexOf("0 12px"), line: 2 };
  assert.throws(() => proveReparse(postcss, root, injected, [span]), (e) => e instanceof PatchError && e.code === "proof-failed");
});

test("every literal component of the trial ground's component stylesheets tokenizes and restores in memory to the same bytes", () => {
  const project = testProject();
  const componentsDir = path.join(project, "src", "components");
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) files.push(full);
    }
  };
  walk(componentsDir);
  assert.ok(files.length > 0, "the trial ground has component stylesheets");
  let tried = 0;
  for (const file of files) {
    const bytes = fs.readFileSync(file);
    const source = sourceFromBytes(bytes);
    const root = postcss.parse(source.text);
    root.walkDecls((decl) => {
      const raw = decl.raws.value?.raw ?? decl.value;
      const parts = splitTopLevel(raw);
      if (parts.some((p) => p.separator)) return;
      parts.forEach((part, component) => {
        if (/var\(/i.test(part.text) || !LITERAL_KINDS.has(inferKind(part.text))) return;
        // Only components that set a property of the inspector's table.
        const slots = new Set();
        for (const { writingMode, direction } of SUPPORTED_FLOWS) {
          const sides = sidesOf(decl.prop, parts.map((p) => p.text), writingMode, direction);
          if (!sides.ok) return;
          for (const entry of sides.slots) if (entry.component === component) slots.add(entry.slot);
        }
        if (slots.size === 0 || [...slots].some((slot) => kindsOfSlot(slot) === null)) return;
        const selector = decl.parent.selector;
        const edit = (kind, from, to) => ({ kind, decl, component, fromText: from, toText: to, opId: "op" });
        const forward = patchFile(postcss, source, root, [edit("tokenize", part.text, "var(--code-layer-probe)")]);
        const forwardRoot = postcss.parse(forward.newText);
        let target = null;
        forwardRoot.walkDecls(decl.prop, (d) => {
          if (d.parent.selector === selector && d.source.start.line === decl.source.start.line) target = d;
        });
        const back = patchFile(postcss, { bytes: forward.newBytes, text: forward.newText, hasBom: source.hasBom }, forwardRoot, [{ kind: "restore", decl: target, component, fromText: "var(--code-layer-probe)", toText: part.text, opId: "op" }]);
        assert.ok(back.newBytes.equals(bytes), `${path.relative(project, file)}:${decl.source.start.line} ${decl.prop} [${component}] ${part.text}`);
        tried += 1;
      });
    });
  }
  assert.ok(tried > 0, "at least one literal was tried");
  console.log(`# trial ground: ${files.length} stylesheets, ${tried} literal components tokenized and restored in memory`);
});
