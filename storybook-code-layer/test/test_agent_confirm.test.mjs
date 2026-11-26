// Approval outside the browser: the native dialog gets its text from a file,
// a terminal code approves only its own request once, three wrong codes void
// it, "off" is reported, and a denial starts nothing.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { agentWorkspace, postcss, requestBody, testConfirmer, treeHashes, waitFinal } from "./agent_helpers.mjs";
import { addon, tempDir } from "./helpers.mjs";

const { confirmationSummary, createConfirmer, defaultConfirmMode } = await addon("server/agent/confirm.mjs");
const { createAgentRuns } = await addon("server/agent/runs.mjs");
const { buildIndex } = await addon("server/index-builder.mjs");

const TRICKY = `Make it "quoted" \\ back\\slash\nand a second line; also 'single' and $(touch /tmp/never) \`ticks\``;

function capturingLog() {
  const lines = [];
  return { lines, info: (m) => lines.push(m), warn: (m) => lines.push(m), error: (m) => lines.push(m) };
}

/** A fake osascript: records its arguments, answers with `answer` and `code`. */
function fakeSpawn({ answer = "approve", code = 0 } = {}) {
  const calls = [];
  const spawnImpl = (command, args) => {
    calls.push({ command, args });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    setTimeout(() => {
      if (answer) child.stdout.emit("data", Buffer.from(`${answer}\n`));
      child.emit("close", code);
    }, 20);
    return child;
  };
  return { calls, spawnImpl };
}

const summary = (text = TRICKY) =>
  confirmationSummary({ locale: "zh-Hant", projectId: "fixture-v1", element: "Seal", runner: "Claude Code", allowed: ["tokens/tokens-comp.css", "sb/src/components/**"], text });

test("the summary names the project, the element, the runner, what may change, and the request", () => {
  const text = summary();
  for (const part of ["fixture-v1", "Seal", "Claude Code", "tokens/tokens-comp.css", "sb/src/components/**", TRICKY]) assert.ok(text.includes(part), part);
  const long = confirmationSummary({ locale: "en", projectId: "p", element: "e", runner: "r", allowed: [], text: "x".repeat(700) });
  assert.match(long, /first 600 of 700 characters shown/);
  assert.ok(!long.includes("x".repeat(601)));
});

test("native dialog: the request text is read from a file, never passed as an argument; the answer decides", async () => {
  const dir = tempDir("code-layer-confirm-");
  for (const answer of ["approve", "deny", "timeout"]) {
    const { calls, spawnImpl } = fakeSpawn({ answer });
    const confirmer = createConfirmer({ mode: "native-dialog", spawnImpl, testFile: null });
    const ticket = confirmer.request({ runId: `run-${answer}`, runDir: dir, requestHash: "h", summary: summary(), locale: "zh-Hant" });
    assert.equal(ticket.mode, "native-dialog");
    const { decision } = await ticket.done;
    assert.equal(decision, answer);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "/usr/bin/osascript");
    const joined = calls[0].args.join("\n");
    assert.ok(!joined.includes("quoted") && !joined.includes("back\\slash") && !joined.includes("second line"), "no part of the request is in the arguments");
    assert.ok(calls[0].args.includes(path.join(dir, "confirm.txt")), "the summary file is passed by path");
    assert.ok(fs.readFileSync(path.join(dir, "confirm.txt"), "utf8").includes(TRICKY));
    assert.equal((fs.statSync(path.join(dir, "confirm.txt")).mode & 0o777).toString(8), "600");
    // The denial is the default and the cancel button.
    assert.ok(joined.includes("default button 1 cancel button 1"));
  }
});

test("no graphical session: the native dialog falls back to a terminal code, never to no confirmation", async () => {
  const log = capturingLog();
  const { spawnImpl } = fakeSpawn({ answer: "", code: 1 });
  const confirmer = createConfirmer({ mode: "native-dialog", spawnImpl, log, testFile: null });
  const modes = [];
  const ticket = confirmer.request({ runId: "run-gui", runDir: tempDir(), requestHash: "h", summary: summary(), onModeChange: (m) => modes.push(m) });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(modes, ["terminal-code"]);
  assert.equal(confirmer.modeOf("run-gui"), "terminal-code");
  const code = /：(\d{6})/.exec(log.lines.join("\n"))?.[1];
  assert.ok(code, log.lines.join("\n"));
  assert.deepEqual(confirmer.submitCode("run-gui", code), { ok: true });
  assert.deepEqual(await ticket.done, { decision: "approve", via: "terminal-code" });
});

test("terminal code: it approves only its own request, once; three wrong codes void it", async () => {
  const log = capturingLog();
  const confirmer = createConfirmer({ mode: "terminal-code", log, testFile: null });
  const a = confirmer.request({ runId: "run-a", runDir: tempDir(), requestHash: "a", summary: summary("request A") });
  const codeA = /：(\d{6})/.exec(log.lines.at(-1))[1];
  assert.match(log.lines.at(-1), /request A/, "the terminal shows the same summary");
  confirmer.abandon("run-a");
  assert.equal((await a.done).decision, "deny");
  // A's code does not approve B.
  const b = confirmer.request({ runId: "run-b", runDir: tempDir(), requestHash: "b", summary: summary("request B") });
  const codeB = /：(\d{6})/.exec(log.lines.at(-1))[1];
  if (codeA !== codeB) assert.throws(() => confirmer.submitCode("run-b", codeA), (e) => e.code === "agent-code-invalid" && e.details.remaining === 2);
  else assert.throws(() => confirmer.submitCode("run-b", codeA === "000000" ? "000001" : "000000"), (e) => e.code === "agent-code-invalid");
  // The right code works once.
  assert.deepEqual(confirmer.submitCode("run-b", codeB), { ok: true });
  assert.equal((await b.done).decision, "approve");
  assert.throws(() => confirmer.submitCode("run-b", codeB), (e) => e.code === "agent-code-invalid");
  // Three wrong codes deny the request.
  const c = confirmer.request({ runId: "run-c", runDir: tempDir(), requestHash: "c", summary: summary() });
  const right = /：(\d{6})/.exec(log.lines.at(-1))[1];
  const wrong = right === "123456" ? "654321" : "123456";
  assert.throws(() => confirmer.submitCode("run-c", wrong), (e) => e.details.remaining === 2);
  assert.throws(() => confirmer.submitCode("run-c", wrong), (e) => e.details.remaining === 1);
  assert.throws(() => confirmer.submitCode("run-c", wrong), (e) => e.details.remaining === 0);
  assert.equal((await c.done).decision, "deny");
  assert.throws(() => confirmer.submitCode("run-c", right), (e) => e.code === "agent-code-invalid", "a voided code stays void");
});

test("confirmation off is explicit and reported; the default follows the platform", async () => {
  const confirmer = createConfirmer({ mode: "off", testFile: null });
  assert.equal(confirmer.unconfirmed, true);
  assert.deepEqual(await confirmer.request({ runId: "x", runDir: tempDir(), requestHash: "x", summary: "" }).done, { decision: "approve", via: "off" });
  assert.equal(defaultConfirmMode(null, "darwin"), "native-dialog");
  assert.equal(defaultConfirmMode(null, "linux"), "terminal-code");
  assert.equal(defaultConfirmMode("off", "darwin"), "off");
  const w = await agentWorkspace({ agent: { confirm: "off" }, confirmer: createConfirmer({ mode: "off", testFile: null }) });
  assert.deepEqual(w.runs.status().confirm, { mode: "off", unconfirmed: true });
});

test("the test stub answers from a file, and its native-fail falls back to a code", async () => {
  const dir = tempDir();
  const file = path.join(dir, "answer");
  fs.writeFileSync(file, "");
  const log = capturingLog();
  const confirmer = createConfirmer({ mode: "native-dialog", testFile: file, log });
  assert.match(log.lines.join("\n"), /test confirmation stub is active/);
  const ticket = confirmer.request({ runId: "stub", runDir: dir, requestHash: "s", summary: "s" });
  setTimeout(() => fs.writeFileSync(file, "deny"), 150);
  assert.equal((await ticket.done).decision, "deny");
  fs.writeFileSync(file, "native-fail");
  const second = confirmer.request({ runId: "stub-2", runDir: dir, requestHash: "s", summary: "s" });
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(confirmer.modeOf("stub-2"), "terminal-code");
  const code = /：(\d{6})/.exec(log.lines.at(-1))[1];
  confirmer.submitCode("stub-2", code);
  assert.equal((await second.done).decision, "approve");
});

test("a denied or timed-out request creates no working copy and starts no process", async () => {
  for (const decision of ["deny", "timeout"]) {
    const confirmer = testConfirmer({ auto: null });
    let launched = 0;
    const w = await agentWorkspace({ confirmer });
    // Same workspace, a launcher that counts.
    const runs = createAgentRuns({ config: w.config, engine: w.engine, postcss, log: { info() {}, warn() {}, error() {} }, confirmer, indexFor: () => buildIndex({ config: w.config, postcss }), launchImpl: () => {
      launched += 1;
      throw new Error("must not launch");
    } });
    await runs.settled();
    const before = treeHashes(w.ws);
    const { runId } = runs.submit(requestBody("anything"));
    assert.equal(confirmer.seen.length, 1);
    assert.match(confirmer.seen[0].summary, /anything/);
    confirmer.answer(runId, decision);
    const view = await waitFinal(runs, runId);
    assert.equal(view.state, "denied");
    assert.deepEqual(view.reasons.map((r) => r.code), [decision === "timeout" ? "confirmation-timeout" : "confirmation-denied"]);
    assert.equal(launched, 0);
    assert.equal(fs.existsSync(path.join(w.config.stateDir, "agent", runId, "work")), false);
    assert.equal(fs.existsSync(path.join(w.config.stateDir, "agent", runId, "confirm.txt")), false);
    assert.deepEqual(treeHashes(w.ws), before);
  }
});
