// Channel protocol and wire types shared by the manager panel and the preview runtime.

export const ADDON_ID = "storybook/code-layer";
export const TOOL_ID = `${ADDON_ID}/tool`;
export const PANEL_ID = `${ADDON_ID}/panel`;
export const GLOBAL_KEY = "codeLayer";
export const API_BASE = "/__code-layer";
export const SESSION_HEADER = "x-code-layer-session";

export const EVENTS = {
  ready: "code-layer/ready",
  status: "code-layer/status",
  selection: "code-layer/selection",
  tokenValues: "code-layer/token-values",
  request: "code-layer/request",
  previewState: "code-layer/preview-state",
  applyArmed: "code-layer/apply-armed",
  verifyResult: "code-layer/verify-result",
  sync: "code-layer/sync",
  select: "code-layer/select",
  highlight: "code-layer/highlight",
  previewTransient: "code-layer/preview-transient",
  compare: "code-layer/compare",
  applyArm: "code-layer/apply-arm",
  applyWritten: "code-layer/apply-written",
  verifyRetry: "code-layer/verify-retry",
  probe: "code-layer/probe",
  probeResult: "code-layer/probe-result",
  applyCancel: "code-layer/apply-cancel",
  verifyProgress: "code-layer/verify-progress",
} as const;

export type Side = "manager" | "preview";

export type Envelope<T> = T & { v: 1; from: Side; seq: number };

/** Payloads travel as one JSON string: telejson would otherwise turn ISO dates into Date objects and drops messages containing U+2028/U+2029. */
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), "g");
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), "g");

export function encodePayload(payload: unknown): string {
  return JSON.stringify(payload).replace(LINE_SEPARATOR, "\\u2028").replace(PARAGRAPH_SEPARATOR, "\\u2029");
}

export function decodePayload<T>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---- effective state -------------------------------------------------------

export type SuspendReason =
  | "docs"
  | "figma-export"
  | "prototype-mode"
  | "story-error"
  | "index-unavailable"
  | "read-only-server"
  | "manager-framed";

export type EffectiveState =
  | { state: "off"; reason: null }
  | { state: "active"; reason: null }
  | { state: "suspended"; reason: SuspendReason };

export const SUSPEND_TEXT: Record<SuspendReason, string> = {
  "docs": "Docs 頁面不支援 Code Layer，切回 Story 後會自動恢復。",
  "figma-export": "Figma export 開啟中，Code Layer 已暫停。",
  "prototype-mode": "Prototype Inspector 不在 Story 模式，Code Layer 已暫停。",
  "story-error": "這個 story 目前有錯誤畫面，Code Layer 已暫停。",
  "index-unavailable": "讀不到 Code Layer 的索引（dev server 是否載入了 Code Layer？）。",
  "read-only-server": "Code Layer 伺服器處於唯讀模式，只能檢視。",
  "manager-framed": "Storybook 被嵌在其他頁面中，Code Layer 已停用。",
};

export type StatusPayload = {
  effective: EffectiveState;
  storyId: string | null;
  indexRevision: string | null;
  serverReadOnly: boolean;
};

// ---- index (GET /__code-layer/index) ----------------------------------------

export type TokenItem = {
  name: string;
  tier: "ref" | "sys" | "comp" | null;
  source: "tier" | "readonly";
  writable: boolean;
  file: string;
  line: number;
  declaredValue: string | null;
  shape: string;
  alias: string | null;
  chain: string[];
  resolution: "ok" | "undefined" | "cycle";
  resolvedValue: string | null;
  kind: string;
  category: string | null;
  duplicate: boolean;
  rootless: boolean;
  shadowedBy: Array<{ file: string; line: number; selector: string | null; declaredValue: string }>;
  variants: Array<{ file: string; line: number; selector: string | null; declaredValue: string }>;
  usedBy: Array<{ file: string; ordinal: number; selector: string; property: string; line: number }>;
  aliasedBy: string[];
};

export type CssDecl = {
  index: number;
  property: string;
  value: string;
  important: boolean;
  line: number;
  shape: string;
  refs: Array<{ name: string; refIndex: number; known: boolean; tier: string | null; source: string | null }>;
  duplicateInRule: boolean;
  overriddenInRule: boolean;
};

export type CssRuleInfo = {
  ordinal: number;
  selector: string;
  atRules: Array<{ name: string; params: string }>;
  occurrence: number;
  line: number;
  nested: boolean;
  declarations: CssDecl[];
};

export type CssFileInfo = {
  file: string;
  workspacePath: string;
  devId: string;
  componentId: string;
  servedTextHash: string | null;
  identityEligible: boolean;
  reason: string | null;
  styleRuleCount: number;
  rules: CssRuleInfo[];
};

export type IndexJson = {
  ok: true;
  projectId: string;
  revision: string;
  tokens: {
    prefix: string;
    entry: { source: string; mirror: string | null; devId: string | null; blocks: Array<{ tier: string; rootRuleIndex: number }> };
    mirrors: Array<{ id: string; source: string; mirror: string; inSync: boolean; diffLines: number | null }>;
    editing: { ok: boolean; problems: string[] };
    items: TokenItem[];
  };
  css: { files: CssFileInfo[] };
  components?: { classPrefixes: string[] };
};

// ---- trace -----------------------------------------------------------------

export type Descriptor = {
  storyId: string | null;
  anchor: { component: string | null; variant: string | null; occurrence: number };
  path: Array<{ tag: string; key: string | null; index: number }>;
  signature: { tag: string; classes: string[] };
  label: string;
};

export type ChainLink = {
  name: string;
  tier: string | null;
  file: string | null;
  line: number | null;
  value: string | null;
  status: "ok" | "overridden" | "undefined" | "not-a-token";
  overriddenBy: { file: string; line: number | null; selector: string | null } | null;
};

export type Verdict =
  | { kind: "rebind-token"; token: string; fromToken: string; file: string; line: number }
  | { kind: "rebind-declaration"; file: string; ordinal: number; selector: string; property: string; fromToken: string; line: number; warnings: string[] }
  | { kind: "read-only"; reason: string; detail: string | null };

export type RowTrace = {
  id: string;
  label: string;
  cssProperty: string;
  computed: string;
  computedDisplay: string;
  editableInProof: boolean;
  verdict: Verdict;
  declaration: { file: string; workspacePath: string; ordinal: number; selector: string; property: string; value: string; line: number } | null;
  tokenName: string | null;
  tokenKind: string | null;
  chain: ChainLink[];
  writesTo: { files: string[]; line: number; impact: number } | null;
};

export type ElementTrace = {
  traceId: string;
  indexRevision: string;
  storyId: string | null;
  storyTitle: string | null;
  storyName: string | null;
  descriptor: Descriptor;
  label: string;
  componentId: string | null;
  variant: string | null;
  size: { width: number; height: number };
  pathText: string;
  rows: RowTrace[];
};

export type SelectionPayload = {
  trace: ElementTrace | null;
  reason: "pointer" | "keyboard" | "restore" | "hmr" | "story-change" | "lost" | "cleared";
};

// ---- drafts and live preview ---------------------------------------------------

export type DraftOp =
  | { type: "rebind-token"; token: string; fromToken: string; toToken: string; file: string; line: number }
  | {
      type: "rebind-declaration";
      file: string;
      ordinal: number;
      selector: string;
      property: string;
      fromToken: string;
      toToken: string;
      line: number;
    };

export type Draft = {
  id: string;
  rowId: string;
  rowLabel: string;
  elementLabel: string;
  storyId: string | null;
  witness: { descriptor: Descriptor; property: string; beforeComputed: string } | null;
  op: DraftOp;
  /** Declared value before / after, comment-free and whitespace-collapsed. */
  before: string;
  after: string;
  writesTo: { files: string[]; line: number; impact: number };
  indexRevision: string;
  createdAt: number;
};

export type DraftStatus =
  | "previewing"
  | "no-visible-effect"
  | "in-source"
  | "conflict"
  | "pending-load"
  | "paused";

export type SyncPayload = {
  rev: number;
  drafts: Draft[];
  transient: Draft | null;
  compare: boolean;
  /** Draft ids applied and verified: never previewed again. */
  settled: string[];
};

export type PreviewStatePayload = {
  rev: number;
  items: Array<{ id: string; status: DraftStatus; message: string | null }>;
};

export function draftId(op: DraftOp): string {
  return op.type === "rebind-token" ? `token:${op.token}` : `decl:${op.file}#${op.ordinal}#${op.property}`;
}

export const DRAFT_STATUS_TEXT: Record<DraftStatus, string> = {
  "previewing": "預覽中",
  "no-visible-effect": "此頁看不到效果",
  "in-source": "已在原始碼中",
  "conflict": "來源已變更",
  "pending-load": "待載入",
  "paused": "暫停預覽",
};
