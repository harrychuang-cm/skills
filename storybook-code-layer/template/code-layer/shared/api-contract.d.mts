export const API_BASE: "/__code-layer";
export const SCHEMA_VERSION: 1;
export const SESSION_HEADER: "x-code-layer-session";
export const ID_PATTERN: RegExp;
export const TOKEN_NAME_PATTERN: RegExp;
export const OPERATION_TYPES: string[];
export const ERROR_CODES: Record<string, { status: number; lane?: string }>;

export class ApiError extends Error {
  constructor(code: string, message: string, details?: unknown);
  code: string;
  status: number;
  lane: string | null;
  details: unknown;
  toJSON(): { ok: false; error: { code: string; message: string; lane: string | null; details: unknown } };
}
