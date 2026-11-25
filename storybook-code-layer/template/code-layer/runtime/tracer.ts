// Trace an element: for every row of the panel's table, which declaration
// component sets it, the token chain behind it, and at which scopes (the
// declaration, its component token, the system token) it can be re-bound.
//
// The unit is the "slot" (a logical longhand, see shared/sides.mjs): every
// declaration that matches the element is turned into slot -> component
// assignments, the last one in cascade order wins each slot, and slots that
// share a winner are reported as one row.
import { inferKind } from "../shared/kinds.mjs";
import { GROUPS, rowIdFor, sentinelFor, slotPart, type GroupDef } from "../shared/properties";
import type {
  ChainLink,
  CssFileInfo,
  ElementTrace,
  IndexJson,
  InheritedFrom,
  RowScope,
  RowSide,
  RowTrace,
  ScopeId,
  ScopeTarget,
  TokenItem,
} from "../shared/protocol";
import { physicalSideOf, sidesOf } from "../shared/sides.mjs";
import { findVarRefs } from "../shared/value-refs.mjs";
import { toHex } from "./color";
import { candidatesFor, collectSheetEntries, declarationsOf, inlineDeclarations, type Candidate, type Decl, type SheetEntry } from "./cascade";
import { describe, pathText } from "./descriptor";
import { isAnimating, withFreeze } from "./freeze";
import { findInheritedSource, inheritsSlot } from "./inherit";
import { flattenStyleRules, ruleAt, styleByDevId, verifySheet, type SheetIdentity } from "./sheets";
import { STYLE_ATTRIBUTE, TokenResolver } from "./tokens";

export type TraceContext = {
  index: IndexJson;
  tokens: Map<string, TokenItem>;
  filesByDevId: Map<string, CssFileInfo>;
  identities: Map<string, SheetIdentity>;
  entries: SheetEntry[];
  resolver: TokenResolver;
  classPrefixes: string[];
  /** Workspace-relative paths the server cannot write right now. */
  unwritable: Set<string>;
};

export async function buildContext(index: IndexJson, unwritable: Set<string> = new Set()): Promise<TraceContext> {
  const identities = new Map<string, SheetIdentity>();
  for (const file of index.css.files) {
    const identity = await verifySheet(file);
    if (identity) identities.set(file.devId, identity);
  }
  const tokens = new Map(index.tokens.items.map((t) => [t.name, t] as const));
  const entries = collectSheetEntries(identities);
  return {
    index,
    tokens,
    filesByDevId: new Map(index.css.files.map((f) => [f.devId, f] as const)),
    identities,
    entries,
    resolver: new TokenResolver(index, tokens, entries),
    classPrefixes: index.components?.classPrefixes ?? [],
    unwritable,
  };
}

// ---- slot winners ------------------------------------------------------------

export type SlotWinner = {
  source: "declaration" | "inline-style" | "presentation-attribute";
  candidate: Candidate | null;
  decl: Decl | null;
  /** Index of the component of the value that sets the slot; null when the shorthand resets it. */
  component: number | null;
  /** Why the mapping from the declaration to its sides could not be decided. */
  failure: string | null;
  /** Identity for merging slots into one row. */
  key: string;
};

const PRESENTATION_ATTRIBUTES = ["fill", "stroke", "stroke-width", "opacity", "color", "font-family", "font-size", "font-weight", "letter-spacing", "display"];

function isSvgGraphic(element: Element): boolean {
  return typeof SVGElement !== "undefined" && element instanceof SVGElement && element.tagName.toLowerCase() !== "svg";
}

export function slotsOf(group: GroupDef, element: Element): string[] {
  return group.svgSlots && isSvgGraphic(element) ? group.svgSlots : group.slots;
}

function kindOfReference(name: string, ctx: TraceContext): string {
  const known = ctx.tokens.get(name)?.kind;
  if (known && known !== "unknown") return known;
  return inferKind(getComputedStyle(document.documentElement).getPropertyValue(name));
}

function sideComponents(decl: Decl, ctx: TraceContext): Array<{ text: string; kind?: string }> {
  return decl.components.map((component) => {
    if (component.refIndex === null) return { text: component.text };
    const ref = decl.refs.find((r) => r.refIndex === component.refIndex);
    return { text: component.text, kind: ref && component.shape === "single-var" ? kindOfReference(ref.name, ctx) : "unknown" };
  });
}

/** Which declaration component sets each slot of the table on this element. */
export function collectWinners(element: Element, candidates: Candidate[], ctx: TraceContext): Map<string, SlotWinner> {
  const style = getComputedStyle(element);
  const writingMode = style.writingMode;
  const direction = style.direction;
  const winners = new Map<string, SlotWinner>();
  const assign = (decl: Decl, base: Omit<SlotWinner, "component" | "failure" | "key">, keyPrefix: string) => {
    if (decl.property.startsWith("--")) return;
    const result = sidesOf(decl.property, sideComponents(decl, ctx), writingMode, direction);
    if (result.ok) {
      for (const { slot, component } of result.slots) winners.set(slot, { ...base, component, failure: null, key: `${keyPrefix}|${decl.index}|${component}` });
    } else if (result.reason !== "unknown-property") {
      for (const slot of result.affected) winners.set(slot, { ...base, component: null, failure: result.reason, key: `${keyPrefix}|${decl.index}|${result.reason}` });
    }
  };
  const rules = (important: boolean) => {
    for (const candidate of candidates) {
      for (const decl of declarationsOf(candidate)) {
        if (decl.important !== important) continue;
        assign(decl, { source: "declaration", candidate, decl }, `rule|${candidate.entry.order}|${candidate.flat.index}`);
      }
    }
  };
  // Cascade order: normal rules, the style attribute, then important rules.
  rules(false);
  for (const decl of inlineDeclarations(element)) assign(decl, { source: "inline-style", candidate: null, decl }, "inline");
  rules(true);
  // A presentation attribute only counts where no rule and no style attribute set the property.
  if (isSvgGraphic(element)) {
    for (const name of PRESENTATION_ATTRIBUTES) {
      if (!winners.has(name) && element.hasAttribute(name)) {
        winners.set(name, { source: "presentation-attribute", candidate: null, decl: null, component: null, failure: null, key: `attribute|${name}` });
      }
    }
  }
  return winners;
}

// ---- rows -------------------------------------------------------------------

function displayValue(group: GroupDef, computed: string): string {
  if (group.kinds.includes("color")) return toHex(computed) ?? computed;
  if (group.id === "fontFamily") return computed.split(",")[0].replace(/["']/g, "").trim();
  return computed;
}

function physicalOf(group: GroupDef, slot: string, writingMode: string, direction: string): string | null {
  const part = slotPart(group, slot);
  if (group.split === "sides") return physicalSideOf(part, writingMode, direction);
  if (group.split === "corners") {
    const [block, inline] = part.split("-");
    const a = physicalSideOf(`block-${block}`, writingMode, direction);
    const b = physicalSideOf(`inline-${inline}`, writingMode, direction);
    if (!a || !b) return null;
    const vertical = a === "top" || a === "bottom" ? a : b;
    const horizontal = a === "top" || a === "bottom" ? b : a;
    return `${vertical}-${horizontal}`;
  }
  if (/inline-size$/.test(slot) || /block-size$/.test(slot)) {
    const horizontal = writingMode === "horizontal-tb";
    if (writingMode !== "horizontal-tb" && writingMode !== "vertical-rl" && writingMode !== "vertical-lr") return null;
    return slot.includes("inline") === horizontal ? "width" : "height";
  }
  return null;
}

/** Property names an animation may use for a slot (logical, physical and shorthand). */
function animatedNames(group: GroupDef, slot: string, physical: string | null): string[] {
  const names = [slot];
  const base = group.id === "padding" || group.id === "margin" ? group.id : null;
  if (base) names.push(base, `${base}-block`, `${base}-inline`, ...(physical ? [`${base}-${physical}`] : []));
  if (group.id === "radius") names.push("border-radius", ...(physical ? [`border-${physical}-radius`] : []));
  if (group.id === "borderColor" || group.id === "borderWidth") {
    const part = group.id === "borderColor" ? "color" : "width";
    names.push("border", `border-${part}`, ...(physical ? [`border-${physical}`, `border-${physical}-${part}`] : []));
  }
  if (group.id === "fill") names.push("background");
  if (group.id === "gap") names.push("gap");
  if (group.id === "outlineColor" || group.id === "outlineWidth") names.push("outline");
  if (physical === "width" || physical === "height") names.push(slot.replace(/(inline|block)-size$/, physical));
  if (group.section === "typography" && group.id !== "color" && group.id !== "letterSpacing") names.push("font");
  return names;
}

function readOnlyRow(row: RowTrace, reason: string, detail: string | null = null): RowTrace {
  return { ...row, readOnly: { reason, detail }, scopes: [], defaultScope: null };
}

function mirrorOf(index: IndexJson, file: string): string | null {
  return index.tokens.mirrors.find((m) => m.source === file)?.mirror ?? null;
}

function componentsUsing(index: IndexJson, usages: Array<{ file: string }>): number {
  const byFile = new Map(index.css.files.map((f) => [f.file, f.componentId] as const));
  return new Set(usages.map((u) => byFile.get(u.file) ?? u.file)).size;
}

/** The scopes at which the reference of a declaration can be re-bound. */
export function buildScopes(args: {
  file: CssFileInfo;
  ordinal: number;
  selector: string;
  decl: Decl;
  refIndex: number;
  refName: string;
  chain: ChainLink[];
  ctx: TraceContext;
}): { scopes: RowScope[]; defaultScope: ScopeId | null } {
  const { file, ordinal, selector, decl, refIndex, refName, chain, ctx } = args;
  const index = ctx.index;
  const token = ctx.tokens.get(refName) ?? null;
  const scopes: RowScope[] = [];
  const unwritable = (path: string) => ctx.unwritable.has(path);
  const editing = index.tokens.editing;
  const linkOf = (name: string) => chain.find((link) => link.name === name) ?? null;

  const declarationTarget: ScopeTarget = { type: "rebind-declaration", file: file.file, workspacePath: file.workspacePath, ordinal, selector, property: decl.property, refIndex, line: decl.indexed?.line ?? 0 };
  const declarationProblem = unwritable(file.workspacePath) ? "file-not-writable" : null;
  scopes.push({
    id: "declaration",
    available: declarationProblem === null,
    reason: declarationProblem,
    detail: declarationProblem ? file.workspacePath : null,
    target: declarationTarget,
    fromToken: refName,
    before: decl.value,
    targetTier: "sys",
    writes: { files: [file.workspacePath], line: decl.indexed?.line ?? 0 },
    impact: { declarations: 1, components: 1, excludesInlineStyles: false },
  });

  const tokenProblem = (t: TokenItem, targetTier: "sys" | "ref"): { reason: string; detail: string | null } | null => {
    if (!editing.ok) return { reason: "token-editing-disabled", detail: editing.problems.join("; ") };
    if (!t.writable) return { reason: "tier-not-writable", detail: t.tier };
    if (t.duplicate) return { reason: "duplicate-token", detail: t.name };
    if (t.shape !== "single-var" || !t.alias) return { reason: "not-single-alias", detail: t.declaredValue };
    if (ctx.tokens.get(t.alias)?.tier !== targetTier) return { reason: "not-single-alias", detail: t.declaredValue };
    const link = linkOf(t.name);
    if (link?.status === "overridden") return { reason: "token-shadowed", detail: link.overriddenBy?.file ?? null };
    if (unwritable(t.file)) return { reason: "file-not-writable", detail: t.file };
    return null;
  };
  const tokenScope = (id: ScopeId, t: TokenItem, targetTier: "sys" | "ref", usages: Array<{ file: string }>): RowScope => {
    const problem = tokenProblem(t, targetTier);
    const mirror = mirrorOf(index, t.file);
    return {
      id,
      available: problem === null,
      reason: problem?.reason ?? null,
      detail: problem?.detail ?? null,
      target: { type: "rebind-token", token: t.name, tier: t.tier as "comp" | "sys", file: t.file, line: t.line },
      fromToken: t.alias ?? "",
      before: t.declaredValue ?? "",
      targetTier,
      writes: { files: mirror ? [t.file, mirror] : [t.file], line: t.line },
      impact: { declarations: usages.length, components: componentsUsing(index, usages), excludesInlineStyles: id === "system-token" },
    };
  };

  let componentScope: RowScope | null = null;
  if (token && token.source === "tier" && token.tier === "comp") {
    componentScope = tokenScope("component-token", token, "sys", token.usedBy);
    scopes.push(componentScope);
  }
  // The system token on the chain: the referenced one, or the one the component token aliases.
  const systemToken = token?.tier === "sys" ? token : token?.tier === "comp" && token.alias ? ctx.tokens.get(token.alias) ?? null : null;
  if (systemToken && systemToken.source === "tier" && systemToken.tier === "sys" && systemToken.writable) {
    const usages = [...systemToken.usedBy];
    for (const name of systemToken.aliasedBy) usages.push(...(ctx.tokens.get(name)?.usedBy ?? []));
    scopes.push(tokenScope("system-token", systemToken, "ref", usages));
  }

  // The default is the layer the value comes from; a broken default is never replaced by another scope.
  const defaultScope: ScopeId | null = componentScope ? (componentScope.available ? "component-token" : null) : scopes[0].available ? "declaration" : null;
  return { scopes, defaultScope };
}

type Traced = { winner: SlotWinner; element: Element; inherited: InheritedFrom | null };

function buildRow(element: Element, group: GroupDef, slots: string[], traced: Traced | null, noSource: InheritedFrom | null, ctx: TraceContext, flow: { writingMode: string; direction: string }): RowTrace {
  const style = getComputedStyle(element);
  const values = slots.map((slot) => style.getPropertyValue(slot).trim());
  const sides: RowSide[] = slots.map((slot) => ({ slot, part: slotPart(group, slot), physical: physicalOf(group, slot, flow.writingMode, flow.direction) }));
  const distinct = [...new Set(values.map((value) => displayValue(group, value)))];
  const base: RowTrace = {
    id: rowIdFor(group, slots),
    group: group.id,
    section: group.section,
    sides,
    cssProperty: slots[0],
    computed: values[0],
    computedDisplay: distinct.join(" "),
    source: "none",
    declaration: null,
    tokenName: null,
    tokenKind: null,
    chain: [],
    readOnly: null,
    scopes: [],
    defaultScope: null,
    inheritedFrom: traced?.inherited ?? noSource,
    warnings: [],
  };
  if (sides.some((side) => animatedNames(group, side.slot, side.physical).some((name) => isAnimating(element, name)))) return readOnlyRow(base, "animated");
  if (!traced) return readOnlyRow(base, noSource ? "inherited-default" : "no-declaration");

  const { winner, inherited } = traced;
  if (winner.source === "inline-style") {
    const row = { ...base, source: "inline-style" as const };
    return readOnlyRow(row, inherited && inherited.kind !== "same-component" ? `inherited-${inherited.kind}` : "inline-style");
  }
  if (winner.source === "presentation-attribute") return readOnlyRow({ ...base, source: "presentation-attribute" }, "presentation-attribute");

  const candidate = winner.candidate!;
  const decl = winner.decl!;
  const identity = candidate.entry.identity;
  const file = identity?.file ?? null;
  const ordinal = candidate.flat.index;
  const selector = file?.rules[ordinal]?.selector ?? candidate.flat.rule.selectorText;
  const component = winner.component === null ? null : decl.components[winner.component] ?? null;
  const ref = component && component.refIndex !== null ? decl.refs.find((r) => r.refIndex === component.refIndex) ?? null : null;
  // An expression still shows the chain of its first reference.
  const shownRef = ref ?? (decl.indexed && decl.indexed.shape !== "raw" && decl.indexed.shape !== "keyword" ? decl.refs[0] ?? null : null);
  const token = shownRef ? ctx.tokens.get(shownRef.name) ?? null : null;
  const chain = shownRef ? ctx.resolver.chain(shownRef.name) : [];
  const row: RowTrace = {
    ...base,
    source: "declaration",
    declaration: {
      file: file?.file ?? null,
      workspacePath: file?.workspacePath ?? null,
      ordinal,
      selector,
      property: decl.property,
      value: decl.value,
      line: decl.indexed?.line ?? null,
      ruleLine: file?.rules[ordinal]?.line ?? null,
      component: winner.component,
      refIndex: component?.refIndex ?? null,
    },
    tokenName: shownRef?.name ?? null,
    tokenKind: token?.kind ?? null,
    chain,
  };

  if (inherited && inherited.kind !== "same-component") return readOnlyRow(row, `inherited-${inherited.kind}`, inherited.source ?? inherited.label);
  if (!identity) return readOnlyRow(row, "unknown-source", candidate.entry.label);
  if (!identity.ok) return readOnlyRow(row, "identity-mismatch", identity.reason);
  if (candidate.uncertain) return readOnlyRow(row, "uncertain-condition");
  if (decl.important) return readOnlyRow(row, "important");
  if (!group.editable) return readOnlyRow(row, "structural");
  if (winner.failure) return readOnlyRow(row, winner.failure);
  const indexed = decl.indexed!;
  if (indexed.duplicateInRule) return readOnlyRow(row, "duplicate-declaration", decl.property);
  if (indexed.shape === "var-with-fallback") return readOnlyRow(row, "var-with-fallback");
  if (indexed.shape === "expression") {
    const reason = indexed.shapeDetail === "list" ? "reference-list" : indexed.shapeDetail === "slash" ? "slash-value" : indexed.shapeDetail === "fallback" ? "var-with-fallback" : "expression";
    return readOnlyRow(row, reason);
  }
  if (!component) return readOnlyRow(row, "reset-by-shorthand", decl.property);
  if (component.shape === "keyword") return readOnlyRow(row, "keyword");
  if (component.shape !== "single-var" || !ref) return readOnlyRow(row, "raw-value");

  // The custom property must come from the document root: a re-declaration on an element is a scoped override.
  const scoped = ctx.resolver.scopedOverride(traced.element, ref.name);
  if (scoped) return readOnlyRow(row, "scoped-override", scoped.selector === STYLE_ATTRIBUTE ? null : scoped.selector);

  const warnings: string[] = [];
  if (!token || token.rootless) warnings.push("undefined-token");
  else if (token.source === "readonly") warnings.push("not-a-design-token");
  if (token?.tier === "ref") warnings.push("references-ref");
  if (chain.some((link) => link.status === "overridden")) warnings.push("overridden-in-theme");
  const { scopes, defaultScope } = buildScopes({ file: identity.file, ordinal, selector, decl, refIndex: ref.refIndex, refName: ref.name, chain, ctx });
  return { ...row, scopes, defaultScope, warnings };
}

export type TraceMeta = { storyId: string | null; storyTitle: string | null; storyName: string | null; traceId: string };

export function traceElement(element: Element, ctx: TraceContext, meta: TraceMeta): ElementTrace | null {
  const started = performance.now();
  const descriptor = describe(element, meta.storyId, ctx.classPrefixes);
  if (!descriptor) return null;
  const style = getComputedStyle(element);
  const flow = { writingMode: style.writingMode, direction: style.direction };
  const candidates = candidatesFor(element, ctx.entries);
  const winners = collectWinners(element, candidates, ctx);
  // Ancestors are traced only when an inherited row needs them, once each.
  const ancestorWinners = new Map<Element, Map<string, SlotWinner>>();
  const winnersOf = (node: Element) => {
    if (node === element) return winners;
    let found = ancestorWinners.get(node);
    if (!found) {
      found = collectWinners(node, candidatesFor(node, ctx.entries), ctx);
      ancestorWinners.set(node, found);
    }
    return found;
  };

  const rows: RowTrace[] = [];
  for (const group of GROUPS) {
    const slots = slotsOf(group, element);
    // Slots that share a winner form one row, in the order of their first slot.
    const parts = new Map<string, { slots: string[]; traced: Traced | null; noSource: InheritedFrom | null }>();
    for (const slot of slots) {
      let traced: Traced | null = winners.has(slot) ? { winner: winners.get(slot)!, element, inherited: null } : null;
      let noSource: InheritedFrom | null = null;
      if (inheritsSlot(group.inherited, slot)) {
        const source = findInheritedSource(element, slot, traced?.winner ?? null, winnersOf, ctx);
        if (source.kind === "found") traced = { winner: source.winner, element: source.element, inherited: source.inherited };
        else if (source.kind === "default") {
          traced = null;
          noSource = source.inherited;
        }
      }
      const key = traced ? `${traced.inherited ? "inherited:" : ""}${traced.winner.key}` : "none";
      const part = parts.get(key) ?? { slots: [], traced, noSource };
      part.slots.push(slot);
      parts.set(key, part);
    }
    for (const part of parts.values()) rows.push(buildRow(element, group, part.slots, part.traced, part.noSource, ctx, flow));
  }

  // The rule that carries the element's own declarations: the highest-priority indexed rule that matches it.
  let ownRule: ElementTrace["ownRule"] = null;
  for (let i = candidates.length - 1; i >= 0 && !ownRule; i -= 1) {
    const identity = candidates[i].entry.identity;
    const rule = identity?.ok ? identity.file.rules[candidates[i].flat.index] : null;
    if (identity && rule) ownRule = { workspacePath: identity.file.workspacePath, selector: rule.selector, ordinal: rule.ordinal, line: rule.line };
  }
  const html = element as HTMLElement;
  const rect = element.getBoundingClientRect();
  return {
    traceId: meta.traceId,
    indexRevision: ctx.index.revision,
    storyId: meta.storyId,
    storyTitle: meta.storyTitle,
    storyName: meta.storyName,
    descriptor,
    label: descriptor.label,
    // The component the element belongs to: the nearest component root at or above it.
    componentId: descriptor.anchor.component,
    variant: descriptor.anchor.variant,
    size: { width: html.offsetWidth ?? Math.round(rect.width), height: html.offsetHeight ?? Math.round(rect.height) },
    pathText: pathText(descriptor),
    writingMode: flow.writingMode,
    direction: flow.direction,
    ownRule,
    durationMs: Math.round((performance.now() - started) * 10) / 10,
    rows,
  };
}

// ---- edit targets and probes -----------------------------------------------------

export type EditTarget = { rule: CSSStyleRule; property: string; style: HTMLStyleElement; refIndex: number | null };

/** The CSSOM rule and property a scope edits, for previews and probes. */
export function editTarget(target: ScopeTarget, ctx: { index: IndexJson }): EditTarget | null {
  if (target.type === "rebind-token") {
    const devId = ctx.index.tokens.entry.devId;
    const style = devId ? styleByDevId(devId) : null;
    if (!style?.sheet) return null;
    const matches = flattenStyleRules(style.sheet.cssRules).filter((flat) => flat.rule.selectorText === ":root" && flat.rule.style.getPropertyValue(target.token) !== "");
    return matches.length === 1 ? { rule: matches[0].rule, property: target.token, style, refIndex: null } : null;
  }
  const file = ctx.index.css.files.find((f) => f.file === target.file);
  const style = file ? styleByDevId(file.devId) : null;
  const rule = style ? ruleAt(style, target.ordinal) : null;
  return style && rule ? { rule, property: target.property, style, refIndex: target.refIndex } : null;
}

/** `value` with its refIndex-th var() replaced by `replacement`; null when there is no such reference. */
export function replaceReference(value: string, refIndex: number, replacement: string): string | null {
  const ref = findVarRefs(value)[refIndex];
  return ref ? value.slice(0, ref.start) + replacement + value.slice(ref.end) : null;
}

export type ProbeResult = "confirmed" | "unconfirmed" | "no-target";

/**
 * Prove that the target of a scope drives this element: with transitions
 * suppressed, put a sentinel where the reference is, read the computed value,
 * and restore the original text and priority.
 */
export function probeScope(element: Element, row: RowTrace, scope: RowScope, ctx: TraceContext): ProbeResult {
  const group = GROUPS.find((g) => g.id === row.group);
  const target = editTarget(scope.target, ctx);
  if (!group || !target) return "no-target";
  const { rule, property } = target;
  const original = rule.style.getPropertyValue(property);
  const priority = rule.style.getPropertyPriority(property);
  const sentinel = sentinelFor(group);
  const probeValue = target.refIndex === null ? sentinel : replaceReference(original, target.refIndex, sentinel);
  if (probeValue === null) return "no-target";
  const cssTextBefore = rule.style.cssText;
  let result: ProbeResult = "unconfirmed";
  withFreeze(element, () => {
    const read = () => getComputedStyle(element).getPropertyValue(row.cssProperty);
    const before = read();
    rule.style.setProperty(property, probeValue, priority);
    const during = read();
    rule.style.setProperty(property, original, priority);
    const after = read();
    result = during !== before && after === before ? "confirmed" : "unconfirmed";
  });
  if (rule.style.cssText !== cssTextBefore) {
    // Serialisation drifted: rebuild the sheet from its own text (previews are re-applied by the caller).
    target.style.textContent = target.style.textContent ?? "";
  }
  return result;
}
