// Blocking checks: shell-free child processes with an environment allow-list,
// a timeout that kills the whole process group, and a 4 KiB output tail.
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ENV_NAMES = ["HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "SHELL", "TERM"];
const TAIL = 4096;

function childEnv() {
  const env = {};
  for (const name of ENV_NAMES) if (process.env[name] !== undefined) env[name] = process.env[name];
  env.PATH = [path.dirname(process.execPath), process.env.PATH ?? ""].filter(Boolean).join(path.delimiter);
  env.NO_COLOR = "1";
  return env;
}

function substitute(value, candidateRoot) {
  return value.split("{candidateRoot}").join(candidateRoot);
}

/** Problems with the configured scripts (missing file, changed hash). */
export function checkScriptProblems(checks) {
  const problems = [];
  for (const check of checks) {
    const script = check.args.find((arg) => path.isAbsolute(arg) && /\.(?:m?js|cjs)$/.test(arg));
    if (!script) continue;
    if (!fs.existsSync(script)) {
      problems.push({ id: check.id, problem: "missing", script });
      continue;
    }
    if (check.sha256) {
      const actual = `sha256:${crypto.createHash("sha256").update(fs.readFileSync(script)).digest("hex")}`;
      if (actual !== check.sha256) problems.push({ id: check.id, problem: "hash-changed", script });
    }
  }
  return problems;
}

export function runCheck(check, { candidateRoot }) {
  const started = Date.now();
  const command = check.command === "node" ? process.execPath : check.command;
  const args = check.args.map((arg) => substitute(arg, candidateRoot));
  const cwd = substitute(check.cwd, candidateRoot);
  return new Promise((resolve) => {
    let output = "";
    const append = (chunk) => {
      output = (output + chunk.toString("utf8")).slice(-TAIL);
    };
    let child;
    try {
      child = spawn(command, args, { cwd, env: childEnv(), stdio: ["ignore", "pipe", "pipe"], shell: false, detached: true });
    } catch (error) {
      resolve({ id: check.id, ok: false, code: null, signal: null, durationMs: 0, output: String(error.message) });
      return;
    }
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
      setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // already gone
        }
      }, 2000).unref();
    }, check.timeoutMs);
    child.on("error", (error) => append(String(error.message)));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        id: check.id,
        ok: code === 0 && !timedOut,
        code,
        signal,
        timedOut,
        durationMs: Date.now() - started,
        output: output.trim(),
      });
    });
  });
}

export async function runChecks(checks, options) {
  const results = [];
  for (const check of checks) {
    const result = await runCheck(check, options);
    results.push(result);
    if (!result.ok) break;
  }
  return { ok: results.every((r) => r.ok), results };
}
