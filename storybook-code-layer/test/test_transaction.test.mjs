import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FIXTURE_V1_ROOT, addon, fixtureV1Config, loadPostcss, makeWorkspace, testProject } from "./helpers.mjs";

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

// ---- closed writable set (v1 fixture) ---------------------------------------

function fxTokenOp(token, from, to, id = "op-1") {
  return { id, type: "rebind-token", token, fromToken: from, toToken: to, before: { value: `var(${from})` }, after: { value: `var(${to})` } };
}

function fxDeclOp({
  id = "op-2",
  file = "src/components/seal/Seal.css",
  ordinal = 0,
  selector = ".fx-seal",
  atRules = [],
  property = "border-radius",
  from = "--fx-comp-seal-shape",
  to = "--fx-sys-shape-corner-md",
  refIndex = 0,
  before = `var(${from})`,
  after = null,
} = {}) {
  return {
    id,
    type: "rebind-declaration",
    file,
    rule: { ordinal, selector, atRules, occurrence: 0 },
    declaration: { property },
    replacements: [{ refIndex, fromToken: from, toToken: to }],
    fromToken: from,
    toToken: to,
    before: { value: before },
    // By default: the before value with every occurrence of the old name replaced (fine when it occurs once).
    after: { value: after ?? before.split(`var(${from})`).join(`var(${to})`) },
  };
}

/** content hash, modification time and inode of every file outside the state directory. */
function treeFacts(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.name === ".code-layer" || entry.name === "node_modules") continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const s = fs.statSync(full);
        out[path.relative(root, full)] = `${sha(full)} ${s.mtimeMs} ${s.ino}`;
      }
    }
  };
  walk(root);
  return out;
}

const BORDER = "var(--fx-comp-seal-rule-width) solid var(--fx-comp-seal-rule-color)";
const sysWritable = () => ({
  tokens: {
    ...fixtureV1Config().tokens,
    tiers: ["ref", "sys", "comp"].map((tier) => ({ tier, source: `../tokens/tokens-${tier}.css`, mirror: `tokens/tokens-${tier}.css`, writable: tier !== "ref" })),
  },
});

function treeHashes(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.name === ".code-layer" || entry.name === "node_modules") continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out[path.relative(root, full)] = sha(full);
    }
  };
  walk(root);
  return out;
}

test("closed writable set: specifications are enumerated; a symlinked one is read-only and refuses the batches that would change it", async () => {
  const { ws, config } = await makeWorkspace({ fixture: "v1", config: { governance: { componentSpecsDir: "../design-system/components" } } });
  const sealSpec = path.join(ws, "design-system/components/seal.md");
  fs.renameSync(sealSpec, path.join(ws, "seal-elsewhere.md"));
  fs.symlinkSync(path.join(ws, "seal-elsewhere.md"), sealSpec);
  const engine = createEngine({ config, postcss, log: quiet });
  const set = engine.state().writableSet;
  // 1 writable tier file + 4 mirrors + 2 stylesheets + 2 specifications.
  assert.equal(set.files, 9);
  assert.deepEqual(set.unwritable, [{ file: "design-system/components/seal.md", problems: ["symlink", "not-a-regular-file"] }]);

  const before = treeHashes(ws);
  await assert.rejects(
    engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary")])),
    (e) => e.code === "read-only" && e.details.file === "design-system/components/seal.md" && e.details.problems.includes("symlink"),
  );
  assert.deepEqual(treeHashes(ws), before, "the refused batch changed nothing, the token file included");
  // A token documented by a healthy specification, and a stylesheet edit, are unaffected.
  await engine.apply(batch([fxTokenOp("--fx-comp-title-text-color", "--fx-sys-color-ink-strong", "--fx-sys-color-primary")]));
  await engine.apply(batch([fxDeclOp()]));
});

test("closed writable set: a path-like key, a stylesheet replaced by a symlink and one created after start are refused", async () => {
  const { ws, config } = await makeWorkspace({ fixture: "v1" });
  const engine = createEngine({ config, postcss, log: quiet });
  const before = treeHashes(ws);
  await assert.rejects(engine.apply(batch([fxDeclOp({ file: "../outside.css" })])), (e) => e.code === "schema-invalid");
  await assert.rejects(engine.apply(batch([fxDeclOp({ file: "/etc/hosts.css" })])), (e) => e.code === "schema-invalid");

  // Created after start: indexed on the next request, but not in the set recorded at start.
  fs.writeFileSync(path.join(ws, "sb/src/components/seal/Late.css"), ".fx-late {\n  border-radius: var(--fx-comp-seal-shape);\n}\n");
  const withLate = treeHashes(ws);
  await assert.rejects(
    engine.apply(batch([fxDeclOp({ file: "src/components/seal/Late.css", selector: ".fx-late" })])),
    (e) => e.code === "read-only" && /not in the writable set/.test(e.message),
  );
  assert.deepEqual(treeHashes(ws), withLate);
  const restarted = createEngine({ config, postcss, log: quiet });
  await restarted.apply(batch([fxDeclOp({ file: "src/components/seal/Late.css", selector: ".fx-late" })]));

  // Replaced by a symbolic link after start.
  const css = path.join(ws, "sb/src/components/title/Title.css");
  fs.renameSync(css, path.join(ws, "Title-elsewhere.css"));
  fs.symlinkSync(path.join(ws, "Title-elsewhere.css"), css);
  const linked = treeHashes(ws);
  const target = sha(path.join(ws, "Title-elsewhere.css"));
  await assert.rejects(
    restarted.apply(batch([fxDeclOp({ file: "src/components/title/Title.css", selector: ".fx-title", property: "font-size", from: "--fx-comp-title-size", to: "--fx-sys-typescale-label-size" })])),
    // Symbolic links are never indexed, so the stylesheet is no longer a known target.
    (e) => e.code === "locator-mismatch" && /not an indexed component stylesheet/.test(e.message),
  );
  assert.deepEqual(restarted.state().writableSet.unwritable.map((u) => u.file), ["sb/src/components/title/Title.css"]);
  assert.deepEqual(treeHashes(ws), linked);
  assert.equal(sha(path.join(ws, "Title-elsewhere.css")), target, "the link target is untouched");
  assert.deepEqual(before["sb/src/components/title/Title.css"], target);
});

test("names alone do not make a re-bind target", async () => {
  const { ws, config } = await makeWorkspace({
    fixture: "v1",
    files: { "sb/src/legacy/ghost.css": ":root {\n  --fx-sys-color-ghost: #123456;\n}\n" },
  });
  const engine = createEngine({ config, postcss, log: quiet });
  const before = treeHashes(ws);
  await assert.rejects(engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-ghost")])), (e) => e.code === "not-a-design-token");
  await assert.rejects(engine.apply(batch([fxDeclOp({ property: "gap", from: "--fx-sys-spacing-xs", to: "--fx-sys-chrome-only" })])), (e) => e.code === "not-a-design-token");
  assert.deepEqual(treeHashes(ws), before);
});

// ---- operations: reference positions and the system tier ---------------------

test("a reference at a later position: only the second reference of a border changes", async () => {
  const { ws, config } = await makeWorkspace({ fixture: "v1" });
  const css = path.join(ws, "sb/src/components/seal/Seal.css");
  const original = fs.readFileSync(css, "utf8");
  const others = treeFacts(ws);
  const engine = createEngine({ config, postcss, log: quiet });
  const op = fxDeclOp({ property: "border", refIndex: 1, from: "--fx-comp-seal-rule-color", to: "--fx-sys-color-primary", before: BORDER });
  const result = await engine.apply(batch([op]));
  assert.deepEqual(result.files.map((f) => [f.file, f.edits]), [["sb/src/components/seal/Seal.css", [{ line: 11, before: "--fx-comp-seal-rule-color", after: "--fx-sys-color-primary" }]]]);
  const now = fs.readFileSync(css, "utf8");
  assert.equal(now, original.replace("solid var(--fx-comp-seal-rule-color)", "solid var(--fx-sys-color-primary)"), "the file differs in the token name only");
  assert.ok(now.includes("border: var(--fx-comp-seal-rule-width) solid var(--fx-sys-color-primary);"), "the width reference is untouched");
  const after = treeFacts(ws);
  delete others["sb/src/components/seal/Seal.css"];
  delete after["sb/src/components/seal/Seal.css"];
  assert.deepEqual(after, others, "no other file was touched");
  // The only reference of a list with literals: `margin: 0 0 var(--gap)`.
  await engine.apply(batch([fxDeclOp({ ordinal: 2, selector: ".fx-seal--stamp", property: "margin", from: "--fx-sys-spacing-sm", to: "--fx-sys-spacing-lg", before: "0 0 var(--fx-sys-spacing-sm)" })]));
  assert.ok(fs.readFileSync(css, "utf8").includes("margin: 0 0 var(--fx-sys-spacing-lg);"));
});

test("two operations on one declaration: one batch equals two batches; the same reference twice is refused", async () => {
  const width = (before) => fxDeclOp({ id: "w", property: "border", refIndex: 0, from: "--fx-comp-seal-rule-width", to: "--fx-sys-stroke-thick", before, after: before.replace("var(--fx-comp-seal-rule-width)", "var(--fx-sys-stroke-thick)") });
  const color = (before) => fxDeclOp({ id: "c", property: "border", refIndex: 1, from: "--fx-comp-seal-rule-color", to: "--fx-sys-color-primary", before, after: before.replace("var(--fx-comp-seal-rule-color)", "var(--fx-sys-color-primary)") });

  const once = await makeWorkspace({ fixture: "v1" });
  const engineOnce = createEngine({ config: once.config, postcss, log: quiet });
  // Both operations were staged on the same original value; each states its own result.
  const result = await engineOnce.apply(batch([width(BORDER), color(BORDER)]));
  assert.equal(result.files.length, 1);
  assert.deepEqual(result.files[0].edits.map((e) => e.after), ["--fx-sys-stroke-thick", "--fx-sys-color-primary"]);

  const twice = await makeWorkspace({ fixture: "v1" });
  const engineTwice = createEngine({ config: twice.config, postcss, log: quiet });
  await engineTwice.apply(batch([color(BORDER)]));
  await engineTwice.apply(batch([width("var(--fx-comp-seal-rule-width) solid var(--fx-sys-color-primary)")]));

  const file = "sb/src/components/seal/Seal.css";
  const a = fs.readFileSync(path.join(once.ws, file));
  assert.ok(a.equals(fs.readFileSync(path.join(twice.ws, file))), "same bytes either way");
  assert.ok(a.toString("utf8").includes("border: var(--fx-sys-stroke-thick) solid var(--fx-sys-color-primary);"));
  // Undoing the single batch restores the original.
  await engineOnce.undo({ applyId: result.applyId });
  assert.ok(fs.readFileSync(path.join(once.ws, file)).equals(fs.readFileSync(path.join(FIXTURE_V1_ROOT, "workspace", file))));

  const facts = treeFacts(once.ws);
  await assert.rejects(engineOnce.apply(batch([color(BORDER), { ...color(BORDER), id: "c2" }])), (e) => e.code === "duplicate-target");
  await assert.rejects(engineOnce.apply(batch([fxDeclOp({ property: "border", refIndex: 2, from: "--fx-comp-seal-rule-color", to: "--fx-sys-color-primary", before: BORDER })])), (e) => e.code === "schema-invalid", "no third reference");
  await assert.rejects(engineOnce.apply(batch([{ ...color(BORDER), replacements: [{ refIndex: 64, fromToken: "--fx-comp-seal-rule-color", toToken: "--fx-sys-color-primary" }] }])), (e) => e.code === "schema-invalid");
  await assert.rejects(engineOnce.apply(batch([{ ...color(BORDER), replacements: [{ refIndex: -1, fromToken: "--fx-comp-seal-rule-color", toToken: "--fx-sys-color-primary" }] }])), (e) => e.code === "schema-invalid");
  assert.deepEqual(treeFacts(once.ws), facts);
});

test("the system tier: re-bound to a reference token only when the binding opens it", async () => {
  const toBlue = () => fxTokenOp("--fx-sys-color-primary", "--fx-ref-color-red-60", "--fx-ref-color-blue-70");
  const closed = await makeWorkspace({ fixture: "v1" });
  const closedEngine = createEngine({ config: closed.config, postcss, log: quiet });
  const closedFacts = treeFacts(closed.ws);
  await assert.rejects(closedEngine.apply(batch([toBlue()])), (e) => e.code === "tier-not-writable" && e.details.tier === "sys");
  assert.deepEqual(treeFacts(closed.ws), closedFacts);

  const open = await makeWorkspace({ fixture: "v1", config: sysWritable() });
  const engine = createEngine({ config: open.config, postcss, log: quiet });
  const facts = treeFacts(open.ws);
  await assert.rejects(engine.apply(batch([fxTokenOp("--fx-sys-color-primary", "--fx-ref-color-red-60", "--fx-sys-color-secondary")])), (e) => e.code === "tier-rule", "a system token does not alias a system token");
  await assert.rejects(engine.apply(batch([fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-ref-color-blue-70")])), (e) => e.code === "tier-rule", "a component token does not alias a reference token");
  await assert.rejects(engine.apply(batch([fxTokenOp("--fx-ref-color-red-60", "--fx-ref-color-red-50", "--fx-ref-color-blue-70")])), (e) => e.code === "tier-not-writable" && e.details.tier === "ref", "a reference token is never re-bound");
  assert.deepEqual(treeFacts(open.ws), facts);

  const result = await engine.apply(batch([toBlue()]));
  assert.deepEqual(result.files.map((f) => [f.file, f.role, f.edits.length]), [["tokens/tokens-sys.css", "token-source", 1], ["sb/tokens/tokens-sys.css", "token-mirror", 1]]);
  const sysFile = fs.readFileSync(path.join(open.ws, "tokens/tokens-sys.css"), "utf8");
  assert.ok(sysFile.includes("--fx-sys-color-primary: var(--fx-ref-color-blue-70);"));
  assert.ok(sysFile.includes("--fx-sys-color-primary-warm: var(--fx-ref-color-red-50);"), "a token whose name extends the edited one is untouched");
  assert.ok(fs.readFileSync(path.join(open.ws, "tokens/tokens-sys.css")).equals(fs.readFileSync(path.join(open.ws, "sb/tokens/tokens-sys.css"))));
  assert.deepEqual(result.expect.tokens, [{ token: "--fx-sys-color-primary", value: "var(--fx-ref-color-blue-70)" }]);
  await engine.undo({ applyId: result.applyId });
  assert.deepEqual(treeHashes(open.ws), Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, v.split(" ")[0]])), "undo restores every byte");
});

test("every rejection code of the specification: nothing is created, modified or renamed", async () => {
  const checkScript = (name, body) => ({ [`checks/${name}.mjs`]: body });
  const withCheck = (name) => (ws) => ({ checks: [{ id: name, command: "node", args: [path.join(ws, `checks/${name}.mjs`), "{candidateRoot}"], cwd: "{candidateRoot}", appliesTo: "tokens", timeoutMs: 20000 }] });
  const container = (to) => fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", to);
  const twiceDeclared = fs.readFileSync(path.join(FIXTURE_V1_ROOT, "workspace/tokens/tokens-comp.css"), "utf8").replace("  /* title */", "  --fx-comp-seal-shape: var(--fx-sys-shape-corner-md);\n  /* title */");
  const cases = [
    ["not-a-design-token", {}, [container("--fx-sys-color-nowhere")]],
    ["tier-not-writable", {}, [fxTokenOp("--fx-sys-color-primary", "--fx-ref-color-red-60", "--fx-ref-color-blue-70")]],
    ["tier-rule", {}, [container("--fx-ref-color-blue-70")]],
    ["foreign-comp-token", {}, [fxDeclOp({ to: "--fx-comp-title-gap", property: "gap", from: "--fx-sys-spacing-xs" })]],
    ["type-mismatch", {}, [container("--fx-sys-spacing-sm")]],
    ["no-op", {}, [container("--fx-sys-color-primary")]],
    ["unsupported-value-shape", {}, [fxDeclOp({ ordinal: 2, selector: ".fx-seal--stamp", property: "inline-size", from: "--fx-sys-size-touch-min", to: "--fx-sys-size-icon", before: "calc(var(--fx-sys-size-touch-min) * 2)" })], "an expression"],
    ["unsupported-value-shape", {}, [fxDeclOp({ ordinal: 2, selector: ".fx-seal--stamp", property: "opacity", from: "--fx-sys-state-disabled-opacity", to: "--fx-sys-typescale-display-line-height" })], "an important declaration"],
    ["unsupported-value-shape", {}, [fxDeclOp({ ordinal: 3, selector: ".fx-seal--ribbon", property: "padding", from: "--fx-sys-spacing-sm", to: "--fx-sys-spacing-md", before: "var(--fx-sys-spacing-sm) var(--fx-sys-spacing-lg)" })], "declared twice in its rule"],
    ["unsupported-value-shape", {}, [fxDeclOp({ file: "src/components/title/Title.css", selector: ".fx-title", property: "margin-block-end", from: "--fx-sys-spacing-lg", to: "--fx-sys-spacing-md", before: "var(--fx-sys-spacing-lg, 16px)", after: "var(--fx-sys-spacing-md, 16px)" })], "a reference with a fallback"],
    ["duplicate-token-declaration", { files: { "tokens/tokens-comp.css": twiceDeclared, "sb/tokens/tokens-comp.css": twiceDeclared } }, [fxTokenOp("--fx-comp-seal-shape", "--fx-sys-shape-corner-sm", "--fx-sys-shape-corner-lg")]],
    ["duplicate-target", {}, [container("--fx-sys-color-secondary"), { ...container("--fx-sys-color-highlight"), id: "op-b" }]],
    ["stale-before", {}, [fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-secondary", "--fx-sys-color-highlight")]],
    ["after-value-mismatch", {}, [{ ...container("--fx-sys-color-secondary"), after: { value: "var(--fx-sys-color-highlight)" } }]],
    ["locator-mismatch", {}, [fxDeclOp({ ordinal: 1 })], "ordinal and selector disagree"],
    ["locator-mismatch", {}, [{ ...fxDeclOp(), rule: { ordinal: 0, selector: ".fx-seal", atRules: [{ name: "media", params: "(min-width: 720px)" }], occurrence: 0 } }], "at-rule context disagrees"],
    ["locator-mismatch", {}, [{ ...fxDeclOp(), rule: { ordinal: 0, selector: ".fx-seal", atRules: [], occurrence: 1 } }], "occurrence disagrees"],
    ["mirror-drift", { files: { "sb/tokens/tokens-sys.css": ":root {\n  --fx-sys-color-primary: var(--fx-ref-color-red-60);\n}\n" } }, [container("--fx-sys-color-secondary")]],
    ["checks-unavailable", { config: withCheck("missing") }, [container("--fx-sys-color-secondary")]],
    ["checks-baseline-failing", { files: checkScript("broken", 'console.error("broken project"); process.exit(1);\n'), config: withCheck("broken") }, [container("--fx-sys-color-secondary")]],
    ["check-failed", { files: checkScript("no-secondary", 'import fs from "node:fs";\nif (fs.readFileSync(process.argv[2] + "/tokens/tokens-comp.css", "utf8").includes("--fx-comp-seal-container-color: var(--fx-sys-color-secondary)")) { console.error("secondary is not allowed here"); process.exit(1); }\n'), config: withCheck("no-secondary") }, [container("--fx-sys-color-secondary")]],
  ];
  const seen = new Set();
  for (const [code, options, operations, label] of cases) {
    const { ws, config } = await makeWorkspace({ fixture: "v1", ...options });
    const engine = createEngine({ config, postcss, log: quiet });
    const facts = treeFacts(ws);
    await assert.rejects(engine.apply(batch(operations)), (e) => e.code === code, `${code}${label ? ` (${label})` : ""}`);
    assert.deepEqual(treeFacts(ws), facts, `${code}: content, modification time and inode of every file are unchanged`);
    assert.deepEqual(engine.state().undoStack, [], `${code}: nothing to undo`);
    seen.add(code);
  }
  // read-only: a second engine while the first holds the lock.
  const { ws, config } = await makeWorkspace({ fixture: "v1" });
  createEngine({ config, postcss, log: quiet });
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
  try {
    fs.writeFileSync(path.join(config.stateDir, "lock.json"), JSON.stringify({ pid: child.pid, port: null }));
    const second = createEngine({ config, postcss, log: quiet });
    const facts = treeFacts(ws);
    await assert.rejects(second.apply(batch([container("--fx-sys-color-secondary")])), (e) => e.code === "read-only");
    assert.deepEqual(treeFacts(ws), facts);
    seen.add("read-only");
  } finally {
    child.kill("SIGKILL");
  }
  assert.deepEqual(
    [...seen].sort(),
    ["after-value-mismatch", "check-failed", "checks-baseline-failing", "checks-unavailable", "duplicate-target", "duplicate-token-declaration", "foreign-comp-token", "locator-mismatch", "mirror-drift", "no-op", "not-a-design-token", "read-only", "stale-before", "tier-not-writable", "tier-rule", "type-mismatch", "unsupported-value-shape"],
    "the seventeen codes of the specification table",
  );
});

// ---- undo: reverse apply ------------------------------------------------------

/** Replace one line of a file (1-based), asserting what was there. */
function editLine(file, number, from, to) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  assert.equal(lines[number - 1], from, `${path.basename(file)}:${number}`);
  lines[number - 1] = to;
  fs.writeFileSync(file, lines.join("\n"));
}

test("reverse apply after an unrelated edit: the exact undo is refused, the reverse puts back only what the apply changed", async () => {
  const { ws, config } = await makeWorkspace({ fixture: "v1" });
  const css = path.join(ws, "sb/src/components/seal/Seal.css");
  const truth = path.join(ws, "tokens/tokens-comp.css");
  const mirror = path.join(ws, "sb/tokens/tokens-comp.css");
  const original = { css: fs.readFileSync(css, "utf8"), truth: fs.readFileSync(truth, "utf8") };
  const engine = createEngine({ config, postcss, log: quiet });
  const applied = await engine.apply(
    batch([
      fxTokenOp("--fx-comp-seal-container-color", "--fx-sys-color-primary", "--fx-sys-color-secondary", "fill"),
      fxDeclOp({ id: "radius" }),
      fxDeclOp({ id: "rule", property: "border", refIndex: 1, from: "--fx-comp-seal-rule-color", to: "--fx-sys-color-primary", before: BORDER }),
    ]),
  );
  // A person edits other lines of the same files (keeping source of truth and mirror identical).
  editLine(css, 3, "  display: inline-flex;", "  display: flex;");
  for (const file of [truth, mirror]) editLine(file, 1, "/* component tier — 元件 token */", "/* component tier — edited by hand */");

  const facts = treeFacts(ws);
  await assert.rejects(engine.undo({ applyId: applied.applyId }), (e) => e.code === "undo-conflict" && e.details.canReverse === true && e.details.conflicts.length === 3 && e.details.conflicts.every((c) => c.backup.includes(applied.applyId)));
  assert.deepEqual(treeFacts(ws), facts, "the refused undo wrote nothing");

  const reversed = await engine.reverse({ applyId: applied.applyId });
  assert.equal(reversed.mode, "reverse");
  assert.equal(reversed.undone, applied.applyId);
  assert.deepEqual(reversed.files.map((f) => f.file), ["tokens/tokens-comp.css", "sb/tokens/tokens-comp.css", "sb/src/components/seal/Seal.css"]);
  assert.equal(fs.readFileSync(css, "utf8"), original.css.replace("  display: inline-flex;", "  display: flex;"), "the three references are back, the person's line is kept");
  assert.equal(fs.readFileSync(truth, "utf8"), original.truth.replace("/* component tier — 元件 token */", "/* component tier — edited by hand */"));
  assert.ok(fs.readFileSync(truth).equals(fs.readFileSync(mirror)));
  assert.deepEqual(reversed.expect.tokens, [{ token: "--fx-comp-seal-container-color", value: "var(--fx-sys-color-primary)" }]);

  // The reversed apply left the undo stack, the reverse itself never enters it, and both facts survive a restart.
  assert.deepEqual(engine.state().undoStack, []);
  const tx = engine.journal.transactions();
  assert.equal(tx.get(applied.applyId).undoneBy, reversed.undoId);
  assert.equal(tx.get(reversed.undoId).pending.kind, "reverse");
  assert.equal(tx.get(reversed.undoId).pending.undoes, applied.applyId);
  assert.ok(fs.existsSync(path.join(config.stateDir, "backups", reversed.undoId, "0.bak")), "the reverse was backed up like any apply");
  assert.deepEqual(createEngine({ config, postcss, log: quiet }).state().undoStack, []);
  await assert.rejects(engine.reverse({ applyId: applied.applyId }), (e) => e.code === "nothing-to-undo");
});

test("reverse apply is refused when the target itself changed; skipping still works", async () => {
  const { ws, config } = await makeWorkspace({ fixture: "v1" });
  const css = path.join(ws, "sb/src/components/seal/Seal.css");
  const engine = createEngine({ config, postcss, log: quiet });
  const first = await engine.apply(batch([fxDeclOp({ property: "gap", from: "--fx-sys-spacing-xs", to: "--fx-sys-spacing-sm" })]));
  const second = await engine.apply(batch([fxDeclOp(), fxDeclOp({ id: "rule", property: "border", refIndex: 1, from: "--fx-comp-seal-rule-color", to: "--fx-sys-color-primary", before: BORDER })]));
  // The person re-binds the very declaration the apply wrote.
  editLine(css, 12, "  border-radius: var(--fx-sys-shape-corner-md);", "  border-radius: var(--fx-sys-shape-corner-lg);");
  const facts = treeFacts(ws);
  await assert.rejects(engine.reverse({ applyId: first.applyId }), (e) => e.code === "not-latest" && e.details.latest === second.applyId);
  await assert.rejects(engine.undo({ applyId: second.applyId }), (e) => e.code === "undo-conflict");
  await assert.rejects(
    engine.reverse({ applyId: second.applyId }),
    (e) => e.code === "stale-before" && e.details.property === "border-radius" && e.details.expected === "--fx-sys-shape-corner-md" && e.details.actual === "var(--fx-sys-shape-corner-lg)",
  );
  assert.deepEqual(treeFacts(ws), facts, "all or nothing: the untouched border reference was not reversed either");
  assert.deepEqual(engine.state().undoStack.map((u) => u.applyId), [first.applyId, second.applyId]);
  await engine.skip({ applyId: second.applyId });
  // The entry below was made on text that has changed since (line 12), so it conflicts too — and can be reversed.
  await assert.rejects(engine.undo({ applyId: first.applyId }), (e) => e.code === "undo-conflict");
  await engine.reverse({ applyId: first.applyId });
  assert.ok(fs.readFileSync(css, "utf8").includes("  gap: var(--fx-sys-spacing-xs);"));
  assert.ok(fs.readFileSync(css, "utf8").includes("  border-radius: var(--fx-sys-shape-corner-lg);"), "the person's value is kept");
});

/** Rewrite the journal so its operation records look like the ones template 0.1.0 wrote. */
function downgradeJournal(config) {
  const file = path.join(config.stateDir, "journal.jsonl");
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  for (const record of lines) {
    if (record.type !== "pending" || !record.operations) continue;
    record.operations = record.operations.map((o) => ({ id: o.id, type: o.type, token: o.token, file: o.file, line: o.line, before: o.before, after: o.after, value: o.value }));
  }
  fs.writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
}

test("records written by template 0.1.0 can still be undone exactly; they cannot be reversed", async () => {
  const { ws, config } = await workspace();
  const before = hashes(ws);
  const old = createEngine({ config, postcss, log: quiet });
  const applied = await old.apply(batch([tokenOp(), declOp()]));
  downgradeJournal(config);
  const record = JSON.parse(fs.readFileSync(path.join(config.stateDir, "journal.jsonl"), "utf8").split("\n")[0]);
  assert.deepEqual(Object.keys(record.operations[0]), ["id", "type", "token", "file", "line", "before", "after", "value"], "the 0.1.0 record shape");

  // A v1 dev server starts on that journal.
  const engine = createEngine({ config, postcss, log: quiet });
  assert.deepEqual(engine.state().undoStack.map((u) => u.applyId), [applied.applyId]);
  const facts = treeFacts(ws);
  await assert.rejects(engine.reverse({ applyId: applied.applyId }), (e) => e.code === "reverse-not-applicable");
  assert.deepEqual(treeFacts(ws), facts);
  await engine.undo({ applyId: applied.applyId });
  assert.deepEqual(hashes(ws), before, "exact undo from the 0.1.0 record");

  // With a conflicting edit the panel is told that only skipping is possible.
  const again = await engine.apply(batch([declOp()]));
  downgradeJournal(config);
  const restarted = createEngine({ config, postcss, log: quiet });
  fs.appendFileSync(paths(ws).css, "/* edited by hand */\n");
  await assert.rejects(restarted.undo({ applyId: again.applyId }), (e) => e.code === "undo-conflict" && e.details.canReverse === false);
  await restarted.skip({ applyId: again.applyId });
  assert.deepEqual(restarted.state().undoStack, []);
});

test("the undo stack is the same after a restart, with reversed and skipped entries left out", async () => {
  const { ws, config } = await makeWorkspace({ fixture: "v1" });
  const engine = createEngine({ config, postcss, log: quiet });
  const a = await engine.apply(batch([fxDeclOp({ property: "gap", from: "--fx-sys-spacing-xs", to: "--fx-sys-spacing-sm" })]));
  const b = await engine.apply(batch([fxTokenOp("--fx-comp-title-gap", "--fx-sys-spacing-xs", "--fx-sys-spacing-md")]));
  const c = await engine.apply(batch([fxDeclOp()]));
  await engine.reverse({ applyId: c.applyId });
  const expected = engine.state().undoStack;
  assert.deepEqual(expected.map((u) => u.applyId), [a.applyId, b.applyId]);
  const restarted = createEngine({ config, postcss, log: quiet });
  assert.deepEqual(restarted.state().undoStack, expected);
  // A reverse without any conflict gives the same bytes as an exact undo would.
  await restarted.reverse({ applyId: b.applyId });
  await restarted.undo({ applyId: a.applyId });
  assert.deepEqual(treeHashes(ws), treeHashes((await makeWorkspace({ fixture: "v1" })).ws));
});
