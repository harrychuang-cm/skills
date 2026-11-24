export type VarRef = {
  name: string | null;
  start: number;
  end: number;
  nameStart: number;
  nameEnd: number;
  hasFallback: boolean;
  closed: boolean;
  depth: number;
};

export type ValueShape =
  | { kind: "single-var"; name: string }
  | { kind: "var-with-fallback"; name: string }
  | { kind: "expression"; names: string[] }
  | { kind: "keyword"; keyword: string }
  | { kind: "raw" };

export type ScannedDeclaration = {
  prelude: string;
  property: string;
  value: string;
  important: boolean;
  valueStart: number;
  valueEnd: number;
};

export function maskCss(text: string): string;
export function stripComments(text: string): string;
export function normalizeValue(text: string): string;
export function findVarRefs(text: string): VarRef[];
export function classifyValue(text: string): ValueShape;
export function replaceVarName(text: string, refIndex: number, fromName: string, toName: string): string;
export function scanDeclarations(text: string): ScannedDeclaration[];
export function findRootDeclaration(text: string, name: string): ScannedDeclaration | "ambiguous" | null;
