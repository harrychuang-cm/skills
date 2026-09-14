#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const agent = readFlag("--agent", "all");
const scope = readFlag("--scope", "user");
const projectRootArg = readFlag("--project-root", "");
const skillFilter = readFlag("--skill", "all");
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const recordUsage = args.includes("--record-usage");
const help = args.includes("--help") || args.includes("-h");
const USAGE_MARKER_NAME = "CM-SKILLS:USAGE";

if (help) {
  printUsage();
  process.exit(0);
}

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

if (!["all", "claude", "codex", "cursor"].includes(agent)) {
  fail(`Unsupported --agent "${agent}". Expected claude, codex, cursor, or all.`);
}

if (!["user", "project"].includes(scope)) {
  fail(`Unsupported --scope "${scope}". Expected user or project.`);
}

if (scope === "project" && !projectRootArg) {
  fail("--project-root is required when --scope project is used.");
}

const projectRoot = projectRootArg ? path.resolve(projectRootArg) : "";
if (recordUsage && (scope !== "project" || !args.includes("--skill") ||
    !skillFilter.trim() || skillFilter.split(",").some((name) => name.trim() === "all"))) {
  fail("--record-usage requires --scope project and an explicit --skill list excluding all.");
}
let skills = discoverSkills(repoRoot, skillFilter);
const targets = resolveTargets({ agent, projectRoot, scope });
if (recordUsage) {
  try {
    const delivery = planRecordedDelivery(skills, targets);
    skills = delivery.skills;
    if (!dryRun) {
      for (const installation of delivery.installations) {
        if (!installation.unchanged) installSkill(installation.skill, installation.target);
        const installedHash = hashSkillTree(installation.destination);
        if (installedHash !== installation.hash) {
          throw new Error(`Installed content differs from source: ${installation.relativePath}; usage was not recorded.`);
        }
      }
      for (const output of delivery.outputs) writeChanged(output.path, output.content);
    }
    console.log(dryRun ? "Planned usage records:" : "Recorded project usage:");
    for (const skill of skills) {
      console.log(`- ${skill.name}: ${skill.declaredUsed ? "declared used" : "dependency"}${skill.requiredBy.length ? ` (${skill.requiredBy.map((item) => `${item.role} for ${item.skill}`).join(", ")})` : ""}`);
    }
    console.log("Repository delivery files (review and include in version control; no commit was made):");
    for (const output of delivery.outputs) console.log(`- ${toPosix(path.relative(projectRoot, output.path))}`);
    for (const installation of delivery.installations) console.log(`- ${installation.relativePath}/`);
    for (const ignoredPath of delivery.ignoredPaths) console.log(`- Not shared by a normal git add because it is ignored: ${ignoredPath}`);
  } catch (error) {
    fail(error.message);
  }
} else {
  for (const target of targets) {
    for (const skill of skills) installSkill(skill, target);
  }
}

console.log("");
console.log(dryRun ? "Dry-run targets:" : "Installed targets:");
for (const target of targets) {
  for (const skill of skills) {
    console.log(`- ${target.agent}: ${skill.name} -> ${path.join(target.root, skill.name)}`);
  }
}

console.log("");
console.log("Invoke as:");
console.log("- Claude Code: /<skill-name>");
console.log("- Codex: Use $<skill-name>");
console.log("- Cursor: /<skill-name> or let Agent decide");

function readFlag(name, defaultValue) {
  const index = args.indexOf(name);
  if (index < 0) return defaultValue;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value.`);
  return value;
}

function discoverSkills(root, filter) {
  const wanted = new Set(
    filter === "all"
      ? []
      : filter
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
  );

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const skillRoot = path.join(root, entry.name);
    const skillFile = path.join(skillRoot, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    const metadata = readSkillMetadata(skillFile);
    if (metadata.name !== entry.name) {
      fail(`SKILL.md name "${metadata.name}" must match folder name "${entry.name}".`);
    }
    if (!metadata.description) {
      fail(`Missing SKILL.md description in ${path.relative(root, skillFile)}.`);
    }
    if (wanted.size && !wanted.has(entry.name)) continue;

    skills.push({ name: entry.name, root: skillRoot });
  }

  if (!skills.length) {
    fail(
      wanted.size
        ? `No matching skills found for --skill ${[...wanted].join(",")}.`
        : "No skills found.",
    );
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function readSkillMetadata(skillFile) {
  const markdown = fs.readFileSync(skillFile, "utf8");
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) fail(`Missing YAML frontmatter in ${skillFile}.`);

  const frontmatter = match[1];
  const name = readScalar(frontmatter, "name");
  const description = readScalar(frontmatter, "description") || readFolded(frontmatter, "description");

  if (!name) fail(`Missing SKILL.md name in ${skillFile}.`);
  return { name, description };
}

function readScalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  const raw = match[1].trim();
  if (raw === ">-" || raw === "|" || raw === "|-") return "";
  return raw.replace(/^["']|["']$/g, "").trim();
}

function readFolded(frontmatter, key) {
  const lines = frontmatter.replace(/\r\n/g, "\n").split("\n");
  const startIndex = lines.findIndex((line) => new RegExp(`^${key}:\\s*(?:>-?|\\|-?)\\s*$`).test(line));
  if (startIndex < 0) return "";

  const collected = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z0-9_-]+:\s*/.test(line)) break;
    collected.push(line.trim());
  }

  return collected.join(" ").trim();
}

function resolveTargets(options) {
  const selectedAgents =
    options.agent === "all" ? ["claude", "codex", "cursor"] : [options.agent];

  return selectedAgents.map((selectedAgent) => ({
    agent: selectedAgent,
    root: destinationRootFor(selectedAgent, options.scope, options.projectRoot),
  }));
}

function destinationRootFor(selectedAgent, selectedScope, selectedProjectRoot) {
  if (selectedScope === "user") {
    const home = os.homedir();
    if (selectedAgent === "claude") return path.join(home, ".claude", "skills");
    if (selectedAgent === "codex") return path.join(home, ".agents", "skills");
    if (selectedAgent === "cursor") return path.join(home, ".cursor", "skills");
  }

  if (selectedAgent === "claude") return path.join(selectedProjectRoot, ".claude", "skills");
  if (selectedAgent === "codex") return path.join(selectedProjectRoot, ".agents", "skills");
  if (selectedAgent === "cursor") return path.join(selectedProjectRoot, ".cursor", "skills");

  fail(`Cannot resolve destination for ${selectedAgent}.`);
}

function installSkill(skill, target) {
  const destination = path.resolve(target.root, skill.name);
  if (destination === skill.root || destination.startsWith(`${skill.root}${path.sep}`)) {
    fail(`Refusing to install into the source skill directory: ${destination}`);
  }

  if (dryRun) return;

  if (fs.existsSync(destination) && !force) {
    fail(`${destination} already exists. Re-run with --force to replace it.`);
  }

  if (fs.existsSync(destination)) {
    fs.rmSync(destination, { force: true, recursive: true });
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  copyDirectory(skill.root, destination);
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;

    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
      fs.chmodSync(destinationPath, fs.statSync(sourcePath).mode);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(sourcePath);
      fs.symlinkSync(linkTarget, destinationPath);
    }
  }
}

function shouldSkip(name) {
  return name === ".DS_Store" || name === "node_modules" || name === ".git" ||
    (recordUsage && (name === "__pycache__" || name.endsWith(".pyc")));
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${file}: ${error.message}`);
  }
}

function resolveRecordedSkills(selected) {
  const requested = skillFilter.split(",").map((name) => name.trim());
  if (requested.some((name) => !/^[a-z0-9][a-z0-9-]*$/.test(name))) {
    throw new Error("--record-usage needs non-empty, lowercase skill names (comma separated).");
  }
  const catalog = new Map(discoverSkills(repoRoot, "all").map((skill) => [skill.name, skill]));
  for (const name of requested) if (!catalog.has(name)) throw new Error(`Selected skill is missing: ${name}`);
  const registry = readJson(path.join(repoRoot, "scripts", "skill-dependencies.json"));
  if (registry.schemaVersion !== 1 || !registry.skills || typeof registry.skills !== "object" || Array.isArray(registry.skills)) {
    throw new Error("skill-dependencies.json must have schemaVersion: 1 and a skills object.");
  }
  const resolved = new Map();
  const visiting = [];
  function visit(name) {
    if (visiting.includes(name)) throw new Error(`Skill dependency cycle: ${[...visiting, name].join(" -> ")}`);
    if (resolved.has(name)) return;
    const skill = catalog.get(name);
    if (!skill) throw new Error(`Required dependency is missing: ${name}`);
    const dependencies = registry.skills[name] ?? [];
    if (!Array.isArray(dependencies)) throw new Error(`Dependencies for ${name} must be an array.`);
    visiting.push(name);
    const seen = new Set();
    for (const dependency of dependencies) {
      if (!dependency || typeof dependency.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(dependency.name) ||
          !["required", "support"].includes(dependency.role) ||
          typeof dependency.reason !== "string" || !dependency.reason.trim() || seen.has(dependency.name)) {
        throw new Error(`Malformed or duplicate dependency for ${name}.`);
      }
      seen.add(dependency.name);
      visit(dependency.name);
    }
    visiting.pop();
    resolved.set(name, { ...skill, declaredUsed: requested.includes(name), requiredBy: [] });
  }
  for (const skill of selected) visit(skill.name);
  for (const skill of resolved.values()) {
    for (const dependency of registry.skills[skill.name] ?? []) {
      resolved.get(dependency.name).requiredBy.push({ skill: skill.name, role: dependency.role, reason: dependency.reason });
    }
  }
  return [...resolved.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function statIfPresent(file) {
  try { return fs.lstatSync(file); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function assertInside(root, file) {
  const relative = path.relative(root, file);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project: ${file}`);
  }
}

function preflightDestination(file, kind) {
  assertInside(projectRoot, file);
  let current = file;
  while (true) {
    const stat = statIfPresent(current);
    if (stat?.isSymbolicLink()) throw new Error(`Refusing a symlink destination or ancestor: ${current}`);
    if (stat && current !== file && !stat.isDirectory()) throw new Error(`Destination parent is not a directory: ${current}`);
    if (stat && current === file && !(kind === "directory" ? stat.isDirectory() : stat.isFile())) {
      throw new Error(`Destination must be a ${kind}: ${file}`);
    }
    if (current === projectRoot) break;
    current = path.dirname(current);
  }
}

function treeEntries(root) {
  const entries = [];
  const physicalRoot = fs.realpathSync(root);
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
      if (shouldSkip(entry.name)) continue;
      const file = path.join(folder, entry.name);
      const relative = toPosix(path.relative(root, file));
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) entries.push({ file, relative, kind: "file", value: fs.readFileSync(file), mode: fs.statSync(file).mode & 0o111 ? 1 : 0 });
      else if (entry.isSymbolicLink()) {
        const target = fs.readlinkSync(file);
        const resolved = path.resolve(path.dirname(file), target);
        if (path.isAbsolute(target)) throw new Error(`Nonportable absolute symlink: ${relative}`);
        assertInside(root, resolved);
        // A link must remain usable when this complete skill is copied on its own.
        const realTarget = fs.realpathSync(file);
        assertInside(physicalRoot, realTarget);
        if (path.relative(root, resolved).split(path.sep).some(shouldSkip) ||
            path.relative(physicalRoot, realTarget).split(path.sep).some(shouldSkip)) {
          throw new Error(`Symlink points into excluded content: ${relative}`);
        }
        entries.push({ file, relative, kind: "symlink", value: Buffer.from(target), mode: 0 });
      } else throw new Error(`Unsupported skill file: ${relative}`);
    }
  }
  walk(root);
  return entries;
}

function hashSkillTree(root) {
  const hash = createHash("sha256");
  for (const entry of treeEntries(root)) {
    hash.update(JSON.stringify([entry.relative, entry.kind, entry.mode, entry.value.length]) + "\n");
    hash.update(entry.value);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function gitOutput(root, gitArgs) {
  const result = spawnSync("git", ["-C", root, ...gitArgs], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function sourceIdentity() {
  const topLevel = gitOutput(repoRoot, ["rev-parse", "--show-toplevel"]);
  const isSourceRepo = topLevel && fs.realpathSync(topLevel) === fs.realpathSync(repoRoot);
  let repository = path.basename(repoRoot);
  const remote = isSourceRepo ? gitOutput(repoRoot, ["config", "--get", "remote.origin.url"]) : null;
  if (remote) {
    try {
      const url = new URL(remote);
      if (url.protocol !== "file:") {
        url.username = ""; url.password = ""; url.search = ""; url.hash = "";
        repository = url.toString();
      }
    } catch {
      const scp = remote.match(/^(?:[^@/:]+@)?([a-zA-Z0-9.-]+):([^?#]+)$/);
      if (scp) repository = `${scp[1]}:${scp[2]}`;
    }
  }
  const status = isSourceRepo ? gitOutput(repoRoot, ["status", "--porcelain", "--untracked-files=normal"]) : null;
  return {
    repository,
    commit: isSourceRepo ? gitOutput(repoRoot, ["rev-parse", "HEAD"]) : null,
    dirty: status === null ? null : status.length > 0,
  };
}

function readUsage(file) {
  if (!statIfPresent(file)) return { schemaVersion: 1, skills: [] };
  const usage = readJson(file);
  if (usage.schemaVersion !== 1 || !Array.isArray(usage.skills)) throw new Error("Unsupported or malformed docs/SKILL_USAGE.json.");
  const seen = new Set();
  for (const skill of usage.skills) {
    if (!skill || typeof skill.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(skill.name) || seen.has(skill.name) ||
        typeof skill.declaredUsed !== "boolean" || !Array.isArray(skill.requiredBy) || !Array.isArray(skill.installations) || !skill.installations.length) {
      throw new Error("Malformed or duplicate skill usage record.");
    }
    seen.add(skill.name);
    for (const dependency of skill.requiredBy) {
      if (!dependency || typeof dependency.skill !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(dependency.skill) ||
          !["required", "support"].includes(dependency.role) || typeof dependency.reason !== "string") {
        throw new Error(`Malformed recorded dependency for ${skill.name}.`);
      }
    }
    const agents = new Set();
    for (const installation of skill.installations) {
      const expected = ["claude", "codex", "cursor"].includes(installation?.agent)
        ? toPosix(path.relative(projectRoot, path.join(destinationRootFor(installation.agent, "project", projectRoot), skill.name))) : null;
      if (!expected || installation.path !== expected || agents.has(installation.agent) ||
          !/^[a-f0-9]{64}$/.test(installation.contentSha256) || installation.installedSha256 !== installation.contentSha256 ||
          !installation.source || typeof installation.source.repository !== "string" ||
          !(installation.source.commit === null || /^[a-f0-9]{40,64}$/.test(installation.source.commit)) ||
          ![true, false, null].includes(installation.source.dirty)) {
        throw new Error(`Malformed recorded installation for ${skill.name}.`);
      }
      agents.add(installation.agent);
    }
  }
  return usage;
}

function managedBlock(file, body) {
  const old = statIfPresent(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  const start = Buffer.from(`<!-- ${USAGE_MARKER_NAME}:START v1 -->`);
  const end = Buffer.from(`<!-- ${USAGE_MARKER_NAME}:END -->`);
  const markerCount = (old.toString("utf8").match(/<!--\s*CM-SKILLS:USAGE\b/g) ?? []).length;
  const from = old.indexOf(start);
  const to = old.indexOf(end);
  if (markerCount !== 0 && (markerCount !== 2 || from < 0 || to < from)) {
    throw new Error(`Malformed or duplicate ${USAGE_MARKER_NAME} markers in ${path.basename(file)}.`);
  }
  const newline = old.includes(Buffer.from("\r\n")) ? "\r\n" : "\n";
  const block = Buffer.from([start.toString(), ...body, end.toString()].join(newline));
  if (from >= 0) return Buffer.concat([old.subarray(0, from), block, old.subarray(to + end.length)]);
  const separator = old.length === 0 ? "" : old[old.length - 1] === 10 ? newline : newline + newline;
  return Buffer.concat([old, Buffer.from(separator), block, Buffer.from(newline)]);
}

function planRecordedDelivery(selected, selectedTargets) {
  const resolved = resolveRecordedSkills(selected);
  const outputs = ["docs/SKILL_USAGE.json", "CLAUDE.md", "AGENTS.md"].map((name) => ({ path: path.join(projectRoot, name) }));
  for (const output of outputs) preflightDestination(output.path, "file");
  const usage = readUsage(outputs[0].path);
  const source = sourceIdentity();
  const installations = [];
  for (const skill of resolved) {
    const hash = hashSkillTree(skill.root);
    for (const target of selectedTargets) {
      const destination = path.join(target.root, skill.name);
      if (destination === skill.root || destination.startsWith(`${skill.root}${path.sep}`)) {
        throw new Error(`Refusing to install into the source skill directory: ${destination}`);
      }
      preflightDestination(destination, "directory");
      const exists = statIfPresent(destination) !== null;
      const unchanged = exists && hashSkillTree(destination) === hash;
      if (exists && !unchanged && !force) throw new Error(`${destination} differs from source. Inspect it, then re-run with --force to replace it.`);
      installations.push({ skill, target, destination, relativePath: toPosix(path.relative(projectRoot, destination)), hash, unchanged });
    }
  }
  for (const record of usage.skills) {
    for (const previous of record.installations) {
      if (installations.some((entry) => entry.relativePath === previous.path)) continue;
      const destination = path.join(projectRoot, previous.path);
      preflightDestination(destination, "directory");
      if (!statIfPresent(destination) || hashSkillTree(destination) !== previous.installedSha256) {
        throw new Error(`Previously recorded skill is missing or changed: ${previous.path}. Reinstall that skill explicitly before recording another delivery.`);
      }
    }
  }
  for (const skill of resolved) {
    let record = usage.skills.find((entry) => entry.name === skill.name);
    if (!record) {
      record = { name: skill.name, declaredUsed: false, requiredBy: [], installations: [] };
      usage.skills.push(record);
    }
    record.declaredUsed ||= skill.declaredUsed;
    for (const dependency of skill.requiredBy) {
      const index = record.requiredBy.findIndex((entry) => entry.skill === dependency.skill);
      if (index < 0) record.requiredBy.push(dependency);
      else record.requiredBy[index] = dependency;
    }
    record.requiredBy.sort((a, b) => a.skill.localeCompare(b.skill));
    for (const installation of installations.filter((entry) => entry.skill.name === skill.name)) {
      const next = { agent: installation.target.agent, path: installation.relativePath, source, contentSha256: installation.hash, installedSha256: installation.hash };
      const index = record.installations.findIndex((entry) => entry.agent === next.agent);
      if (index < 0) record.installations.push(next);
      else record.installations[index] = next;
    }
    record.installations.sort((a, b) => a.agent.localeCompare(b.agent));
  }
  usage.skills.sort((a, b) => a.name.localeCompare(b.name));
  outputs[0].content = Buffer.from(JSON.stringify(usage, null, 2) + "\n");
  const skillRows = usage.skills.map((skill) => {
    const roles = [skill.declaredUsed ? "declared used" : "dependency", ...skill.requiredBy.map((entry) => `${entry.role} for ${entry.skill}`)].join("; ");
    const links = skill.installations.map((entry) => `[${entry.agent}](${entry.path}/SKILL.md)`).join(", ");
    return `| ${skill.name} | ${roles} | ${links} |`;
  });
  outputs[1].content = managedBlock(outputs[1].path, [
    '<a id="cm-skills-project-skills"></a>', "## Project Skills", "",
    "Use the repository copies below for this project. Selected skills are declared used by the caller; dependencies are recorded separately.",
    "Support dependencies supply shared references or tools; their presence does not authorize another implementation stage.",
    "Source revisions and actual copied content hashes: [skill usage record](docs/SKILL_USAGE.json).", "",
    "| Skill | Usage and dependency roles | Repository copy |", "| --- | --- | --- |", ...skillRows,
  ]);
  outputs[2].content = managedBlock(outputs[2].path, [
    "## Project Skill References", "",
    "Read [Project Skills](CLAUDE.md#cm-skills-project-skills) for the declared usage list and repository skill links.",
    "Prefer these project copies; support dependencies supply references or checks and do not authorize the next stage.",
    "Provenance and installed paths: [skill usage record](docs/SKILL_USAGE.json).",
  ]);
  const deliveryPaths = [...outputs.map((output) => toPosix(path.relative(projectRoot, output.path))), ...installations.map((entry) => `${entry.relativePath}/SKILL.md`)];
  const ignoredPaths = deliveryPaths.filter((file) => gitOutput(projectRoot, ["check-ignore", "--", file]) !== null);
  return { skills: resolved, installations, outputs, ignoredPaths };
}

function writeChanged(file, content) {
  if (statIfPresent(file) && fs.readFileSync(file).equals(content)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fail(message) {
  console.error(message);
  console.error("");
  printUsage();
  process.exit(1);
}

function printUsage() {
  console.log(`Usage:
  node scripts/install_agent_skills.mjs --agent all --scope user [--force]
  node scripts/install_agent_skills.mjs --agent claude --scope project --project-root <repo> [--force]
  node scripts/install_agent_skills.mjs --agent codex --scope project --project-root <repo> [--force]
  node scripts/install_agent_skills.mjs --agent cursor --scope project --project-root <repo> [--force]

Options:
  --agent        claude, codex, cursor, or all. Default: all
  --scope        user or project. Default: user
  --project-root required for project scope
  --skill        comma-separated skill names or all. Default: all
  --force        replace existing installed copies
  --dry-run      print destinations without copying
  --record-usage project-only: explicit selected skills are declared used; include
                 required/support dependencies and write repo usage/agent links
`);
}
