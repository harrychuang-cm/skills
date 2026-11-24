#!/usr/bin/env node
// Install Code Layer into a Storybook (React + Vite) project.
//
//   node scripts/install_code_layer.mjs --project <storybook root> [--config <file>]
//   node scripts/install_code_layer.mjs --project <storybook root> --dry-run
//   node scripts/install_code_layer.mjs --project <storybook root> --check
//
// Proof-phase scope: install, --dry-run, --check. No --update / --uninstall
// and no binding derivation: the project binding (code-layer.config.json) is
// kept when it exists, copied from --config otherwise, and never generated.
//
// Order of writes (only after every check passed): template files, project
// binding, tsconfig.json exclude, main config preset entry, INSTALL_RECEIPT.json.
// The preset is wired last so Storybook never points at a half-copied addon.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { currentManifest } from "./build_template_manifest.mjs";
import { MANIFEST_FILE, PROJECT_OWNED, TEMPLATE_DIR, listFiles, sha256, writeAtomic } from "./lib/files.mjs";
import { wireMain } from "./lib/wire_main.mjs";
import { wireTsconfig } from "./lib/wire_tsconfig.mjs";

const CONFIG_DIR_NAME = ".storybook";
const MAIN_NAMES = ["main.ts", "main.mts", "main.js", "main.mjs", "main.cjs"];
const PREVIEW_NAMES = ["preview.ts", "preview.tsx", "preview.js", "preview.jsx", "preview.mjs", "preview.mts"];
const RECEIPT = "INSTALL_RECEIPT.json";
const CONFIG = "code-layer.config.json";

function rel(project, file) {
  return path.relative(project, file).split(path.sep).join("/");
}

function inside(child, parent) {
  const r = path.relative(parent, child);
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
}

async function loadResolveConfig() {
  const mod = await import(pathToFileURL(path.join(TEMPLATE_DIR, "server", "config.mjs")).href);
  return mod.resolveConfig;
}

/**
 * Work out everything an install would do, without writing.
 * @returns {Promise<{ problems: string[], warnings: string[], actions: Array<{ kind: string, target: string, data: Buffer, note: string }>, state: object }>}
 */
export async function planInstall({ project, configFrom = null }) {
  const problems = [];
  const warnings = [];
  const actions = [];
  const state = { project, version: null, files: {}, configSha: null, main: null, tsconfig: null, storybookVersion: null };

  if (!fs.existsSync(path.join(project, "package.json"))) {
    problems.push(`${project} 不是 Storybook 專案根目錄（找不到 package.json）。`);
    return { problems, warnings, actions, state };
  }
  const configDir = path.join(project, CONFIG_DIR_NAME);
  const mainName = MAIN_NAMES.find((n) => fs.existsSync(path.join(configDir, n)));
  if (!mainName) {
    problems.push(`找不到 ${CONFIG_DIR_NAME}/main.(ts|mts|js|mjs|cjs)。`);
    return { problems, warnings, actions, state };
  }
  const mainFile = path.join(configDir, mainName);
  const mainSource = fs.readFileSync(mainFile, "utf8");

  const manifest = currentManifest();
  if (!manifest) {
    problems.push(`模板清單 ${MANIFEST_FILE} 不存在或與模板不一致；請先執行 scripts/build_template_manifest.mjs。`);
    return { problems, warnings, actions, state };
  }
  state.version = manifest.version;

  // Platform: Vite builder, no CSF factories.
  if (!/@storybook\/[\w-]*-vite|@storybook\/builder-vite/.test(mainSource)) {
    problems.push(`${CONFIG_DIR_NAME}/${mainName} 沒有使用 Vite builder；Code Layer 的 dev API 是 Vite plugin。`);
  }
  for (const name of PREVIEW_NAMES) {
    const file = path.join(configDir, name);
    if (fs.existsSync(file) && /\bdefinePreview\s*\(/.test(fs.readFileSync(file, "utf8"))) {
      problems.push(`${CONFIG_DIR_NAME}/${name} 使用 CSF factories（definePreview）；Storybook 會忽略 previewAnnotations，驗證階段不支援。`);
    }
  }
  try {
    const sbPkg = JSON.parse(fs.readFileSync(path.join(project, "node_modules", "storybook", "package.json"), "utf8"));
    state.storybookVersion = sbPkg.version;
    if (Number(String(sbPkg.version).split(".")[0]) !== 10) warnings.push(`Storybook ${sbPkg.version}：Code Layer 只在 10.x 驗證過。`);
  } catch {
    warnings.push("找不到 node_modules/storybook（還沒 npm install？）；無法確認 Storybook 版本。");
  }

  // Template files.
  const dest = path.join(configDir, "code-layer");
  for (const file of manifest.files) {
    const target = path.join(dest, file.path);
    state.files[file.path] = file.sha256;
    if (!fs.existsSync(target)) {
      actions.push({ kind: "copy", target, data: fs.readFileSync(path.join(TEMPLATE_DIR, file.path)), note: `新增 ${rel(project, target)}` });
    } else if (sha256(target) !== file.sha256) {
      problems.push(`${rel(project, target)} 與模板 ${manifest.version} 不同（驗證階段沒有 --update，不覆蓋）。`);
    }
  }
  const known = new Set([...manifest.files.map((f) => f.path), ...PROJECT_OWNED]);
  for (const extra of listFiles(dest).filter((f) => !known.has(f))) {
    warnings.push(`${rel(project, path.join(dest, extra))} 不屬於模板（保留不動）。`);
  }

  // Project binding.
  const configTarget = path.join(dest, CONFIG);
  let configText = null;
  if (fs.existsSync(configTarget)) {
    configText = fs.readFileSync(configTarget);
    if (configFrom && !fs.readFileSync(configFrom).equals(configText)) {
      warnings.push(`已有 ${rel(project, configTarget)}，保留既有設定（忽略 --config）。`);
    }
  } else if (configFrom) {
    configText = fs.readFileSync(configFrom);
    actions.push({ kind: "config", target: configTarget, data: configText, note: `新增專案綁定 ${rel(project, configTarget)}（來自 --config）` });
  } else {
    problems.push(`需要專案綁定設定 ${rel(project, configTarget)}；驗證階段不自動推導，請用 --config <file> 提供。`);
  }
  if (configText) {
    state.configSha = sha256(configText);
    try {
      const resolveConfig = await loadResolveConfig();
      const config = resolveConfig(JSON.parse(configText.toString("utf8")), { projectRoot: project, configFile: configTarget });
      if (inside(config.stateDir, project)) {
        problems.push(`stateDir（${config.stateDir}）必須在 Storybook 專案（Vite root）之外，journal 與備份才不會被提供出去。`);
      }
      const mustExist = [
        config.tokens.entry.source,
        config.tokens.entry.mirror,
        ...config.tokens.tiers.flatMap((t) => [t.source, t.mirror]),
        ...config.tokens.readonlySources,
        ...config.components.roots,
      ].filter(Boolean);
      for (const file of mustExist) if (!fs.existsSync(file)) problems.push(`設定指到的路徑不存在：${file}`);
      for (const check of config.checks) {
        const script = check.args.find((a) => /\.(m?js|cjs)$/.test(a) && path.isAbsolute(a));
        if (script && !fs.existsSync(script)) warnings.push(`檢查 ${check.id} 的腳本不存在：${script}（token 套用會被停用）。`);
      }
    } catch (error) {
      problems.push(`專案綁定設定無效：${error.message}`);
    }
  }

  // tsconfig.json exclude.
  const tsconfigFile = path.join(project, "tsconfig.json");
  if (fs.existsSync(tsconfigFile)) {
    try {
      const wired = wireTsconfig(fs.readFileSync(tsconfigFile, "utf8"), { configDirName: CONFIG_DIR_NAME });
      state.tsconfig = wired.status === "added" || wired.status === "present" ? "excluded" : wired.status;
      if (wired.status === "added") actions.push({ kind: "tsconfig", target: tsconfigFile, data: Buffer.from(wired.source), note: wired.notes.join("；") });
      if (wired.status === "manual") warnings.push(...wired.notes);
    } catch (error) {
      problems.push(`無法讀取 tsconfig.json：${error.message}`);
    }
  } else {
    state.tsconfig = "no-tsconfig";
  }

  // main config preset entry.
  try {
    const wired = wireMain(mainSource, { fileName: `${CONFIG_DIR_NAME}/${mainName}`, configDirName: CONFIG_DIR_NAME });
    state.main = { file: `${CONFIG_DIR_NAME}/${mainName}`, wired: true };
    if (wired.status === "added") actions.push({ kind: "main", target: mainFile, data: Buffer.from(wired.source), note: wired.notes.join("；") });
  } catch (error) {
    problems.push(error.message);
    state.main = { file: `${CONFIG_DIR_NAME}/${mainName}`, wired: false };
  }

  // Receipt (only rewritten when its content would change).
  const receipt = {
    schemaVersion: 1,
    name: manifest.name,
    version: manifest.version,
    manifestSha256: sha256(fs.readFileSync(MANIFEST_FILE)),
    files: state.files,
    config: { file: CONFIG, sha256: state.configSha },
    wiring: { main: state.main, tsconfig: state.tsconfig },
  };
  const receiptFile = path.join(dest, RECEIPT);
  const existingReceipt = fs.existsSync(receiptFile) ? safeJson(fs.readFileSync(receiptFile, "utf8")) : null;
  const { installedAt: _ignored, ...existingComparable } = existingReceipt ?? {};
  state.receipt = { file: receiptFile, exists: Boolean(existingReceipt), current: JSON.stringify(existingComparable) === JSON.stringify(receipt) };
  if (!state.receipt.current) {
    actions.push({
      kind: "receipt",
      target: receiptFile,
      data: Buffer.from(`${JSON.stringify({ ...receipt, installedAt: new Date().toISOString() }, null, 2)}\n`),
      note: `${existingReceipt ? "更新" : "寫入"} ${rel(project, receiptFile)}`,
    });
  }
  return { problems, warnings, actions, state };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const ORDER = ["copy", "config", "tsconfig", "main", "receipt"];

export async function install({ project, configFrom = null, dryRun = false }) {
  const plan = await planInstall({ project, configFrom });
  if (plan.problems.length > 0 || dryRun) return { ...plan, written: [] };
  const written = [];
  for (const kind of ORDER) {
    for (const action of plan.actions.filter((a) => a.kind === kind)) {
      writeAtomic(action.target, action.data);
      written.push(rel(project, action.target));
    }
  }
  return { ...plan, written };
}

/** Read-only health check of an installation. */
export async function check({ project }) {
  const plan = await planInstall({ project });
  const issues = [...plan.problems];
  for (const action of plan.actions) {
    if (action.kind === "receipt") {
      issues.push(plan.state.receipt?.exists ? "INSTALL_RECEIPT.json 與目前的安裝不一致（再跑一次安裝器即可更新）。" : "沒有 INSTALL_RECEIPT.json（尚未用安裝器安裝）。");
    } else {
      issues.push(`尚未完成：${action.note}`);
    }
  }
  if (plan.state.tsconfig === "manual") issues.push("tsconfig.json 需要手動加入 exclude（見警告）。");
  return { issues, warnings: plan.warnings, state: plan.state };
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const projectArg = flag(args, "--project");
  if (!projectArg) {
    process.stderr.write("usage: install_code_layer.mjs --project <storybook root> [--config <file>] [--dry-run | --check]\n");
    process.exit(2);
  }
  const project = path.resolve(projectArg);
  const configArg = flag(args, "--config");
  const out = (line = "") => process.stdout.write(`${line}\n`);
  try {
    if (args.includes("--check")) {
      const result = await check({ project });
      for (const w of result.warnings) out(`警告：${w}`);
      if (result.issues.length === 0) {
        out(`Code Layer ${result.state.version} 安裝完整：${Object.keys(result.state.files).length} 個檔與模板相同、設定有效、preset 已接線、tsconfig ${result.state.tsconfig}。`);
      } else {
        for (const issue of result.issues) out(`問題：${issue}`);
        process.exit(1);
      }
    } else {
      const dryRun = args.includes("--dry-run");
      const result = await install({ project, configFrom: configArg ? path.resolve(configArg) : null, dryRun });
      for (const w of result.warnings) out(`警告：${w}`);
      if (result.problems.length > 0) {
        for (const p of result.problems) out(`無法安裝：${p}`);
        out("沒有寫入任何檔案。");
        process.exit(1);
      }
      const sorted = ORDER.flatMap((kind) => result.actions.filter((a) => a.kind === kind));
      if (dryRun) {
        out(sorted.length === 0 ? "已是最新，不需要寫入。" : `預計寫入 ${sorted.length} 個檔（--dry-run，沒有寫入）：`);
        const copies = sorted.filter((a) => a.kind === "copy");
        if (copies.length) out(`  模板檔 ${copies.length} 個 → ${CONFIG_DIR_NAME}/code-layer/`);
        for (const a of sorted.filter((a) => a.kind !== "copy")) out(`  ${a.note}`);
      } else {
        out(result.written.length === 0 ? "已是最新，沒有寫入任何檔案。" : `已寫入 ${result.written.length} 個檔：`);
        const copies = sorted.filter((a) => a.kind === "copy");
        if (copies.length) out(`  模板檔 ${copies.length} 個 → ${CONFIG_DIR_NAME}/code-layer/`);
        for (const a of sorted.filter((a) => a.kind !== "copy")) out(`  ${a.note}`);
        if (result.written.some((f) => !f.endsWith(RECEIPT))) out("請重新啟動 Storybook（manager 與 dev server 的變更不會熱更新）。");
      }
    }
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  }
}
