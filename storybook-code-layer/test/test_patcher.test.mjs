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
  assert.deepEqual(classifyValue("var(--a)"), { kind: "single-var", name: "--a" });
  assert.deepEqual(classifyValue("  var( /*x*/ --a ) "), { kind: "single-var", name: "--a" });
  assert.equal(classifyValue("var(--a, 4px)").kind, "var-with-fallback");
  assert.equal(classifyValue("var(--a, var(--b))").kind, "var-with-fallback");
  assert.equal(classifyValue("calc(var(--a) * 3)").kind, "expression");
  assert.equal(classifyValue("var(--a) var(--b)").kind, "expression");
  assert.equal(classifyValue("var(--a) 2px").kind, "expression");
  assert.equal(classifyValue("#fff").kind, "raw");
  assert.deepEqual(classifyValue("currentColor"), { kind: "keyword", keyword: "currentcolor" });
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
