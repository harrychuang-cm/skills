// Manager-side state lives outside React: panels and tools unmount when the
// panel area or toolbar is hidden, the store does not.
import { useSyncExternalStore } from "react";

import type { PendingEntry } from "../shared/brief";
import type { PairingEntry } from "../shared/pairing.mjs";
import type { ChildrenPayload, Draft, DraftStatus, ElementTrace, IndexJson, MirrorInfo, ScopeId, StatusPayload, LayoutPayload } from "../shared/protocol";

export type SessionInfo = {
  projectId: string | null;
  version: string;
  session: string;
  /** Changes every time the dev server starts. */
  instance?: string;
  /** Fingerprint of the manager code the server serves now. */
  build?: string | null;
  capabilities: { write: boolean };
  readOnly: boolean;
};

/** What GET /state reports (the parts the panel shows). */
export type ServerState = {
  instance?: string;
  readOnly: { active: boolean; reasons: Array<{ code: string; message: string }> };
  mirrors: MirrorInfo[];
  undoStack: Array<{ applyId: string }>;
  pendingDocs: PendingEntry[];
  governance: { componentSpecsDir: string | null; drift: { rows: number; undocumented: number; items: Array<{ file: string; line: number; token: string; documented: string; actual: string }> } | null };
  postApply: { commands: string[]; refused: Array<{ id: string; reason: string; writes: string[] }>; running: boolean };
};

export type VerifyItemView = { draftId: string; status: string; expected: string | null; actual: string | null; reason: string | null };

export type DocumentEdit = { operation: string; token: string; file: string; line: number; before: string; after: string };
export type PostApplyReport = {
  status: "none" | "queued" | "running" | "done";
  commands: string[];
  results: Array<{ id: string; ok: boolean; code: number | null; timedOut: boolean; durationMs: number; output: string }>;
  stale: boolean;
};

export type ApplyState = {
  phase: "idle" | "arming" | "writing" | "verifying" | "undoing" | "done" | "error";
  applyId: string | null;
  armId: string | null;
  drafts: Draft[];
  mode: "apply" | "undo";
  result: { status: string; items: VerifyItemView[] } | null;
  error: { code: string; message: string; details?: unknown } | null;
  progress: string | null;
  undone: boolean;
  skipped: boolean;
  /** How the apply was undone: whole files restored, or only its references put back. */
  undoMode: "exact" | "reverse" | null;
  documents: DocumentEdit[];
  pairing: PairingEntry[];
  postApply: PostApplyReport | null;
};

export const IDLE_APPLY: ApplyState = {
  phase: "idle",
  applyId: null,
  armId: null,
  drafts: [],
  mode: "apply",
  result: null,
  error: null,
  progress: null,
  undone: false,
  skipped: false,
  undoMode: null,
  documents: [],
  pairing: [],
  postApply: null,
};

export type MirrorSync = {
  phase: "idle" | "checking" | "confirm" | "syncing" | "error";
  files: Array<{ mirror: string; source: string; diffLines: number }>;
  error: { code: string; message: string } | null;
};

export type ManagerState = {
  status: StatusPayload | null;
  selection: ElementTrace | null;
  relatives: ChildrenPayload | null;
  tokenValues: Record<string, string>;
  session: SessionInfo | null;
  index: IndexJson | null;
  indexError: string | null;
  server: ServerState | null;
  drafts: Draft[];
  transient: Draft | null;
  compare: boolean;
  settled: string[];
  previewState: Record<string, { status: DraftStatus; message: string | null; params?: Record<string, string> }>;
  /** Probe results by `${traceId}:${rowId}:${scope}`. */
  probes: Record<string, string>;
  /** The row whose details are open, and the scope chosen per row (by element path and row id). */
  openRow: string | null;
  scopeChoice: Record<string, ScopeId>;
  /** A scope waiting for the person's confirmation before it is chosen (system token). */
  scopeConfirm: { rowKey: string; scope: ScopeId } | null;
  syncRev: number;
  applyState: ApplyState;
  mirrorSync: MirrorSync;
  /** One-time notices, e.g. staged changes of an older format were discarded. */
  notice: "drafts-discarded" | null;
  /** Label of a selection whose element left the page (an args change, an edit); null when nothing was lost. */
  lostSelection: string | null;
  /** True once the first request for the session has been answered (or has failed): what is kept per project can be read. */
  booted: boolean;
  /** The dev server was restarted with other manager code than this page runs: a reload is needed to get it. */
  reloadRequired: boolean;
  /** True while Storybook's canvas wrapper hosts the inspector; the toolbar toggle hosts it otherwise. */
  inspectorHosted: boolean;
  /** Where the story's components are in the preview (preview pixels), reported by the preview. */
  layout: LayoutPayload | null;
  /** Bumped when the interface language changes, so every subscriber re-renders. */
  localeTick: number;
};

let state: ManagerState = {
  status: null,
  selection: null,
  relatives: null,
  tokenValues: {},
  session: null,
  index: null,
  indexError: null,
  server: null,
  drafts: [],
  transient: null,
  compare: false,
  settled: [],
  previewState: {},
  probes: {},
  openRow: null,
  scopeChoice: {},
  scopeConfirm: null,
  syncRev: 0,
  applyState: IDLE_APPLY,
  mirrorSync: { phase: "idle", files: [], error: null },
  notice: null,
  lostSelection: null,
  booted: false,
  reloadRequired: false,
  inspectorHosted: false,
  layout: null,
  localeTick: 0,
};
const listeners = new Set<() => void>();

export const store = {
  get(): ManagerState {
    return state;
  },
  set(patch: Partial<ManagerState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useStore<T>(selector: (s: ManagerState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

/** Subscribe a component to language changes. */
export function useLocale(): number {
  return useStore((s) => s.localeTick);
}
