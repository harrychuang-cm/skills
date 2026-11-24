// Installer: wiring functions (pure) and install / --dry-run / --check on
// throwaway projects in the OS temp directory.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { buildManifest } from "../scripts/build_template_manifest.mjs";
import { check, install } from "../scripts/install_code_layer.mjs";
import { wireMain } from "../scripts/lib/wire_main.mjs";
import { parseJsonc, wireTsconfig } from "../scripts/lib/wire_tsconfig.mjs";
import { FIXTURE_FILES, fixtureConfig, tempDir, writeFiles } from "./helpers.mjs";

const ENTRY = 'resolve(process.cwd(), ".storybook/code-layer/preset.js")';

const MAIN_ESM = `import { resolve } from "node:path";
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

const TSCONFIG = `{
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

test("wireMain appends the preset as the last addon, keeping the trailing comma style", () => {
  const out = wireMain(MAIN_ESM, { fileName: ".storybook/main.ts" });
  assert.equal(out.status, "added");
  assert.equal(out.source, MAIN_ESM.replace("    inspector,\n", `    inspector,\n    ${ENTRY},\n`));
  assert.equal(wireMain(out.source, { fileName: ".storybook/main.ts" }).status, "present", "idempotent");

  const noTrailing = MAIN_ESM.replace("    inspector,\n", "    inspector\n");
  assert.equal(wireMain(noTrailing, { fileName: "main.ts" }).source, noTrailing.replace("    inspector\n", `    inspector,\n    ${ENTRY}\n`));

  const oneLine = MAIN_ESM.replace(/addons: \[[\s\S]*?\],/, 'addons: ["@storybook/addon-docs"],');
  assert.match(wireMain(oneLine, { fileName: "main.ts" }).source, /addons: \["@storybook\/addon-docs", resolve\(process\.cwd\(\), "\.storybook\/code-layer\/preset\.js"\)\],/);
});

test("wireMain adds the node:path import when missing, and uses require() in CommonJS", () => {
  const noImport = MAIN_ESM.replace('import { resolve } from "node:path";\n', "").replace(
    'const inspector = resolve(process.cwd(), ".storybook/prototype-inspector/preset.js");\n\n',
    "",
  ).replace("    inspector,\n", "");
  const out = wireMain(noImport, { fileName: "main.ts" });
  assert.ok(out.source.startsWith('import { resolve } from "node:path";\nimport type'));
  assert.ok(out.source.includes(`    "@storybook/addon-docs",\n    ${ENTRY},\n`));

  const cjs = 'module.exports = {\n  addons: [\n    "@storybook/addon-docs",\n  ],\n  framework: "@storybook/react-vite",\n};\n';
  const wiredCjs = wireMain(cjs, { fileName: "main.cjs" });
  assert.ok(wiredCjs.source.includes('    require("node:path").resolve(process.cwd(), ".storybook/code-layer/preset.js"),\n'));
});

test("wireMain refuses what it cannot wire safely", () => {
  assert.throws(() => wireMain(MAIN_ESM.replace("addons: [", "plugins: ["), { fileName: "main.ts" }), /找不到 addons 陣列/);
  assert.throws(() => wireMain(`import { defineMain } from "@storybook/react-vite/node";\nexport default defineMain({ addons: [] });\n`, { fileName: "main.ts" }), /CSF factories/);
  const twice = MAIN_ESM.replace("    inspector,\n", `    inspector,\n    ${ENTRY},\n    ${ENTRY},\n`);
  assert.throws(() => wireMain(twice, { fileName: "main.ts" }), /2 個 Code Layer preset/);
  const outside = MAIN_ESM.replace("export default config;", '// see .storybook/code-layer/preset.js\nexport default config;');
  assert.throws(() => wireMain(outside, { fileName: "main.ts" }), /不是 addons 陣列的一個元素/);
  const commented = MAIN_ESM.replace("  addons: [", "  // addons: [ old ]\n  addons: [");
  assert.equal(wireMain(commented, { fileName: "main.ts" }).status, "added", "commented-out addons are ignored");
});

test("wireTsconfig adds the exclude entry only when the include list covers the addon", () => {
  const out = wireTsconfig(TSCONFIG);
  assert.equal(out.status, "added");
  assert.equal(out.source, TSCONFIG.replace('    ".storybook/vendor/**"\n', '    ".storybook/vendor/**",\n    ".storybook/code-layer/**"\n'));
  assert.equal(wireTsconfig(out.source).status, "present");
  assert.equal(wireTsconfig(TSCONFIG.replace('    ".storybook/**/*.ts",\n', "")).status, "not-needed");
  assert.equal(wireTsconfig('{ "include": ["src"] }').status, "not-needed");
  assert.equal(wireTsconfig('{ "compilerOptions": {} }').status, "manual", "default include covers it, no exclude list: manual");
  const jsonc = '{\n  // comment with "exclude": [\n  "include": [".storybook/**/*"], /* trailing */\n  "exclude": ["node_modules",],\n}\n';
  assert.deepEqual(parseJsonc(jsonc).exclude, ["node_modules"]);
  const wired = wireTsconfig(jsonc);
  assert.equal(wired.status, "added");
  assert.deepEqual(parseJsonc(wired.source).exclude, ["node_modules", ".storybook/code-layer/**"]);
});

function makeProject({ config = fixtureConfig(), main = MAIN_ESM, tsconfig = TSCONFIG } = {}) {
  const ws = tempDir("code-layer-install-");
  const files = { ...FIXTURE_FILES };
  for (const name of ["tokens.css", "tokens-ref.css", "tokens-sys.css", "tokens-comp.css"]) files[`sb/tokens/${name}`] = files[`tokens/${name}`];
  files["sb/.storybook/main.ts"] = main;
  files["sb/.storybook/preview.ts"] = "export default {};\n";
  files["sb/tsconfig.json"] = tsconfig;
  files["binding.json"] = `${JSON.stringify(config, null, 2)}\n`;
  writeFiles(ws, files);
  return { ws, project: path.join(ws, "sb"), binding: path.join(ws, "binding.json") };
}

function treeHash(root) {
  const entries = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const st = fs.statSync(full);
        entries.push(`${path.relative(root, full)} ${st.mtimeMs} ${crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")}`);
      }
    }
  };
  walk(root);
  return entries.join("\n");
}

test("install copies the template, keeps the binding, wires main and tsconfig, writes a receipt; a second run writes nothing", async () => {
  const { ws, project, binding } = makeProject();
  const result = await install({ project, configFrom: binding });
  assert.deepEqual(result.problems, []);
  const manifest = buildManifest();
  for (const file of manifest.files) {
    const installed = fs.readFileSync(path.join(project, ".storybook/code-layer", file.path));
    assert.equal(`sha256:${crypto.createHash("sha256").update(installed).digest("hex")}`, file.sha256, file.path);
  }
  assert.ok(fs.readFileSync(binding).equals(fs.readFileSync(path.join(project, ".storybook/code-layer/code-layer.config.json"))));
  assert.equal(fs.readFileSync(path.join(project, ".storybook/main.ts"), "utf8"), wireMain(MAIN_ESM, { fileName: "main.ts" }).source);
  assert.equal(fs.readFileSync(path.join(project, "tsconfig.json"), "utf8"), wireTsconfig(TSCONFIG).source);
  const receipt = JSON.parse(fs.readFileSync(path.join(project, ".storybook/code-layer/INSTALL_RECEIPT.json"), "utf8"));
  assert.equal(receipt.version, manifest.version);
  assert.equal(Object.keys(receipt.files).length, manifest.files.length);
  assert.equal(result.written.at(-1), ".storybook/code-layer/INSTALL_RECEIPT.json", "receipt is written last");
  assert.equal(result.written.at(-2), ".storybook/main.ts", "main config is wired after the files");

  const before = treeHash(ws);
  const again = await install({ project, configFrom: binding });
  assert.deepEqual(again.written, []);
  assert.equal(treeHash(ws), before, "second install changes nothing");
  const health = await check({ project });
  assert.deepEqual(health.issues, []);
});

test("--dry-run writes nothing; --check reports what is missing", async () => {
  const { ws, project, binding } = makeProject();
  const before = treeHash(ws);
  const dry = await install({ project, configFrom: binding, dryRun: true });
  assert.deepEqual(dry.problems, []);
  assert.ok(dry.actions.length > 60);
  assert.equal(treeHash(ws), before);
  const health = await check({ project });
  assert.ok(health.issues.some((i) => i.includes("code-layer.config.json")), health.issues.join("\n"));
  assert.equal(treeHash(ws), before, "--check writes nothing");
});

test("refusals write nothing: changed installed file, missing binding, stateDir inside the project, missing paths, non-Vite builder", async () => {
  {
    const { ws, project, binding } = makeProject();
    await install({ project, configFrom: binding });
    fs.appendFileSync(path.join(project, ".storybook/code-layer/runtime/index.ts"), "\n// local edit\n");
    fs.rmSync(path.join(project, ".storybook/code-layer/runtime/overlay.ts"));
    const before = treeHash(ws);
    const result = await install({ project });
    assert.ok(result.problems.some((p) => p.includes("runtime/index.ts") && p.includes("不覆蓋")), result.problems.join("\n"));
    assert.deepEqual(result.written, []);
    assert.equal(treeHash(ws), before);
    assert.ok((await check({ project })).issues.length >= 2);
  }
  {
    const { ws, project } = makeProject();
    const before = treeHash(ws);
    const result = await install({ project });
    assert.ok(result.problems.some((p) => p.includes("需要專案綁定設定")));
    assert.equal(treeHash(ws), before);
  }
  {
    const { ws, project, binding } = makeProject({ config: fixtureConfig({ stateDir: ".code-layer" }) });
    const before = treeHash(ws);
    const result = await install({ project, configFrom: binding });
    assert.ok(result.problems.some((p) => p.includes("stateDir")), result.problems.join("\n"));
    assert.equal(treeHash(ws), before);
  }
  {
    const { ws, project, binding } = makeProject({ config: fixtureConfig({ components: { roots: ["src/missing"], classPrefixes: ["t-"] } }) });
    const before = treeHash(ws);
    const result = await install({ project, configFrom: binding });
    assert.ok(result.problems.some((p) => p.includes("src/missing")), result.problems.join("\n"));
    assert.equal(treeHash(ws), before);
  }
  {
    const { ws, project, binding } = makeProject({ main: MAIN_ESM.replaceAll("@storybook/react-vite", "@storybook/react-webpack5") });
    const before = treeHash(ws);
    const result = await install({ project, configFrom: binding });
    assert.ok(result.problems.some((p) => p.includes("Vite builder")));
    assert.equal(treeHash(ws), before);
  }
});

test("an existing binding is kept even when --config differs", async () => {
  const { project, binding } = makeProject();
  await install({ project, configFrom: binding });
  const installed = path.join(project, ".storybook/code-layer/code-layer.config.json");
  const original = fs.readFileSync(installed);
  const other = path.join(path.dirname(binding), "other.json");
  fs.writeFileSync(other, `${JSON.stringify(fixtureConfig({ projectId: "other" }), null, 2)}\n`);
  const result = await install({ project, configFrom: other });
  assert.ok(result.warnings.some((w) => w.includes("保留既有設定")));
  assert.ok(fs.readFileSync(installed).equals(original));
});
