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

export type ValueComponent = {
  text: string;
  start: number;
  end: number;
  shape: "single-var" | "raw" | "expression" | "separator";
  /** Position of this component's reference among all var() references of the value. */
  refIndex: number | null;
};

export type ValueShape =
  | { kind: "single-var"; name: string; components: ValueComponent[] }
  | { kind: "var-list"; names: string[]; components: ValueComponent[] }
  | { kind: "var-with-fallback"; name: string; components: ValueComponent[] }
  | { kind: "expression"; names: string[]; detail: "function" | "fallback" | "list" | "slash"; components: ValueComponent[] }
  | { kind: "keyword"; keyword: string; components: ValueComponent[] }
  | { kind: "raw"; components: ValueComponent[] };

export type TopLevelPart = { text: string; start: number; end: number; separator: "," | "/" | null };

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
export function splitTopLevel(text: string): TopLevelPart[];
export function classifyValue(text: string): ValueShape;
export function replaceVarName(text: string, refIndex: number, fromName: string, toName: string): string;
export function scanDeclarations(text: string): ScannedDeclaration[];
export function findRootDeclaration(text: string, name: string): ScannedDeclaration | "ambiguous" | null;
