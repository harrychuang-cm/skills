#!/usr/bin/env node
import {
  existsSync,
  cpSync,
  mkdirSync,
  readdirSync,
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
const fingerprintAssetPath = resolve(
  skillRoot,
  "assets/prototype-review/fingerprint.mjs",
);

function parseArgs(argv) {
  const args = {
    force: false,
    projectRoot: process.cwd(),
    tokenPrefix: undefined,
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
    if (arg === "--token-prefix") {
      args.tokenPrefix = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.tokenPrefix !== undefined && !/^[a-z][a-z0-9-]*$/.test(args.tokenPrefix)) {
    throw new Error(
      `Invalid --token-prefix "${args.tokenPrefix}". Use a lowercase token prefix such as "md" or "acme".`,
    );
  }

  if (args.tokenPrefix === "pi") {
    throw new Error(
      '--token-prefix "pi" would make the inspector token layer self-referential ' +
        "(every --pi-* token reading itself). Use the project's own token prefix.",
    );
  }

  return args;
}

function bridgeTokenPrefix(targetAddonDir, tokenPrefix) {
  const cssPath = resolve(targetAddonDir, "prototype-inspector.css");
  const source = readFileSync(cssPath, "utf8");
  // All design-token references live in the --pi-* token layer as
  // var(--sbt-<name>, <fallback>). Re-pointing the sbt prefix bridges the
  // inspector onto the project's token system while keeping the fallbacks.
  const next = source.replace(/var\(--sbt-/g, `var(--${tokenPrefix}-`);
  if (next !== source) {
    writeFileSync(cssPath, next);
  }
}

function findStorybookMain(storybookDir) {
  const candidates = ["main.ts", "main.js", "main.mjs", "main.cjs"];
  return candidates.map((name) => resolve(storybookDir, name)).find(existsSync);
}

// The inspector's preview decorator returns React elements, so it only renders
// in React Storybook projects. Known non-React renderer package prefixes abort
// the install before any file is written.
const nonReactRendererPrefixes = [
  "@storybook/vue3",
  "@storybook/angular",
  "@storybook/svelte",
  "@storybook/web-components",
  "@storybook/html",
  "@storybook/preact",
  "@storybook/ember",
  "@storybook/solid",
];

function findNonReactRenderer(mainSource) {
  return nonReactRendererPrefixes.find((prefix) => mainSource.includes(prefix));
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

function installBundledFile(assetPath, targetPath, label, force) {
  if (!existsSync(assetPath)) {
    throw new Error(`Missing bundled ${label}: ${assetPath}`);
  }

  if (existsSync(targetPath) && !force) {
    return {
      action: "reused",
      targetPath,
    };
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(assetPath, targetPath, { force: true });

  return {
    action: "installed",
    targetPath,
  };
}

function getFlowLayoutHelperPath(projectRoot) {
  return resolve(projectRoot, "src/pages/prototypes/prototypeFlowLayout.ts");
}

// Static import declarations at a statement boundary (line start or right
// after ";"), including multi-line named lists whose comments may hold any
// character but "}"; import.meta, dynamic import( and re-exports
// (export ... from "x") never match. Group 1 is the import clause, group 2 the
// specifier.
const importDeclarationPattern =
  /(?:^|;)[ \t]*import\s+(?:((?:\{[^}]*\}|[^"'`;{}])*?)\s*from\s*)?["']([^"'\n]+)["']/gm;
// Every import keyword at a statement boundary that is not import.meta,
// import( or an object key; each one has to be read as a declaration.
const importKeywordPattern = /(?:^|;)[ \t]*import\b(?!\s*[.(:])/gm;
// Names the helper declares as exports. Re-exports such as export { a as b }
// are not recognised, so a helper written that way is reported as missing
// the name and needs --force.
const exportDeclarationPattern =
  /(?:^|;)[ \t]*export\s+(?:(?:async\s+)?function(?:\s*\*\s*|\s+)|(?:const|let|type|interface)\s+)([A-Za-z_$][\w$]*)/gm;

// Names the bundled inspector modules import from the flow layout helper, read
// from their import declarations so a new import needs no list update. Each
// specifier resolves from the module's installed location; only named imports
// ({ name } or { name as alias }) require a helper export.
function readRequiredHelperExports(targetAddonDir, helperPath) {
  const names = new Set();
  const modules = readdirSync(addonAssetDir, { recursive: true })
    .map(String)
    .filter((relativePath) => /\.(?:[cm]?js|jsx|tsx?)$/.test(relativePath))
    .sort();

  for (const relativePath of modules) {
    const source = readFileSync(resolve(addonAssetDir, relativePath), "utf8");
    const installedDir = dirname(resolve(targetAddonDir, relativePath));
    const declarations = [...source.matchAll(importDeclarationPattern)];
    // A statement this check cannot read could import from the helper, so it
    // fails instead of being skipped.
    const readStarts = new Set(
      declarations.map((match) => match.index + match[0].indexOf("import")),
    );
    for (const keyword of source.matchAll(importKeywordPattern)) {
      const start = keyword.index + keyword[0].lastIndexOf("import");
      if (!readStarts.has(start)) {
        const line = source.slice(0, start).split("\n").length;
        throw new Error(
          `Cannot read the import statement at ${relativePath}:${line} of the bundled Prototype Inspector, so the flow layout helper exports cannot be checked. Rerun with --force to replace the helper with the bundled one.`,
        );
      }
    }
    for (const [, clause = "", specifier] of declarations) {
      if (!/^\.{1,2}\//.test(specifier)) continue;
      const target = resolve(installedDir, specifier);
      if (target !== helperPath && `${target}.ts` !== helperPath) continue;

      const namedList = /\{([^}]*)\}/.exec(
        clause.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""),
      );
      for (const entry of namedList ? namedList[1].split(",") : []) {
        const name = entry.trim().split(/\s+as\s+/)[0];
        if (name) names.add(name);
      }
    }
  }

  return [...names];
}

function findMissingHelperExports(helperPath, targetAddonDir) {
  // Blank out block comments but keep their line breaks, so a commented-out
  // export does not count as one.
  const source = readFileSync(helperPath, "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    (comment) => comment.replace(/[^\n]/g, ""),
  );
  const exported = new Set(
    [...source.matchAll(exportDeclarationPattern)].map((match) => match[1]),
  );
  return readRequiredHelperExports(targetAddonDir, helperPath).filter(
    (name) => !exported.has(name),
  );
}

function installFlowLayoutHelper(projectRoot, force) {
  return installBundledFile(
    flowLayoutAssetPath,
    getFlowLayoutHelperPath(projectRoot),
    "flow layout helper",
    force,
  );
}

// preview.js imports the shared fingerprint from
// ../../scripts/prototype-review/fingerprint.mjs, so it is installed at that
// project path, where node-side review scripts can share the same frozen
// implementation, rather than inside the inspector folder.
function installFingerprint(projectRoot, force) {
  return installBundledFile(
    fingerprintAssetPath,
    resolve(projectRoot, "scripts/prototype-review/fingerprint.mjs"),
    "fingerprint module",
    force,
  );
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

  const source = readFileSync(mainPath, "utf8");
  const nonReactRenderer = findNonReactRenderer(source);
  if (nonReactRenderer) {
    console.error(
      `Prototype Inspector only supports React Storybook projects; ${mainPath} references ${nonReactRenderer}.`,
    );
    console.error(
      "No files were written. For non-React projects, review the flow through the StaticFlow story and the docs/ handoff files (see storybook-product-prototype SKILL.md).",
    );
    process.exit(1);
  }

  // Runs before the folder guard so projects that carry both an older
  // inspector folder and an older helper see the missing names, and before
  // any write so a refused install leaves the project untouched.
  const targetAddonDir = resolve(storybookDir, "prototype-inspector");
  const helperPath = getFlowLayoutHelperPath(projectRoot);
  if (!args.force && existsSync(helperPath)) {
    const missingExports = findMissingHelperExports(helperPath, targetAddonDir);
    if (missingExports.length > 0) {
      console.error(
        `Existing flow layout helper ${helperPath} is missing exports required by the Prototype Inspector: ${missingExports.join(", ")}. Rerun with --force to replace it with the bundled helper.`,
      );
      process.exit(1);
    }
  }

  if (existsSync(targetAddonDir) && !args.force) {
    throw new Error(
      `${targetAddonDir} already exists. Pass --force to overwrite bundled addon files.`,
    );
  }

  mkdirSync(storybookDir, { recursive: true });
  cpSync(addonAssetDir, targetAddonDir, { force: args.force, recursive: true });

  if (args.tokenPrefix && args.tokenPrefix !== "sbt") {
    bridgeTokenPrefix(targetAddonDir, args.tokenPrefix);
  }

  const nextSource = insertAddonEntry(source, getAddonEntry(mainPath));
  if (nextSource !== source) {
    writeFileSync(mainPath, nextSource);
  }

  const flowLayout = installFlowLayoutHelper(projectRoot, args.force);
  const fingerprint = installFingerprint(projectRoot, args.force);

  console.log(`Installed Prototype Inspector addon into ${targetAddonDir}`);
  if (args.tokenPrefix && args.tokenPrefix !== "sbt") {
    console.log(
      `Bridged inspector design tokens onto the --${args.tokenPrefix}-* prefix (built-in fallbacks kept).`,
    );
  }
  console.log(
    `${flowLayout.action === "installed" ? "Installed" : "Reused"} flow layout helper: ${flowLayout.targetPath}`,
  );
  console.log(
    `${fingerprint.action === "installed" ? "Installed" : "Reused"} fingerprint: ${fingerprint.targetPath}`,
  );
  console.log(`Updated Storybook config: ${mainPath}`);
}

main();
