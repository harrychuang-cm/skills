// Names of rows, sides and scopes in the interface language.
import { tCode, tMaybe, t } from "./i18n";
import { isLayoutOp, isLiteralOp, opFrom, opTo, type DraftOp, type EffectiveState, type RowSide, type ScopeId } from "./protocol";

/** Why the tool is suspended, in words; missing browser features are named. */
export function suspendText(effective: Extract<EffectiveState, { state: "suspended" }>): string {
  const detail =
    effective.reason === "unsupported-browser"
      ? (effective.detail ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => tMaybe(`capability.${id}`) ?? id)
          .join(t("list.separator"))
      : effective.detail ?? "";
  return tCode("suspend", effective.reason, "suspend.unknown", { detail });
}

export function sectionLabel(section: string): string {
  return tMaybe(`section.${section}`) ?? section;
}

export function groupLabel(group: string): string {
  return tMaybe(`group.${group}`) ?? group;
}

/** `block-start` -> "block start", with the physical side it is on right now when known. */
export function partLabel(part: string, physical: string | null = null): string {
  const name = tMaybe(`part.${part}`) ?? part;
  const where = physical ? tMaybe(`physical.${physical}`) : null;
  return where ? t("part.withPhysical", { part: name, physical: where }) : name;
}

/** Label of a row: the group, plus the parts it covers when it does not cover the whole group. */
export function rowLabel(row: { id: string; group: string; sides: RowSide[] }): string {
  const group = groupLabel(row.group);
  if (row.id === row.group) return group;
  return t("row.partial", { group, parts: row.sides.map((side) => partLabel(side.part, side.physical)).join(t("list.separator")) });
}

/** Label of a staged change's row, which only knows the group and the parts. */
export function draftRowLabel(draft: { rowId: string; group: string; parts: string[] }): string {
  const group = groupLabel(draft.group);
  if (draft.rowId === draft.group) return group;
  return t("row.partial", { group, parts: draft.parts.map((part) => partLabel(part)).join(t("list.separator")) });
}

export function scopeLabel(scope: ScopeId): string {
  return t(`scope.${scope}` as "scope.declaration");
}

/** Token name without the project prefix: `--md-sys-color-primary` -> `sys-color-primary`. */
export function shortToken(name: string, prefix: string): string {
  return name.startsWith(`--${prefix}-`) ? name.slice(prefix.length + 3) : name;
}

const VERTICAL = /^(vertical|sideways)/;
const SIZE_FIELDS: Record<string, [string, string]> = {
  inlineSize: ["width", "height"],
  blockSize: ["height", "width"],
  minInlineSize: ["minWidth", "minHeight"],
  minBlockSize: ["minHeight", "minWidth"],
  maxInlineSize: ["maxWidth", "maxHeight"],
  maxBlockSize: ["maxHeight", "maxWidth"],
};

/** The physical dimension a size group has in a writing mode: `width`, `minHeight`, … or null for other groups. */
export function physicalSize(group: string, writingMode: string | null): string | null {
  const pair = SIZE_FIELDS[group];
  if (!pair) return null;
  return pair[VERTICAL.test(writingMode ?? "") ? 1 : 0];
}

/** Short label of a row for the inspector: a word, not a sentence. Sizes are named as the person sees them. */
export function fieldLabel(row: { group: string }, writingMode: string | null): string {
  const size = physicalSize(row.group, writingMode);
  return tMaybe(`field.${size ?? row.group}`) ?? groupLabel(row.group);
}

const SIDE_GLYPH: Record<string, string> = { top: "\u2191", bottom: "\u2193", left: "\u2190", right: "\u2192", "top-left": "\u2196", "top-right": "\u2197", "bottom-right": "\u2198", "bottom-left": "\u2199" };

/** Which sides a partial row covers, as arrows of where they are on screen now; empty for a whole group. */
export function sideGlyph(row: { id: string; group: string; sides: RowSide[] }): string {
  if (row.id === row.group) return "";
  const sides = new Set(row.sides.map((side) => side.physical).filter((side): side is NonNullable<typeof side> => Boolean(side)));
  if (sides.size === 2 && sides.has("top") && sides.has("bottom")) return "\u2195";
  if (sides.size === 2 && sides.has("left") && sides.has("right")) return "\u2194";
  return [...sides].map((side) => SIDE_GLYPH[side] ?? "").join("");
}

/**
 * Token name as a design tool would show a variable: without the project
 * prefix and the tier, and without the component's own name for its tokens.
 * `--md-sys-color-primary` -> `color-primary`.
 */
export function prettyToken(name: string, prefix: string, componentId: string | null = null): string {
  const short = shortToken(name, prefix);
  if (short.startsWith("sys-") || short.startsWith("ref-")) return short.slice(4);
  if (componentId && short.startsWith(`comp-${componentId}-`)) return short.slice(componentId.length + 6);
  if (short.startsWith("comp-")) return short.slice(5);
  return short;
}

/**
 * The two ends of a change in short form: token names without the prefix, or
 * the keywords of a layout change ("not set" before an added declaration).
 */
export function changeEnds(op: DraftOp, prefix: string): { from: string; to: string } {
  if (isLayoutOp(op)) return { from: opFrom(op) || t("layout.unset"), to: opTo(op) };
  // A tokenization: the literal as the source holds it, then the token.
  if (isLiteralOp(op)) return { from: op.literal, to: shortToken(op.toToken, prefix) };
  return { from: shortToken(op.fromToken, prefix), to: shortToken(op.toToken, prefix) };
}
