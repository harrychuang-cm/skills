// The panel's property table. A group lists the logical longhands ("slots",
// see sides.mjs) it covers; the tracer finds, per slot, the declaration
// component that sets it, and reports one row per set of slots that share a
// winner. The display group is shown for context and never edited; the four
// flex container groups are edited by keyword (shared/layout.mjs), not re-bound.
//
// The data lives in property-table.mjs so that the server reads the same
// table (the token kinds each slot accepts); this file adds the types and the
// browser-side helpers.
import { GROUPS, GROUP_BY_ID, GROUP_OF_SLOT, SECTIONS, kindsOfSlot } from "./property-table.mjs";
import type { GroupDef, SectionId } from "./property-table.mjs";

export type { GroupDef, SectionId };
export { GROUPS, GROUP_BY_ID, GROUP_OF_SLOT, SECTIONS, kindsOfSlot };

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
