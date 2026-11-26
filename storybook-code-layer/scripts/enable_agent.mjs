#!/usr/bin/env node
// Allow AI runs on this machine for one Storybook project, or stop allowing them.
//
//   node scripts/enable_agent.mjs --project-root <storybook root> [--runners claude[,codex]]
//        [--codex-model <id>] [--claude <path>] [--codex <path>] [--orchestrator-root <dir>]
//        [--timeout-ms <n>] [--dry-run] [--json]
//   node scripts/enable_agent.mjs --project-root <storybook root> --disable [--dry-run] [--json]
//
// It writes <stateDir>/agent-runners.json: absolute paths of node, of the
// agent-automation runner (run-task.mjs) and of each command line tool, with
// the argument recipe each runner uses. AI runs also need `agent.enabled: true`
// in the project binding; that is the project's decision, this file is the
// machine's. It never starts an agent: tools are probed with `--version` and
// their help only.
//
// A person must agree before this runs: it lets a dialog in the browser start
// a paid command line tool that edits the project, each time after an
// approval outside the browser.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { SKILL_ROOT, TEMPLATE_DIR } from "./lib/files.mjs";

const { loadConfig } = await import(pathToFileURL(path.join(TEMPLATE_DIR, "server", "config.mjs")).href);
const runnersModule = await import(pathToFileURL(path.join(TEMPLATE_DIR, "server", "agent", "runners.mjs")).href);
const { RECIPES, candidatePaths, firstLine, probe, readRunnerFile, runnerFileProblems, runnerFilePath } = runnersModule;

export const ENABLE_USAGE =
  "usage: enable_agent.mjs --project-root <storybook root> [--runners claude[,codex]] [--codex-model <id>] [--claude <path>] [--codex <path>] [--orchestrator-root <dir>] [--timeout-ms <n>] [--disable] [--dry-run] [--json]";

const VALUE_FLAGS = { "--project-root": "projectRoot", "--runners": "runners", "--codex-model": "codexModel", "--claude": "claude", "--codex": "codex", "--orchestrator-root": "orchestratorRoot", "--timeout-ms": "timeoutMs" };
const BOOLEAN_FLAGS = { "--dry-run": "dryRun", "--json": "json", "--disable": "disable", "--help": "help" };

export function parseEnableArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (Object.hasOwn(VALUE_FLAGS, arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { ok: false, error: `${arg} needs a value` };
      options[VALUE_FLAGS[arg]] = value;
      i += 1;
    } else if (Object.hasOwn(BOOLEAN_FLAGS, arg)) options[BOOLEAN_FLAGS[arg]] = true;
    else return { ok: false, error: `unknown flag ${arg}` };
  }
  if (options.help) return { ok: true, options };
  if (!options.projectRoot) return { ok: false, error: "--project-root is required" };
  options.runners = (options.runners ?? "claude").split(",").map((r) => r.trim()).filter(Boolean);
  for (const id of options.runners) if (!RECIPES[id]) return { ok: false, error: `unknown runner ${id}; known: ${Object.keys(RECIPES).join(", ")}` };
  if (new Set(options.runners).size !== options.runners.length) return { ok: false, error: "--runners lists a runner twice" };
  if (options.runners.includes("codex") && !options.codexModel) return { ok: false, error: "codex needs --codex-model <id> (its default model may not be available for the account)" };
  if (options.timeoutMs !== undefined && !/^\d+$/.test(options.timeoutMs)) return { ok: false, error: "--timeout-ms must be a whole number" };
  if (options.disable && (argv.includes("--runners") || options.codexModel || options.claude || options.codex)) return { ok: false, error: "--disable takes no runner options" };
  return { ok: true, options };
}

/** Where the agent-automation runner may be, in order. */
export function orchestratorCandidates({ projectRoot, workspaceRoot, explicit = null, home = os.homedir() }) {
  const list = [];
  if (explicit) list.push(path.resolve(explicit));
  for (const base of [projectRoot, workspaceRoot]) list.push(path.join(base, ".agents", "skills", "agent-automation-orchestrate"));
  for (const dir of [".agents", ".claude", ".codex"]) list.push(path.join(home, dir, "skills", "agent-automation-orchestrate"));
  list.push(path.resolve(SKILL_ROOT, "..", "agent-automation-orchestrate"));
  return [...new Set(list)];
}

/**
 * Work out the runner file. probeImpl(command, args) is the only way a tool
 * is run, and only with --version or its help.
 * Returns { ok, issues: [{ severity, code, message }], file, data, bindingEnabled }.
 */
export async function planEnable(options, { probeImpl = probe, home = os.homedir(), pathEnv = process.env.PATH ?? "" } = {}) {
  const issues = [];
  const projectRoot = path.resolve(options.projectRoot);
  const configFile = path.join(projectRoot, ".storybook", "code-layer", "code-layer.config.json");
  let config;
  try {
    config = loadConfig({ projectRoot, configFile });
  } catch (error) {
    return { ok: false, issues: [{ severity: "error", code: "binding-unreadable", message: `${configFile}: ${error.message}` }] };
  }
  const file = runnerFilePath(config.stateDir);
  const current = readRunnerFile(config.stateDir);
  if (options.disable) {
    return { ok: true, issues, file, data: null, disable: true, exists: current.state !== "missing", bindingEnabled: config.agent.enabled };
  }
  if (!config.agent.enabled) {
    issues.push({ severity: "warning", code: "binding-disabled", message: "the project binding does not set agent.enabled to true; AI runs stay off until the project enables them" });
  }
  const node = process.execPath;
  const orchestratorRoot = orchestratorCandidates({ projectRoot, workspaceRoot: config.workspaceRoot, explicit: options.orchestratorRoot ?? null, home }).find((dir) => fs.existsSync(path.join(dir, "scripts", "run-task.mjs")));
  if (!orchestratorRoot) issues.push({ severity: "error", code: "orchestrator-missing", message: "agent-automation-orchestrate was not found; install that skill or pass --orchestrator-root <dir>" });
  const runners = [];
  for (const id of options.runners) {
    const recipe = RECIPES[id];
    const explicit = options[id] ? [path.resolve(options[id])] : [];
    const candidates = explicit.length ? explicit : recipe.names.flatMap((name) => candidatePaths(name, { home, pathEnv }));
    let chosen = null;
    for (const candidate of candidates) {
      const version = await probeImpl(candidate, ["--version"], { node });
      if (version.ok) {
        // The path as found (a launcher link survives the tool's own updates); a new version makes runs not ready until this script runs again.
        chosen = { command: candidate, version: firstLine(version.output) };
        break;
      }
      issues.push({ severity: "warning", code: "runner-candidate-broken", message: `${candidate} --version failed (${firstLine(version.output) || `exit ${version.code}`}); skipped` });
    }
    if (!chosen) {
      issues.push({ severity: "error", code: "runner-missing", message: `${recipe.label} (${recipe.names.join(", ")}) was not found or does not run; install it and sign in, or pass --${id} <path>` });
      continue;
    }
    const help = await probeImpl(chosen.command, recipe.helpArgs, { node });
    const missing = recipe.flags.filter((flag) => !help.output.includes(flag));
    if (missing.length) {
      issues.push({ severity: "error", code: "runner-flags-missing", message: `${recipe.label} ${chosen.version} does not list ${missing.join(", ")}; this recipe needs them` });
      continue;
    }
    runners.push({
      id,
      label: recipe.label,
      command: chosen.command,
      args: recipe.args(options.codexModel),
      helpArgs: recipe.helpArgs,
      flags: recipe.flags,
      timeoutMs: options.timeoutMs ? Number(options.timeoutMs) : config.agent.timeoutMs,
      version: chosen.version,
      inheritEnv: [],
    });
  }
  const data = { schemaVersion: 1, node, orchestratorRunTask: orchestratorRoot ? path.join(orchestratorRoot, "scripts", "run-task.mjs") : "", runners, createdAt: new Date().toISOString() };
  const ok = !issues.some((issue) => issue.severity === "error") && runners.length > 0;
  if (ok) {
    const problems = runnerFileProblems(data);
    if (problems.length) return { ok: false, issues: [...issues, { severity: "error", code: "runner-file-invalid", message: problems.join("; ") }], file, data };
  }
  return { ok, issues, file, data, bindingEnabled: config.agent.enabled, stateDir: config.stateDir };
}

async function main() {
  const parsed = parseEnableArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n${ENABLE_USAGE}\n`);
    process.exit(2);
  }
  const options = parsed.options;
  if (options.help) {
    process.stdout.write(`${ENABLE_USAGE}\n`);
    return;
  }
  const plan = await planEnable(options);
  let written = false;
  let removed = false;
  if (plan.ok && !options.dryRun) {
    if (plan.disable) {
      if (plan.exists) {
        fs.rmSync(plan.file);
        removed = true;
      }
    } else {
      fs.mkdirSync(path.dirname(plan.file), { recursive: true });
      const temp = `${plan.file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify(plan.data, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temp, plan.file);
      written = true;
    }
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: plan.ok, dryRun: Boolean(options.dryRun), file: plan.file ?? null, written, removed, bindingEnabled: plan.bindingEnabled ?? null, runners: plan.data?.runners?.map((r) => ({ id: r.id, label: r.label, command: r.command, version: r.version })) ?? [], issues: plan.issues }, null, 2)}\n`);
  } else {
    for (const issue of plan.issues) process.stdout.write(`${issue.severity === "error" ? "✖" : "!"} ${issue.message}\n`);
    if (plan.disable) process.stdout.write(plan.exists ? `${options.dryRun ? "Would remove" : "Removed"} ${plan.file}: AI runs are off on this machine.\n` : `No runner file at ${plan.file}: AI runs were already off on this machine.\n`);
    else if (plan.ok) {
      for (const runner of plan.data.runners) process.stdout.write(`✔ ${runner.label} ${runner.version} — ${runner.command}\n`);
      process.stdout.write(`${options.dryRun ? "Would write" : "Wrote"} ${plan.file}.\n`);
      if (!plan.bindingEnabled) process.stdout.write("AI runs also need agent.enabled: true in the project binding (then restart Storybook).\n");
      else process.stdout.write("A running Storybook picks this file up by itself.\n");
    }
  }
  process.exit(plan.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
