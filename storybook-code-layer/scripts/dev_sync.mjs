#!/usr/bin/env node
// Development-time one-way sync: template/code-layer -> <project>/.storybook/code-layer
//
//   node scripts/dev_sync.mjs --project <storybook root> [--state-dir <dir>] [--dry-run]
//
// - Writes only files whose content differs.
// - Remembers what it last wrote in <stateDir>/dev-sync.json and refuses to
//   overwrite a destination file that was changed by someone else since.
// - Never touches project-owned files (code-layer.config.json, INSTALL_RECEIPT.json).
// - Prints whether Storybook must be restarted (server, shared .mjs, preset,
//   manager) or whether the preview will hot-update.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(SKILL_ROOT, "template", "code-layer");
const PROJECT_OWNED = new Set(["code-layer.config.json", "INSTALL_RECEIPT.json"]);
const RESTART_PATTERN = /^(preset\.js|package\.json|server\/|shared\/.*\.mjs$|manager)/;

function flag(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function sha(file) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store" || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

function stateDirFor(project, args) {
  const explicit = flag(args, "--state-dir");
  if (explicit) return path.resolve(explicit);
  const configFile = path.join(project, ".storybook", "code-layer", "code-layer.config.json");
  if (!fs.existsSync(configFile)) {
    throw new Error(`No ${configFile}; pass --state-dir for the first sync.`);
  }
  const raw = JSON.parse(fs.readFileSync(configFile, "utf8"));
  return path.resolve(project, raw.stateDir);
}

function atomicCopy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const temp = `${to}.${process.pid}.${crypto.randomUUID()}.sync-tmp`;
  fs.copyFileSync(from, temp);
  fs.renameSync(temp, to);
}

export function devSync({ project, stateDir, dryRun = false }) {
  const dest = path.join(project, ".storybook", "code-layer");
  const recordFile = path.join(stateDir, "dev-sync.json");
  const record = fs.existsSync(recordFile) ? JSON.parse(fs.readFileSync(recordFile, "utf8")) : { files: {} };
  const sourceFiles = listFiles(TEMPLATE);
  const conflicts = [];
  const writes = [];
  const removals = [];

  for (const rel of sourceFiles) {
    if (PROJECT_OWNED.has(rel)) continue;
    const from = path.join(TEMPLATE, rel);
    const to = path.join(dest, rel);
    const fromHash = sha(from);
    if (fs.existsSync(to)) {
      const toHash = sha(to);
      if (toHash === fromHash) continue;
      const recorded = record.files[rel];
      if (recorded !== toHash) {
        conflicts.push(`${rel}: destination changed outside the sync (expected ${recorded ?? "no record"})`);
        continue;
      }
    }
    writes.push({ rel, from, to, hash: fromHash });
  }
  for (const rel of Object.keys(record.files)) {
    if (sourceFiles.includes(rel)) continue;
    const to = path.join(dest, rel);
    if (!fs.existsSync(to)) continue;
    if (sha(to) !== record.files[rel]) conflicts.push(`${rel}: removed from the template but changed in the destination`);
    else removals.push({ rel, to });
  }
  if (conflicts.length > 0) return { ok: false, conflicts, writes: [], removals: [] };
  if (!dryRun) {
    for (const write of writes) {
      atomicCopy(write.from, write.to);
      record.files[write.rel] = write.hash;
    }
    for (const removal of removals) {
      fs.rmSync(removal.to);
      delete record.files[removal.rel];
    }
    for (const rel of sourceFiles) {
      if (!PROJECT_OWNED.has(rel) && fs.existsSync(path.join(dest, rel))) record.files[rel] = sha(path.join(dest, rel));
    }
    fs.mkdirSync(stateDir, { recursive: true });
    record.syncedAt = new Date().toISOString();
    fs.writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  }
  const changed = [...writes.map((w) => w.rel), ...removals.map((r) => r.rel)];
  return {
    ok: true,
    dryRun,
    changed,
    restartNeeded: changed.some((rel) => RESTART_PATTERN.test(rel)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const project = flag(args, "--project");
  if (!project) {
    process.stderr.write("usage: dev_sync.mjs --project <storybook root> [--state-dir <dir>] [--dry-run]\n");
    process.exit(2);
  }
  try {
    const result = devSync({ project: path.resolve(project), stateDir: stateDirFor(path.resolve(project), args), dryRun: args.includes("--dry-run") });
    if (!result.ok) {
      process.stderr.write(`Refused: ${result.conflicts.join("\n")}\n`);
      process.exit(1);
    }
    process.stdout.write(`${result.dryRun ? "Would write" : "Wrote"} ${result.changed.length} file(s)${result.changed.length ? `:\n  ${result.changed.join("\n  ")}` : ""}\n`);
    process.stdout.write(result.changed.length === 0 ? "Nothing changed.\n" : result.restartNeeded ? "需要重啟 Storybook（server／shared／preset／manager 有變動）。\n" : "preview 會熱更新。\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
