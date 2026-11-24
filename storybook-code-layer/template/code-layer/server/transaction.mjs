// The write path. One engine per dev server; requests are serialised.
//
// apply: validate -> fresh index -> mirror precondition -> resolve -> patch
//   with proofs -> (token batches) blocking checks on a candidate tree ->
//   backups + pending journal record (fsync) -> rename-write source of truth,
//   mirror, component CSS (each re-hashed just before) -> committed ->
//   re-announce watched files ~60 ms later.
// A failing check writes nothing. Only an I/O failure needs a rollback.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { ApiError } from "../shared/api-contract.mjs";
import { checkScriptProblems, runChecks } from "./checks.mjs";
import { decodeCss, diskHash, servedTextHashSync } from "./css-source.mjs";
import { buildIndex } from "./index-builder.mjs";
import { Journal, newApplyId } from "./journal.mjs";
import { resolveOperations, validateBatch } from "./operations.mjs";
import { patchFile } from "./patcher.mjs";
import { isInside, listCssFiles, realpathChain, relativePosix, writableProblems } from "./paths.mjs";
import { acquireLock, recoverUnfinished } from "./recovery.mjs";

const ROLE_ORDER = { "token-source": 0, "token-mirror": 1, "component-css": 2 };

export function createEngine({ config, postcss, log = { info() {}, warn() {}, error() {} }, notifyChanged = () => {}, port = null }) {
  const journal = new Journal(config.stateDir);
  const tmpDir = path.join(config.stateDir, "tmp");
  const stageRoot = path.join(config.stateDir, "stage");
  fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(stageRoot, { recursive: true, mode: 0o700 });
  const readOnly = [];
  let baseline = null;
  const relW = (abs) => relativePosix(config.workspaceRoot, abs);

  // Closed writable set, enumerated once; realpath chains recorded now.
  const comp = config.tokens.tiers.find((t) => t.writable) ?? null;
  const mirrors = [config.tokens.entry, ...config.tokens.tiers].map((t) => t.mirror).filter(Boolean);
  const targets = [...new Set([comp?.source, ...mirrors, ...config.components.roots.flatMap((root) => listCssFiles(root))].filter(Boolean))];
  const chains = new Map();
  const stateDev = fs.statSync(config.stateDir).dev;
  for (const target of targets) {
    try {
      if (fs.statSync(path.dirname(target)).dev !== stateDev) {
        log.warn(`${relW(target)} is on another volume than the state directory; it stays read-only`);
        continue;
      }
      chains.set(target, realpathChain(target));
    } catch {
      // missing file: not writable
    }
  }
  for (const dir of [config.stateDir, tmpDir, stageRoot]) {
    if (fs.lstatSync(dir).isSymbolicLink()) readOnly.push({ code: "state-dir-symlink", message: `${dir} must not be a symlink` });
  }

  const lock = acquireLock(config.stateDir, { port });
  if (!lock.ok) {
    readOnly.push({ code: "locked", message: `另一個 dev server（pid ${lock.owner.pid}）持有 ${lock.file}；請只執行一個 Storybook，或在確認它已停止後刪除這個檔案。` });
  } else {
    const result = recoverUnfinished(journal, { writeFile: rawWrite, log: (m) => log.info(m) });
    if (result.restored.length) scheduleNotify(result.restored);
    if (result.conflicts.length) {
      readOnly.push({
        code: "recovery-required",
        message: "上次中斷的寫入有檔案在之後被改過，Code Layer 不會覆蓋它們。請比對檔案與備份後手動處理。",
        details: result.conflicts.map((c) => ({ ...c, backup: path.join(config.stateDir, c.backup ?? "") })),
      });
    }
  }

  let queue = Promise.resolve();
  const serialize = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  function rawWrite(target, bytes) {
    const { mode } = fs.statSync(target);
    const temp = path.join(tmpDir, `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`);
    const fd = fs.openSync(temp, "wx", 0o600);
    try {
      fs.writeSync(fd, bytes);
      fs.fchmodSync(fd, mode & 0o7777);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, target);
    try {
      const dirFd = fs.openSync(path.dirname(target), "r");
      fs.fsyncSync(dirFd);
      fs.closeSync(dirFd);
    } catch {
      // directory fsync is best effort
    }
  }

  function scheduleNotify(paths) {
    const watched = [...new Set(paths)].filter((p) => isInside(config.projectRoot, p));
    if (watched.length === 0) return;
    setTimeout(() => notifyChanged(watched), 60).unref?.();
  }

  function assertWritable(abs) {
    if (!chains.has(abs)) throw new ApiError("read-only", `${relW(abs)} is not in the writable set`);
    const problems = writableProblems(abs, chains.get(abs));
    if (problems.length) throw new ApiError("read-only", `${relW(abs)} cannot be written: ${problems.join(", ")}`, { file: relW(abs), problems });
  }

  function mirrorDrift(index) {
    const drift = index.tokenIndex.mirrors.filter((m) => !m.inSync);
    if (drift.length === 0) return null;
    return drift.map((m) => {
      const source = path.join(config.workspaceRoot, m.source);
      const mirror = path.join(config.workspaceRoot, m.mirror);
      const mtime = (f) => {
        try {
          return fs.statSync(f).mtime.toISOString();
        } catch {
          return null;
        }
      };
      return { ...m, sourceModified: mtime(source), mirrorModified: mtime(mirror) };
    });
  }

  async function ensureBaseline(index) {
    if (baseline && baseline.revision === index.revision) return baseline;
    const problems = checkScriptProblems(config.checks);
    if (problems.length) {
      baseline = { revision: index.revision, ok: false, problems, results: [] };
      return baseline;
    }
    const result = await runChecks(config.checks, { candidateRoot: config.workspaceRoot });
    baseline = { revision: index.revision, ok: result.ok, problems: [], results: result.results, ranAt: new Date().toISOString() };
    if (!result.ok) log.warn(`baseline checks fail on the untouched project: ${result.results.map((r) => r.id).join(", ")}`);
    return baseline;
  }

  /** Copy of the source-of-truth token files (with planned bytes) for the checks. */
  function buildCandidateTree(plans) {
    const dir = path.join(stageRoot, newApplyId("stage"));
    const planned = new Map(plans.filter((p) => p.role === "token-source").map((p) => [p.abs, p.newBytes]));
    for (const source of [config.tokens.entry.source, ...config.tokens.tiers.map((t) => t.source)]) {
      const relative = path.relative(config.workspaceRoot, source);
      if (relative.startsWith("..")) throw new ApiError("checks-unavailable", `${source} is outside the workspace root`);
      const target = path.join(dir, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, planned.get(source) ?? fs.readFileSync(source));
    }
    const architecture = path.join(config.workspaceRoot, "design-system", "TOKEN_ARCHITECTURE.md");
    if (fs.existsSync(architecture)) {
      const target = path.join(dir, "design-system", "TOKEN_ARCHITECTURE.md");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(architecture, target);
    }
    return dir;
  }

  async function runTokenChecks(plans, index) {
    if (config.checks.length === 0 || !plans.some((p) => p.role === "token-source")) return [];
    const base = await ensureBaseline(index);
    if (base.problems.length) throw new ApiError("checks-unavailable", "檢查腳本不存在或已變更，token 類的套用已停用。", { problems: base.problems });
    if (!base.ok) throw new ApiError("checks-baseline-failing", "專案在未修改的狀態下就無法通過檢查，token 類的套用已停用。", { results: base.results });
    const dir = buildCandidateTree(plans);
    try {
      const result = await runChecks(config.checks, { candidateRoot: dir });
      if (!result.ok) throw new ApiError("check-failed", "檢查沒有通過，沒有寫入任何檔案。", { results: result.results });
      return result.results;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function writePlans(transactionId, plans) {
    const written = [];
    try {
      for (const plan of plans) {
        if (diskHash(fs.readFileSync(plan.abs)) !== plan.beforeHash) {
          throw new ApiError("stale-before", `${relW(plan.abs)} changed while the transaction was running`);
        }
        rawWrite(plan.abs, plan.newBytes);
        written.push(plan);
        if (diskHash(fs.readFileSync(plan.abs)) !== plan.afterHash) throw new ApiError("write-failed", `${relW(plan.abs)} did not read back as written`);
        if (process.env.CODE_LAYER_TEST_PAUSE_AFTER_FIRST_WRITE === "1" && written.length === 1) {
          fs.writeFileSync(path.join(config.stateDir, "test-paused"), transactionId);
          // Test hook: block here so a test can kill the process mid-transaction.
          const shared = new Int32Array(new SharedArrayBuffer(4));
          for (;;) Atomics.wait(shared, 0, 0, 1000);
        }
      }
    } catch (error) {
      const failedRestores = [];
      for (const plan of [...written].reverse()) {
        try {
          rawWrite(plan.abs, plan.beforeBytes);
          if (diskHash(fs.readFileSync(plan.abs)) !== plan.beforeHash) failedRestores.push(relW(plan.abs));
        } catch {
          failedRestores.push(relW(plan.abs));
        }
      }
      if (failedRestores.length) {
        journal.append({ type: "rollback-failed", applyId: transactionId, files: failedRestores });
        readOnly.push({ code: "rollback-failed", message: `回滾失敗：${failedRestores.join("、")}。請用備份手動還原。` });
      } else {
        journal.append({ type: "rolled-back", applyId: transactionId, reason: error.code ?? error.message });
      }
      scheduleNotify(written.map((p) => p.abs));
      throw error instanceof ApiError ? error : new ApiError("write-failed", error.message);
    }
  }

  function expectations(plans, operationSummaries) {
    const css = plans
      .filter((p) => p.role === "component-css")
      .map((p) => {
        const decoded = decodeCss(p.newBytes);
        return { file: relativePosix(config.projectRoot, p.abs), devId: p.abs, servedTextHashAfter: decoded.ok ? servedTextHashSync(decoded.text) : null };
      });
    const tokens = operationSummaries.filter((o) => o.type === "rebind-token").map((o) => ({ token: o.token, value: o.value }));
    return { css, tokens };
  }

  function requireWritable() {
    if (readOnly.length) throw new ApiError("read-only", readOnly.map((r) => r.message).join(" "), { reasons: readOnly });
  }

  async function apply(body, { dryRun = false } = {}) {
    return serialize(async () => {
      requireWritable();
      const batch = validateBatch(body, config.limits);
      const index = buildIndex({ config, postcss });
      const drift = mirrorDrift(index);
      if (drift) throw new ApiError("mirror-drift", "真相檔與鏡像不一致，所有套用都已停用。請先執行 sync-mirror。", { mirrors: drift });
      const { files, results } = resolveOperations(batch, { config, postcss, index });
      const plans = [];
      for (const [abs, entry] of files) {
        assertWritable(abs);
        const patched = patchFile(postcss, entry.source, entry.root, entry.edits);
        plans.push({ abs, role: entry.role, beforeBytes: entry.source.bytes, beforeHash: entry.source.diskHash, newBytes: patched.newBytes, afterHash: diskHash(patched.newBytes), spans: patched.spans });
      }
      for (const plan of [...plans]) {
        if (plan.role !== "token-source" || !comp?.mirror) continue;
        assertWritable(comp.mirror);
        const mirrorBytes = fs.readFileSync(comp.mirror);
        if (!mirrorBytes.equals(plan.beforeBytes)) throw new ApiError("mirror-drift", "鏡像與真相不一致。", { mirrors: [{ mirror: relW(comp.mirror) }] });
        plans.push({ abs: comp.mirror, role: "token-mirror", beforeBytes: mirrorBytes, beforeHash: diskHash(mirrorBytes), newBytes: plan.newBytes, afterHash: plan.afterHash, spans: plan.spans });
      }
      plans.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
      const checks = await runTokenChecks(plans, index);
      const summaries = results.map((r) => ({ id: r.id, type: r.type, token: r.token ?? null, file: r.cssFile ?? relW(r.file), line: r.line, before: r.before, after: r.after, value: r.after }));
      const response = {
        ok: true,
        dryRun,
        batchId: batch.batchId,
        indexRevision: index.revision,
        results: summaries,
        files: plans.map((p) => ({ file: relW(p.abs), role: p.role, beforeHash: p.beforeHash, afterHash: p.afterHash, edits: p.spans.map((s) => ({ line: s.line, before: s.fromName, after: s.toName })) })),
        checks: checks.map((c) => ({ id: c.id, ok: c.ok, durationMs: c.durationMs })),
        expect: expectations(plans, summaries),
      };
      if (dryRun) return response;
      const applyId = newApplyId("apply");
      const fileRecords = plans.map((p, i) => ({
        path: p.abs,
        rel: relW(p.abs),
        role: p.role,
        beforeHash: p.beforeHash,
        afterHash: p.afterHash,
        backup: journal.backup(applyId, i, p.beforeBytes),
      }));
      journal.append({ type: "pending", applyId, kind: "apply", batchId: batch.batchId, operations: summaries, files: fileRecords, client: batch.client ?? null });
      writePlans(applyId, plans);
      journal.append({ type: "committed", applyId, checks: response.checks });
      scheduleNotify(plans.map((p) => p.abs));
      log.info(`applied ${applyId}: ${summaries.map((s) => `${s.token ?? s.file}:${s.line} ${s.before} -> ${s.after}`).join("; ")}`);
      return { ...response, applyId };
    });
  }

  async function undo(body) {
    return serialize(async () => {
      requireWritable();
      const applyId = body?.applyId;
      const stack = journal.undoStack();
      if (stack.length === 0) throw new ApiError("nothing-to-undo", "沒有可以還原的套用。");
      const top = stack[stack.length - 1];
      if (applyId !== top) throw new ApiError("not-latest", "只能還原最近一次套用。", { latest: top });
      const tx = journal.transactions().get(top);
      const conflicts = [];
      for (const file of tx.pending.files) {
        let current = null;
        try {
          current = diskHash(fs.readFileSync(file.path));
        } catch {
          current = null;
        }
        if (current !== file.afterHash) conflicts.push({ file: file.rel, backup: path.join(config.stateDir, file.backup) });
      }
      if (conflicts.length) {
        throw new ApiError("undo-conflict", "套用之後這些檔案又被改過，無法自動還原。可以略過這一筆，備份會保留。", { conflicts });
      }
      const plans = tx.pending.files.map((file) => {
        const current = fs.readFileSync(file.path);
        assertWritable(file.path);
        return { abs: file.path, role: file.role, beforeBytes: current, beforeHash: file.afterHash, newBytes: journal.readBackup(file.backup), afterHash: file.beforeHash, spans: [] };
      });
      const index = buildIndex({ config, postcss });
      await runTokenChecks(plans, index);
      const undoId = newApplyId("undo");
      journal.append({
        type: "pending",
        applyId: undoId,
        kind: "undo",
        undoes: top,
        files: plans.map((p, i) => ({ path: p.abs, rel: relW(p.abs), role: p.role, beforeHash: p.beforeHash, afterHash: p.afterHash, backup: journal.backup(undoId, i, p.beforeBytes) })),
      });
      writePlans(undoId, plans);
      journal.append({ type: "committed", applyId: undoId });
      journal.append({ type: "undone", applyId: top, by: undoId });
      scheduleNotify(plans.map((p) => p.abs));
      const summaries = (tx.pending.operations ?? []).map((o) => ({ ...o, value: o.before }));
      log.info(`undid ${top} (${undoId})`);
      return { ok: true, undoId, undone: top, files: plans.map((p) => ({ file: relW(p.abs), afterHash: p.afterHash })), expect: expectations(plans, summaries) };
    });
  }

  async function skip(body) {
    return serialize(async () => {
      requireWritable();
      const stack = journal.undoStack();
      const top = stack[stack.length - 1];
      if (!top) throw new ApiError("nothing-to-undo", "沒有可以略過的套用。");
      if (body?.applyId !== top) throw new ApiError("not-latest", "只能略過最近一次套用。", { latest: top });
      journal.append({ type: "skipped", applyId: top });
      return { ok: true, skipped: top };
    });
  }

  async function syncMirror({ dryRun = false } = {}) {
    return serialize(async () => {
      requireWritable();
      const pairs = [config.tokens.entry, ...config.tokens.tiers].filter((t) => t.mirror);
      const plans = [];
      for (const pair of pairs) {
        const truth = fs.readFileSync(pair.source);
        const mirror = fs.existsSync(pair.mirror) ? fs.readFileSync(pair.mirror) : null;
        if (mirror && truth.equals(mirror)) continue;
        if (!mirror) throw new ApiError("read-only", `${relW(pair.mirror)} is missing`);
        assertWritable(pair.mirror);
        plans.push({ abs: pair.mirror, role: "token-mirror", beforeBytes: mirror, beforeHash: diskHash(mirror), newBytes: truth, afterHash: diskHash(truth), spans: [] });
      }
      if (plans.length === 0) return { ok: true, dryRun, changed: [] };
      if (config.checks.length) {
        const index = buildIndex({ config, postcss });
        baseline = null;
        const base = await ensureBaseline(index);
        if (base.problems.length || !base.ok) throw new ApiError("checks-baseline-failing", "真相檔沒有通過檢查，不會用它覆蓋鏡像。", { results: base.results, problems: base.problems });
      }
      const changed = plans.map((p) => relW(p.abs));
      if (dryRun) return { ok: true, dryRun, changed };
      const id = newApplyId("sync");
      journal.append({
        type: "pending",
        applyId: id,
        kind: "sync-mirror",
        files: plans.map((p, i) => ({ path: p.abs, rel: relW(p.abs), role: p.role, beforeHash: p.beforeHash, afterHash: p.afterHash, backup: journal.backup(id, i, p.beforeBytes) })),
      });
      writePlans(id, plans);
      journal.append({ type: "committed", applyId: id });
      scheduleNotify(plans.map((p) => p.abs));
      return { ok: true, dryRun, changed, applyId: id };
    });
  }

  function recordVerification(applyId, result) {
    const tx = journal.transactions().get(applyId);
    if (!tx?.committed) throw new ApiError("not-found", `no committed transaction ${applyId}`);
    const allowed = ["verified", "written-not-observable", "mismatch", "timeout", "inconclusive"];
    if (!result || !allowed.includes(result.status)) throw new ApiError("schema-invalid", "verification.status is invalid");
    const items = Array.isArray(result.items) ? result.items.slice(0, 50).map((i) => ({ id: String(i.id ?? "").slice(0, 64), status: String(i.status ?? "").slice(0, 32) })) : [];
    journal.append({ type: "verification", applyId, reportedBy: "client", result: { status: result.status, items } });
    return { ok: true };
  }

  function state() {
    const transactions = journal.transactions();
    return {
      write: readOnly.length === 0,
      readOnlyReasons: readOnly,
      undoStack: journal.undoStack().map((id) => {
        const tx = transactions.get(id);
        return { applyId: id, committedAt: tx.committed?.at ?? null, operations: tx.pending.operations ?? [], files: tx.pending.files.map((f) => f.rel), verification: tx.verification };
      }),
      baseline: baseline && { ok: baseline.ok, problems: baseline.problems, ranAt: baseline.ranAt ?? null, results: baseline.results.map((r) => ({ id: r.id, ok: r.ok })) },
    };
  }

  return { apply, undo, skip, syncMirror, recordVerification, state, journal, readOnly, ensureBaseline: () => ensureBaseline(buildIndex({ config, postcss })) };
}
