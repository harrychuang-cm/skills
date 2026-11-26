// Channel protocol and wire types shared by the manager panel and the preview runtime.

export const ADDON_ID = "storybook/code-layer";
export const TOOL_ID = `${ADDON_ID}/tool`;
export const INSPECTOR_ID = `${ADDON_ID}/inspector`;
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
  navigate: "code-layer/navigate",
  children: "code-layer/children",
  /** preview → manager: where the story's components are, so the inspector can keep out of their way. */
  layout: "code-layer/layout",
  /** manager → preview: whether AI runs are ready (the selection label shows its AI button only then). */
  agent: "code-layer/agent",
} as const;

/** Version of the channel payloads, of the trace and of stored drafts. */
export const PROTOCOL_VERSION = 2;

export type Side = "manager" | "preview";

export type Envelope<T> = T & { v: 2; from: Side; seq: number };

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
  | "manager-framed"
  | "unsupported-browser";

export type EffectiveState =
  | { state: "off"; reason: null }
  | { state: "active"; reason: null }
  /** `detail` names what is missing when the browser lacks a required feature. */
  | { state: "suspended"; reason: SuspendReason; detail?: string | null };

export type StatusPayload = {
  effective: EffectiveState;
  storyId: string | null;
  indexRevision: string | null;
  serverReadOnly: boolean;
};

// ---- index (GET /__code-layer/index) ----------------------------------------

export type ScaleInfo = { category: string | null; family: string | null; value: number; unit: string };

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
  scale: ScaleInfo | null;
  duplicate: boolean;
  rootless: boolean;
  shadowedBy: Array<{ file: string; line: number; selector: string | null; declaredValue: string }>;
  variants: Array<{ file: string; line: number; selector: string | null; declaredValue: string }>;
  usedBy: Array<{ file: string; ordinal: number; selector: string; property: string; line: number }>;
  aliasedBy: string[];
};

export type CssComponent = {
  text: string;
  shape: "single-var" | "raw" | "keyword" | "expression" | "separator";
  refIndex: number | null;
  /** Every side this component sets is set again later in the same rule. */
  overridden: boolean;
};

export type CssDecl = {
  index: number;
  property: string;
  value: string;
  important: boolean;
  line: number;
  shape: "single-var" | "var-list" | "var-with-fallback" | "expression" | "raw" | "keyword";
  shapeDetail: "function" | "fallback" | "list" | "slash" | null;
  components: CssComponent[];
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
  /** Whether a declaration can be appended to the rule without touching any other byte. */
  append: { ok: boolean; reason: string | null };
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

export type MirrorInfo = {
  id: string;
  source: string;
  mirror: string;
  inSync: boolean;
  diffLines: number | null;
  sourceModified: string | null;
  mirrorModified: string | null;
};

export type IndexJson = {
  ok: true;
  schemaVersion: number;
  projectId: string;
  revision: string;
  tokens: {
    prefix: string;
    entry: { source: string; mirror: string | null; devId: string | null; blocks: Array<{ tier: string; rootRuleIndex: number }> };
    files: Array<{ id: string; role: string; tier?: string; source: string; mirror: string | null; writable?: boolean }>;
    mirrors: MirrorInfo[];
    editing: { ok: boolean; problems: string[] };
    items: TokenItem[];
  };
  css: { files: CssFileInfo[] };
  components?: { classPrefixes: string[] };
  governance?: {
    componentSpecsDir: string | null;
    specs: Array<{ componentId: string; file: string }>;
    pairing: { containerSuffix: string; contentSuffix: string };
    drift: { rows: number; undocumented: number } | null;
  };
  locale?: "zh-Hant" | "en" | null;
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

/** Where a change can be made: the declaration, the component token it references, the system token on its chain. */
export type ScopeId = "declaration" | "component-token" | "system-token";

export type ScopeTarget =
  | { type: "rebind-declaration"; file: string; workspacePath: string; ordinal: number; selector: string; property: string; refIndex: number; line: number }
  | { type: "rebind-token"; token: string; tier: "comp" | "sys"; file: string; line: number }
  /** A layout keyword: the component of a declaration that holds it now. */
  | { type: "set-keyword"; file: string; workspacePath: string; ordinal: number; selector: string; property: string; component: number; line: number }
  /** A layout property nothing declares yet: a declaration appended to the rule that declares the element's display. */
  | { type: "add-declaration"; file: string; workspacePath: string; ordinal: number; selector: string; property: string; line: number };

export type RowScope = {
  id: ScopeId;
  available: boolean;
  /** Reason code when the scope cannot be used; never silently replaced by another scope. */
  reason: string | null;
  detail: string | null;
  target: ScopeTarget;
  /**
   * The token bound at this scope now, and the whole text at the target. For a
   * layout row: the keyword declared now (empty when a declaration is added)
   * and the declared value (empty likewise).
   */
  fromToken: string;
  before: string;
  /** Tier a new token must be in; a declaration may also use its own component's tokens. */
  targetTier: "sys" | "ref";
  writes: { files: string[]; line: number };
  impact: { declarations: number; components: number; excludesInlineStyles: boolean };
};

export type InheritedFrom = {
  kind: "same-component" | "other-component" | "outside" | "default";
  /** Label of the declaring ancestor, and its descriptor when it can be selected. */
  label: string | null;
  descriptor: Descriptor | null;
  /** For "outside": where the value comes from (a stylesheet, a style attribute). */
  source: string | null;
};

export type RowSide = { slot: string; part: string; physical: string | null };

export type RowTrace = {
  /** Group id, or group id plus the covered parts when a group is split (`padding/block-start+block-end`). */
  id: string;
  group: string;
  section: string;
  /** The logical longhands this row covers, with the physical side each is on now. */
  sides: RowSide[];
  /** Computed longhand used as the witness of a change (the first slot). */
  cssProperty: string;
  computed: string;
  computedDisplay: string;
  source: "declaration" | "inline-style" | "presentation-attribute" | "none";
  declaration: {
    file: string | null;
    workspacePath: string | null;
    ordinal: number;
    selector: string;
    property: string;
    value: string;
    line: number | null;
    /** Line where the rule of the declaration starts (null when the stylesheet is not indexed). */
    ruleLine: number | null;
    /** Index of the component of the value that sets this row, and of its reference. */
    component: number | null;
    refIndex: number | null;
  } | null;
  tokenName: string | null;
  tokenKind: string | null;
  chain: ChainLink[];
  /** Set when nothing about the row can be changed; `scopes` is then empty. */
  readOnly: { reason: string; detail: string | null } | null;
  scopes: RowScope[];
  defaultScope: ScopeId | null;
  inheritedFrom: InheritedFrom | null;
  warnings: string[];
  /**
   * Set on the direction, wrapping, alignment and distribution rows of a flex
   * container: the keywords the row can be set to and where the element's
   * children run, for drawing the options. `declared` is the keyword the
   * source holds (null when nothing declares the property).
   */
  layout: { property: string; options: string[]; declared: string | null; direction: string; wrap: string } | null;
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
  writingMode: string;
  direction: string;
  /** The rule that carries the element's own declarations (highest priority indexed rule). */
  ownRule: { workspacePath: string; selector: string; ordinal: number; line: number } | null;
  /** How long the trace took, for the README's measurements. */
  durationMs: number;
  rows: RowTrace[];
};

export type SelectionPayload = {
  trace: ElementTrace | null;
  reason: "pointer" | "keyboard" | "restore" | "hmr" | "story-change" | "lost" | "cleared" | "panel";
};

/** Breadcrumb and children of the selection, for navigating from the panel. */
export type ChildrenPayload = {
  traceId: string | null;
  breadcrumb: Array<{ label: string; descriptor: Descriptor; componentRoot: boolean }>;
  children: Array<{ label: string; descriptor: Descriptor }>;
};

export type NavigatePayload = { action: "parent" | "first-child" | "next" | "previous" } | { descriptor: Descriptor };

// ---- drafts and live preview ---------------------------------------------------

export type DraftOp =
  | { type: "rebind-token"; token: string; tier: "comp" | "sys"; fromToken: string; toToken: string; file: string; line: number }
  | {
      type: "rebind-declaration";
      file: string;
      ordinal: number;
      selector: string;
      property: string;
      /** Position of the reference among the var() references of the value. */
      refIndex: number;
      fromToken: string;
      toToken: string;
      line: number;
    }
  | { type: "set-keyword"; file: string; ordinal: number; selector: string; property: string; component: number; fromKeyword: string; toKeyword: string; line: number }
  | { type: "add-declaration"; file: string; ordinal: number; selector: string; property: string; toKeyword: string; line: number };

/** A layout operation: a keyword instead of a token. */
export type LayoutOp = Extract<DraftOp, { type: "set-keyword" | "add-declaration" }>;
export type TokenOp = Exclude<DraftOp, LayoutOp>;

export function isLayoutOp(op: DraftOp): op is LayoutOp {
  return op.type === "set-keyword" || op.type === "add-declaration";
}

/** What the target holds before the change: a token name, a keyword, or nothing for an added declaration. */
export function opFrom(op: DraftOp): string {
  if (op.type === "set-keyword") return op.fromKeyword;
  if (op.type === "add-declaration") return "";
  return op.fromToken;
}

/** What the change puts there: a token name or a keyword. */
export function opTo(op: DraftOp): string {
  return isLayoutOp(op) ? op.toKeyword : op.toToken;
}

export type Draft = {
  schema: 2;
  id: string;
  rowId: string;
  group: string;
  parts: string[];
  elementLabel: string;
  storyId: string | null;
  scope: ScopeId;
  witness: { descriptor: Descriptor; property: string; beforeComputed: string } | null;
  op: DraftOp;
  /** Text at the target before / after, comment-free and whitespace-collapsed (for display and preview). */
  before: string;
  after: string;
  writesTo: { files: string[]; line: number; declarations: number; components: number };
  /** Label of the ancestor the value is inherited from, when the edit is made there. */
  inheritedFrom: string | null;
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

/** `message` is a catalog key (with `params`), translated where it is shown. */
export type PreviewStatePayload = {
  rev: number;
  items: Array<{ id: string; status: DraftStatus; message: string | null; params?: Record<string, string> }>;
};

type Addressed =
  | { type: "rebind-token"; token: string }
  | { type: "rebind-declaration"; file: string; ordinal: number; property: string; refIndex: number }
  | { type: "set-keyword"; file: string; ordinal: number; property: string; component: number }
  | { type: "add-declaration"; file: string; ordinal: number; property: string };

function addressId(target: Addressed): string {
  if (target.type === "rebind-token") return `token:${target.token}`;
  if (target.type === "set-keyword") return `keyword:${target.file}#${target.ordinal}#${target.property}#${target.component}`;
  if (target.type === "add-declaration") return `add:${target.file}#${target.ordinal}#${target.property}`;
  return `decl:${target.file}#${target.ordinal}#${target.property}#${target.refIndex}`;
}

export function draftId(op: DraftOp): string {
  return addressId(op);
}

/** Id of the draft a scope would produce. */
export function scopeDraftId(target: ScopeTarget): string {
  return addressId(target);
}

/** Boxes of the story's outermost components and the size of the preview viewport, in preview pixels. */
export type LayoutPayload = { obstacles: Array<[number, number, number, number]>; viewport: [number, number] };
