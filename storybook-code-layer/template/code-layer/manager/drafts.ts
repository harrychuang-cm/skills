// Draft construction, token-picker candidates and scales (pure helpers).
import { rebindTargets } from "../shared/candidates.mjs";
import { kindsCompatible, parseScalar, sameScale } from "../shared/kinds.mjs";
import { GROUP_BY_ID } from "../shared/properties";
import { normalizeValue, replaceVarName } from "../shared/value-refs.mjs";
import { PROTOCOL_VERSION, draftId, scopeDraftId, type Draft, type DraftOp, type ElementTrace, type IndexJson, type RowScope, type RowTrace, type ScopeId, type TokenItem } from "../shared/protocol";

/** Identifies a row of an element across re-traces (for the chosen scope and the open row). */
export function rowKey(trace: ElementTrace, row: RowTrace): string {
  return `${trace.storyId ?? ""}|${trace.pathText}|${row.id}`;
}

/** The scope a row is edited at: the person's choice when it is listed, else the default. */
export function currentScope(row: RowTrace, choice: ScopeId | undefined): RowScope | null {
  const wanted = choice && row.scopes.some((scope) => scope.id === choice) ? choice : row.defaultScope;
  return row.scopes.find((scope) => scope.id === wanted) ?? null;
}

/** The staged change of a row, at whichever of its scopes it was made. */
export function draftOfRow(row: RowTrace, drafts: Draft[]): Draft | null {
  const ids = new Set(row.scopes.map((scope) => scopeDraftId(scope.target)));
  return drafts.find((draft) => ids.has(draft.id)) ?? null;
}

function opFor(scope: RowScope, toToken: string, fromToken: string): DraftOp {
  const target = scope.target;
  if (target.type === "rebind-token") return { type: "rebind-token", token: target.token, tier: target.tier, fromToken, toToken, file: target.file, line: target.line };
  return { type: "rebind-declaration", file: target.file, ordinal: target.ordinal, selector: target.selector, property: target.property, refIndex: target.refIndex, fromToken, toToken, line: target.line };
}

export function makeDraft(trace: ElementTrace, row: RowTrace, scope: RowScope, toToken: string, index: IndexJson, existing: Draft | null): Draft | null {
  if (!scope.available) return null;
  // Re-picking on an already staged row keeps what the source held when it was first staged.
  const fromToken = existing?.op.fromToken ?? scope.fromToken;
  const before = existing?.before ?? normalizeValue(scope.before);
  const refIndex = scope.target.type === "rebind-declaration" ? scope.target.refIndex : 0;
  let after: string;
  try {
    after = replaceVarName(before, refIndex, fromToken, toToken);
  } catch {
    return null;
  }
  const op = opFor(scope, toToken, fromToken);
  return {
    schema: PROTOCOL_VERSION,
    id: draftId(op),
    rowId: row.id,
    group: row.group,
    parts: row.sides.map((side) => side.part),
    elementLabel: trace.label,
    storyId: trace.storyId,
    scope: scope.id,
    witness: existing?.witness ?? { descriptor: trace.descriptor, property: row.cssProperty, beforeComputed: row.computed },
    op,
    before,
    after,
    writesTo: { files: scope.writes.files, line: scope.writes.line, declarations: scope.impact.declarations, components: scope.impact.components },
    inheritedFrom: row.inheritedFrom?.kind === "same-component" ? row.inheritedFrom.label : null,
    indexRevision: index.revision,
    createdAt: existing?.createdAt ?? Date.now(),
  };
}

function ownComponentPrefix(scope: RowScope, index: IndexJson): string | null {
  if (scope.target.type !== "rebind-declaration") return null;
  const file = scope.target.file;
  const componentId = index.css.files.find((f) => f.file === file)?.componentId;
  return componentId ? `--${index.tokens.prefix}-comp-${componentId}-` : null;
}

/** Tokens a row may be re-bound to at a scope, best matches first. */
export function candidatesFor(row: RowTrace, scope: RowScope, index: IndexJson): TokenItem[] {
  const tokens = index.tokens.items;
  const from = tokens.find((t) => t.name === scope.fromToken) ?? null;
  const fromKind = from?.kind ?? "unknown";
  const group = GROUP_BY_ID[row.group];
  const own = ownComponentPrefix(scope, index);
  // The tier rule of the scope: a declaration uses system tokens or its own component's tokens.
  const tierOk = (t: TokenItem) => (scope.id === "declaration" ? t.tier === "sys" || (t.tier === "comp" && own !== null && t.name.startsWith(own)) : t.tier === scope.targetTier);
  const kindOk = (t: TokenItem) => (fromKind !== "unknown" ? kindsCompatible(t.kind, fromKind) : Boolean(group?.kinds.includes(t.kind)));
  const list = (rebindTargets(tokens) as TokenItem[]).filter((t) => tierOk(t) && kindOk(t));
  const rank = (t: TokenItem) => (from && sameScale(t.scale, from.scale) ? 0 : t.category === (from?.category ?? null) ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b) || (a.tier === b.tier ? 0 : a.tier === "sys" ? -1 : 1) || a.name.localeCompare(b.name));
}

/**
 * The scale of a row: the candidates that sit on the same scale as the token
 * bound now (same category, same reference family, comparable unit), in value
 * order. Values are the live ones of the page when known.
 */
export function scaleFor(row: RowTrace, scope: RowScope, index: IndexJson, liveValues: Record<string, string>): TokenItem[] {
  const tokens = index.tokens.items;
  const from = tokens.find((t) => t.name === scope.fromToken) ?? null;
  if (!from?.scale) return [];
  const valueOf = (t: TokenItem) => parseScalar(liveValues[t.name] ?? null)?.value ?? t.scale?.value ?? 0;
  const list = candidatesFor(row, scope, index).filter((t) => sameScale(t.scale, from.scale));
  if (!list.some((t) => t.name === from.name) && from.tier === list[0]?.tier) list.push(from);
  const sorted = list.sort((a, b) => valueOf(a) - valueOf(b) || a.name.localeCompare(b.name));
  return sorted.length >= 2 ? sorted : [];
}

/**
 * The token that gives the same result at another scope of the same row, or
 * null when there is none: a system token for a declaration or component
 * token, its reference token for the system token itself.
 */
export function translateTarget(index: IndexJson, from: RowScope, to: RowScope, toToken: string): string | null {
  const tokens = index.tokens.items;
  const byName = (name: string) => tokens.find((t) => t.name === name) ?? null;
  const fromTier = from.id === "system-token" ? "ref" : "sys";
  const toTier = to.id === "system-token" ? "ref" : "sys";
  if (fromTier === toTier) return toToken;
  if (toTier === "ref") {
    const alias = byName(toToken)?.alias ?? null;
    return alias && byName(alias)?.tier === "ref" ? alias : null;
  }
  return (rebindTargets(tokens) as TokenItem[]).find((t) => t.tier === "sys" && t.alias === toToken)?.name ?? null;
}
