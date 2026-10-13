#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { splitCssRules } from "./flow_css_rules.mjs";

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
// The version-1 helper the skill shipped in 2026-06, byte for byte (the one
// cm-chipK and other early projects still carry).
const shippedV1Helper = path.join(
  scriptDir,
  "test_install_prototype_inspector.helper-v1.fixture.txt",
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

// --ui-flow-only (inspector-runtime-distribution, "UI Flow-only installer
// update"). Each case installs the inspector, then customizes it the way a
// project such as cm-chipK does: Components code in preview.js and
// prototype-inspector.css, edits to manager.js and preset.js, and an older
// UI Flow module set.
const uiFlowModuleFiles = [
  "flow-canvas.js",
  "flow-canvas-geometry.js",
  "flow-canvas-hmr.js",
  "flow-snapshot.js",
  "flow-snapshot-cache.js",
  "flow-canvas.css",
];
const bundledFlowCanvasVersion = readFlowCanvasVersion(
  fs.readFileSync(path.join(inspectorAssetDir, "flow-canvas.js"), "utf8"),
);
const olderFlowCanvasVersion = "flow-canvas-2026-01-01";
const componentsRule =
  "\n/* Project Components customization. */\n.prototype-inspector__components-acme {\n  color: var(--pi-sys-color-primary);\n}\n";
const staleFlowRule =
  "\n.prototype-inspector__flow-viewport {\n  overflow: clip;\n}\n";

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
  ["addon order outcomes", testAddonOrderOutcomes],
  ["ui-flow-only keeps customized files", testUiFlowOnlyKeepsCustomizedFiles],
  ["ui-flow-only stops on an embedded UI Flow", testUiFlowOnlyStopsOnEmbeddedFlow],
  ["ui-flow-only stops on a removed import", testUiFlowOnlyStopsOnRemovedImport],
  ["ui-flow-only lists missing tokens", testUiFlowOnlyListsMissingTokens],
  ["ui-flow-only strips stale rules on request", testUiFlowOnlyStripsStaleRules],
  ["ui-flow-only dry run writes nothing", testUiFlowOnlyDryRun],
  ["ui-flow-only flag combinations", testUiFlowOnlyFlagCombinations],
  ["ui-flow-only needs an installed inspector", testUiFlowOnlyNeedsInstalledInspector],
  ["ui-flow-only stops on unreadable CSS", testUiFlowOnlyStopsOnUnreadableCss],
  ["ui-flow-only helper and fingerprint", testUiFlowOnlyHelperAndFingerprint],
  ["ui-flow-only lists mixed rules and keeps them", testUiFlowOnlyKeepsMixedRules],
  ["ui-flow-only without prototype-inspector.css", testUiFlowOnlyWithoutInspectorCss],
  ["ui-flow-only lists missing shared rules and script tokens", testUiFlowOnlyListsSharedRulesAndScriptTokens],
  ["ui-flow-only keeps a helper that exports through a list", testUiFlowOnlyKeepsExportListHelper],
  ["ui-flow-only stops before dropping a project helper export", testUiFlowOnlyStopsBeforeDroppingHelperExport],
  ["ui-flow-only checks re-exports", testUiFlowOnlyChecksReExports],
  ["ui-flow-only ignores commented-out imports", testUiFlowOnlyIgnoresCommentedImports],
  ["ui-flow-only rejects flags without a value", testUiFlowOnlyRejectsFlagsWithoutValue],
  ["ui-flow-only replaces a helper despite type imports", testUiFlowOnlyReplacesHelperDespiteTypeImports],
  ["ui-flow-only reads past regular expression literals", testUiFlowOnlyReadsPastRegexLiterals],
  ["ui-flow-only skips folders and broken symlinks", testUiFlowOnlySkipsNonFiles],
  ["ui-flow-only ignores type-only imports", testUiFlowOnlyIgnoresTypeOnlyImports],
  ["ui-flow-only stops on edited older helpers", testUiFlowOnlyStopsOnEditedOlderHelpers],
  ["ui-flow-only scanner edge cases", testUiFlowOnlyScannerEdgeCases],
  ["ui-flow-only reuses current helper variants", testUiFlowOnlyReusesCurrentHelperVariants],
  ["ui-flow-only reads JSX modules", testUiFlowOnlyReadsJsxModules],
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

  // --ui-flow-only stops the same way, without pointing a customized project
  // at --force.
  createCustomizedInstall(project);
  const installed = snapshotTree(project);
  const uiFlowOnly = runCopy("--ui-flow-only");
  assert.equal(uiFlowOnly.status, 1, uiFlowOnly.stdout);
  assert.match(
    uiFlowOnly.stderr,
    /^ui-flow-only: Cannot read the import statement at zz-helper-probe\.js:1 of the bundled Prototype Inspector, so the flow layout helper exports cannot be checked\. Report it against the skill; do not rerun with --force on a customized project\.$/m,
  );
  assert.deepEqual(snapshotTree(project), installed, "nothing is written");
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
  // The installer imports the stylesheet rule parser next to it.
  fs.copyFileSync(
    path.join(scriptDir, "flow_css_rules.mjs"),
    path.join(skillCopy, "scripts", "flow_css_rules.mjs"),
  );
  fs.writeFileSync(
    path.join(skillCopy, "assets", "prototype-inspector", "zz-helper-probe.js"),
    probeSource,
  );
  return (...extraArgs) =>
    spawnSync(
      process.execPath,
      [installerCopy, "--project-root", project, ...extraArgs],
      { encoding: "utf8" },
    );
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

// Example "addon order outcomes": the inspector preset follows the
// figma-export addon, so the addon's decorator wraps every Inspector mode.
function testAddonOrderOutcomes(project) {
  const inspectorEntry = 'new URL("./prototype-inspector/preset.js", import.meta.url).pathname';
  const entries = {
    docs: '"@storybook/addon-docs"',
    "figma-export": '"@harrychuang/storybook-addon-figma-export"',
    inspector: inspectorEntry,
  };
  const rows = [
    [["docs", "figma-export"], ["docs", "figma-export", "inspector"], false],
    [["docs"], ["inspector", "docs"], false],
    [["inspector", "docs", "figma-export"], ["docs", "figma-export", "inspector"], true],
    [["docs", "figma-export", "inspector"], ["docs", "figma-export", "inspector"], false],
  ];
  const reorderLine =
    "Reordered Storybook addons: the Prototype Inspector preset now follows @harrychuang/storybook-addon-figma-export, so figma-export review runs in every Inspector mode.";
  const mainPath = path.join(project, ".storybook", "main.ts");
  const inspectorDir = path.join(project, ".storybook", "prototype-inspector");
  for (const [before, after, reordered] of rows) {
    fs.rmSync(inspectorDir, { recursive: true, force: true });
    const original = `const config = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [
${before.map((name) => `    ${entries[name]},`).join("\n")}
  ],
  framework: { name: "@storybook/react-vite", options: {} },
};
export default config;
`;
    fs.writeFileSync(mainPath, original);
    const result = run(project, "--force");
    assert.equal(result.status, 0, `${before.join(", ")}: ${result.stderr}`);
    const written = fs.readFileSync(mainPath, "utf8");
    const addons = written.match(/addons:\s*\[([\s\S]*?)\n  \]/)?.[1] ?? "";
    const order = [...addons.matchAll(/@storybook\/addon-docs|@harrychuang\/storybook-addon-figma-export|prototype-inspector\/preset\.js/g)].map(
      ([match]) =>
        match === "@storybook/addon-docs"
          ? "docs"
          : match.startsWith("@harrychuang")
            ? "figma-export"
            : "inspector",
    );
    assert.deepEqual(order, after, `addons ${before.join(", ")} become ${after.join(", ")}`);
    if (before.join() === after.join()) {
      assert.equal(written, original, `${before.join(", ")}: an already ordered main config is unchanged`);
    }
    assert.equal(
      result.stdout.split("\n").includes(reorderLine),
      reordered,
      `${before.join(", ")}: reorder line ${reordered ? "printed" : "absent"}`,
    );
    // The rewritten config still parses as a module.
    assert.doesNotThrow(
      () => new Function(written.replace("export default config;", "return config;").replace(/import\.meta\.url/g, '"file:///x"')),
      `${before.join(", ")}: rewritten main config is valid JavaScript`,
    );
  }
}

function readFlowCanvasVersion(source) {
  return /^export const flowCanvasVersion = "([^"]+)";$/m.exec(source)?.[1];
}

function createCustomizedInstall(project) {
  const install = run(project);
  assert.equal(install.status, 0, install.stderr);
  const inspectorDir = path.join(project, ".storybook", "prototype-inspector");
  const append = (name, text) =>
    fs.appendFileSync(path.join(inspectorDir, name), text);
  // A Components mode that measures route previews with the shared helpers.
  const preview = path.join(inspectorDir, "preview.js");
  fs.writeFileSync(
    preview,
    `import { getMeasuredFramePreviewSize, routePreviewMeasurementSelector } from "./flow-canvas.js";\n${fs.readFileSync(preview, "utf8")}`,
  );
  append(
    "preview.js",
    '\n// Project Components customization.\nexport const acmeComponentsMode = [getMeasuredFramePreviewSize, routePreviewMeasurementSelector];\n',
  );
  append("prototype-inspector.css", componentsRule);
  append("manager.js", "\n// Project manager customization.\n");
  append("preset.js", "\n// Project preset customization.\n");
  // An older UI Flow module set: every file differs from the bundled one.
  for (const name of uiFlowModuleFiles) {
    const file = path.join(inspectorDir, name);
    const source = fs.readFileSync(file, "utf8");
    fs.writeFileSync(
      file,
      name === "flow-canvas.js"
        ? source.replace(bundledFlowCanvasVersion, olderFlowCanvasVersion)
        : `${source}\n/* older build */\n`,
    );
  }
  return inspectorDir;
}

function readProjectFiles(project, inspectorDir) {
  return Object.fromEntries(
    [
      path.join(inspectorDir, "preview.js"),
      path.join(inspectorDir, "prototype-inspector.css"),
      path.join(inspectorDir, "manager.js"),
      path.join(inspectorDir, "preset.js"),
      path.join(project, ".storybook", "main.ts"),
    ].map((file) => [file, fs.readFileSync(file)]),
  );
}

function assertProjectFilesUnchanged(before) {
  for (const [file, bytes] of Object.entries(before)) {
    assert.ok(
      fs.readFileSync(file).equals(bytes),
      `${file} must stay byte-identical under --ui-flow-only`,
    );
  }
}

function assertModuleSetIsBundled(inspectorDir) {
  for (const name of uiFlowModuleFiles) {
    assertSameBytes(
      path.join(inspectorDir, name),
      path.join(inspectorAssetDir, name),
    );
  }
}

function testUiFlowOnlyKeepsCustomizedFiles(project) {
  const inspectorDir = createCustomizedInstall(project);
  const before = readProjectFiles(project, inspectorDir);

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 0, result.stderr);
  assertModuleSetIsBundled(inspectorDir);
  assertProjectFilesUnchanged(before);
  assertOutputLine(
    result,
    `Updated UI Flow module set (${olderFlowCanvasVersion} -> ${bundledFlowCanvasVersion})`,
  );
  for (const name of uiFlowModuleFiles) {
    assertOutputLine(result, `  ${path.join(inspectorDir, name)}`);
  }
  assertOutputLine(result, "Missing --pi tokens: none");
  assertOutputLine(result, "Missing shared rules in prototype-inspector.css: none");
  assertOutputLine(result, "Stale UI Flow rules in prototype-inspector.css: 0");
}

function testUiFlowOnlyStopsOnEmbeddedFlow(project) {
  const inspectorDir = createCustomizedInstall(project);
  // An older preview.js that defines its own UI Flow.
  fs.writeFileSync(
    path.join(inspectorDir, "preview.js"),
    'import { createElement } from "react";\n\nfunction PrototypeFlow() {\n  return createElement("div");\n}\n\nexport const decorators = [PrototypeFlow];\n',
  );
  const before = snapshotTree(project);

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 1, result.stdout);
  assert.deepEqual(snapshotTree(project), before, "nothing is written");
  const line = result.stderr
    .split("\n")
    .find((entry) => entry.startsWith("ui-flow-only: "));
  assert.ok(line, `Expected a ui-flow-only: line, received:\n${result.stderr}`);
  assert.match(line, /does not import PrototypeFlow from \.\/flow-canvas\.js/);
  assert.match(line, /one-time extraction/);
  assert.match(line, /--force/);
}

function testUiFlowOnlyStopsOnRemovedImport(project) {
  const inspectorDir = createCustomizedInstall(project);
  const preview = path.join(inspectorDir, "preview.js");
  fs.writeFileSync(
    preview,
    `import { oldHelper } from "./flow-canvas-geometry.js";\n${fs.readFileSync(preview, "utf8")}`,
  );
  const before = snapshotTree(project);

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 1, result.stdout);
  assert.deepEqual(snapshotTree(project), before, "nothing is written");
  assert.match(result.stderr, /^ui-flow-only: .*oldHelper \(flow-canvas-geometry\.js\)/m);
}

function testUiFlowOnlyListsMissingTokens(project) {
  const inspectorDir = createCustomizedInstall(project);
  const css = path.join(inspectorDir, "prototype-inspector.css");
  const token = "--pi-sys-color-annotation-touch-target";
  const withoutToken = fs
    .readFileSync(css, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith(`${token}:`))
    .join("\n");
  assert.notEqual(withoutToken, fs.readFileSync(css, "utf8"), `${token} was defined`);
  fs.writeFileSync(css, withoutToken);
  const before = fs.readFileSync(css);

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 0, result.stderr);
  assertOutputLine(result, `Missing --pi tokens: ${token}`);
  assert.ok(fs.readFileSync(css).equals(before), "the token layer is not written");
  assertModuleSetIsBundled(inspectorDir);
}

function testUiFlowOnlyStripsStaleRules(project) {
  const inspectorDir = createCustomizedInstall(project);
  const css = path.join(inspectorDir, "prototype-inspector.css");
  const withoutStale = fs.readFileSync(css, "utf8");
  fs.writeFileSync(css, `${withoutStale}${staleFlowRule}`);
  const withStale = fs.readFileSync(css);

  const kept = run(project, "--ui-flow-only");
  assert.equal(kept.status, 0, kept.stderr);
  assertOutputLine(kept, "Stale UI Flow rules in prototype-inspector.css: 1");
  assert.match(kept.stdout, /\.prototype-inspector__flow-viewport/);
  assertOutputLine(
    kept,
    "Kept them. They still load before flow-canvas.css and override the new canvas wherever they are more specific or it leaves a property unset; rerun with --strip-flow-css to remove them.",
  );
  assert.ok(fs.readFileSync(css).equals(withStale), "the stale rule stays without --strip-flow-css");

  const stripped = run(project, "--ui-flow-only", "--strip-flow-css");
  assert.equal(stripped.status, 0, stripped.stderr);
  assertOutputLine(stripped, "Stale UI Flow rules in prototype-inspector.css: 1");
  assert.equal(
    fs.readFileSync(css, "utf8"),
    withoutStale,
    "--strip-flow-css removes only the stale rule; the Components rule is byte-identical",
  );
  assert.ok(fs.readFileSync(css, "utf8").endsWith(componentsRule));
}

function testUiFlowOnlyDryRun(project) {
  const inspectorDir = createCustomizedInstall(project);
  fs.appendFileSync(path.join(inspectorDir, "prototype-inspector.css"), staleFlowRule);
  const before = snapshotTree(project);

  const result = run(project, "--ui-flow-only", "--dry-run", "--strip-flow-css");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshotTree(project), before, "a dry run writes nothing");
  assertOutputLine(
    result,
    `Would update UI Flow module set (${olderFlowCanvasVersion} -> ${bundledFlowCanvasVersion})`,
  );
  for (const name of uiFlowModuleFiles) {
    assertOutputLine(result, `  ${path.join(inspectorDir, name)}`);
  }
  assertOutputLine(result, "Missing --pi tokens: none");
  assertOutputLine(result, "Stale UI Flow rules in prototype-inspector.css: 1");
}

// spec: inspector-runtime-distribution, Example: flag combinations.
function testUiFlowOnlyFlagCombinations(project) {
  const accepted = [
    [["--ui-flow-only"], "Updated UI Flow module set"],
    [["--ui-flow-only", "--dry-run"], "Would update UI Flow module set"],
    [["--ui-flow-only", "--strip-flow-css"], "Updated UI Flow module set"],
  ];
  accepted.forEach(([flags, firstLine], index) => {
    const subproject = createReactProject(`${path.basename(project)}-accepted-${index}`);
    createCustomizedInstall(subproject);
    const result = run(subproject, ...flags);
    assert.equal(result.status, 0, `${flags.join(" ")}: ${result.stderr}`);
    assert.ok(result.stdout.startsWith(firstLine), `${flags.join(" ")}: ${result.stdout}`);
  });

  // Rejected before any check: the project has no inspector folder, so a
  // flag error must win over the folder check.
  const rejected = [
    ["--ui-flow-only", "--force"],
    ["--ui-flow-only", "--token-prefix", "acme"],
    ["--dry-run"],
    ["--strip-flow-css"],
  ];
  const before = snapshotTree(project);
  for (const flags of rejected) {
    const result = run(project, ...flags);
    assert.equal(result.status, 1, `${flags.join(" ")} must be rejected`);
    assert.match(
      result.stderr,
      /--ui-flow-only cannot be combined with --force or --token-prefix|--dry-run and --strip-flow-css only apply with --ui-flow-only/,
      `${flags.join(" ")}: ${result.stderr}`,
    );
    assert.doesNotMatch(result.stderr, /^ui-flow-only: /m, `${flags.join(" ")} is rejected before any check`);
  }
  assert.deepEqual(snapshotTree(project), before, "rejected flags write nothing");
}

function testUiFlowOnlyNeedsInstalledInspector(project) {
  const before = snapshotTree(project);
  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 1, result.stdout);
  assert.deepEqual(snapshotTree(project), before, "nothing is written");
  assert.match(result.stderr, /^ui-flow-only: .*prototype-inspector does not exist\. Run the installer without --ui-flow-only/m);
}

function testUiFlowOnlyStopsOnUnreadableCss(project) {
  const inspectorDir = createCustomizedInstall(project);
  fs.appendFileSync(
    path.join(inspectorDir, "prototype-inspector.css"),
    "\n.prototype-inspector__components-broken {\n  color: red;\n",
  );
  const before = snapshotTree(project);

  const result = run(project, "--ui-flow-only", "--strip-flow-css");
  assert.equal(result.status, 1, result.stdout);
  assert.deepEqual(snapshotTree(project), before, "nothing is written");
  assert.match(result.stderr, /^ui-flow-only: cannot read the rules of .*prototype-inspector\.css: Unbalanced "\{" opened at line \d+/m);
}

function testUiFlowOnlyHelperAndFingerprint(project) {
  const inspectorDir = createCustomizedInstall(project);
  // CRLF line endings, a byte order mark and no final newline are not edits.
  const helper = writeHelper(project, `\uFEFF${fs.readFileSync(shippedV1Helper, "utf8").replace(/\n/g, "\r\n").trimEnd()}`);
  const fingerprint = path.join(project, "scripts", "prototype-review", "fingerprint.mjs");
  fs.rmSync(fingerprint);

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 0, result.stderr);
  assertSameBytes(helper, flowLayoutAsset);
  assertSameBytes(fingerprint, fingerprintAsset);
  assertOutputLine(
    result,
    `Replaced flow layout helper (missing exports: getPrototypeFlowLayoutViewportSignature; schema version 1, the runtime needs 2): ${helper}`,
  );
  assertOutputLine(result, `Installed fingerprint: ${fingerprint}`);

  // A compatible helper and an existing fingerprint are kept.
  const projectFingerprint = 'export function computeFingerprint() {\n  return "cfp-project-owned";\n}\n';
  fs.writeFileSync(fingerprint, projectFingerprint);
  const again = run(project, "--ui-flow-only");
  assert.equal(again.status, 0, again.stderr);
  assertOutputLine(again, `Reused flow layout helper: ${helper}`);
  assertOutputLine(again, `Reused fingerprint: ${fingerprint}`);
  assert.equal(fs.readFileSync(fingerprint, "utf8"), projectFingerprint);
  assertModuleSetIsBundled(inspectorDir);
}

function testUiFlowOnlyKeepsMixedRules(project) {
  const inspectorDir = createCustomizedInstall(project);
  const css = path.join(inspectorDir, "prototype-inspector.css");
  const mixedRule =
    "\n.prototype-inspector__markdown h3,\n.prototype-inspector__flow-summary h3 {\n  margin: 0;\n}\n";
  const withMixed = `${fs.readFileSync(css, "utf8")}${mixedRule}`;
  fs.writeFileSync(css, `${withMixed}${staleFlowRule}`);

  const result = run(project, "--ui-flow-only", "--strip-flow-css");
  assert.equal(result.status, 0, result.stderr);
  assertOutputLine(
    result,
    "Mixed rules in prototype-inspector.css (UI Flow and other selectors in one list, never removed): 1",
  );
  assert.match(result.stdout, /line \d+: \.prototype-inspector__markdown h3, \.prototype-inspector__flow-summary h3/);
  assert.equal(
    fs.readFileSync(css, "utf8"),
    withMixed,
    "--strip-flow-css removes the stale rule and keeps the mixed rule",
  );
}

function testUiFlowOnlyWithoutInspectorCss(project) {
  const inspectorDir = createCustomizedInstall(project);
  const css = path.join(inspectorDir, "prototype-inspector.css");
  fs.rmSync(css);
  // Tokens flow-canvas.css reads plus those the module scripts set inline.
  const moduleSources = uiFlowModuleFiles
    .map((name) => fs.readFileSync(path.join(inspectorAssetDir, name), "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const everyToken = [
    ...new Set([...moduleSources.matchAll(/var\(\s*(--pi-[\w-]+)/g)].map((match) => match[1])),
  ].sort();
  assert.ok(everyToken.includes("--pi-sys-state-opacity-annotation-medium"), "a token only the scripts read");

  const result = run(project, "--ui-flow-only", "--strip-flow-css");
  assert.equal(result.status, 0, result.stderr);
  assertOutputLine(
    result,
    `${css} is missing: flow-canvas.js imports it for the --pi-* token layer, so restore it before starting Storybook.`,
  );
  assertOutputLine(result, `Missing --pi tokens: ${everyToken.join(", ")}`);
  assertOutputLine(
    result,
    "Missing shared rules in prototype-inspector.css: .prototype-inspector, .prototype-inspector__components-count, .prototype-inspector__empty",
  );
  assertOutputLine(result, "Stale UI Flow rules in prototype-inspector.css: 0");
  assert.ok(!fs.existsSync(css), "the installer does not create prototype-inspector.css");
  assertModuleSetIsBundled(inspectorDir);
}

// The UI Flow also relies on shared rules the project's stylesheet owns and on
// tokens its scripts set inline; both are reported, never written.
function testUiFlowOnlyListsSharedRulesAndScriptTokens(project) {
  const inspectorDir = createCustomizedInstall(project);
  const css = path.join(inspectorDir, "prototype-inspector.css");
  const token = "--pi-sys-state-opacity-annotation-medium";
  const edited = splitCssRules(fs.readFileSync(css, "utf8"))
    .filter((fragment) => !fragment.selector.includes(".prototype-inspector__components-count"))
    .map((fragment) => fragment.text)
    .join("")
    .split("\n")
    .filter((line) => !line.trim().startsWith(`${token}:`))
    .join("\n");
  fs.writeFileSync(css, edited);
  const before = fs.readFileSync(css);

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 0, result.stderr);
  assertOutputLine(result, `Missing --pi tokens: ${token}`);
  assertOutputLine(
    result,
    "Missing shared rules in prototype-inspector.css: .prototype-inspector__components-count",
  );
  assert.ok(fs.readFileSync(css).equals(before), "the stylesheet is not written");
}

// The bundled helper with its declarations exported through one list, plus a
// project-only export.
function createExportListHelperSource({ dropViewportSignature = false } = {}) {
  const source = fs.readFileSync(flowLayoutAsset, "utf8");
  const names = [...source.matchAll(/^export (?:function|const) ([A-Za-z_$][\w$]*)/gm)]
    .map((match) => match[1])
    .filter((name) => !(dropViewportSignature && name === "getPrototypeFlowLayoutViewportSignature"));
  return `${source.replace(/^export (function|const) /gm, "$1 ")}
export function getAcmeLayoutPreset() {
  return "acme";
}

export {
  ${names.join(",\n  ")},
};
`;
}

function addHelperImport(inspectorDir) {
  const preview = path.join(inspectorDir, "preview.js");
  fs.writeFileSync(
    preview,
    `import { getAcmeLayoutPreset } from "../../src/pages/prototypes/prototypeFlowLayout";\n${fs.readFileSync(preview, "utf8")}`,
  );
}

function testUiFlowOnlyKeepsExportListHelper(project) {
  const inspectorDir = createCustomizedInstall(project);
  addHelperImport(inspectorDir);
  const helper = writeHelper(project, createExportListHelperSource());
  const before = fs.readFileSync(helper);

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 0, result.stderr);
  assertOutputLine(result, `Reused flow layout helper: ${helper}`);
  assert.ok(fs.readFileSync(helper).equals(before), "a complete helper is never replaced");
}

// Fails closed: whatever imports it (a .js specifier, an alias, a namespace
// import, import()), a helper export the bundled helper lacks stops the run.
function testUiFlowOnlyStopsBeforeDroppingHelperExport(project) {
  createCustomizedInstall(project);
  writeHelper(project, createExportListHelperSource({ dropViewportSignature: true }));
  const demo = path.join(project, "src", "pages", "prototypes", "demo", "Demo.tsx");
  fs.mkdirSync(path.dirname(demo), { recursive: true });
  fs.writeFileSync(demo, 'export const preset = () => import("@/pages/prototypes/prototypeFlowLayout").then((m) => m.getAcmeLayoutPreset());\n');
  const before = snapshotTree(project);

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 1, result.stdout);
  assert.deepEqual(snapshotTree(project), before, "nothing is written");
  assert.match(
    result.stderr,
    /^ui-flow-only: the flow layout helper .* is older than the runtime \(missing exports: getPrototypeFlowLayoutViewportSignature\) and has been edited, so replacing it would lose the project's changes\. Merge it by hand: start from the skill's assets\/prototype-flow-layout\/prototypeFlowLayout\.ts and re-add the project's own code, then rerun\./m,
  );
}

// Edited older helpers stop whatever form their own code takes, including
// one that already has every export name but still writes version-1 layouts.
// A current helper is reused however its version constant is written, and a
// version mentioned in a comment does not count.
function testUiFlowOnlyReusesCurrentHelperVariants(project) {
  createCustomizedInstall(project);
  const bundled = fs.readFileSync(flowLayoutAsset, "utf8");
  for (const source of [
    bundled.replace("export const prototypeFlowLayoutSchemaVersion = 2;", "export const prototypeFlowLayoutSchemaVersion: number = 2;"),
    `// Bumped prototypeFlowLayoutSchemaVersion = 1 -> 2 for viewport signatures.\n${bundled}`,
  ]) {
    assert.notEqual(source, bundled);
    const helper = writeHelper(project, source);
    const result = run(project, "--ui-flow-only");
    assert.equal(result.status, 0, result.stderr);
    assertOutputLine(result, `Reused flow layout helper: ${helper}`);
    assert.equal(fs.readFileSync(helper, "utf8"), source);
  }
}

function testUiFlowOnlyStopsOnEditedOlderHelpers(project) {
  createCustomizedInstall(project);
  const v1 = fs.readFileSync(shippedV1Helper, "utf8");
  const bundled = fs.readFileSync(flowLayoutAsset, "utf8");
  const viewportSignature = bundled.slice(
    bundled.indexOf("export function getPrototypeFlowLayoutViewportSignature("),
  );
  for (const [label, source, reason] of [
    ["enum export", `${v1}\nexport enum AcmeLane { Main = "main" }\n`, /missing exports: getPrototypeFlowLayoutViewportSignature/],
    ["class export", `${v1}\nexport class AcmeLayoutCache {}\n`, /missing exports: getPrototypeFlowLayoutViewportSignature/],
    ["hybrid", `${v1}\nexport type PrototypeFlowLayoutViewport = { width: number; height: number };\n${viewportSignature.slice(0, viewportSignature.indexOf("\n}\n") + 3)}`, /schema version 1, the runtime needs 2/],
    [
      "hybrid with a version in a comment",
      `// TODO: move to prototypeFlowLayoutSchemaVersion = 2 once saved layouts carry viewports\n${v1}\nexport type PrototypeFlowLayoutViewport = { width: number; height: number };\n${viewportSignature.slice(0, viewportSignature.indexOf("\n}\n") + 3)}`,
      /schema version 1, the runtime needs 2/,
    ],
  ]) {
    const helper = writeHelper(project, source);
    const before = snapshotTree(project);
    const result = run(project, "--ui-flow-only");
    assert.equal(result.status, 1, `${label}: ${result.stdout}`);
    assert.match(result.stderr, reason, `${label}: ${result.stderr}`);
    assert.match(result.stderr, /has been edited/, label);
    assert.deepEqual(snapshotTree(project), before, `${label}: nothing is written`);
    assert.equal(fs.readFileSync(helper, "utf8"), source, label);
  }
}

// Type imports from the helper (as the skill's FlowExport templates write
// them) never block replacing an older helper.
function testUiFlowOnlyReplacesHelperDespiteTypeImports(project) {
  createCustomizedInstall(project);
  const helper = writeHelper(project, fs.readFileSync(shippedV1Helper, "utf8"));
  const flowExport = path.join(project, "src", "pages", "prototypes", "demo", "DemoFlowExport.tsx");
  fs.mkdirSync(path.dirname(flowExport), { recursive: true });
  fs.writeFileSync(
    flowExport,
    'import {\n  getPrototypeFlowLayoutStorageKey,\n  readPrototypeFlowLayoutPositions,\n  type PrototypeFlowLayoutPositions,\n} from "../prototypeFlowLayout";\nimport type { PrototypeFlowLayoutPayload } from "../prototypeFlowLayout";\n',
  );

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 0, result.stderr);
  assertSameBytes(helper, flowLayoutAsset);
}

// The bundled preview.js holds a regular expression with backticks; imports
// and templates after it must still be read as what they are.
function testUiFlowOnlyReadsPastRegexLiterals(project) {
  const inspectorDir = createCustomizedInstall(project);
  const preview = path.join(inspectorDir, "preview.js");
  const bundledPreview = fs.readFileSync(path.join(inspectorAssetDir, "preview.js"), "utf8");
  assert.match(bundledPreview, /\/\(`\[\^`\]\+`\)/, "the bundled preview.js still has the backtick regex");

  // A real import after the regex is seen.
  fs.writeFileSync(preview, `${bundledPreview}\nimport { oldHelper } from "./flow-canvas-geometry.js";\n`);
  let before = snapshotTree(project);
  let result = run(project, "--ui-flow-only");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /oldHelper \(flow-canvas-geometry\.js\)/);
  assert.deepEqual(snapshotTree(project), before, "nothing is written");

  // An import written inside templates after the regex is not.
  const embedded = bundledPreview.replace(/^  PrototypeFlow,\n/m, "").replace(
    /^import "\.\/prototype-inspector\.css";$/m,
    'import "./prototype-inspector.css";\nfunction PrototypeFlow() {}',
  );
  assert.notEqual(embedded, bundledPreview);
  fs.writeFileSync(
    preview,
    `${embedded}\nconst note = \`\nimport { PrototypeFlow } from "./flow-canvas.js";\n\`;\nconst snippet = (on) => \`\${on ? \`\nimport { PrototypeFlow } from "./flow-canvas.js";\n\` : ""}x\`;\n`,
  );
  before = snapshotTree(project);
  result = run(project, "--ui-flow-only", "--strip-flow-css");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /does not import PrototypeFlow from \.\/flow-canvas\.js/);
  assert.deepEqual(snapshotTree(project), before, "nothing is written");
}

// TypeScript's non-null "!" and postfix ++ / -- end an expression, so a "/"
// after them divides; a scan that ends inside a bracket or template stops.
function testUiFlowOnlyScannerEdgeCases(project) {
  const inspectorDir = createCustomizedInstall(project);
  const panel = path.join(inspectorDir, "acme-panel.ts");
  for (const [source, message] of [
    [
      'const size: number | undefined = 4;\nlet i = 0;\nexport const half = size! / 2 + i++ / 2;\nexport const unit = `${half}px / 2`;\nimport { oldHelper } from "./flow-canvas-geometry.js";\n',
      /oldHelper \(flow-canvas-geometry\.js\) in acme-panel\.ts/,
    ],
    ['export const open = () => {\n  return `unclosed ${"x"\n', /cannot read acme-panel\.ts reliably/],
    ['import 流程 from "./flow-canvas.js";\nexport default 流程;\n', /default \(flow-canvas\.js\) in acme-panel\.ts/],
  ]) {
    fs.writeFileSync(panel, source);
    const before = snapshotTree(project);
    const result = run(project, "--ui-flow-only");
    assert.equal(result.status, 1, `${source}\n${result.stdout}`);
    assert.match(result.stderr, message);
    assert.deepEqual(snapshotTree(project), before, "nothing is written");
  }
}

// JSX closing and self-closing tags in .jsx / .tsx project modules are not
// regular expressions.
function testUiFlowOnlyReadsJsxModules(project) {
  const inspectorDir = createCustomizedInstall(project);
  fs.writeFileSync(
    path.join(inspectorDir, "panel.jsx"),
    'export const Row = ({ a }) => <li className="row">{a.map((x) => <b key={x}>{x}</b>)}</li>;\nexport const Close = () => <span actions={<i label="x"><CloseGlyph /></i>} />;\nimport { oldHelper } from "./flow-canvas-geometry.js";\n',
  );
  const before = snapshotTree(project);
  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /oldHelper \(flow-canvas-geometry\.js\) in panel\.jsx/);
  assert.deepEqual(snapshotTree(project), before, "nothing is written");
}

// Folders named like modules and broken symlinks in the inspector folder are
// skipped, not read.
function testUiFlowOnlySkipsNonFiles(project) {
  const inspectorDir = createCustomizedInstall(project);
  fs.mkdirSync(path.join(inspectorDir, "vendor", "chart.js"), { recursive: true });
  fs.symlinkSync(path.join(inspectorDir, "missing-target.js"), path.join(inspectorDir, "legacy.js"));

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 0, result.stderr);
  assertModuleSetIsBundled(inspectorDir);
}

// Type-only names cannot break at runtime, so they are not checked.
function testUiFlowOnlyIgnoresTypeOnlyImports(project) {
  const inspectorDir = createCustomizedInstall(project);
  fs.writeFileSync(
    path.join(inspectorDir, "components-mode.ts"),
    'import { type FlowCanvasProps, PrototypeFlow } from "./flow-canvas.js";\nimport type { GeometryTypes } from "./flow-canvas-geometry.js";\nexport const mode = PrototypeFlow;\n',
  );

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 0, result.stderr);
}

function testUiFlowOnlyChecksReExports(project) {
  const inspectorDir = createCustomizedInstall(project);
  fs.writeFileSync(
    path.join(inspectorDir, "components-mode.js"),
    'export { oldHelper } from "./flow-canvas-geometry.js";\n',
  );
  const before = snapshotTree(project);

  const result = run(project, "--ui-flow-only");
  assert.equal(result.status, 1, result.stdout);
  assert.deepEqual(snapshotTree(project), before, "nothing is written");
  assert.match(result.stderr, /^ui-flow-only: .*oldHelper \(flow-canvas-geometry\.js\) in components-mode\.js/m);
}

function testUiFlowOnlyIgnoresCommentedImports(project) {
  const inspectorDir = createCustomizedInstall(project);
  const preview = path.join(inspectorDir, "preview.js");
  for (const wrapper of [
    (line) => `/*\n${line}\n*/\n`,
    (line) => `const note = \`\n${line}\n\`;\n`,
  ]) {
    fs.writeFileSync(
      preview,
      `${wrapper('import { PrototypeFlow } from "./flow-canvas.js";')}function PrototypeFlow() {}\nexport const decorators = [PrototypeFlow];\n`,
    );
    const before = snapshotTree(project);
    const result = run(project, "--ui-flow-only", "--strip-flow-css");
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(snapshotTree(project), before, "nothing is written");
    assert.match(result.stderr, /does not import PrototypeFlow from \.\/flow-canvas\.js/);
  }
}

function testUiFlowOnlyRejectsFlagsWithoutValue(project) {
  createCustomizedInstall(project);
  const before = snapshotTree(project);
  for (const flags of [
    ["--ui-flow-only", "--dry-run", "--token-prefix"],
    ["--ui-flow-only", "--token-prefix", "--dry-run"],
  ]) {
    const result = run(project, ...flags);
    assert.equal(result.status, 1, `${flags.join(" ")} must be rejected`);
    assert.match(result.stderr, /--token-prefix needs a value/, `${flags.join(" ")}: ${result.stderr}`);
  }
  for (const rootArgs of [["--project-root"], ["--project-root", ""], ["--project-root", "  "]]) {
    const noRoot = spawnSync(process.execPath, [installer, "--ui-flow-only", ...rootArgs], { encoding: "utf8" });
    assert.equal(noRoot.status, 1, `${JSON.stringify(rootArgs)} must be rejected`);
    assert.match(noRoot.stderr, /--project-root needs a value/);
  }
  assert.deepEqual(snapshotTree(project), before, "rejected flags write nothing");
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
