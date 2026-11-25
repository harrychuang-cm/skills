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
import { replaceVarName } from "../shared/value-refs.mjs";
import { resolveOperations, validateBatch } from "./operations.mjs";
import { patchFile } from "./patcher.mjs";
import { pairingReport } from "./pairing.mjs";
import { isInside, listCssFiles, realpathChain, relativePosix, writableProblems } from "./paths.mjs";
import { PendingDocs, collectPending, contractDrift } from "./pending-docs.mjs";
import { createPostApply } from "./post-apply.mjs";
import { acquireLock, recoverUnfinished } from "./recovery.mjs";
import { listSpecFiles, patchSpec, planSpecEdits } from "./spec-rows.mjs";

// Write order: files the dev server does not watch first (the source of truth
// and the specification), then the ones whose change reaches the page.
const ROLE_ORDER = { "token-source": 0, "spec": 1, "token-mirror": 2, "component-css": 3 };

export function createEngine({ config, postcss, log = { info() {}, warn() {}, error() {} }, notifyChanged = () => {}, port = null }) {
  const journal = new Journal(config.stateDir);
  const pendingDocs = new PendingDocs(config.stateDir);
  const postApply = createPostApply({ config, journal, log });
  const tmpDir = path.join(config.stateDir, "tmp");
  const stageRoot = path.join(config.stateDir, "stage");
  fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(stageRoot, { recursive: true, mode: 0o700 });
  const readOnly = [];
  let baseline = null;
  const relW = (abs) => relativePosix(config.workspaceRoot, abs);

  // Closed writable set, enumerated once; realpath chains recorded now:
  // writable tier files, every mirror, component stylesheets, and the
  // component specifications that document re-bound tokens.
  const writableTiers = config.tokens.tiers.filter((t) => t.writable);
  const mirrors = [config.tokens.entry, ...config.tokens.tiers].map((t) => t.mirror).filter(Boolean);
  const specFiles = listSpecFiles(config.governance.componentSpecsDir);
  const targets = [
    ...new Set(
      [...writableTiers.map((t) => t.source), ...mirrors, ...config.components.roots.flatMap((root) => listCssFiles(root)), ...specFiles.map((f) => f.abs)].filter(Boolean),
    ),
  ];
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
    readOnly.push({ code: "locked", message: `another dev server (pid ${lock.owner.pid}) holds ${lock.file}; run only one Storybook, or delete this file once that process has stopped` });
  } else {
    const result = recoverUnfinished(journal, { writeFile: rawWrite, log: (m) => log.info(m) });
    if (result.restored.length) scheduleNotify(result.restored);
    if (result.conflicts.length) {
      readOnly.push({
        code: "recovery-required",
        message: "files of an interrupted write were changed afterwards; they are not overwritten. Compare them with the backups and resolve by hand.",
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

  /** Mirror pairs that differ from their source of truth (with line counts and modification times), or null. */
  function mirrorDrift(index) {
    const drift = index.tokenIndex.mirrors.filter((m) => !m.inSync);
    return drift.length === 0 ? null : drift;
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
    if (base.problems.length) throw new ApiError("checks-unavailable", "a check script is missing or has changed; token operations are refused", { problems: base.problems });
    if (!base.ok) throw new ApiError("checks-baseline-failing", "the unmodified project already fails a check; token operations are refused", { results: base.results });
    const dir = buildCandidateTree(plans);
    try {
      const result = await runChecks(config.checks, { candidateRoot: dir });
      if (!result.ok) throw new ApiError("check-failed", "a check failed on the candidate tree; nothing was written", { results: result.results });
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
        readOnly.push({ code: "rollback-failed", message: `rollback failed for ${failedRestores.join(", ")}; restore them from the backups by hand` });
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

  /**
   * One batch through the whole write path. `kind` is "apply" for a batch from
   * the panel and "reverse" for the inverse of an earlier apply (`undoes`).
   * Must run inside `serialize`.
   */
  async function runBatch(body, { dryRun = false, kind = "apply", undoes = null } = {}) {
    requireWritable();
    const batch = validateBatch(body, config.limits);
    const index = buildIndex({ config, postcss });
    const drift = mirrorDrift(index);
    if (drift) throw new ApiError("mirror-drift", "the source of truth and its mirror differ; every batch is refused until the mirror is synchronised", { mirrors: drift });
    const { files, results } = resolveOperations(batch, { config, postcss, index });
    const plans = [];
    for (const [abs, entry] of files) {
      assertWritable(abs);
      const patched = patchFile(postcss, entry.source, entry.root, entry.edits);
      plans.push({ abs, role: entry.role, beforeBytes: entry.source.bytes, beforeHash: entry.source.diskHash, newBytes: patched.newBytes, afterHash: diskHash(patched.newBytes), spans: patched.spans });
    }
    for (const plan of [...plans]) {
      if (plan.role !== "token-source") continue;
      const mirror = config.tokens.tiers.find((t) => t.source === plan.abs)?.mirror ?? null;
      if (!mirror) continue;
      assertWritable(mirror);
      const mirrorBytes = fs.readFileSync(mirror);
      if (!mirrorBytes.equals(plan.beforeBytes)) throw new ApiError("mirror-drift", "the mirror differs from the source of truth", { mirrors: [{ mirror: relW(mirror) }] });
      plans.push({ abs: mirror, role: "token-mirror", beforeBytes: mirrorBytes, beforeHash: diskHash(mirrorBytes), newBytes: plan.newBytes, afterHash: plan.afterHash, spans: plan.spans });
    }
    // A re-bound component token is documented by a row of its specification.
    // An eligible row is rewritten in this same transaction; when its file is
    // in the writable set but cannot be written safely the batch is refused,
    // so a token and its documented row never change apart.
    const specPlan = config.governance.componentSpecsDir
      ? planSpecEdits({
          prefix: config.tokens.prefix,
          specFiles,
          changes: results.filter((r) => r.type === "rebind-token" && r.tier === "comp").map((r) => ({ opId: r.id, token: r.token, fromToken: r.fromToken, toToken: r.toToken })),
        })
      : { files: new Map(), documents: [], skipped: [] };
    for (const [abs, entry] of specPlan.files) {
      assertWritable(abs);
      let patched;
      try {
        patched = patchSpec(entry.source, entry.edits);
      } catch (error) {
        throw new ApiError("proof-failed", `${relW(abs)}: ${error.message}`);
      }
      plans.push({ abs, role: "spec", beforeBytes: entry.source.bytes, beforeHash: entry.source.diskHash, newBytes: patched.newBytes, afterHash: diskHash(patched.newBytes), spans: patched.spans });
    }
    const documents = specPlan.documents.map((d) => ({ operation: d.opId, token: d.token, file: relW(d.file), line: d.line, before: d.before, after: d.after }));
    const skippedRows = specPlan.skipped.map((k) => ({ operation: k.opId, token: k.token, reason: k.reason, file: k.file ? relW(k.file) : null, line: k.line, actual: k.actual }));
    plans.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
    const checks = await runTokenChecks(plans, index);
    // Each summary is journaled; it carries enough to rebuild the inverse operation later.
    const summaries = results.map((r) => ({
      id: r.id,
      type: r.type,
      token: r.token ?? null,
      tier: r.tier ?? null,
      file: r.cssFile ?? relW(r.file),
      line: r.line,
      before: r.before,
      after: r.after,
      value: r.after,
      fromToken: r.fromToken,
      toToken: r.toToken,
      rule: r.rule ?? null,
      property: r.property ?? null,
      refIndex: r.refIndex ?? 0,
    }));
    const response = {
      ok: true,
      dryRun,
      batchId: batch.batchId,
      indexRevision: index.revision,
      results: summaries,
      files: plans.map((p) => ({ file: relW(p.abs), role: p.role, beforeHash: p.beforeHash, afterHash: p.afterHash, edits: p.spans.map((s) => ({ line: s.line, before: s.fromName, after: s.toName })) })),
      checks: checks.map((c) => ({ id: c.id, ok: c.ok, durationMs: c.durationMs })),
      expect: expectations(plans, summaries),
      // Specification rows rewritten with this batch, and rows that could not be identified exactly.
      documents,
      specRowsSkipped: skippedRows,
      // Container and content color pairs touched by this batch: warnings and contrast, never a refusal.
      pairing: pairingReport({ config, index, results }),
    };
    if (dryRun) return response;
    const applyId = newApplyId(kind);
    const fileRecords = plans.map((p, i) => ({
      path: p.abs,
      rel: relW(p.abs),
      role: p.role,
      beforeHash: p.beforeHash,
      afterHash: p.afterHash,
      backup: journal.backup(applyId, i, p.beforeBytes),
    }));
    journal.append({ type: "pending", applyId, kind, ...(undoes ? { undoes } : {}), batchId: batch.batchId, operations: summaries, files: fileRecords, documents, client: batch.client ?? null });
    writePlans(applyId, plans);
    journal.append({ type: "committed", applyId, checks: response.checks });
    scheduleNotify(plans.map((p) => p.abs));
    log.info(`${kind === "reverse" ? "reversed" : "applied"} ${applyId}: ${summaries.map((s) => `${s.token ?? s.file}:${s.line} ${s.before} -> ${s.after}`).join("; ")}`);
    // What this write left out of date and could not rewrite with certainty.
    // A reverse apply returns to a documented state, so it records nothing.
    let pending = [];
    if (kind === "apply") {
      try {
        const newText = new Map(plans.map((p) => [p.abs, decodeCss(p.newBytes)]).filter(([, d]) => d.ok).map(([abs, d]) => [abs, d.text]));
        pending = pendingDocs.add(applyId, collectPending({ config, index, specFiles, results, skipped: specPlan.skipped, newText }));
      } catch (error) {
        // The files are written and journaled; a failure to list follow-ups must not look like a failed apply.
        log.warn(`could not record documents pending sync for ${applyId}: ${error.message}`);
      }
    }
    return { ...response, applyId, pending, postApply: postApply.schedule(applyId) };
  }

  async function apply(body, options = {}) {
    return serialize(() => runBatch(body, { dryRun: options.dryRun === true }));
  }

  /** The latest apply that can still be undone, or an ApiError. */
  function latestUndoable(applyId, verb) {
    const stack = journal.undoStack();
    if (stack.length === 0) throw new ApiError("nothing-to-undo", `there is no apply to ${verb}`);
    const top = stack[stack.length - 1];
    if (applyId !== top) throw new ApiError("not-latest", `only the most recent apply can be ${verb === "skip" ? "skipped" : verb === "reverse" ? "reversed" : "undone"}`, { latest: top });
    return journal.transactions().get(top);
  }

  /** The journaled operations can be inverted: each names both tokens and, for a declaration, its locator. */
  function reversible(operations) {
    return (
      Array.isArray(operations) &&
      operations.length > 0 &&
      operations.every((o) => o.fromToken && o.toToken && (o.type === "rebind-token" ? o.token : o.rule && o.property && Number.isInteger(o.refIndex)))
    );
  }

  /**
   * Reverse apply: when a whole-file undo is refused because a file changed
   * since, put back only what the apply changed. Each journaled operation is
   * inverted against the current text (the reference must still hold the token
   * the apply wrote) and the batch goes through the normal write path.
   */
  async function reverse(body) {
    return serialize(async () => {
      requireWritable();
      const tx = latestUndoable(body?.applyId, "reverse");
      const recorded = tx.pending.operations;
      if (!reversible(recorded)) {
        throw new ApiError("reverse-not-applicable", "the journal record of this apply (written by an older version) does not carry what a reverse apply needs; undo whole files or skip it", { applyId: tx.applyId });
      }
      const index = buildIndex({ config, postcss });
      const operations = recorded.map((o, i) => {
        const id = `rev-${i + 1}`;
        if (o.type === "rebind-token") {
          const token = index.tokenIndex.tokens.get(o.token);
          if (!token || token.alias !== o.toToken) {
            throw new ApiError("stale-before", `${o.token} no longer holds what this apply wrote; it cannot be reversed`, { token: o.token, expected: `var(${o.toToken})`, actual: token?.declaredValue ?? null });
          }
          return { id, type: o.type, token: o.token, fromToken: o.toToken, toToken: o.fromToken, before: { value: token.declaredValue }, after: { value: replaceVarName(token.declaredValue, 0, o.toToken, o.fromToken) } };
        }
        const file = index.cssIndex.files.find((f) => f.file === o.file);
        const rule = file?.rules[o.rule.ordinal];
        const sameRule = rule && rule.selector === o.rule.selector && JSON.stringify(rule.atRules) === JSON.stringify(o.rule.atRules) && rule.occurrence === o.rule.occurrence;
        const decl = sameRule ? rule.declarations.filter((d) => d.property === o.property).at(-1) : null;
        const ref = decl?.refs.find((r) => r.refIndex === o.refIndex);
        if (!decl || !ref || ref.name !== o.toToken) {
          throw new ApiError("stale-before", `${o.property} of ${o.rule.selector} in ${o.file} no longer holds what this apply wrote; it cannot be reversed`, { file: o.file, selector: o.rule.selector, property: o.property, expected: o.toToken, actual: decl?.value ?? null });
        }
        return {
          id,
          type: o.type,
          file: o.file,
          rule: o.rule,
          declaration: { property: o.property },
          replacements: [{ refIndex: o.refIndex, fromToken: o.toToken, toToken: o.fromToken }],
          fromToken: o.toToken,
          toToken: o.fromToken,
          before: { value: decl.value },
          after: { value: replaceVarName(decl.value, o.refIndex, o.toToken, o.fromToken) },
        };
      });
      const batchId = `reverse-${tx.applyId}`.slice(0, 64);
      const result = await runBatch({ schemaVersion: 1, batchId, indexRevision: index.revision, operations }, { kind: "reverse", undoes: tx.applyId });
      journal.append({ type: "undone", applyId: tx.applyId, by: result.applyId, mode: "reverse" });
      pendingDocs.removeByApply(tx.applyId);
      return { ok: true, mode: "reverse", undoId: result.applyId, undone: tx.applyId, postApply: result.postApply, results: result.results, files: result.files.map((f) => ({ file: f.file, afterHash: f.afterHash })), expect: result.expect };
    });
  }

  async function undo(body) {
    return serialize(async () => {
      requireWritable();
      const tx = latestUndoable(body?.applyId, "undo");
      const top = tx.applyId;
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
        throw new ApiError("undo-conflict", "files changed after the apply, so whole files cannot be restored; skip the entry (its backup is kept) or reverse only what the apply changed", {
          conflicts,
          canReverse: reversible(tx.pending.operations),
        });
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
      pendingDocs.removeByApply(top);
      scheduleNotify(plans.map((p) => p.abs));
      const summaries = (tx.pending.operations ?? []).map((o) => ({ ...o, value: o.before }));
      log.info(`undid ${top} (${undoId})`);
      const derived = postApply.schedule(undoId);
      return { ok: true, mode: "exact", undoId, undone: top, postApply: derived, files: plans.map((p) => ({ file: relW(p.abs), afterHash: p.afterHash })), expect: expectations(plans, summaries) };
    });
  }

  async function skip(body) {
    return serialize(async () => {
      requireWritable();
      const stack = journal.undoStack();
      const top = stack[stack.length - 1];
      if (!top) throw new ApiError("nothing-to-undo", "there is no apply to skip");
      if (body?.applyId !== top) throw new ApiError("not-latest", "only the most recent apply can be skipped", { latest: top });
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
        const sourceLines = truth.toString("utf8").split("\n");
        const mirrorLines = mirror.toString("utf8").split("\n");
        let diffLines = Math.abs(sourceLines.length - mirrorLines.length);
        for (let i = 0; i < Math.min(sourceLines.length, mirrorLines.length); i += 1) if (sourceLines[i] !== mirrorLines[i]) diffLines += 1;
        plans.push({ abs: pair.mirror, source: pair.source, diffLines, role: "token-mirror", beforeBytes: mirror, beforeHash: diskHash(mirror), newBytes: truth, afterHash: diskHash(truth), spans: [] });
      }
      if (plans.length === 0) return { ok: true, dryRun, changed: [], files: [] };
      if (config.checks.length) {
        const index = buildIndex({ config, postcss });
        baseline = null;
        const base = await ensureBaseline(index);
        if (base.problems.length || !base.ok) throw new ApiError("checks-baseline-failing", "the source of truth fails a check; it is not copied over the mirror", { results: base.results, problems: base.problems });
      }
      const changed = plans.map((p) => relW(p.abs));
      // What would be overwritten: the mirror, the source of truth it is copied from, and how far apart they are.
      const files = plans.map((p) => ({ mirror: relW(p.abs), source: relW(p.source), diffLines: p.diffLines, afterHash: p.afterHash }));
      if (dryRun) return { ok: true, dryRun, changed, files };
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
      log.info(`synchronised ${changed.length} mirror file(s) from the source of truth (${id})`);
      return { ok: true, dryRun, changed, files, applyId: id, postApply: postApply.schedule(id) };
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

  /** Files of the closed writable set that cannot be written right now, with the reasons. */
  function writableSet() {
    const unwritable = [];
    for (const target of targets) {
      const problems = chains.has(target) ? writableProblems(target, chains.get(target)) : ["not-enumerated"];
      if (problems.length) unwritable.push({ file: relW(target), problems });
    }
    return { files: targets.length, unwritable };
  }

  /** Everything known about one committed transaction, including its post-apply round once that has finished. */
  function applyReport(applyId) {
    const tx = journal.transactions().get(applyId);
    if (!tx?.pending) throw new ApiError("not-found", `no transaction ${applyId}`);
    return {
      ok: true,
      applyId,
      kind: tx.pending.kind,
      undoes: tx.pending.undoes ?? null,
      committedAt: tx.committed?.at ?? null,
      undoneBy: tx.undoneBy,
      skipped: tx.skipped,
      operations: tx.pending.operations ?? [],
      files: tx.pending.files.map((f) => ({ file: f.rel, role: f.role })),
      documents: tx.pending.documents ?? [],
      pending: pendingDocs.list().filter((entry) => entry.applyId === applyId),
      verification: tx.verification,
      postApply: postApply.report(applyId, tx.postApply),
    };
  }

  /** A person marked pending entries as done. */
  async function resolvePending(ids) {
    return serialize(async () => {
      const resolved = pendingDocs.resolve(ids);
      return { ok: true, resolved, pendingDocs: pendingDocs.list() };
    });
  }

  function state(index = null) {
    const transactions = journal.transactions();
    const current = index ?? buildIndex({ config, postcss });
    return {
      write: readOnly.length === 0,
      readOnlyReasons: readOnly,
      writableSet: writableSet(),
      pendingDocs: pendingDocs.list(),
      postApply: postApply.state(),
      governance: { componentSpecsDir: config.governance.componentSpecsDir ? relW(config.governance.componentSpecsDir) : null, drift: contractDrift({ config, index: current, specFiles }) },
      undoStack: journal.undoStack().map((id) => {
        const tx = transactions.get(id);
        return { applyId: id, committedAt: tx.committed?.at ?? null, operations: tx.pending.operations ?? [], files: tx.pending.files.map((f) => f.rel), verification: tx.verification };
      }),
      baseline: baseline && { ok: baseline.ok, problems: baseline.problems, ranAt: baseline.ranAt ?? null, results: baseline.results.map((r) => ({ id: r.id, ok: r.ok })) },
    };
  }

  return { apply, undo, reverse, skip, syncMirror, resolvePending, applyReport, postApply, recordVerification, state, journal, readOnly, ensureBaseline: () => ensureBaseline(buildIndex({ config, postcss })) };
}
