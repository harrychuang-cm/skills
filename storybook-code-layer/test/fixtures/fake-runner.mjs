// A stand-in for an agent CLI, for tests that must never spend a cent.
//
// The orchestrator starts it as `node fake-runner.mjs <workspace> <prompt>`.
// It reads <workspace>/.code-layer-agent/request.md and does what the
// person's text asks with lines that start with "@":
//
//   @edit <path> <from> <to>       replace the first <from> in a file
//   @append <path> <text>          add text at the end of a file
//   @create <path> <text>          create a file
//   @delete <path>                 delete a file
//   @result <status> <summary> [question]
//   @result-raw <text>             write this text as the result file
//   @result-wrong-run              a result for another run
//   @extra-file <name>             write another file next to the result
//   @no-result                     write no result
//   @print <text>                  print to standard output
//   @print-env <NAME>              print an environment variable's value
//   @sleep <ms>   @hang   @exit <code>
//
// Arguments may be quoted with "…"; \n in them is a line break. Without any
// @result line the result is `done`. In a follow-up, only the designer's
// answer is read.
import fs from "node:fs";
import path from "node:path";

const [workspace] = process.argv.slice(2);
const folder = path.join(workspace, ".code-layer-agent");
const request = fs.readFileSync(path.join(folder, "request.md"), "utf8");
const runId = /^# Code Layer request (\S+)/m.exec(request)?.[1] ?? "unknown";

function section(text) {
  const answer = text.indexOf("### The designer's answer");
  if (answer !== -1) return text.slice(answer).split("\nThe answer does not change")[0];
  const start = text.indexOf("## Request");
  const end = text.indexOf("\n## Selected element");
  return text.slice(start, end === -1 ? undefined : end);
}

function tokenize(line) {
  const out = [];
  const pattern = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(line))) out.push(match[1] !== undefined ? match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : match[2]);
  return out;
}

const commands = section(request).split("\n").map((line) => line.trim()).filter((line) => line.startsWith("@")).map(tokenize);
const inside = (rel) => {
  const full = path.resolve(workspace, rel);
  if (!full.startsWith(`${path.resolve(workspace)}${path.sep}`)) throw new Error(`fake runner refuses a path outside the workspace: ${rel}`);
  return full;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let result = { runId, status: "done", summary: "Fake runner: done.", question: null };
let writeResult = true;
let raw = null;
for (const [name, ...args] of commands) {
  switch (name) {
    case "@edit": {
      const file = inside(args[0]);
      const text = fs.readFileSync(file, "utf8");
      if (!text.includes(args[1])) throw new Error(`fake runner: ${args[0]} does not contain ${args[1]}`);
      fs.writeFileSync(file, text.replace(args[1], args[2]));
      break;
    }
    case "@append":
      fs.appendFileSync(inside(args[0]), args[1]);
      break;
    case "@create":
      fs.mkdirSync(path.dirname(inside(args[0])), { recursive: true });
      fs.writeFileSync(inside(args[0]), args[1] ?? "");
      break;
    case "@delete":
      fs.rmSync(inside(args[0]));
      break;
    case "@result":
      result = { runId, status: args[0], summary: args[1] ?? "", question: args[2] ?? null };
      break;
    case "@result-raw":
      raw = args[0] ?? "";
      break;
    case "@result-wrong-run":
      result = { ...result, runId: "some-other-run" };
      break;
    case "@extra-file":
      fs.writeFileSync(path.join(folder, args[0]), "{}");
      break;
    case "@no-result":
      writeResult = false;
      break;
    case "@print":
      process.stdout.write(`${args[0]}\n`);
      break;
    case "@print-env":
      process.stdout.write(`${process.env[args[0]] ?? ""}\n`);
      break;
    case "@sleep":
      await sleep(Number(args[0]));
      break;
    case "@hang":
      await sleep(10 * 60 * 1000);
      break;
    case "@exit":
      process.exit(Number(args[0]));
      break;
    default:
      throw new Error(`fake runner: unknown command ${name}`);
  }
}
if (writeResult) fs.writeFileSync(path.join(folder, "result.json"), raw ?? JSON.stringify(result));
