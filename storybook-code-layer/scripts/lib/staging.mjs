// Atomic installer runs: every write and delete is staged, each target is
// backed up before it is replaced, and any failure puts back every file that
// was touched and removes every file that was created.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * Keep the file that is about to be replaced or deleted, as the very same file
 * (same inode, same modification time), so a rollback puts back exactly what
 * was there. A delete moves it aside; a replace keeps a second name for it
 * (the new content is then renamed over the first), falling back to a copy
 * where hard links are not available.
 */
function keepOriginal(target, backup, moveAway) {
  if (moveAway) {
    fs.renameSync(target, backup);
    return;
  }
  try {
    fs.linkSync(target, backup);
  } catch {
    const stat = fs.statSync(target);
    fs.copyFileSync(target, backup);
    fs.chmodSync(backup, stat.mode & 0o777);
    fs.utimesSync(backup, stat.atime, stat.mtime);
  }
}

/**
 * operations: [{ kind: "write", target, data } | { kind: "delete", target }]
 * stagingParent: a directory on the same volume as the targets.
 * failAfter: test hook — throw after that many operations were performed.
 * Returns { performed: number } or throws after rolling everything back.
 */
export function runStaged(operations, { stagingParent, failAfter = null }) {
  const staging = path.join(stagingParent, `.code-layer-install-${process.pid}-${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(path.join(staging, "new"), { recursive: true });
  fs.mkdirSync(path.join(staging, "old"), { recursive: true });
  const done = [];
  const createdDirs = [];
  try {
    // Stage every new content first: nothing in the project has changed yet.
    operations.forEach((operation, index) => {
      if (operation.kind !== "write") return;
      const staged = path.join(staging, "new", String(index));
      const fd = fs.openSync(staged, "wx", 0o644);
      try {
        fs.writeSync(fd, operation.data);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    });
    operations.forEach((operation, index) => {
      if (failAfter !== null && done.length >= failAfter) throw new Error(`injected failure after ${failAfter} operation(s)`);
      const existed = fs.existsSync(operation.target);
      const backup = path.join(staging, "old", String(index));
      if (existed) keepOriginal(operation.target, backup, operation.kind === "delete");
      if (operation.kind === "write") {
        for (let dir = path.dirname(operation.target); !fs.existsSync(dir); dir = path.dirname(dir)) createdDirs.push(dir);
        fs.mkdirSync(path.dirname(operation.target), { recursive: true });
        const staged = path.join(staging, "new", String(index));
        if (existed) fs.chmodSync(staged, fs.statSync(operation.target).mode & 0o777);
        fs.renameSync(staged, operation.target);
      }
      // A delete was already performed by moving the file into the staging directory.
      done.push({ operation, existed, backup });
    });
    fs.rmSync(staging, { recursive: true, force: true });
    return { performed: done.length };
  } catch (error) {
    const failures = [];
    for (const { operation, existed, backup } of done.reverse()) {
      try {
        if (existed) fs.renameSync(backup, operation.target);
        else fs.rmSync(operation.target, { force: true });
      } catch (restoreError) {
        failures.push(`${operation.target}: ${restoreError.message}`);
      }
    }
    // Directories this run created are removed again when empty.
    for (const dir of createdDirs.sort((a, b) => b.length - a.length)) {
      try {
        fs.rmdirSync(dir);
      } catch {
        // not empty or already gone
      }
    }
    if (failures.length === 0) fs.rmSync(staging, { recursive: true, force: true });
    const wrapped = new Error(failures.length === 0 ? error.message : `${error.message}; could not restore: ${failures.join("; ")} (backups are in ${staging})`);
    wrapped.code = failures.length === 0 ? "write-failed" : "rollback-failed";
    throw wrapped;
  }
}

/** Remove directories under `root` (and `root` itself) that are empty, deepest first. */
export function removeEmptyDirs(root) {
  if (!fs.existsSync(root)) return [];
  const removed = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) walk(path.join(dir, entry.name));
    if (fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      removed.push(dir);
    }
  };
  walk(root);
  return removed;
}
