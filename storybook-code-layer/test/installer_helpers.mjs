// Helpers of the installer tests: throwaway projects, tree hashes, the command line.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { FIXTURE_FILES, SKILL_ROOT, fixtureConfig, tempDir, writeFiles } from "./helpers.mjs";

export const INSTALLER = path.join(SKILL_ROOT, "scripts", "install_code_layer.mjs");
export const ENTRY = 'resolve(process.cwd(), ".storybook/code-layer/preset.js")';

export const MAIN_ESM = `import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";

const inspector = resolve(process.cwd(), ".storybook/prototype-inspector/preset.js");

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: [
    "@storybook/addon-docs",
    inspector,
  ],
  framework: { name: "@storybook/react-vite", options: {} },
};

export default config;
`;

/** The same main config without any use of node:path. */
export const MAIN_NO_IMPORT = MAIN_ESM.replace('import { resolve } from "node:path";\n', "")
  .replace('const inspector = resolve(process.cwd(), ".storybook/prototype-inspector/preset.js");\n\n', "")
  .replace("    inspector,\n", "");

export const TSCONFIG = `{
  "compilerOptions": {
    "strict": true
  },
  "include": [
    ".storybook/**/*.ts",
    "src/**/*.ts"
  ],
  "exclude": [
    ".storybook/vendor/**"
  ]
}
`;

/** A workspace with a Storybook project in sb/ and a binding file beside it. */
export function makeProject({ config = fixtureConfig(), main = MAIN_ESM, tsconfig = TSCONFIG, preview = "export default {};\n" } = {}) {
  const ws = tempDir("code-layer-install-");
  const files = { ...FIXTURE_FILES };
  for (const name of ["tokens.css", "tokens-ref.css", "tokens-sys.css", "tokens-comp.css"]) files[`sb/tokens/${name}`] = files[`tokens/${name}`];
  files["sb/.storybook/main.ts"] = main;
  files["sb/.storybook/preview.ts"] = preview;
  files["sb/tsconfig.json"] = tsconfig;
  files["binding.json"] = `${JSON.stringify(config, null, 2)}\n`;
  writeFiles(ws, files);
  return { ws, project: path.join(ws, "sb"), binding: path.join(ws, "binding.json"), installDir: path.join(ws, "sb/.storybook/code-layer"), stateDir: path.join(ws, ".code-layer") };
}

export function sha(file) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}

/** Every file under root with its modification time and content hash: equal strings mean nothing changed. */
export function treeHash(root) {
  const entries = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) entries.push(`${path.relative(root, full)} -> ${fs.readlinkSync(full)}`);
      else if (entry.isDirectory()) walk(full);
      else {
        const st = fs.statSync(full);
        entries.push(`${path.relative(root, full)} ${st.mtimeMs} ${crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")}`);
      }
    }
  };
  walk(root);
  return entries.join("\n");
}

/** Issue codes of a result, in order, without the note about the Storybook version the fixtures cannot have. */
export function codes(result) {
  return [...new Set((result.issues ?? []).map((issue) => issue.code).filter((code) => code !== "storybook-version-unverified"))];
}

/** Run the installer as a command; `json` is the parsed stdout when it is JSON. */
export function cli(args, { installer = INSTALLER } = {}) {
  const out = spawnSync(process.execPath, [installer, ...args], { encoding: "utf8" });
  let json = null;
  try {
    json = JSON.parse(out.stdout);
  } catch {
    json = null;
  }
  return { status: out.status, stdout: out.stdout, stderr: out.stderr, json };
}

/** A copy of the skill's scripts and template somewhere else (an installed copy; one whose template can be edited). */
export function copySkill() {
  const root = tempDir("code-layer-skill-");
  for (const name of ["scripts", "template"]) fs.cpSync(path.join(SKILL_ROOT, name), path.join(root, name), { recursive: true });
  return { root, installer: path.join(root, "scripts", "install_code_layer.mjs") };
}
