#!/usr/bin/env node
import {
  existsSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findFlowRules, findMixedRules, listSelectors, stripFlowRules } from "./flow_css_rules.mjs";

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
// The UI Flow module set (inspector-runtime-distribution): the only inspector
// files --ui-flow-only writes. Projects own every other file in the folder.
const uiFlowModuleFiles = [
  "flow-canvas.js",
  "flow-canvas-geometry.js",
  "flow-canvas-hmr.js",
  "flow-snapshot.js",
  "flow-snapshot-cache.js",
  "flow-canvas.css",
];
const extractionGuide =
  'storybook-product-prototype/references/storybook-integration.md ("Update Only the UI Flow in a Customized Project")';

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    projectRoot: process.cwd(),
    stripFlowCss: false,
    tokenPrefix: undefined,
    uiFlowOnly: false,
  };

  const valueOf = (flag, index) => {
    const value = argv[index + 1];
    if (value === undefined || value.trim() === "" || value.startsWith("--")) {
      throw new Error(`${flag} needs a value.`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (arg === "--project-root") {
      args.projectRoot = valueOf(arg, index);
      index += 1;
      continue;
    }
    if (arg === "--token-prefix") {
      args.tokenPrefix = valueOf(arg, index);
      index += 1;
      continue;
    }
    if (arg === "--ui-flow-only") {
      args.uiFlowOnly = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--strip-flow-css") {
      args.stripFlowCss = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.uiFlowOnly && (args.force || args.tokenPrefix !== undefined)) {
    throw new Error(
      "--ui-flow-only cannot be combined with --force or --token-prefix: it replaces only the UI Flow module set and never rewrites the project's other inspector files or token layer.",
    );
  }
  if (!args.uiFlowOnly && (args.dryRun || args.stripFlowCss)) {
    throw new Error("--dry-run and --strip-flow-css only apply with --ui-flow-only.");
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

const inspectorPresetMarker = "prototype-inspector/preset.js";
const figmaExportAddonName = "@harrychuang/storybook-addon-figma-export";

// The elements of the array literal whose "[" is at openIndex, as
// { start, end } source ranges (whitespace trimmed), plus the index of its
// closing "]". Strings, template literals, comments and nested brackets are
// skipped, so a comma inside an element (an options object) does not split it.
function readArrayElements(source, openIndex) {
  const elements = [];
  let depth = 0;
  let elementStart = openIndex + 1;
  const pushElement = (end) => {
    let start = elementStart;
    let stop = end;
    while (start < stop && /\s/.test(source[start])) start += 1;
    while (stop > start && /\s/.test(source[stop - 1])) stop -= 1;
    if (stop > start) elements.push({ start, end: stop });
  };
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      for (index += 1; index < source.length && source[index] !== char; index += 1) {
        if (source[index] === "\\") index += 1;
      }
    } else if (char === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index);
      if (index === -1) break;
    } else if (char === "/" && source[index + 1] === "*") {
      index = source.indexOf("*/", index + 2) + 1;
      if (index === 0) break;
    } else if ("([{".includes(char)) {
      depth += 1;
    } else if (")]}".includes(char)) {
      if (depth === 0) {
        pushElement(index);
        return { closeIndex: index, elements };
      }
      depth -= 1;
    } else if (char === "," && depth === 0) {
      pushElement(index);
      elementStart = index + 1;
    }
  }
  return null;
}

// Source with `entry` inserted as an array element right after `element`.
function insertAfterElement(source, element, entry) {
  const afterElement = source.slice(element.end);
  const comma = /^\s*,/.exec(afterElement);
  if (comma) {
    const insertAt = element.end + comma[0].length;
    return `${source.slice(0, insertAt)}\n    ${entry},${source.slice(insertAt)}`;
  }
  return `${source.slice(0, element.end)},\n    ${entry}${source.slice(element.end)}`;
}

// Source without `element`: its line when it sits alone on one, and its comma.
function removeElement(source, element) {
  let start = element.start;
  let end = element.end;
  const comma = /^\s*,/.exec(source.slice(end));
  if (comma) {
    end += comma[0].length;
  } else {
    const previousComma = /,\s*$/.exec(source.slice(0, start));
    if (previousComma) start = previousComma.index;
  }
  const lineStart = source.lastIndexOf("\n", start - 1);
  if (lineStart !== -1 && /^\s*$/.test(source.slice(lineStart + 1, start))) {
    const lineEnd = /^[ \t]*(?=\n)/.exec(source.slice(end));
    if (lineEnd) {
      start = lineStart;
      end += lineEnd[0].length;
    }
  }
  return `${source.slice(0, start)}${source.slice(end)}`;
}

// The inspector preset goes right after the figma-export addon when the
// project lists it (Storybook nests addons listed later inside earlier ones,
// so the addon's decorator then wraps every Inspector mode), and at the start
// of the list otherwise. An installed preset that sits before the addon is
// moved after it; any other existing order is left alone.
function insertAddonEntry(source, entry) {
  const addonsMatch = /addons\s*:\s*\[/.exec(source);
  const array =
    addonsMatch?.index !== undefined
      ? readArrayElements(source, addonsMatch.index + addonsMatch[0].length - 1)
      : null;
  const elementText = (element) => source.slice(element.start, element.end);
  const inspectorIndex =
    array?.elements.findIndex((element) => elementText(element).includes(inspectorPresetMarker)) ?? -1;
  const figmaIndex =
    array?.elements.findIndex((element) => elementText(element).includes(figmaExportAddonName)) ?? -1;

  if (source.includes(inspectorPresetMarker)) {
    if (inspectorIndex === -1 || figmaIndex === -1 || inspectorIndex > figmaIndex) {
      return { reordered: false, source };
    }
    const inspector = array.elements[inspectorIndex];
    const withoutInspector = removeElement(source, inspector);
    const removed = source.length - withoutInspector.length;
    const figma = array.elements[figmaIndex];
    return {
      reordered: true,
      source: insertAfterElement(
        withoutInspector,
        { end: figma.end - removed, start: figma.start - removed },
        elementText(inspector),
      ),
    };
  }

  if (figmaIndex !== -1) {
    return { reordered: false, source: insertAfterElement(source, array.elements[figmaIndex], entry) };
  }

  if (addonsMatch?.index !== undefined) {
    const insertAt = addonsMatch.index + addonsMatch[0].length;
    return {
      reordered: false,
      source: `${source.slice(0, insertAt)}\n    ${entry},${source.slice(insertAt)}`,
    };
  }

  const frameworkMatch = /\n\s*framework\s*:/.exec(source);
  if (frameworkMatch?.index !== undefined) {
    const insertAt = frameworkMatch.index + 1;
    return {
      reordered: false,
      source: `${source.slice(0, insertAt)}  addons: [\n    ${entry},\n  ],\n${source.slice(insertAt)}`,
    };
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

// Exports read at a top-level export keyword: a declaration (export function
// / class / enum / const / let / var / type / interface / namespace NAME, with
// declare, async or abstract) names group 1; a list (export { a, b as c },
// with or without from "x") has its entries in group 1 and exports each
// alias, or the name.
const exportDeclarationAtKeyword =
  /export\s+(?:declare\s+)?(?:async\s+)?(?:function\s*\*?\s*|(?:abstract\s+)?class\s+|(?:const\s+)?enum\s+|const\s+|let\s+|var\s+|type\s+|interface\s+|namespace\s+|module\s+)([\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*)/uy;
const exportListAtKeyword = /export\s*(?:type\s*)?\{([^}]*)\}/y;
// Declarations read at a top-level import / export keyword of the scanned
// source. An import's group 1 is its clause and group 2 its specifier; a
// re-export's group 1 is "type" for a type-only list, group 2 the list and
// group 3 the specifier.
const importAtKeyword = /import\s*(?:((?:\{[^}]*\}|[^"'`;{}])*?)\s*from\s*)?["']([^"'\n]+)["']/y;
const reExportAtKeyword = /export\s*(type\s*)?(\{[^}]*\})\s*from\s*["']([^"'\n]+)["']/y;
// Words after which a "/" starts a regular expression rather than a division.
const regexAfterWords = new Set([
  "await", "case", "delete", "do", "else", "in", "instanceof", "new", "of",
  "return", "throw", "typeof", "void", "yield",
]);

// A small JavaScript scanner for module declarations. It skips comments,
// strings, template literals (with nested ${} expressions) and regular
// expression literals, which it tells from a division by the previous token
// as JavaScript tooling usually does. It returns the source with comment,
// template and regular expression contents blanked out (same length, line
// breaks kept; quoted strings stay because they hold the specifiers) and the
// offsets of every import and export keyword outside brackets. With jsx,
// "</" and "/>" are tag punctuation; JSX text itself is not understood.
function scanModuleSource(source, { jsx = false } = {}) {
  const chars = source.split("");
  const blank = (from, to) => {
    for (let index = from; index < to; index += 1) {
      if (chars[index] !== "\n" && chars[index] !== "\r") chars[index] = " ";
    }
  };
  const keywords = [];
  const stack = [];
  let previous = "";
  let index = 0;
  // Where an unclosed comment or template began, if any.
  let unclosedAt = -1;
  // Whether the previous token ends an expression (so "/" divides).
  const endsExpression = () =>
    ["number", "string", "template", "regex", ")", "]"].includes(previous) ||
    (previous.startsWith("word:") && !regexAfterWords.has(previous.slice(5)));

  // Template text from `start` to the closing backtick or the next "${".
  const readTemplate = (start) => {
    let end = start;
    while (end < source.length) {
      if (source[end] === "\\") {
        end += 2;
      } else if (source[end] === "`") {
        blank(start, end);
        return { end: end + 1, expression: false };
      } else if (source[end] === "$" && source[end + 1] === "{") {
        blank(start, end);
        return { end: end + 2, expression: true };
      } else {
        end += 1;
      }
    }
    blank(start, source.length);
    if (unclosedAt < 0) unclosedAt = start - 1;
    return { end: source.length, expression: false };
  };
  const enterTemplate = (start) => {
    const { end, expression } = readTemplate(start);
    if (expression) stack.push({ char: "${", index: end - 2 });
    previous = expression ? "{" : "template";
    index = end;
  };
  const regexAllowed = () => !endsExpression();

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "/" && next === "*") {
      const close = source.indexOf("*/", index + 2);
      const end = close < 0 ? source.length : close + 2;
      if (close < 0 && unclosedAt < 0) unclosedAt = index;
      blank(index, end);
      index = end;
    } else if (char === "/" && next === "/") {
      const close = source.indexOf("\n", index);
      const end = close < 0 ? source.length : close;
      blank(index, end);
      index = end;
    } else if (/\s/.test(char)) {
      index += 1;
    } else if (char === '"' || char === "'") {
      let end = index + 1;
      while (end < source.length && source[end] !== char && source[end] !== "\n") {
        end += source[end] === "\\" ? 2 : 1;
      }
      index = Math.min(end + 1, source.length);
      previous = "string";
    } else if (char === "`") {
      enterTemplate(index + 1);
    } else if (char === "}" && stack.at(-1)?.char === "${") {
      stack.pop();
      enterTemplate(index + 1);
    } else if (jsx && char === "/" && (previous === "<" || next === ">")) {
      previous = "/";
      index += 1;
    } else if (char === "/" && regexAllowed()) {
      let end = index + 1;
      let inClass = false;
      while (end < source.length && source[end] !== "\n") {
        if (source[end] === "\\") {
          end += 2;
          continue;
        }
        if (source[end] === "[") inClass = true;
        else if (source[end] === "]") inClass = false;
        else if (source[end] === "/" && !inClass) break;
        end += 1;
      }
      if (source[end] === "/") {
        blank(index + 1, end);
        end += 1;
        while (end < source.length && /[A-Za-z]/.test(source[end])) end += 1;
        previous = "regex";
      } else {
        // No closing slash on the line: a division after all.
        end = index + 1;
        previous = "/";
      }
      index = end;
    } else if (/[A-Za-z_$\u0080-￿]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[\w$\u0080-￿]/.test(source[end])) end += 1;
      const word = source.slice(index, end);
      if ((word === "import" || word === "export") && stack.length === 0 && previous !== ".") {
        keywords.push({ index, word });
      }
      previous = `word:${word}`;
      index = end;
    } else if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(next ?? ""))) {
      let end = index + 1;
      while (end < source.length && /[\w.]/.test(source[end])) end += 1;
      previous = "number";
      index = end;
    } else if ((char === "+" || char === "-") && next === char) {
      // Postfix ++ / -- end an expression; prefix ones start one.
      previous = endsExpression() ? ")" : char;
      index += 2;
    } else if (char === "!" && next !== "=" && endsExpression()) {
      // TypeScript's non-null assertion (size!) ends an expression.
      previous = ")";
      index += 1;
    } else {
      if (char === "{" || char === "(" || char === "[") stack.push({ char, index });
      else if (char === "}" || char === ")" || char === "]") stack.pop();
      previous = char;
      index += 1;
    }
  }
  const openAt = unclosedAt >= 0 ? unclosedAt : stack.length ? stack[0].index : -1;
  return {
    keywords,
    masked: chars.join(""),
    // 1-based line where an unclosed bracket, comment or template began.
    unbalancedLine: openAt < 0 ? 0 : source.slice(0, openAt).split("\n").length,
  };
}

// The import declarations of a module as [clause, specifier] pairs, its
// re-exports in the same shape (type-only lists left out), and the line of
// the first top-level import statement that cannot be read (0 when every one
// was read). Such a statement could import anything, so callers fail on it
// instead of skipping it. import.meta and import() are not declarations.
function readImportDeclarations(source, { jsx = false } = {}) {
  const { keywords, masked, unbalancedLine } = scanModuleSource(source, { jsx });
  const declarations = [];
  const reExports = [];
  let unreadableLine = 0;

  for (const { index, word } of keywords) {
    const pattern = word === "import" ? importAtKeyword : reExportAtKeyword;
    pattern.lastIndex = index;
    const match = pattern.exec(masked);
    if (word === "export") {
      if (match && !match[1]) reExports.push([match[2], match[3]]);
    } else if (match) {
      declarations.push([match[1] ?? "", match[2]]);
    } else if (!/^import\s*[.(:]/.test(masked.slice(index, index + 64)) && !unreadableLine) {
      unreadableLine = source.slice(0, index).split("\n").length;
    }
  }
  return { declarations, reExports, unbalancedLine, unreadableLine };
}

// Names an import clause or re-export list takes from its module: each named
// entry ({ name } or { name as alias }) and, with includeDefault, "default"
// for a default import. A namespace import (* as ns) names nothing, and
// type-only imports (import type { … }, { type Name }) are left out: types
// are erased and cannot break at runtime.
// A JavaScript identifier, Unicode letters included.
const identifier = "[\\p{ID_Start}$_][\\p{ID_Continue}$\\u200C\\u200D]*";
// "type Name" (but not "type as alias", which imports a binding named type).
const typeOnlyEntry = new RegExp(`^type\\s+(?!as\\b)${identifier}`, "u");

function readImportedNames(clause, { includeDefault = false } = {}) {
  const uncommented = clause.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").trim();
  if (/^type\s*[{*]/.test(uncommented) || new RegExp(`^type\\s+${identifier}\\s*$`, "u").test(uncommented)) {
    return [];
  }
  const namedList = /\{([^}]*)\}/.exec(uncommented);
  const names = (namedList ? namedList[1].split(",") : [])
    .map((entry) => entry.trim())
    .filter((entry) => entry && !typeOnlyEntry.test(entry))
    .map((entry) => entry.split(/\s+as\s+/)[0]);
  const outsideList = uncommented.replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
  if (includeDefault && new RegExp(`^${identifier}(?:\\s|$)`, "u").test(outsideList)) {
    names.push("default");
  }
  return names;
}

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
    const { declarations, reExports, unbalancedLine, unreadableLine } = readImportDeclarations(source, {
      jsx: /\.[jt]sx$/.test(relativePath),
    });
    if (unreadableLine || unbalancedLine) {
      throw new Error(
        `Cannot read the import statement at ${relativePath}:${unreadableLine || unbalancedLine} of the bundled Prototype Inspector, so the flow layout helper exports cannot be checked. Rerun with --force to replace the helper with the bundled one.`,
      );
    }
    for (const [clause, specifier] of [...declarations, ...reExports]) {
      if (!/^\.{1,2}\//.test(specifier)) continue;
      const target = resolve(installedDir, specifier);
      if (target !== helperPath && `${target}.ts` !== helperPath) continue;

      for (const name of readImportedNames(clause)) names.add(name);
    }
  }

  return [...names];
}

// Names a module exports. Comments and templates are blanked first, so a
// commented-out export does not count. "default" stands for export default,
// and "*" for export * from "x", whose names cannot be listed.
function readExportedNames(file) {
  const { keywords, masked } = scanModuleSource(readFileSync(file, "utf8"));
  const names = new Set();
  const readAt = (pattern, index) => {
    pattern.lastIndex = index;
    return pattern.exec(masked);
  };

  for (const { index, word } of keywords) {
    if (word !== "export") continue;
    const list = readAt(exportListAtKeyword, index);
    const declaration = readAt(exportDeclarationAtKeyword, index);
    if (readAt(/export\s+default\b/y, index)) {
      names.add("default");
    } else if (readAt(/export\s*\*/y, index)) {
      names.add("*");
    } else if (list) {
      for (const entry of list[1].split(",")) {
        const name = entry.trim().replace(typeOnlyEntry, (match) => match.replace(/^type\s+/, "")).split(/\s+as\s+/).at(-1);
        if (name) names.add(name);
      }
    } else if (declaration) {
      names.add(declaration[1]);
    } else {
      // A form not read here (destructuring, say) exports names that
      // cannot be listed.
      names.add("?");
    }
  }
  return names;
}

function findMissingHelperExports(helperPath, targetAddonDir) {
  const exported = readExportedNames(helperPath);
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

// SHA-256 (see hashHelper for the normalisation) of every flow layout helper
// the skill shipped before the bundled one (git history of
// assets/prototype-flow-layout/prototypeFlowLayout.ts). A project helper equal
// to one of them, or to the bundled helper, holds no project code.
const shippedFlowLayoutHelperHashes = new Set([
  // Schema version 1, shipped 2026-06-22 (5f5a135).
  "9d4a9295f7d928b53b08cad2350ae1a615d70ba0278a85e31b7477f9b995771c",
]);

// Line endings, a byte order mark and blank lines at the end of the file are
// not project code, so they do not count as edits.
function hashHelper(file) {
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\s*$/, "\n");
  return createHash("sha256").update(text).digest("hex");
}

// The helper's prototypeFlowLayoutSchemaVersion declaration (comments and
// strings do not count; a type annotation may follow the name), or NaN when
// it has none.
function readHelperSchemaVersion(file) {
  const { masked } = scanModuleSource(readFileSync(file, "utf8"));
  const match = /\b(?:const|let|var)\s+prototypeFlowLayoutSchemaVersion\s*(?::[^=;]+)?=\s*(\d+)/.exec(masked);
  return Number(match?.[1] ?? Number.NaN);
}

function unbalancedReason(file, line) {
  return `cannot read ${file} reliably: a bracket, comment or template literal opened at line ${line} never closes as far as the import scanner can tell, so its imports cannot be checked. Check that line, or rewrite the construct that confuses the scanner, then rerun.`;
}

function stopUiFlowOnly(reason) {
  console.error(`ui-flow-only: ${reason}`);
  process.exit(1);
}

function readFlowCanvasVersion(file) {
  if (!existsSync(file)) return "none";
  return (
    /^export const flowCanvasVersion = ["']([^"']+)["'];?$/m.exec(readFileSync(file, "utf8"))?.[1] ??
    "none"
  );
}

// Each name a project module in the inspector folder imports from a JavaScript
// file of the UI Flow module set that the bundled file no longer exports, as
// "name (module)", plus " in <file>" when the importer is not preview.js.
function findRemovedModuleImports(targetAddonDir) {
  const moduleScripts = uiFlowModuleFiles.filter((name) => name.endsWith(".js"));
  const exportsByTarget = new Map(
    moduleScripts.map((name) => [
      resolve(targetAddonDir, name),
      { exported: readExportedNames(resolve(addonAssetDir, name)), name },
    ]),
  );
  const isFile = (file) => {
    try {
      return statSync(file).isFile();
    } catch {
      return false;
    }
  };
  const projectModules = readdirSync(targetAddonDir, { recursive: true })
    .map(String)
    .filter((relativePath) => /\.(?:[cm]?js|jsx|tsx?)$/.test(relativePath))
    .filter((relativePath) => !uiFlowModuleFiles.includes(relativePath))
    .filter((relativePath) => isFile(resolve(targetAddonDir, relativePath)))
    .sort();
  const missing = [];

  for (const relativePath of projectModules) {
    const file = resolve(targetAddonDir, relativePath);
    const { declarations, reExports, unbalancedLine, unreadableLine } = readImportDeclarations(readFileSync(file, "utf8"), {
      jsx: /\.[jt]sx$/.test(relativePath),
    });
    if (unbalancedLine) {
      stopUiFlowOnly(unbalancedReason(relativePath, unbalancedLine));
    }
    if (unreadableLine) {
      stopUiFlowOnly(
        `cannot read the import statement at ${relativePath}:${unreadableLine}, so the names it may import from the UI Flow modules cannot be checked.`,
      );
    }
    for (const [clause, specifier] of [...declarations, ...reExports]) {
      if (!/^\.{1,2}\//.test(specifier)) continue;
      const target = resolve(dirname(file), specifier);
      const module = exportsByTarget.get(target) ?? exportsByTarget.get(`${target}.js`);
      if (!module) continue;
      for (const name of readImportedNames(clause, { includeDefault: true })) {
        if (!module.exported.has(name)) {
          missing.push(
            `${name} (${module.name})${relativePath === "preview.js" ? "" : ` in ${relativePath}`}`,
          );
        }
      }
    }
  }
  return missing;
}

const readBundled = (name) => readFileSync(resolve(addonAssetDir, name), "utf8");
const uncommentCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// --pi-* custom properties the module set reads (in flow-canvas.css and in the
// inline styles its scripts set) that neither the project's
// prototype-inspector.css nor flow-canvas.css itself defines.
function findMissingPiTokens(projectCss) {
  const flowCss = uncommentCss(readBundled("flow-canvas.css"));
  const moduleSources = uiFlowModuleFiles.map(readBundled).join("\n");
  const defined = new Set(
    [...`${uncommentCss(projectCss ?? "")}\n${flowCss}`.matchAll(/(--pi-[\w-]+)\s*:/g)].map(
      (match) => match[1],
    ),
  );
  const referenced = new Set(
    [...uncommentCss(moduleSources).matchAll(/var\(\s*(--pi-[\w-]+)/g)].map((match) => match[1]),
  );
  return [...referenced].filter((name) => !defined.has(name)).sort();
}

const stylesClass = (selectors, className) => {
  const pattern = new RegExp(`\\.${className}(?![\\w-])`);
  return selectors.some((selector) => pattern.test(selector));
};

// Classes the module set's scripts render whose rules live in the shared
// stylesheet: the bundled prototype-inspector.css styles them and
// flow-canvas.css does not. The UI Flow relies on the project's copy of those
// rules, so each one the project's prototype-inspector.css lacks is returned
// as ".class".
function findMissingSharedRules(projectCss) {
  const scripts = uiFlowModuleFiles.filter((name) => name.endsWith(".js")).map(readBundled).join("\n");
  const rendered = new Set(
    [...scripts.matchAll(/prototype-inspector(?:(?:__|--)[a-z0-9-]+)?(?![\w-])/g)].map(
      (match) => match[0],
    ),
  );
  const sharedSelectors = listSelectors(readBundled("prototype-inspector.css"));
  const flowSelectors = listSelectors(readBundled("flow-canvas.css"));
  const projectSelectors = projectCss === null ? [] : listSelectors(projectCss);
  return [...rendered]
    .filter((name) => stylesClass(sharedSelectors, name) && !stylesClass(flowSelectors, name))
    .filter((name) => !stylesClass(projectSelectors, name))
    .sort()
    .map((name) => `.${name}`);
}

// The first `limit` rules as "line N: selector", then how many were left out.
function printRules(rules, limit = rules.length) {
  for (const rule of rules.slice(0, limit)) {
    console.log(`  line ${rule.line}: ${rule.selector}`);
  }
  if (rules.length > limit) {
    console.log(`  ... and ${rules.length - limit} more`);
  }
}

// --ui-flow-only: replaces the UI Flow module set of an existing install and
// leaves every project-owned inspector file alone (inspector-runtime-
// distribution, "UI Flow-only installer update"). Every check runs before the
// first write.
function updateUiFlowOnly({ dryRun, projectRoot, stripFlowCss, targetAddonDir }) {
  if (!existsSync(targetAddonDir)) {
    stopUiFlowOnly(
      `${targetAddonDir} does not exist. Run the installer without --ui-flow-only to install the Prototype Inspector.`,
    );
  }

  const previewPath = resolve(targetAddonDir, "preview.js");
  const previewScan = existsSync(previewPath)
    ? readImportDeclarations(readFileSync(previewPath, "utf8"))
    : { declarations: [], unbalancedLine: 0 };
  if (previewScan.unbalancedLine) {
    stopUiFlowOnly(unbalancedReason("preview.js", previewScan.unbalancedLine));
  }
  const previewImports = previewScan.declarations;
  const importsPrototypeFlow = previewImports.some(
    ([clause, specifier]) =>
      /^\.\/flow-canvas(?:\.js)?$/.test(specifier) &&
      readImportedNames(clause).includes("PrototypeFlow"),
  );
  if (!importsPrototypeFlow) {
    stopUiFlowOnly(
      `${previewPath} does not import PrototypeFlow from ./flow-canvas.js, so it still embeds an older UI Flow. Do the one-time extraction in ${extractionGuide} first. Do not rerun with --force: it replaces preview.js, prototype-inspector.css and every other customized inspector file.`,
    );
  }

  const removedImports = findRemovedModuleImports(targetAddonDir);
  if (removedImports.length > 0) {
    stopUiFlowOnly(
      `the bundled UI Flow modules no longer export these imported names: ${removedImports.join(", ")}. Move that code to the current exports (see ${extractionGuide}) before updating.`,
    );
  }

  const cssPath = resolve(targetAddonDir, "prototype-inspector.css");
  const projectCss = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : null;
  let staleRules = [];
  let mixedRules = [];
  let strippedCss = null;
  if (projectCss !== null) {
    try {
      staleRules = findFlowRules(projectCss);
      mixedRules = findMixedRules(projectCss);
      if (stripFlowCss && staleRules.length > 0) strippedCss = stripFlowRules(projectCss);
    } catch (error) {
      stopUiFlowOnly(`cannot read the rules of ${cssPath}: ${error.message}`);
    }
  }

  const helperPath = getFlowLayoutHelperPath(projectRoot);
  let missingHelperExports = null;
  if (existsSync(helperPath)) {
    try {
      missingHelperExports = findMissingHelperExports(helperPath, targetAddonDir);
    } catch (error) {
      // The bundled modules hold an import statement the check cannot read;
      // the full-install wording ("Rerun with --force") does not apply here.
      stopUiFlowOnly(
        `${error.message.replace(/ Rerun with --force.*$/, "")} Report it against the skill; do not rerun with --force on a customized project.`,
      );
    }
  }
  // An older helper is replaced only when it is a version the skill shipped,
  // byte for byte: an edited one may hold project code in any form, so it
  // stops the update rather than losing that code.
  let helperUpdate = "";
  if (missingHelperExports !== null) {
    const projectSchema = readHelperSchemaVersion(helperPath);
    const bundledSchema = readHelperSchemaVersion(flowLayoutAssetPath);
    const reasons = [
      ...(missingHelperExports.length > 0 ? [`missing exports: ${missingHelperExports.join(", ")}`] : []),
      ...(projectSchema >= bundledSchema
        ? []
        : [`schema version ${Number.isNaN(projectSchema) ? "unknown" : projectSchema}, the runtime needs ${bundledSchema}`]),
    ];
    if (reasons.length > 0) {
      const hash = hashHelper(helperPath);
      if (hash !== hashHelper(flowLayoutAssetPath) && !shippedFlowLayoutHelperHashes.has(hash)) {
        stopUiFlowOnly(
          `the flow layout helper ${helperPath} is older than the runtime (${reasons.join("; ")}) and has been edited, so replacing it would lose the project's changes. Merge it by hand: start from the skill's assets/prototype-flow-layout/prototypeFlowLayout.ts and re-add the project's own code, then rerun.`,
        );
      }
      helperUpdate = reasons.join("; ");
    }
  }
  const fingerprintPath = resolve(projectRoot, "scripts/prototype-review/fingerprint.mjs");
  const installsFingerprint = !existsSync(fingerprintPath);
  const versionBefore = readFlowCanvasVersion(resolve(targetAddonDir, "flow-canvas.js"));
  const versionAfter = readFlowCanvasVersion(resolve(addonAssetDir, "flow-canvas.js"));

  if (!dryRun) {
    for (const name of uiFlowModuleFiles) {
      cpSync(resolve(addonAssetDir, name), resolve(targetAddonDir, name), { force: true });
    }
    if (missingHelperExports === null || helperUpdate) {
      mkdirSync(dirname(helperPath), { recursive: true });
      cpSync(flowLayoutAssetPath, helperPath, { force: true });
    }
    if (installsFingerprint) {
      mkdirSync(dirname(fingerprintPath), { recursive: true });
      cpSync(fingerprintAssetPath, fingerprintPath);
    }
    if (strippedCss !== null) writeFileSync(cssPath, strippedCss);
  }

  const would = (done, planned) => (dryRun ? planned : done);
  console.log(
    `${would("Updated", "Would update")} UI Flow module set (${versionBefore} -> ${versionAfter})`,
  );
  for (const name of uiFlowModuleFiles) {
    console.log(`  ${resolve(targetAddonDir, name)}`);
  }
  if (missingHelperExports === null) {
    console.log(`${would("Installed", "Would install")} flow layout helper: ${helperPath}`);
  } else if (helperUpdate) {
    console.log(`${would("Replaced", "Would replace")} flow layout helper (${helperUpdate}): ${helperPath}`);
  } else {
    console.log(`Reused flow layout helper: ${helperPath}`);
  }
  console.log(
    installsFingerprint
      ? `${would("Installed", "Would install")} fingerprint: ${fingerprintPath}`
      : `Reused fingerprint: ${fingerprintPath}`,
  );

  if (projectCss === null) {
    console.log(
      `${cssPath} is missing: flow-canvas.js imports it for the --pi-* token layer, so restore it before starting Storybook.`,
    );
  }
  const missingTokens = findMissingPiTokens(projectCss);
  console.log(`Missing --pi tokens: ${missingTokens.length > 0 ? missingTokens.join(", ") : "none"}`);
  if (missingTokens.length > 0) {
    console.log(
      "  Define them in prototype-inspector.css the same way the project wraps its other --pi-* tokens; the installer never writes them.",
    );
  }
  const missingSharedRules = findMissingSharedRules(projectCss);
  console.log(
    `Missing shared rules in prototype-inspector.css: ${missingSharedRules.length > 0 ? missingSharedRules.join(", ") : "none"}`,
  );
  if (missingSharedRules.length > 0) {
    console.log(
      "  The UI Flow renders these classes; copy their rules from the bundled assets/prototype-inspector/prototype-inspector.css. The installer never writes them.",
    );
  }

  console.log(`Stale UI Flow rules in prototype-inspector.css: ${staleRules.length}`);
  printRules(staleRules, 10);
  if (staleRules.length > 0) {
    console.log(
      stripFlowCss
        ? `${would("Removed them", "Would remove them")}, each with the comments directly above it; every other rule and comment stays.`
        : "Kept them. They still load before flow-canvas.css and override the new canvas wherever they are more specific or it leaves a property unset; rerun with --strip-flow-css to remove them.",
    );
  }
  if (mixedRules.length > 0) {
    console.log(
      `Mixed rules in prototype-inspector.css (UI Flow and other selectors in one list, never removed): ${mixedRules.length}`,
    );
    printRules(mixedRules);
    console.log(
      "  Review them by hand: the UI Flow is styled only by flow-canvas.css, so a UI Flow selector in a list can go, while a UI Flow class used only to exclude the canvas (as in :not(.prototype-inspector--flow)) can stay.",
    );
  }
  console.log(
    `Left ${relative(projectRoot, previewPath)}, prototype-inspector.css${strippedCss !== null && !dryRun ? " (apart from the removed rules)" : ""}, manager.js, preset.js and the Storybook main config as they were.`,
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

  const targetAddonDir = resolve(storybookDir, "prototype-inspector");
  if (args.uiFlowOnly) {
    updateUiFlowOnly({
      dryRun: args.dryRun,
      projectRoot,
      stripFlowCss: args.stripFlowCss,
      targetAddonDir,
    });
    return;
  }

  // Runs before the folder guard so projects that carry both an older
  // inspector folder and an older helper see the missing names, and before
  // any write so a refused install leaves the project untouched.
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

  const addonEntry = insertAddonEntry(source, getAddonEntry(mainPath));
  if (addonEntry.source !== source) {
    writeFileSync(mainPath, addonEntry.source);
  }

  const flowLayout = installFlowLayoutHelper(projectRoot, args.force);
  const fingerprint = installFingerprint(projectRoot, args.force);

  console.log(`Installed Prototype Inspector addon into ${targetAddonDir}`);
  if (addonEntry.reordered) {
    console.log(
      `Reordered Storybook addons: the Prototype Inspector preset now follows ${figmaExportAddonName}, so figma-export review runs in every Inspector mode.`,
    );
  }
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
