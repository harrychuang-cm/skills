// Verification command of the Code Layer run contract. The orchestrator runs
// it in the working copy after the agent has exited:
//
//   node check-result.mjs --run-id <run id>
//
// Exit 0 when the copy holds exactly one well-formed result for this run,
// whatever its status; exit 1 otherwise. What the agent changed is judged
// later by the dev server's scope gate, not here.
import process from "node:process";

import { readResult } from "./request-file.mjs";

const at = process.argv.indexOf("--run-id");
const runId = at === -1 ? null : process.argv[at + 1];
if (!runId || !/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
  process.stderr.write("usage: check-result.mjs --run-id <id>\n");
  process.exit(2);
}
const result = readResult(process.cwd(), runId);
if (!result.ok) {
  process.stderr.write(`code-layer result: ${result.reason}${result.detail ? ` (${result.detail})` : ""}\n`);
  process.exit(1);
}
process.stdout.write(`code-layer result: ${result.result.status}\n`);
