#!/usr/bin/env node
// Propose a project binding (code-layer.config.json) for a Storybook project,
// with the evidence behind every value. Read-only: it starts no process, makes
// no network request, and writes nothing — except with --write, which
// validates a binding a person has confirmed and creates the file (and
// refuses when the project already has one).
//
//   node scripts/derive_binding.mjs --project-root <storybook root> [--json]
//   node scripts/derive_binding.mjs --project-root <storybook root> --write <confirmed-binding.json> [--json]
//
// What the evidence does not settle is listed under "needs confirmation"
// instead of being guessed: which token directory is the source of truth, the
// workspace root, the state directory, and any check command.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { DERIVE_USAGE, parseDeriveArgs } from "./lib/cli_args.mjs";
import { sha256, writeAtomic } from "./lib/files.mjs";
import { BINDING_NAME, CONFIG_DIR_NAME, INSTALL_DIR_NAME, error, isInside, locateProject, posixRelative, validateBinding, warning } from "./lib/plan.mjs";

const SKIP_DIRS = new Set(["node_modules", "storybook-static", "dist", "build", "coverage", ".git", ".cache", ".code-layer", INSTALL_DIR_NAME]);
const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx", ".vue", ".svelte", ".ts", ".js"]);
const DOC_NAMES = ["CLAUDE.md", "AGENTS.md", "README.md"];
const MAX_FILES = 4000;

function walk(root, maxDepth, accept) {
  const out = [];
  const visit = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= MAX_FILES) return;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || (entry.name.startsWith(".") && entry.name !== CONFIG_DIR_NAME)) continue;
        if (depth < maxDepth) visit(full, depth + 1);
      } else if (entry.isFile() && accept(full)) out.push(full);
    }
  };
  visit(root, 0);
  return out;
}

const read = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

/** Token declarations of a stylesheet: counts per prefix and per tier. */
function tokenCounts(text) {
  const prefixes = new Map();
  const tiers = { ref: 0, sys: 0, comp: 0 };
  for (const match of text.matchAll(/(?:^|[\s;{])--([a-z][a-z0-9]*)-(ref|sys|comp)-[a-z0-9-]+\s*:/g)) {
    prefixes.set(match[1], (prefixes.get(match[1]) ?? 0) + 1);
    tiers[match[2]] += 1;
  }
  return { prefixes, tiers, total: tiers.ref + tiers.sys + tiers.comp };
}

function importsOf(file, text) {
  const out = [];
  for (const match of text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
    if (/^[a-z]+:|^\/\//i.test(match[1])) continue;
    out.push(path.resolve(path.dirname(file), match[1]));
  }
  return out;
}

/** Stylesheets that only import tier files: an entry and its tiers in import order. */
function findEntries(cssFiles) {
  const entries = [];
  for (const file of cssFiles) {
    const text = read(file);
    const imported = importsOf(file, text).filter((target) => fs.existsSync(target));
    if (imported.length < 2) continue;
    const tiers = imported.map((target) => {
      const counts = tokenCounts(read(target));
      const tier = Object.entries(counts.tiers).sort((a, b) => b[1] - a[1])[0];
      return { file: target, tier: tier[1] > 0 ? tier[0] : null, declarations: counts.total, prefixes: counts.prefixes };
    });
    if (tiers.some((t) => t.tier === null)) continue;
    if (new Set(tiers.map((t) => t.tier)).size !== tiers.length) continue;
    entries.push({ file, dir: path.dirname(file), tiers });
  }
  return entries;
}

const sameBytes = (a, b) => {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
};

function projectConfigFacts(configDir) {
  const file = fs.readdirSync(configDir).find((name) => /^project\.config\.(ts|js|mjs|cjs|json)$/.test(name));
  if (!file) return null;
  const text = read(path.join(configDir, file));
  const prefix = /["']?tokenPrefix["']?\s*:\s*["']([a-z][a-z0-9-]*)["']/.exec(text)?.[1] ?? null;
  const list = /["']?componentClassPrefixes["']?\s*:\s*\[([^\]]*)\]/.exec(text)?.[1] ?? null;
  const classPrefixes = list === null ? null : [...list.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  const stories = /["']?stories["']?\s*:\s*\[([^\]]*)\]/.exec(text)?.[1] ?? null;
  return { file: `${CONFIG_DIR_NAME}/${file}`, tokenPrefix: prefix, classPrefixes, stories: stories === null ? null : [...stories.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]) };
}

function commonAncestor(a, b) {
  const pa = path.resolve(a).split(path.sep);
  const pb = path.resolve(b).split(path.sep);
  const out = [];
  for (let i = 0; i < Math.min(pa.length, pb.length) && pa[i] === pb[i]; i += 1) out.push(pa[i]);
  return out.join(path.sep) || path.sep;
}

function deviceOf(target) {
  for (let dir = target; ; dir = path.dirname(dir)) {
    try {
      return fs.statSync(dir).dev;
    } catch {
      if (dir === path.dirname(dir)) return null;
    }
  }
}

const kebab = (text) => String(text ?? "").toLowerCase().replace(/^@[^/]+\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

/**
 * Inspect a Storybook project and propose a binding.
 * Returns { ok, result: "proposed" | "refused", projectRoot, binding, evidence, needsConfirmation, candidates, notes, issues }.
 */
export async function derive({ projectRoot }) {
  const project = path.resolve(projectRoot);
  const issues = [];
  const evidence = [];
  const needsConfirmation = [];
  const notes = [];
  const candidates = { checks: [], postApply: [] };
  const base = { projectRoot: project, binding: null, evidence, needsConfirmation, candidates, notes, issues };
  const rel = (target) => posixRelative(project, target) || ".";
  const where = locateProject(project);
  issues.push(...where.issues);
  if (issues.some((i) => i.severity === "error")) return { ok: false, result: "refused", ...base };
  const bindingFile = path.join(where.installDir, BINDING_NAME);
  if (fs.existsSync(bindingFile)) notes.push(`${rel(bindingFile)} already exists: this proposal is for comparison only; --write will not replace it`);

  const configFacts = projectConfigFacts(where.configDir);
  const parent = path.dirname(project);
  const isCss = (file) => file.endsWith(".css");
  const insideCss = walk(project, 5, isCss);
  const outsideCss = fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".") && path.join(parent, entry.name) !== project)
    .flatMap((entry) => walk(path.join(parent, entry.name), 2, isCss));

  // ---- tokens ------------------------------------------------------------------------
  const inside = findEntries(insideCss);
  const outside = findEntries(outsideCss);
  const previewText = where.previewFiles.map(read).join("\n");
  const importedByPreview = (entry) => where.previewFiles.some((preview) => previewText.includes(posixRelative(path.dirname(preview), entry.file)));
  const servedEntry = inside.find(importedByPreview) ?? inside[0] ?? null;
  const twinOf = (entry) => outside.find((o) => path.basename(o.file) === path.basename(entry.file) && o.tiers.length === entry.tiers.length && o.tiers.every((t, i) => path.basename(t.file) === path.basename(entry.tiers[i].file)));
  const twin = servedEntry ? twinOf(servedEntry) ?? null : null;
  const sourceEntry = twin ?? servedEntry ?? outside[0] ?? null;
  const mirrorEntry = twin ? servedEntry : null;
  if (!sourceEntry) {
    issues.push(error("token-entry-not-found", "no stylesheet was found that imports tier files declaring --<prefix>-ref-*, --<prefix>-sys-* and --<prefix>-comp-* custom properties; Code Layer needs a token entry file"));
    return { ok: false, result: "refused", ...base };
  }
  if (!servedEntry) issues.push(warning("token-entry-not-served", `the token entry ${rel(sourceEntry.file)} is outside the Storybook project root, so the dev server does not serve it: add a mirror inside the project that the preview imports`));

  const prefixCounts = new Map();
  for (const tier of sourceEntry.tiers) for (const [prefix, count] of tier.prefixes) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + count);
  const [prefix, prefixCount] = [...prefixCounts].sort((a, b) => b[1] - a[1])[0];
  evidence.push({ key: "tokens.prefix", value: prefix, evidence: `${prefixCount} declarations named --${prefix}-(ref|sys|comp)-* in ${sourceEntry.tiers.map((t) => rel(t.file)).join(", ")}${configFacts?.tokenPrefix ? `; ${configFacts.file} says tokenPrefix "${configFacts.tokenPrefix}"` : ""}` });
  if (configFacts?.tokenPrefix && configFacts.tokenPrefix !== prefix) {
    needsConfirmation.push({ key: "tokens.prefix", question: `The token files use the prefix "${prefix}" but ${configFacts.file} says "${configFacts.tokenPrefix}". Which is right?`, proposed: prefix, options: [prefix, configFacts.tokenPrefix] });
  }
  const tierOrder = sourceEntry.tiers.map((t) => t.tier).join(" → ");
  evidence.push({ key: "tokens.entry", value: rel(sourceEntry.file), evidence: `imports ${sourceEntry.tiers.length} tier files in this order: ${tierOrder}${servedEntry && importedByPreview(servedEntry) ? `; ${rel(servedEntry.file)} is imported by the preview` : ""}` });
  for (const tier of sourceEntry.tiers) evidence.push({ key: `tokens.tiers.${tier.tier}`, value: rel(tier.file), evidence: `${tier.declarations} declarations, mostly --${prefix}-${tier.tier}-*` });
  evidence.push({ key: "tokens.tiers.writable", value: "comp only", evidence: "the default: a component token is the narrowest place to re-bind. Set writable: true on the sys tier to allow system-token edits; the ref tier can never be writable" });

  if (twin && mirrorEntry) {
    const pairs = sourceEntry.tiers.map((t, i) => [t.file, mirrorEntry.tiers[i].file]).concat([[sourceEntry.file, mirrorEntry.file]]);
    const identical = pairs.every(([a, b]) => sameBytes(a, b));
    needsConfirmation.push({
      key: "tokens.sourceOfTruth",
      question: `Token files exist in two directories${identical ? " with identical content" : " and their content differs"}: ${rel(sourceEntry.dir)} and ${rel(mirrorEntry.dir)}. Which one do people edit (the source of truth), and which one is the copy the dev server serves (the mirror)? Every apply writes the source first and then the mirror; a wrong direction makes the copy the truth.`,
      proposed: { source: rel(sourceEntry.dir), mirror: rel(mirrorEntry.dir) },
      options: [
        { source: rel(sourceEntry.dir), mirror: rel(mirrorEntry.dir) },
        { source: rel(mirrorEntry.dir), mirror: rel(sourceEntry.dir) },
      ],
      facts: { identical, servedByPreview: rel(mirrorEntry.dir), reason: `${rel(mirrorEntry.dir)} is inside the Storybook project and is what the preview imports, so it is proposed as the mirror` },
    });
    if (!identical) issues.push(warning("mirror-differs", `${rel(sourceEntry.dir)} and ${rel(mirrorEntry.dir)} differ: Code Layer refuses every apply until source and mirror are identical`));
  }
  const candidatesInside = inside.filter((e) => e !== servedEntry);
  const candidatesOutside = outside.filter((e) => e !== twin && e !== sourceEntry);
  if (candidatesInside.length + candidatesOutside.length > 0) {
    needsConfirmation.push({ key: "tokens.entry", question: "More than one token entry file was found. Is the proposed one the right one?", proposed: rel(sourceEntry.file), options: [sourceEntry, ...candidatesInside, ...candidatesOutside].map((e) => rel(e.file)) });
  }

  // ---- components --------------------------------------------------------------------
  const sources = walk(project, 6, (file) => SOURCE_EXTENSIONS.has(path.extname(file)) && !/\.stories\.[a-z]+$/.test(file) && !isInside(file, where.configDir));
  const componentDirs = new Set();
  for (const file of sources) if (/data-component\s*=/.test(read(file))) componentDirs.add(path.dirname(file));
  const rootOf = (dir) => (fs.readdirSync(dir).some((name) => name.endsWith(".css")) ? path.dirname(dir) : dir);
  let roots = [...new Set([...componentDirs].map(rootOf))].filter((root) => root !== project && isInside(root, project));
  roots = roots.filter((root) => !roots.some((other) => other !== root && isInside(root, other))).sort();
  const componentIds = [...componentDirs].map((dir) => path.basename(dir)).sort();
  if (roots.length > 0) {
    evidence.push({ key: "components.roots", value: roots.map(rel), evidence: `${componentDirs.size} component folder(s) whose markup sets data-component: ${componentIds.slice(0, 8).join(", ")}${componentIds.length > 8 ? ", …" : ""}` });
    if (roots.length > 1) {
      const perRoot = Object.fromEntries(roots.map((root) => [rel(root), [...componentDirs].filter((dir) => isInside(dir, root)).map((dir) => path.basename(dir)).sort()]));
      needsConfirmation.push({ key: "components.roots", question: "Markup with a data-component attribute was found under more than one directory. Every stylesheet under a listed root becomes editable. Which of these directories hold components you want to edit with Code Layer (as opposed to pages, prototypes or examples)?", proposed: roots.map(rel), options: roots.map(rel), facts: { perRoot } });
    }
  } else {
    const stories = configFacts?.stories ?? [...read(where.mainFile).matchAll(/stories\s*:\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/["']([^"']+)["']/g)].map((s) => s[1]));
    const guess = [...new Set(stories.map((glob) => path.resolve(where.configDir, glob.split("*")[0])).filter((dir) => fs.existsSync(dir) && isInside(dir, project) && dir !== project))];
    roots = guess;
    needsConfirmation.push({ key: "components.roots", question: "No component markup with a data-component attribute was found. Which directories hold the component stylesheets?", proposed: roots.map(rel), facts: { storiesGlobs: stories } });
    if (roots.length === 0) issues.push(error("component-roots-not-found", "no component root could be proposed: neither data-component markup nor a stories glob pointing inside the project was found"));
  }
  const componentCss = roots.flatMap((root) => walk(root, 4, isCss));
  const classCounts = new Map();
  let classTotal = 0;
  for (const file of componentCss) {
    for (const match of read(file).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.([a-zA-Z][\w]*?-)[\w-]*(?=[\s,{:.>+~[)])/g)) {
      classCounts.set(match[1], (classCounts.get(match[1]) ?? 0) + 1);
      classTotal += 1;
    }
  }
  let classPrefixes = configFacts?.classPrefixes ?? null;
  if (classPrefixes && classPrefixes.length > 0) {
    const covered = classPrefixes.reduce((sum, p) => sum + (classCounts.get(p) ?? 0), 0);
    evidence.push({ key: "components.classPrefixes", value: classPrefixes, evidence: `${configFacts.file} lists componentClassPrefixes; ${covered} of ${classTotal} class selectors in the component stylesheets start with one of them` });
  } else {
    const ranked = [...classCounts].sort((a, b) => b[1] - a[1]);
    classPrefixes = ranked.filter(([, count]) => count / Math.max(1, classTotal) >= 0.1).map(([p]) => p);
    if (classPrefixes.length === 0) classPrefixes = ranked.slice(0, 1).map(([p]) => p);
    needsConfirmation.push({ key: "components.classPrefixes", question: "No project configuration lists the component class prefixes; these were inferred from the class selectors of the component stylesheets. Are they right?", proposed: classPrefixes, facts: { counts: Object.fromEntries(ranked.slice(0, 6)), total: classTotal } });
  }

  // Stylesheets inside the project that declare token-named properties without being tier files.
  const tierFiles = new Set([sourceEntry.file, ...sourceEntry.tiers.map((t) => t.file), ...(mirrorEntry ? [mirrorEntry.file, ...mirrorEntry.tiers.map((t) => t.file)] : []), ...inside.flatMap((e) => [e.file, ...e.tiers.map((t) => t.file)])]);
  const readonlySources = [];
  for (const file of insideCss) {
    if (tierFiles.has(file) || roots.some((root) => isInside(file, root))) continue;
    const count = tokenCounts(read(file)).prefixes.get(prefix) ?? 0;
    if (count > 0) {
      readonlySources.push(file);
      evidence.push({ key: "tokens.readonlySources", value: rel(file), evidence: `declares ${count} --${prefix}-(ref|sys|comp)-* properties and is not a tier file: names from it show up in token chains, are never written and never offered as targets` });
    }
  }

  // ---- workspace root, state directory -------------------------------------------------
  const workspaceRoot = isInside(sourceEntry.dir, project) ? project : commonAncestor(project, sourceEntry.dir);
  const stateDir = workspaceRoot === project ? path.join(path.dirname(project), ".code-layer") : path.join(workspaceRoot, ".code-layer");
  needsConfirmation.push({
    key: "workspaceRoot",
    question: "Paths in reports and in the object reference are shown relative to the workspace root. Is this the folder you think of as the project?",
    proposed: rel(workspaceRoot),
    facts: { absolute: workspaceRoot, reason: workspaceRoot === project ? "the token files are inside the Storybook project" : "the nearest folder that contains both the Storybook project and the token source" },
  });
  const writableFiles = [sourceEntry.tiers.find((t) => t.tier === "comp")?.file, ...componentCss.slice(0, 3)].filter(Boolean);
  const sameVolume = writableFiles.every((file) => deviceOf(file) === deviceOf(stateDir));
  needsConfirmation.push({
    key: "stateDir",
    question: "Code Layer keeps its journal and backups in the state directory. It must be outside the Storybook project (or the dev server would serve it) and on the same volume as the files it writes. Is this location acceptable? Consider adding it to .gitignore.",
    proposed: rel(stateDir),
    facts: { absolute: stateDir, outsideStorybookRoot: !isInside(stateDir, project), sameVolumeAsWritableFiles: sameVolume, exists: fs.existsSync(stateDir) },
  });

  // ---- governance --------------------------------------------------------------------
  let componentSpecsDir = null;
  const specsBesideTokens = path.join(path.dirname(sourceEntry.dir), "design-system", "components");
  const specFacts = (dir) => {
    const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3)) : [];
    return { files: names.length, matching: names.filter((name) => componentIds.includes(name)).length };
  };
  if (fs.existsSync(specsBesideTokens) && !isInside(specsBesideTokens, project)) {
    const facts = specFacts(specsBesideTokens);
    if (facts.matching > 0) {
      componentSpecsDir = specsBesideTokens;
      evidence.push({ key: "governance.componentSpecsDir", value: rel(specsBesideTokens), evidence: `beside the token source; ${facts.matching} of its ${facts.files} .md files are named after a component (${componentIds.length} components found): their Token Contract rows are rewritten together with the token` });
    } else {
      notes.push(`${rel(specsBesideTokens)} exists but none of its ${facts.files} .md files is named after a component; it is not proposed as the specification directory`);
    }
  }
  const specsInside = path.join(project, "design-system", "components");
  if (fs.existsSync(specsInside)) {
    const facts = specFacts(specsInside);
    notes.push(`${rel(specsInside)} is inside the Storybook project (${facts.matching} of ${facts.files} files match a component): it looks like material left by a project template and is not used as the specification directory`);
  }

  // ---- candidates: checks and post-apply commands (never adopted) ------------------------
  let packageJson = {};
  try {
    packageJson = JSON.parse(read(path.join(project, "package.json")));
  } catch {
    packageJson = {};
  }
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    if (!/token/i.test(name) && !/token/i.test(String(command))) continue;
    const script = /^node\s+(\S+\.(?:m?js|cjs))\s*$/.exec(String(command))?.[1] ?? null;
    const absolute = script ? path.resolve(project, script) : null;
    candidates.checks.push({
      source: `package.json script "${name}"`,
      command: String(command),
      ...(absolute && fs.existsSync(absolute)
        ? { entry: { id: kebab(name), command: "node", args: [absolute], cwd: "{candidateRoot}", appliesTo: "tokens", timeoutMs: 60000, sha256: sha256(absolute) }, confirm: "It must read the token files relative to its working directory: Code Layer runs it inside a copy of the workspace that holds the proposed token files, before anything is written." }
        : { confirm: "Not a plain `node <script>` command: write the check entry by hand if it can run against a copy of the token files." }),
    });
  }
  const docs = [project, workspaceRoot].flatMap((dir) => DOC_NAMES.map((name) => path.join(dir, name))).filter((file, i, all) => all.indexOf(file) === i && fs.existsSync(file));
  for (const doc of docs) {
    for (const line of read(doc).split("\n")) {
      const command = /^\s*(?:[$>]\s*)?(node\s+\S+.*)$/.exec(line)?.[1]?.trim();
      if (!command) continue;
      if (/audit[_-]?tokens|check[_-]?tokens|token[_-]?audit/i.test(command)) candidates.checks.push({ source: rel(doc), command, confirm: "Outside the project: give the script's absolute path and record its sha256 in the check entry." });
      else if (/generate[_-]/i.test(command)) candidates.postApply.push({ source: rel(doc), command, confirm: "Listed only. A post-apply command needs an id, the paths it writes (outside the Storybook project) and a working directory." });
    }
  }
  needsConfirmation.push({
    key: "checks",
    question: candidates.checks.length > 0 ? "Which of the candidate commands should gate token changes? None is adopted automatically. Without a check, a token change is written without any audit." : "No check command was found. Without one, a token change is written without any audit. Is there a token audit to add?",
    proposed: [],
    options: candidates.checks.map((c) => c.command),
  });
  if (candidates.postApply.length > 0) {
    needsConfirmation.push({ key: "postApply", question: "The project's documentation lists commands that regenerate derived files. Should any of them run after each apply? None is adopted automatically.", proposed: [], options: candidates.postApply.map((c) => c.command) });
  }

  // ---- the draft -----------------------------------------------------------------------
  const projectId = kebab(packageJson.name) || kebab(path.basename(project)) || "storybook";
  evidence.push({ key: "projectId", value: projectId, evidence: packageJson.name ? `from the package name "${packageJson.name}"` : "from the folder name" });
  const tierEntry = (tier, i) => ({ tier: tier.tier, source: rel(tier.file), ...(mirrorEntry ? { mirror: rel(mirrorEntry.tiers[i].file) } : {}), writable: tier.tier === "comp" });
  const binding = {
    schemaVersion: 1,
    projectId,
    apiPath: "/__code-layer",
    workspaceRoot: rel(workspaceRoot),
    stateDir: rel(stateDir),
    tokens: {
      prefix,
      entry: { source: rel(sourceEntry.file), ...(mirrorEntry ? { mirror: rel(mirrorEntry.file) } : {}) },
      tiers: sourceEntry.tiers.map(tierEntry),
      readonlySources: readonlySources.map(rel),
    },
    components: { roots: roots.map(rel), classPrefixes },
    checks: [],
    ...(componentSpecsDir ? { governance: { componentSpecsDir: rel(componentSpecsDir) } } : {}),
  };
  const validated = await validateBinding({ projectRoot: project, bindingFile, text: JSON.stringify(binding) });
  issues.push(...validated.issues);
  const ok = !issues.some((i) => i.severity === "error");
  return { ok, result: ok ? "proposed" : "refused", ...base, binding };
}

/** Validate a confirmed binding and create the project's binding file. Never replaces an existing one. */
export async function writeBinding({ projectRoot, from }) {
  const project = path.resolve(projectRoot);
  const issues = [];
  const base = { projectRoot: project, issues, written: [] };
  const where = locateProject(project);
  issues.push(...where.issues);
  if (issues.some((i) => i.severity === "error")) return { ok: false, result: "refused", ...base };
  const bindingFile = path.join(where.installDir, BINDING_NAME);
  const relative = posixRelative(project, bindingFile);
  if (fs.existsSync(bindingFile)) {
    issues.push(error("binding-exists", `${relative} already exists and is the project's: it is not replaced. Edit it by hand, or remove it yourself first`, { path: relative }));
    return { ok: false, result: "refused", ...base };
  }
  const source = path.resolve(from);
  if (!fs.existsSync(source)) {
    issues.push(error("binding-missing", `${source} does not exist`, { path: source }));
    return { ok: false, result: "refused", ...base };
  }
  const text = fs.readFileSync(source, "utf8");
  const validated = await validateBinding({ projectRoot: project, bindingFile, text });
  issues.push(...validated.issues);
  if (issues.some((i) => i.severity === "error")) return { ok: false, result: "refused", ...base };
  writeAtomic(bindingFile, text);
  return { ok: true, result: "written", ...base, written: [relative] };
}

function formatText(outcome) {
  const lines = [`storybook-code-layer · binding ${outcome.result} · ${outcome.projectRoot}`];
  if (outcome.binding) {
    lines.push("", "Proposed binding (code-layer.config.json):", JSON.stringify(outcome.binding, null, 2));
    lines.push("", "Evidence:");
    for (const item of outcome.evidence) lines.push(`  ${item.key} = ${JSON.stringify(item.value)}`, `      ${item.evidence}`);
    lines.push("", `Needs your confirmation (${outcome.needsConfirmation.length}):`);
    for (const item of outcome.needsConfirmation) {
      lines.push(`  ${item.key}: ${item.question}`, `      proposed: ${JSON.stringify(item.proposed)}`);
      if (item.options?.length) lines.push(`      options: ${item.options.map((o) => JSON.stringify(o)).join(" | ")}`);
      if (item.facts) lines.push(`      facts: ${JSON.stringify(item.facts)}`);
    }
    const listed = [...outcome.candidates.checks.map((c) => ["check", c]), ...outcome.candidates.postApply.map((c) => ["post-apply", c])];
    if (listed.length > 0) {
      lines.push("", "Candidates (listed only, not adopted):");
      for (const [kind, c] of listed) lines.push(`  ${kind}: ${c.command}   (${c.source})`, `      ${c.confirm}`, ...(c.entry ? [`      entry: ${JSON.stringify(c.entry)}`] : []));
    }
  }
  if (outcome.notes?.length) lines.push("", "Notes:", ...outcome.notes.map((note) => `  ${note}`));
  if (outcome.written?.length) lines.push("", `Wrote ${outcome.written.join(", ")}. It is the project's file from now on.`);
  if (outcome.issues.length > 0) {
    lines.push("", `Issues (${outcome.issues.length}):`);
    for (const issue of outcome.issues) lines.push(`  ${issue.severity.padEnd(7)} ${issue.code}: ${issue.message}`);
  }
  lines.push("", `result: ${outcome.result}`);
  if (outcome.result === "proposed") lines.push("Nothing was written. Go through the items above with the person who owns the project, save the confirmed binding to a file, then run this script again with --write <file>.");
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const parsed = parseDeriveArgs(argv);
  const wantsJson = argv.includes("--json");
  let outcome;
  if (!parsed.ok) outcome = { ok: false, result: "usage", projectRoot: null, issues: [error(parsed.error.code, parsed.error.message, parsed.error.flag ? { flag: parsed.error.flag } : {})] };
  else if (parsed.options.help) {
    process.stdout.write(`${DERIVE_USAGE}\n`);
    process.exit(0);
  } else {
    try {
      outcome = parsed.options.write ? await writeBinding({ projectRoot: parsed.options.projectRoot, from: parsed.options.write }) : await derive({ projectRoot: parsed.options.projectRoot });
    } catch (cause) {
      outcome = { ok: false, result: "failed", projectRoot: path.resolve(parsed.options.projectRoot), issues: [error("unexpected-error", cause.stack ?? cause.message)] };
    }
  }
  if (wantsJson) process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  else {
    process.stdout.write(formatText({ evidence: [], needsConfirmation: [], candidates: { checks: [], postApply: [] }, notes: [], ...outcome }));
    if (outcome.result === "usage") process.stdout.write(`${DERIVE_USAGE}\n`);
  }
  process.exit(outcome.ok ? 0 : outcome.result === "usage" ? 2 : 1);
}
