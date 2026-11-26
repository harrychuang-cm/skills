// Start the agent through the repository's agent-automation runner, unchanged.
//
//   node <orchestrator>/scripts/run-task.mjs --project-root <copy>
//        --config .agent-automation/code-layer-run.json --task code-layer-edit
//        --request "<fixed sentence>"
//
// The request text is not on this command line, nor on the runner's: the
// orchestrator builds the runner's prompt from the contract's fixed
// instruction and this fixed sentence. The launcher leads its own process
// group so a cancel or a time limit ends the agent and everything it started.
// Its output stays in memory (the last 16 KiB), for a failure message only.
import { spawn } from "node:child_process";
import process from "node:process";

import { CONTRACT_FILE, TASK_ID } from "./contract.mjs";
import { FIXED_REQUEST } from "./request-file.mjs";
import { childEnv } from "./runners.mjs";

const TAIL_BYTES = 16384;

export function launcherArgs({ runTask, copyRoot }) {
  return [runTask, "--project-root", copyRoot, "--config", CONTRACT_FILE, "--task", TASK_ID, "--request", FIXED_REQUEST];
}

/**
 * Returns { pid, done: Promise<{ code, signal }>, tail(), stop() }.
 * stop() sends SIGTERM to the whole group and SIGKILL two seconds later.
 */
export function launch({ node, runTask, copyRoot, spawnImpl = spawn }) {
  let output = "";
  const child = spawnImpl(node, launcherArgs({ runTask, copyRoot }), {
    cwd: copyRoot,
    env: childEnv(node),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    shell: false,
  });
  const append = (chunk) => {
    output = (output + chunk.toString("utf8")).slice(-TAIL_BYTES);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  const done = new Promise((resolve) => {
    child.on("error", (error) => {
      append(String(error.message));
      resolve({ code: null, signal: null, error: error.code ?? "spawn-error" });
    });
    child.on("close", (code, signal) => resolve({ code, signal, error: null }));
  });
  let killTimer = null;
  const signalGroup = (signal) => {
    if (typeof child.pid !== "number") return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // gone
      }
    }
  };
  return {
    pid: child.pid,
    done,
    tail: () => output,
    stop() {
      signalGroup("SIGTERM");
      if (!killTimer) {
        killTimer = setTimeout(() => signalGroup("SIGKILL"), 2000);
        killTimer.unref?.();
      }
    },
    /** For process exit: no timers, just end the group. */
    kill() {
      signalGroup("SIGKILL");
    },
  };
}
