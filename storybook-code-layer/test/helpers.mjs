// Shared test helpers. Tests resolve Vite and PostCSS from a real Storybook
// project given by CODE_LAYER_TEST_PROJECT (the repo has no node_modules).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ADDON_ROOT = path.join(SKILL_ROOT, "template", "code-layer");

export function testProject() {
  const project = process.env.CODE_LAYER_TEST_PROJECT;
  if (!project) {
    throw new Error("Set CODE_LAYER_TEST_PROJECT to a Storybook project root that has node_modules/vite.");
  }
  if (!fs.existsSync(path.join(project, "node_modules", "vite", "package.json"))) {
    throw new Error(`CODE_LAYER_TEST_PROJECT has no node_modules/vite: ${project}`);
  }
  return project;
}

export async function addon(relative) {
  return import(path.join(ADDON_ROOT, relative));
}

export async function loadPostcss() {
  const { loadPostcss: load } = await addon("server/css-source.mjs");
  return load(testProject());
}

/** A fresh, realpath'd temporary directory. */
export function tempDir(prefix = "code-layer-test-") {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function writeFiles(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    if (content === null) {
      fs.rmSync(target, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

export const FIXTURE_FILES = {
  "tokens/tokens.css": '@import "./tokens-ref.css";\n@import "./tokens-sys.css";\n@import "./tokens-comp.css";\n',
  "tokens/tokens-ref.css":
    ":root {\n  --t-ref-color-red-60: #FE0B05;\n  --t-ref-color-blue-70: #10A0E2;\n  --t-ref-radius-4: 4px;\n  --t-ref-radius-8: 8px;\n  --t-ref-size-24: 24px;\n}\n",
  "tokens/tokens-sys.css":
    ":root {\n  --t-sys-color-primary: var(--t-ref-color-red-60);\n  --t-sys-color-secondary: var(--t-ref-color-blue-70);\n  --t-sys-shape-corner-sm: var(--t-ref-radius-4);\n  --t-sys-shape-corner-md: var(--t-ref-radius-8);\n  --t-sys-size-min: var(--t-ref-size-24);\n}\n",
  "tokens/tokens-comp.css":
    "/* comp — ō */\n:root {\n  --t-comp-seal-container-color: var(--t-sys-color-primary);   /* voice */\n  --t-comp-seal-shape: var(--t-sys-shape-corner-sm);\n}\n",
  "design-system/TOKEN_ARCHITECTURE.md": "# Token Architecture\n",
  "sb/package.json": "{}\n",
  "sb/src/components/seal/Seal.css":
    "/* seal — 昭和 */\n.t-seal {\n  background: var(--t-comp-seal-container-color);\n  border-radius: var(--t-sys-shape-corner-sm);\n}\n.t-seal--wide {\n  min-inline-size: calc(var(--t-sys-size-min) * 2);\n}\n",
  "sb/src/styles/chrome.css":
    ':root {\n  --t-sys-chrome-only: 1px;\n}\n:root[data-theme="dark"] {\n  --t-sys-color-primary: #000000;\n}\n',
};

export function fixtureConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    projectId: "fixture",
    workspaceRoot: "..",
    stateDir: "../.code-layer",
    tokens: {
      prefix: "t",
      entry: { source: "../tokens/tokens.css", mirror: "tokens/tokens.css" },
      tiers: [
        { tier: "ref", source: "../tokens/tokens-ref.css", mirror: "tokens/tokens-ref.css", writable: false },
        { tier: "sys", source: "../tokens/tokens-sys.css", mirror: "tokens/tokens-sys.css", writable: false },
        { tier: "comp", source: "../tokens/tokens-comp.css", mirror: "tokens/tokens-comp.css", writable: true },
      ],
      readonlySources: ["src/styles/chrome.css"],
    },
    components: { roots: ["src/components"], classPrefixes: ["t-"] },
    checks: [],
    ...overrides,
  };
}

export const FIXTURE_V1_ROOT = path.join(SKILL_ROOT, "test", "fixtures", "v1");
export const FIXTURE_V1_EXPECTED = JSON.parse(fs.readFileSync(path.join(FIXTURE_V1_ROOT, "EXPECTED.json"), "utf8"));

/** Binding of the v1 fixture, restricted to the keys every template version accepts. */
export function fixtureV1Config(overrides = {}) {
  return {
    ...fixtureConfig(),
    projectId: "fixture-v1",
    tokens: {
      prefix: "fx",
      entry: { source: "../tokens/tokens.css", mirror: "tokens/tokens.css" },
      tiers: [
        { tier: "ref", source: "../tokens/tokens-ref.css", mirror: "tokens/tokens-ref.css", writable: false },
        { tier: "sys", source: "../tokens/tokens-sys.css", mirror: "tokens/tokens-sys.css", writable: false },
        { tier: "comp", source: "../tokens/tokens-comp.css", mirror: "tokens/tokens-comp.css", writable: true },
      ],
      readonlySources: ["src/styles/chrome.css"],
    },
    components: { roots: ["src/components"], classPrefixes: ["fx-"] },
    ...overrides,
  };
}

/**
 * A throwaway workspace: <ws>/tokens (source of truth), <ws>/sb (the
 * "Storybook" project root with mirrors in sb/tokens), <ws>/design-system.
 * Mirrors are copies of the truth files unless `files` overrides them.
 * `fixture: "v1"` starts from test/fixtures/v1/workspace instead of the
 * small inline fixture.
 */
export async function makeWorkspace({ files = {}, config: configOverrides = {}, fixture = null } = {}) {
  const ws = tempDir("code-layer-ws-");
  const overrides = typeof files === "function" ? files(ws) : files;
  if (fixture === "v1") {
    fs.cpSync(path.join(FIXTURE_V1_ROOT, "workspace"), ws, { recursive: true });
    fs.cpSync(path.join(ws, "tokens"), path.join(ws, "sb", "tokens"), { recursive: true });
    writeFiles(ws, overrides);
  } else {
    const all = { ...FIXTURE_FILES };
    for (const name of ["tokens.css", "tokens-ref.css", "tokens-sys.css", "tokens-comp.css"]) {
      all[`sb/tokens/${name}`] = all[`tokens/${name}`];
    }
    writeFiles(ws, { ...all, ...overrides });
  }
  const resolvedOverrides = typeof configOverrides === "function" ? configOverrides(ws) : configOverrides;
  const raw = fixture === "v1" ? fixtureV1Config(resolvedOverrides) : fixtureConfig(resolvedOverrides);
  const configFile = path.join(ws, "sb", ".storybook", "code-layer", "code-layer.config.json");
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, `${JSON.stringify(raw, null, 2)}\n`);
  const { resolveConfig } = await addon("server/config.mjs");
  const projectRoot = path.join(ws, "sb");
  let config = null;
  try {
    config = resolveConfig(raw, { projectRoot, configFile });
  } catch {
    config = null;
  }
  return { ws, projectRoot, configFile, raw, config };
}
