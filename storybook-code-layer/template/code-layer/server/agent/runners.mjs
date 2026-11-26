// The machine-local runner file and the readiness of AI runs.
//
// <stateDir>/agent-runners.json is written by scripts/enable_agent.mjs on each
// machine that may run agents. It holds absolute paths (node, the
// orchestrator's run-task.mjs, each command line tool) and the argument recipe
// of every runner, so nothing is resolved through PATH when a run starts.
//
// Nothing in this module starts an agent: probing runs only `--version` and
// the tool's help.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const RUNNER_FILE = "agent-runners.json";
export const RUNNER_FILE_SCHEMA = 1;

/**
 * Recipes proven in the runner trials (2026-11-20 and 11-24). `{workspace}` and
 * `{prompt}` are filled in by the orchestrator. `flags` are the options the
 * recipe depends on; the tool's help must still list each of them.
 */
export const RECIPES = {
  claude: {
    id: "claude",
    label: "Claude Code",
    names: ["claude"],
    // No shell, file tools confined to the working directory, permission settings of the user and the project ignored.
    // --restricted alone still loads MCP servers, claude.ai connectors included (real run, 2026-11-26: 123 connector
    // tools were handed to the agent); --strict-mcp-config with no --mcp-config loads none.
    args: () => ["--add-dir", "{workspace}", "--restricted", "--strict-mcp-config", "--tools", "Read", "Write", "Edit", "Glob", "Grep", "--permission-mode", "acceptEdits", "--permission-prompts", "none", "-p", "{prompt}"],
    helpArgs: ["--help"],
    flags: ["--add-dir", "--restricted", "--strict-mcp-config", "--tools", "--permission-mode", "--permission-prompts"],
  },
  codex: {
    id: "codex",
    label: "Codex",
    names: ["codex"],
    // codex has a shell that cannot be removed; the workspace-write sandbox limits writes and network.
    args: (model) => ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "-m", model, "-C", "{workspace}", "{prompt}"],
    helpArgs: ["exec", "--help"],
    flags: ["--skip-git-repo-check", "--sandbox"],
  },
};

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function runnerFilePath(stateDir) {
  return path.join(stateDir, RUNNER_FILE);
}

function isExecutable(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Shape check of a parsed runner file. Returns a list of problems ([] when valid). */
export function runnerFileProblems(data) {
  const problems = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["not an object"];
  if (data.schemaVersion !== RUNNER_FILE_SCHEMA) problems.push(`schemaVersion must be ${RUNNER_FILE_SCHEMA}`);
  for (const key of ["node", "orchestratorRunTask"]) {
    if (typeof data[key] !== "string" || !path.isAbsolute(data[key])) problems.push(`${key} must be an absolute path`);
  }
  if (!Array.isArray(data.runners) || data.runners.length < 1 || data.runners.length > 3) {
    problems.push("runners must list 1 to 3 runners");
    return problems;
  }
  const ids = new Set();
  data.runners.forEach((runner, i) => {
    const where = `runners[${i}]`;
    if (!runner || typeof runner !== "object") return problems.push(`${where} must be an object`);
    if (typeof runner.id !== "string" || !ID.test(runner.id) || ids.has(runner.id)) problems.push(`${where}.id must be a unique kebab-case id`);
    ids.add(runner.id);
    if (typeof runner.label !== "string" || !runner.label.trim()) problems.push(`${where}.label is required`);
    if (typeof runner.command !== "string" || !path.isAbsolute(runner.command)) problems.push(`${where}.command must be an absolute path`);
    if (!Array.isArray(runner.args) || !runner.args.every((a) => typeof a === "string")) problems.push(`${where}.args must be strings`);
    else {
      const count = (needle) => runner.args.reduce((n, a) => n + a.split(needle).length - 1, 0);
      if (count("{prompt}") !== 1 || count("{workspace}") !== 1) problems.push(`${where}.args must contain {prompt} and {workspace} once each`);
    }
    if (!Number.isInteger(runner.timeoutMs) || runner.timeoutMs <= 0) problems.push(`${where}.timeoutMs must be a positive integer`);
    if (runner.helpArgs !== undefined && (!Array.isArray(runner.helpArgs) || !runner.helpArgs.every((a) => typeof a === "string"))) problems.push(`${where}.helpArgs must be strings`);
    if (runner.flags !== undefined && (!Array.isArray(runner.flags) || !runner.flags.every((a) => typeof a === "string"))) problems.push(`${where}.flags must be strings`);
    if (runner.inheritEnv !== undefined && (!Array.isArray(runner.inheritEnv) || !runner.inheritEnv.every((a) => typeof a === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(a)))) {
      problems.push(`${where}.inheritEnv must be environment variable names`);
    }
  });
  return problems;
}

/** Read the runner file: { state: "missing" | "invalid" | "ok", file, data?, problems? }. */
export function readRunnerFile(stateDir) {
  const file = runnerFilePath(stateDir);
  let text;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) return { state: "invalid", file, problems: ["not a regular file"] };
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { state: "missing", file };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { state: "invalid", file, problems: [`not JSON: ${error.message}`] };
  }
  const problems = runnerFileProblems(data);
  if (problems.length) return { state: "invalid", file, problems };
  return { state: "ok", file, data, mtimeMs: fs.statSync(file).mtimeMs };
}

/** Write the runner file (owner-only) by rename. */
export function writeRunnerFile(stateDir, data) {
  const problems = runnerFileProblems(data);
  if (problems.length) throw new Error(`runner file is invalid: ${problems.join("; ")}`);
  fs.mkdirSync(stateDir, { recursive: true });
  const file = runnerFilePath(stateDir);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  return file;
}

/** Environment for helper processes: ours, with the directory of `node` first on PATH. */
export function childEnv(node) {
  const env = { ...process.env };
  env.PATH = [path.dirname(node), process.env.PATH ?? ""].filter(Boolean).join(path.delimiter);
  env.NO_COLOR = "1";
  return env;
}

/**
 * Run `command ...args` with no shell, no stdin and a time limit, and collect
 * its output. Never used with arguments that start an agent: only version and help.
 */
export function probe(command, args, { node = process.execPath, timeoutMs = 15000, spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    let output = "";
    let child;
    try {
      child = spawnImpl(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false, env: childEnv(node) });
    } catch (error) {
      resolve({ ok: false, code: null, output: String(error.message) });
      return;
    }
    const append = (chunk) => {
      output = (output + chunk.toString("utf8")).slice(-65536);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // gone
      }
    }, timeoutMs);
    child.on("error", (error) => append(String(error.message)));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, output });
    });
  });
}

export const firstLine = (text) => String(text ?? "").split("\n").map((line) => line.trim()).find(Boolean) ?? "";

/**
 * Problems of one runner as it is installed now: the command is gone, its
 * version changed since the runner file was written, or its help no longer
 * lists a flag the recipe needs.
 */
export async function probeRunner(runner, { node, spawnImpl } = {}) {
  if (!isExecutable(runner.command)) return [{ code: "runner-missing", runner: runner.id, detail: runner.command }];
  const problems = [];
  const version = await probe(runner.command, ["--version"], { node, spawnImpl });
  if (!version.ok) problems.push({ code: "runner-broken", runner: runner.id, detail: firstLine(version.output) || `exit ${version.code}` });
  else if (runner.version && firstLine(version.output) !== runner.version) {
    problems.push({ code: "runner-version-changed", runner: runner.id, detail: `${runner.version} → ${firstLine(version.output)}` });
  }
  if (Array.isArray(runner.flags) && runner.flags.length > 0) {
    const help = await probe(runner.command, runner.helpArgs ?? ["--help"], { node, spawnImpl });
    for (const flag of runner.flags) {
      if (!help.output.includes(flag)) problems.push({ code: "runner-flag-missing", runner: runner.id, detail: flag });
    }
  }
  return problems;
}

/** Problems that can be told without running anything: the binding, the file, the paths. */
export function staticProblems(config, read) {
  if (!config.agent.enabled) return [{ code: "binding-disabled", detail: "agent.enabled is not true in the project binding" }];
  if (read.state === "missing") return [{ code: "runner-file-missing", detail: read.file }];
  if (read.state === "invalid") return [{ code: "runner-file-invalid", detail: `${read.file}: ${read.problems.join("; ")}` }];
  const problems = [];
  if (!isExecutable(read.data.node)) problems.push({ code: "node-missing", detail: read.data.node });
  if (!fs.existsSync(read.data.orchestratorRunTask)) problems.push({ code: "orchestrator-missing", detail: read.data.orchestratorRunTask });
  for (const runner of read.data.runners) if (!isExecutable(runner.command)) problems.push({ code: "runner-missing", runner: runner.id, detail: runner.command });
  return problems;
}

/** Candidate executables for a tool name: PATH entries, then the usual install places. */
export function candidatePaths(name, { home = process.env.HOME ?? "", pathEnv = process.env.PATH ?? "" } = {}) {
  const dirs = [...pathEnv.split(path.delimiter).filter(Boolean), path.join(home, ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  const out = [];
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (!out.includes(candidate) && isExecutable(candidate)) out.push(candidate);
  }
  return out;
}
