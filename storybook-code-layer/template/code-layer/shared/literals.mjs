// Literal components that can be replaced by a token ("tokenize"). One
// implementation for the dev server (Node) and the preview (browser): which
// top-level component of a declared value is a tokenizable literal, how it is
// replaced and restored, and when a token's value equals a literal.
//
// A component is addressed by its position among the top-level components of
// the value, as splitTopLevel lists them. A tokenizable value has no top-level
// comma or slash, so that position does not move when a component is replaced.
import { sameColor } from "./contrast.mjs";
import { inferKind, parseScalar } from "./kinds.mjs";
import { GROUP_BY_ID, GROUP_OF_SLOT } from "./property-table.mjs";
import { sidesOf } from "./sides.mjs";
import { classifyValue, normalizeValue, replaceComponent } from "./value-refs.mjs";

/** Kinds a literal component can have and still be tokenized. */
export const LITERAL_KINDS = new Set(["color", "dimension", "percentage", "number", "zero", "font-family"]);

/**
 * Whether the index-th top-level component of a declared value can be
 * replaced by a token.
 *   accepted:  the token kinds the row's property accepts (property-table.mjs)
 *   available: the kinds of the tokens the declaration may reference
 * Returns { tokenizable: true, kind, literal } or
 * { tokenizable: false, reason, literal } where reason is
 *   "not-a-literal"       the component holds a reference, or there is none
 *   "literal-list"        the value has a top-level comma or slash
 *   "keyword"             the component is a keyword (auto, bold, inherit, fit-content…)
 *   "literal-expression"  a function or a value this property cannot take as a token kind
 *   "no-token-of-kind"    no token the declaration may reference has an accepted kind
 */
export function literalVerdict(value, index, { accepted = [], available = [] } = {}) {
  const components = classifyValue(String(value ?? "")).components;
  const component = components[index];
  const literal = component?.text ?? null;
  if (!component || component.shape !== "raw") return { tokenizable: false, reason: "not-a-literal", literal };
  if (components.some((part) => part.shape === "separator")) return { tokenizable: false, reason: "literal-list", literal };
  const kind = inferKind(component.text);
  if (kind === "keyword") return { tokenizable: false, reason: "keyword", literal };
  if (!LITERAL_KINDS.has(kind) || !accepted.includes(kind)) return { tokenizable: false, reason: "literal-expression", literal };
  const offered = new Set(available);
  if (!accepted.some((k) => offered.has(k))) return { tokenizable: false, reason: "no-token-of-kind", literal };
  return { tokenizable: true, kind, literal };
}

/**
 * A list of literals: components separated by a top-level comma or slash, none
 * of them a reference (a font stack, `8px / 4px`). It has no single component a
 * token could replace, so its row is read-only as "literal-list".
 */
export function isLiteralList(value) {
  const components = classifyValue(String(value ?? "")).components;
  return components.some((part) => part.shape === "separator") && components.every((part) => part.shape === "separator" || part.shape === "raw");
}

/** The value with its index-th component, which must be `literal`, replaced by `var(<token>)`. */
export function tokenizeComponent(value, index, literal, token) {
  return replaceComponent(value, index, literal, `var(${token})`);
}

/** The value with its index-th component, which must be exactly `var(<token>)`, put back to `literal`. */
export function restoreComponent(value, index, token, literal) {
  return replaceComponent(value, index, `var(${token})`, literal);
}

/**
 * Two values are the same for "same value" marks: the same color, or the same
 * number with the same unit, or both zero. `1em` and `16px` are not the same:
 * on another element they differ.
 */
export function sameValue(a, b) {
  if (a == null || b == null) return false;
  const ka = inferKind(a);
  const kb = inferKind(b);
  if (ka === "color" || kb === "color") return ka === kb && sameColor(normalizeValue(a), normalizeValue(b));
  const sa = parseScalar(a);
  const sb = parseScalar(b);
  if (sa && sb) return (sa.value === 0 && sb.value === 0) || (sa.value === sb.value && sa.unit === sb.unit);
  return normalizeValue(a) === normalizeValue(b);
}

// ---- candidate order -----------------------------------------------------------------------

/** The category of a token: a component token takes the category of the system token it aliases. */
export function tokenCategoryOf(name, tokens) {
  let token = tokens.get(name);
  for (let hops = 0; token && token.tier === "comp" && token.alias && hops < 8; hops += 1) token = tokens.get(token.alias);
  return token && token.tier !== "comp" ? token.category ?? null : null;
}

/**
 * Per property group of the inspector's table: the token categories its
 * declarations already reference, directly or through a component token, in
 * the project's component stylesheets. `index` is the shared index (css files
 * with their declarations, token items).
 */
export function categoryUsage(index) {
  const tokens = new Map((index?.tokens?.items ?? []).map((t) => [t.name, t]));
  const usage = new Map();
  for (const file of index?.css?.files ?? []) {
    for (const rule of file.rules ?? []) {
      for (const decl of rule.declarations ?? []) {
        if (!decl.refs?.length) continue;
        // A reference carries its token's kind, so a shorthand such as `border: 1px solid var(--color)` can be read.
        const parts = decl.components.map((c) => {
          if (c.refIndex === null || c.refIndex === undefined) return { text: c.text };
          const ref = decl.refs.find((r) => r.refIndex === c.refIndex);
          return { text: c.text, kind: ref && c.shape === "single-var" ? tokens.get(ref.name)?.kind ?? "unknown" : "unknown" };
        });
        const result = sidesOf(decl.property, parts);
        if (!result.ok) continue;
        for (const { slot, component } of result.slots) {
          const group = GROUP_OF_SLOT[slot];
          const part = decl.components[component];
          if (!group || !part || part.refIndex === null || part.refIndex === undefined) continue;
          const ref = decl.refs.find((r) => r.refIndex === part.refIndex);
          const category = ref ? tokenCategoryOf(ref.name, tokens) : null;
          if (!category) continue;
          if (!usage.has(group.id)) usage.set(group.id, new Set());
          usage.get(group.id).add(category);
        }
      }
    }
  }
  return usage;
}

/** The home categories of a row: those of its own group, or, when it uses none, those of the other groups of its section. */
export function homeCategories(groupId, usage) {
  const own = usage.get(groupId);
  if (own && own.size > 0) return new Set(own);
  const section = GROUP_BY_ID[groupId]?.section;
  const borrowed = new Set();
  for (const [id, categories] of usage) {
    if (id !== groupId && GROUP_BY_ID[id]?.section === section) for (const category of categories) borrowed.add(category);
  }
  return borrowed;
}

/**
 * The candidates of a literal row in three groups: 1) tokens of a home
 * category whose value equals the literal, 2) the other tokens of the home
 * categories, nearest value first where comparable and by name otherwise,
 * 3) every other token by name. A token of equal value is marked in every group.
 *   valueOf(token):    the token's value for the active theme
 *   categoryOf(token): its category (tokenCategoryOf)
 * Returns [{ token, group, same }] in display order.
 */
export function orderLiteralCandidates(literal, tokens, { home, valueOf, categoryOf }) {
  const target = parseScalar(literal);
  const distance = (value) => {
    const scalar = parseScalar(value);
    if (!target || !scalar) return null;
    if (scalar.unit !== target.unit && scalar.value !== 0 && target.value !== 0) return null;
    return Math.abs(scalar.value - target.value);
  };
  const entries = tokens.map((token) => {
    const value = valueOf(token);
    const same = sameValue(value, literal);
    const inHome = home.has(categoryOf(token));
    return { token, group: inHome ? (same ? 1 : 2) : 3, same, distance: distance(value) };
  });
  const byName = (a, b) => a.token.name.localeCompare(b.token.name);
  entries.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.group === 2) {
      if (a.distance !== null && b.distance !== null && a.distance !== b.distance) return a.distance - b.distance;
      if ((a.distance === null) !== (b.distance === null)) return a.distance === null ? 1 : -1;
    }
    return byName(a, b);
  });
  return entries.map(({ token, group, same }) => ({ token, group, same }));
}
