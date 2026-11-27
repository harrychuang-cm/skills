// Governance: a write keeps the surrounding design-system package consistent.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { addon, loadPostcss, makeWorkspace, tempDir, testProject } from "./helpers.mjs";
import { batch, changedFiles, editLine, fxDeclOp, fxTokenOp, lineOf, treeFacts, treeHashes } from "./ops.mjs";

const { createEngine } = await addon("server/transaction.mjs");
const { loadConfig } = await addon("server/config.mjs");
const { locateRowEdit, parseTokenContract, patchSpec, specFileForToken, splitRow } = await addon("server/spec-rows.mjs");
const { decodeCss, diskHash } = await addon("server/css-source.mjs");
const { commentsOnly, findMentions, searchable, shortNameOf } = await addon("server/pending-docs.mjs");
const { buildIndex, serializeIndex } = await addon("server/index-builder.mjs");
const { contrastRatio, parseColor, sameColor } = await addon("shared/contrast.mjs");
const postcss = await loadPostcss();
const quiet = { info() {}, warn() {}, error() {} };

const GOVERNED = { governance: { componentSpecsDir: "../design-system/components" } };
const SEAL_SPEC = "design-system/components/seal.md";
const TITLE_SPEC = "design-system/components/title.md";

async function governed(options = {}) {
  const made = await makeWorkspace({ fixture: "v1", ...options, config: typeof options.config === "function" ? (ws) => ({ ...GOVERNED, ...options.config(ws) }) : { ...GOVERNED, ...(options.config ?? {}) } });
  return { ...made, engine: createEngine({ config: made.config, postcss, log: quiet }) };
}

const source = (text) => {
  const bytes = Buffer.from(text, "utf8");
  return { ...decodeCss(bytes), bytes, diskHash: diskHash(bytes) };
};

// ---- Token Contract rows ---------------------------------------------------------

test("token contract row: the documented alias changes with the token; only the second cell's bytes change", async () => {
  const { ws, engine } = await governed();
  const spec = path.join(ws, SEAL_SPEC);
  const original = fs.readFileSync(spec, "utf8");
  const line = lineOf(spec, "| --fx-comp-seal-container-color |");
  const before = treeHashes(ws);
  const result = await engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary")]));

  assert.deepEqual(result.documents, [{ operation: "op-1", token: "--fx-comp-seal-container-color", file: SEAL_SPEC, line, before: "--fx-sys-color-primary", after: "--fx-sys-color-secondary" }]);
  assert.deepEqual(result.specRowsSkipped, []);
  assert.deepEqual(changedFiles(before, treeHashes(ws)), [SEAL_SPEC, "sb/tokens/tokens-comp.css", "tokens/tokens-comp.css"]);
  const now = fs.readFileSync(spec, "utf8");
  assert.equal(
    now,
    original.replace("| --fx-comp-seal-container-color | --fx-sys-color-primary | container fill | default |", "| --fx-comp-seal-container-color | --fx-sys-color-secondary | container fill | default |"),
    "the file differs in that one cell only",
  );
  assert.equal(now.split("\n").length, original.split("\n").length, "same number of lines");
  assert.ok(now.includes("| --fx-comp-seal-text-color | --fx-sys-color-on-primary |"), "a cell that merely contains the old name is untouched");
  assert.ok(now.includes("The default seal is a primary square"), "prose is not rewritten");
  // The journal records the specification like any other written file.
  const record = engine.journal.transactions().get(result.applyId).pending;
  assert.deepEqual(record.files.map((f) => [f.rel, f.role]), [["tokens/tokens-comp.css", "token-source"], [SEAL_SPEC, "spec"], ["sb/tokens/tokens-comp.css", "token-mirror"]]);
  assert.deepEqual(record.documents, result.documents);
});

test("rows that must not be edited: range row, drifting second cell, duplicated row, missing file or heading", async () => {
  const cases = [
    // [token, from, to, reason, file, extra]
    ["--fx-comp-title-glyph-color-1", "--fx-sys-color-festival-1", "--fx-sys-color-festival-2", "row-not-found", TITLE_SPEC, {}],
    ["--fx-comp-title-plate-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary", "second-cell-mismatch", TITLE_SPEC, { actual: "--fx-sys-color-primary-warm" }],
    ["--fx-comp-seal-shape", "--fx-sys-shape-corner-sm", "--fx-sys-shape-corner-md", "row-not-unique", SEAL_SPEC, {}],
    ["--fx-comp-seal-ribbon-container-color", "--fx-sys-color-secondary", "--fx-sys-color-highlight", "row-not-found", SEAL_SPEC, {}],
  ];
  for (const [token, from, to, reason, file, extra] of cases) {
    const { ws, engine } = await governed();
    const before = treeHashes(ws);
    const result = await engine.apply(batch([fxTokenOp(token, from, to)]));
    assert.deepEqual(result.documents, [], `${token}: no row rewritten`);
    assert.equal(result.specRowsSkipped.length, 1);
    const skipped = result.specRowsSkipped[0];
    assert.deepEqual([skipped.token, skipped.reason, skipped.file], [token, reason, file], token);
    if (extra.actual) assert.equal(skipped.actual, extra.actual);
    // The token is written all the same; no specification changed.
    assert.deepEqual(changedFiles(before, treeHashes(ws)), ["sb/tokens/tokens-comp.css", "tokens/tokens-comp.css"], `${token}: the specification is left untouched`);
    assert.ok(fs.readFileSync(path.join(ws, "tokens/tokens-comp.css"), "utf8").includes(`${token}: var(${to});`));
  }

  const noFile = await governed({ files: { [TITLE_SPEC]: null } });
  const a = await noFile.engine.apply(batch([fxTokenOp("--fx-comp-title-gap", "--fx-sys-spacing-xs", "--fx-sys-spacing-md")]));
  assert.deepEqual(a.specRowsSkipped.map((k) => [k.reason, k.file]), [["no-spec-file", null]]);

  const sealText = fs.readFileSync(path.join(noFile.ws, SEAL_SPEC), "utf8");
  const twoHeadings = await governed({ files: { [SEAL_SPEC]: `${sealText}\n## Token Contract\n\n| Component token | Maps to system token |\n|---|---|\n| --fx-comp-seal-text-color | --fx-sys-color-on-primary |\n` } });
  const b = await twoHeadings.engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary")]));
  assert.deepEqual(b.specRowsSkipped.map((k) => k.reason), ["contract-heading-not-unique"]);
  assert.equal(fs.readFileSync(path.join(twoHeadings.ws, SEAL_SPEC), "utf8").includes("--fx-sys-color-secondary"), false);

  const noHeading = await governed({ files: { [SEAL_SPEC]: sealText.replace("## Token Contract", "## Tokens") } });
  const c = await noHeading.engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary")]));
  assert.deepEqual(c.specRowsSkipped.map((k) => k.reason), ["no-contract-heading"]);

  // Without a bound specification directory the feature is off: nothing is reported, nothing is read.
  const off = await makeWorkspace({ fixture: "v1" });
  const d = await createEngine({ config: off.config, postcss, log: quiet }).apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary")]));
  assert.deepEqual([d.documents, d.specRowsSkipped], [[], []]);
});

test("matching is exact: a cell is never matched by substring", () => {
  const md = [
    "# Thing",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Token contract summary | --p-comp-a-color maps to --p-sys-color-primary |",
    "",
    "```md",
    "## Token Contract",
    "| --p-comp-a-color | --p-sys-color-primary | inside a code block | x |",
    "```",
    "",
    "## Token Contract",
    "",
    "| Component token | Maps to system token | Purpose | State / mode |",
    "|---|:---:|---|---|",
    "| --p-comp-a-color-warm | --p-sys-color-primary | warm | hover |",
    "| --p-comp-a-color | --p-sys-color-primary-warm | plain | default |",
    "| `--p-comp-a-shape` | `--p-sys-shape-corner-sm` | in code spans | default |",
    "|   --p-comp-a-gap   |   --p-sys-spacing-sm   | padded cells | a \\| b |",
    "",
    "### Notes",
    "",
    "| --p-comp-a-late | --p-sys-color-primary | after the next heading | x |",
  ].join("\n");
  const contract = parseTokenContract(md);
  assert.equal(contract.ok, true);
  assert.equal(contract.headingLine, 12);
  assert.deepEqual(contract.rows.map((r) => r.cells[0].text), ["Component token", "--p-comp-a-color-warm", "--p-comp-a-color", "--p-comp-a-shape", "--p-comp-a-gap"], "the separator row, the code block and the rows after the next heading are not rows of the contract");
  assert.equal(contract.rows.at(-1).cells.length, 4, "an escaped pipe does not split a cell");

  const locate = (token, fromToken, toToken = "--p-sys-new") => locateRowEdit(md, { token, fromToken, toToken });
  // `--p-comp-a-color` has its own row; the row of `--p-comp-a-color-warm` is not it.
  assert.deepEqual([locate("--p-comp-a-color", "--p-sys-color-primary-warm").ok, locate("--p-comp-a-color", "--p-sys-color-primary-warm").line], [true, 17]);
  // The old token must be the whole second cell: `--p-sys-color-primary` does not match `--p-sys-color-primary-warm`.
  assert.deepEqual(locate("--p-comp-a-color", "--p-sys-color-primary"), { ok: false, reason: "second-cell-mismatch", line: 17, actual: "--p-sys-color-primary-warm" });
  assert.equal(locate("--p-comp-a", "--p-sys-color-primary").reason, "row-not-found", "a prefix of a token name matches no row");
  assert.equal(locate("--p-comp-a-late", "--p-sys-color-primary").reason, "row-not-found");

  // The edit replaces the token name only: code spans and cell padding stay.
  const patch = (token, fromToken, toToken) => patchSpec(source(md), [locateRowEdit(md, { token, fromToken, toToken })]).newText;
  assert.equal(patch("--p-comp-a-shape", "--p-sys-shape-corner-sm", "--p-sys-shape-corner-md"), md.replace("`--p-sys-shape-corner-sm`", "`--p-sys-shape-corner-md`"));
  assert.equal(patch("--p-comp-a-gap", "--p-sys-spacing-sm", "--p-sys-spacing-lg"), md.replace("|   --p-sys-spacing-sm   |", "|   --p-sys-spacing-lg   |"));
  assert.equal(patch("--p-comp-a-color-warm", "--p-sys-color-primary", "--p-sys-color-secondary"), md.replace("| --p-comp-a-color-warm | --p-sys-color-primary |", "| --p-comp-a-color-warm | --p-sys-color-secondary |"));

  // CRLF line endings, a byte order mark and non-ASCII text before the row survive byte for byte.
  const crlf = `﻿# 規格 — 印章\r\n\r\n## Token Contract\r\n\r\n| Component token | Maps to system token |\r\n|---|---|\r\n| --p-comp-a-color | --p-sys-color-primary |\r\n`;
  const crlfSource = source(crlf);
  assert.equal(crlfSource.hasBom, true);
  const patched = patchSpec(crlfSource, [locateRowEdit(crlfSource.text, { token: "--p-comp-a-color", fromToken: "--p-sys-color-primary", toToken: "--p-sys-color-secondary" })]);
  assert.ok(patched.newBytes.equals(Buffer.from(crlf.replace("--p-sys-color-primary |", "--p-sys-color-secondary |"), "utf8")));

  assert.deepEqual(splitRow("not a row"), null);
  assert.deepEqual(splitRow("| a | b").map((c) => c.text), ["a", "b"], "a row without a closing pipe");
  const files = [{ abs: "/s/seal.md", componentId: "seal" }, { abs: "/s/seal-stamp.md", componentId: "seal-stamp" }];
  assert.equal(specFileForToken("--p-comp-seal-stamp-fill", "p", files).componentId, "seal-stamp", "the longest component id wins");
  assert.equal(specFileForToken("--p-comp-seal-fill", "p", files).componentId, "seal");
  assert.equal(specFileForToken("--p-comp-sealant-fill", "p", files), null, "a component id is matched on a name boundary");
  assert.equal(specFileForToken("--p-sys-color-primary", "p", files), null);
});

test("the specification belongs to the transaction: a failed check leaves it alone; undo and reverse apply restore the row", async () => {
  const fail = await governed({
    files: { "checks/no-secondary.mjs": 'import fs from "node:fs";\nif (fs.readFileSync(process.argv[2] + "/tokens/tokens-comp.css", "utf8").includes("--fx-comp-seal-container-color: var(--fx-sys-color-secondary)")) { console.error("not allowed"); process.exit(1); }\n' },
    config: (ws) => ({ checks: [{ id: "no-secondary", command: "node", args: [path.join(ws, "checks/no-secondary.mjs"), "{candidateRoot}"], cwd: "{candidateRoot}", appliesTo: "tokens", timeoutMs: 20000 }] }),
  });
  const container = () => fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary");
  const facts = treeFacts(fail.ws);
  await assert.rejects(fail.engine.apply(batch([container()])), (e) => e.code === "check-failed");
  assert.deepEqual(treeFacts(fail.ws), facts, "the batch was rejected after the row edit was computed; nothing changed");

  // Exact undo: token file, mirror and specification all return to their previous bytes.
  const { ws, engine } = await governed();
  const before = treeHashes(ws);
  const applied = await engine.apply(batch([container(), fxTokenOp("--fx-comp-seal-text-color", "--fx-sys-color-on-primary", "--fx-sys-color-on-secondary", "op-b")]));
  assert.deepEqual(applied.documents.map((d) => d.token), ["--fx-comp-seal-container-color", "--fx-comp-seal-text-color"], "two rows of one specification in one batch");
  assert.deepEqual(changedFiles(before, treeHashes(ws)), [SEAL_SPEC, "sb/tokens/tokens-comp.css", "tokens/tokens-comp.css"]);
  const undone = await engine.undo({ applyId: applied.applyId });
  assert.deepEqual(undone.files.map((f) => f.file), ["tokens/tokens-comp.css", SEAL_SPEC, "sb/tokens/tokens-comp.css"]);
  assert.deepEqual(treeHashes(ws), before);

  // Reverse apply: someone edited another line of the specification after the apply.
  const again = await engine.apply(batch([container()]));
  const spec = path.join(ws, SEAL_SPEC);
  editLine(spec, 1, "# Seal", "# Seal (reviewed)");
  await assert.rejects(engine.undo({ applyId: again.applyId }), (e) => e.code === "undo-conflict" && e.details.conflicts.some((c) => c.file === SEAL_SPEC) && e.details.canReverse);
  const reversed = await engine.reverse({ applyId: again.applyId });
  assert.deepEqual(reversed.files.map((f) => f.file), ["tokens/tokens-comp.css", SEAL_SPEC, "sb/tokens/tokens-comp.css"]);
  const after = treeHashes(ws);
  assert.deepEqual(changedFiles(before, after), [SEAL_SPEC], "only the person's edit remains");
  assert.equal(fs.readFileSync(spec, "utf8"), fs.readFileSync(path.join((await governed()).ws, SEAL_SPEC), "utf8").replace("# Seal", "# Seal (reviewed)"), "the row is back to the old system token");
});

test("write order: source of truth, specification, mirror, component stylesheet", async () => {
  const { ws, engine } = await governed();
  const result = await engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary"), fxDeclOp()]));
  const order = [["tokens/tokens-comp.css", "token-source"], [SEAL_SPEC, "spec"], ["sb/tokens/tokens-comp.css", "token-mirror"], ["sb/src/components/seal/Seal.css", "component-css"]];
  assert.deepEqual(result.files.map((f) => [f.file, f.role]), order);
  // Each file is written by renaming a freshly written temporary file, so modification times follow the write order.
  const times = order.map(([file]) => fs.statSync(path.join(ws, file), { bigint: true }).mtimeNs);
  for (let i = 1; i < times.length; i += 1) assert.ok(times[i] >= times[i - 1], `${order[i][0]} was written after ${order[i - 1][0]}`);
  assert.ok(times.at(-1) > times[0]);
});

test("lab copy (optional): re-binding the hanko fill rewrites line 54 of badge-seal.md and nothing else in it", { skip: !process.env.CODE_LAYER_LAB_CONFIG }, async () => {
  const storybook = testProject();
  const lab = path.dirname(storybook);
  const ws = tempDir("code-layer-lab-copy-");
  for (const relative of ["tokens", "design-system/components", "design-system/TOKEN_ARCHITECTURE.md", "storybook/tokens", "storybook/src/components", "storybook/src/styles/storybook.css"]) {
    fs.cpSync(path.join(lab, relative), path.join(ws, relative), { recursive: true });
  }
  const binding = JSON.parse(fs.readFileSync(process.env.CODE_LAYER_LAB_CONFIG, "utf8"));
  const configFile = path.join(ws, "storybook/.storybook/code-layer/code-layer.config.json");
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  // The copy has no audit scripts next to it; the row rewrite does not depend on them.
  fs.writeFileSync(configFile, JSON.stringify({ ...binding, checks: [], governance: { componentSpecsDir: "../design-system/components" } }));
  const config = loadConfig({ projectRoot: path.join(ws, "storybook"), configFile });
  const engine = createEngine({ config, postcss, log: quiet });
  const spec = path.join(ws, "design-system/components/badge-seal.md");
  const original = fs.readFileSync(spec, "utf8").split("\n");
  const before = treeHashes(ws);
  const result = await engine.apply(batch([{ id: "fill", type: "rebind-token", token: "--md-comp-badge-seal-hanko-container-color", fromToken: "--md-sys-color-primary", toToken: "--md-sys-color-secondary", before: { value: "var(--md-sys-color-primary)" }, after: { value: "var(--md-sys-color-secondary)" } }]));
  assert.deepEqual(result.documents.map((d) => [d.file, d.line]), [["design-system/components/badge-seal.md", 54]]);
  assert.deepEqual(changedFiles(before, treeHashes(ws)), ["design-system/components/badge-seal.md", "storybook/tokens/tokens-comp.css", "tokens/tokens-comp.css"]);
  const now = fs.readFileSync(spec, "utf8").split("\n");
  assert.equal(now.length, original.length);
  const differing = now.map((line, i) => (line === original[i] ? 0 : i + 1)).filter(Boolean);
  assert.deepEqual(differing, [54]);
  assert.equal(original[53], "| --md-comp-badge-seal-hanko-container-color | --md-sys-color-primary | container fill | hanko |");
  assert.equal(now[53], "| --md-comp-badge-seal-hanko-container-color | --md-sys-color-secondary | container fill | hanko |");
  await engine.undo({ applyId: result.applyId });
  assert.deepEqual(treeHashes(ws), before);
});

// ---- documents pending sync ---------------------------------------------------------

const brief = (entries) => entries.map((e) => [e.kind, e.reason, e.file, e.line]);
const containerToSecondary = (id = "op-1") => fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary", id);

test("pending: a token whose row is not eligible, every declaration re-bind and a comment beside a rewritten line each leave an entry", async () => {
  const { ws, engine } = await governed();
  const titleSpec = path.join(ws, TITLE_SPEC);
  const css = path.join(ws, "sb/src/components/seal/Seal.css");

  // A range row documents glyph-color-1..3: no row has that exact first cell.
  const range = await engine.apply(batch([fxTokenOp("--fx-comp-title-glyph-color-1", "--fx-sys-color-festival-1", "--fx-sys-color-festival-2")]));
  assert.deepEqual(brief(range.pending), [["spec-row", "row-not-found", TITLE_SPEC, lineOf(titleSpec, "## Token Contract")]]);
  assert.deepEqual([range.pending[0].token, range.pending[0].oldToken, range.pending[0].newToken, range.pending[0].applyId], ["--fx-comp-title-glyph-color-1", "--fx-sys-color-festival-1", "--fx-sys-color-festival-2", range.applyId]);

  // A drifting row names its line and what the cell holds.
  const drifting = await engine.apply(batch([fxTokenOp("--fx-comp-title-plate-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary")]));
  const row = drifting.pending.find((e) => e.kind === "spec-row");
  assert.deepEqual([row.reason, row.file, row.line, row.actual], ["second-cell-mismatch", TITLE_SPEC, lineOf(titleSpec, "| --fx-comp-title-plate-container-color |"), "--fx-sys-color-primary-warm"]);
  assert.match(row.excerpt, /^\| --fx-comp-title-plate-container-color \|/);

  // A declaration re-bind is never documented by a table; the comment on its line describes the old value.
  const declared = await engine.apply(batch([fxDeclOp({ property: "background", from: "--fx-comp-seal-container-color", to: "--fx-sys-color-secondary" }), fxDeclOp({ id: "op-3", property: "gap", from: "--fx-sys-spacing-xs", to: "--fx-sys-spacing-sm" })]));
  const backgroundLine = lineOf(css, "background: var(--fx-sys-color-secondary); /* primary pop */");
  assert.deepEqual(
    brief(declared.pending.filter((e) => e.kind !== "mention")),
    [
      ["declaration", "declaration-not-documented", "sb/src/components/seal/Seal.css", backgroundLine],
      ["comment", "comment-on-rewritten-line", "sb/src/components/seal/Seal.css", backgroundLine],
      ["declaration", "declaration-not-documented", "sb/src/components/seal/Seal.css", lineOf(css, "  gap: var(--fx-sys-spacing-sm);")],
    ],
  );
  assert.equal(declared.pending.find((e) => e.kind === "comment").excerpt, "/* primary pop */");
  assert.deepEqual(declared.pending.filter((e) => e.kind === "declaration").map((e) => [e.operation, e.property, e.oldToken, e.newToken]), [["op-2", "background", "--fx-comp-seal-container-color", "--fx-sys-color-secondary"], ["op-3", "gap", "--fx-sys-spacing-xs", "--fx-sys-spacing-sm"]]);

  // An eligible row was rewritten: no spec-row entry, but the token file's own comment is flagged.
  const rewritten = await engine.apply(batch([fxTokenOp("--fx-comp-seal-text-color", "--fx-sys-color-on-primary", "--fx-sys-color-on-secondary")]));
  assert.equal(rewritten.documents.length, 1);
  assert.equal(rewritten.pending.some((e) => e.kind === "spec-row"), false);
  const voice = await engine.apply(batch([containerToSecondary()]));
  assert.deepEqual(brief(voice.pending.filter((e) => e.kind === "comment")), [["comment", "comment-on-rewritten-line", "tokens/tokens-comp.css", lineOf(path.join(ws, "tokens/tokens-comp.css"), "--fx-comp-seal-container-color:")]]);
  assert.equal(voice.pending.find((e) => e.kind === "comment").excerpt, "/* voice */");
});

test("pending: lines that still name the old role, in the component's specification, stylesheet comments, source and stories", async () => {
  const { ws, engine, config } = await governed();
  const result = await engine.apply(batch([containerToSecondary()]));
  const spec = path.join(ws, SEAL_SPEC);
  const mentions = result.pending.filter((e) => e.kind === "mention");
  assert.deepEqual(
    mentions.map((e) => [e.file, e.line, e.excerpt]),
    [
      [SEAL_SPEC, lineOf(spec, "The default seal is a primary square"), "The default seal is a primary square with a white label."],
      [SEAL_SPEC, lineOf(spec, "White on primary must stay readable"), "White on primary must stay readable at label size."],
      ["sb/src/components/seal/Seal.css", 9, "/* primary pop */"],
      ["sb/src/components/seal/Seal.stories.tsx", 14, "// The primary seal."],
      ["sb/src/components/seal/Seal.tsx", 5, "/** default: the primary square. */"],
    ],
  );
  assert.ok(mentions.every((e) => e.term === "primary" && e.reason === "mentions-old-name" && e.oldToken === "--fx-sys-color-primary" && e.newToken === "--fx-sys-color-secondary"));
  // `primary-warm` is another role; the row cells and the rewritten cell hold custom property names.
  const warmLine = lineOf(spec, "The title plate uses primary-warm");
  assert.equal(mentions.some((e) => e.file === SEAL_SPEC && e.line === warmLine), false, "primary does not hit primary-warm");
  assert.equal(mentions.some((e) => e.excerpt.includes("--fx-")), false);
  assert.equal(mentions.some((e) => e.file.includes("title")), false, "another component's files are not searched");
  // Every entry points at a real line of a real file.
  for (const entry of result.pending) assert.ok(fs.readFileSync(path.join(ws, entry.file), "utf8").split("\n")[entry.line - 1].includes(entry.excerpt.slice(0, 20)), `${entry.file}:${entry.line}`);

  // The search can be turned off in the binding.
  const quietScan = await governed({ config: { governance: { componentSpecsDir: "../design-system/components", proseScan: false } } });
  const silent = await quietScan.engine.apply(batch([containerToSecondary()]));
  assert.deepEqual(silent.pending.map((e) => e.kind), ["comment"]);
  assert.equal(config.governance.proseScan, true);
});

test("mentions: a word of its own, or a compound that names nothing else", () => {
  const others = new Set(["primary-warm", "on-primary", "corner-sm"]);
  const lines = (text, term = "primary") => findMentions(text, term, others).map((m) => m.line);
  assert.deepEqual(lines("a primary square"), [1]);
  assert.deepEqual(lines("Primary, then (primary)."), [1], "case-insensitive, one entry per line");
  assert.deepEqual(lines("a primary-red square"), [1], "a compound that is not a token still describes the role");
  assert.deepEqual(lines("ink-strong/primary/iris"), [1]);
  assert.deepEqual(lines("uses primary-warm"), [], "the short name of another token");
  assert.deepEqual(lines("text is on-primary"), []);
  assert.deepEqual(lines("| --fx-sys-color-primary |"), [], "a custom property name");
  assert.deepEqual(lines("var(--fx-comp-seal-primary-fill)"), []);
  assert.deepEqual(lines("primaryish or subprimary"), [], "not on a word boundary");
  assert.deepEqual(lines("one\nprimary\nthree\nprimary-warm\nthe primary one"), [2, 5]);
  assert.deepEqual(findMentions("  the primary square.  ", "primary")[0].excerpt, "the primary square.");
  assert.deepEqual(lines("radius is corner-sm here", "corner-sm"), [1], "the term itself is always a mention");

  assert.equal(shortNameOf("--md-sys-color-primary", "md"), "primary");
  assert.equal(shortNameOf("--md-sys-shape-corner-sm", "md"), "corner-sm");
  assert.equal(shortNameOf("--md-ref-color-red-60", "md"), "red-60");
  assert.equal(shortNameOf("--md-comp-badge-seal-hanko-container-color", "md", ["badge", "badge-seal"]), "hanko-container-color", "the longest component id");
  assert.equal(shortNameOf("--other-thing", "md"), null);
  assert.deepEqual(["primary", "sm", "4", "1.5", "red-60"].map(searchable), [true, false, false, false, true]);
  assert.equal(commentsOnly('a { b: "/* no */"; } /* yes */\n/* two\nlines */ c'), '                     /* yes */\n/* two\nlines */  ');
});

test("pending entries are stored, listed by the state, removed by undo and by reverse apply, and can be marked done", async () => {
  const { ws, engine, config } = await governed();
  const first = await engine.apply(batch([containerToSecondary()]));
  const second = await engine.apply(batch([fxDeclOp()]));
  assert.ok(first.pending.length >= 3, "the first apply left several entries");
  assert.deepEqual(second.pending.map((e) => e.kind), ["declaration"]);
  const all = () => engine.state().pendingDocs;
  assert.deepEqual(all().map((e) => e.id), [...first.pending, ...second.pending].map((e) => e.id));
  assert.ok(all().every((e) => /^[A-Za-z0-9_-]{1,64}$/.test(e.id)), "ids fit the wire pattern");
  const stored = JSON.parse(fs.readFileSync(path.join(config.stateDir, "pending-docs.json"), "utf8"));
  assert.deepEqual([stored.schemaVersion, stored.entries.length], [1, all().length]);
  assert.deepEqual(createEngine({ config, postcss, log: quiet }).state().pendingDocs, all(), "the list survives a restart");

  // Marking one entry done removes exactly that entry.
  const done = await engine.resolvePending([first.pending[0].id, "20260101-000000-apply-ffffff-p9"]);
  assert.deepEqual(done.resolved, [first.pending[0].id]);
  assert.equal(all().some((e) => e.id === first.pending[0].id), false);
  assert.equal(all().length, first.pending.length + second.pending.length - 1);

  // Undo clears what the undone apply caused, and nothing else.
  await engine.undo({ applyId: second.applyId });
  assert.equal(all().some((e) => e.applyId === second.applyId), false);
  assert.equal(all().filter((e) => e.applyId === first.applyId).length, first.pending.length - 1);
  // A reverse apply does the same and records nothing of its own.
  editLine(path.join(ws, SEAL_SPEC), 1, "# Seal", "# Seal (reviewed)");
  const reversed = await engine.reverse({ applyId: first.applyId });
  assert.deepEqual(all(), []);
  assert.equal(reversed.undone, first.applyId);
});

test("contract drift: rows that disagree and component tokens without a row are reported, and never block a batch", async () => {
  const { ws, engine, config } = await governed();
  const titleSpec = path.join(ws, TITLE_SPEC);
  const drift = () => engine.state().governance.drift;
  const plateLine = lineOf(titleSpec, "| --fx-comp-title-plate-container-color |");
  assert.deepEqual(drift(), {
    rows: 1,
    // seal ribbon fill, and the three glyph colors that only a range row mentions.
    undocumented: 4,
    items: [{ file: TITLE_SPEC, line: plateLine, token: "--fx-comp-title-plate-container-color", documented: "--fx-sys-color-primary-warm", actual: "--fx-sys-color-primary" }],
  });
  assert.equal(engine.state().governance.componentSpecsDir, "design-system/components");
  assert.deepEqual(serializeIndex(buildIndex({ config, postcss }), config).governance.drift, { rows: 1, undocumented: 4 });

  // Existing drift does not block batches that do not touch that token…
  await engine.apply(batch([containerToSecondary()]));
  assert.equal(drift().rows, 1, "the rewritten row still agrees");
  // …nor a batch that does: the token is written, the row is left for a person, the drift is still one row.
  const plate = await engine.apply(batch([fxTokenOp("--fx-comp-title-plate-container-color", "--fx-sys-color-primary", "--fx-sys-color-highlight")]));
  assert.equal(plate.pending.some((e) => e.kind === "spec-row" && e.reason === "second-cell-mismatch"), true);
  assert.deepEqual(drift().items.map((i) => [i.documented, i.actual]), [["--fx-sys-color-primary-warm", "--fx-sys-color-highlight"]]);
  // A person fixes the row by hand: no drift left.
  editLine(titleSpec, plateLine, "| --fx-comp-title-plate-container-color | --fx-sys-color-primary-warm | plate fill | plate |", "| --fx-comp-title-plate-container-color | --fx-sys-color-highlight | plate fill | plate |");
  assert.equal(drift().rows, 0);
  assert.deepEqual(serializeIndex(buildIndex({ config, postcss }), config).governance.drift, { rows: 0, undocumented: 4 });

  const off = await makeWorkspace({ fixture: "v1" });
  const plain = createEngine({ config: off.config, postcss, log: quiet });
  assert.deepEqual(plain.state().governance, { componentSpecsDir: null, drift: null });
  const untracked = await plain.apply(batch([containerToSecondary()]));
  assert.deepEqual(untracked.pending.map((e) => e.kind), ["comment", "mention", "mention", "mention"], "without specifications: the comment and the mentions in stylesheet, stories and source");
});

// ---- paired content tokens ------------------------------------------------------------

const near = (actual, expected, message) => assert.ok(actual !== null && Math.abs(actual - expected) <= 0.01, `${message ?? "ratio"}: ${actual} is not within 0.01 of ${expected}`);

test("contrast: WCAG ratios of known color pairs", () => {
  near(contrastRatio("#FFFFFF", "#FE0B05"), 3.99, "white on the primary red");
  near(contrastRatio("#FFFFFF", "#10A0E2"), 2.94, "white on the secondary blue");
  near(contrastRatio("#000000", "#FFFFFF"), 21);
  near(contrastRatio("#fff", "#ffffff"), 1);
  near(contrastRatio("rgb(255, 255, 255)", "#FE0B05"), 3.99);
  near(contrastRatio("rgb(255 255 255 / 100%)", "#FE0B05"), 3.99);
  near(contrastRatio("#FE0B05", "#FFFFFF"), contrastRatio("#FFFFFF", "#FE0B05"), "the ratio is symmetric");
  near(contrastRatio("#FFFFFF80", "#000000"), contrastRatio("#808080", "#000000"), "a translucent foreground is composited over the background");
  assert.equal(contrastRatio("#FFFFFF", "#00000080"), null, "a translucent background has no known backdrop");
  assert.equal(contrastRatio("currentcolor", "#FFFFFF"), null);
  assert.equal(contrastRatio("hsl(0 100% 50%)", "#FFFFFF"), null);
  assert.deepEqual(parseColor("#1A1410"), { r: 26, g: 20, b: 16, a: 1 });
  assert.ok(sameColor("#FFF", "#ffffff") && sameColor("white", "rgb(255,255,255)") && !sameColor("#FFFFFF", "#FFF9EC"));
});

test("paired content tokens: the five rows of the specification table", async () => {
  const { ws, engine } = await governed();
  const seal = (to) => fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", to);
  const validate = async (operations) => (await engine.apply(batch(operations, { dryRun: true }), { dryRun: true })).pairing;
  const before = treeHashes(ws);

  // primary -> secondary, content on-primary: warning; both on- colors are white; on-secondary offered.
  const [toSecondary] = await validate([seal("--fx-sys-color-secondary")]);
  assert.deepEqual(
    { ...toSecondary, contrast: undefined, previousRatio: undefined },
    {
      operation: "op-1",
      changed: "container",
      containerToken: "--fx-comp-seal-container-color",
      contentToken: "--fx-comp-seal-text-color",
      oldRole: "primary",
      newRole: "secondary",
      warning: "content-follows-old-role",
      contentFollows: "--fx-sys-color-on-primary",
      sameResolved: true,
      offer: { token: "--fx-comp-seal-text-color", fromToken: "--fx-sys-color-on-primary", toToken: "--fx-sys-color-on-secondary" },
      contrast: undefined,
      previousRatio: undefined,
    },
  );
  // The naming rule sees two white on- colors; the ratio shows the drop from 3.99 to 2.94.
  assert.deepEqual([toSecondary.contrast.container, toSecondary.contrast.content], ["#10A0E2", "#FFFFFF"]);
  near(toSecondary.contrast.ratio, 2.94);
  near(toSecondary.previousRatio, 3.99);

  // primary -> highlight: warning; on-highlight is ink, not white; on-highlight offered.
  const [toHighlight] = await validate([seal("--fx-sys-color-highlight")]);
  assert.deepEqual([toHighlight.warning, toHighlight.sameResolved, toHighlight.offer.toToken], ["content-follows-old-role", false, "--fx-sys-color-on-highlight"]);
  near(toHighlight.contrast.ratio, contrastRatio("#FFFFFF", "#FFD400"));

  // primary -> ink-strong (no on- partner): warning, nothing to offer.
  const [toInk] = await validate([seal("--fx-sys-color-ink-strong")]);
  assert.deepEqual([toInk.warning, toInk.newRole, toInk.sameResolved, toInk.offer], ["content-follows-old-role", "ink-strong", null, null]);

  // ink-strong (no on- partner) -> highlight, content knockout: no warning from the rule; the ratio is still shown.
  const [stamp] = await validate([fxTokenOp("--fx-comp-seal-stamp-container-color", "--fx-sys-color-ink-strong", "--fx-sys-color-highlight")]);
  assert.deepEqual([stamp.warning, stamp.offer, stamp.contentToken, stamp.contrast.content, stamp.contrast.container], [null, null, "--fx-comp-seal-stamp-text-color", "#FFF9EC", "#FFD400"]);
  near(stamp.contrast.ratio, contrastRatio("#FFF9EC", "#FFD400"));
  near(stamp.previousRatio, contrastRatio("#FFF9EC", "#1A1410"));

  // primary -> secondary without a sibling content token: nothing to say.
  assert.deepEqual(await validate([fxTokenOp("--fx-comp-seal-ribbon-container-color", "--fx-sys-color-secondary", "--fx-sys-color-highlight")]), []);
  assert.deepEqual(treeHashes(ws), before, "validation wrote nothing");
});

test("paired content tokens: a warning never rejects; re-binding both together clears it", async () => {
  const { ws, engine } = await governed();
  const alone = await engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-highlight")]));
  assert.equal(alone.ok, true, "the batch is applied in spite of the warning");
  assert.equal(alone.pairing[0].warning, "content-follows-old-role");
  assert.ok(fs.readFileSync(path.join(ws, "tokens/tokens-comp.css"), "utf8").includes("--fx-comp-seal-container-color: var(--fx-sys-color-highlight);"));
  await engine.undo({ applyId: alone.applyId });

  // The offered second change, staged with the first: content follows the new role, ink on yellow.
  const offer = alone.pairing[0].offer;
  const together = await engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-highlight"), fxTokenOp(offer.token, offer.fromToken, offer.toToken, "op-b")]));
  assert.equal(together.pairing.length, 1, "one entry per pair");
  assert.deepEqual([together.pairing[0].warning, together.pairing[0].offer, together.pairing[0].contrast.content], [null, null, "#1A1410"]);
  near(together.pairing[0].contrast.ratio, contrastRatio("#1A1410", "#FFD400"));
  near(together.pairing[0].previousRatio, 3.99);
  assert.deepEqual(together.documents.map((d) => d.token), ["--fx-comp-seal-container-color", "--fx-comp-seal-text-color"]);

  // Re-binding the content token alone reports the pair's contrast, without a warning.
  const content = await engine.apply(batch([fxTokenOp("--fx-comp-title-plate-text-color", "--fx-sys-color-on-primary", "--fx-sys-color-ink-strong")]));
  assert.deepEqual([content.pairing[0].changed, content.pairing[0].warning, content.pairing[0].containerToken], ["content", null, "--fx-comp-title-plate-container-color"]);
  near(content.pairing[0].contrast.ratio, contrastRatio("#1A1410", "#FE0B05"));

  // A project with other suffixes says so in its binding.
  const custom = await governed({ config: { governance: { componentSpecsDir: "../design-system/components", pairing: { containerSuffix: "-fill", contentSuffix: "-ink" } } } });
  const none = await custom.engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-highlight")]));
  assert.deepEqual(none.pairing, [], "these tokens do not end in the configured suffixes");
  // Declaration re-binds and non-color tokens are outside the rule.
  const other = await custom.engine.apply(batch([fxDeclOp(), fxTokenOp("--fx-comp-seal-shape", "--fx-sys-shape-corner-sm", "--fx-sys-shape-corner-lg", "op-c")]));
  assert.deepEqual(other.pairing, []);
});

// ---- post-apply commands -------------------------------------------------------------

const GENERATORS = {
  // Appends its name to the log given as argument; optional delay in ms.
  "gen/append.mjs": 'import fs from "node:fs";\nconst [name, log, delay = "0"] = process.argv.slice(2);\nawait new Promise((r) => setTimeout(r, Number(delay)));\nfs.mkdirSync(new URL(".", "file://" + log), { recursive: true });\nfs.appendFileSync(log, name + "\\n");\n',
  "gen/fail.mjs": 'import fs from "node:fs";\nfs.appendFileSync(process.argv[2], "fail\\n");\nconsole.error("generator exploded");\nprocess.exit(3);\n',
  // Starts a child that would run for a minute, records both pids, then hangs.
  "gen/hang.mjs": 'import { spawn } from "node:child_process";\nimport fs from "node:fs";\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });\nfs.writeFileSync(process.argv[2], JSON.stringify({ parent: process.pid, child: child.pid }));\nsetInterval(() => {}, 1000);\n',
};

function generator(ws, id, script, ...rest) {
  return { id, command: "node", args: [path.join(ws, script), ...rest], cwd: "..", writes: ["../derived"] };
}

const logLines = (ws) => (fs.existsSync(path.join(ws, "derived/log.txt")) ? fs.readFileSync(path.join(ws, "derived/log.txt"), "utf8").trim().split("\n") : []);

async function withGenerators(postApply) {
  return governed({
    files: (ws) => ({ ...GENERATORS, "derived/.keep": "" }),
    config: (ws) => ({ postApply: postApply(ws) }),
  });
}

test("post-apply: the commands run once after an apply and once after its undo, in the configured order", async () => {
  const { ws, engine, config } = await withGenerators((ws) => [
    generator(ws, "gen-a", "gen/append.mjs", "a", path.join(ws, "derived/log.txt")),
    generator(ws, "gen-b", "gen/append.mjs", "b", path.join(ws, "derived/log.txt")),
  ]);
  assert.deepEqual(engine.state().postApply, { commands: ["gen-a", "gen-b"], refused: [], running: false, last: null });
  const dry = await engine.apply(batch([containerToSecondary()], { dryRun: true }), { dryRun: true });
  assert.equal(dry.postApply, undefined, "a dry run commits nothing, so nothing is regenerated");

  const applied = await engine.apply(batch([containerToSecondary()]));
  assert.deepEqual(applied.postApply, { status: "queued", commands: ["gen-a", "gen-b"], refused: [] });
  await engine.postApply.idle();
  assert.deepEqual(logLines(ws), ["a", "b"]);
  const report = engine.applyReport(applied.applyId);
  assert.equal(report.postApply.status, "done");
  assert.equal(report.postApply.stale, false);
  assert.deepEqual(report.postApply.results.map((r) => [r.id, r.ok, r.code, r.timedOut]), [["gen-a", true, 0, false], ["gen-b", true, 0, false]]);
  assert.deepEqual([report.kind, report.documents.length, report.files.map((f) => f.role)], ["apply", 1, ["token-source", "spec", "token-mirror"]]);

  const undone = await engine.undo({ applyId: applied.applyId });
  assert.equal(undone.postApply.status, "queued");
  await engine.postApply.idle();
  assert.deepEqual(logLines(ws), ["a", "b", "a", "b"], "one more round for the undo");
  assert.equal(engine.applyReport(undone.undoId).postApply.status, "done");
  assert.equal(engine.state().postApply.last.stale, false);

  // The result is in the journal, so a later dev server can still report it.
  const later = createEngine({ config, postcss, log: quiet });
  const fromJournal = later.applyReport(applied.applyId).postApply;
  assert.deepEqual([fromJournal.status, fromJournal.stale, fromJournal.results.map((r) => r.id)], ["done", false, ["gen-a", "gen-b"]]);
  assert.throws(() => later.applyReport("20260101-000000-apply-ffffff"), (e) => e.code === "not-found");
});

test("post-apply: a failing command does not roll anything back; the report says the derived artifacts are out of date", async () => {
  const { ws, engine } = await withGenerators((ws) => [
    generator(ws, "gen-fail", "gen/fail.mjs", path.join(ws, "derived/log.txt")),
    generator(ws, "gen-b", "gen/append.mjs", "b", path.join(ws, "derived/log.txt")),
  ]);
  const applied = await engine.apply(batch([containerToSecondary()]));
  const written = treeHashes(ws);
  await engine.postApply.idle();
  const report = engine.applyReport(applied.applyId).postApply;
  assert.equal(report.stale, true, "derived artifacts are out of date");
  assert.deepEqual(report.results.map((r) => [r.id, r.ok, r.code]), [["gen-fail", false, 3], ["gen-b", true, 0]], "the commands after a failing one still run");
  assert.match(report.results[0].output, /generator exploded/);
  assert.deepEqual(logLines(ws), ["fail", "b"]);
  const after = treeHashes(ws);
  delete after["derived/log.txt"];
  delete written["derived/log.txt"];
  assert.deepEqual(after, written, "the written files stay as applied");
  assert.ok(fs.readFileSync(path.join(ws, "tokens/tokens-comp.css"), "utf8").includes("--fx-comp-seal-container-color: var(--fx-sys-color-secondary);"));
  assert.deepEqual(engine.state().undoStack.map((u) => u.applyId), [applied.applyId], "the apply is committed and can be undone as usual");
  assert.equal(engine.state().postApply.last.stale, true);
});

test("post-apply: a command that writes inside the Storybook project root is refused at start and listed in the state", async () => {
  const { ws, engine } = await withGenerators((ws) => [
    { ...generator(ws, "gen-inside", "gen/append.mjs", "inside", path.join(ws, "derived/log.txt")), writes: ["../derived", "public/docs"] },
    generator(ws, "gen-ok", "gen/append.mjs", "ok", path.join(ws, "derived/log.txt")),
  ]);
  assert.deepEqual(engine.state().postApply.refused, [{ id: "gen-inside", reason: "writes-inside-storybook-root", writes: ["sb/public/docs"] }]);
  assert.deepEqual(engine.state().postApply.commands, ["gen-ok"]);
  const applied = await engine.apply(batch([containerToSecondary()]));
  assert.deepEqual(applied.postApply.refused.map((r) => r.id), ["gen-inside"]);
  await engine.postApply.idle();
  assert.deepEqual(logLines(ws), ["ok"], "the refused command never ran");

  // With every command refused nothing is queued at all.
  const none = await withGenerators((ws) => [{ ...generator(ws, "gen-inside", "gen/append.mjs", "inside", path.join(ws, "derived/log.txt")), writes: ["."] }]);
  const quietApply = await none.engine.apply(batch([containerToSecondary()]));
  assert.equal(quietApply.postApply.status, "none");
  await none.engine.postApply.idle();
  assert.deepEqual(logLines(none.ws), []);
});

test("post-apply: a command that exceeds its time limit is ended together with its child process", async () => {
  const pidFile = (ws) => path.join(ws, "derived/pids.json");
  const { ws, engine } = await withGenerators((ws) => [{ ...generator(ws, "gen-hang", "gen/hang.mjs", pidFile(ws)), timeoutMs: 500 }]);
  const applied = await engine.apply(batch([containerToSecondary()]));
  await engine.postApply.idle();
  const [result] = engine.applyReport(applied.applyId).postApply.results;
  assert.deepEqual([result.id, result.ok, result.timedOut], ["gen-hang", false, true]);
  const pids = JSON.parse(fs.readFileSync(pidFile(ws), "utf8"));
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const deadline = Date.now() + 5000;
  while ((alive(pids.parent) || alive(pids.child)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  assert.equal(alive(pids.parent), false, "the command is gone");
  assert.equal(alive(pids.child), false, "and so is the process it started");
  assert.equal(engine.applyReport(applied.applyId).postApply.stale, true);
});

test("post-apply: commits that arrive while a round is running share one further round", async () => {
  const { ws, engine } = await withGenerators((ws) => [generator(ws, "gen-slow", "gen/append.mjs", "round", path.join(ws, "derived/log.txt"), "400")]);
  const first = await engine.apply(batch([containerToSecondary()]));
  // Wait until the first round has started, then commit twice more while it runs.
  for (let i = 0; i < 100 && engine.applyReport(first.applyId).postApply.status !== "running"; i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.equal(engine.applyReport(first.applyId).postApply.status, "running");
  const second = await engine.apply(batch([fxDeclOp()]));
  const third = await engine.apply(batch([fxDeclOp({ id: "gap", property: "gap", from: "--fx-sys-spacing-xs", to: "--fx-sys-spacing-sm" })]));
  assert.equal(engine.applyReport(second.applyId).postApply.status, "queued");
  assert.equal(engine.state().postApply.running, true);
  assert.deepEqual(logLines(ws), [], "the first round has not finished: the commits did not wait for it");
  await engine.postApply.idle();
  assert.deepEqual(logLines(ws), ["round", "round"], "three commits, two rounds: never two at a time, never one per commit");
  const reports = [first, second, third].map((a) => engine.applyReport(a.applyId).postApply);
  assert.deepEqual(reports.map((r) => r.status), ["done", "done", "done"]);
  assert.equal(reports[1].finishedAt, reports[2].finishedAt, "the second and third commit share a round");
  assert.notEqual(reports[0].finishedAt, reports[1].finishedAt);
  assert.equal(engine.state().postApply.running, false);
});

// ---- a tokenized literal (add-code-layer-tokenize-literals) -------------------------------

test("a tokenized literal leaves one pending entry for its declaration, never a search for the literal, and undo clears it", async () => {
  const css = [
    ".fx-box {",
    "  max-inline-size: 70%;",
    "  margin: 0 12px; /* 12px matches the old gutter */",
    "}",
    "",
  ].join("\n");
  const spec = ["# Box", "", "The box is at most 70% wide.", "", "| Part | Value |", "| --- | --- |", "| width | 70% |", "| gutter | 12px |", ""].join("\n");
  const made = await makeWorkspace({ fixture: "v1", files: { "sb/src/components/box/Box.css": css, "design-system/components/box.md": spec }, config: GOVERNED });
  assert.notEqual(made.config.governance.proseScan, false, "prose scanning is on, so the absence of mentions is meaningful");
  const engine = createEngine({ config: made.config, postcss, log: quiet });
  const rule = { ordinal: 0, selector: ".fx-box", atRules: [], occurrence: 0 };
  const op = (id, property, component, literal, toToken, before, after) => ({ id, type: "tokenize-literal", file: "src/components/box/Box.css", rule, declaration: { property }, component, literal, toToken, before: { value: before }, after: { value: after } });
  const applied = await engine.apply(
    batch([
      op("a", "max-inline-size", 0, "70%", "--fx-sys-size-icon", "70%", "var(--fx-sys-size-icon)"),
      op("b", "margin", 1, "12px", "--fx-sys-spacing-md", "0 12px", "0 var(--fx-sys-spacing-md)"),
    ]),
  );
  assert.deepEqual(
    applied.pending.map((e) => [e.operation, e.kind, e.reason, e.property, e.oldValue, e.newValue, e.file, e.line]),
    [
      ["a", "declaration", "declaration-not-documented", "max-inline-size", "70%", "--fx-sys-size-icon", "sb/src/components/box/Box.css", 2],
      ["b", "declaration", "declaration-not-documented", "margin", "12px", "--fx-sys-spacing-md", "sb/src/components/box/Box.css", 3],
      ["b", "comment", "comment-on-rewritten-line", "margin", "12px", "--fx-sys-spacing-md", "sb/src/components/box/Box.css", 3],
    ],
  );
  // The specification mentions 70% and 12px on several lines: none of them is listed.
  assert.ok(!applied.pending.some((e) => e.file === "design-system/components/box.md"), JSON.stringify(applied.pending));
  assert.equal(engine.state().pendingDocs.length, 3);
  await engine.undo({ applyId: applied.applyId });
  assert.equal(engine.state().pendingDocs.length, 0);
});
