#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const agent = readFlag("--agent", "all");
const scope = readFlag("--scope", "user");
const projectRootArg = readFlag("--project-root", "");
const skillFilter = readFlag("--skill", "all");
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const help = args.includes("--help") || args.includes("-h");

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
const skills = discoverSkills(repoRoot, skillFilter);
const targets = resolveTargets({ agent, projectRoot, scope });

for (const target of targets) {
  for (const skill of skills) {
    installSkill(skill, target);
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
  return name === ".DS_Store" || name === "node_modules" || name === ".git";
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
`);
}
