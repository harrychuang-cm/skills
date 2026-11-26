// The copy of the workspace an agent works on, and its snapshot.
//
// The agent never gets the real workspace: each run copies it to
// <stateDir>/agent/<runId>/work, leaving out dependencies, version control,
// build output, state directories, agent tool settings and whatever the
// binding excludes. Files are cloned when the file system can (APFS), copied
// otherwise. Every copied file is hashed: the snapshot the scope gate and the
// import compare against.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ApiError } from "../../shared/api-contract.mjs";
import { isInside, toPosix } from "../paths.mjs";

/** Directory names never copied, wherever they are. */
export const ALWAYS_EXCLUDED_NAMES = new Set(["node_modules", ".git", ".hg", ".svn", "storybook-static", "dist", "build", ".agent-automation", ".code-layer-agent", ".claude", ".cursor", ".codex", ".agents", ".DS_Store"]);

/** Folders the agent writes its own bookkeeping to inside the copy: never part of a comparison. */
export const BOOKKEEPING = [".agent-automation", ".code-layer-agent"];

export const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

/**
 * Every file of the workspace that a copy would hold, as workspace-relative
 * POSIX paths with sizes. Symbolic links are not followed and not copied.
 */
export function listWorkspace(workspaceRoot, { excludeAbs = [], excludeRel = [] } = {}) {
  const files = [];
  let bytes = 0;
  const skipRel = new Set(excludeRel.map((p) => p.replace(/\/+$/, "")));
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (entry.isSymbolicLink() || ALWAYS_EXCLUDED_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = toPosix(path.relative(workspaceRoot, full));
      if (skipRel.has(rel) || excludeAbs.some((abs) => isInside(abs, full))) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const size = fs.statSync(full).size;
        files.push({ rel, size });
        bytes += size;
      }
    }
  };
  walk(workspaceRoot);
  return { files, bytes };
}

/**
 * Copy the workspace into `target` (which must not exist yet). Refuses before
 * copying anything when the workspace is over a limit.
 * Returns { root, snapshot: Map<rel, sha256>, files, bytes }.
 */
export function createWorkCopy({ workspaceRoot, target, stateDir, exclude = [], maxFiles, maxBytes }) {
  const listed = listWorkspace(workspaceRoot, { excludeAbs: [stateDir], excludeRel: exclude });
  if (listed.files.length > maxFiles || listed.bytes > maxBytes) {
    throw new ApiError("workcopy-too-large", `the workspace has ${listed.files.length} files (${Math.round(listed.bytes / 1048576)} MB); the limit is ${maxFiles} files and ${Math.round(maxBytes / 1048576)} MB`, {
      files: listed.files.length,
      bytes: listed.bytes,
      maxFiles,
      maxBytes,
    });
  }
  fs.mkdirSync(target, { recursive: false, mode: 0o700 });
  const snapshot = new Map();
  for (const file of listed.files) {
    const from = path.join(workspaceRoot, file.rel);
    const to = path.join(target, file.rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    // A clone where the file system has them (APFS); a plain copy elsewhere.
    fs.copyFileSync(from, to, fs.constants.COPYFILE_FICLONE);
    snapshot.set(file.rel, sha256(fs.readFileSync(to)));
  }
  return { root: target, snapshot, files: listed.files.length, bytes: listed.bytes };
}

/**
 * How the copy differs from its snapshot, ignoring the run's bookkeeping folders.
 * Returns { modified: [rel], created: [rel], deleted: [rel] }, each sorted.
 */
export function diffWorkCopy(root, snapshot) {
  const now = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = toPosix(path.relative(root, full));
      if (BOOKKEEPING.some((folder) => rel === folder || rel.startsWith(`${folder}/`))) continue;
      if (entry.isSymbolicLink()) now.set(rel, "symlink");
      else if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) now.set(rel, sha256(fs.readFileSync(full)));
      else now.set(rel, "special");
    }
  };
  walk(root);
  const modified = [];
  const created = [];
  const deleted = [];
  for (const [rel, hash] of now) {
    if (!snapshot.has(rel)) created.push(rel);
    else if (snapshot.get(rel) !== hash) modified.push(rel);
  }
  for (const rel of snapshot.keys()) if (!now.has(rel)) deleted.push(rel);
  return { modified: modified.sort(), created: created.sort(), deleted: deleted.sort() };
}

/** Remove a copy; never anything outside the agent area of the state directory. */
export function removeWorkCopy(root, stateDir) {
  const area = path.join(stateDir, "agent");
  if (!root || !isInside(area, root) || path.resolve(root) === path.resolve(area)) return false;
  fs.rmSync(root, { recursive: true, force: true });
  return true;
}
