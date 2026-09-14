import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const native = "native-product-implementation";
const frontend = "frontend-product-implementation";
const governance = "ds-governance";
const prototype = "storybook-product-prototype";
const markerStart = "<!-- CM-SKILLS:USAGE:START v1 -->";
const markerEnd = "<!-- CM-SKILLS:USAGE:END -->";

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cm-skills-delivery-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const installer = path.join(source, "scripts", "install_agent_skills.mjs");
  write(installer, fs.readFileSync(path.join(scriptsRoot, "install_agent_skills.mjs")));
  write(path.join(source, "scripts", "skill-dependencies.json"), fs.readFileSync(path.join(scriptsRoot, "skill-dependencies.json")));
  for (const name of [native, frontend, governance, prototype, "production-data-integration"]) {
    write(path.join(source, name, "SKILL.md"), `---\nname: ${name}\ndescription: Test ${name}\n---\n# ${name}\n`);
    write(path.join(source, name, "references", "guide.md"), "# Local guide\n");
    write(path.join(source, name, "assets", "fixture.json"), '{"value":"fake"}\n');
  }
  fs.appendFileSync(path.join(source, native, "SKILL.md"), `\n[Governance](../${governance}/SKILL.md)\n[Support](../${frontend}/SKILL.md)\n`);
  write(path.join(source, frontend, "scripts", "validate_implementation.py"), 'print("support checker available")\n');
  fs.chmodSync(path.join(source, frontend, "scripts", "validate_implementation.py"), 0o755);
  return { root, source, target, installer };
}

function install(ctx, extra = [], options = {}) {
  return spawnSync(process.execPath, [ctx.installer,
    "--scope", "project", "--project-root", ctx.target,
    "--agent", "all", "--skill", native, "--record-usage", ...extra,
  ], { encoding: "utf8", ...options });
}

function success(result) {
  assert.equal(result.status, 0, result.stderr + result.stdout);
}

function usage(ctx) {
  return JSON.parse(fs.readFileSync(path.join(ctx.target, "docs", "SKILL_USAGE.json"), "utf8"));
}

function snapshot(root) {
  if (!fs.existsSync(root)) return null;
  const result = {};
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const file = path.join(folder, entry.name);
      const relative = path.relative(root, file);
      if (entry.isDirectory()) { result[relative] = "directory"; walk(file); }
      else if (entry.isSymbolicLink()) result[relative] = `link:${fs.readlinkSync(file)}`;
      else result[relative] = `${fs.statSync(file).mode & 0o777}:${fs.readFileSync(file).toString("base64")}`;
    }
  }
  walk(root);
  return result;
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  success(result);
  return result.stdout.trim();
}

function initAndCommit(root, files) {
  git(root, ["init", "--quiet"]);
  git(root, ["add", "--", ...files]);
  git(root, ["-c", "user.name=Skill Delivery Test", "-c", "user.email=skill-test@example.invalid", "commit", "--quiet", "-m", "test fixture"]);
}

function replaceRegistry(ctx, mutate) {
  const file = path.join(ctx.source, "scripts", "skill-dependencies.json");
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  mutate(registry);
  write(file, JSON.stringify(registry));
}

test("native recorded delivery includes required and support closure, not the next stage", (t) => {
  const ctx = fixture(t);
  success(install(ctx));
  const records = usage(ctx).skills;
  assert.deepEqual(records.map((entry) => entry.name), [governance, frontend, native]);
  assert.equal(records.find((entry) => entry.name === native).declaredUsed, true);
  const support = records.find((entry) => entry.name === frontend);
  assert.equal(support.declaredUsed, false);
  assert.equal(support.requiredBy[0].role, "support");
  for (const record of records) {
    assert.equal(record.installations.length, 3);
    for (const installation of record.installations) {
      assert.equal(installation.source.commit, null);
      assert.equal(installation.source.dirty, null);
      assert.equal(installation.contentSha256, installation.installedSha256);
      assert.match(installation.contentSha256, /^[a-f0-9]{64}$/);
      assert.ok(!path.isAbsolute(installation.path));
      assert.ok(fs.existsSync(path.join(ctx.target, installation.path, "SKILL.md")));
    }
  }
});

test("record-usage requires project scope and an explicit non-all selection without writes", async (t) => {
  for (const selection of [[], ["--skill", "all"], ["--skill", `${native},all`], ["--skill", ",,,"], ["--skill", `${native},missing-skill`]]) {
    await t.test(JSON.stringify(selection), (t) => {
      const ctx = fixture(t);
      const result = spawnSync(process.execPath, [ctx.installer, "--scope", "project", "--project-root", ctx.target, "--record-usage", ...selection], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.equal(snapshot(ctx.target), null);
    });
  }
  await t.test("user scope", (t) => {
    const ctx = fixture(t);
    const isolatedHome = path.join(ctx.root, "home");
    const result = spawnSync(process.execPath, [ctx.installer, "--scope", "user", "--skill", native, "--record-usage"], { encoding: "utf8", env: { ...process.env, HOME: isolatedHome } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires --scope project/);
    assert.equal(snapshot(isolatedHome), null);
  });
});

test("missing dependencies, invalid roles and cycles fail before touching existing files", async (t) => {
  const cases = {
    missing: (registry) => { registry.skills[native][0].name = "missing-skill"; },
    cycle: (registry) => { registry.skills[governance] = [{ name: native, role: "support", reason: "cycle" }]; },
    role: (registry) => { registry.skills[native][0].role = "next-stage"; },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    await t.test(label, (t) => {
      const ctx = fixture(t);
      write(path.join(ctx.target, "CLAUDE.md"), "User rules remain.\n");
      const before = snapshot(ctx.target);
      replaceRegistry(ctx, mutate);
      assert.notEqual(install(ctx).status, 0);
      assert.deepEqual(snapshot(ctx.target), before);
    });
  }
});

test("dry-run resolves all output and dependency paths and writes nothing", (t) => {
  const ctx = fixture(t);
  const result = install(ctx, ["--dry-run"]);
  success(result);
  assert.match(result.stdout, /support for native-product-implementation/);
  assert.match(result.stdout, /docs\/SKILL_USAGE.json/);
  assert.equal(snapshot(ctx.target), null);
});

test("recorded delivery omits interpreter caches and ignores their churn", (t) => {
  const ctx = fixture(t);
  const cache = path.join(ctx.source, native, "scripts", "__pycache__", "check.cpython-313.pyc");
  write(cache, "generated bytecode");
  success(install(ctx));
  assert.equal(fs.existsSync(path.join(ctx.target, ".agents", "skills", native, "scripts", "__pycache__")), false);
  const before = snapshot(ctx.target);
  write(cache, "regenerated bytecode");
  success(install(ctx));
  assert.deepEqual(snapshot(ctx.target), before);
});

test("no flag retains selection-only install and existing-copy refusal", (t) => {
  const ctx = fixture(t);
  const args = [ctx.installer, "--scope", "project", "--project-root", ctx.target, "--agent", "codex", "--skill", native];
  success(spawnSync(process.execPath, args, { encoding: "utf8" }));
  assert.ok(fs.existsSync(path.join(ctx.target, ".agents", "skills", native, "SKILL.md")));
  assert.equal(fs.existsSync(path.join(ctx.target, ".agents", "skills", frontend)), false);
  assert.equal(fs.existsSync(path.join(ctx.target, "docs", "SKILL_USAGE.json")), false);
  const before = snapshot(ctx.target);
  assert.notEqual(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 0);
  assert.deepEqual(snapshot(ctx.target), before);
});

test("all destination conflicts are found before the first copy", (t) => {
  const ctx = fixture(t);
  write(path.join(ctx.target, ".cursor", "skills", native, "SKILL.md"), "User custom native skill\n");
  const before = snapshot(ctx.target);
  const result = install(ctx);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /differs from source/);
  assert.deepEqual(snapshot(ctx.target), before);
  success(install(ctx, ["--force"]));
});

test("malformed or duplicate managed markers and usage JSON fail with zero writes", async (t) => {
  for (const body of [markerStart, markerEnd, markerEnd + markerStart, `${markerStart}\n${markerEnd}\n${markerStart}\n${markerEnd}`, "<!-- CM-SKILLS:USAGE:START v2 -->\n" + markerEnd, "<!--CM-SKILLS:USAGE:START v1 -->\n" + markerEnd]) {
    await t.test(body, (t) => {
      const ctx = fixture(t);
      write(path.join(ctx.target, "AGENTS.md"), body);
      const before = snapshot(ctx.target);
      assert.notEqual(install(ctx).status, 0);
      assert.deepEqual(snapshot(ctx.target), before);
    });
  }
  await t.test("malformed existing usage", (t) => {
    const ctx = fixture(t);
    write(path.join(ctx.target, "docs", "SKILL_USAGE.json"), "{broken");
    const before = snapshot(ctx.target);
    assert.notEqual(install(ctx).status, 0);
    assert.deepEqual(snapshot(ctx.target), before);
  });
});

test("managed edits preserve exact unrelated bytes, CRLF and Spectra blocks; reruns are identical", (t) => {
  const ctx = fixture(t);
  const prefix = Buffer.from("# User instructions\r\n<!-- SPECTRA:START -->\r\nKeep these bytes.\r\n<!-- SPECTRA:END -->\r\n");
  const suffix = Buffer.from("\r\nUser suffix without final newline \xff", "latin1");
  write(path.join(ctx.target, "CLAUDE.md"), Buffer.concat([prefix, Buffer.from(`${markerStart}\r\nOld body\r\n${markerEnd}`), suffix]));
  write(path.join(ctx.target, "AGENTS.md"), "Original rules, no newline");
  success(install(ctx));
  const claude = fs.readFileSync(path.join(ctx.target, "CLAUDE.md"));
  assert.ok(claude.subarray(0, prefix.length).equals(prefix));
  assert.ok(claude.subarray(-suffix.length).equals(suffix));
  const managed = claude.subarray(prefix.length, claude.length - suffix.length).toString();
  assert.equal(managed.replaceAll("\r\n", "").includes("\n"), false);
  assert.ok(fs.readFileSync(path.join(ctx.target, "AGENTS.md"), "utf8").startsWith("Original rules, no newline\n\n"));
  const before = snapshot(ctx.target);
  success(install(ctx));
  assert.deepEqual(snapshot(ctx.target), before);
});

test("usage accumulates selections and promotes an explicitly used support dependency", (t) => {
  const ctx = fixture(t);
  success(install(ctx));
  const args = [ctx.installer, "--scope", "project", "--project-root", ctx.target, "--agent", "codex", "--skill", `${frontend},${prototype}`, "--record-usage"];
  success(spawnSync(process.execPath, args, { encoding: "utf8" }));
  const records = usage(ctx).skills;
  assert.deepEqual(records.map((entry) => entry.name), [governance, frontend, native, prototype]);
  const promoted = records.find((entry) => entry.name === frontend);
  assert.equal(promoted.declaredUsed, true);
  assert.equal(promoted.requiredBy[0].role, "support");
  assert.equal(promoted.installations.length, 3);
  assert.equal(records.find((entry) => entry.name === native).declaredUsed, true);
  assert.equal(records.find((entry) => entry.name === prototype).installations.length, 1);
  assert.equal(fs.existsSync(path.join(ctx.target, ".agents", "skills", "production-data-integration")), false);
});

test("content provenance detects local edits at the same source commit and excludes copied ignore names", (t) => {
  const ctx = fixture(t);
  initAndCommit(ctx.source, ["scripts", native, frontend, governance, prototype, "production-data-integration"]);
  git(ctx.source, ["remote", "add", "origin", "https://username:do-not-record@example.invalid/team/cm-skills.git?token=do-not-record"]);
  success(install(ctx));
  const first = usage(ctx).skills.find((entry) => entry.name === native).installations[0];
  assert.equal(first.source.dirty, false);
  assert.match(first.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(first.source.repository, "https://example.invalid/team/cm-skills.git");
  fs.appendFileSync(path.join(ctx.source, native, "SKILL.md"), "\nChanged without commit.\n");
  write(path.join(ctx.source, native, ".DS_Store"), "excluded");
  success(install(ctx, ["--force"]));
  const second = usage(ctx).skills.find((entry) => entry.name === native).installations[0];
  assert.equal(second.source.commit, first.source.commit);
  assert.equal(second.source.dirty, true);
  assert.notEqual(second.contentSha256, first.contentSha256);
  assert.equal(second.contentSha256, second.installedSha256);
  assert.equal(fs.existsSync(path.join(ctx.target, second.path, ".DS_Store")), false);
  assert.ok(!fs.readFileSync(path.join(ctx.target, "docs", "SKILL_USAGE.json"), "utf8").includes("do-not-record"));
});

test("preserved usage cannot silently link a missing or changed prior installation", (t) => {
  const ctx = fixture(t);
  success(install(ctx));
  fs.rmSync(path.join(ctx.target, ".claude", "skills", native), { recursive: true });
  const before = snapshot(ctx.target);
  const result = spawnSync(process.execPath, [ctx.installer, "--scope", "project", "--project-root", ctx.target, "--agent", "codex", "--skill", prototype, "--record-usage"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Previously recorded skill is missing or changed/);
  assert.deepEqual(snapshot(ctx.target), before);
});

test("nonportable source and destination symlinks fail before writing", async (t) => {
  for (const kind of ["absolute", "escape", "excluded", "destination"]) {
    await t.test(kind, (t) => {
      const ctx = fixture(t);
      write(path.join(ctx.target, "keep.txt"), "preserved");
      if (kind === "destination") fs.symlinkSync(ctx.source, path.join(ctx.target, ".agents"));
      else {
        const link = path.join(ctx.source, native, "linked.md");
        if (kind === "absolute") fs.symlinkSync(path.join(ctx.source, native, "SKILL.md"), link);
        if (kind === "escape") fs.symlinkSync(`../${frontend}/SKILL.md`, link);
        if (kind === "excluded") {
          write(path.join(ctx.source, native, "node_modules", "excluded.md"), "not copied");
          fs.symlinkSync("node_modules/excluded.md", link);
        }
      }
      const before = snapshot(ctx.target);
      assert.notEqual(install(ctx).status, 0);
      assert.deepEqual(snapshot(ctx.target), before);
    });
  }
});

test("a fresh isolated clone has every relative skill, support and managed-document link", (t) => {
  const ctx = fixture(t);
  fs.symlinkSync("references/guide.md", path.join(ctx.source, native, "guide-link.md"));
  success(install(ctx));
  const before = snapshot(ctx.target);
  success(install(ctx));
  assert.deepEqual(snapshot(ctx.target), before);
  initAndCommit(ctx.target, [".agents", ".claude", ".cursor", "docs", "CLAUDE.md", "AGENTS.md"]);
  const clone = path.join(ctx.root, "clone");
  success(spawnSync("git", ["clone", "--quiet", "--", ctx.target, clone], { encoding: "utf8" }));
  const clonedUsage = JSON.parse(fs.readFileSync(path.join(clone, "docs", "SKILL_USAGE.json"), "utf8"));
  const docs = ["CLAUDE.md", "AGENTS.md"];
  for (const record of clonedUsage.skills) {
    for (const installation of record.installations) {
      docs.push(`${installation.path}/SKILL.md`);
      assert.ok(fs.existsSync(path.join(clone, installation.path, "assets", "fixture.json")));
      if (record.name === frontend) assert.ok(fs.existsSync(path.join(clone, installation.path, "scripts", "validate_implementation.py")));
      if (record.name === native) assert.equal(fs.readFileSync(path.join(clone, installation.path, "guide-link.md"), "utf8"), "# Local guide\n");
    }
  }
  for (const file of docs) {
    const content = fs.readFileSync(path.join(clone, file), "utf8");
    for (const [, link] of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      assert.ok(!path.isAbsolute(link));
      const [relative, anchor] = link.split("#");
      const linkedFile = path.resolve(clone, path.dirname(file), relative);
      assert.ok(fs.existsSync(linkedFile), `${file}: ${link}`);
      if (anchor) assert.ok(fs.readFileSync(linkedFile, "utf8").includes(`id="${anchor}"`), `${file}: ${link}`);
    }
  }
  assert.equal(git(ctx.target, ["status", "--porcelain"]), "");
});

test("ignored delivery paths are reported without editing gitignore or committing", (t) => {
  const ctx = fixture(t);
  write(path.join(ctx.target, ".gitignore"), ".agents/\n.claude/\n.cursor/\n");
  git(ctx.target, ["init", "--quiet"]);
  const result = install(ctx);
  success(result);
  assert.match(result.stdout, /Not shared by a normal git add because it is ignored/);
  assert.equal(fs.readFileSync(path.join(ctx.target, ".gitignore"), "utf8"), ".agents/\n.claude/\n.cursor/\n");
  const head = spawnSync("git", ["-C", ctx.target, "rev-parse", "--verify", "HEAD"], { encoding: "utf8" });
  assert.notEqual(head.status, 0);
});
