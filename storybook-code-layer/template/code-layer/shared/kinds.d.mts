export function inferKind(value: string | null | undefined): string;
export function kindsCompatible(a: string, b: string): boolean;
export function tokenCategory(name: string, prefix: string): string | null;
export function isKeywordValue(value: string | null | undefined): boolean;
export type Scalar = { value: number; unit: string };
export function parseScalar(value: string | null | undefined): Scalar | null;
/** Where a token sits on a scale: its name category, the reference family its chain ends in, and its resolved number. */
export type ScaleInfo = { category: string | null; family: string | null; value: number; unit: string };
export function sameScale(a: ScaleInfo | null | undefined, b: ScaleInfo | null | undefined): boolean;
