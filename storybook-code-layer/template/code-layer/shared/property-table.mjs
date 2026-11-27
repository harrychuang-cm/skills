// The panel's property table, as plain data shared by the server and the
// browser. A group lists the logical longhands ("slots", see sides.mjs) it
// covers; the tracer finds, per slot, the declaration component that sets it,
// and reports one row per set of slots that share a winner. The display group
// is shown for context and never edited; the four flex container groups are
// edited by keyword (shared/layout.mjs), not re-bound.
//
// shared/properties.ts re-exports this table with its types for the browser;
// the server reads it here to know which token kinds a slot accepts.

export const SECTIONS = ["layout", "spacing", "size", "appearance", "fill", "stroke", "typography"];

const SIDES = ["block-start", "inline-end", "block-end", "inline-start"];
const sides = (prefix, suffix = "") => SIDES.map((side) => `${prefix}-${side}${suffix}`);
const LENGTH = ["dimension", "zero", "percentage"];

export const GROUPS = [
  // Layout
  { id: "display", section: "layout", slots: ["display"], kinds: [], editable: false, inherited: false, split: "single" },
  { id: "direction", section: "layout", slots: ["flex-direction"], kinds: [], editable: false, inherited: false, split: "single", layout: true },
  { id: "alignItems", section: "layout", slots: ["align-items"], kinds: [], editable: false, inherited: false, split: "single", layout: true },
  { id: "justifyContent", section: "layout", slots: ["justify-content"], kinds: [], editable: false, inherited: false, split: "single", layout: true },
  { id: "wrap", section: "layout", slots: ["flex-wrap"], kinds: [], editable: false, inherited: false, split: "single", layout: true },
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

export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((group) => [group.id, group]));

/** Every slot of the table, and the group that owns it. */
export const GROUP_OF_SLOT = Object.fromEntries(GROUPS.flatMap((group) => [...group.slots, ...(group.svgSlots ?? [])].map((slot) => [slot, group])));

/**
 * The token kinds a slot accepts, or null when the slot is not in the table.
 * A slot of a group that is never re-bound (display, the layout keywords)
 * accepts no kind.
 */
export function kindsOfSlot(slot) {
  const group = GROUP_OF_SLOT[slot];
  if (!group) return null;
  return group.editable && !group.layout ? [...group.kinds] : [];
}
