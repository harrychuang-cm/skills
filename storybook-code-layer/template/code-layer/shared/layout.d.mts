export type LayoutProperty = "flex-direction" | "flex-wrap" | "align-items" | "justify-content";

export const LAYOUT_OPTIONS: Record<LayoutProperty, string[]>;
export const LAYOUT_PROPERTIES: LayoutProperty[];
export const FLEX_DISPLAYS: string[];
export const LAYOUT_SHORTHANDS: Record<LayoutProperty, string[]>;
export const KEYWORD_PATTERN: RegExp;

export function isLayoutProperty(property: string): property is LayoutProperty;
export function layoutOptions(property: string): string[];
export function isLayoutKeyword(property: string, keyword: string): boolean;
export function isFlexDisplay(value: string | null | undefined): boolean;
export function settersOf(property: string): string[];
export function layoutSentinel(property: string, current: string | null | undefined): string | null;
