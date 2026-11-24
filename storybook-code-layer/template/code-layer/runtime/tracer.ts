// Trace an element: for each panel row, which declaration wins, its value
// shape, the token chain, and whether (and how) it can be re-bound.
import { ROWS, type RowDef } from "../shared/properties";
import type { ChainLink, CssFileInfo, ElementTrace, IndexJson, RowTrace, TokenItem, Verdict } from "../shared/protocol";
import { toHex } from "./color";
import { candidatesFor, collectSheetEntries, declarationsOf, type Candidate, type Decl, type SheetEntry } from "./cascade";
import { describe, pathText } from "./descriptor";
import { isAnimating, withFreeze } from "./freeze";
import { flattenStyleRules, ruleAt, styleByDevId, verifySheet, type SheetIdentity } from "./sheets";
import { TokenResolver } from "./tokens";

export type TraceContext = {
  index: IndexJson;
  tokens: Map<string, TokenItem>;
  filesByDevId: Map<string, CssFileInfo>;
  identities: Map<string, SheetIdentity>;
  entries: SheetEntry[];
  resolver: TokenResolver;
  classPrefixes: string[];
};

export async function buildContext(index: IndexJson): Promise<TraceContext> {
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
  };
}

function readOnly(reason: string, detail: string | null = null): Verdict {
  return { kind: "read-only", reason, detail };
}

function displayValue(row: RowDef, computed: string): string {
  if (row.kinds.includes("color")) return toHex(computed) ?? computed;
  if (row.id === "fontFamily") return computed.split(",")[0].replace(/["']/g, "").trim();
  return computed;
}

type Winner = { candidate: Candidate; decl: Decl } | null;

function findWinner(row: RowDef, candidates: Candidate[]): { winner: Winner; important: boolean } {
  let important = false;
  for (const candidate of candidates) {
    for (const decl of declarationsOf(candidate)) if (decl.important && row.family.includes(decl.property)) important = true;
  }
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const inFamily = declarationsOf(candidates[i]).filter((d) => row.family.includes(d.property));
    if (inFamily.length > 0) return { winner: { candidate: candidates[i], decl: inFamily[inFamily.length - 1] }, important };
  }
  return { winner: null, important };
}

function mirrorOf(index: IndexJson, file: string): string | null {
  return index.tokens.mirrors.find((m) => m.source === file)?.mirror ?? null;
}

export function traceRow(element: Element, row: RowDef, candidates: Candidate[], ctx: TraceContext): RowTrace {
  const style = getComputedStyle(element);
  const computed = style.getPropertyValue(row.computed).trim();
  const base: RowTrace = {
    id: row.id,
    label: row.label,
    cssProperty: row.computed,
    computed,
    computedDisplay: displayValue(row, computed),
    editableInProof: row.editableInProof,
    verdict: readOnly("no-declaration"),
    declaration: null,
    tokenName: null,
    tokenKind: null,
    chain: [],
    writesTo: null,
  };
  const uniform = (row.uniformWith ?? []).every((p) => style.getPropertyValue(p).trim() === computed);
  const inline = element as HTMLElement;
  if (row.family.some((p) => inline.style?.getPropertyValue?.(p))) return { ...base, verdict: readOnly("inline-style") };
  if (isAnimating(element, row.computed)) return { ...base, verdict: readOnly("animated") };

  const { winner, important } = findWinner(row, candidates);
  if (!winner) return base;
  const { candidate, decl } = winner;
  const identity = candidate.entry.identity;
  const file = identity?.file ?? null;
  const declaration =
    file && decl.indexed
      ? {
          file: file.file,
          workspacePath: file.workspacePath,
          ordinal: candidate.flat.index,
          selector: file.rules[candidate.flat.index]?.selector ?? candidate.flat.rule.selectorText,
          property: decl.property,
          value: decl.value,
          line: decl.indexed.line,
        }
      : null;
  const traced: RowTrace = { ...base, declaration };

  if (!identity) return { ...traced, verdict: readOnly("unknown-source", candidate.entry.label) };
  if (!identity.ok) return { ...traced, verdict: readOnly("identity-mismatch", identity.reason) };
  if (candidate.uncertain) return { ...traced, verdict: readOnly("uncertain-condition") };
  if (important || decl.important) return { ...traced, verdict: readOnly("important") };
  const indexed = decl.indexed!;
  if (indexed.duplicateInRule || indexed.overriddenInRule) return { ...traced, verdict: readOnly("duplicate-declaration") };
  if (row.id === "radius" && decl.property !== "border-radius") return { ...traced, verdict: readOnly("longhand") };
  if (row.id === "padding" && decl.property !== "padding") return { ...traced, verdict: readOnly("longhand") };
  if (!uniform) return { ...traced, verdict: readOnly("not-uniform") };
  if (indexed.shape === "var-with-fallback") return { ...traced, verdict: readOnly("var-with-fallback") };
  if (indexed.shape === "expression") {
    const ref = indexed.refs[0];
    return { ...traced, tokenName: ref?.name ?? null, chain: ref ? ctx.resolver.chain(ref.name) : [], verdict: readOnly("expression") };
  }
  if (indexed.shape === "raw") return { ...traced, verdict: readOnly("raw-value") };
  if (indexed.shape === "keyword") return { ...traced, verdict: readOnly("keyword") };

  const ref = indexed.refs[0];
  const token = ctx.tokens.get(ref.name) ?? null;
  const chain: ChainLink[] = ctx.resolver.chain(ref.name);
  const withChain: RowTrace = { ...traced, tokenName: ref.name, tokenKind: token?.kind ?? null, chain };
  if (row.id === "fill" && decl.property === "background" && token?.kind !== "color") {
    return { ...withChain, verdict: readOnly("background-not-color") };
  }
  const scoped = ctx.resolver.scopedOverride(element, ref.name);
  if (scoped) return { ...withChain, verdict: readOnly("scoped-override", scoped.selector) };

  if (token && token.source === "tier" && token.tier === "comp") {
    if (!ctx.index.tokens.editing.ok) return { ...withChain, verdict: readOnly("token-editing-disabled", ctx.index.tokens.editing.problems.join("；")) };
    if (!token.writable || token.duplicate) return { ...withChain, verdict: readOnly("duplicate-declaration") };
    if (token.shape !== "single-var" || !token.alias) return { ...withChain, verdict: readOnly("comp-token-not-alias") };
    if (chain[0]?.status === "overridden") return { ...withChain, verdict: readOnly("token-shadowed", chain[0].overriddenBy?.file ?? null) };
    const mirror = mirrorOf(ctx.index, token.file);
    return {
      ...withChain,
      verdict: { kind: "rebind-token", token: token.name, fromToken: token.alias, file: token.file, line: token.line },
      writesTo: { files: mirror ? [token.file, mirror] : [token.file], line: token.line, impact: token.usedBy.length },
    };
  }
  const warnings: string[] = [];
  if (!token || token.rootless) warnings.push("undefined-token");
  else if (token.source === "readonly") warnings.push("not-a-design-token");
  if (token?.tier === "ref") warnings.push("references-ref");
  if (chain.some((link) => link.status === "overridden")) warnings.push("overridden-in-theme");
  return {
    ...withChain,
    verdict: {
      kind: "rebind-declaration",
      file: identity.file.file,
      ordinal: candidate.flat.index,
      selector: identity.file.rules[candidate.flat.index].selector,
      property: decl.property,
      fromToken: ref.name,
      line: indexed.line,
      warnings,
    },
    writesTo: { files: [identity.file.workspacePath], line: indexed.line, impact: 1 },
  };
}

export type TraceMeta = { storyId: string | null; storyTitle: string | null; storyName: string | null; traceId: string };

export function traceElement(element: Element, ctx: TraceContext, meta: TraceMeta): ElementTrace | null {
  const descriptor = describe(element, meta.storyId, ctx.classPrefixes);
  if (!descriptor) return null;
  const candidates = candidatesFor(element, ctx.entries);
  const html = element as HTMLElement;
  return {
    traceId: meta.traceId,
    indexRevision: ctx.index.revision,
    storyId: meta.storyId,
    storyTitle: meta.storyTitle,
    storyName: meta.storyName,
    descriptor,
    label: descriptor.label,
    componentId: element.getAttribute("data-component"),
    variant: element.getAttribute("data-variant"),
    size: { width: html.offsetWidth ?? Math.round(element.getBoundingClientRect().width), height: html.offsetHeight ?? Math.round(element.getBoundingClientRect().height) },
    pathText: pathText(descriptor),
    rows: ROWS.map((row) => traceRow(element, row, candidates, ctx)),
  };
}

/** The CSSOM rule and property a verdict edits, for previews and probes. */
export function editTarget(verdict: Verdict, ctx: TraceContext): { rule: CSSStyleRule; property: string; style: HTMLStyleElement } | null {
  if (verdict.kind === "rebind-token") {
    const devId = ctx.index.tokens.entry.devId;
    const style = devId ? styleByDevId(devId) : null;
    if (!style?.sheet) return null;
    const matches = flattenStyleRules(style.sheet.cssRules).filter(
      (flat) => flat.rule.selectorText === ":root" && flat.rule.style.getPropertyValue(verdict.token) !== "",
    );
    return matches.length === 1 ? { rule: matches[0].rule, property: verdict.token, style } : null;
  }
  if (verdict.kind === "rebind-declaration") {
    const file = ctx.index.css.files.find((f) => f.file === verdict.file);
    const style = file ? styleByDevId(file.devId) : null;
    const rule = style ? ruleAt(style, verdict.ordinal) : null;
    return style && rule ? { rule, property: verdict.property, style } : null;
  }
  return null;
}

/** Prove that the targeted declaration drives this element: set a sentinel, read, restore. */
export function probeRow(element: Element, rowId: string, verdict: Verdict, ctx: TraceContext): "confirmed" | "unconfirmed" | "no-target" {
  const row = ROWS.find((r) => r.id === rowId);
  const target = editTarget(verdict, ctx);
  if (!row || !target) return "no-target";
  const { rule, property } = target;
  const original = rule.style.getPropertyValue(property);
  const priority = rule.style.getPropertyPriority(property);
  const cssTextBefore = rule.style.cssText;
  const sentinel = row.kinds.includes("color") ? "rgb(1, 2, 3)" : "13.37px";
  let result: "confirmed" | "unconfirmed" = "unconfirmed";
  withFreeze(element, () => {
    const before = getComputedStyle(element).getPropertyValue(row.computed);
    rule.style.setProperty(property, sentinel, priority);
    const during = getComputedStyle(element).getPropertyValue(row.computed);
    rule.style.setProperty(property, original, priority);
    const after = getComputedStyle(element).getPropertyValue(row.computed);
    result = during !== before && after === before ? "confirmed" : "unconfirmed";
  });
  if (rule.style.cssText !== cssTextBefore) {
    // Serialisation drifted; rebuild the sheet from its own text.
    const style = target.style;
    style.textContent = style.textContent ?? "";
  }
  return result;
}
