// Helpers for the AI-run tests: a workspace with AI runs enabled, a runner
// file that starts the fake runner, a confirmer the test answers, and traps
// that prove no real agent command line tool is ever started.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { SKILL_ROOT, addon, loadPostcss, makeWorkspace, tempDir } from "./helpers.mjs";

export const ORCHESTRATOR_ROOT = path.resolve(SKILL_ROOT, "..", "agent-automation-orchestrate");
export const ORCHESTRATOR = path.join(ORCHESTRATOR_ROOT, "scripts", "run-task.mjs");
export const FAKE_RUNNER = path.join(SKILL_ROOT, "test", "fixtures", "fake-runner.mjs");
export const NODE_VERSION = spawnSync(process.execPath, ["--version"], { encoding: "utf8" }).stdout.trim();
export const quiet = { info() {}, warn() {}, error() {} };

export const SEAL_CSS = "sb/src/components/seal/Seal.css";
export const TITLE_CSS = "sb/src/components/title/Title.css";
export const SEAL_TSX = "sb/src/components/seal/Seal.tsx";
export const SEAL_SPEC = "design-system/components/seal.md";
export const TOKENS_COMP = "tokens/tokens-comp.css";
export const MIRROR_COMP = "sb/tokens/tokens-comp.css";

const { createEngine } = await addon("server/transaction.mjs");
const { createAgentRuns, FINAL_STATES } = await addon("server/agent/runs.mjs");
const { writeRunnerFile } = await addon("server/agent/runners.mjs");
const { buildIndex } = await addon("server/index-builder.mjs");
export const postcss = await loadPostcss();

export function fakeRunnerRecord(overrides = {}) {
  return { id: "fake", label: "Fake runner", command: process.execPath, args: [FAKE_RUNNER, "{workspace}", "{prompt}"], timeoutMs: 60000, version: NODE_VERSION, flags: [], ...overrides };
}

export function runnerFileFor(overrides = {}) {
  return { schemaVersion: 1, node: process.execPath, orchestratorRunTask: ORCHESTRATOR, runners: [fakeRunnerRecord()], createdAt: new Date().toISOString(), ...overrides };
}

/**
 * A confirmer the test answers: answer("approve" | "deny" | "timeout"), or
 * auto-approve every request. Records each request it was shown.
 */
export function testConfirmer({ auto = "approve", mode = "native-dialog" } = {}) {
  const seen = [];
  const waiting = new Map();
  return {
    mode,
    unconfirmed: mode === "off",
    seen,
    request(entry) {
      seen.push(entry);
      if (auto) return { mode, done: Promise.resolve({ decision: auto, via: "test" }) };
      return { mode, done: new Promise((resolve) => waiting.set(entry.runId, resolve)) };
    },
    answer(runId, decision) {
      waiting.get(runId)?.({ decision, via: "test" });
      waiting.delete(runId);
    },
    submitCode() {
      throw new Error("not used");
    },
    abandon(runId) {
      waiting.get(runId)?.({ decision: "deny", via: "abandoned" });
      waiting.delete(runId);
    },
    abandonAll() {},
  };
}

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** Hash of every file under a root, skipping the state directory. */
export function treeHashes(root, { skip = [".code-layer"] } = {}) {
  const out = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out[path.relative(root, full)] = sha(full);
    }
  };
  walk(root);
  return out;
}

/**
 * A v1 fixture workspace with AI runs enabled and a fake runner.
 * Returns { ws, config, engine, runs, confirmer, read(rel), write(rel, text) }.
 */
export async function agentWorkspace({ agent = {}, config: configExtra = {}, runnerFile = {}, confirmer = testConfirmer(), runnerFileWritten = true, files = {} } = {}) {
  const made = await makeWorkspace({
    fixture: "v1",
    files,
    config: { agent: { enabled: true, ...agent }, governance: { componentSpecsDir: "../design-system/components" }, ...configExtra },
  });
  if (!made.config) throw new Error("fixture binding did not resolve");
  if (runnerFileWritten) writeRunnerFile(made.config.stateDir, runnerFileFor(runnerFile));
  const engine = createEngine({ config: made.config, postcss, log: quiet });
  const runs = createAgentRuns({ config: made.config, engine, postcss, log: quiet, confirmer, indexFor: () => buildIndex({ config: made.config, postcss }) });
  await runs.settled();
  const abs = (rel) => path.join(made.ws, rel);
  return {
    ...made,
    engine,
    runs,
    confirmer,
    abs,
    read: (rel) => fs.readFileSync(abs(rel), "utf8"),
    write: (rel, text) => fs.writeFileSync(abs(rel), text),
  };
}

/** A request body for the seal element. */
export function requestBody(text, extra = {}) {
  return {
    text,
    reference: "[Code Layer 物件參照 v2]\n元件：seal · 元素：Seal\nCSS：sb/src/components/seal/Seal.css · .fx-seal（規則 #0，第 2 行）\n填色：background → --fx-comp-seal-container-color",
    element: { label: "Seal", storyId: "components-seal--default" },
    ...extra,
  };
}

export async function waitFinal(runs, runId, timeoutMs = 60000) {
  const started = Date.now();
  for (;;) {
    const view = runs.get(runId);
    if (FINAL_STATES.includes(view.state)) return view;
    if (Date.now() - started > timeoutMs) throw new Error(`run ${runId} is still ${view.state} after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function waitState(runs, runId, state, timeoutMs = 30000) {
  const started = Date.now();
  for (;;) {
    const view = runs.get(runId);
    if (view.state === state) return view;
    if (FINAL_STATES.includes(view.state)) throw new Error(`run ${runId} ended as ${view.state} (${JSON.stringify(view.reasons)}) before reaching ${state}`);
    if (Date.now() - started > timeoutMs) throw new Error(`run ${runId} is still ${view.state}, not ${state}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * A directory of fake `claude`, `codex` and `cursor-agent` executables that
 * each leave a marker when started. Put it first on PATH: no marker after a
 * test means no real agent tool was started by name.
 */
export function agentTraps() {
  const dir = tempDir("code-layer-traps-");
  const markers = path.join(dir, "started");
  fs.mkdirSync(markers);
  for (const name of ["claude", "codex", "cursor-agent", "agent"]) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `#!/bin/sh\ntouch "${markers}/${name}-$$"\nexit 97\n`, { mode: 0o755 });
  }
  return { dir, started: () => fs.readdirSync(markers) };
}
