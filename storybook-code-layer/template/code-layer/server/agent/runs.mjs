// AI runs: one request from the inspector, from confirmation to an undoable import.
//
//   awaiting-confirmation -> preparing (working copy) -> running (agent)
//     -> checking (scope gate, import) -> imported
//   final otherwise: needs-decision | rejected | failed | denied | cancelled | interrupted
//
// At most one run is active. From approval to its final state the write
// engine refuses every other write. A run's private directory
// <stateDir>/agent/<runId>/ holds state.json (no request text), request.txt
// (owner-only: the only place the server keeps the text) and, while it runs,
// work/ (the copy). The copy is removed when the run ends; the last 20 run
// directories are kept.
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { ApiError, ID_PATTERN } from "../../shared/api-contract.mjs";
import { listSpecFiles } from "../spec-rows.mjs";
import { buildContract, readRunSummary, writeContract } from "./contract.mjs";
import { confirmationSummary } from "./confirm.mjs";
import { launch } from "./launcher.mjs";
import { readResult, requestMarkdown, writeRequestFile } from "./request-file.mjs";
import { probeRunner, readRunnerFile, staticProblems } from "./runners.mjs";
import { allowedSet, judgeWorkCopy } from "./scope-gate.mjs";
import { createWorkCopy, removeWorkCopy } from "./workcopy.mjs";

export const FINAL_STATES = ["imported", "needs-decision", "rejected", "failed", "denied", "cancelled", "interrupted"];
const KEEP_RUNS = 20;
const LOCALES = ["zh-Hant", "en"];

const isFinal = (state) => FINAL_STATES.includes(state);

function newRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${stamp}-ai-${crypto.randomBytes(3).toString("hex")}`;
}

/** Lines added and removed between two texts (common prefix and suffix trimmed, then a longest common subsequence). */
export function lineChanges(before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  if (x.length * y.length > 4_000_000) return { added: y.length, removed: x.length };
  let previous = new Uint32Array(y.length + 1);
  let current = new Uint32Array(y.length + 1);
  for (let i = 1; i <= x.length; i += 1) {
    for (let j = 1; j <= y.length; j += 1) current[j] = x[i - 1] === y[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    [previous, current] = [current, previous];
  }
  const common = previous[y.length];
  return { added: y.length - common, removed: x.length - common };
}

function validateSubmission(body, limits) {
  const fail = (message) => {
    throw new ApiError("schema-invalid", message);
  };
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("body must be an object");
  const allowed = ["text", "reference", "element", "locale", "followUp"];
  for (const key of Object.keys(body)) if (!allowed.includes(key)) fail(`body has unknown key "${key}"`);
  if (typeof body.text !== "string" || body.text.trim() === "") fail("text must be a non-empty string");
  if ([...body.text].length > limits.maxAgentTextChars) fail(`text is longer than ${limits.maxAgentTextChars} characters`);
  if (typeof body.reference !== "string" || body.reference.trim() === "") fail("reference must be a non-empty string");
  if (Buffer.byteLength(body.reference) > limits.maxAgentReferenceBytes) fail(`reference is larger than ${limits.maxAgentReferenceBytes} bytes`);
  const element = body.element;
  if (!element || typeof element !== "object" || Array.isArray(element)) fail("element must be an object");
  for (const key of Object.keys(element)) if (!["storyId", "label", "descriptor"].includes(key)) fail(`element has unknown key "${key}"`);
  if (typeof element.label !== "string" || element.label === "" || element.label.length > 200) fail("element.label must be a short string");
  if (element.storyId !== null && element.storyId !== undefined && (typeof element.storyId !== "string" || element.storyId.length > 200)) fail("element.storyId must be a short string");
  if (element.descriptor !== undefined && JSON.stringify(element.descriptor).length > 4096) fail("element.descriptor is too large");
  if (body.locale !== undefined && !LOCALES.includes(body.locale)) fail(`locale must be one of ${LOCALES.join(", ")}`);
  if (body.followUp !== undefined) {
    const followUp = body.followUp;
    if (!followUp || typeof followUp !== "object" || Array.isArray(followUp) || Object.keys(followUp).some((key) => key !== "runId")) fail("followUp must be { runId }");
    if (typeof followUp.runId !== "string" || !ID_PATTERN.test(followUp.runId)) fail("followUp.runId is invalid");
  }
  return body;
}

/**
 * createAgentRuns({ config, engine, postcss, log, confirmer, spawnImpl?, launchImpl?, indexFor? })
 * engine: the write engine (lockForAgent, unlockAgent, importAgentChanges, journal, readOnly).
 * indexFor(): the current index (for the stylesheets a reference may name).
 */
export function createAgentRuns({ config, engine, postcss, log = { info() {}, warn() {}, error() {} }, confirmer, launchImpl = launch, indexFor = null, probeImpl = probeRunner }) {
  const area = path.join(config.stateDir, "agent");
  fs.mkdirSync(area, { recursive: true, mode: 0o700 });
  const specFiles = listSpecFiles(config.governance.componentSpecsDir);
  const runs = new Map();
  let active = null;
  /** Readiness probes of the runner commands, by runner file mtime. */
  let probed = { mtimeMs: null, problems: [], running: null };

  const runDir = (runId) => path.join(area, runId);
  const now = () => new Date().toISOString();

  // ---- readiness -------------------------------------------------------------------

  function startProbe(read) {
    const key = read.mtimeMs;
    if (probed.mtimeMs === key && (probed.running || probed.done)) return;
    probed = { mtimeMs: key, problems: [], running: null, done: false };
    const mine = probed;
    mine.running = Promise.all(read.data.runners.map((runner) => probeImpl(runner, { node: read.data.node })))
      .then((lists) => {
        mine.problems = lists.flat();
      })
      .catch((error) => {
        mine.problems = [{ code: "runner-check-failed", detail: error.message }];
      })
      .finally(() => {
        mine.running = null;
        mine.done = true;
        if (mine.problems.length) log.warn(`AI runs are not ready: ${mine.problems.map((p) => `${p.code}${p.runner ? ` (${p.runner})` : ""}`).join(", ")}`);
      });
  }

  function readiness() {
    const read = readRunnerFile(config.stateDir);
    const problems = staticProblems(config, read);
    if (engine.readOnly.length > 0) problems.push({ code: "read-only", detail: engine.readOnly.map((r) => r.code).join(", ") });
    if (problems.length === 0 && read.state === "ok") {
      startProbe(read);
      if (!probed.done) problems.push({ code: "checking", detail: "checking the command line tools" });
      else problems.push(...probed.problems);
    }
    return { read, problems };
  }

  /** Resolves once the runner probes have finished (tests and start-up). */
  async function settled() {
    readiness();
    if (probed.running) await probed.running;
    return status();
  }

  function status() {
    const { read, problems } = readiness();
    return {
      ok: true,
      enabled: config.agent.enabled,
      ready: problems.length === 0,
      reasons: problems,
      runners: read.state === "ok" ? read.data.runners.map((r) => ({ id: r.id, label: r.label })) : [],
      confirm: { mode: confirmer.mode, unconfirmed: confirmer.unconfirmed },
      activeRunId: active?.runId ?? null,
      limits: { maxTextChars: config.limits.maxAgentTextChars, maxReferenceBytes: config.limits.maxAgentReferenceBytes },
    };
  }

  // ---- run records -------------------------------------------------------------------

  function publicView(run) {
    const end = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
    return {
      ok: true,
      runId: run.runId,
      state: run.state,
      final: isFinal(run.state),
      runner: run.runner,
      element: run.element,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      elapsedMs: run.startedAt ? end - Date.parse(run.startedAt) : 0,
      confirm: run.confirm,
      result: run.result,
      changes: run.changes,
      checks: run.checks,
      reasons: run.reasons,
      applyId: run.applyId,
      followUpOf: run.followUpOf,
    };
  }

  function persist(run) {
    const dir = runDir(run.runId);
    if (!fs.existsSync(dir)) return;
    const file = path.join(dir, "state.json");
    const temp = `${file}.${process.pid}.tmp`;
    const { tail, launcher, cancelRequested, ...stored } = run;
    fs.writeFileSync(temp, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temp, file);
  }

  function setState(run, state, patch = {}) {
    Object.assign(run, patch, { state, updatedAt: now() });
    run.stateTimes[state] = run.updatedAt;
    if (isFinal(state) && !run.finishedAt) run.finishedAt = run.updatedAt;
    persist(run);
  }

  function loadRun(runId) {
    if (runs.has(runId)) return runs.get(runId);
    try {
      const stored = JSON.parse(fs.readFileSync(path.join(runDir(runId), "state.json"), "utf8"));
      if (stored.runId === runId) {
        runs.set(runId, stored);
        return stored;
      }
    } catch {
      // unknown
    }
    return null;
  }

  function journalRun(run) {
    engine.journal.append({
      type: "agent-run",
      runId: run.runId,
      runner: run.runner,
      states: run.stateTimes,
      requestSha256: run.requestHash,
      outcome: run.state,
      reasons: (run.reasons ?? []).map((r) => ({ code: r.code, path: r.path ?? null })),
      files: run.importedFiles ?? [],
      applyId: run.applyId ?? null,
    });
  }

  function prune() {
    let names;
    try {
      names = fs.readdirSync(area).filter((name) => ID_PATTERN.test(name)).sort();
    } catch {
      return;
    }
    const removable = names.filter((name) => name !== active?.runId);
    for (const name of removable.slice(0, Math.max(0, removable.length - KEEP_RUNS))) {
      fs.rmSync(runDir(name), { recursive: true, force: true });
      runs.delete(name);
    }
  }

  // ---- the stylesheets a reference names must be known ----------------------------------

  function knownStylesheets() {
    const rel = (abs) => path.relative(config.workspaceRoot, abs).split(path.sep).join("/");
    const known = new Set();
    const index = indexFor ? indexFor() : null;
    for (const file of index?.cssIndex?.files ?? []) known.add(file.workspacePath);
    for (const tier of [config.tokens.entry, ...config.tokens.tiers]) {
      if (tier.source) known.add(rel(tier.source));
      if (tier.mirror) known.add(rel(tier.mirror));
    }
    for (const source of config.tokens.readonlySources) known.add(rel(source));
    return known;
  }

  // ---- the pipeline ---------------------------------------------------------------------

  async function pipeline(run, { text, reference, locale }) {
    let copy = null;
    let locked = false;
    try {
      // 1. Approval outside the page.
      const allowed = allowedSet(config, specFiles).describe();
      const summary = confirmationSummary({ locale, projectId: config.projectId, element: run.element.label, runner: run.runner, allowed: allowed.paths, text });
      const ticket = confirmer.request({
        runId: run.runId,
        runDir: runDir(run.runId),
        requestHash: run.requestHash,
        summary,
        locale,
        onModeChange: (mode) => {
          run.confirm = { mode, fallback: true };
          persist(run);
        },
      });
      run.confirm = { mode: ticket.mode, fallback: false };
      persist(run);
      const { decision } = await ticket.done;
      fs.rmSync(path.join(runDir(run.runId), "confirm.txt"), { force: true });
      if (run.cancelRequested) return setState(run, "cancelled");
      if (decision !== "approve") return setState(run, "denied", { reasons: [{ code: decision === "timeout" ? "confirmation-timeout" : "confirmation-denied" }] });

      // 2. Nothing else writes until this run has ended.
      await engine.lockForAgent(run.runId);
      locked = true;
      if (run.cancelRequested) return setState(run, "cancelled");
      setState(run, "preparing");
      const read = readRunnerFile(config.stateDir);
      if (read.state !== "ok") return setState(run, "failed", { reasons: [{ code: "runner-file-unavailable" }] });
      try {
        copy = createWorkCopy({
          workspaceRoot: config.workspaceRoot,
          target: path.join(runDir(run.runId), "work"),
          stateDir: config.stateDir,
          exclude: config.agent.workcopy.exclude,
          maxFiles: config.agent.workcopy.maxFiles,
          maxBytes: config.agent.workcopy.maxBytes,
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === "workcopy-too-large") return setState(run, "rejected", { reasons: [{ code: "workcopy-too-large", detail: error.message }] });
        throw error;
      }
      // A follow-up's request file shows the earlier request, the question and this answer in their own sections.
      writeRequestFile(copy.root, requestMarkdown({ runId: run.runId, text: run.followUp ? run.answerText : run.composedText, reference, element: run.element, allowed, followUp: run.followUp }));
      writeContract(copy.root, buildContract({ runnerFile: read.data, runId: run.runId, timeoutMs: config.agent.timeoutMs }));
      if (run.cancelRequested) return setState(run, "cancelled");

      // 3. The agent, through the orchestrator.
      setState(run, "running", { startedAt: now() });
      const launcher = launchImpl({ node: read.data.node, runTask: read.data.orchestratorRunTask, copyRoot: copy.root });
      run.launcher = launcher;
      run.pid = launcher.pid;
      persist(run);
      const runnerTimeouts = read.data.runners.reduce((sum, r) => sum + Math.min(r.timeoutMs, config.agent.timeoutMs), 0);
      let overall = null;
      const timedOut = new Promise((resolve) => {
        overall = setTimeout(() => resolve("timeout"), runnerTimeouts + 60000);
        overall.unref?.();
      });
      const ended = await Promise.race([launcher.done.then(() => "exited"), timedOut]);
      clearTimeout(overall);
      if (ended === "timeout") {
        launcher.stop();
        await launcher.done;
      }
      run.launcher = null;
      run.pid = null;
      if (run.cancelRequested) return setState(run, "cancelled");
      if (ended === "timeout") return setState(run, "failed", { reasons: [{ code: "time-limit", detail: `${Math.round((runnerTimeouts + 60000) / 1000)} s` }] });

      // 4. What came back.
      const summaryFile = readRunSummary(copy.root);
      const selected = summaryFile?.selectedRunner?.label ?? null;
      if (selected) run.runner = selected;
      if (!summaryFile) return setState(run, "failed", { reasons: [{ code: "launcher-failed", detail: launcher.tail().trim().split("\n").slice(-1)[0]?.slice(0, 300) ?? "" }] });
      if (summaryFile.phase === "exhausted") {
        return setState(run, "failed", { reasons: [{ code: "runners-failed", detail: (summaryFile.attempts ?? []).map((a) => `${a.runnerId}: ${a.outcome}${a.exitCode !== null && a.exitCode !== undefined ? ` (${a.exitCode})` : ""}`).join(", ") }] });
      }
      // The summary decides: a run the orchestrator did not finish is not trusted, whatever files it left.
      if (summaryFile.phase !== "completed" && summaryFile.phase !== "verification-failed") {
        return setState(run, "failed", { reasons: [{ code: "launcher-interrupted", detail: String(summaryFile.phase) }] });
      }
      const result = readResult(copy.root, run.runId);
      if (!result.ok) return setState(run, "failed", { reasons: [{ code: "agent-result-invalid", detail: result.reason }] });
      if (summaryFile.phase !== "completed") return setState(run, "failed", { reasons: [{ code: "verification-failed" }] });
      run.result = result.result;
      if (result.result.status === "needs-decision") return setState(run, "needs-decision");
      if (result.result.status === "cannot") return setState(run, "failed", { reasons: [{ code: "agent-cannot" }] });

      // 5. The scope gate, then one undoable apply.
      setState(run, "checking");
      const gate = judgeWorkCopy({ config, postcss, copyRoot: copy.root, snapshot: copy.snapshot, specFiles });
      if (!gate.ok) return setState(run, "rejected", { reasons: gate.violations.map((v) => ({ code: v.code, path: v.path, detail: v.detail ?? null })) });
      if (gate.changes.length === 0) return setState(run, "failed", { reasons: [{ code: "no-changes" }] });
      const changes = gate.changes.map((change) => {
        const before = fs.readFileSync(path.join(config.workspaceRoot, change.path), "utf8");
        const after = fs.readFileSync(path.join(copy.root, change.path), "utf8");
        return { file: change.path, role: change.role, ...lineChanges(before, after) };
      });
      let imported;
      try {
        imported = await engine.importAgentChanges({ runId: run.runId, copyRoot: copy.root, snapshot: copy.snapshot, changes: gate.changes });
      } catch (error) {
        if (error instanceof ApiError) {
          const details = error.details ?? {};
          return setState(run, "rejected", { changes, checks: details.results?.map((r) => ({ id: r.id, ok: r.ok })) ?? null, reasons: [{ code: error.code, path: details.file ?? null, detail: error.message }] });
        }
        throw error;
      }
      run.importedFiles = imported.files.map((f) => ({ path: f.file, beforeHash: f.beforeHash, afterHash: f.afterHash }));
      return setState(run, "imported", { changes, checks: imported.checks.map((c) => ({ id: c.id, ok: c.ok })), applyId: imported.applyId, postApply: imported.postApply });
    } catch (error) {
      log.error(`AI run ${run.runId} failed: ${error?.stack ?? error}`);
      if (!isFinal(run.state)) setState(run, "failed", { reasons: [{ code: "internal", detail: String(error?.message ?? error).slice(0, 300) }] });
    } finally {
      if (run.launcher) {
        run.launcher.stop();
        run.launcher = null;
      }
      if (copy) removeWorkCopy(copy.root, config.stateDir);
      else removeWorkCopy(path.join(runDir(run.runId), "work"), config.stateDir);
      if (locked) engine.unlockAgent(run.runId);
      if (active === run) active = null;
      persist(run);
      journalRun(run);
      prune();
      log.info(`AI run ${run.runId}: ${run.state}${run.reasons?.length ? ` (${run.reasons.map((r) => r.code).join(", ")})` : ""}${run.applyId ? ` as ${run.applyId}` : ""}`);
    }
  }

  // ---- routes' operations ---------------------------------------------------------------

  function submit(body) {
    const request = validateSubmission(body, config.limits);
    if (!config.agent.enabled) throw new ApiError("agent-disabled", "AI runs are not enabled in this project's binding");
    const ready = status();
    if (!ready.ready) {
      throw new ApiError(ready.reasons.some((r) => r.code === "binding-disabled" || r.code === "runner-file-missing") ? "agent-disabled" : "agent-not-ready", "AI runs are not ready", { reasons: ready.reasons });
    }
    if (active) throw new ApiError("agent-run-active", "another AI run is in progress", { runId: active.runId });
    // The rule lines of a reference ("CSS: <file> · <selector> …") name the element's stylesheets: each must be indexed.
    const known = knownStylesheets();
    const named = [...new Set(request.reference.split("\n").map((line) => /^CSS(?:\uFF1A|:)\s*(\S+\.css)\s+·/.exec(line.trim())?.[1]).filter(Boolean))];
    const unknown = named.filter((file) => !known.has(file));
    if (unknown.length) throw new ApiError("schema-invalid", "the reference names stylesheets that are not in the index", { stylesheets: unknown.slice(0, 5) });

    let followUp = null;
    let composedText = request.text;
    if (request.followUp) {
      const earlier = loadRun(request.followUp.runId);
      let originalText = null;
      try {
        originalText = fs.readFileSync(path.join(runDir(request.followUp.runId), "request.txt"), "utf8");
      } catch {
        originalText = null;
      }
      if (!earlier || earlier.state !== "needs-decision" || !earlier.result?.question || originalText === null) {
        throw new ApiError("schema-invalid", "that run did not end with a question that can still be answered");
      }
      followUp = { originalText, question: earlier.result.question };
      composedText = `${originalText.trim()}\n\n${earlier.result.question.trim()}\n\n${request.text.trim()}`;
    }

    const read = readRunnerFile(config.stateDir);
    const runId = newRunId();
    const requestHash = crypto.createHash("sha256").update(JSON.stringify([composedText, request.reference, request.element.label, request.element.storyId ?? null])).digest("hex");
    const dir = runDir(runId);
    fs.mkdirSync(dir, { mode: 0o700 });
    fs.writeFileSync(path.join(dir, "request.txt"), composedText, { mode: 0o600 });
    const run = {
      runId,
      state: "awaiting-confirmation",
      createdAt: now(),
      updatedAt: now(),
      stateTimes: { "awaiting-confirmation": now() },
      startedAt: null,
      finishedAt: null,
      runner: read.data.runners[0].label,
      element: { label: request.element.label, storyId: request.element.storyId ?? null },
      requestHash,
      confirm: { mode: confirmer.mode, fallback: false },
      result: null,
      changes: null,
      checks: null,
      reasons: null,
      applyId: null,
      followUpOf: request.followUp?.runId ?? null,
      followUp,
      composedText,
      pid: null,
      cancelRequested: false,
    };
    runs.set(runId, run);
    active = run;
    // The composed text lives in request.txt only; keep it out of state.json.
    Object.defineProperty(run, "composedText", { value: composedText, enumerable: false });
    Object.defineProperty(run, "followUp", { value: followUp, enumerable: false });
    Object.defineProperty(run, "answerText", { value: request.text, enumerable: false });
    persist(run);
    void pipeline(run, { text: composedText, reference: request.reference, locale: request.locale ?? config.locale ?? "zh-Hant" });
    return { ok: true, runId, state: run.state, confirm: run.confirm };
  }

  function get(runId) {
    const run = loadRun(runId);
    if (!run) throw new ApiError("not-found", `no AI run ${runId}`);
    return publicView(run);
  }

  function confirmCode(runId, body) {
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((k) => k !== "code") || typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
      throw new ApiError("schema-invalid", "body must be { code: six digits }");
    }
    const run = loadRun(runId);
    if (!run || run.state !== "awaiting-confirmation") throw new ApiError("agent-code-invalid", "this run is not waiting for a code");
    return { ...confirmer.submitCode(runId, body.code), runId };
  }

  function cancel(runId) {
    const run = loadRun(runId);
    if (!run) throw new ApiError("not-found", `no AI run ${runId}`);
    if (isFinal(run.state)) return publicView(run);
    if (run.state === "checking") throw new ApiError("agent-run-active", "the result is being checked and imported; it cannot be cancelled now", { runId });
    run.cancelRequested = true;
    if (run.state === "awaiting-confirmation") confirmer.abandon(runId);
    run.launcher?.stop();
    return publicView(run);
  }

  // ---- start-up and shutdown --------------------------------------------------------------

  function commandOf(pid) {
    try {
      const out = spawnSync("/bin/ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 3000 });
      return out.stdout.trim();
    } catch {
      return "";
    }
  }

  /** A run that never reached a final state (the dev server stopped): interrupted, its agent ended, its copy removed. */
  function recoverInterrupted() {
    let names = [];
    try {
      names = fs.readdirSync(area).filter((name) => ID_PATTERN.test(name));
    } catch {
      return;
    }
    for (const name of names) {
      const run = loadRun(name);
      if (!run || isFinal(run.state)) {
        fs.rmSync(path.join(runDir(name), "confirm.txt"), { force: true });
        continue;
      }
      if (Number.isInteger(run.pid) && commandOf(run.pid).includes(runDir(name))) {
        try {
          process.kill(-run.pid, "SIGKILL");
        } catch {
          // gone
        }
      }
      removeWorkCopy(path.join(runDir(name), "work"), config.stateDir);
      fs.rmSync(path.join(runDir(name), "confirm.txt"), { force: true });
      run.reasons = [{ code: "dev-server-stopped" }];
      run.pid = null;
      setState(run, "interrupted");
      journalRun(run);
      log.warn(`AI run ${name} was interrupted when the dev server stopped; nothing was imported`);
    }
    prune();
  }

  recoverInterrupted();
  process.once("exit", () => {
    // Synchronous: end the agent's process group; the copy is removed at the next start.
    active?.launcher?.kill();
  });

  return { status, settled, submit, get, confirmCode, cancel, activeRunId: () => active?.runId ?? null, _runs: runs };
}
