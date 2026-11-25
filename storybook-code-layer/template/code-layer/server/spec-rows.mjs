// Component specifications: the Token Contract table that documents which
// system token each component token maps to.
//
// A re-bound component token rewrites the second cell of its row in the same
// transaction — but only on an exact match: one `## Token Contract` heading,
// one row whose first cell is the token, a second cell that is the old system
// token. Anything else is left alone and reported, never guessed.
import fs from "node:fs";
import path from "node:path";

import { byteOffset, encodeCss, readCssSource } from "./css-source.mjs";
import { proveByteEdits } from "./patcher.mjs";

const CONTRACT_HEADING = /^## Token Contract[ \t]*$/;
const ANY_HEADING = /^#{1,6}[ \t]/;
const FENCE = /^[ \t]*(```|~~~)/;
const SEPARATOR_CELL = /^:?-+:?$/;

/**
 * Markdown files directly inside the specification directory, sorted.
 * Symbolic links are listed too, so the writable-set checks can report them
 * as read-only instead of silently ignoring a specification.
 * Each entry: { abs, componentId }.
 */
export function listSpecFiles(dir) {
  if (!dir) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md"))
    .map((entry) => ({ abs: path.join(dir, entry.name), componentId: entry.name.slice(0, -".md".length) }))
    .sort((a, b) => a.abs.localeCompare(b.abs));
}

/**
 * The specification of the component a comp token belongs to: the file whose
 * base name is the longest prefix of the token's name after
 * `--<prefix>-comp-`. Null when no file matches.
 */
export function specFileForToken(tokenName, prefix, specFiles) {
  const head = `--${prefix}-comp-`;
  if (!tokenName.startsWith(head)) return null;
  const rest = tokenName.slice(head.length);
  let best = null;
  for (const file of specFiles) {
    if (rest !== file.componentId && !rest.startsWith(`${file.componentId}-`)) continue;
    if (!best || file.componentId.length > best.componentId.length) best = file;
  }
  return best;
}

/**
 * Cells of a table row with their offsets inside the line, or null when the
 * line is not a table row. A cell's text is trimmed; one pair of surrounding
 * backticks is not part of it (`` `--token` `` reads as `--token`).
 */
export function splitRow(line) {
  const first = line.search(/\S/);
  if (first === -1 || line[first] !== "|") return null;
  const ranges = [];
  let cellStart = first + 1;
  for (let i = first + 1; i < line.length; i += 1) {
    if (line[i] === "\\") {
      i += 1;
      continue;
    }
    if (line[i] === "|") {
      ranges.push([cellStart, i]);
      cellStart = i + 1;
    }
  }
  if (line.slice(cellStart).trim() !== "") ranges.push([cellStart, line.length]);
  return ranges.map(([start, end]) => {
    const raw = line.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    let text = raw.trim();
    let from = start + lead;
    if (text.length >= 2 && text.startsWith("`") && text.endsWith("`") && !text.slice(1, -1).includes("`")) {
      text = text.slice(1, -1);
      from += 1;
    }
    return { text, start: from, end: from + text.length };
  });
}

/**
 * The rows of the Token Contract table of a specification.
 * { ok: true, headingLine, rows: [{ line, lineStart, cells }] } or
 * { ok: false, reason: "no-contract-heading" | "contract-heading-not-unique" }.
 * Lines are 1-based; `lineStart` is the offset of the row's line in `text`.
 * Fenced code blocks are skipped; the table ends at the next heading.
 */
export function parseTokenContract(text) {
  const lines = text.split("\n");
  const starts = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const fenced = [];
  let inFence = false;
  for (const line of lines) {
    const isFence = FENCE.test(line);
    fenced.push(inFence || isFence);
    if (isFence) inFence = !inFence;
  }
  const clean = (i) => lines[i].replace(/\r$/, "");
  const headings = [];
  for (let i = 0; i < lines.length; i += 1) if (!fenced[i] && CONTRACT_HEADING.test(clean(i))) headings.push(i);
  if (headings.length === 0) return { ok: false, reason: "no-contract-heading" };
  if (headings.length > 1) return { ok: false, reason: "contract-heading-not-unique", lines: headings.map((i) => i + 1) };
  const rows = [];
  for (let i = headings[0] + 1; i < lines.length; i += 1) {
    if (fenced[i]) continue;
    const line = clean(i);
    if (ANY_HEADING.test(line)) break;
    const cells = splitRow(line);
    if (!cells || cells.length < 2 || cells.every((cell) => SEPARATOR_CELL.test(cell.text))) continue;
    rows.push({ line: i + 1, lineStart: starts[i], cells });
  }
  return { ok: true, headingLine: headings[0] + 1, rows };
}

/**
 * Where the documented alias of `token` would be rewritten.
 * { ok: true, line, start, end, fromName, toName } (offsets into `text`) or
 * { ok: false, reason, line?, actual? } with reason one of
 * "no-contract-heading", "contract-heading-not-unique", "row-not-found",
 * "row-not-unique", "second-cell-mismatch".
 */
export function locateRowEdit(text, { token, fromToken, toToken }) {
  const contract = parseTokenContract(text);
  if (!contract.ok) return contract;
  const matches = contract.rows.filter((row) => row.cells[0].text === token);
  if (matches.length === 0) return { ok: false, reason: "row-not-found" };
  if (matches.length > 1) return { ok: false, reason: "row-not-unique", line: matches[0].line, lines: matches.map((row) => row.line) };
  const row = matches[0];
  const cell = row.cells[1];
  if (cell.text !== fromToken) return { ok: false, reason: "second-cell-mismatch", line: row.line, actual: cell.text };
  return { ok: true, line: row.line, start: row.lineStart + cell.start, end: row.lineStart + cell.end, fromName: fromToken, toName: toToken };
}

/**
 * Plan the row edits of a batch.
 * changes: [{ opId, token, fromToken, toToken }] — re-bound component tokens.
 * Returns
 *   files:     Map<absPath, { source, edits }> for specifications to rewrite,
 *   documents: [{ opId, token, file (absolute), line, before, after }],
 *   skipped:   [{ opId, token, reason, file (absolute or null), line, actual }]
 *              rows that are not eligible and must be synchronised by hand.
 */
export function planSpecEdits({ prefix, specFiles, changes }) {
  const files = new Map();
  const documents = [];
  const skipped = [];
  for (const change of changes) {
    const spec = specFileForToken(change.token, prefix, specFiles);
    if (!spec) {
      skipped.push({ opId: change.opId, token: change.token, reason: "no-spec-file", file: null, line: null, actual: null });
      continue;
    }
    if (!files.has(spec.abs)) {
      let source;
      try {
        source = readCssSource(spec.abs);
      } catch {
        source = { ok: false, reason: "unreadable" };
      }
      files.set(spec.abs, { source, edits: [] });
    }
    const entry = files.get(spec.abs);
    if (!entry.source.ok) {
      skipped.push({ opId: change.opId, token: change.token, reason: "spec-unreadable", file: spec.abs, line: null, actual: null });
      continue;
    }
    const located = locateRowEdit(entry.source.text, change);
    if (!located.ok) {
      skipped.push({ opId: change.opId, token: change.token, reason: located.reason, file: spec.abs, line: located.line ?? null, actual: located.actual ?? null });
      continue;
    }
    entry.edits.push(located);
    documents.push({ opId: change.opId, token: change.token, file: spec.abs, line: located.line, before: change.fromToken, after: change.toToken });
  }
  for (const [abs, entry] of files) if (entry.edits.length === 0) files.delete(abs);
  return { files, documents, skipped };
}

/**
 * Apply located row edits to a specification. Proven on bytes: the new file
 * is the old file with exactly the planned ranges replaced, and it has the
 * same number of lines.
 */
export function patchSpec(source, edits) {
  const spans = edits
    .map((edit) => ({
      line: edit.line,
      start: edit.start,
      end: edit.end,
      fromName: edit.fromName,
      toName: edit.toName,
      byteStart: byteOffset(source.text, edit.start, source.hasBom),
      byteEnd: byteOffset(source.text, edit.end, source.hasBom),
    }))
    .sort((a, b) => a.start - b.start);
  let newText = source.text;
  for (const span of [...spans].reverse()) {
    if (newText.slice(span.start, span.end) !== span.fromName) throw new Error(`specification row at line ${span.line} does not hold ${span.fromName}`);
    newText = newText.slice(0, span.start) + span.toName + newText.slice(span.end);
  }
  const newBytes = encodeCss(newText, source.hasBom);
  proveByteEdits(source.bytes, newBytes, spans);
  if (newText.split("\n").length !== source.text.split("\n").length) throw new Error("specification line count changed");
  return { newBytes, newText, spans };
}
