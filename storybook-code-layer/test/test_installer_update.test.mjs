// Installer: update (three-way decisions from the receipt), adoption of an
// installation without a receipt, and uninstall — on throwaway projects.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { buildManifest } from "../scripts/build_template_manifest.mjs";
import { run } from "../scripts/install_code_layer.mjs";
import { knownManifests } from "../scripts/lib/plan.mjs";
import { wireTsconfig } from "../scripts/lib/wire_tsconfig.mjs";
import { ENTRY, MAIN_ESM, MAIN_NO_IMPORT, TSCONFIG, cli, codes, copySkill, makeProject, sha, treeHash } from "./installer_helpers.mjs";

const manifest = buildManifest();
const AT = ".storybook/code-layer";
const hashOf = (text) => sha_(Buffer.from(text));
function sha_(buffer) {
  const file = path.join(fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "cl-hash-")), "x");
  fs.writeFileSync(file, buffer);
  return sha(file);
}
const readReceipt = (installDir) => JSON.parse(fs.readFileSync(path.join(installDir, "INSTALL_RECEIPT.json"), "utf8"));
const writeReceipt = (installDir, receipt) => fs.writeFileSync(path.join(installDir, "INSTALL_RECEIPT.json"), `${JSON.stringify(receipt, null, 2)}\n`);
const errors = (result) => result.issues.filter((issue) => issue.severity === "error");

/**
 * Install the current template, then make the installation look like one of an
 * older template: `outdated` files get other content that the receipt records
 * (C = R ≠ T); `obsolete` files exist, are recorded, and are not in the template.
 */
async function olderInstallation({ outdated = [], obsolete = {}, version = "0.0.9", project: options = {} } = {}) {
  const made = makeProject(options);
  const installed = await run({ projectRoot: made.project, config: made.binding });
  assert.equal(installed.result, "installed");
  const receipt = readReceipt(made.installDir);
  for (const relative of outdated) {
    const text = `// from an older template\n${fs.readFileSync(path.join(made.installDir, relative), "utf8")}`;
    fs.writeFileSync(path.join(made.installDir, relative), text);
    receipt.files[relative] = hashOf(text);
  }
  for (const [relative, text] of Object.entries(obsolete)) {
    fs.mkdirSync(path.dirname(path.join(made.installDir, relative)), { recursive: true });
    fs.writeFileSync(path.join(made.installDir, relative), text);
    receipt.files[relative] = hashOf(text);
  }
  receipt.version = version;
  writeReceipt(made.installDir, receipt);
  return made;
}

// ---- update ----------------------------------------------------------------------------

test("update: every row of the three-way table that is not a conflict; the dry run lists exactly what the real run does", async () => {
  const { ws, project, installDir } = await olderInstallation({ outdated: ["manager/Inspector.tsx"], obsolete: { "legacy/old.ts": "export const old = 1;\n" } });
  fs.rmSync(path.join(installDir, "runtime/overlay.ts")); // missing → install
  const receipt = readReceipt(installDir);
  receipt.files["runtime/freeze.ts"] = `sha256:${"0".repeat(64)}`; // present, equals the template whatever the receipt says → unchanged
  writeReceipt(installDir, receipt);
  fs.writeFileSync(path.join(installDir, "notes.txt"), "mine\n"); // never in any manifest → keep and warn
  const unchangedBefore = fs.statSync(path.join(installDir, "runtime/freeze.ts")).mtimeMs;

  const before = treeHash(ws);
  const dry = await run({ projectRoot: project, mode: "update", dryRun: true });
  assert.deepEqual([dry.ok, dry.result, dry.installed.version], [true, "planned", "0.0.9"]);
  assert.deepEqual(dry.actions.map((a) => [a.action, a.path]), [
    ["update", `${AT}/manager/Inspector.tsx`],
    ["install", `${AT}/runtime/overlay.ts`],
    ["delete", `${AT}/legacy/old.ts`],
    ["write-receipt", `${AT}/INSTALL_RECEIPT.json`],
  ]);
  assert.deepEqual(codes(dry), ["unmanaged-file"]);
  assert.equal(treeHash(ws), before, "the dry run changed no content and no modification time");
  // A plain install must not be mistaken for an update.
  const asInstall = await run({ projectRoot: project });
  assert.deepEqual([asInstall.result, errors(asInstall).map((i) => i.code)], ["refused", ["update-required"]]);
  assert.equal(treeHash(ws), before);

  const real = await run({ projectRoot: project, mode: "update" });
  assert.deepEqual([real.ok, real.result, real.restartRequired], [true, "updated", true]);
  assert.deepEqual(real.actions, dry.actions);
  assert.deepEqual(real.written, dry.actions.map((a) => a.path));
  for (const file of manifest.files) assert.equal(sha(path.join(installDir, file.path)), file.sha256, file.path);
  assert.equal(fs.existsSync(path.join(installDir, "legacy")), false, "the obsolete file and its empty directory are gone");
  assert.equal(fs.readFileSync(path.join(installDir, "notes.txt"), "utf8"), "mine\n");
  assert.equal(fs.statSync(path.join(installDir, "runtime/freeze.ts")).mtimeMs, unchangedBefore, "an identical file is not rewritten");
  const after = readReceipt(installDir);
  assert.deepEqual([after.version, after.files], [manifest.version, Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256]))]);
  assert.deepEqual(after.wiring, { main: { file: ".storybook/main.ts", addedElement: true, addedResolveImport: false }, tsconfig: "added" }, "what the first install recorded about the wiring is kept");
  const health = await run({ projectRoot: project, mode: "check" });
  assert.deepEqual([health.result, codes(health)], ["complete", ["unmanaged-file"]]);
  assert.equal((await run({ projectRoot: project, mode: "update" })).result, "current");
});

test("update: the conflict rows refuse with zero writes; --force-managed overrides only files the receipt knows", async () => {
  // Present, differs from the receipt and from the template.
  {
    const { ws, project, installDir } = await olderInstallation({ outdated: ["manager/Inspector.tsx"] });
    fs.appendFileSync(path.join(installDir, "manager/Inspector.tsx"), "\n// my local change\n");
    const before = treeHash(ws);
    const refused = await run({ projectRoot: project, mode: "update" });
    assert.deepEqual([refused.result, errors(refused).map((i) => [i.code, i.path])], ["refused", [["locally-modified-managed-file", `${AT}/manager/Inspector.tsx`]]]);
    assert.equal(treeHash(ws), before);
    const forced = await run({ projectRoot: project, mode: "update", forceManaged: true });
    assert.equal(forced.result, "updated");
    assert.match(forced.actions.find((a) => a.path === `${AT}/manager/Inspector.tsx`).note, /--force-managed/);
    assert.equal(sha(path.join(installDir, "manager/Inspector.tsx")), manifest.files.find((f) => f.path === "manager/Inspector.tsx").sha256);
  }
  // Present, differs from the template, and the receipt has no entry for it.
  {
    const { ws, project, installDir } = await olderInstallation();
    const receipt = readReceipt(installDir);
    delete receipt.files["shared/labels.ts"];
    writeReceipt(installDir, receipt);
    fs.writeFileSync(path.join(installDir, "shared/labels.ts"), "export const mine = true;\n");
    const before = treeHash(ws);
    for (const forceManaged of [false, true]) {
      const refused = await run({ projectRoot: project, mode: "update", forceManaged });
      assert.deepEqual([refused.result, errors(refused).map((i) => [i.code, i.path])], ["refused", [["managed-target-collision", `${AT}/shared/labels.ts`]]], `force ${forceManaged}`);
      assert.equal(treeHash(ws), before);
    }
  }
  // No longer in the template, and changed since it was installed.
  {
    const { ws, project, installDir } = await olderInstallation({ obsolete: { "legacy/old.ts": "export const old = 1;\n" } });
    fs.appendFileSync(path.join(installDir, "legacy/old.ts"), "// kept for my own use\n");
    const before = treeHash(ws);
    const refused = await run({ projectRoot: project, mode: "update" });
    assert.deepEqual([refused.result, errors(refused).map((i) => [i.code, i.path])], ["refused", [["locally-modified-managed-file", `${AT}/legacy/old.ts`]]]);
    assert.equal(treeHash(ws), before);
    assert.equal((await run({ projectRoot: project, mode: "update", forceManaged: true })).result, "updated");
    assert.equal(fs.existsSync(path.join(installDir, "legacy/old.ts")), false);
  }
});

test("update: one locally modified file among forty outdated ones blocks all forty-one", async () => {
  const forty = manifest.files.map((f) => f.path).filter((p) => p !== "preset.js").slice(0, 41);
  const { ws, project, installDir } = await olderInstallation({ outdated: forty });
  fs.appendFileSync(path.join(installDir, forty[20]), "\n// my local change\n");
  const before = treeHash(ws);
  const dry = await run({ projectRoot: project, mode: "update", dryRun: true });
  const real = await run({ projectRoot: project, mode: "update" });
  for (const result of [dry, real]) {
    assert.deepEqual([result.ok, result.result, result.written], [false, "refused", []]);
    assert.deepEqual(errors(result).map((i) => [i.code, i.path]), [["locally-modified-managed-file", `${AT}/${forty[20]}`]]);
  }
  assert.equal(treeHash(ws), before, "none of the forty-one files changed");
});

test("update: an installation without a receipt whose files equal a released version is adopted, updated and given a receipt", () => {
  // The released versions this copy of the skill knows.
  const known = knownManifests();
  assert.ok(known.some((v) => v.version === "0.1.0" && Object.keys(v.files).length > 40 && /^sha256:[0-9a-f]{64}$/.test(v.files["preset.js"])), "0.1.0 is recorded");
  // A recorded release of the current version must be the template as it is (re-record it when the template changes).
  const current = known.find((v) => v.version === manifest.version);
  if (current) assert.deepEqual(current.files, Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256])), `KNOWN_MANIFESTS.json has ${manifest.version} with other hashes: run build_template_manifest.mjs --record-release`);

  // A copy of the skill that also knows a made-up release, so the test can produce its files.
  const skill = copySkill();
  const old = { "preset.js": "// preset of 0.0.5\n", "runtime/index.ts": "// runtime of 0.0.5\n", "gone/removed.ts": "// only in 0.0.5\n" };
  const knownFile = path.join(skill.root, "template/KNOWN_MANIFESTS.json");
  const knownJson = JSON.parse(fs.readFileSync(knownFile, "utf8"));
  knownJson.versions.push({ version: "0.0.5", files: Object.fromEntries(Object.entries(old).map(([p, text]) => [p, hashOf(text)])) });
  fs.writeFileSync(knownFile, `${JSON.stringify(knownJson, null, 2)}\n`);

  // What a development sync leaves behind: the files, the binding, hand-made wiring, no receipt.
  const { ws, project, binding, installDir } = makeProject({ main: MAIN_ESM.replace("    inspector,\n", `    inspector,\n    ${ENTRY},\n`), tsconfig: wireTsconfig(TSCONFIG).source });
  for (const [relative, text] of Object.entries(old)) {
    fs.mkdirSync(path.dirname(path.join(installDir, relative)), { recursive: true });
    fs.writeFileSync(path.join(installDir, relative), text);
  }
  fs.copyFileSync(binding, path.join(installDir, "code-layer.config.json"));
  const before = treeHash(ws);

  const check = cli(["--project-root", project, "--check", "--json"], { installer: skill.installer });
  assert.equal(check.json.result, "incomplete");
  assert.ok(codes(check.json).includes("receipt-missing"));
  const dry = cli(["--project-root", project, "--update", "--dry-run", "--json"], { installer: skill.installer });
  assert.deepEqual([dry.status, dry.json.result, dry.json.installed], [0, "planned", { version: "0.0.5", receiptSchema: null }]);
  assert.ok(codes(dry.json).includes("adopted-without-receipt"));
  assert.equal(treeHash(ws), before);
  const count = (json, action) => json.actions.filter((a) => a.action === action).length;
  assert.deepEqual([count(dry.json, "update"), count(dry.json, "delete"), count(dry.json, "install"), count(dry.json, "write-receipt")], [2, 1, manifest.files.length - 2, 1]);
  assert.ok(!dry.json.actions.some((a) => a.action.startsWith("wire-")), "wiring that is already there is left alone");

  const real = cli(["--project-root", project, "--update", "--json"], { installer: skill.installer });
  assert.deepEqual([real.status, real.json.result, real.json.restartRequired], [0, "updated", true]);
  assert.deepEqual(real.json.actions, dry.json.actions);
  for (const file of manifest.files) assert.equal(sha(path.join(installDir, file.path)), file.sha256, file.path);
  assert.equal(fs.existsSync(path.join(installDir, "gone")), false);
  const receipt = readReceipt(installDir);
  assert.deepEqual([receipt.schemaVersion, receipt.version], [2, manifest.version]);
  // The wiring was not made by the installer: the receipt says so, and uninstall will leave the tsconfig entry.
  assert.deepEqual(receipt.wiring, { main: { file: ".storybook/main.ts", addedElement: false, addedResolveImport: false }, tsconfig: "present" });
  assert.equal(cli(["--project-root", project, "--check", "--json"], { installer: skill.installer }).json.result, "complete");
  assert.match(cli(["--project-root", project, "--update"], { installer: skill.installer }).stdout, /result: current/);

  // Files that match no released version and have no receipt are nobody's: nothing is overwritten.
  const stray = makeProject();
  fs.mkdirSync(stray.installDir, { recursive: true });
  fs.writeFileSync(path.join(stray.installDir, "preset.js"), "// something else\n");
  fs.copyFileSync(stray.binding, path.join(stray.installDir, "code-layer.config.json"));
  const strayBefore = treeHash(stray.ws);
  const refused = cli(["--project-root", stray.project, "--update", "--json"], { installer: skill.installer });
  assert.deepEqual([refused.status, refused.json.result], [1, "refused"]);
  assert.deepEqual(errors(refused.json).map((i) => i.code).sort(), ["managed-target-collision", "receipt-missing"]);
  assert.equal(treeHash(stray.ws), strayBefore);
});

test("update: the binding is validated against the new template and never written; a newer installation is not downgraded", async () => {
  {
    const { ws, project, installDir } = await olderInstallation({ outdated: ["manager/Inspector.tsx"] });
    const bindingFile = path.join(installDir, "code-layer.config.json");
    fs.writeFileSync(bindingFile, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(bindingFile, "utf8")), retiredKey: true }, null, 2)}\n`);
    const before = treeHash(ws);
    const refused = await run({ projectRoot: project, mode: "update" });
    assert.deepEqual([refused.result, errors(refused).map((i) => i.code)], ["refused", ["binding-invalid"]]);
    assert.match(errors(refused)[0].message, /retiredKey/);
    assert.equal(treeHash(ws), before);
  }
  {
    const { ws, project, installDir } = await olderInstallation({ outdated: ["manager/Inspector.tsx"] });
    const bindingBefore = fs.readFileSync(path.join(installDir, "code-layer.config.json"));
    assert.equal((await run({ projectRoot: project, mode: "update" })).result, "updated");
    assert.ok(fs.readFileSync(path.join(installDir, "code-layer.config.json")).equals(bindingBefore), "the binding is the project's");
    const receipt = readReceipt(installDir);
    receipt.version = "99.0.0";
    writeReceipt(installDir, receipt);
    const before = treeHash(ws);
    for (const mode of ["update", "install"]) {
      const refused = await run({ projectRoot: project, mode });
      assert.deepEqual([refused.result, errors(refused).map((i) => i.code)], ["refused", ["newer-installation"]], mode);
    }
    assert.equal(treeHash(ws), before);
  }
});

test("update and uninstall refuse while the write lock is held or the journal has an unfinished write; a stale lock does not block", async () => {
  const { ws, project, stateDir } = await olderInstallation({ outdated: ["manager/Inspector.tsx"] });
  fs.mkdirSync(stateDir, { recursive: true });
  // A live owner: this test's parent process.
  fs.writeFileSync(path.join(stateDir, "lock.json"), JSON.stringify({ pid: process.ppid, port: 6006 }));
  let before = treeHash(ws);
  for (const mode of ["update", "uninstall"]) {
    for (const dryRun of [true, false]) {
      const refused = await run({ projectRoot: project, mode, dryRun });
      assert.deepEqual([refused.result, errors(refused).map((i) => i.code)], ["refused", ["write-lock-held"]], `${mode} dryRun=${dryRun}`);
    }
  }
  assert.equal(treeHash(ws), before);
  // The owner is gone: the lock is stale.
  const finished = spawnSync(process.execPath, ["-e", "0"]);
  fs.writeFileSync(path.join(stateDir, "lock.json"), JSON.stringify({ pid: finished.pid, port: 6006 }));
  assert.equal((await run({ projectRoot: project, mode: "update", dryRun: true })).result, "planned");
  // A write that never finished.
  fs.rmSync(path.join(stateDir, "lock.json"));
  fs.writeFileSync(path.join(stateDir, "journal.jsonl"), `${JSON.stringify({ type: "pending", applyId: "20260101-000000-apply-aaaaaa", kind: "apply", files: [] })}\n`);
  before = treeHash(ws);
  for (const mode of ["update", "uninstall"]) {
    const refused = await run({ projectRoot: project, mode });
    assert.deepEqual([refused.result, errors(refused).map((i) => i.code)], ["refused", ["journal-needs-recovery"]], mode);
  }
  assert.equal(treeHash(ws), before);
  // A finished journal does not block.
  fs.appendFileSync(path.join(stateDir, "journal.jsonl"), `${JSON.stringify({ type: "committed", applyId: "20260101-000000-apply-aaaaaa" })}\n`);
  assert.equal((await run({ projectRoot: project, mode: "update" })).result, "updated");
});

test("update: a failure midway puts every file back, the receipt included", async () => {
  const { ws, project, installDir } = await olderInstallation({ outdated: manifest.files.map((f) => f.path).slice(0, 12), obsolete: { "legacy/old.ts": "export const old = 1;\n" } });
  fs.rmSync(path.join(installDir, "runtime/overlay.ts"));
  const total = (await run({ projectRoot: project, mode: "update", dryRun: true })).actions.length;
  const before = treeHash(ws);
  for (const failAfter of [1, Math.floor(total / 2), total - 1]) {
    const result = await run({ projectRoot: project, mode: "update", failAfter });
    assert.deepEqual([result.result, errors(result).map((i) => i.code)], ["failed", ["write-failed"]], `failAfter ${failAfter}`);
    assert.equal(treeHash(ws), before, `failAfter ${failAfter}`);
  }
  assert.equal(readReceipt(installDir).version, "0.0.9");
});

// ---- uninstall -------------------------------------------------------------------------

test("uninstall: the main config and tsconfig are byte-identical to before the install; the binding and the state directory stay", async () => {
  const { ws, project, binding, installDir, stateDir } = makeProject({ main: MAIN_NO_IMPORT });
  fs.mkdirSync(path.join(stateDir, "backups"), { recursive: true });
  fs.writeFileSync(path.join(stateDir, "journal.jsonl"), "");
  fs.writeFileSync(path.join(stateDir, "backups/keep.bak"), "history\n");
  assert.equal((await run({ projectRoot: project, config: binding })).result, "installed");
  assert.notEqual(fs.readFileSync(path.join(project, ".storybook/main.ts"), "utf8"), MAIN_NO_IMPORT);
  fs.writeFileSync(path.join(installDir, "notes.txt"), "mine\n");
  const stateBefore = treeHash(stateDir);
  const bindingBefore = fs.readFileSync(path.join(installDir, "code-layer.config.json"));

  const before = treeHash(ws);
  const dry = await run({ projectRoot: project, mode: "uninstall", dryRun: true });
  assert.deepEqual([dry.ok, dry.result], [true, "planned"]);
  assert.equal(treeHash(ws), before);
  const kinds = dry.actions.map((a) => a.action);
  assert.deepEqual([kinds[0], kinds[1], kinds.at(-1)], ["unwire-main", "unwire-tsconfig", "delete-receipt"], "wiring first, the receipt last");
  assert.ok(kinds.slice(2, -1).every((k) => k === "delete") && kinds.length === manifest.files.length + 3);

  const real = await run({ projectRoot: project, mode: "uninstall" });
  assert.deepEqual([real.ok, real.result, real.restartRequired], [true, "uninstalled", true]);
  assert.deepEqual(real.actions, dry.actions);
  assert.equal(fs.readFileSync(path.join(project, ".storybook/main.ts"), "utf8"), MAIN_NO_IMPORT, "the preset and the import the installer added are gone");
  assert.equal(fs.readFileSync(path.join(project, "tsconfig.json"), "utf8"), TSCONFIG);
  assert.deepEqual(fs.readdirSync(installDir).sort(), ["code-layer.config.json", "notes.txt"], "only the binding and the file that was never the installer's are left");
  assert.ok(fs.readFileSync(path.join(installDir, "code-layer.config.json")).equals(bindingBefore));
  assert.deepEqual(codes(real), ["unmanaged-file"]);
  assert.equal(treeHash(stateDir), stateBefore, "journal and backups are untouched");
  // Nothing to uninstall any more.
  const again = await run({ projectRoot: project, mode: "uninstall" });
  assert.deepEqual([again.result, errors(again).map((i) => i.code)], ["refused", ["receipt-missing"]]);
  // And the project can be installed again.
  assert.equal((await run({ projectRoot: project })).result, "installed");
});

test("uninstall: wiring the installer did not add stays — a pre-existing exclude entry, an import the file still uses", async () => {
  // tsconfig excluded the directory before; main already imported resolve for its own use.
  {
    const tsconfig = wireTsconfig(TSCONFIG).source;
    const { project, binding } = makeProject({ tsconfig });
    await run({ projectRoot: project, config: binding });
    const result = await run({ projectRoot: project, mode: "uninstall" });
    assert.equal(result.result, "uninstalled");
    assert.ok(!result.actions.some((a) => a.action === "unwire-tsconfig"));
    assert.equal(fs.readFileSync(path.join(project, "tsconfig.json"), "utf8"), tsconfig, "the entry that was there before is still there");
    assert.equal(fs.readFileSync(path.join(project, ".storybook/main.ts"), "utf8"), MAIN_ESM, "the project's own import is kept");
  }
  // The installer added the import, and the file has started using resolve for something else since.
  {
    const { project, binding } = makeProject({ main: MAIN_NO_IMPORT });
    await run({ projectRoot: project, config: binding });
    const mainFile = path.join(project, ".storybook/main.ts");
    const edited = fs.readFileSync(mainFile, "utf8").replace("const config", 'const staticDir = resolve(process.cwd(), "public");\n\nconst config');
    fs.writeFileSync(mainFile, edited);
    assert.equal((await run({ projectRoot: project, mode: "uninstall" })).result, "uninstalled");
    const after = fs.readFileSync(mainFile, "utf8");
    assert.ok(after.startsWith('import { resolve } from "node:path";\n') && after.includes("const staticDir = resolve(") && !after.includes("code-layer/preset.js"), after);
  }
});

test("uninstall: a modified managed file is a conflict with zero writes; --force-managed removes it; a failure puts everything back", async () => {
  const { ws, project, binding, installDir } = makeProject();
  await run({ projectRoot: project, config: binding });
  fs.appendFileSync(path.join(installDir, "manager/Inspector.tsx"), "\n// my local change\n");
  const before = treeHash(ws);
  const refused = await run({ projectRoot: project, mode: "uninstall" });
  assert.deepEqual([refused.result, errors(refused).map((i) => [i.code, i.path])], ["refused", [["locally-modified-managed-file", `${AT}/manager/Inspector.tsx`]]]);
  assert.equal(treeHash(ws), before);
  const total = (await run({ projectRoot: project, mode: "uninstall", dryRun: true, forceManaged: true })).actions.length;
  for (const failAfter of [1, 2, 30, total - 1]) {
    const failed = await run({ projectRoot: project, mode: "uninstall", forceManaged: true, failAfter });
    assert.equal(failed.result, "failed", `failAfter ${failAfter}`);
    assert.equal(treeHash(ws), before, `failAfter ${failAfter}: main, tsconfig, every file and the receipt are back`);
  }
  const forced = await run({ projectRoot: project, mode: "uninstall", forceManaged: true });
  assert.equal(forced.result, "uninstalled");
  assert.deepEqual(fs.readdirSync(installDir), ["code-layer.config.json"]);
  assert.equal(fs.readFileSync(path.join(project, ".storybook/main.ts"), "utf8"), MAIN_ESM);
});

test("uninstall with a 0.1.0 receipt (format 1) removes only the preset element and says what it leaves", async () => {
  const { project, binding, installDir } = makeProject({ main: MAIN_NO_IMPORT });
  await run({ projectRoot: project, config: binding });
  const v2 = readReceipt(installDir);
  // What the 0.1.0 installer wrote: no record of who added the import or the exclude entry.
  writeReceipt(installDir, { schemaVersion: 1, name: v2.name, version: "0.1.0", manifestSha256: v2.manifestSha256, files: v2.files, config: { file: "code-layer.config.json", sha256: null }, wiring: { main: { file: ".storybook/main.ts", wired: true }, tsconfig: "excluded" }, installedAt: v2.installedAt });
  const wiredTsconfig = fs.readFileSync(path.join(project, "tsconfig.json"), "utf8");
  const result = await run({ projectRoot: project, mode: "uninstall" });
  assert.deepEqual([result.result, result.installed], ["uninstalled", { version: "0.1.0", receiptSchema: 1 }]);
  assert.deepEqual(codes(result), ["receipt-v1"]);
  assert.match(result.issues.find((i) => i.code === "receipt-v1").message, /only the preset element is removed/);
  const main = fs.readFileSync(path.join(project, ".storybook/main.ts"), "utf8");
  assert.equal(main, `import { resolve } from "node:path";\n${MAIN_NO_IMPORT}`, "the preset is gone; the import is left for the person to review");
  assert.equal(fs.readFileSync(path.join(project, "tsconfig.json"), "utf8"), wiredTsconfig, "the exclude entry is left");
  assert.deepEqual(fs.readdirSync(installDir), ["code-layer.config.json"]);
});

test("update from 1.3.1 to 1.4.0: changed files are updated, new files installed, the binding untouched; a file the person edited blocks it", async () => {
  // A 1.3.1 installation as this release finds it: the files 1.4.0 changed hold older content the receipt records,
  // and the files 1.4.0 added do not exist yet.
  const CHANGED = ["server/operations.mjs", "server/patcher.mjs", "server/transaction.mjs", "runtime/tracer.ts", "manager/components/Field.tsx"];
  const ADDED = ["shared/literals.mjs", "shared/literals.d.mts", "shared/property-table.mjs", "shared/property-table.d.mts"];
  const { ws, project, installDir } = await olderInstallation({ outdated: CHANGED, version: "1.3.1" });
  const receipt = readReceipt(installDir);
  for (const relative of ADDED) {
    fs.rmSync(path.join(installDir, relative));
    delete receipt.files[relative];
  }
  writeReceipt(installDir, receipt);
  const bindingFile = path.join(installDir, "code-layer.config.json");
  const binding = fs.readFileSync(bindingFile);

  const real = await run({ projectRoot: project, mode: "update" });
  assert.deepEqual([real.ok, real.result, real.installed.version], [true, "updated", "1.3.1"]);
  assert.deepEqual(
    real.actions.filter((a) => a.action !== "write-receipt").map((a) => [a.action, a.path.slice(AT.length + 1)]).sort(),
    [...CHANGED.map((p) => ["update", p]), ...ADDED.map((p) => ["install", p])].sort(),
  );
  for (const file of manifest.files) assert.equal(sha(path.join(installDir, file.path)), file.sha256, file.path);
  assert.ok(fs.readFileSync(bindingFile).equals(binding), "the binding is byte-identical");
  assert.equal(readReceipt(installDir).version, manifest.version);
  assert.equal(manifest.version, "1.4.0");

  // A second 1.3.1 installation in which the person edited a managed file: nothing is written, the edit stays.
  const other = await olderInstallation({ outdated: CHANGED, version: "1.3.1" });
  const edited = path.join(other.installDir, "manager/Inspector.tsx");
  fs.writeFileSync(edited, `// my change\n${fs.readFileSync(edited, "utf8")}`);
  const before = treeHash(other.ws);
  const refused = await run({ projectRoot: other.project, mode: "update" });
  assert.deepEqual([refused.ok, refused.result], [false, "refused"]);
  assert.ok(errors(refused).some((issue) => issue.code === "locally-modified-managed-file"), JSON.stringify(errors(refused)));
  assert.equal(treeHash(other.ws), before, "zero writes");
  assert.match(fs.readFileSync(edited, "utf8"), /^\/\/ my change/);
  assert.equal(treeHash(ws) !== "", true);
});
