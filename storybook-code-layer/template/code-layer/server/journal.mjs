// Append-only journal (one JSON object per line, fsync'd) and file backups.
// The undo stack and pending recovery are derived from it, so they survive
// dev-server restarts. A torn last line is ignored.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function newApplyId(kind = "apply") {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${stamp}-${kind}-${crypto.randomBytes(3).toString("hex")}`;
}

export class Journal {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.file = path.join(stateDir, "journal.jsonl");
    this.backupsDir = path.join(stateDir, "backups");
    fs.mkdirSync(stateDir, { recursive: true });
  }

  append(record) {
    const line = `${JSON.stringify({ ...record, at: new Date().toISOString() })}\n`;
    const fd = fs.openSync(this.file, "a", 0o600);
    try {
      fs.writeSync(fd, line);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  records() {
    if (!fs.existsSync(this.file)) return [];
    const out = [];
    for (const line of fs.readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // torn write: ignore (the transaction never started)
      }
    }
    return out;
  }

  /** Write a backup copy, fsync'd; returns its path relative to the state dir. */
  backup(applyId, index, bytes) {
    const dir = path.join(this.backupsDir, applyId);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${index}.bak`);
    const fd = fs.openSync(file, "wx", 0o600);
    try {
      fs.writeSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return path.relative(this.stateDir, file);
  }

  readBackup(relative) {
    return fs.readFileSync(path.join(this.stateDir, relative));
  }

  /** Per transaction: its pending record and terminal markers. */
  transactions() {
    const map = new Map();
    for (const record of this.records()) {
      if (!record.applyId) continue;
      const entry = map.get(record.applyId) ?? { applyId: record.applyId, pending: null, committed: null, terminal: null, undoneBy: null, skipped: false, verification: null, postApply: null };
      if (record.type === "pending") entry.pending = record;
      else if (record.type === "committed") entry.committed = record;
      else if (["rolled-back", "rollback-failed", "recovered", "recovery-conflict"].includes(record.type)) entry.terminal = record;
      else if (record.type === "undone") entry.undoneBy = record.by;
      else if (record.type === "skipped") entry.skipped = true;
      else if (record.type === "verification") entry.verification = record.result;
      else if (record.type === "post-apply") entry.postApply = record;
      map.set(record.applyId, entry);
    }
    return map;
  }

  /** Committed applies that can still be undone, oldest first. */
  undoStack() {
    return [...this.transactions().values()]
      .filter((t) => t.pending?.kind === "apply" && t.committed && !t.terminal && !t.undoneBy && !t.skipped)
      .map((t) => t.applyId);
  }

  /** Transactions that started writing but never reached a terminal record. */
  unfinished() {
    return [...this.transactions().values()].filter((t) => t.pending && !t.committed && !t.terminal);
  }
}
