// The command line works without Storybook, and never races a dev server.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ADDON_ROOT, addon, loadPostcss, makeWorkspace, testProject } from "./helpers.mjs";

const { createEngine } = await addon("server/transaction.mjs");
const postcss = await loadPostcss();
const quiet = { info() {}, warn() {}, error() {} };
const CLI = path.join(ADDON_ROOT, "server", "cli.mjs");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** A fixture whose project can resolve Vite's PostCSS, as a real project does. */
async function cliWorkspace(options = {}) {
  const made = await makeWorkspace(options);
  fs.symlinkSync(path.join(testProject(), "node_modules"), path.join(made.projectRoot, "node_modules"), "dir");
  return made;
}

function cli(projectRoot, ...args) {
  const [command, ...rest] = args;
  const run = spawnSync(process.execPath, [CLI, command, "--project", projectRoot, ...rest], { encoding: "utf8" });
  let json = null;
  try {
    json = JSON.parse(run.stdout);
  } catch {
    json = null;
  }
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, json };
}

function declBatch() {
  return {
    schemaVersion: 1,
    batchId: "cli-1",
    indexRevision: "sha256:test",
    operations: [
      {
        id: "op-1",
        type: "rebind-declaration",
        file: "src/components/seal/Seal.css",
        rule: { ordinal: 0, selector: ".t-seal", atRules: [], occurrence: 0 },
        declaration: { property: "border-radius" },
        replacements: [{ refIndex: 0, fromToken: "--t-sys-shape-corner-sm", toToken: "--t-sys-shape-corner-md" }],
        fromToken: "--t-sys-shape-corner-sm",
        toToken: "--t-sys-shape-corner-md",
        before: { value: "var(--t-sys-shape-corner-sm)" },
        after: { value: "var(--t-sys-shape-corner-md)" },
      },
    ],
  };
}

test("cli index and status print the summary and the state without Storybook", async () => {
  const { projectRoot } = await cliWorkspace();
  const index = cli(projectRoot, "index");
  assert.equal(index.status, 0, index.stderr);
  assert.deepEqual(index.json.tokens.byTier, { ref: 5, sys: 5, comp: 2 });
  assert.equal(index.json.css.rules, 2);
  const status = cli(projectRoot, "status");
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(status.json.undoStack, []);
  assert.deepEqual(status.json.unfinished, []);
  assert.ok(status.json.mirrors.every((m) => m.inSync));
  assert.equal(cli(projectRoot, "nonsense").status, 2);
});

test("cli sync-mirror: a dry run lists the file and writes nothing; --apply copies the source of truth", async () => {
  const { ws, projectRoot } = await cliWorkspace({
    files: { "sb/tokens/tokens-sys.css": ":root {\n  --t-sys-color-primary: var(--t-ref-color-red-60);\n}\n" },
  });
  const mirror = path.join(ws, "sb/tokens/tokens-sys.css");
  const before = sha(mirror);
  assert.equal(cli(projectRoot, "sync-mirror").status, 2, "needs --dry-run or --apply");
  const dry = cli(projectRoot, "sync-mirror", "--dry-run");
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(dry.json.changed, ["sb/tokens/tokens-sys.css"]);
  assert.equal(sha(mirror), before);
  const applied = cli(projectRoot, "sync-mirror", "--apply");
  assert.equal(applied.status, 0, applied.stderr);
  assert.ok(fs.readFileSync(mirror).equals(fs.readFileSync(path.join(ws, "tokens/tokens-sys.css"))));
});

test("cli undo restores the latest apply; while a dev server holds the lock it writes nothing and says so", async () => {
  const { ws, projectRoot, config } = await cliWorkspace();
  const css = path.join(ws, "sb/src/components/seal/Seal.css");
  const original = sha(css);
  // This process plays the dev server: it holds the lock for as long as it lives.
  const engine = createEngine({ config, postcss, log: quiet });
  const applied = await engine.apply(declBatch());
  const afterApply = sha(css);
  assert.notEqual(afterApply, original);

  const raced = cli(projectRoot, "undo", "--apply-id", applied.applyId);
  assert.notEqual(raced.status, 0);
  assert.match(raced.stderr, /read-only/);
  assert.match(raced.stderr, new RegExp(`pid ${process.pid}`));
  assert.match(raced.stderr, /lock\.json/);
  assert.equal(sha(css), afterApply, "the command wrote nothing");

  // The dev server stops: the lock is released and the command line may write.
  fs.rmSync(path.join(config.stateDir, "lock.json"));
  const undone = cli(projectRoot, "undo", "--apply-id", applied.applyId);
  assert.equal(undone.status, 0, undone.stderr);
  assert.equal(undone.json.undone, applied.applyId);
  assert.equal(sha(css), original);
  const recovered = cli(projectRoot, "recover");
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.deepEqual(recovered.json.undoStack, []);
});
