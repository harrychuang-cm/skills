// Documents pending sync, and the contract drift report.
//
// A write can leave documentation out of date in places the tool cannot
// rewrite with certainty: a specification row it could not identify exactly, a
// stylesheet declaration no table documents, a comment beside the rewritten
// line, prose that still names the old role. Those places are recorded here —
// each with a file, a line and a reason, bound to the apply that caused it —
// so a person or an AI assistant can finish the job. Nothing here is rewritten
// by the tool.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { decodeCss } from "./css-source.mjs";
import { relativePosix } from "./paths.mjs";
import { parseTokenContract, specFileForToken } from "./spec-rows.mjs";

const FILE_NAME = "pending-docs.json";
const MAX_ENTRIES_PER_APPLY = 200;
const MAX_SCAN_BYTES = 512 * 1024;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".mdx", ".md", ".html"]);
const WORD = /[A-Za-z0-9_-]/;

/** The list on disk: <stateDir>/pending-docs.json, rewritten whole by rename. */
export class PendingDocs {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.file = path.join(stateDir, FILE_NAME);
  }

  list() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      return [];
    }
  }

  write(entries) {
    const temp = path.join(this.stateDir, `.${FILE_NAME}.${process.pid}.${crypto.randomUUID()}.tmp`);
    const fd = fs.openSync(temp, "wx", 0o600);
    try {
      fs.writeSync(fd, `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, this.file);
  }

  /** Store the entries of one apply; returns them with their ids. */
  add(applyId, drafts) {
    if (drafts.length === 0) return [];
    const at = new Date().toISOString();
    const entries = drafts.map((draft, index) => ({ id: `${applyId}-p${index + 1}`, applyId, ...draft, createdAt: at }));
    this.write([...this.list(), ...entries]);
    return entries;
  }

  /** Drop everything an apply caused (it was undone). Returns how many were removed. */
  removeByApply(applyId) {
    const all = this.list();
    const kept = all.filter((entry) => entry.applyId !== applyId);
    if (kept.length !== all.length) this.write(kept);
    return all.length - kept.length;
  }

  /** A person marked entries as done. Returns the ids that existed. */
  resolve(ids) {
    const wanted = new Set(ids);
    const all = this.list();
    const kept = all.filter((entry) => !wanted.has(entry.id));
    if (kept.length !== all.length) this.write(kept);
    return all.filter((entry) => wanted.has(entry.id)).map((entry) => entry.id);
  }
}

/**
 * The part of a token name a person would write in prose:
 * `--md-sys-color-primary` -> `primary`, `--md-sys-shape-corner-sm` ->
 * `corner-sm`, `--md-comp-badge-seal-hanko-container-color` (component
 * `badge-seal`) -> `hanko-container-color`.
 */
export function shortNameOf(tokenName, prefix, componentIds = []) {
  const comp = `--${prefix}-comp-`;
  if (tokenName.startsWith(comp)) {
    const rest = tokenName.slice(comp.length);
    const owner = componentIds.filter((id) => rest.startsWith(`${id}-`)).sort((a, b) => b.length - a.length)[0];
    return owner ? rest.slice(owner.length + 1) : rest;
  }
  const match = new RegExp(`^--${prefix}-(?:ref|sys)-[a-z0-9]+-(.+)$`).exec(tokenName);
  return match ? match[1] : null;
}

/** A short name worth searching prose for: not a bare number, not one or two letters. */
export function searchable(shortName) {
  return typeof shortName === "string" && shortName.length >= 3 && !/^[0-9.-]+$/.test(shortName);
}

/**
 * Lines of `text` that mention `term` as a word of its own.
 * A hyphenated compound around the match is a mention (`primary-red square`)
 * unless that compound is a custom property name or the short name of another
 * token (`primary-warm`, `on-primary`): those name something else.
 * Returns [{ line, excerpt }], one per line.
 */
export function findMentions(text, term, otherNames = new Set()) {
  const out = [];
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const seenLines = new Set();
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at === -1) break;
    from = at + needle.length;
    let start = at;
    while (start > 0 && WORD.test(text[start - 1])) start -= 1;
    let end = at + needle.length;
    while (end < text.length && WORD.test(text[end])) end += 1;
    const compound = lower.slice(start, end);
    // The term must sit on hyphen boundaries inside its compound: `primary` in `primary-red`, not in `primaryish`.
    const before = at === start ? "-" : text[at - 1];
    const after = at + needle.length === end ? "-" : text[at + needle.length];
    if (before !== "-" || after !== "-") continue;
    if (compound !== needle && (compound.startsWith("--") || otherNames.has(compound))) continue;
    const lineStart = text.lastIndexOf("\n", at - 1) + 1;
    const line = text.slice(0, lineStart).split("\n").length;
    if (seenLines.has(line)) continue;
    seenLines.add(line);
    let lineEnd = text.indexOf("\n", at);
    if (lineEnd === -1) lineEnd = text.length;
    out.push({ line, excerpt: text.slice(lineStart, lineEnd).replace(/\r$/, "").trim().slice(0, 200) });
  }
  return out;
}

/** `text` with everything outside CSS comments blanked (newlines kept). */
export function commentsOnly(text) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    if (quote) {
      if (c === "\\" && i + 1 < text.length) {
        out += "  ";
        i += 2;
        continue;
      }
      if (c === quote || c === "\n") quote = null;
      out += c === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += " ";
      i += 1;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      const stop = close === -1 ? text.length : close + 2;
      out += text.slice(i, stop);
      i = stop;
      continue;
    }
    out += c === "\n" ? "\n" : " ";
    i += 1;
  }
  return out;
}

function readText(abs) {
  try {
    const stat = fs.lstatSync(abs);
    if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) return null;
    const decoded = decodeCss(fs.readFileSync(abs));
    return decoded.ok ? decoded.text : null;
  } catch {
    return null;
  }
}

function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function lineText(text, line) {
  return (text.split("\n")[line - 1] ?? "").replace(/\r$/, "");
}

/**
 * What one committed batch left for a person to look at.
 * results:   resolved operations ({ id, type, token, tier, file (absolute), line, fromToken, toToken, cssFile, property })
 * skipped:   rows not eligible ({ opId, token, reason, file, line, actual })
 * newText:   Map<absPath, text after the write> for the files of the batch
 * Returns entries without ids (PendingDocs.add assigns them).
 */
export function collectPending({ config, index, specFiles, results, skipped, newText }) {
  const prefix = config.tokens.prefix;
  const relW = (abs) => relativePosix(config.workspaceRoot, abs);
  const cssFiles = index.cssIndex.files;
  const componentIds = [...new Set([...cssFiles.map((f) => f.componentId), ...specFiles.map((f) => f.componentId)])];
  // Short names of every token, so a compound that names another token is not taken for the old one.
  const otherNames = new Set();
  for (const token of index.tokenIndex.tokens.values()) {
    const short = shortNameOf(token.name, prefix, componentIds);
    if (short) otherNames.add(short.toLowerCase());
  }
  const entries = [];
  const seen = new Set();
  const push = (entry) => {
    const key = `${entry.kind}|${entry.file}|${entry.line}|${entry.term ?? entry.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };
  const change = (result) => ({ operation: result.id, token: result.token ?? null, property: result.property ?? null, oldToken: result.fromToken, newToken: result.toToken });

  for (const result of results) {
    const base = change(result);
    const text = newText.get(result.file) ?? "";
    const declarationLine = lineText(text, result.line);

    if (result.type === "rebind-token" && result.tier !== "comp") {
      // A system token feeds every component that uses the role: no single document can be named.
      push({ ...base, kind: "system-token", reason: "system-token-changed", file: relW(result.file), line: result.line, excerpt: declarationLine.trim().slice(0, 200) });
    }
    if (result.type === "rebind-declaration") {
      // Component stylesheet declarations are not tabulated anywhere.
      push({ ...base, kind: "declaration", reason: "declaration-not-documented", file: relW(result.file), line: result.line, excerpt: declarationLine.trim().slice(0, 200) });
    }
    // A comment beside the rewritten declaration probably describes the old value.
    const comment = /\/\*.*?\*\//.exec(commentsOnly(declarationLine));
    if (comment) push({ ...base, kind: "comment", reason: "comment-on-rewritten-line", file: relW(result.file), line: result.line, excerpt: comment[0].slice(0, 200) });
  }

  for (const row of skipped) {
    const result = results.find((r) => r.id === row.opId);
    const base = change(result);
    if (row.file) {
      const text = readText(row.file);
      const contract = text ? parseTokenContract(text) : null;
      const line = row.line ?? (contract?.ok ? contract.headingLine : 1);
      push({ ...base, kind: "spec-row", reason: row.reason, file: relW(row.file), line, excerpt: text ? lineText(text, line).trim().slice(0, 200) : "", actual: row.actual ?? null });
    } else {
      push({ ...base, kind: "spec-row", reason: row.reason, file: relW(result.file), line: result.line, excerpt: lineText(newText.get(result.file) ?? "", result.line).trim().slice(0, 200), actual: null });
    }
  }

  if (config.governance.proseScan) {
    for (const result of results) {
      if (result.type === "rebind-token" && result.tier !== "comp") continue;
      const term = shortNameOf(result.fromToken, prefix, componentIds);
      if (!searchable(term)) continue;
      const base = change(result);
      const names = new Set(otherNames);
      names.delete(term.toLowerCase());
      const spec = result.type === "rebind-token" ? specFileForToken(result.token, prefix, specFiles) : null;
      const componentId =
        result.type === "rebind-declaration"
          ? cssFiles.find((f) => f.devId === result.file)?.componentId ?? null
          : spec?.componentId ?? componentIds.filter((id) => result.token.startsWith(`--${prefix}-comp-${id}-`)).sort((a, b) => b.length - a.length)[0] ?? null;
      if (!componentId) continue;
      const mention = (abs, text) => {
        for (const hit of findMentions(text, term, names)) push({ ...base, kind: "mention", reason: "mentions-old-name", term, file: relW(abs), line: hit.line, excerpt: hit.excerpt });
      };
      // The component's specification. A rewritten cell holds a custom property name, which is never a mention.
      const specFile = specFiles.find((f) => f.componentId === componentId);
      if (specFile) {
        const text = newText.get(specFile.abs) ?? readText(specFile.abs);
        if (text) mention(specFile.abs, text);
      }
      // Stylesheet comments, component sources and stories of the same component.
      const directories = new Set();
      for (const file of cssFiles.filter((f) => f.componentId === componentId)) {
        const text = newText.get(file.devId) ?? readText(file.devId);
        if (text) mention(file.devId, commentsOnly(text));
        directories.add(path.dirname(file.devId));
      }
      for (const dir of directories) {
        let names = [];
        try {
          names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && SOURCE_EXTENSIONS.has(path.extname(e.name))).map((e) => e.name).sort();
        } catch {
          names = [];
        }
        for (const name of names) {
          const abs = path.join(dir, name);
          const text = readText(abs);
          if (text) mention(abs, text);
        }
      }
    }
  }
  if (entries.length <= MAX_ENTRIES_PER_APPLY) return entries;
  // Never silently drop: the last entry says how many more there are.
  const kept = entries.slice(0, MAX_ENTRIES_PER_APPLY - 1);
  const first = entries[MAX_ENTRIES_PER_APPLY - 1];
  kept.push({ operation: null, token: null, property: null, oldToken: null, newToken: null, kind: "truncated", reason: "too-many-entries", file: first.file, line: first.line, excerpt: String(entries.length - kept.length) });
  return kept;
}

/**
 * Contract drift: documented rows that disagree with the token files, and
 * component tokens no row documents.
 * Returns { rows, undocumented, items: [{ file, line, token, documented, actual }] }.
 */
export function contractDrift({ config, index, specFiles }) {
  if (!config.governance.componentSpecsDir) return null;
  const relW = (abs) => relativePosix(config.workspaceRoot, abs);
  const tokens = index.tokenIndex.tokens;
  const documented = new Set();
  const items = [];
  for (const spec of specFiles) {
    const text = readText(spec.abs);
    const contract = text ? parseTokenContract(text) : null;
    if (!contract?.ok) continue;
    for (const row of contract.rows) {
      const token = tokens.get(row.cells[0].text);
      if (!token || token.tier !== "comp" || token.source !== "tier") continue;
      documented.add(token.name);
      const actual = token.alias ?? token.declaredValue;
      if (row.cells[1].text !== actual) items.push({ file: relW(spec.abs), line: row.line, token: token.name, documented: row.cells[1].text, actual });
    }
  }
  let undocumented = 0;
  for (const token of tokens.values()) if (token.tier === "comp" && token.source === "tier" && !documented.has(token.name)) undocumented += 1;
  return { rows: items.length, undocumented, items: items.slice(0, 50) };
}
