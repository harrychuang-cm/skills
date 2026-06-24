#!/usr/bin/env node

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(scriptDir, "..");
const bundledPluginRoot = join(skillRoot, "assets", "figma-plugin-code-to-design");
const defaultTarget = join("figma", "storybook-code-to-design");
const excludedPathSegments = new Set([".git", "node_modules"]);
const excludedFiles = new Set([".DS_Store"]);

function printUsage() {
  console.error(
    [
      "Usage: node <skill-root>/scripts/install_figma_import_plugin.mjs <product-repo-root> [--target <relative-or-absolute-dir>] [--dry-run] [--force]",
      "Copies the bundled Storybook Code To Design Figma importer plugin into the product repo and reports the manifest path to load in Figma Desktop.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    force: false,
    target: defaultTarget,
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--force") {
      parsed.force = true;
      continue;
    }

    if (arg === "--target") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --target.");
      }
      parsed.target = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}.`);
    }

    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new Error("Expected exactly one product repo root.");
  }

  parsed.productRoot = resolve(positionals[0]);
  parsed.targetRoot = isAbsolute(parsed.target)
    ? resolve(parsed.target)
    : resolve(parsed.productRoot, parsed.target);

  return parsed;
}

function shouldExclude(relativePath) {
  if (!relativePath) {
    return false;
  }

  const basename = relativePath.split(sep).at(-1);
  if (excludedFiles.has(basename)) {
    return true;
  }

  return relativePath.split(sep).some((part) =>
    excludedPathSegments.has(part),
  );
}

function collectFiles(currentRoot, files = []) {
  const entries = readdirSync(currentRoot, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(currentRoot, entry.name);
    const relativePath = relative(bundledPluginRoot, absolutePath);

    if (shouldExclude(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      collectFiles(absolutePath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath,
        mode: statSync(absolutePath).mode,
      });
    }
  }

  return files;
}

function targetDiffersFromFile(sourcePath, targetPath) {
  if (!existsSync(targetPath)) {
    return false;
  }

  if (!statSync(targetPath).isFile()) {
    return true;
  }

  return !readFileSync(sourcePath).equals(readFileSync(targetPath));
}

function assertProductRoot(productRoot) {
  if (!existsSync(productRoot)) {
    throw new Error(`Product repo root does not exist: ${productRoot}`);
  }
  if (!statSync(productRoot).isDirectory()) {
    throw new Error(`Product repo root is not a directory: ${productRoot}`);
  }
}

function assertBundledPlugin() {
  const requiredFiles = [
    "manifest.json",
    "code.js",
    "code.ts",
    "ui.html",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "README.md",
  ];

  if (!existsSync(bundledPluginRoot)) {
    throw new Error(`Missing bundled Figma importer plugin: ${bundledPluginRoot}`);
  }

  for (const file of requiredFiles) {
    const absolutePath = join(bundledPluginRoot, file);
    if (!existsSync(absolutePath)) {
      throw new Error(
        `Bundled Figma importer plugin is incomplete; missing ${absolutePath}`,
      );
    }
  }
}

function copyPluginFiles({ productRoot, targetRoot, dryRun, force }) {
  const files = collectFiles(bundledPluginRoot);
  const collisions = files
    .map((file) => ({
      ...file,
      targetPath: join(targetRoot, file.relativePath),
    }))
    .filter((file) =>
      targetDiffersFromFile(file.absolutePath, file.targetPath),
    );

  if (collisions.length > 0 && !force) {
    const shown = collisions.slice(0, 40).map((file) =>
      relative(productRoot, file.targetPath),
    );
    const hiddenCount = collisions.length - shown.length;
    throw new Error(
      [
        `Refusing to overwrite ${collisions.length} existing file(s) in ${targetRoot}.`,
        ...shown.map((file) => `  - ${toPosix(file)}`),
        hiddenCount > 0 ? `  ...and ${hiddenCount} more` : "",
        "Choose a fresh --target or re-run with --force only after explicit approval.",
      ].filter(Boolean).join("\n"),
    );
  }

  if (dryRun) {
    console.log(`Would copy ${files.length} Figma importer plugin file(s) to ${targetRoot}.`);
    printNextSteps(productRoot, targetRoot);
    return;
  }

  mkdirSync(targetRoot, { recursive: true });
  for (const file of files) {
    const targetPath = join(targetRoot, file.relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(file.absolutePath, targetPath);
    chmodSync(targetPath, file.mode & 0o777);
  }

  console.log(`Copied ${files.length} Figma importer plugin file(s) to ${targetRoot}.`);
  printNextSteps(productRoot, targetRoot);
}

function printNextSteps(productRoot, targetRoot) {
  const manifestPath = join(targetRoot, "manifest.json");
  const relativeManifestPath = toPosix(relative(productRoot, manifestPath));

  console.log("");
  console.log("Figma Desktop setup:");
  console.log("1. Open Figma Desktop.");
  console.log("2. Go to Plugins > Development > Import plugin from manifest...");
  console.log(`3. Select ${relativeManifestPath}`);
  console.log("4. In Storybook, export JSON, then import it with Storybook Code To Design.");
}

function toPosix(value) {
  return value.split(sep).join("/");
}

try {
  const options = parseArgs(process.argv.slice(2));
  assertProductRoot(options.productRoot);
  assertBundledPlugin();
  copyPluginFiles(options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(1);
}
