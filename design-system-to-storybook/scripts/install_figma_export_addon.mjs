#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ADDON_NAME = "@harrychuang/storybook-addon-figma-export";
const TGZ_PREFIX = "harrychuang-storybook-addon-figma-export-";
const LEGACY_DIR_NAME = "figma-export-addon";
const LEGACY_BACKUP_NAME = "figma-export-addon-legacy-backup";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

const copyOnly = args.includes("--copy-only");
const checkOnly = args.includes("--check");
const forceReinstall = args.includes("--force-reinstall");
const pmFlagIndex = args.indexOf("--package-manager");
const forcedPackageManager = pmFlagIndex >= 0 ? args[pmFlagIndex + 1] : "";
const positional = args.filter((arg, index) => {
  if (pmFlagIndex >= 0 && index === pmFlagIndex + 1) return false;
  return !arg.startsWith("--");
});

const productRoot = path.resolve(positional[0] || process.cwd());
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const bundledAddonDir = path.join(skillRoot, "assets", "figma-export-addon");
const vendorDir = path.join(productRoot, ".storybook", "vendor");
const legacyVendorDir = path.join(vendorDir, LEGACY_DIR_NAME);
const packageJsonPath = path.join(productRoot, "package.json");

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function main() {
  assertProductRoot(productRoot);
  assertBundledAddon();

  const bundledVersion = readPackageJson(path.join(bundledAddonDir, "package.json")).version;
  if (!bundledVersion) {
    throw new Error(`Bundled addon package.json has no version at ${bundledAddonDir}`);
  }
  const state = readInstalledState();

  if (checkOnly) {
    reportCheck(bundledVersion, state);
    return;
  }

  const currentTgzName = `${TGZ_PREFIX}${bundledVersion}.tgz`;
  const upToDate =
    !forceReinstall &&
    !copyOnly &&
    !state.legacyDir &&
    !state.legacySpec &&
    state.installedVersion === bundledVersion &&
    state.specVersion === bundledVersion &&
    state.vendoredTarballs.includes(currentTgzName);

  if (upToDate) {
    console.log(`${ADDON_NAME}@${bundledVersion} is already installed and up to date.`);
    console.log("Use --force-reinstall to reinstall anyway.");
    return;
  }

  if (
    !forceReinstall &&
    state.effectiveVersion &&
    compareVersions(bundledVersion, state.effectiveVersion) < 0
  ) {
    throw new Error(
      `Installed addon version ${state.effectiveVersion} is newer than the bundled asset ${bundledVersion}. ` +
        "Refresh the skill's vendored addon, or pass --force-reinstall to downgrade deliberately.",
    );
  }

  const tgzExistedBefore = fs.existsSync(path.join(vendorDir, currentTgzName));
  const packedPath = packBundledAddon(bundledVersion);
  const packedName = path.basename(packedPath);
  const spec = `file:${toPosix(path.relative(productRoot, packedPath))}`;

  console.log(`Packed bundled addon to ${packedPath}`);

  if (copyOnly) {
    console.log(`Copy-only mode. Install spec: ${spec}`);
    if (state.legacyDir) {
      console.log(
        `Note: legacy copied-directory layout detected at ${legacyVendorDir}; run without --copy-only to migrate it.`,
      );
    }
    return;
  }

  const packageManager = normalizePackageManager(
    forcedPackageManager || detectPackageManager(productRoot, readPackageJson(packageJsonPath)),
  );
  const needsIcons = !hasDependency(packageJsonPath, "@storybook/icons");
  const installArgs = installCommandArgs(packageManager, spec, needsIcons);

  console.log(`Installing with ${packageManager}: ${installArgs.join(" ")}`);

  const result = spawnSync(packageManager, installArgs, {
    cwd: productRoot,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error || result.status !== 0) {
    if (!tgzExistedBefore) {
      fs.rmSync(packedPath, { force: true });
    }
    if (result.error) {
      console.error(`Failed to run ${packageManager}: ${result.error.message}`);
    }
    process.exit(result.status ?? 1);
  }

  pruneOldTarballs(packedName);
  migrateLegacyDir();

  console.log("");
  console.log(`Installed ${ADDON_NAME}@${bundledVersion}`);
  console.log(`Tarball: ${toPosix(path.relative(productRoot, packedPath))}`);
  console.log(`Dependency spec: ${spec}`);
  console.log("Commit the tarball together with package.json and the lockfile so teammates and CI install the same version.");
  console.log("To upgrade later: update this skill so it bundles a newer addon, then re-run this installer. Use --check to see pending updates.");
}

function reportCheck(bundledVersion, state) {
  console.log(`Bundled addon version: ${bundledVersion}`);

  if (!state.declaredSpec) {
    console.log("Installed addon version: not installed");
    console.log("Status: not installed. Run the installer without --check to install.");
    process.exit(2);
  }

  const installedLabel = state.installedVersion
    ? `${state.installedVersion} (node_modules)`
    : state.specVersion
      ? `${state.specVersion} (declared tarball spec; node_modules not installed)`
      : `unknown (declared spec: ${state.declaredSpec})`;
  console.log(`Installed addon version: ${installedLabel}`);

  if (state.legacyDir || state.legacySpec) {
    console.log(
      "Status: legacy copied-directory layout detected. Re-run the installer to migrate to the versioned tarball layout.",
    );
    process.exit(3);
  }

  if (!state.effectiveVersion) {
    console.log("Status: installed version unknown. Re-run the installer to normalize to the tarball layout.");
    process.exit(3);
  }

  const cmp = compareVersions(bundledVersion, state.effectiveVersion);
  if (cmp > 0) {
    console.log(
      `Status: update available (${state.effectiveVersion} -> ${bundledVersion}). Re-run the installer to upgrade.`,
    );
    process.exit(3);
  }
  if (cmp < 0) {
    console.log(
      `Status: installed version ${state.effectiveVersion} is newer than the bundled asset ${bundledVersion}. Refresh the skill's vendored addon before reinstalling.`,
    );
    process.exit(0);
  }
  console.log("Status: up to date.");
  process.exit(0);
}

function readInstalledState() {
  const packageJson = readPackageJson(packageJsonPath);
  const sections = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
  ];

  let declaredSpec = null;
  for (const section of sections) {
    if (section && typeof section[ADDON_NAME] === "string") {
      declaredSpec = section[ADDON_NAME];
      break;
    }
  }

  let installedVersion = null;
  const installedPackageJson = path.join(productRoot, "node_modules", ...ADDON_NAME.split("/"), "package.json");
  if (fs.existsSync(installedPackageJson)) {
    try {
      installedVersion = readPackageJson(installedPackageJson).version || null;
    } catch {
      installedVersion = null;
    }
  }

  const specVersion = declaredSpec ? parseVersionFromSpec(declaredSpec) : null;
  const vendoredTarballs = fs.existsSync(vendorDir)
    ? fs
        .readdirSync(vendorDir)
        .filter((name) => name.startsWith(TGZ_PREFIX) && name.endsWith(".tgz"))
        .sort()
    : [];
  const legacyDir = fs.existsSync(legacyVendorDir) && fs.statSync(legacyVendorDir).isDirectory();
  const legacySpec = Boolean(declaredSpec && !specVersion && declaredSpec.includes(LEGACY_DIR_NAME));

  return {
    declaredSpec,
    installedVersion,
    specVersion,
    effectiveVersion: installedVersion || specVersion,
    vendoredTarballs,
    legacyDir,
    legacySpec,
  };
}

function packBundledAddon(version) {
  fs.mkdirSync(vendorDir, { recursive: true });
  const expectedName = `${TGZ_PREFIX}${version}.tgz`;

  const result = spawnSync("npm", ["pack", "--ignore-scripts", "--pack-destination", vendorDir], {
    cwd: bundledAddonDir,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw new Error(`Failed to run npm pack: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`npm pack failed:\n${result.stderr || result.stdout || "(no output)"}`);
  }

  const printedName = (result.stdout || "").trim().split("\n").filter(Boolean).pop();
  const packedName =
    printedName && fs.existsSync(path.join(vendorDir, printedName)) ? printedName : expectedName;
  const packedPath = path.join(vendorDir, packedName);

  if (!fs.existsSync(packedPath)) {
    throw new Error(`npm pack did not produce ${packedPath}`);
  }
  return packedPath;
}

function pruneOldTarballs(currentName) {
  for (const name of fs.readdirSync(vendorDir)) {
    if (name !== currentName && name.startsWith(TGZ_PREFIX) && name.endsWith(".tgz")) {
      fs.rmSync(path.join(vendorDir, name), { force: true });
      console.log(`Removed superseded tarball ${name}`);
    }
  }
}

function migrateLegacyDir() {
  if (!(fs.existsSync(legacyVendorDir) && fs.statSync(legacyVendorDir).isDirectory())) return;

  const backupDir = path.join(vendorDir, LEGACY_BACKUP_NAME);
  if (fs.existsSync(backupDir)) {
    console.warn(
      `Legacy vendored directory still present at ${legacyVendorDir}, and a previous backup already exists at ${backupDir}. ` +
        "Delete both manually after verifying Storybook builds.",
    );
    return;
  }

  fs.renameSync(legacyVendorDir, backupDir);
  console.log(
    `Migrated legacy copied-directory layout: backup kept at ${backupDir}. ` +
      "Delete it after verifying Storybook builds; the addon now installs from the versioned tarball.",
  );
}

function assertProductRoot(root) {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Cannot find package.json at ${packageJsonPath}`);
  }
  if (!fs.existsSync(path.join(root, ".storybook"))) {
    throw new Error(`Cannot find .storybook/ at ${path.join(root, ".storybook")}`);
  }
}

function assertBundledAddon() {
  const requiredFiles = [
    path.join(bundledAddonDir, "package.json"),
    path.join(bundledAddonDir, "dist", "index.js"),
    path.join(bundledAddonDir, "dist", "preview.js"),
    path.join(bundledAddonDir, "dist", "preset.js"),
    path.join(bundledAddonDir, "dist", "review.js"),
    path.join(bundledAddonDir, "dist", "review-server.js"),
    path.join(bundledAddonDir, "dist", "source.js"),
    path.join(bundledAddonDir, "dist", "figma-code-exporter.css"),
    path.join(bundledAddonDir, "dist", "review.css"),
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Bundled Figma export addon is incomplete; missing ${file}`);
    }
  }
}

function parseVersionFromSpec(spec) {
  const match = String(spec).match(new RegExp(`${escapeRegExp(TGZ_PREFIX)}(.+)\\.tgz$`));
  return match ? match[1] : null;
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] > pb.nums[i] ? 1 : -1;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === "") return 1;
  if (pb.pre === "") return -1;
  return pa.pre > pb.pre ? 1 : -1;
}

function parseVersion(value) {
  const [base, ...preParts] = String(value).split("-");
  const nums = base.split(".").map((part) => Number.parseInt(part, 10) || 0);
  while (nums.length < 3) nums.push(0);
  return { nums, pre: preParts.join("-") };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readPackageJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function detectPackageManager(root, packageJson) {
  const declared = String(packageJson.packageManager || "").split("@")[0];
  if (declared) return declared;

  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "bun.lockb")) || fs.existsSync(path.join(root, "bun.lock"))) return "bun";
  return "npm";
}

function normalizePackageManager(packageManager) {
  const normalized = String(packageManager || "npm").split("@")[0];
  if (["npm", "pnpm", "yarn", "bun"].includes(normalized)) return normalized;
  throw new Error(`Unsupported package manager: ${packageManager}`);
}

function hasDependency(file, dependencyName) {
  const packageJson = readPackageJson(file);
  const sections = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ];

  return sections.some((section) => section && Object.prototype.hasOwnProperty.call(section, dependencyName));
}

function installCommandArgs(packageManager, vendorSpec, needsIcons) {
  const packages = [vendorSpec];
  if (needsIcons) packages.push("@storybook/icons@^1.0.0");

  if (packageManager === "npm") return ["install", "-D", ...packages];
  if (packageManager === "pnpm") return ["add", "-D", ...packages];
  if (packageManager === "yarn") return ["add", "-D", ...packages];
  if (packageManager === "bun") return ["add", "-d", ...packages];

  throw new Error(`Unsupported package manager: ${packageManager}`);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function printUsage() {
  console.log(`Usage: node <skill-root>/scripts/install_figma_export_addon.mjs <product-repo-root> [options]

Packs the bundled Figma export addon into a versioned tarball at
.storybook/vendor/${TGZ_PREFIX}<version>.tgz and installs it as a local file:
devDependency. Re-running upgrades in place when the skill bundles a newer
version, and migrates the legacy copied-directory layout
(.storybook/vendor/${LEGACY_DIR_NAME}/) to the tarball layout.

Options:
  --check                 Report bundled vs installed version without changing
                          files. Exit codes: 0 up to date, 2 not installed,
                          3 update available or legacy layout.
  --copy-only             Only produce the tarball and print the install spec.
  --force-reinstall       Reinstall even when versions match, or downgrade when
                          the installed version is newer than the bundled one.
  --package-manager <pm>  Force npm | pnpm | yarn | bun.
  -h, --help              Show this help.`);
}
