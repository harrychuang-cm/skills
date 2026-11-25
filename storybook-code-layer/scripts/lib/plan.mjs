// Planning helpers of the installer: everything here reads, nothing writes.
// A plan is a list of actions (what a run would do) and issues (why it may
// not); the caller decides whether to perform it.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { PROJECT_OWNED, TEMPLATE_DIR, TEMPLATE_ROOT, listFiles, sha256 } from "./files.mjs";

export const CONFIG_DIR_NAME = ".storybook";
export const INSTALL_DIR_NAME = "code-layer";
export const BINDING_NAME = "code-layer.config.json";
export const KNOWN_MANIFESTS_FILE = path.join(TEMPLATE_ROOT, "KNOWN_MANIFESTS.json");
const MAIN_NAMES = ["main.ts", "main.mts", "main.js", "main.mjs", "main.cjs"];
const PREVIEW_NAMES = ["preview.ts", "preview.tsx", "preview.js", "preview.jsx", "preview.mjs", "preview.mts"];

export const error = (code, message, extra = {}) => ({ severity: "error", code, message, ...extra });
export const warning = (code, message, extra = {}) => ({ severity: "warning", code, message, ...extra });

export function posixRelative(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

export function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** File hashes of every released template version (for adopting an installation that has no receipt). */
export function knownManifests() {
  try {
    const parsed = JSON.parse(fs.readFileSync(KNOWN_MANIFESTS_FILE, "utf8"));
    return Array.isArray(parsed.versions) ? parsed.versions.filter((v) => v && typeof v.version === "string" && v.files && typeof v.files === "object") : [];
  } catch {
    return [];
  }
}

/** Where things are in the project. `issues` is non-empty when it is not a Storybook project this installer can work on. */
export function locateProject(projectRoot) {
  const issues = [];
  const configDir = path.join(projectRoot, CONFIG_DIR_NAME);
  const installDir = path.join(configDir, INSTALL_DIR_NAME);
  if (!fs.existsSync(path.join(projectRoot, "package.json"))) {
    issues.push(error("not-a-storybook-project", `${projectRoot} has no package.json: pass the Storybook project root (the folder that holds ${CONFIG_DIR_NAME}/)`));
    return { issues, configDir, installDir, mainFile: null, mainName: null, previewFiles: [] };
  }
  const mainName = MAIN_NAMES.find((name) => fs.existsSync(path.join(configDir, name))) ?? null;
  if (!mainName) {
    issues.push(error("main-config-missing", `${CONFIG_DIR_NAME}/main.(ts|mts|js|mjs|cjs) was not found in ${projectRoot}`));
    return { issues, configDir, installDir, mainFile: null, mainName: null, previewFiles: [] };
  }
  const previewFiles = PREVIEW_NAMES.map((name) => path.join(configDir, name)).filter((file) => fs.existsSync(file));
  let symlink = false;
  try {
    symlink = fs.lstatSync(installDir).isSymbolicLink();
  } catch {
    symlink = false;
  }
  if (symlink) {
    issues.push(error("install-dir-symlink", `${CONFIG_DIR_NAME}/${INSTALL_DIR_NAME} is a symbolic link: the installer only writes and deletes inside a real directory`, { path: `${CONFIG_DIR_NAME}/${INSTALL_DIR_NAME}` }));
  }
  return { issues, configDir, installDir, mainFile: path.join(configDir, mainName), mainName, previewFiles };
}

/** Vite-based framework, no CSF factories; the Storybook version is only reported. */
export function platformIssues({ projectRoot, mainSource, mainName, previewFiles }) {
  const issues = [];
  if (!/@storybook\/[\w-]*-vite|@storybook\/builder-vite/.test(mainSource)) {
    issues.push(error("not-vite-builder", `${CONFIG_DIR_NAME}/${mainName} does not use a Vite-based framework; Code Layer's dev API is a Vite plugin`, { path: `${CONFIG_DIR_NAME}/${mainName}` }));
  }
  if (/\bdefineMain\s*\(/.test(mainSource)) {
    issues.push(error("csf-factories", `${CONFIG_DIR_NAME}/${mainName} uses CSF factories (defineMain); Storybook then ignores preview annotations contributed by presets, which Code Layer needs`, { path: `${CONFIG_DIR_NAME}/${mainName}` }));
  }
  for (const file of previewFiles) {
    if (/\bdefinePreview\s*\(/.test(fs.readFileSync(file, "utf8"))) {
      const relative = posixRelative(projectRoot, file);
      issues.push(error("csf-factories", `${relative} uses CSF factories (definePreview); Storybook then ignores preview annotations contributed by presets, which Code Layer needs`, { path: relative }));
    }
  }
  try {
    const version = JSON.parse(fs.readFileSync(path.join(projectRoot, "node_modules", "storybook", "package.json"), "utf8")).version;
    if (Number(String(version).split(".")[0]) !== 10) issues.push(warning("storybook-version-unverified", `Storybook ${version}: Code Layer has only been verified with 10.x`));
  } catch {
    issues.push(warning("storybook-version-unverified", "node_modules/storybook was not found (dependencies not installed?); the Storybook version could not be checked"));
  }
  return issues;
}

async function loadResolveConfig() {
  const module = await import(pathToFileURL(path.join(TEMPLATE_DIR, "server", "config.mjs")).href);
  return module.resolveConfig;
}

/**
 * Validate binding text against the template being installed and check that
 * what it points at exists. Returns { issues, config } (config is null when invalid).
 */
export async function validateBinding({ projectRoot, bindingFile, text }) {
  const issues = [];
  let config = null;
  try {
    const resolveConfig = await loadResolveConfig();
    config = resolveConfig(JSON.parse(text), { projectRoot, configFile: bindingFile });
  } catch (cause) {
    issues.push(error("binding-invalid", `the project binding is not valid for this template: ${cause.message}`, { path: posixRelative(projectRoot, bindingFile) }));
    return { issues, config: null };
  }
  if (isInside(config.stateDir, projectRoot)) {
    issues.push(
      error("state-dir-inside-project", `stateDir (${config.stateDir}) is inside the Storybook project root: journals and backups would be served by the dev server. Point it outside, for example at <workspaceRoot>/.code-layer`),
    );
  }
  const mustExist = [
    config.tokens.entry.source,
    config.tokens.entry.mirror,
    ...config.tokens.tiers.flatMap((tier) => [tier.source, tier.mirror]),
    ...config.tokens.readonlySources,
    ...config.components.roots,
    config.governance?.componentSpecsDir ?? null,
    ...(config.postApply ?? []).map((command) => command.cwd),
  ].filter(Boolean);
  for (const target of new Set(mustExist)) {
    if (!fs.existsSync(target)) issues.push(error("binding-path-missing", `the binding refers to a path that does not exist: ${target}`, { path: target }));
  }
  for (const check of config.checks) {
    const script = check.args.find((arg) => /\.(m?js|cjs)$/.test(arg) && path.isAbsolute(arg));
    if (script && !fs.existsSync(script)) issues.push(warning("check-script-missing", `the script of check "${check.id}" does not exist (${script}); token changes will be refused until it does`, { path: script }));
  }
  return { issues, config };
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return cause.code === "EPERM";
  }
}

/** A running dev server holds the write lock; an unfinished journal entry needs its recovery first. */
export async function stateBusyIssues(config) {
  const issues = [];
  const lockFile = path.join(config.stateDir, "lock.json");
  if (fs.existsSync(lockFile)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
      if (Number.isInteger(lock.pid) && lock.pid !== process.pid && pidAlive(lock.pid)) {
        issues.push(error("write-lock-held", `Code Layer's write lock is held by process ${lock.pid} (a running Storybook dev server?): stop it first`, { path: lockFile }));
      }
    } catch {
      // An unreadable lock is taken over by the next dev server; it does not block the installer.
    }
  }
  if (fs.existsSync(path.join(config.stateDir, "journal.jsonl"))) {
    try {
      const { Journal } = await import(pathToFileURL(path.join(TEMPLATE_DIR, "server", "journal.mjs")).href);
      if (new Journal(config.stateDir).unfinished().length > 0) {
        issues.push(error("journal-needs-recovery", "Code Layer's journal has a write that never finished: start Storybook once (it recovers on start) or run the Code Layer CLI `recover`, then try again", { path: path.join(config.stateDir, "journal.jsonl") }));
      }
    } catch (cause) {
      issues.push(warning("journal-unreadable", `the journal could not be read (${cause.message}); it was not checked for unfinished writes`));
    }
  }
  return issues;
}

/**
 * An installation without a receipt whose files equal a released template
 * version is treated as that version's. Every file present that the version
 * lists must be identical to it; files the version does not list are judged
 * separately. Returns { version, files } or null.
 */
export function adoptKnownVersion(installDir) {
  const present = listFiles(installDir).filter((relative) => !PROJECT_OWNED.has(relative));
  if (present.length === 0) return null;
  const hashes = new Map(present.map((relative) => [relative, sha256(path.join(installDir, relative))]));
  let best = null;
  for (const candidate of knownManifests()) {
    const listed = present.filter((relative) => Object.hasOwn(candidate.files, relative));
    if (listed.length === 0 || !listed.every((relative) => hashes.get(relative) === candidate.files[relative])) continue;
    if (!best || listed.length > best.matched) best = { version: candidate.version, files: candidate.files, matched: listed.length };
  }
  return best ? { version: best.version, files: best.files } : null;
}

/**
 * The three-way decision per managed file: the new template (T), what the
 * receipt recorded (R) and the file as it is (C).
 * `recorded` is the receipt's (or the adopted version's) path → hash map, or null.
 * Returns { actions: [{ action: "install" | "update" | "delete", relative, forced? }], issues }.
 */
export function decideFiles({ installDir, manifest, recorded, mode, forceManaged }) {
  const actions = [];
  const issues = [];
  const at = (relative) => `${CONFIG_DIR_NAME}/${INSTALL_DIR_NAME}/${relative}`;
  const template = new Map(manifest.files.map((file) => [file.path, file.sha256]));
  const present = listFiles(installDir).filter((relative) => !PROJECT_OWNED.has(relative));
  const current = (relative) => sha256(path.join(installDir, relative));
  const modified = (relative) => error("locally-modified-managed-file", `${at(relative)} was changed after it was installed; keep your change elsewhere and restore the file, or pass --force-managed to discard the change`, { path: at(relative) });

  if (mode === "uninstall") {
    for (const [relative, r] of Object.entries(recorded ?? {})) {
      if (!fs.existsSync(path.join(installDir, relative))) continue;
      const same = current(relative) === r;
      if (same || forceManaged) actions.push({ action: "delete", relative, forced: !same });
      else issues.push(modified(relative));
    }
    for (const relative of present) {
      if (!Object.hasOwn(recorded ?? {}, relative)) issues.push(warning("unmanaged-file", `${at(relative)} was not installed by Code Layer; it is left in place`, { path: at(relative) }));
    }
    return { actions, issues };
  }

  for (const [relative, t] of template) {
    if (!fs.existsSync(path.join(installDir, relative))) {
      actions.push({ action: "install", relative });
      continue;
    }
    const c = current(relative);
    if (c === t) continue;
    const r = recorded && Object.hasOwn(recorded, relative) ? recorded[relative] : null;
    if (r === null) {
      issues.push(error("managed-target-collision", `${at(relative)} exists, differs from the template, and no receipt says Code Layer installed it; move it away first`, { path: at(relative) }));
    } else if (c === r) actions.push({ action: "update", relative });
    else if (forceManaged) actions.push({ action: "update", relative, forced: true });
    else issues.push(modified(relative));
  }
  for (const relative of present) {
    if (template.has(relative)) continue;
    const r = recorded && Object.hasOwn(recorded, relative) ? recorded[relative] : null;
    if (r === null) {
      issues.push(warning("unmanaged-file", `${at(relative)} is not part of the template; it is left in place`, { path: at(relative) }));
      continue;
    }
    const same = current(relative) === r;
    if (same || forceManaged) actions.push({ action: "delete", relative, forced: !same });
    else issues.push(modified(relative));
  }
  return { actions, issues };
}
