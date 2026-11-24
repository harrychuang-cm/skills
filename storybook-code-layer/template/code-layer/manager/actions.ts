// Store mutations that must also reach the preview (drafts, transient
// preview, compare) or be persisted.
import { EVENTS, type Draft, type ElementTrace, type RowTrace } from "../shared/protocol";
import { emitToPreview } from "./channel";
import { makeDraft, rowDraftId } from "./drafts";
import { loadDrafts, loadSettled, saveDrafts, saveSettled } from "./persist";
import { store } from "./store";

export function syncPreview(): void {
  const s = store.get();
  const rev = s.syncRev + 1;
  store.set({ syncRev: rev });
  emitToPreview(EVENTS.sync, { rev, drafts: s.drafts, transient: s.transient, compare: s.compare, settled: s.settled });
}

function persist(): void {
  const s = store.get();
  const projectId = s.session?.projectId;
  if (!projectId) return;
  saveDrafts(projectId, s.drafts);
  saveSettled(projectId, s.settled);
}

export function hydrate(projectId: string): void {
  // Invariant: a draft is either staged or settled (applied), never both.
  // Staging removes the id from settled and settling removes the draft, so an
  // overlap here is a stale copy of an applied draft: drop it.
  const settled = loadSettled(projectId);
  const loaded = loadDrafts(projectId);
  const drafts = loaded.filter((d) => !settled.includes(d.id));
  store.set({ drafts, settled });
  if (drafts.length !== loaded.length) saveDrafts(projectId, drafts);
  syncPreview();
}

export function stageDraft(trace: ElementTrace, row: RowTrace, toToken: string): void {
  const s = store.get();
  if (!s.index) return;
  const id = rowDraftId(row);
  const existing = s.drafts.find((d) => d.id === id) ?? null;
  const draft = makeDraft(trace, row, toToken, s.index, existing);
  if (!draft) return;
  const others = s.drafts.filter((d) => d.id !== draft.id);
  const settled = s.settled.filter((id) => id !== draft.id);
  const drafts = draft.op.toToken === draft.op.fromToken ? others : [...others, draft];
  store.set({ drafts, transient: null, settled });
  persist();
  syncPreview();
}

export function previewTransient(trace: ElementTrace | null, row: RowTrace | null, toToken: string | null): void {
  const s = store.get();
  let transient: Draft | null = null;
  if (trace && row && toToken && s.index) {
    const id = rowDraftId(row);
    const existing = s.drafts.find((d) => d.id === id) ?? null;
    transient = makeDraft(trace, row, toToken, s.index, existing);
  }
  if (JSON.stringify(transient?.after ?? null) === JSON.stringify(s.transient?.after ?? null) && transient?.id === s.transient?.id) return;
  store.set({ transient });
  syncPreview();
}

export function removeDraft(id: string): void {
  const s = store.get();
  store.set({ drafts: s.drafts.filter((d) => d.id !== id) });
  persist();
  syncPreview();
}

export function discardAll(): void {
  store.set({ drafts: [], transient: null });
  persist();
  syncPreview();
}

export function setCompare(on: boolean): void {
  if (store.get().compare === on) return;
  store.set({ compare: on });
  syncPreview();
}

export function settle(ids: string[]): void {
  const s = store.get();
  store.set({ drafts: s.drafts.filter((d) => !ids.includes(d.id)), settled: [...new Set([...s.settled, ...ids])] });
  persist();
  syncPreview();
}

export function requestProbe(trace: ElementTrace, rowId: string): void {
  const key = `${trace.traceId}:${rowId}`;
  const s = store.get();
  if (s.probes[key]) return;
  store.set({ probes: { ...s.probes, [key]: "pending" } });
  emitToPreview(EVENTS.probe, { rowId, traceId: trace.traceId });
}
