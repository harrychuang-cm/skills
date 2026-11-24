// Index of component CSS files: rule ordinals (shared walk with the browser),
// served-text hashes for page identity, declarations with their var() refs.
import fs from "node:fs";
import path from "node:path";

import { classifyValue, findVarRefs, normalizeValue } from "../shared/value-refs.mjs";
import { readCssSource, servedTextMayDiffer } from "./css-source.mjs";
import { listCssFiles, relativePosix } from "./paths.mjs";

const KEYFRAMES = /^(?:-[a-z]+-)?keyframes$/i;

/**
 * Shared ordinal walk: count only style rules, from 0, depth first with the
 * parent before its nested rules; descend into every grouping at-rule whether
 * or not it matches; never count keyframe steps.
 */
export function walkStyleRules(container, visit, atRules = []) {
  for (const node of container.nodes ?? []) {
    if (node.type === "rule") {
      visit(node, atRules);
      walkStyleRules(node, visit, atRules);
    } else if (node.type === "atrule" && node.nodes && !KEYFRAMES.test(node.name)) {
      walkStyleRules(node, visit, [...atRules, { name: node.name.toLowerCase(), params: normalizeValue(node.params) }]);
    }
  }
}

// Longhands each shorthand sets (for "a later declaration in the same group overrides").
const GROUPS = [
  ["background", ["background-color", "background-image"]],
  ["border-radius", ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius", "border-start-start-radius", "border-start-end-radius", "border-end-start-radius", "border-end-end-radius"]],
  ["padding", ["padding-top", "padding-right", "padding-bottom", "padding-left", "padding-block", "padding-inline", "padding-block-start", "padding-block-end", "padding-inline-start", "padding-inline-end"]],
  ["border", ["border-color", "border-width", "border-style", "border-top", "border-right", "border-bottom", "border-left"]],
  ["font", ["font-family", "font-size", "font-weight", "line-height", "font-style"]],
];

const SUB_SHORTHANDS = {
  "padding-block": ["padding-top", "padding-bottom", "padding-block-start", "padding-block-end"],
  "padding-inline": ["padding-left", "padding-right", "padding-inline-start", "padding-inline-end"],
};

function propertyFamily(property) {
  for (const [shorthand, longhands] of GROUPS) {
    if (property === shorthand || longhands.includes(property)) return shorthand;
  }
  return property;
}

const isLogical = (property) => /-(block|inline)(-|$)|-(start|end)(-|$)/.test(property);

/**
 * Whether a later declaration of `b` can override (part of) `a`: the same
 * property, a shorthand containing the other, or logical and physical
 * longhands of padding / corner radius (which may map to the same side
 * depending on writing mode). Distinct longhands such as font-family and
 * font-size do not overlap.
 */
export function overlaps(a, b) {
  if (a === b) return true;
  for (const [shorthand, longhands] of [...GROUPS, ...Object.entries(SUB_SHORTHANDS)]) {
    if ((a === shorthand && longhands.includes(b)) || (b === shorthand && longhands.includes(a))) return true;
  }
  const family = propertyFamily(a);
  if (family !== propertyFamily(b) || family === a || family === b) return false;
  return (family === "padding" || family === "border-radius") && (isLogical(a) || isLogical(b));
}

function sameGroup(a, b) {
  return overlaps(a, b);
}

export function buildCssIndex({ config, postcss, tokens }) {
  const relP = (abs) => relativePosix(config.projectRoot, abs);
  const relW = (abs) => relativePosix(config.workspaceRoot, abs);
  const files = [];
  for (const root of config.components.roots) {
    for (const abs of listCssFiles(root)) {
      const source = readCssSource(abs);
      const info = {
        file: relP(abs),
        workspacePath: relW(abs),
        devId: fs.realpathSync(abs),
        componentId: path.basename(path.dirname(abs)),
        diskHash: source.diskHash,
        servedTextHash: source.servedTextHash,
        identityEligible: source.ok && !servedTextMayDiffer(source.text),
        reason: source.ok ? (servedTextMayDiffer(source.text) ? "served-text-may-differ" : null) : source.reason,
        styleRuleCount: 0,
        rules: [],
      };
      files.push(info);
      if (!source.ok) continue;
      const parsed = postcss.parse(source.text, { from: abs });
      const seen = new Map();
      let ordinal = 0;
      walkStyleRules(parsed, (rule, atRules) => {
        const key = `${JSON.stringify(atRules)}|${rule.selector}`;
        const occurrence = seen.get(key) ?? 0;
        seen.set(key, occurrence + 1);
        const decls = (rule.nodes ?? []).filter((n) => n.type === "decl");
        const declarations = decls.map((decl, index) => {
          const rawValue = decl.raws.value?.raw ?? decl.value;
          const refs = findVarRefs(rawValue)
            .filter((r) => r.name)
            .map((r, refIndex) => {
              const token = tokens.get(r.name);
              return { name: r.name, refIndex, known: Boolean(token && !token.rootless), tier: token?.tier ?? null, source: token?.source ?? null };
            });
          const later = decls.slice(index + 1);
          return {
            index,
            property: decl.prop,
            rawValue,
            value: normalizeValue(rawValue),
            important: decl.important === true,
            line: decl.source.start.line,
            shape: classifyValue(rawValue).kind,
            refs,
            duplicateInRule: decls.some((other, i) => i !== index && other.prop === decl.prop),
            overriddenInRule: later.some((other) => sameGroup(other.prop, decl.prop)),
          };
        });
        info.rules.push({
          ordinal,
          selector: rule.selector,
          atRules,
          occurrence,
          line: rule.source.start.line,
          nested: rule.parent?.type === "rule",
          declarations,
        });
        ordinal += 1;
      });
      for (const rule of info.rules) {
        rule.sameSelectorCount = seen.get(`${JSON.stringify(rule.atRules)}|${rule.selector}`);
      }
      info.styleRuleCount = ordinal;
    }
  }
  return { files };
}
