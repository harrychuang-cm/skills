// Binding derivation: a read-only proposal with evidence, what needs a
// person's confirmation, and the separate write step.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";

import { derive, writeBinding } from "../scripts/derive_binding.mjs";
import { run } from "../scripts/install_code_layer.mjs";
import { FIXTURE_V1_ROOT, SKILL_ROOT, addon, tempDir } from "./helpers.mjs";
import { codes, sha, treeHash } from "./installer_helpers.mjs";
import { spawnSync } from "node:child_process";

const DERIVE = path.join(SKILL_ROOT, "scripts", "derive_binding.mjs");

/** The v1 fixture as a project would look before Code Layer: tokens outside and mirrored inside, no binding. */
function fixtureProject({ mirror = true, outside = true } = {}) {
  const ws = tempDir("code-layer-derive-");
  fs.cpSync(path.join(FIXTURE_V1_ROOT, "workspace"), ws, { recursive: true });
  if (mirror) fs.cpSync(path.join(ws, "tokens"), path.join(ws, "sb", "tokens"), { recursive: true });
  if (!outside) fs.rmSync(path.join(ws, "tokens"), { recursive: true });
  return { ws, project: path.join(ws, "sb") };
}
const byKey = (list, key) => list.filter((item) => item.key === key);

test("the proposal for the v1 fixture is a valid binding, and every value comes with evidence or a question", async () => {
  const { ws, project } = fixtureProject();
  const before = treeHash(ws);
  const result = await derive({ projectRoot: project });
  assert.deepEqual([result.ok, result.result, result.issues.filter((i) => i.severity === "error")], [true, "proposed", []]);
  assert.equal(treeHash(ws), before, "derivation reads only");
  const { resolveConfig } = await addon("server/config.mjs");
  const config = resolveConfig(result.binding, { projectRoot: project, configFile: path.join(project, ".storybook/code-layer/code-layer.config.json") });
  assert.equal(config.tokens.prefix, "fx");

  assert.deepEqual(result.binding, {
    schemaVersion: 1,
    projectId: "fixture-v1-storybook",
    apiPath: "/__code-layer",
    workspaceRoot: "..",
    stateDir: "../.code-layer",
    tokens: {
      prefix: "fx",
      entry: { source: "../tokens/tokens.css", mirror: "tokens/tokens.css" },
      tiers: [
        { tier: "ref", source: "../tokens/tokens-ref.css", mirror: "tokens/tokens-ref.css", writable: false },
        { tier: "sys", source: "../tokens/tokens-sys.css", mirror: "tokens/tokens-sys.css", writable: false },
        { tier: "comp", source: "../tokens/tokens-comp.css", mirror: "tokens/tokens-comp.css", writable: true },
      ],
      readonlySources: ["src/styles/chrome.css"],
    },
    components: { roots: ["src/components"], classPrefixes: ["fx-"] },
    checks: [],
    governance: { componentSpecsDir: "../design-system/components" },
  });

  // Every value of the draft is either backed by evidence or put as a question.
  const explained = new Set([...result.evidence.map((e) => e.key), ...result.needsConfirmation.map((n) => n.key)]);
  for (const key of ["projectId", "workspaceRoot", "stateDir", "tokens.prefix", "tokens.entry", "tokens.tiers.ref", "tokens.tiers.sys", "tokens.tiers.comp", "tokens.tiers.writable", "tokens.readonlySources", "components.roots", "components.classPrefixes", "checks", "governance.componentSpecsDir"]) {
    assert.ok(explained.has(key), `${key} is explained`);
  }
  assert.ok(result.evidence.every((e) => typeof e.evidence === "string" && e.evidence.length > 10));
  const evidenceOf = (key) => byKey(result.evidence, key)[0].evidence;
  assert.match(evidenceOf("tokens.prefix"), /\d+ declarations named --fx-\(ref\|sys\|comp\)-\*.*project\.config\.ts says tokenPrefix "fx"/);
  assert.match(evidenceOf("tokens.entry"), /in this order: ref → sys → comp; tokens\/tokens\.css is imported by the preview/);
  assert.match(evidenceOf("components.roots"), /2 component folder\(s\).*seal, title/);
  assert.match(evidenceOf("components.classPrefixes"), /project\.config\.ts lists componentClassPrefixes/);
  assert.match(evidenceOf("governance.componentSpecsDir"), /2 of its 2 \.md files are named after a component/);
  // What the evidence cannot settle is asked, with a proposal and the facts.
  assert.deepEqual(result.needsConfirmation.map((n) => n.key).sort(), ["checks", "stateDir", "tokens.sourceOfTruth", "workspaceRoot"]);
  const state = byKey(result.needsConfirmation, "stateDir")[0];
  assert.deepEqual([state.proposed, state.facts.outsideStorybookRoot, state.facts.sameVolumeAsWritableFiles], ["../.code-layer", true, true]);
  assert.equal(byKey(result.needsConfirmation, "workspaceRoot")[0].facts.absolute, ws);
});

test("identical token files in two directories: the source-of-truth question names both and nothing is decided silently", async () => {
  const { ws, project } = fixtureProject();
  const result = await derive({ projectRoot: project });
  const [question] = byKey(result.needsConfirmation, "tokens.sourceOfTruth");
  assert.ok(question.question.includes("../tokens") && question.question.includes(" tokens.") && question.question.includes("identical content"), question.question);
  assert.deepEqual(question.options, [{ source: "../tokens", mirror: "tokens" }, { source: "tokens", mirror: "../tokens" }]);
  assert.deepEqual([question.proposed, question.facts.identical], [{ source: "../tokens", mirror: "tokens" }, true]);

  // The two copies differ: said so, and the question stays.
  fs.appendFileSync(path.join(project, "tokens/tokens-comp.css"), "\n/* edited in one place only */\n");
  const drifted = await derive({ projectRoot: project });
  assert.equal(byKey(drifted.needsConfirmation, "tokens.sourceOfTruth")[0].facts.identical, false);
  assert.ok(codes(drifted).includes("mirror-differs"));
  assert.equal(drifted.ok, true, "a warning, not a refusal");

  // Token files only inside the project: one location, no question, no mirror.
  const single = fixtureProject({ outside: false });
  const alone = await derive({ projectRoot: single.project });
  assert.equal(alone.ok, true, JSON.stringify(alone.issues));
  assert.deepEqual(byKey(alone.needsConfirmation, "tokens.sourceOfTruth"), []);
  assert.deepEqual(alone.binding.tokens.entry, { source: "tokens/tokens.css" });
  assert.ok(alone.binding.tokens.tiers.every((tier) => !("mirror" in tier)));
  assert.equal(alone.binding.workspaceRoot, ".");
  assert.equal(byKey(alone.needsConfirmation, "stateDir")[0].facts.outsideStorybookRoot, true);
  // No token files at all.
  const none = fixtureProject({ mirror: false, outside: false });
  const nothing = await derive({ projectRoot: none.project });
  assert.deepEqual([nothing.ok, nothing.result, codes(nothing)], [false, "refused", ["token-entry-not-found"]]);
  void ws;
});

test("a specification directory inside the Storybook root is not adopted; candidates are listed and never adopted", async () => {
  const { ws, project } = fixtureProject();
  const result = await derive({ projectRoot: project });
  assert.equal(result.binding.governance.componentSpecsDir, "../design-system/components");
  assert.ok(result.notes.some((note) => note.includes("design-system/components is inside the Storybook project") && note.includes("not used")), result.notes.join("\n"));
  // Without the one beside the token source, the one inside is still not used.
  fs.rmSync(path.join(ws, "design-system/components"), { recursive: true });
  const without = await derive({ projectRoot: project });
  assert.equal("governance" in without.binding, false);
  assert.ok(without.notes.some((note) => note.includes("inside the Storybook project")));

  // Check commands: found in the project's scripts, offered with a ready entry, not put into the draft.
  assert.deepEqual(result.binding.checks, []);
  const [candidate] = result.candidates.checks;
  assert.equal(candidate.source, 'package.json script "check:tokens"');
  const script = path.join(project, "scripts/check-token-inheritance.mjs");
  assert.deepEqual(candidate.entry, { id: "check-tokens", command: "node", args: [script], cwd: "{candidateRoot}", appliesTo: "tokens", timeoutMs: 60000, sha256: sha(script) });
  assert.deepEqual(byKey(result.needsConfirmation, "checks")[0].options, ["node scripts/check-token-inheritance.mjs"]);
  // Commands named in the project's documentation are listed only.
  fs.writeFileSync(path.join(ws, "CLAUDE.md"), "# Notes\n\n```sh\nnode <skill>/scripts/generate_docs_html.mjs .\nnode <skill>/scripts/audit_tokens.mjs . --strict\n```\n");
  const documented = await derive({ projectRoot: project });
  assert.deepEqual(documented.candidates.postApply.map((c) => [c.source, c.command]), [["../CLAUDE.md", "node <skill>/scripts/generate_docs_html.mjs ."]]);
  assert.ok(documented.candidates.checks.some((c) => c.source === "../CLAUDE.md" && c.command.includes("audit_tokens")));
  assert.equal("postApply" in documented.binding, false);
  assert.deepEqual(documented.binding.checks, []);
  assert.ok(byKey(documented.needsConfirmation, "postApply").length === 1);
});

test("several directories with component markup, or no project configuration: asked, with what was found", async () => {
  const { project } = fixtureProject();
  // A prototype page with component markup outside src/components.
  fs.mkdirSync(path.join(project, "src/pages/demo"), { recursive: true });
  fs.writeFileSync(path.join(project, "src/pages/demo/Demo.tsx"), 'export const Demo = () => <div className="fx-demo" data-component="demo" />;\n');
  fs.writeFileSync(path.join(project, "src/pages/demo/Demo.css"), ".fx-demo { color: var(--fx-sys-color-primary); }\n");
  const two = await derive({ projectRoot: project });
  assert.deepEqual(two.binding.components.roots, ["src/components", "src/pages"]);
  const [roots] = byKey(two.needsConfirmation, "components.roots");
  assert.deepEqual(roots.facts.perRoot, { "src/components": ["seal", "title"], "src/pages": ["demo"] });
  // Without a project configuration the class prefixes are inferred, and asked.
  fs.rmSync(path.join(project, ".storybook/project.config.ts"));
  const inferred = await derive({ projectRoot: project });
  assert.deepEqual(inferred.binding.components.classPrefixes, ["fx-"]);
  const [prefixes] = byKey(inferred.needsConfirmation, "components.classPrefixes");
  assert.ok(prefixes.facts.counts["fx-"] > 5 && prefixes.facts.total >= prefixes.facts.counts["fx-"]);
  assert.match(byKey(inferred.evidence, "tokens.prefix")[0].evidence, /declarations named --fx-/);
});

test("--write validates the confirmed binding, creates the file, and never replaces an existing one", async () => {
  const { ws, project } = fixtureProject();
  const proposal = await derive({ projectRoot: project });
  const confirmed = path.join(ws, "confirmed.json");
  const bindingFile = path.join(project, ".storybook/code-layer/code-layer.config.json");
  // Not valid: nothing is written.
  for (const [bad, code] of [[{ ...proposal.binding, surprise: 1 }, "binding-invalid"], [{ ...proposal.binding, stateDir: ".code-layer" }, "state-dir-inside-project"], [{ ...proposal.binding, components: { roots: ["src/nope"], classPrefixes: ["fx-"] } }, "binding-path-missing"]]) {
    fs.writeFileSync(confirmed, JSON.stringify(bad));
    const before = treeHash(ws);
    const refused = await writeBinding({ projectRoot: project, from: confirmed });
    assert.deepEqual([refused.ok, refused.result, codes(refused)], [false, "refused", [code]]);
    assert.equal(treeHash(ws), before);
    assert.equal(fs.existsSync(path.dirname(bindingFile)), false);
  }
  assert.deepEqual(codes(await writeBinding({ projectRoot: project, from: path.join(ws, "missing.json") })), ["binding-missing"]);
  // Valid: the file is created with exactly the confirmed bytes.
  const text = `${JSON.stringify({ ...proposal.binding, checks: [proposal.candidates.checks[0].entry] }, null, 2)}\n`;
  fs.writeFileSync(confirmed, text);
  const written = await writeBinding({ projectRoot: project, from: confirmed });
  assert.deepEqual([written.ok, written.result, written.written], [true, "written", [".storybook/code-layer/code-layer.config.json"]]);
  assert.equal(fs.readFileSync(bindingFile, "utf8"), text);
  // An existing binding is the project's.
  fs.writeFileSync(confirmed, `${JSON.stringify({ ...proposal.binding, projectId: "another" }, null, 2)}\n`);
  const before = treeHash(ws);
  const refused = await writeBinding({ projectRoot: project, from: confirmed });
  assert.deepEqual([refused.ok, refused.result, codes(refused)], [false, "refused", ["binding-exists"]]);
  assert.equal(treeHash(ws), before);
  assert.equal(fs.readFileSync(bindingFile, "utf8"), text);
  // The installer takes it from there, without --config.
  const installed = await run({ projectRoot: project });
  assert.equal(installed.result, "installed", JSON.stringify(installed.issues));
  assert.equal(fs.readFileSync(bindingFile, "utf8"), text, "install does not touch the binding");
  assert.ok((await derive({ projectRoot: project })).notes.some((note) => note.includes("already exists")));
});

test("derivation and the write step start no process and open no connection", async () => {
  const { ws, project } = fixtureProject();
  const calls = [];
  const original = {};
  const names = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"];
  for (const name of names) {
    original[name] = childProcess[name];
    childProcess[name] = (...args) => {
      calls.push(`child_process.${name} ${String(args[0])}`);
      throw new Error(`child_process.${name} must not be called`);
    };
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    calls.push(`fetch ${String(args[0])}`);
    throw new Error("fetch must not be called");
  };
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function connect(...args) {
    calls.push(`net.connect ${JSON.stringify(args[0])}`);
    throw new Error("net.connect must not be called");
  };
  syncBuiltinESMExports();
  try {
    const proposal = await derive({ projectRoot: project });
    assert.equal(proposal.ok, true);
    const confirmed = path.join(ws, "confirmed.json");
    fs.writeFileSync(confirmed, JSON.stringify(proposal.binding));
    assert.equal((await writeBinding({ projectRoot: project, from: confirmed })).result, "written");
  } finally {
    for (const name of names) childProcess[name] = original[name];
    globalThis.fetch = originalFetch;
    net.Socket.prototype.connect = originalConnect;
    syncBuiltinESMExports();
  }
  assert.deepEqual(calls, []);

  // And nothing it imports could: the import graph has no process or network module.
  const seen = new Set();
  const builtins = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier.startsWith(".")) visit(path.resolve(path.dirname(file), specifier));
      else builtins.add(specifier.replace(/^node:/, ""));
    }
  };
  visit(DERIVE);
  // The binding is validated by the template's own resolver, loaded at run time.
  visit(path.join(SKILL_ROOT, "template/code-layer/server/config.mjs"));
  assert.ok(seen.size >= 5, [...seen].join("\n"));
  for (const forbidden of ["child_process", "http", "https", "http2", "net", "tls", "dgram", "worker_threads", "cluster"]) assert.ok(!builtins.has(forbidden), `imports ${forbidden}`);
});

test("command line: --json is one object; unknown flags are a usage error; the text names what needs confirmation", () => {
  const { ws, project } = fixtureProject();
  const before = treeHash(ws);
  const json = spawnSync(process.execPath, [DERIVE, "--project-root", project, "--json"], { encoding: "utf8" });
  const parsed = JSON.parse(json.stdout);
  assert.deepEqual([json.status, parsed.ok, parsed.result, parsed.binding.tokens.prefix], [0, true, "proposed", "fx"]);
  const text = spawnSync(process.execPath, [DERIVE, "--project", project], { encoding: "utf8" });
  assert.equal(text.status, 0);
  for (const expected of ["Proposed binding", "Evidence:", "Needs your confirmation (4):", "tokens.sourceOfTruth:", "Candidates (listed only, not adopted):", "result: proposed", "Nothing was written."]) assert.ok(text.stdout.includes(expected), expected);
  const usage = spawnSync(process.execPath, [DERIVE, "--project-root", project, "--apply"], { encoding: "utf8" });
  assert.equal(usage.status, 2);
  assert.ok(usage.stdout.includes("unknown flag --apply") && usage.stdout.includes("usage: derive_binding.mjs"));
  const refused = spawnSync(process.execPath, [DERIVE, "--project-root", ws, "--json"], { encoding: "utf8" });
  assert.deepEqual([refused.status, JSON.parse(refused.stdout).result], [1, "refused"]);
  assert.equal(treeHash(ws), before);
});

test("lab (optional): the proposal differs from the hand-written binding only in what it asks to be confirmed", { skip: !process.env.CODE_LAYER_LAB_CONFIG }, async () => {
  const bindingFile = process.env.CODE_LAYER_LAB_CONFIG;
  const project = path.resolve(path.dirname(bindingFile), "..", "..");
  const existing = JSON.parse(fs.readFileSync(bindingFile, "utf8"));
  const bytesBefore = fs.readFileSync(bindingFile);
  const result = await derive({ projectRoot: project });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.ok(fs.readFileSync(bindingFile).equals(bytesBefore));
  const asked = new Set(result.needsConfirmation.map((n) => n.key));
  const flat = (binding) => ({
    projectId: binding.projectId,
    workspaceRoot: binding.workspaceRoot,
    stateDir: binding.stateDir,
    "tokens.prefix": binding.tokens.prefix,
    "tokens.sourceOfTruth": [binding.tokens.entry, binding.tokens.tiers],
    "tokens.readonlySources": binding.tokens.readonlySources,
    "components.roots": binding.components.roots,
    "components.classPrefixes": binding.components.classPrefixes,
    checks: binding.checks ?? [],
    postApply: binding.postApply ?? [],
    "governance.componentSpecsDir": binding.governance?.componentSpecsDir ?? null,
  });
  const [mine, theirs] = [flat(result.binding), flat(existing)];
  const differing = Object.keys(mine).filter((key) => JSON.stringify(mine[key]) !== JSON.stringify(theirs[key]));
  for (const key of differing) assert.ok(asked.has(key), `${key} differs (${JSON.stringify(mine[key])} vs ${JSON.stringify(theirs[key])}) and is not among the questions ${[...asked].join(", ")}`);
  // What the evidence settles is the same as what was written by hand.
  for (const key of ["projectId", "tokens.prefix", "tokens.sourceOfTruth", "tokens.readonlySources", "components.classPrefixes", "governance.componentSpecsDir", "workspaceRoot", "stateDir"]) assert.deepEqual(mine[key], theirs[key], key);
});
