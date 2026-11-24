// Manager-side state lives outside React: panels and tools unmount when the
// panel area or toolbar is hidden, the store does not.
import { useSyncExternalStore } from "react";

import type { Draft, DraftStatus, ElementTrace, IndexJson, StatusPayload } from "../shared/protocol";

export type SessionInfo = {
  projectId: string | null;
  version: string;
  session: string;
  capabilities: { write: boolean };
  readOnly: boolean;
};

export type VerifyItemView = { draftId: string; status: string; expected: string | null; actual: string | null; reason: string | null };

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
};

export type ManagerState = {
  status: StatusPayload | null;
  selection: ElementTrace | null;
  tokenValues: Record<string, string>;
  session: SessionInfo | null;
  index: IndexJson | null;
  indexError: string | null;
  drafts: Draft[];
  transient: Draft | null;
  compare: boolean;
  settled: string[];
  previewState: Record<string, { status: DraftStatus; message: string | null }>;
  probes: Record<string, string>;
  pickerRow: string | null;
  syncRev: number;
  applyState: ApplyState;
};

let state: ManagerState = {
  status: null,
  selection: null,
  tokenValues: {},
  session: null,
  index: null,
  indexError: null,
  drafts: [],
  transient: null,
  compare: false,
  settled: [],
  previewState: {},
  probes: {},
  pickerRow: null,
  syncRev: 0,
  applyState: IDLE_APPLY,
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
