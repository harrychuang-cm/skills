#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const installer = path.join(scriptDir, "install_prototype_inspector.mjs");
const inspectorAssetDir = path.join(skillRoot, "assets", "prototype-inspector");
const flowLayoutAsset = path.join(
  skillRoot,
  "assets",
  "prototype-flow-layout",
  "prototypeFlowLayout.ts",
);
const fingerprintAsset = path.join(
  skillRoot,
  "assets",
  "prototype-review",
  "fingerprint.mjs",
);
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "prototype-inspector-installer-"),
);

// Static import declarations at a statement boundary (line start or right
// after ";"): `import ... from "x"` (including multi-line named lists) and
// `import "x"`. `import.meta` and dynamic `import(` are not declarations and
// never match. Re-exports (`export ... from "x"`) are not handled.
const importDeclarationPattern =
  /(?:^|;)[ \t]*import\s+(?:[^"'`;]*?\s*from\s*)?["']([^"'\n]+)["']/gm;
const importKeywordPattern = /(?:^|;)[ \t]*import\b(?!\s*[.(])/gm;
const resolvableExtensions = ["", ".ts", ".tsx", ".js", ".mjs"];

// Each case receives a fresh React Storybook project that holds only
// package.json and .storybook/main.ts.
const cases = [
  ["fresh install", testFreshInstall],
  ["existing fingerprint", testExistingFingerprintIsReused],
  ["v1 helper refused", testV1HelperIsRefused],
  [
    "v1 helper refused with existing inspector",
    testV1HelperIsRefusedWithExistingInspector,
  ],
  [
    "commented-out helper export refused",
    testCommentedOutHelperExportIsRefused,
  ],
  ["v1 helper replaced with --force", testV1HelperIsReplacedWithForce],
  ["compatible helper reused", testCompatibleHelperIsReused],
  ["non-React project refused", testNonReactProjectIsRefused],
  [
    "required names follow inspector imports",
    testRequiredNamesFollowInspectorImports,
  ],
  ["semicolon in a helper import comment", testSemicolonInHelperImportComment],
  [
    "unreadable inspector import stops the helper check",
    testUnreadableInspectorImportStopsHelperCheck,
  ],
];

try {
  for (const [name, testCase] of cases) {
    testCase(createReactProject(name));
    console.log(`PASS ${name}`);
  }
  console.log("Prototype Inspector installer tests passed.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function testFreshInstall(project) {
  const result = run(project);
  assert.equal(result.status, 0, result.stderr);

  const inspectorDir = path.join(project, ".storybook", "prototype-inspector");
  const helper = path.join(
    project,
    "src",
    "pages",
    "prototypes",
    "prototypeFlowLayout.ts",
  );
  const fingerprint = path.join(
    project,
    "scripts",
    "prototype-review",
    "fingerprint.mjs",
  );
  for (const relativePath of listFiles(inspectorAssetDir)) {
    assertSameBytes(
      path.join(inspectorDir, relativePath),
      path.join(inspectorAssetDir, relativePath),
    );
  }
  assertSameBytes(helper, flowLayoutAsset);
  assertSameBytes(fingerprint, fingerprintAsset);
  assertOutputLine(result, `Installed flow layout helper: ${helper}`);
  assertOutputLine(result, `Installed fingerprint: ${fingerprint}`);
  assertRelativeImportsResolve(project, inspectorDir);
}

function testExistingFingerprintIsReused(project) {
  const fingerprint = path.join(
    project,
    "scripts",
    "prototype-review",
    "fingerprint.mjs",
  );
  fs.mkdirSync(path.dirname(fingerprint), { recursive: true });
  // Differs from the bundled asset, so an overwrite cannot go unnoticed.
  fs.writeFileSync(
    fingerprint,
    'export function computeFingerprint() {\n  return "cfp-project-owned";\n}\n',
  );
  const before = fs.readFileSync(fingerprint);

  const result = run(project);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    fs.readFileSync(fingerprint).equals(before),
    `${fingerprint} must stay byte-identical when --force is absent`,
  );
  assertOutputLine(result, `Reused fingerprint: ${fingerprint}`);
}

function testV1HelperIsRefused(project) {
  assertV1HelperIsRefused(project);
}

// Installed projects carry an older inspector folder next to their v1 helper,
// so they must see the missing names rather than only "already exists".
function testV1HelperIsRefusedWithExistingInspector(project) {
  writeOldInspector(project);
  assertV1HelperIsRefused(project);
}

// A name that appears only inside a /* ... */ block comment is not exported,
// so that helper is refused like any other v1 helper.
function testCommentedOutHelperExportIsRefused(project) {
  assertV1HelperIsRefused(
    project,
    `${createV1HelperSource()}\n/*\nexport function getPrototypeFlowLayoutViewportSignature() {}\n*/\n`,
  );
}

function assertV1HelperIsRefused(
  project,
  helperSource = createV1HelperSource(),
) {
  const helper = writeHelper(project, helperSource);
  const before = snapshotTree(project);

  const result = run(project);
  assert.notEqual(result.status, 0, "A v1 helper must stop the install");
  assertErrorLine(
    result,
    `Existing flow layout helper ${helper} is missing exports required by the Prototype Inspector: getPrototypeFlowLayoutViewportSignature. Rerun with --force to replace it with the bundled helper.`,
  );
  assert.deepEqual(
    snapshotTree(project),
    before,
    "A refused install must leave every project file unchanged",
  );
}

function testV1HelperIsReplacedWithForce(project) {
  writeOldInspector(project);
  const helper = writeHelper(project, createV1HelperSource());

  const result = run(project, "--force");
  assert.equal(result.status, 0, result.stderr);
  assertSameBytes(helper, flowLayoutAsset);
  assertOutputLine(result, `Installed flow layout helper: ${helper}`);
}

function testCompatibleHelperIsReused(project) {
  // Exports every imported name but differs from the bundled asset, so an
  // overwrite cannot go unnoticed.
  const helper = writeHelper(
    project,
    `${fs.readFileSync(flowLayoutAsset, "utf8")}\n// Project-owned addition.\n`,
  );
  const before = fs.readFileSync(helper);

  const result = run(project);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    fs.readFileSync(helper).equals(before),
    `${helper} must stay byte-identical when --force is absent`,
  );
  assertOutputLine(result, `Reused flow layout helper: ${helper}`);
}

function testNonReactProjectIsRefused(project) {
  const mainPath = path.join(project, ".storybook", "main.ts");
  fs.writeFileSync(
    mainPath,
    `const config = {
  stories: ["../src/**/*.stories.ts"],
  addons: ["@storybook/addon-docs"],
  framework: { name: "@storybook/vue3-vite", options: {} },
};
export default config;
`,
  );
  // The renderer guard still runs first, so a v1 helper changes nothing.
  writeHelper(project, createV1HelperSource());
  const before = snapshotTree(project);

  const result = run(project);
  assert.equal(result.status, 1, result.stderr);
  assertErrorLine(
    result,
    `Prototype Inspector only supports React Storybook projects; ${mainPath} references @storybook/vue3.`,
  );
  assert.doesNotMatch(result.stderr, /missing exports/);
  assert.deepEqual(
    snapshotTree(project),
    before,
    "A refused install must leave every project file unchanged",
  );
}

// With the real assets, a fixed list of the six names preview.js imports would
// pass every other case, so an extra module that imports a new name shows that
// the required names come from the import declarations. It goes into a copy of
// the assets next to a copy of the installer, so the real assets stay untouched.
function testRequiredNamesFollowInspectorImports(project) {
  // Its helper import follows another import on the same line, aliases the
  // name, holds a comment and spells out the .ts extension.
  const runCopy = createInstallerCopyWithProbe(
    project,
    "skill-copy",
    `import "./prototype-inspector.css"; import {
  zzProbeExport as probe, // aliased
} from "../../src/pages/prototypes/prototypeFlowLayout.ts";
export { probe };
`,
  );

  const helper = writeHelper(project, createV1HelperSource());
  const before = snapshotTree(project);
  const refused = runCopy();
  assert.notEqual(
    refused.status,
    0,
    "A helper missing a newly imported name must stop the install",
  );
  assertErrorLine(
    refused,
    `Existing flow layout helper ${helper} is missing exports required by the Prototype Inspector: getPrototypeFlowLayoutViewportSignature, zzProbeExport. Rerun with --force to replace it with the bundled helper.`,
  );
  assert.deepEqual(
    snapshotTree(project),
    before,
    "A refused install must leave every project file unchanged",
  );

  // Declaring the new name, here as a const, makes the helper compatible.
  writeHelper(
    project,
    `${fs.readFileSync(flowLayoutAsset, "utf8")}\n` +
      'export const zzProbeExport = "probe";\n',
  );
  const reused = runCopy();
  assert.equal(reused.status, 0, reused.stderr);
  assertOutputLine(reused, `Reused flow layout helper: ${helper}`);
}

// A comment inside a named list may hold ";", which must not hide the import.
function testSemicolonInHelperImportComment(project) {
  const runCopy = createInstallerCopyWithProbe(
    project,
    "skill-copy-semicolon",
    `import {
  zzSemicolonProbe, // reused; keeps ids in sync
} from "../../src/pages/prototypes/prototypeFlowLayout";
export { zzSemicolonProbe };
`,
  );
  const helper = writeHelper(project, fs.readFileSync(flowLayoutAsset, "utf8"));
  const before = snapshotTree(project);

  const refused = runCopy();
  assert.notEqual(
    refused.status,
    0,
    "A helper missing a name imported behind a ';' comment must stop the install",
  );
  assertErrorLine(
    refused,
    `Existing flow layout helper ${helper} is missing exports required by the Prototype Inspector: zzSemicolonProbe. Rerun with --force to replace it with the bundled helper.`,
  );
  assert.deepEqual(
    snapshotTree(project),
    before,
    "A refused install must leave every project file unchanged",
  );
}

// An import the check cannot read could name a helper export, so the install
// stops instead of reusing a helper it could not check.
function testUnreadableInspectorImportStopsHelperCheck(project) {
  const runCopy = createInstallerCopyWithProbe(
    project,
    "skill-copy-unreadable",
    "import probe from `../../src/pages/prototypes/prototypeFlowLayout`;\n",
  );
  writeHelper(project, fs.readFileSync(flowLayoutAsset, "utf8"));
  const before = snapshotTree(project);

  const result = runCopy();
  assert.notEqual(
    result.status,
    0,
    "An unreadable inspector import must stop the install",
  );
  assert.match(
    result.stderr,
    /Cannot read the import statement at zz-helper-probe\.js:1 of the bundled Prototype Inspector/,
  );
  assert.deepEqual(
    snapshotTree(project),
    before,
    "A stopped install must leave every project file unchanged",
  );
}

// Copies the installer and its assets under tempRoot/<copyName>, adds
// zz-helper-probe.js to the copied inspector (it sorts after preview.js, which
// fixes the order of missing names) and returns a runner for the copied
// installer against project. The real assets are never touched.
function createInstallerCopyWithProbe(project, copyName, probeSource) {
  const skillCopy = path.join(tempRoot, copyName);
  for (const folder of [
    "prototype-inspector",
    "prototype-flow-layout",
    "prototype-review",
  ]) {
    fs.cpSync(
      path.join(skillRoot, "assets", folder),
      path.join(skillCopy, "assets", folder),
      { recursive: true },
    );
  }
  const installerCopy = path.join(
    skillCopy,
    "scripts",
    path.basename(installer),
  );
  fs.mkdirSync(path.dirname(installerCopy), { recursive: true });
  fs.copyFileSync(installer, installerCopy);
  fs.writeFileSync(
    path.join(skillCopy, "assets", "prototype-inspector", "zz-helper-probe.js"),
    probeSource,
  );
  return () =>
    spawnSync(process.execPath, [installerCopy, "--project-root", project], {
      encoding: "utf8",
    });
}

function assertRelativeImportsResolve(project, inspectorDir) {
  const modules = listFiles(inspectorDir).filter((relativePath) =>
    /\.(?:[cm]?js|jsx|tsx?)$/.test(relativePath),
  );
  assert.ok(
    modules.length > 0,
    `No inspector modules found in ${inspectorDir}`,
  );

  for (const modulePath of modules) {
    const file = path.join(inspectorDir, modulePath);
    for (const specifier of readImportSpecifiers(file)) {
      if (!/^\.{1,2}\//.test(specifier)) continue;
      const base = path.resolve(path.dirname(file), specifier);
      const target = resolvableExtensions
        .map((extension) => `${base}${extension}`)
        .find(isFile);
      assert.ok(
        target,
        `${modulePath} imports ${specifier}, which resolves to no project file`,
      );
      assert.ok(
        !path.relative(project, target).startsWith(`..${path.sep}`),
        `${modulePath} imports ${specifier}, which resolves outside the project: ${target}`,
      );
    }
  }
}

function readImportSpecifiers(file) {
  const source = fs.readFileSync(file, "utf8");
  const declarations = [...source.matchAll(importDeclarationPattern)];
  const parsedStarts = new Set(declarations.map((match) => match.index));
  // Fail rather than silently skip an import statement the pattern cannot read.
  for (const keyword of source.matchAll(importKeywordPattern)) {
    const line = source.slice(0, keyword.index).split("\n").length;
    assert.ok(
      parsedStarts.has(keyword.index),
      `${file}:${line} has an import statement the test cannot parse`,
    );
  }
  return declarations.map((match) => match[1]);
}

function createReactProject(name) {
  const root = path.join(tempRoot, name.replace(/[^a-z0-9]+/gi, "-"));
  fs.mkdirSync(path.join(root, ".storybook"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify(
      {
        name: path.basename(root),
        private: true,
        devDependencies: {
          "@storybook/react-vite": "^10.4.1",
          storybook: "^10.4.1",
        },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(root, ".storybook", "main.ts"),
    `const config = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: { name: "@storybook/react-vite", options: {} },
};
export default config;
`,
  );
  return root;
}

function writeHelper(project, source) {
  const helper = path.join(
    project,
    "src",
    "pages",
    "prototypes",
    "prototypeFlowLayout.ts",
  );
  fs.mkdirSync(path.dirname(helper), { recursive: true });
  fs.writeFileSync(helper, source);
  return helper;
}

// The bundled helper with getPrototypeFlowLayoutViewportSignature no longer
// exported: it still exports the five other names preview.js imports, like the
// version-1 helper installed projects carry.
function createV1HelperSource() {
  const declaration =
    "export function getPrototypeFlowLayoutViewportSignature(";
  const source = fs.readFileSync(flowLayoutAsset, "utf8");
  assert.ok(
    source.includes(declaration),
    `${flowLayoutAsset} no longer contains "${declaration}"`,
  );
  return source.replace(declaration, declaration.slice("export ".length));
}

function writeOldInspector(project) {
  const inspectorDir = path.join(project, ".storybook", "prototype-inspector");
  fs.mkdirSync(inspectorDir, { recursive: true });
  fs.writeFileSync(
    path.join(inspectorDir, "preview.js"),
    "// Inspector build installed before the fingerprint import.\n",
  );
}

// Every path under the project with a SHA-256 per file, so a changed file, a
// new file and a new folder all show up.
function snapshotTree(project) {
  return fs
    .readdirSync(project, { recursive: true })
    .map(String)
    .sort()
    .map((relativePath) => {
      const file = path.join(project, relativePath);
      return [
        relativePath,
        isFile(file)
          ? createHash("sha256").update(fs.readFileSync(file)).digest("hex")
          : "<dir>",
      ];
    });
}

function run(project, ...extraArgs) {
  return spawnSync(
    process.execPath,
    [installer, "--project-root", project, ...extraArgs],
    { encoding: "utf8" },
  );
}

function listFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((relativePath) => isFile(path.join(dir, relativePath)))
    .sort();
}

function isFile(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

function assertSameBytes(actualFile, expectedFile) {
  assert.ok(isFile(actualFile), `Missing installed file: ${actualFile}`);
  assert.ok(
    fs.readFileSync(actualFile).equals(fs.readFileSync(expectedFile)),
    `${actualFile} is not byte-identical to ${expectedFile}`,
  );
}

function assertOutputLine(result, line) {
  assert.ok(
    result.stdout.split("\n").includes(line),
    `Expected the stdout line "${line}", received:\n${result.stdout}`,
  );
}

function assertErrorLine(result, line) {
  assert.ok(
    result.stderr.split("\n").includes(line),
    `Expected the stderr line "${line}", received:\n${result.stderr}`,
  );
}
