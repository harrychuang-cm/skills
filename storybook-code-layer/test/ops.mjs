// Builders for operations on the v1 fixture, and file-tree snapshots.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

let counter = 0;
export function batch(operations, extra = {}) {
  counter += 1;
  return { schemaVersion: 1, batchId: `g-${counter}`, indexRevision: "sha256:test", operations, ...extra };
}

export function fxTokenOp(token, from, to, id = "op-1") {
  return { id, type: "rebind-token", token, fromToken: from, toToken: to, before: { value: `var(${from})` }, after: { value: `var(${to})` } };
}

export function fxDeclOp({
  id = "op-2",
  file = "src/components/seal/Seal.css",
  ordinal = 0,
  selector = ".fx-seal",
  atRules = [],
  property = "border-radius",
  from = "--fx-comp-seal-shape",
  to = "--fx-sys-shape-corner-md",
  refIndex = 0,
  before = `var(${from})`,
  after = null,
} = {}) {
  return {
    id,
    type: "rebind-declaration",
    file,
    rule: { ordinal, selector, atRules, occurrence: 0 },
    declaration: { property },
    replacements: [{ refIndex, fromToken: from, toToken: to }],
    fromToken: from,
    toToken: to,
    before: { value: before },
    after: { value: after ?? before.split(`var(${from})`).join(`var(${to})`) },
  };
}

function walk(root, visit) {
  const go = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.name === ".code-layer" || entry.name === "node_modules") continue;
      if (entry.isDirectory()) go(full);
      else if (entry.isFile()) visit(full, path.relative(root, full));
    }
  };
  go(root);
}

/** Content hash of every file outside the state directory. */
export function treeHashes(root) {
  const out = {};
  walk(root, (full, relative) => {
    out[relative] = sha(full);
  });
  return out;
}

/** Content hash, modification time and inode of every file outside the state directory. */
export function treeFacts(root) {
  const out = {};
  walk(root, (full, relative) => {
    const s = fs.statSync(full);
    out[relative] = `${sha(full)} ${s.mtimeMs} ${s.ino}`;
  });
  return out;
}

/** Relative paths whose content differs between two treeHashes() results. */
export function changedFiles(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]).sort();
}

/** Replace one line of a file (1-based), asserting what was there. */
export function editLine(file, number, from, to) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  if (lines[number - 1] !== from) throw new Error(`${path.basename(file)}:${number} is ${JSON.stringify(lines[number - 1])}, expected ${JSON.stringify(from)}`);
  lines[number - 1] = to;
  fs.writeFileSync(file, lines.join("\n"));
}

/** 1-based number of the only line that contains `needle`. */
export function lineOf(file, needle) {
  const hits = fs.readFileSync(file, "utf8").split("\n").map((line, i) => (line.includes(needle) ? i + 1 : 0)).filter(Boolean);
  if (hits.length !== 1) throw new Error(`${needle} occurs on ${hits.length} lines of ${path.basename(file)}`);
  return hits[0];
}
