// Index of component CSS files: rule ordinals (shared walk with the browser),
// served-text hashes for page identity, declarations with their var() refs.
import fs from "node:fs";
import path from "node:path";

import { inferKind, isKeywordValue } from "../shared/kinds.mjs";
import { SUPPORTED_FLOWS, affectedSlots, mayOverlap, sidesOf } from "../shared/sides.mjs";
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

/**
 * Whether a later declaration of `b` can override (part of) `a` inside one
 * rule: the same property, or two properties that may set the same side under
 * some writing mode (a shorthand and its longhand, a logical and a physical
 * longhand). Distinct longhands such as font-family and font-size do not.
 */
export function overlaps(a, b) {
  return mayOverlap(a, b);
}

/**
 * Which components of a declaration are overridden by later declarations of
 * the same rule. The server does not know the element's writing mode, so a
 * component counts as overridden only when, under every supported writing
 * mode and direction, each side it sets is set again later in the rule.
 * Returns { components: boolean[], declaration: boolean }.
 */
export function overriddenByLater(property, components, laterProperties) {
  const sameLater = laterProperties.includes(property);
  if (laterProperties.length === 0) return { components: components.map(() => false), declaration: false };
  const survives = components.map(() => false);
  let wholeSurvives = false;
  let known = false;
  for (const { writingMode, direction } of SUPPORTED_FLOWS) {
    const laterSlots = new Set(laterProperties.flatMap((p) => affectedSlots(p, writingMode, direction) ?? []));
    const result = sidesOf(property, components, writingMode, direction);
    if (!result.ok) {
      if (result.reason === "unknown-property") break;
      known = true;
      if (result.affected.some((slot) => !laterSlots.has(slot))) wholeSurvives = true;
      continue;
    }
    known = true;
    const seen = components.map(() => false);
    for (const { slot, component } of result.slots) {
      if (component === null) continue;
      seen[component] = true;
      if (!laterSlots.has(slot)) survives[component] = true;
    }
    // A component that sets no tracked side (an image in `background`) is not judged.
    seen.forEach((has, i) => {
      if (!has && components[i].shape !== "separator") survives[i] = true;
    });
  }
  if (!known) return { components: components.map(() => sameLater), declaration: sameLater };
  const flags = survives.map((alive, i) => (components[i].shape === "separator" ? false : !alive && !wholeSurvives));
  const judged = flags.filter((_, i) => components[i].shape !== "separator");
  return { components: flags, declaration: judged.length > 0 && judged.every(Boolean) };
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
          // refIndex counts every var() of the value, the way replaceVarName addresses them.
          const refs = findVarRefs(rawValue)
            .map((r, refIndex) => ({ r, refIndex }))
            .filter(({ r }) => r.name)
            .map(({ r, refIndex }) => {
              const token = tokens.get(r.name);
              return { name: r.name, refIndex, known: Boolean(token && !token.rootless), tier: token?.tier ?? null, source: token?.source ?? null };
            });
          const classified = classifyValue(rawValue);
          const shape = classified.kind === "raw" && isKeywordValue(rawValue) ? "keyword" : classified.kind;
          const components = classified.components.map((c) => ({
            text: normalizeValue(c.text),
            shape: c.shape === "raw" && inferKind(c.text) === "keyword" ? "keyword" : c.shape,
            refIndex: c.refIndex,
          }));
          const later = decls.slice(index + 1);
          const refKind = new Map(refs.map((r) => [r.refIndex, tokens.get(r.name)?.kind ?? "unknown"]));
          const overridden = overriddenByLater(
            decl.prop,
            components.map((c) => ({ text: c.text, shape: c.shape, kind: c.refIndex === null ? undefined : refKind.get(c.refIndex) })),
            later.map((other) => other.prop),
          );
          overridden.components.forEach((flag, i) => {
            components[i].overridden = flag;
          });
          return {
            index,
            property: decl.prop,
            rawValue,
            value: normalizeValue(rawValue),
            important: decl.important === true,
            line: decl.source.start.line,
            shape,
            shapeDetail: classified.kind === "expression" ? classified.detail : null,
            components,
            refs,
            duplicateInRule: decls.some((other, i) => i !== index && other.prop === decl.prop),
            overriddenInRule: overridden.declaration,
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
