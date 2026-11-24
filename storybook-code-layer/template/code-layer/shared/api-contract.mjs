// Wire contract shared by the dev server, the manager and the preview.

export const API_BASE = "/__code-layer";
export const SCHEMA_VERSION = 1;
export const SESSION_HEADER = "x-code-layer-session";
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const TOKEN_NAME_PATTERN = /^--[A-Za-z0-9_-]{1,200}$/;

export const OPERATION_TYPES = ["rebind-token", "rebind-declaration"];

/** Every refusal code. `lane: "agent"` marks problems a person or an agent could resolve. */
export const ERROR_CODES = {
  "schema-invalid": { status: 400 },
  "forbidden": { status: 403 },
  "session-required": { status: 401 },
  "method-not-allowed": { status: 405 },
  "unsupported-media-type": { status: 415 },
  "body-too-large": { status: 413 },
  "not-found": { status: 404 },
  "read-only": { status: 423 },
  "not-a-design-token": { status: 422, lane: "agent" },
  "tier-not-writable": { status: 422, lane: "agent" },
  "tier-rule": { status: 422, lane: "agent" },
  "foreign-comp-token": { status: 422, lane: "agent" },
  "type-mismatch": { status: 422, lane: "agent" },
  "no-op": { status: 422 },
  "unsupported-value-shape": { status: 422, lane: "agent" },
  "duplicate-token-declaration": { status: 422, lane: "agent" },
  "duplicate-target": { status: 422 },
  "stale-before": { status: 409 },
  "stale-index": { status: 409 },
  "after-value-mismatch": { status: 422 },
  "locator-mismatch": { status: 409, lane: "agent" },
  "mirror-drift": { status: 409 },
  "checks-unavailable": { status: 409 },
  "checks-baseline-failing": { status: 409 },
  "check-failed": { status: 422, lane: "agent" },
  "undo-conflict": { status: 409 },
  "nothing-to-undo": { status: 409 },
  "not-latest": { status: 409 },
  "proof-failed": { status: 500 },
  "write-failed": { status: 500 },
  "rollback-failed": { status: 500 },
  "internal": { status: 500 },
};

export class ApiError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.code = ERROR_CODES[code] ? code : "internal";
    this.status = ERROR_CODES[this.code].status;
    this.lane = ERROR_CODES[this.code].lane ?? null;
    this.details = details;
  }

  toJSON() {
    return {
      ok: false,
      error: { code: this.code, message: this.message, lane: this.lane, details: this.details ?? null },
    };
  }
}
