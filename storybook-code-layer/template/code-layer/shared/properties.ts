// The panel's property table. A group lists the logical longhands ("slots",
// see sides.mjs) it covers; the tracer finds, per slot, the declaration
// component that sets it, and reports one row per set of slots that share a
// winner. Structural layout groups are shown for context and never edited.

export type SectionId = "layout" | "spacing" | "size" | "appearance" | "fill" | "stroke" | "typography";

export const SECTIONS: SectionId[] = ["layout", "spacing", "size", "appearance", "fill", "stroke", "typography"];

export type GroupDef = {
  /** Stable id; also the row id when one row covers every slot of the group. */
  id: string;
  section: SectionId;
  /** Logical longhands, in display order. */
  slots: string[];
  /** Token kinds a reference of this group may be re-bound to. */
  kinds: string[];
  /** False for structural layout: values are shown, never re-bound. */
  editable: boolean;
  /** The property inherits: an undeclared value is traced to the declaring ancestor. */
  inherited: boolean;
  /** What the slots of the group are, for naming a row that covers only some of them. */
  split: "single" | "sides" | "corners" | "axes";
  /** Slots to use instead on SVG graphics, where the property means something else (fill). */
  svgSlots?: string[];
};

const SIDES = ["block-start", "inline-end", "block-end", "inline-start"];
const sides = (prefix: string, suffix = "") => SIDES.map((side) => `${prefix}-${side}${suffix}`);
const LENGTH = ["dimension", "zero", "percentage"];

export const GROUPS: GroupDef[] = [
  // Layout
  { id: "display", section: "layout", slots: ["display"], kinds: [], editable: false, inherited: false, split: "single" },
  { id: "direction", section: "layout", slots: ["flex-direction"], kinds: [], editable: false, inherited: false, split: "single" },
  { id: "alignItems", section: "layout", slots: ["align-items"], kinds: [], editable: false, inherited: false, split: "single" },
  { id: "justifyContent", section: "layout", slots: ["justify-content"], kinds: [], editable: false, inherited: false, split: "single" },
  { id: "wrap", section: "layout", slots: ["flex-wrap"], kinds: [], editable: false, inherited: false, split: "single" },
  { id: "gap", section: "layout", slots: ["row-gap", "column-gap"], kinds: LENGTH, editable: true, inherited: false, split: "axes" },
  // Spacing
  { id: "padding", section: "spacing", slots: sides("padding"), kinds: LENGTH, editable: true, inherited: false, split: "sides" },
  { id: "margin", section: "spacing", slots: sides("margin"), kinds: LENGTH, editable: true, inherited: false, split: "sides" },
  // Size
  { id: "inlineSize", section: "size", slots: ["inline-size"], kinds: LENGTH, editable: true, inherited: false, split: "single" },
  { id: "blockSize", section: "size", slots: ["block-size"], kinds: LENGTH, editable: true, inherited: false, split: "single" },
  { id: "minInlineSize", section: "size", slots: ["min-inline-size"], kinds: LENGTH, editable: true, inherited: false, split: "single" },
  { id: "minBlockSize", section: "size", slots: ["min-block-size"], kinds: LENGTH, editable: true, inherited: false, split: "single" },
  { id: "maxInlineSize", section: "size", slots: ["max-inline-size"], kinds: LENGTH, editable: true, inherited: false, split: "single" },
  { id: "maxBlockSize", section: "size", slots: ["max-block-size"], kinds: LENGTH, editable: true, inherited: false, split: "single" },
  // Appearance
  { id: "opacity", section: "appearance", slots: ["opacity"], kinds: ["number", "zero", "percentage"], editable: true, inherited: false, split: "single" },
  {
    id: "radius",
    section: "appearance",
    slots: ["border-start-start-radius", "border-start-end-radius", "border-end-end-radius", "border-end-start-radius"],
    kinds: LENGTH,
    editable: true,
    inherited: false,
    split: "corners",
  },
  // Fill
  { id: "fill", section: "fill", slots: ["background-color"], svgSlots: ["fill"], kinds: ["color"], editable: true, inherited: false, split: "single" },
  // Stroke
  { id: "borderColor", section: "stroke", slots: sides("border", "-color"), kinds: ["color"], editable: true, inherited: false, split: "sides" },
  { id: "borderWidth", section: "stroke", slots: sides("border", "-width"), kinds: ["dimension", "zero"], editable: true, inherited: false, split: "sides" },
  { id: "outlineColor", section: "stroke", slots: ["outline-color"], kinds: ["color"], editable: true, inherited: false, split: "single" },
  { id: "outlineWidth", section: "stroke", slots: ["outline-width"], kinds: ["dimension", "zero"], editable: true, inherited: false, split: "single" },
  { id: "stroke", section: "stroke", slots: ["stroke"], kinds: ["color"], editable: true, inherited: false, split: "single" },
  { id: "strokeWidth", section: "stroke", slots: ["stroke-width"], kinds: ["dimension", "zero", "number"], editable: true, inherited: false, split: "single" },
  // Typography
  { id: "fontFamily", section: "typography", slots: ["font-family"], kinds: ["font-family"], editable: true, inherited: true, split: "single" },
  { id: "fontSize", section: "typography", slots: ["font-size"], kinds: LENGTH, editable: true, inherited: true, split: "single" },
  { id: "fontWeight", section: "typography", slots: ["font-weight"], kinds: ["number"], editable: true, inherited: true, split: "single" },
  { id: "lineHeight", section: "typography", slots: ["line-height"], kinds: ["number", "dimension", "percentage", "zero"], editable: true, inherited: true, split: "single" },
  { id: "letterSpacing", section: "typography", slots: ["letter-spacing"], kinds: ["dimension", "zero"], editable: true, inherited: true, split: "single" },
  { id: "color", section: "typography", slots: ["color"], kinds: ["color"], editable: true, inherited: true, split: "single" },
];

export const GROUP_BY_ID: Record<string, GroupDef> = Object.fromEntries(GROUPS.map((group) => [group.id, group]));

/** Every slot of the table, and the group that owns it. */
export const GROUP_OF_SLOT: Record<string, GroupDef> = Object.fromEntries(GROUPS.flatMap((group) => [...group.slots, ...(group.svgSlots ?? [])].map((slot) => [slot, group])));

/**
 * Id of the row that covers `slots` of a group: the group id when it covers
 * all of them, otherwise the group id and the part of each slot name that
 * tells it apart (`padding/block-start+block-end`).
 */
export function rowIdFor(group: GroupDef, slots: string[]): string {
  if (slots.length === group.slots.length) return group.id;
  return `${group.id}/${slots.map((slot) => slotPart(group, slot)).join("+")}`;
}

/** The distinguishing part of a slot inside its group: `block-start`, `start-end`, `row`. */
export function slotPart(group: GroupDef, slot: string): string {
  if (group.split === "sides") return /(block-start|block-end|inline-start|inline-end)/.exec(slot)?.[1] ?? slot;
  if (group.split === "corners") return /border-((?:start|end)-(?:start|end))-radius/.exec(slot)?.[1] ?? slot;
  if (group.split === "axes") return slot.replace(/-gap$/, "");
  return slot;
}

/** A value that probes a slot: any computed value changes when it is applied. */
export function sentinelFor(group: GroupDef): string {
  if (group.kinds.includes("color")) return "rgb(1, 2, 3)";
  if (group.kinds.includes("font-family")) return '"code-layer-probe"';
  if (group.id === "opacity") return "0.137";
  if (group.id === "fontWeight") return "137";
  if (group.id === "lineHeight") return "1.337";
  return "13.37px";
}
