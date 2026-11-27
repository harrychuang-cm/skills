export type LiteralReason = "not-a-literal" | "literal-list" | "keyword" | "literal-expression" | "no-token-of-kind";

export type LiteralVerdict =
  | { tokenizable: true; kind: string; literal: string }
  | { tokenizable: false; reason: LiteralReason; literal: string | null };

export const LITERAL_KINDS: Set<string>;

export function literalVerdict(value: string, index: number, options?: { accepted?: string[]; available?: Iterable<string> }): LiteralVerdict;
export function isLiteralList(value: string): boolean;
export function tokenizeComponent(value: string, index: number, literal: string, token: string): string;
export function restoreComponent(value: string, index: number, token: string, literal: string): string;
export function sameValue(a: string | null | undefined, b: string | null | undefined): boolean;

export type CandidateToken = { name: string; tier?: string | null; alias?: string | null; category?: string | null };
export function tokenCategoryOf(name: string, tokens: Map<string, CandidateToken>): string | null;
export function categoryUsage(index: unknown): Map<string, Set<string>>;
export function homeCategories(groupId: string, usage: Map<string, Set<string>>): Set<string>;
export function orderLiteralCandidates<T extends { name: string }>(
  literal: string,
  tokens: T[],
  options: { home: Set<string | null>; valueOf: (token: T) => string | null; categoryOf: (token: T) => string | null },
): Array<{ token: T; group: 1 | 2 | 3; same: boolean }>;
