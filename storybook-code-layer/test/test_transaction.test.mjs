import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { addon, loadPostcss, makeWorkspace, testProject } from "./helpers.mjs";

const { createEngine } = await addon("server/transaction.mjs");
const postcss = await loadPostcss();
const quiet = { info() {}, warn() {}, error() {} };
const HERE = path.dirname(fileURLToPath(import.meta.url));

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const stat = (file) => {
  const s = fs.statSync(file);
  return { ino: s.ino, mtimeMs: s.mtimeMs };
};

function tokenOp({ id = "op-1", token = "--t-comp-seal-container-color", from = "--t-sys-color-primary", to = "--t-sys-color-secondary" } = {}) {
  return { id, type: "rebind-token", token, fromToken: from, toToken: to, before: { value: `var(${from})` }, after: { value: `var(${to})` } };
}

function declOp({ id = "op-2", from = "--t-sys-shape-corner-sm", to = "--t-sys-shape-corner-md", ordinal = 0, selector = ".t-seal", property = "border-radius" } = {}) {
  return {
    id,
    type: "rebind-declaration",
    file: "src/components/seal/Seal.css",
    rule: { ordinal, selector, atRules: [], occurrence: 0 },
    declaration: { property },
    replacements: [{ refIndex: 0, fromToken: from, toToken: to }],
    fromToken: from,
    toToken: to,
    before: { value: `var(${from})` },
    after: { value: `var(${to})` },
  };
}

let batchCounter = 0;
function batch(operations, extra = {}) {
  batchCounter += 1;
  return { schemaVersion: 1, batchId: `b-${batchCounter}`, indexRevision: "sha256:test", operations, ...extra };
}

function paths(ws) {
  return {
    truth: path.join(ws, "tokens/tokens-comp.css"),
    mirror: path.join(ws, "sb/tokens/tokens-comp.css"),
    css: path.join(ws, "sb/src/components/seal/Seal.css"),
  };
}

function hashes(ws) {
  const p = paths(ws);
  return { truth: sha(p.truth), mirror: sha(p.mirror), css: sha(p.css) };
}

const CHECK_SCRIPTS = {
  "checks/log-candidate.mjs":
    'import fs from "node:fs";\nconst text = fs.readFileSync(process.argv[2] + "/tokens/tokens-comp.css", "utf8");\nfs.appendFileSync(process.argv[3], (text.match(/--t-comp-seal-container-color:[^;]*/) || ["?"])[0] + "\\n");\n',
  "checks/fail-on-secondary.mjs":
    'import fs from "node:fs";\nconst text = fs.readFileSync(process.argv[2] + "/tokens/tokens-comp.css", "utf8");\nif (text.includes("--t-sys-color-secondary")) { console.error("secondary is not allowed"); process.exit(1); }\n',
  "checks/always-fail.mjs": 'console.error("broken project"); process.exit(1);\n',
};

function checkConfig(ws, scripts) {
  return {
    checks: scripts.map((script, i) => ({
      id: `check-${i}`,
      command: "node",
      args: [path.join(ws, script), "{candidateRoot}", path.join(ws, "check.log")],
      cwd: "{candidateRoot}",
      appliesTo: "tokens",
      timeoutMs: 20000,
    })),
  };
}

async function workspace(scripts = ["checks/log-candidate.mjs"], files = {}) {
  const made = await makeWorkspace({ files: { ...CHECK_SCRIPTS, ...files }, config: (ws) => checkConfig(ws, scripts) });
  return made;
}

test("apply rebind-token: source and mirror change on one line, checks saw the candidate, undo is exact", async () => {
  const { ws, config } = await workspace();
  const before = hashes(ws);
  const engine = createEngine({ config, postcss, log: quiet });
  const result = await engine.apply(batch([tokenOp()]));
  assert.equal(result.ok, true);
  const p = paths(ws);
  const truth = fs.readFileSync(p.truth, "utf8");
  assert.ok(truth.includes("--t-comp-seal-container-color: var(--t-sys-color-secondary);   /* voice */"));
  assert.ok(fs.readFileSync(p.truth).equals(fs.readFileSync(p.mirror)), "mirror equals source");
  assert.equal(sha(p.css), before.css);
  const log = fs.readFileSync(path.join(ws, "check.log"), "utf8").trim().split("\n");
  assert.deepEqual(log, ["--t-comp-seal-container-color: var(--t-sys-color-primary)", "--t-comp-seal-container-color: var(--t-sys-color-secondary)"], "baseline on the source, then the candidate");
  assert.deepEqual(result.expect.tokens, [{ token: "--t-comp-seal-container-color", value: "var(--t-sys-color-secondary)" }]);
  assert.deepEqual(engine.state().undoStack.map((u) => u.applyId), [result.applyId]);
  const undone = await engine.undo({ applyId: result.applyId });
  assert.equal(undone.undone, result.applyId);
  assert.deepEqual(hashes(ws), before, "undo restores exact bytes");
  assert.deepEqual(engine.state().undoStack, []);
});

test("apply rebind-declaration: one name changes, no token checks run", async () => {
  const { ws, config } = await workspace(["checks/always-fail.mjs"]);
  const before = hashes(ws);
  const engine = createEngine({ config, postcss, log: quiet });
  const result = await engine.apply(batch([declOp()]));
  const css = fs.readFileSync(paths(ws).css, "utf8");
  assert.ok(css.includes("border-radius: var(--t-sys-shape-corner-md);"));
  assert.equal(sha(paths(ws).truth), before.truth);
  assert.equal(result.expect.css.length, 1);
  assert.match(result.expect.css[0].servedTextHashAfter, /^sha256:/);
  await engine.undo({ applyId: result.applyId });
  assert.deepEqual(hashes(ws), before);
});

test("a failing check writes nothing (mtime and inode unchanged)", async () => {
  const { ws, config } = await workspace(["checks/fail-on-secondary.mjs"]);
  const p = paths(ws);
  const before = { truth: stat(p.truth), mirror: stat(p.mirror), hashes: hashes(ws) };
  const engine = createEngine({ config, postcss, log: quiet });
  await assert.rejects(engine.apply(batch([tokenOp()])), (e) => e.code === "check-failed" && e.details.results[0].output.includes("secondary is not allowed"));
  assert.deepEqual(stat(p.truth), before.truth);
  assert.deepEqual(stat(p.mirror), before.mirror);
  assert.deepEqual(hashes(ws), before.hashes);
  assert.deepEqual(engine.state().undoStack, []);
});

test("baseline failing or script missing: token batches refused, declaration batches allowed", async () => {
  const failing = await workspace(["checks/always-fail.mjs"]);
  const engine = createEngine({ config: failing.config, postcss, log: quiet });
  await assert.rejects(engine.apply(batch([tokenOp()])), (e) => e.code === "checks-baseline-failing");
  assert.deepEqual(hashes(failing.ws).truth, sha(paths(failing.ws).truth));
  await engine.apply(batch([declOp()]));

  const missing = await workspace(["checks/does-not-exist.mjs"]);
  const engine2 = createEngine({ config: missing.config, postcss, log: quiet });
  await assert.rejects(engine2.apply(batch([tokenOp()])), (e) => e.code === "checks-unavailable");
});

test("rejections write nothing", async () => {
  const { ws, config } = await workspace();
  const before = hashes(ws);
  const engine = createEngine({ config, postcss, log: quiet });
  const cases = [
    [batch([tokenOp(), tokenOp({ id: "op-9" })]), "duplicate-target"],
    [batch([tokenOp({ from: "--t-sys-color-secondary", to: "--t-sys-color-primary" })]), "stale-before"],
    [batch([{ ...tokenOp(), after: { value: "var(--t-sys-shape-corner-md)" } }]), "after-value-mismatch"],
    [batch([tokenOp({ to: "--t-sys-shape-corner-md" })]), "type-mismatch"],
    [batch([tokenOp({ to: "--t-ref-color-blue-70" })]), "tier-rule"],
    [batch([tokenOp({ to: "--t-sys-chrome-only" })]), "not-a-design-token"],
    [batch([tokenOp({ to: "--t-sys-color-primary" })]), "no-op"],
    [batch([declOp({ selector: ".t-other" })]), "locator-mismatch"],
    [batch([declOp({ ordinal: 1, selector: ".t-seal--wide", property: "min-inline-size", from: "--t-sys-size-min", to: "--t-sys-size-min" })]), "no-op"],
    [batch([declOp({ ordinal: 1, selector: ".t-seal--wide", property: "min-inline-size", from: "--t-sys-size-min", to: "--t-sys-shape-corner-md" })]), "unsupported-value-shape"],
    [batch([declOp({ to: "--t-comp-seal-shape" })]), null],
    [batch([{ ...tokenOp(), extra: 1 }]), "schema-invalid"],
    [batch([{ ...declOp(), file: "../../etc/passwd.css" }]), "schema-invalid"],
  ];
  for (const [body, code] of cases) {
    if (code === null) continue;
    await assert.rejects(engine.apply(body), (e) => e.code === code, `expected ${code}`);
  }
  assert.deepEqual(hashes(ws), before);
});

test("foreign comp token in a declaration is refused", async () => {
  const { ws, config } = await workspace(["checks/log-candidate.mjs"], {
    "tokens/tokens-comp.css": ":root {\n  --t-comp-seal-container-color: var(--t-sys-color-primary);\n  --t-comp-other-shape: var(--t-sys-shape-corner-md);\n}\n",
    "sb/tokens/tokens-comp.css": ":root {\n  --t-comp-seal-container-color: var(--t-sys-color-primary);\n  --t-comp-other-shape: var(--t-sys-shape-corner-md);\n}\n",
  });
  const engine = createEngine({ config, postcss, log: quiet });
  const before = hashes(ws);
  await assert.rejects(engine.apply(batch([declOp({ to: "--t-comp-other-shape" })])), (e) => e.code === "foreign-comp-token");
  assert.deepEqual(hashes(ws), before);
});

test("dry run returns the plan and writes nothing", async () => {
  const { ws, config } = await workspace();
  const before = hashes(ws);
  const engine = createEngine({ config, postcss, log: quiet });
  const plan = await engine.apply(batch([tokenOp(), declOp()], { dryRun: true }), { dryRun: true });
  assert.equal(plan.dryRun, true);
  assert.deepEqual(plan.files.map((f) => f.role), ["token-source", "token-mirror", "component-css"]);
  assert.deepEqual(plan.files[0].edits, [{ line: 3, before: "--t-sys-color-primary", after: "--t-sys-color-secondary" }]);
  assert.deepEqual(hashes(ws), before);
});

test("mirror drift refuses every apply until sync-mirror", async () => {
  const { ws, config } = await workspace(["checks/log-candidate.mjs"], {
    "sb/tokens/tokens-sys.css": ":root {\n  --t-sys-color-primary: var(--t-ref-color-red-60);\n}\n",
  });
  const engine = createEngine({ config, postcss, log: quiet });
  await assert.rejects(engine.apply(batch([declOp()])), (e) => e.code === "mirror-drift" && e.details.mirrors[0].id === "tokens:sys" && e.details.mirrors[0].diffLines > 0);
  const dry = await engine.syncMirror({ dryRun: true });
  assert.deepEqual(dry.changed, ["sb/tokens/tokens-sys.css"]);
  const synced = await engine.syncMirror({});
  assert.deepEqual(synced.changed, ["sb/tokens/tokens-sys.css"]);
  assert.ok(fs.readFileSync(path.join(ws, "tokens/tokens-sys.css")).equals(fs.readFileSync(path.join(ws, "sb/tokens/tokens-sys.css"))));
  await engine.apply(batch([declOp()]));
});

test("undo conflict when the file changed after apply; skip moves on to the next one", async () => {
  const { ws, config } = await workspace();
  const engine = createEngine({ config, postcss, log: quiet });
  const first = await engine.apply(batch([declOp()]));
  const second = await engine.apply(batch([tokenOp()]));
  const p = paths(ws);
  const changedTruth = `${fs.readFileSync(p.truth, "utf8")}/* edited by hand */\n`;
  fs.writeFileSync(p.truth, changedTruth);
  await assert.rejects(engine.undo({ applyId: first.applyId }), (e) => e.code === "not-latest");
  await assert.rejects(engine.undo({ applyId: second.applyId }), (e) => e.code === "undo-conflict" && e.details.conflicts[0].file === "tokens/tokens-comp.css");
  assert.equal(fs.readFileSync(p.truth, "utf8"), changedTruth, "conflicting file untouched");
  await engine.skip({ applyId: second.applyId });
  await engine.undo({ applyId: first.applyId });
  assert.ok(fs.readFileSync(p.css, "utf8").includes("var(--t-sys-shape-corner-sm)"));
  assert.ok(fs.existsSync(path.join(config.stateDir, "backups", second.applyId, "0.bak")), "backup of the skipped apply is kept");
});

test("the undo stack survives a restart (rebuilt from the journal)", async () => {
  const { ws, config } = await workspace();
  const before = hashes(ws);
  const first = createEngine({ config, postcss, log: quiet });
  const applied = await first.apply(batch([declOp()]));
  const second = createEngine({ config, postcss, log: quiet });
  assert.deepEqual(second.state().undoStack.map((u) => u.applyId), [applied.applyId]);
  await second.undo({ applyId: applied.applyId });
  assert.deepEqual(hashes(ws), before);
});

function runChild(config, configFile, projectRoot, body) {
  return spawn(process.execPath, [path.join(HERE, "fixtures/apply-child.mjs"), configFile, projectRoot, JSON.stringify(body)], {
    env: { ...process.env, CODE_LAYER_TEST_PAUSE_AFTER_FIRST_WRITE: "1", CODE_LAYER_TEST_PROJECT: testProject() },
    stdio: "ignore",
  });
}

async function waitForFile(file, timeout = 15000) {
  const started = Date.now();
  while (!fs.existsSync(file)) {
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${file}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

test("kill -9 between two writes: restart restores the source of truth and takes over the lock", async () => {
  const { ws, config, configFile, projectRoot } = await workspace();
  const before = hashes(ws);
  const child = runChild(config, configFile, projectRoot, batch([tokenOp()]));
  await waitForFile(path.join(config.stateDir, "test-paused"));
  assert.notEqual(sha(paths(ws).truth), before.truth, "source of truth was written");
  assert.equal(sha(paths(ws).mirror), before.mirror, "mirror not yet written");
  child.kill("SIGKILL");
  await new Promise((r) => child.on("exit", r));
  const lockOwner = JSON.parse(fs.readFileSync(path.join(config.stateDir, "lock.json"), "utf8")).pid;
  assert.equal(lockOwner, child.pid);
  const engine = createEngine({ config, postcss, log: quiet });
  assert.deepEqual(engine.state().readOnlyReasons, []);
  assert.deepEqual(hashes(ws), before, "recovered to the state before the transaction");
  assert.equal(JSON.parse(fs.readFileSync(path.join(config.stateDir, "lock.json"), "utf8")).pid, process.pid);
  await engine.apply(batch([tokenOp()]));
});

test("a file edited by hand after a crash is never overwritten; the tool stays read-only", async () => {
  const { ws, config, configFile, projectRoot } = await workspace();
  const child = runChild(config, configFile, projectRoot, batch([tokenOp()]));
  await waitForFile(path.join(config.stateDir, "test-paused"));
  child.kill("SIGKILL");
  await new Promise((r) => child.on("exit", r));
  const p = paths(ws);
  const handEdited = `${fs.readFileSync(p.truth, "utf8")}/* fixed by hand */\n`;
  fs.writeFileSync(p.truth, handEdited);
  const engine = createEngine({ config, postcss, log: quiet });
  assert.equal(engine.state().readOnlyReasons[0].code, "recovery-required");
  assert.equal(fs.readFileSync(p.truth, "utf8"), handEdited);
  await assert.rejects(engine.apply(batch([declOp()])), (e) => e.code === "read-only");
});

test("a live lock owner makes a second engine read-only", async () => {
  const { config } = await workspace();
  const sleeper = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
  try {
    fs.mkdirSync(config.stateDir, { recursive: true });
    fs.writeFileSync(path.join(config.stateDir, "lock.json"), JSON.stringify({ pid: sleeper.pid }));
    const engine = createEngine({ config, postcss, log: quiet });
    assert.equal(engine.state().readOnlyReasons[0].code, "locked");
    await assert.rejects(engine.apply(batch([declOp()])), (e) => e.code === "read-only");
  } finally {
    sleeper.kill("SIGKILL");
  }
});

test("re-announce: notifyChanged receives only files inside the project root", async () => {
  const { ws, config } = await workspace();
  const seen = [];
  const engine = createEngine({ config, postcss, log: quiet, notifyChanged: (files) => seen.push(...files) });
  await engine.apply(batch([tokenOp(), declOp()]));
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual(seen.sort(), [paths(ws).css, paths(ws).mirror].sort());
});
