// The agent-automation run contract for one Code Layer run.
//
// It is written inside the working copy, never in the project: the project
// needs no agent-automation file of its own, the absolute paths of this
// machine stay out of shared configuration, and the orchestrator's rule that
// its state directory lies inside the project root is met by the copy.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RESULT_FILE, TASK_INSTRUCTION } from "./request-file.mjs";

export const CONTRACT_FILE = ".agent-automation/code-layer-run.json";
export const CONTRACT_STATE_DIR = ".agent-automation/runs";
// No credential-like word in any key: the orchestrator refuses such keys.
export const TASK_ID = "code-layer-edit";

export const CHECK_RESULT_SCRIPT = fileURLToPath(new URL("./check-result.mjs", import.meta.url));

/**
 * The contract object.
 * runnerFile: the parsed agent-runners.json; runId: Code Layer's run id;
 * timeoutMs: the binding's limit per runner (the runner file may set less).
 */
export function buildContract({ runnerFile, runId, timeoutMs }) {
  return {
    schemaVersion: 1,
    stateDir: CONTRACT_STATE_DIR,
    runners: runnerFile.runners.map((runner) => ({
      id: runner.id,
      label: runner.label,
      command: runner.command,
      args: [...runner.args],
      timeoutMs: Math.min(runner.timeoutMs, timeoutMs),
      inheritEnv: [...(runner.inheritEnv ?? [])],
    })),
    tasks: {
      [TASK_ID]: {
        instruction: TASK_INSTRUCTION,
        verification: [{ command: runnerFile.node, args: [CHECK_RESULT_SCRIPT, "--run-id", runId], timeoutMs: 30000 }],
        requiredArtifacts: [RESULT_FILE],
      },
    },
  };
}

export function writeContract(copyRoot, contract) {
  const file = path.join(copyRoot, CONTRACT_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(contract, null, 2)}\n`, { mode: 0o600 });
  return file;
}

/** The orchestrator's run summary for our task, or null while there is none. */
export function readRunSummary(copyRoot) {
  const dir = path.join(copyRoot, CONTRACT_STATE_DIR);
  let names;
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith(".json") && !name.startsWith("."));
  } catch {
    return null;
  }
  for (const name of names) {
    try {
      const summary = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (summary.taskId === TASK_ID) return summary;
    } catch {
      // being rewritten: read again later
    }
  }
  return null;
}
