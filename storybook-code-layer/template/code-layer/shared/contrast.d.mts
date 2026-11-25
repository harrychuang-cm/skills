export type Rgba = { r: number; g: number; b: number; a: number };
export function parseColor(text: string | null | undefined): Rgba | null;
export function luminance(color: { r: number; g: number; b: number }): number;
export function contrastRatio(foreground: string | null | undefined, background: string | null | undefined): number | null;
export function sameColor(a: string | null | undefined, b: string | null | undefined): boolean;
