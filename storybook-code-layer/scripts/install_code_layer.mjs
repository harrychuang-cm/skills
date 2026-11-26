#!/usr/bin/env node
// Install, check, update or remove Code Layer in a Storybook (Vite) project.
//
//   node scripts/install_code_layer.mjs --project-root <storybook root> [--config <binding.json>] [--dry-run]
//   node scripts/install_code_layer.mjs --project-root <storybook root> --check
//   node scripts/install_code_layer.mjs --project-root <storybook root> --update [--dry-run] [--force-managed]
//   node scripts/install_code_layer.mjs --project-root <storybook root> --uninstall [--dry-run] [--force-managed]
//   add --json for one machine-readable object (stable `result` and `issues[].code`)
//
// What belongs to whom:
//   - the template files in .storybook/code-layer/ are managed: installed,
//     updated and removed by this script, tracked by INSTALL_RECEIPT.json;
//   - code-layer.config.json (the project binding) is the project's: an
//     existing one is never written; install copies one from --config only
//     when there is none (derive one with scripts/derive_binding.mjs);
//   - the state directory (journal, backups) is never touched.
//
// A run that finds a conflict or a failed prerequisite writes nothing. A run
// that fails while writing puts every file back.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { currentManifest } from "./build_template_manifest.mjs";
import { INSTALLER_USAGE, parseInstallerArgs } from "./lib/cli_args.mjs";
import { MANIFEST_FILE, TEMPLATE_DIR, sha256 } from "./lib/files.mjs";
import {
  BINDING_NAME,
  CONFIG_DIR_NAME,
  INSTALL_DIR_NAME,
  adoptKnownVersion,
  decideFiles,
  error,
  locateProject,
  platformIssues,
  posixRelative,
  stateBusyIssues,
  validateBinding,
  warning,
} from "./lib/plan.mjs";
import { RECEIPT_NAME, buildReceipt, compareVersions, readReceipt, sameReceipt, serializeReceipt } from "./lib/receipt.mjs";
import { removeEmptyDirs, runStaged } from "./lib/staging.mjs";
import { unwireMain, wireMain } from "./lib/wire_main.mjs";
import { unwireTsconfig, wireTsconfig } from "./lib/wire_tsconfig.mjs";

const OK_RESULTS = new Set(["installed", "updated", "uninstalled", "current", "planned", "complete"]);
const INSTALL_AT = `${CONFIG_DIR_NAME}/${INSTALL_DIR_NAME}`;

function finish(base, result, extra = {}) {
  return { ok: OK_RESULTS.has(result), result, ...base, ...extra };
}

const hasErrors = (issues) => issues.some((issue) => issue.severity === "error");

/**
 * AI requests on this machine, from files only: the binding's `agent` key and
 * the runner file written by enable_agent.mjs. No command is started (the
 * running Storybook also checks the tools' versions and options). Never an
 * installation problem: AI requests are optional.
 */
async function agentReadiness(config) {
  const { readRunnerFile, staticProblems } = await import(pathToFileURL(path.join(TEMPLATE_DIR, "server", "agent", "runners.mjs")).href);
  const read = readRunnerFile(config.stateDir);
  const problems = staticProblems(config, read);
  return {
    enabled: config.agent.enabled,
    ready: problems.length === 0,
    runners: read.state === "ok" ? read.data.runners.map((runner) => runner.label) : [],
    confirm: config.agent.confirm ?? null,
    problems,
  };
}

/**
 * Run one installer mode.
 * options: { projectRoot, mode: "install" | "check" | "update" | "uninstall", config?, dryRun?, forceManaged?, failAfter? }
 * `failAfter` is a test hook: fail after that many file operations (the run is rolled back).
 * Returns { ok, result, mode, dryRun, projectRoot, template, installed, actions, issues, written, restartRequired }.
 */
export async function run({ projectRoot, mode = "install", config = null, dryRun = false, forceManaged = false, failAfter = null }) {
  const project = path.resolve(projectRoot);
  const issues = [];
  const actions = [];
  /** Staged file operations, in the order they are performed. */
  const operations = [];
  const base = { mode, dryRun: Boolean(dryRun), projectRoot: project, template: null, installed: null, actions, issues, written: [], restartRequired: false };
  const refuse = () => finish(base, mode === "check" ? "incomplete" : "refused");
  const relative = (file) => posixRelative(project, file);
  const plan = (action, file, operation, note = null) => {
    actions.push({ action, path: relative(file), ...(note ? { note } : {}) });
    if (operation) operations.push(operation);
  };

  // The template this copy of the skill carries.
  const manifest = currentManifest();
  if (!manifest) {
    issues.push(error("manifest-stale", `${MANIFEST_FILE} is missing or does not match the template files; rebuild it with scripts/build_template_manifest.mjs`, { path: MANIFEST_FILE }));
    return refuse();
  }
  base.template = { name: manifest.name, version: manifest.version };

  const where = locateProject(project);
  issues.push(...where.issues);
  if (hasErrors(issues)) return refuse();
  const { installDir, mainFile, mainName } = where;
  const mainRelative = `${CONFIG_DIR_NAME}/${mainName}`;
  const mainSource = fs.readFileSync(mainFile, "utf8");
  const bindingFile = path.join(installDir, BINDING_NAME);
  const receiptFile = path.join(installDir, RECEIPT_NAME);

  let receipt = null;
  try {
    receipt = readReceipt(installDir);
  } catch (cause) {
    issues.push(error("receipt-invalid", cause.message, { path: relative(receiptFile) }));
    return refuse();
  }
  if (receipt) base.installed = { version: receipt.version, receiptSchema: receipt.sourceSchema };

  // ---- uninstall ----------------------------------------------------------
  if (mode === "uninstall") {
    if (!receipt) {
      issues.push(error("receipt-missing", `${relative(receiptFile)} was not found: without a receipt the installer cannot tell its files from the project's, and removes nothing`, { path: relative(receiptFile) }));
      return refuse();
    }
    if (fs.existsSync(bindingFile)) {
      const binding = await validateBinding({ projectRoot: project, bindingFile, text: fs.readFileSync(bindingFile, "utf8") });
      if (binding.config) issues.push(...(await stateBusyIssues(binding.config)));
      else issues.push(warning("lock-unverified", "the project binding could not be read, so the write lock of a running dev server could not be checked"));
    }
    if (receipt.sourceSchema === 1) {
      issues.push(warning("receipt-v1", `this installation was made by template ${receipt.version}, whose receipt does not record the wiring it added: only the preset element is removed; an \`import { resolve } from "node:path"\` and a tsconfig exclude entry are left for you to review`));
    }
    const unwired = unwireMain(mainSource, { fileName: mainRelative, removeResolveImport: receipt.wiring.main.addedResolveImport === true });
    if (unwired.status === "removed") plan("unwire-main", mainFile, { kind: "write", target: mainFile, data: Buffer.from(unwired.source) }, unwired.notes.join("; "));
    const tsconfigFile = path.join(project, "tsconfig.json");
    if (receipt.wiring.tsconfig === "added" && fs.existsSync(tsconfigFile)) {
      const result = unwireTsconfig(fs.readFileSync(tsconfigFile, "utf8"), { configDirName: CONFIG_DIR_NAME });
      if (result.status === "removed") plan("unwire-tsconfig", tsconfigFile, { kind: "write", target: tsconfigFile, data: Buffer.from(result.source) }, result.notes.join("; "));
    }
    const decided = decideFiles({ installDir, manifest, recorded: receipt.files, mode, forceManaged });
    issues.push(...decided.issues);
    for (const item of decided.actions) {
      const target = path.join(installDir, item.relative);
      plan("delete", target, { kind: "delete", target }, item.forced ? "locally modified; removed because of --force-managed" : null);
    }
    plan("delete-receipt", receiptFile, { kind: "delete", target: receiptFile });
    if (hasErrors(issues)) return refuse();
    if (dryRun) return finish(base, "planned");
    try {
      runStaged(operations, { stagingParent: path.dirname(installDir), failAfter });
    } catch (cause) {
      issues.push(error(cause.code ?? "write-failed", `${cause.message}. Every file was put back.`));
      return finish(base, "failed");
    }
    removeEmptyDirs(installDir);
    return finish(base, "uninstalled", { written: actions.map((a) => a.path), restartRequired: true });
  }

  // ---- install, update, check ---------------------------------------------
  issues.push(...platformIssues({ projectRoot: project, mainSource, mainName, previewFiles: where.previewFiles }));

  // The project binding: kept when it exists, copied from --config when there is none, never generated.
  let bindingText = null;
  if (fs.existsSync(bindingFile)) {
    bindingText = fs.readFileSync(bindingFile, "utf8");
    if (config && fs.readFileSync(path.resolve(config), "utf8") !== bindingText) {
      issues.push(warning("binding-kept", `${relative(bindingFile)} already exists and is kept; --config was ignored`, { path: relative(bindingFile) }));
    }
  } else if (config && mode === "install") {
    const from = path.resolve(config);
    if (!fs.existsSync(from)) issues.push(error("binding-missing", `--config ${from} does not exist`, { path: from }));
    else {
      bindingText = fs.readFileSync(from, "utf8");
      plan("write-binding", bindingFile, { kind: "write", target: bindingFile, data: Buffer.from(bindingText) }, "copied from --config; the file is the project's from now on");
    }
  } else {
    issues.push(
      error("binding-missing", `${relative(bindingFile)} does not exist. Propose one with scripts/derive_binding.mjs --project-root <storybook root>, confirm it, then write it with --write (or pass it to install with --config)`, { path: relative(bindingFile) }),
    );
  }
  let bindingConfig = null;
  if (bindingText !== null) {
    const binding = await validateBinding({ projectRoot: project, bindingFile, text: bindingText });
    issues.push(...binding.issues);
    bindingConfig = binding.config;
  }

  // Managed files: the three-way decision.
  let recorded = receipt?.files ?? null;
  let adopted = null;
  if (!receipt) {
    adopted = adoptKnownVersion(installDir);
    if (adopted) {
      recorded = adopted.files;
      base.installed = { version: adopted.version, receiptSchema: null };
      if (mode !== "check") issues.push(warning("adopted-without-receipt", `the files in ${INSTALL_AT} equal template ${adopted.version} and there is no receipt: they are treated as installed by Code Layer`));
    }
  }
  const installedVersion = receipt?.version ?? adopted?.version ?? null;
  if (installedVersion && compareVersions(installedVersion, manifest.version) > 0) {
    issues.push(error("newer-installation", `the project has Code Layer ${installedVersion}, newer than this template (${manifest.version}); use a newer copy of the skill`));
    return refuse();
  }
  const decided = decideFiles({ installDir, manifest, recorded, mode, forceManaged });

  // Wiring: tsconfig exclude, then the preset in the main config.
  let tsconfigState = "not-needed";
  let tsconfigPending = null;
  const tsconfigFile = path.join(project, "tsconfig.json");
  if (fs.existsSync(tsconfigFile)) {
    try {
      const wired = wireTsconfig(fs.readFileSync(tsconfigFile, "utf8"), { configDirName: CONFIG_DIR_NAME });
      if (wired.status === "added") {
        tsconfigState = "added";
        tsconfigPending = wired;
      } else if (wired.status === "present") tsconfigState = receipt?.wiring.tsconfig === "added" ? "added" : "present";
      else tsconfigState = wired.status;
      if (wired.status === "manual") issues.push(warning("tsconfig-manual", wired.notes.join("; "), { path: "tsconfig.json" }));
    } catch (cause) {
      issues.push(error("tsconfig-unreadable", `tsconfig.json could not be read: ${cause.message}`, { path: "tsconfig.json" }));
    }
  }
  let mainPending = null;
  const mainWiring = { file: mainRelative, addedElement: receipt?.wiring.main.addedElement === true, addedResolveImport: receipt?.wiring.main.addedResolveImport === true };
  try {
    const wired = wireMain(mainSource, { fileName: mainRelative, configDirName: CONFIG_DIR_NAME });
    if (wired.status === "added") {
      mainPending = wired;
      mainWiring.addedElement = true;
      mainWiring.addedResolveImport = wired.addedResolveImport;
    }
  } catch (cause) {
    issues.push(error("main-wiring-failed", cause.message, { path: mainRelative }));
  }

  const files = Object.fromEntries(manifest.files.map((file) => [file.path, file.sha256]));
  const nextReceipt = buildReceipt({ manifest, manifestSha256: sha256(fs.readFileSync(MANIFEST_FILE)), files, wiring: { main: mainWiring, tsconfig: tsconfigState }, installedAt: receipt?.installedAt ?? null });
  const receiptCurrent = receipt !== null && receipt.sourceSchema === 2 && sameReceipt(receipt, nextReceipt);

  // ---- check: read-only report --------------------------------------------
  if (mode === "check") {
    issues.push(...decided.issues.filter((issue) => issue.severity === "warning"));
    for (const item of decided.actions) {
      const at = `${INSTALL_AT}/${item.relative}`;
      if (item.action === "install") issues.push(error("file-missing", `${at} is missing`, { path: at }));
      else if (item.action === "update") issues.push(error("file-differs", `${at} is from another template version (run --update)`, { path: at }));
      else issues.push(error("file-obsolete", `${at} is no longer part of the template (run --update)`, { path: at }));
    }
    for (const issue of decided.issues.filter((i) => i.severity === "error")) issues.push(error("file-differs", issue.message, { path: issue.path }));
    if (!receipt) issues.push(error("receipt-missing", `${relative(receiptFile)} was not found: this installation was not made (or not finished) by the installer`, { path: relative(receiptFile) }));
    else if (!receiptCurrent) issues.push(error("receipt-mismatch", `${relative(receiptFile)} records template ${receipt.version}${receipt.sourceSchema === 1 ? " (receipt format 1)" : ""}; it does not describe this installation (run --update)`, { path: relative(receiptFile) }));
    if (mainPending) issues.push(error("wiring-missing", `${mainRelative} does not list the Code Layer preset in its addons array`, { path: mainRelative }));
    if (tsconfigPending) issues.push(error("wiring-missing", `tsconfig.json includes ${INSTALL_AT}/ in the project's own type check; it should exclude "${tsconfigPending.entry}"`, { path: "tsconfig.json" }));
    if (bindingConfig) base.agent = await agentReadiness(bindingConfig);
    return finish(base, hasErrors(issues) ? "incomplete" : "complete");
  }

  // ---- install / update: plan -----------------------------------------------
  issues.push(...decided.issues);
  const copyOf = (rel) => fs.readFileSync(path.join(TEMPLATE_DIR, rel));
  const fileOperations = [];
  for (const item of decided.actions) {
    const target = path.join(installDir, item.relative);
    if (item.action === "delete") fileOperations.push({ plan: ["delete", target, { kind: "delete", target }, item.forced ? "locally modified; removed because of --force-managed" : "no longer part of the template"] });
    else fileOperations.push({ plan: [item.action, target, { kind: "write", target, data: copyOf(item.relative) }, item.forced ? "locally modified; overwritten because of --force-managed" : null] });
  }
  if (mode === "install" && decided.actions.some((item) => item.action !== "install")) {
    issues.push(error("update-required", `Code Layer ${installedVersion ?? "(an older version)"} is installed and this template is ${manifest.version}: run again with --update (try --update --dry-run first)`));
  }
  if (mode === "install" && decided.issues.some((issue) => issue.code === "managed-target-collision") && adopted) {
    issues.push(error("update-required", `the files in ${INSTALL_AT} are Code Layer ${adopted.version} without a receipt: run again with --update to adopt and update them`));
  }
  if (mode === "update" && !receipt && !adopted && fs.existsSync(installDir) && decided.issues.some((issue) => issue.code === "managed-target-collision")) {
    issues.push(error("receipt-missing", `${INSTALL_AT} has files that differ from the template, no receipt, and they match no released version: the installer cannot tell which of them are yours`));
  }
  if (mode === "update" && bindingConfig) issues.push(...(await stateBusyIssues(bindingConfig)));

  // Order: template files, the binding (already planned), tsconfig, the preset, the receipt last.
  const bindingAction = actions.splice(0);
  const bindingOperation = operations.splice(0);
  for (const item of fileOperations) plan(...item.plan);
  actions.push(...bindingAction);
  operations.push(...bindingOperation);
  if (tsconfigPending) plan("wire-tsconfig", tsconfigFile, { kind: "write", target: tsconfigFile, data: Buffer.from(tsconfigPending.source) }, tsconfigPending.notes.join("; "));
  if (mainPending) plan("wire-main", mainFile, { kind: "write", target: mainFile, data: Buffer.from(mainPending.source) }, mainPending.notes.join("; "));
  if (!receiptCurrent) {
    const text = serializeReceipt({ ...nextReceipt, installedAt: new Date().toISOString() });
    plan("write-receipt", receiptFile, { kind: "write", target: receiptFile, data: Buffer.from(text) }, receipt ? `records template ${manifest.version} (was ${receipt.version})` : null);
  }

  if (hasErrors(issues)) return refuse();
  if (actions.length === 0) return finish(base, "current");
  if (dryRun) return finish(base, "planned");
  try {
    runStaged(operations, { stagingParent: path.dirname(installDir), failAfter });
  } catch (cause) {
    issues.push(error(cause.code ?? "write-failed", `${cause.message}. Every file was put back.`));
    return finish(base, "failed");
  }
  if (mode === "update") removeEmptyDirs(installDir);
  const onlyReceipt = actions.every((a) => a.action === "write-receipt");
  return finish(base, mode === "update" ? "updated" : "installed", { written: actions.map((a) => a.path), restartRequired: !onlyReceipt });
}

const RESULT_TEXT = {
  installed: "Code Layer is installed",
  updated: "Code Layer is updated",
  uninstalled: "Code Layer is removed",
  current: "nothing to write",
  planned: "dry run, nothing was written",
  complete: "the installation is complete",
  incomplete: "the installation is not complete",
  refused: "nothing was written",
  failed: "every file was put back",
  usage: "nothing was done",
};

/** The same information as the JSON object, for people. */
export function formatText(outcome) {
  const lines = [];
  const template = outcome.template ? `${outcome.template.name} ${outcome.template.version}` : "storybook-code-layer";
  lines.push(`${template} · ${outcome.mode}${outcome.dryRun ? " (dry run)" : ""} · ${outcome.projectRoot ?? ""}`.trimEnd());
  if (outcome.installed) lines.push(`installed: ${outcome.installed.version}${outcome.installed.receiptSchema === null ? " (no receipt)" : outcome.installed.receiptSchema === 1 ? " (receipt format 1)" : ""}`);
  if (outcome.actions?.length > 0) {
    lines.push(`actions (${outcome.actions.length}):`);
    for (const action of outcome.actions) lines.push(`  ${action.action.padEnd(15)} ${action.path}${action.note ? `  — ${action.note}` : ""}`);
  }
  if (outcome.issues?.length > 0) {
    lines.push(`issues (${outcome.issues.length}):`);
    for (const issue of outcome.issues) lines.push(`  ${issue.severity.padEnd(7)} ${issue.code}: ${issue.message}`);
  }
  if (outcome.agent) {
    const agent = outcome.agent;
    if (!agent.enabled) lines.push("AI requests: off (the binding has no \"agent\": { \"enabled\": true })");
    else if (agent.ready) lines.push(`AI requests: ready as far as files go (${agent.runners.join(" → ")}; confirmation ${agent.confirm ?? "default"}); the running Storybook also checks each tool's version and options`);
    else lines.push(`AI requests: not ready — ${agent.problems.map((p) => `${p.code}${p.runner ? ` (${p.runner})` : ""}: ${p.detail ?? ""}`).join("; ")}`);
  }
  lines.push(`result: ${outcome.result} — ${RESULT_TEXT[outcome.result] ?? outcome.result}`);
  if (outcome.restartRequired) lines.push("Restart Storybook: changes to the preset, the dev server and the manager are not hot-updated.");
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const parsed = parseInstallerArgs(argv);
  const wantsJson = argv.includes("--json");
  let outcome;
  if (!parsed.ok) {
    outcome = { ok: false, result: "usage", mode: null, dryRun: false, projectRoot: null, template: null, installed: null, actions: [], issues: [error(parsed.error.code, parsed.error.message, parsed.error.flag ? { flag: parsed.error.flag } : {})], written: [], restartRequired: false };
  } else if (parsed.options.help) {
    process.stdout.write(`${INSTALLER_USAGE}\n`);
    process.exit(0);
  } else {
    try {
      outcome = await run(parsed.options);
    } catch (cause) {
      outcome = { ok: false, result: "failed", mode: parsed.options.mode, dryRun: parsed.options.dryRun, projectRoot: path.resolve(parsed.options.projectRoot), template: null, installed: null, actions: [], issues: [error("unexpected-error", cause.stack ?? cause.message)], written: [], restartRequired: false };
    }
  }
  if (wantsJson) process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  else {
    process.stdout.write(formatText({ ...outcome, mode: outcome.mode ?? "install" }));
    if (outcome.result === "usage") process.stdout.write(`${INSTALLER_USAGE}\n`);
  }
  process.exit(outcome.ok ? 0 : outcome.result === "usage" ? 2 : 1);
}
