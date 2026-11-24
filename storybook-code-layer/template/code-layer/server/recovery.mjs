// Single-writer lock and crash recovery.
//
// Lock: <stateDir>/lock.json records the owning pid. A live owner other than
// us makes this instance read-only; a dead owner is taken over.
//
// Recovery: for every transaction that started writing but has no terminal
// record, each file is compared with the hashes recorded before the first
// write. Equal to "before": untouched. Equal to "after": restored from the
// backup. Anything else: left alone and the tool stays read-only until a
// person resolves it. Never completes an interrupted write; never overwrites
// a file someone changed since.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { diskHash } from "./css-source.mjs";

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export function acquireLock(stateDir, { port = null } = {}) {
  const file = path.join(stateDir, "lock.json");
  fs.mkdirSync(stateDir, { recursive: true });
  if (fs.existsSync(file)) {
    try {
      const lock = JSON.parse(fs.readFileSync(file, "utf8"));
      if (lock.pid !== process.pid && Number.isInteger(lock.pid) && pidAlive(lock.pid)) {
        return { ok: false, owner: lock, file };
      }
    } catch {
      // unreadable lock: take it over
    }
  }
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  const release = () => {
    try {
      const lock = JSON.parse(fs.readFileSync(file, "utf8"));
      if (lock.pid === process.pid) fs.rmSync(file);
    } catch {
      // ignore
    }
  };
  process.once("exit", release);
  return { ok: true, file, release };
}

export function recoverUnfinished(journal, { writeFile, log = () => {} }) {
  const restored = [];
  const conflicts = [];
  for (const tx of journal.unfinished()) {
    const txRestored = [];
    const txConflicts = [];
    for (const file of tx.pending.files ?? []) {
      let current;
      try {
        current = diskHash(fs.readFileSync(file.path));
      } catch {
        txConflicts.push({ applyId: tx.applyId, file: file.rel, problem: "missing", backup: file.backup });
        continue;
      }
      if (current === file.beforeHash) continue;
      if (current === file.afterHash) {
        writeFile(file.path, journal.readBackup(file.backup));
        if (diskHash(fs.readFileSync(file.path)) !== file.beforeHash) {
          txConflicts.push({ applyId: tx.applyId, file: file.rel, problem: "restore-mismatch", backup: file.backup });
        } else {
          txRestored.push(file.path);
        }
        continue;
      }
      txConflicts.push({ applyId: tx.applyId, file: file.rel, problem: "changed-since", backup: file.backup });
    }
    if (txConflicts.length === 0) {
      journal.append({ type: "recovered", applyId: tx.applyId, restored: txRestored });
      log(`recovered unfinished transaction ${tx.applyId} (${txRestored.length} file(s) restored)`);
    }
    restored.push(...txRestored);
    conflicts.push(...txConflicts);
  }
  return { restored, conflicts };
}
