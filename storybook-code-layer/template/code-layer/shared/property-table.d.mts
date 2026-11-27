export type SectionId = "layout" | "spacing" | "size" | "appearance" | "fill" | "stroke" | "typography";

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
  /** Edited by choosing a keyword of a fixed list (shared/layout.mjs), on a flex container only. Never re-bound. */
  layout?: boolean;
};

export const SECTIONS: SectionId[];
export const GROUPS: GroupDef[];
export const GROUP_BY_ID: Record<string, GroupDef>;
export const GROUP_OF_SLOT: Record<string, GroupDef>;
export function kindsOfSlot(slot: string): string[] | null;
