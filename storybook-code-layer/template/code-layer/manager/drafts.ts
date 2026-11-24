// Draft construction and token-picker candidates (pure helpers).
import { kindsCompatible } from "../shared/kinds.mjs";
import { normalizeValue, replaceVarName } from "../shared/value-refs.mjs";
import { draftId, type Draft, type DraftOp, type ElementTrace, type IndexJson, type RowTrace, type TokenItem } from "../shared/protocol";

export function rowDraftId(row: RowTrace): string | null {
  const v = row.verdict;
  if (v.kind === "rebind-token") return `token:${v.token}`;
  if (v.kind === "rebind-declaration") return `decl:${v.file}#${v.ordinal}#${v.property}`;
  return null;
}

export function makeDraft(trace: ElementTrace, row: RowTrace, toToken: string, index: IndexJson, existing: Draft | null): Draft | null {
  const v = row.verdict;
  let op: DraftOp;
  let before: string;
  if (v.kind === "rebind-token") {
    const token = index.tokens.items.find((t) => t.name === v.token);
    if (!token?.declaredValue) return null;
    op = { type: "rebind-token", token: v.token, fromToken: v.fromToken, toToken, file: v.file, line: v.line };
    before = normalizeValue(token.declaredValue);
  } else if (v.kind === "rebind-declaration" && row.declaration) {
    op = {
      type: "rebind-declaration",
      file: v.file,
      ordinal: v.ordinal,
      selector: v.selector,
      property: v.property,
      fromToken: v.fromToken,
      toToken,
      line: v.line,
    };
    before = normalizeValue(row.declaration.value);
  } else {
    return null;
  }
  const after = replaceVarName(before, 0, op.fromToken, toToken);
  return {
    id: draftId(op),
    rowId: row.id,
    rowLabel: row.label,
    elementLabel: trace.label,
    storyId: trace.storyId,
    witness: existing?.witness ?? { descriptor: trace.descriptor, property: row.cssProperty, beforeComputed: row.computed },
    op,
    before: existing?.before ?? before,
    after,
    writesTo: row.writesTo ?? { files: [], line: op.line, impact: 0 },
    indexRevision: index.revision,
    createdAt: existing?.createdAt ?? Date.now(),
  };
}

export function shortName(name: string, prefix: string): string {
  return name.replace(new RegExp(`^--${prefix}-`), "");
}

/** Tokens a row may be re-bound to, best matches first. */
export function candidatesFor(row: RowTrace, trace: ElementTrace, index: IndexJson): TokenItem[] {
  const v = row.verdict;
  if (v.kind !== "rebind-token" && v.kind !== "rebind-declaration") return [];
  const tokens = index.tokens.items;
  const from = tokens.find((t) => t.name === v.fromToken);
  const fromKind = from?.kind ?? "unknown";
  const prefix = index.tokens.prefix;
  const ownComp = trace.componentId ? `--${prefix}-comp-${trace.componentId}-` : null;
  const list = tokens.filter((t) => {
    if (t.source !== "tier" || t.duplicate || t.resolution !== "ok") return false;
    if (!kindsCompatible(t.kind, fromKind)) return false;
    if (t.tier === "sys") return true;
    return v.kind === "rebind-declaration" && t.tier === "comp" && !!ownComp && t.name.startsWith(ownComp);
  });
  const category = from?.category ?? null;
  return list.sort((a, b) => {
    const ac = a.category === category ? 0 : 1;
    const bc = b.category === category ? 0 : 1;
    return ac - bc || (a.tier === b.tier ? 0 : a.tier === "sys" ? -1 : 1) || a.name.localeCompare(b.name);
  });
}
