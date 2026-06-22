#!/usr/bin/env node
import {
  existsSync,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(scriptDir, "..");
const addonAssetDir = resolve(skillRoot, "assets/prototype-inspector");
const flowLayoutAssetPath = resolve(
  skillRoot,
  "assets/prototype-flow-layout/prototypeFlowLayout.ts",
);

function parseArgs(argv) {
  const args = {
    force: false,
    projectRoot: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (arg === "--project-root") {
      args.projectRoot = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function findStorybookMain(storybookDir) {
  const candidates = ["main.ts", "main.js", "main.mjs", "main.cjs"];
  return candidates.map((name) => resolve(storybookDir, name)).find(existsSync);
}

function getAddonEntry(mainPath) {
  return mainPath.endsWith(".cjs")
    ? 'require("node:path").resolve(__dirname, "prototype-inspector/preset.js")'
    : 'new URL("./prototype-inspector/preset.js", import.meta.url).pathname';
}

function insertAddonEntry(source, entry) {
  if (source.includes("prototype-inspector/preset.js")) {
    return source;
  }

  const addonsMatch = /addons\s*:\s*\[/.exec(source);
  if (addonsMatch?.index !== undefined) {
    const insertAt = addonsMatch.index + addonsMatch[0].length;
    return `${source.slice(0, insertAt)}\n    ${entry},${source.slice(insertAt)}`;
  }

  const frameworkMatch = /\n\s*framework\s*:/.exec(source);
  if (frameworkMatch?.index !== undefined) {
    const insertAt = frameworkMatch.index + 1;
    return `${source.slice(0, insertAt)}  addons: [\n    ${entry},\n  ],\n${source.slice(insertAt)}`;
  }

  throw new Error(
    "Could not find an addons array or framework field in Storybook main config.",
  );
}

function installFlowLayoutHelper(projectRoot, force) {
  const targetPath = resolve(
    projectRoot,
    "src/pages/prototypes/prototypeFlowLayout.ts",
  );

  if (!existsSync(flowLayoutAssetPath)) {
    throw new Error(`Missing bundled flow layout helper: ${flowLayoutAssetPath}`);
  }

  if (existsSync(targetPath) && !force) {
    return {
      action: "reused",
      targetPath,
    };
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(flowLayoutAssetPath, targetPath, { force: true });

  return {
    action: "installed",
    targetPath,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = resolve(args.projectRoot);
  const storybookDir = resolve(projectRoot, ".storybook");
  const mainPath = findStorybookMain(storybookDir);

  if (!existsSync(addonAssetDir)) {
    throw new Error(`Missing bundled addon assets: ${addonAssetDir}`);
  }
  if (!existsSync(storybookDir)) {
    throw new Error(`Missing Storybook directory: ${storybookDir}`);
  }
  if (!mainPath) {
    throw new Error(`Missing Storybook main config in ${storybookDir}`);
  }

  const targetAddonDir = resolve(storybookDir, "prototype-inspector");
  if (existsSync(targetAddonDir) && !args.force) {
    throw new Error(
      `${targetAddonDir} already exists. Pass --force to overwrite bundled addon files.`,
    );
  }

  mkdirSync(storybookDir, { recursive: true });
  cpSync(addonAssetDir, targetAddonDir, { force: args.force, recursive: true });

  const source = readFileSync(mainPath, "utf8");
  const nextSource = insertAddonEntry(source, getAddonEntry(mainPath));
  if (nextSource !== source) {
    writeFileSync(mainPath, nextSource);
  }

  const flowLayout = installFlowLayoutHelper(projectRoot, args.force);

  console.log(`Installed Prototype Inspector addon into ${targetAddonDir}`);
  console.log(
    `${flowLayout.action === "installed" ? "Installed" : "Reused"} flow layout helper: ${flowLayout.targetPath}`,
  );
  console.log(`Updated Storybook config: ${mainPath}`);
}

main();
