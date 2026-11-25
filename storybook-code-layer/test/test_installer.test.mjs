// Installer: wiring functions (pure), the command-line contract, prerequisites,
// install and check — on throwaway projects in the OS temp directory.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { buildManifest } from "../scripts/build_template_manifest.mjs";
import { formatText, run } from "../scripts/install_code_layer.mjs";
import { wireMain } from "../scripts/lib/wire_main.mjs";
import { parseJsonc, wireTsconfig } from "../scripts/lib/wire_tsconfig.mjs";
import { ENTRY, MAIN_ESM, MAIN_NO_IMPORT, TSCONFIG, cli, codes, copySkill, makeProject, sha, treeHash } from "./installer_helpers.mjs";
import { fixtureConfig } from "./helpers.mjs";

// ---- wiring (pure) ---------------------------------------------------------------

test("wireMain appends the preset as the last addon, keeping the trailing comma style", () => {
  const out = wireMain(MAIN_ESM, { fileName: ".storybook/main.ts" });
  assert.equal(out.status, "added");
  assert.equal(out.source, MAIN_ESM.replace("    inspector,\n", `    inspector,\n    ${ENTRY},\n`));
  assert.equal(out.addedResolveImport, false);
  assert.equal(wireMain(out.source, { fileName: ".storybook/main.ts" }).status, "present", "idempotent");

  const noTrailing = MAIN_ESM.replace("    inspector,\n", "    inspector\n");
  assert.equal(wireMain(noTrailing, { fileName: "main.ts" }).source, noTrailing.replace("    inspector\n", `    inspector,\n    ${ENTRY}\n`));

  const oneLine = MAIN_ESM.replace(/addons: \[[\s\S]*?\],/, 'addons: ["@storybook/addon-docs"],');
  assert.match(wireMain(oneLine, { fileName: "main.ts" }).source, /addons: \["@storybook\/addon-docs", resolve\(process\.cwd\(\), "\.storybook\/code-layer\/preset\.js"\)\],/);
});

test("wireMain adds the node:path import when missing, and uses require() in CommonJS", () => {
  const out = wireMain(MAIN_NO_IMPORT, { fileName: "main.ts" });
  assert.ok(out.source.startsWith('import { resolve } from "node:path";\nimport type'));
  assert.ok(out.source.includes(`    "@storybook/addon-docs",\n    ${ENTRY},\n`));
  assert.equal(out.addedResolveImport, true);

  const cjs = 'module.exports = {\n  addons: [\n    "@storybook/addon-docs",\n  ],\n  framework: "@storybook/react-vite",\n};\n';
  const wiredCjs = wireMain(cjs, { fileName: "main.cjs" });
  assert.ok(wiredCjs.source.includes('    require("node:path").resolve(process.cwd(), ".storybook/code-layer/preset.js"),\n'));
  assert.equal(wiredCjs.addedResolveImport, false);
});

test("wireMain refuses what it cannot wire safely", () => {
  assert.throws(() => wireMain(MAIN_ESM.replace("addons: [", "plugins: ["), { fileName: "main.ts" }), /has no addons array/);
  assert.throws(() => wireMain(`import { defineMain } from "@storybook/react-vite/node";\nexport default defineMain({ addons: [] });\n`, { fileName: "main.ts" }), /CSF factories/);
  const twice = MAIN_ESM.replace("    inspector,\n", `    inspector,\n    ${ENTRY},\n    ${ENTRY},\n`);
  assert.throws(() => wireMain(twice, { fileName: "main.ts" }), /lists the Code Layer preset 2 times/);
  const outside = MAIN_ESM.replace("export default config;", '// see .storybook/code-layer/preset.js\nexport default config;');
  assert.throws(() => wireMain(outside, { fileName: "main.ts" }), /not as an element of the addons array/);
  const commented = MAIN_ESM.replace("  addons: [", "  // addons: [ old ]\n  addons: [");
  assert.equal(wireMain(commented, { fileName: "main.ts" }).status, "added", "commented-out addons are ignored");
});

test("wireTsconfig adds the exclude entry only when the include list covers the addon", () => {
  const out = wireTsconfig(TSCONFIG);
  assert.equal(out.status, "added");
  assert.equal(out.source, TSCONFIG.replace('    ".storybook/vendor/**"\n', '    ".storybook/vendor/**",\n    ".storybook/code-layer/**"\n'));
  assert.equal(wireTsconfig(out.source).status, "present");
  assert.equal(wireTsconfig(TSCONFIG.replace('    ".storybook/**/*.ts",\n', "")).status, "not-needed");
  assert.equal(wireTsconfig('{ "include": ["src"] }').status, "not-needed");
  assert.equal(wireTsconfig('{ "compilerOptions": {} }').status, "manual", "default include covers it, no exclude list: manual");
  const jsonc = '{\n  // comment with "exclude": [\n  "include": [".storybook/**/*"], /* trailing */\n  "exclude": ["node_modules",],\n}\n';
  assert.deepEqual(parseJsonc(jsonc).exclude, ["node_modules"]);
  const wired = wireTsconfig(jsonc);
  assert.equal(wired.status, "added");
  assert.deepEqual(parseJsonc(wired.source).exclude, ["node_modules", ".storybook/code-layer/**"]);
});

// ---- command-line contract ---------------------------------------------------------

test("cli: unknown flags and incompatible combinations exit with a usage error and write nothing", () => {
  const { ws, project, binding } = makeProject();
  const before = treeHash(ws);
  const cases = [
    [["--projct-root", project], "--projct-root"],
    [["--project-root", project, "--chek"], "--chek"],
    [["--project-root", project, "--check", "--dry-run"], "--dry-run"],
    [["--project-root", project, "--check", "--update"], "--update"],
    [["--project-root", project, "--force-managed"], "--force-managed"],
    [["--project-root", project, "--check", "--force-managed"], "--force-managed"],
    [["--project-root", project, "--update", "--config", binding], "--config"],
    [["--project-root"], "--project-root"],
    [["--config", binding], "--project-root"],
    [["--project-root", project, "--project", project], "--project"],
  ];
  for (const [args, flag] of cases) {
    const result = cli([...args, "--json"]);
    assert.equal(result.status, 2, `${args.join(" ")}: ${result.stdout}`);
    assert.deepEqual([result.json.ok, result.json.result, result.json.issues[0].code, result.json.issues[0].flag], [false, "usage", "usage", flag], args.join(" "));
    const text = cli(args);
    assert.equal(text.status, 2);
    assert.ok(text.stdout.includes("result: usage") && text.stdout.includes(flag) && text.stdout.includes("usage: install_code_layer.mjs"), text.stdout);
  }
  assert.equal(treeHash(ws), before, "nothing was written");
  // --project is an alias of --project-root.
  assert.equal(cli(["--project", project, "--config", binding, "--dry-run", "--json"]).json.result, "planned");
  assert.equal(cli(["--help"]).status, 0);
});

test("cli: --json and the text output carry the same result, actions and issue codes; the exit status is zero only on success", async () => {
  const { ws, project, binding } = makeProject();
  const before = treeHash(ws);
  // A plan.
  const planned = cli(["--project-root", project, "--config", binding, "--dry-run", "--json"]);
  const plannedText = cli(["--project-root", project, "--config", binding, "--dry-run"]);
  assert.deepEqual([planned.status, plannedText.status, planned.json.ok, planned.json.result], [0, 0, true, "planned"]);
  assert.ok(plannedText.stdout.includes("result: planned"));
  for (const action of planned.json.actions) assert.ok(plannedText.stdout.includes(`${action.action.padEnd(15)} ${action.path}`), `${action.action} ${action.path}`);
  assert.equal(plannedText.stdout.split("\n").filter((l) => /^  (install|write-binding|wire-main|wire-tsconfig|write-receipt)\b/.test(l)).length, planned.json.actions.length);
  // A refusal.
  const bad = makeProject({ config: fixtureConfig({ stateDir: ".code-layer" }) });
  const refused = cli(["--project-root", bad.project, "--config", bad.binding, "--json"]);
  const refusedText = cli(["--project-root", bad.project, "--config", bad.binding]);
  assert.deepEqual([refused.status, refusedText.status, refused.json.ok, refused.json.result], [1, 1, false, "refused"]);
  assert.ok(codes(refused.json).includes("state-dir-inside-project"));
  for (const issue of refused.json.issues) assert.ok(refusedText.stdout.includes(`${issue.code}: `), issue.code);
  assert.ok(refusedText.stdout.includes("result: refused"));
  // The module function and the command line agree.
  const direct = await run({ projectRoot: project, config: binding, dryRun: true });
  assert.deepEqual(direct.actions, planned.json.actions);
  assert.equal(formatText(direct), plannedText.stdout);
  assert.equal(treeHash(ws), before);
});

test("a stale or missing manifest stops every mode, naming the manifest, with zero writes", () => {
  const skill = copySkill();
  const { ws, project, binding } = makeProject();
  // An installation made while the manifest was current.
  assert.equal(cli(["--project-root", project, "--config", binding, "--json"], { installer: skill.installer }).json.result, "installed");
  fs.appendFileSync(path.join(skill.root, "template/code-layer/runtime/overlay.ts"), "\n// edited without rebuilding the manifest\n");
  const before = treeHash(ws);
  for (const mode of [[], ["--check"], ["--update"], ["--uninstall"], ["--update", "--dry-run"]]) {
    const result = cli(["--project-root", project, ...mode, "--json"], { installer: skill.installer });
    assert.equal(result.status, 1, `${mode.join(" ") || "install"}: ${result.stdout}`);
    assert.deepEqual([result.json.ok, codes(result.json)], [false, ["manifest-stale"]]);
    assert.ok(result.json.issues[0].message.includes("TEMPLATE_MANIFEST.json"));
  }
  fs.rmSync(path.join(skill.root, "template/TEMPLATE_MANIFEST.json"));
  assert.deepEqual(codes(cli(["--project-root", project, "--check", "--json"], { installer: skill.installer }).json), ["manifest-stale"]);
  assert.equal(treeHash(ws), before);
});

test("the template manifest is deterministic: hash, size and version of every template file", () => {
  const a = buildManifest();
  const b = buildManifest();
  assert.deepEqual(a, b);
  assert.ok(a.files.length > 60 && a.files.every((f) => /^sha256:[0-9a-f]{64}$/.test(f.sha256) && Number.isInteger(f.bytes)));
  assert.match(a.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual([...a.files.map((f) => f.path)].sort(), a.files.map((f) => f.path), "sorted");
  assert.ok(!a.files.some((f) => ["code-layer.config.json", "INSTALL_RECEIPT.json"].includes(f.path)), "project-owned files are not template files");
});

// ---- prerequisites -----------------------------------------------------------------

test("prerequisites: each failed one refuses with zero writes and says what to change", async () => {
  const cases = [
    ["not-vite-builder", { main: MAIN_ESM.replaceAll("@storybook/react-vite", "@storybook/react-webpack5") }, /Vite-based framework/],
    ["csf-factories", { main: `import { resolve } from "node:path";\nimport { defineMain } from "@storybook/react-vite/node";\nexport default defineMain({ stories: [], addons: [], framework: "@storybook/react-vite" });\n` }, /defineMain/],
    ["csf-factories", { preview: `import { definePreview } from "@storybook/react-vite";\nexport default definePreview({});\n` }, /definePreview/],
    ["state-dir-inside-project", { config: fixtureConfig({ stateDir: ".code-layer" }) }, /served by the dev server/],
    ["binding-path-missing", { config: fixtureConfig({ components: { roots: ["src/missing"], classPrefixes: ["t-"] } }) }, /src\/missing/],
    ["binding-path-missing", { config: fixtureConfig({ governance: { componentSpecsDir: "../no-such-specs" } }) }, /no-such-specs/],
    ["binding-invalid", { config: { ...fixtureConfig(), surprise: true } }, /not valid for this template/],
    ["binding-invalid", { config: fixtureConfig({ tokens: { ...fixtureConfig().tokens, tiers: fixtureConfig().tokens.tiers.map((t) => ({ ...t, writable: true })) } }) }, /ref/],
  ];
  for (const [code, options, message] of cases) {
    const { ws, project, binding } = makeProject(options);
    const before = treeHash(ws);
    const result = await run({ projectRoot: project, config: binding });
    assert.deepEqual([result.ok, result.result, result.written], [false, "refused", []], code);
    const found = result.issues.find((issue) => issue.code === code);
    assert.ok(found && found.severity === "error" && message.test(found.message), `${code}: ${JSON.stringify(result.issues)}`);
    assert.equal(treeHash(ws), before, `${code}: zero writes`);
  }
  // Not a Storybook project at all.
  const { ws } = makeProject();
  assert.deepEqual(codes(await run({ projectRoot: ws, config: null })), ["not-a-storybook-project"]);
  const { project: bare, ws: bareWs } = makeProject();
  fs.rmSync(path.join(bare, ".storybook/main.ts"));
  const before = treeHash(bareWs);
  assert.deepEqual(codes(await run({ projectRoot: bare })), ["main-config-missing"]);
  assert.equal(treeHash(bareWs), before);
});

test("install never creates a binding: with none present and none supplied it refuses and points at the derivation", async () => {
  const { ws, project } = makeProject();
  const before = treeHash(ws);
  const result = await run({ projectRoot: project });
  assert.deepEqual([result.result, codes(result)], ["refused", ["binding-missing"]]);
  assert.match(result.issues.find((i) => i.code === "binding-missing").message, /derive_binding\.mjs/);
  assert.equal(treeHash(ws), before);
  const missing = await run({ projectRoot: project, config: path.join(ws, "nope.json") });
  assert.deepEqual(codes(missing), ["binding-missing"]);
  assert.equal(treeHash(ws), before);
});

// ---- install -------------------------------------------------------------------------

test("install on a clean project: files, binding, one added addons element, tsconfig entry, receipt last; a second run writes nothing", async () => {
  const { ws, project, binding } = makeProject();
  const manifest = buildManifest();
  const dry = await run({ projectRoot: project, config: binding, dryRun: true });
  const before = treeHash(ws);
  assert.equal(dry.result, "planned");
  const result = await run({ projectRoot: project, config: binding });
  assert.deepEqual([result.ok, result.result, result.restartRequired], [true, "installed", true]);
  assert.deepEqual(result.actions, dry.actions, "the dry run listed exactly what the real run did");
  assert.notEqual(treeHash(ws), before);
  for (const file of manifest.files) assert.equal(sha(path.join(project, ".storybook/code-layer", file.path)), file.sha256, file.path);
  assert.ok(fs.readFileSync(binding).equals(fs.readFileSync(path.join(project, ".storybook/code-layer/code-layer.config.json"))));
  // The main configuration differs by the one added array element.
  assert.equal(fs.readFileSync(path.join(project, ".storybook/main.ts"), "utf8"), MAIN_ESM.replace("    inspector,\n", `    inspector,\n    ${ENTRY},\n`));
  assert.equal(fs.readFileSync(path.join(project, "tsconfig.json"), "utf8"), wireTsconfig(TSCONFIG).source);
  // Order: template files, binding, tsconfig, the preset once the files exist, the receipt last.
  const kinds = result.actions.map((a) => a.action);
  assert.deepEqual(kinds.slice(-4), ["write-binding", "wire-tsconfig", "wire-main", "write-receipt"]);
  assert.ok(kinds.slice(0, -4).every((k) => k === "install") && kinds.length === manifest.files.length + 4);
  assert.deepEqual(result.written, result.actions.map((a) => a.path));
  // The receipt: version, every file's hash, and exactly which wiring the installer added.
  const receipt = JSON.parse(fs.readFileSync(path.join(project, ".storybook/code-layer/INSTALL_RECEIPT.json"), "utf8"));
  assert.deepEqual([receipt.schemaVersion, receipt.name, receipt.version], [2, "storybook-code-layer", manifest.version]);
  assert.deepEqual(receipt.files, Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256])));
  assert.deepEqual(receipt.wiring, { main: { file: ".storybook/main.ts", addedElement: true, addedResolveImport: false }, tsconfig: "added" });
  assert.match(receipt.installedAt, /^\d{4}-\d{2}-\d{2}T/);

  const installed = treeHash(ws);
  const again = await run({ projectRoot: project, config: binding });
  assert.deepEqual([again.ok, again.result, again.actions, again.written], [true, "current", [], []]);
  assert.equal(treeHash(ws), installed, "no content and no modification time changed");
  const health = await run({ projectRoot: project, mode: "check" });
  assert.deepEqual([health.ok, health.result, health.issues.filter((i) => i.severity === "error")], [true, "complete", []]);
  assert.equal(treeHash(ws), installed, "--check writes nothing");
});

test("the receipt tells wiring the installer added from wiring it found", async () => {
  // tsconfig already excludes the install directory; main has no node:path import yet.
  const { project, binding } = makeProject({ main: MAIN_NO_IMPORT, tsconfig: wireTsconfig(TSCONFIG).source });
  const result = await run({ projectRoot: project, config: binding });
  assert.equal(result.result, "installed");
  assert.ok(!result.actions.some((a) => a.action === "wire-tsconfig"));
  const receipt = JSON.parse(fs.readFileSync(path.join(project, ".storybook/code-layer/INSTALL_RECEIPT.json"), "utf8"));
  assert.deepEqual(receipt.wiring, { main: { file: ".storybook/main.ts", addedElement: true, addedResolveImport: true }, tsconfig: "present" });
  // A project whose include list does not cover the addon needs no exclude entry.
  const other = makeProject({ tsconfig: '{ "include": ["src"] }\n' });
  await run({ projectRoot: other.project, config: other.binding });
  assert.equal(JSON.parse(fs.readFileSync(path.join(other.project, ".storybook/code-layer/INSTALL_RECEIPT.json"), "utf8")).wiring.tsconfig, "not-needed");
  assert.equal(fs.readFileSync(path.join(other.project, "tsconfig.json"), "utf8"), '{ "include": ["src"] }\n');
  // A second run keeps what the first one recorded.
  const before = fs.readFileSync(path.join(project, ".storybook/code-layer/INSTALL_RECEIPT.json"), "utf8");
  assert.equal((await run({ projectRoot: project })).result, "current");
  assert.equal(fs.readFileSync(path.join(project, ".storybook/code-layer/INSTALL_RECEIPT.json"), "utf8"), before);
});

test("a failure after any number of operations puts every file back: content and modification time", async () => {
  const { ws, project, binding } = makeProject();
  const total = (await run({ projectRoot: project, config: binding, dryRun: true })).actions.length;
  const before = treeHash(ws);
  for (const failAfter of [0, 1, 17, total - 3, total - 2, total - 1]) {
    const result = await run({ projectRoot: project, config: binding, failAfter });
    assert.deepEqual([result.ok, result.result, codes(result)], [false, "failed", ["write-failed"]], `failAfter ${failAfter}`);
    assert.equal(treeHash(ws), before, `failAfter ${failAfter}: the project is as it was`);
    assert.equal(fs.existsSync(path.join(project, ".storybook/code-layer")), false, "the directory the run created is gone");
    assert.deepEqual(fs.readdirSync(path.join(project, ".storybook")).filter((n) => n.startsWith(".code-layer-install-")), [], "no staging directory is left");
  }
  assert.equal((await run({ projectRoot: project, config: binding })).result, "installed");
});

test("check is read-only and judges the installation, not the project's own binding", async () => {
  const { ws, project, binding } = makeProject();
  await run({ projectRoot: project, config: binding });
  // A person adds a check command to the binding.
  const bindingFile = path.join(project, ".storybook/code-layer/code-layer.config.json");
  const edited = { ...JSON.parse(fs.readFileSync(bindingFile, "utf8")), checks: [{ id: "extra", command: "node", args: ["-e", "0"], cwd: "{candidateRoot}", appliesTo: "tokens" }] };
  fs.writeFileSync(bindingFile, `${JSON.stringify(edited, null, 2)}\n`);
  let before = treeHash(ws);
  let health = await run({ projectRoot: project, mode: "check" });
  assert.deepEqual([health.result, health.issues.filter((i) => i.severity === "error")], ["complete", []]);
  assert.equal(treeHash(ws), before);
  // An invalid binding is reported.
  fs.writeFileSync(bindingFile, `${JSON.stringify({ ...edited, surprise: 1 }, null, 2)}\n`);
  assert.ok(codes(await run({ projectRoot: project, mode: "check" })).includes("binding-invalid"));
  fs.writeFileSync(bindingFile, `${JSON.stringify(edited, null, 2)}\n`);
  // Missing and changed files, missing wiring, a receipt that does not match.
  fs.rmSync(path.join(project, ".storybook/code-layer/runtime/overlay.ts"));
  fs.appendFileSync(path.join(project, ".storybook/code-layer/runtime/index.ts"), "\n// local edit\n");
  fs.writeFileSync(path.join(project, ".storybook/main.ts"), MAIN_ESM);
  fs.writeFileSync(path.join(project, "tsconfig.json"), TSCONFIG);
  fs.writeFileSync(path.join(project, ".storybook/code-layer/notes.txt"), "mine\n");
  before = treeHash(ws);
  health = await run({ projectRoot: project, mode: "check" });
  assert.deepEqual([health.ok, health.result], [false, "incomplete"]);
  const byCode = (code) => health.issues.filter((i) => i.code === code).map((i) => i.path);
  assert.deepEqual(byCode("file-missing"), [".storybook/code-layer/runtime/overlay.ts"]);
  assert.deepEqual(byCode("file-differs"), [".storybook/code-layer/runtime/index.ts"]);
  assert.deepEqual(byCode("wiring-missing").sort(), [".storybook/main.ts", "tsconfig.json"]);
  assert.deepEqual(byCode("unmanaged-file"), [".storybook/code-layer/notes.txt"]);
  assert.equal(treeHash(ws), before, "--check writes nothing");
  // No receipt at all.
  const fresh = makeProject();
  assert.ok(codes(await run({ projectRoot: fresh.project, mode: "check" })).includes("binding-missing"));
  fs.rmSync(path.join(project, ".storybook/code-layer/INSTALL_RECEIPT.json"));
  assert.ok(codes(await run({ projectRoot: project, mode: "check" })).includes("receipt-missing"));
});

test("an existing binding is kept even when --config differs; an install directory that is a symbolic link is refused", async () => {
  const { ws, project, binding } = makeProject();
  await run({ projectRoot: project, config: binding });
  const installed = path.join(project, ".storybook/code-layer/code-layer.config.json");
  const original = fs.readFileSync(installed);
  const other = path.join(ws, "other.json");
  fs.writeFileSync(other, `${JSON.stringify(fixtureConfig({ projectId: "other" }), null, 2)}\n`);
  const result = await run({ projectRoot: project, config: other });
  assert.deepEqual([result.result, codes(result)], ["current", ["binding-kept"]]);
  assert.ok(fs.readFileSync(installed).equals(original));

  const linked = makeProject();
  const elsewhere = path.join(linked.ws, "elsewhere");
  fs.mkdirSync(elsewhere);
  fs.symlinkSync(elsewhere, path.join(linked.project, ".storybook/code-layer"));
  const before = treeHash(linked.ws);
  for (const mode of ["install", "update", "uninstall", "check"]) {
    const refused = await run({ projectRoot: linked.project, config: mode === "install" ? linked.binding : null, mode });
    assert.deepEqual([refused.ok, codes(refused)], [false, ["install-dir-symlink"]], mode);
  }
  assert.equal(treeHash(linked.ws), before);
  assert.deepEqual(fs.readdirSync(elsewhere), []);
});
