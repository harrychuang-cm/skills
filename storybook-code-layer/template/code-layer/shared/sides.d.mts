export type WritingFlow = { writingMode: string; direction: string };
export const SUPPORTED_FLOWS: WritingFlow[];

export type SideComponent = string | { text?: string | null; kind?: string | null };
export type SlotAssignment = { slot: string; component: number | null };
export type SidesFailure = "unknown-property" | "unsupported-writing-mode" | "unsupported-value" | "unsupported-shorthand";
export type SidesResult =
  | { ok: true; slots: SlotAssignment[] }
  | { ok: false; reason: SidesFailure; affected: string[] };

export function sidesOf(property: string, components: number | SideComponent[], writingMode?: string, direction?: string): SidesResult;
export function affectedSlots(property: string, writingMode?: string, direction?: string): string[] | null;
export function physicalToLogical(property: string, writingMode?: string, direction?: string): string | null;
export function physicalSideOf(logicalSide: string, writingMode: string, direction: string): "top" | "right" | "bottom" | "left" | null;
export function mayOverlap(a: string, b: string): boolean;
