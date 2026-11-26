// Store mutations that must also reach the preview (drafts, transient
// preview, compare, navigation) or be persisted.
import { EVENTS, PROTOCOL_VERSION, draftId, isLayoutOp, opFrom, opTo, scopeDraftId, type Descriptor, type Draft, type ElementTrace, type RowScope, type RowTrace, type ScopeId } from "../shared/protocol";
import { fetchIndex, fetchState, postJson } from "./api";
import { emitToPreview } from "./channel";
import { currentScope, draftOfRow, makeDraft, rowKey, translateTarget } from "./drafts";
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
  const drafts = loaded.drafts.filter((d) => !settled.includes(d.id));
  store.set({ drafts, settled, ...(loaded.discarded ? { notice: "drafts-discarded" as const } : {}) });
  if (drafts.length !== loaded.drafts.length) saveDrafts(projectId, drafts);
  syncPreview();
}

export function dismissNotice(): void {
  store.set({ notice: null });
}

/** Stage a re-bind of a row at one of its scopes; a change of the same row at another scope is replaced. */
export function stageDraft(trace: ElementTrace, row: RowTrace, scope: RowScope, toToken: string): void {
  const s = store.get();
  if (!s.index) return;
  const id = scopeDraftId(scope.target);
  const existing = s.drafts.find((d) => d.id === id) ?? null;
  const draft = makeDraft(trace, row, scope, toToken, s.index, existing);
  if (!draft) return;
  const siblings = new Set(row.scopes.map((other) => scopeDraftId(other.target)));
  const others = s.drafts.filter((d) => !siblings.has(d.id));
  const settled = s.settled.filter((settledId) => settledId !== draft.id);
  // Choosing what the source already holds is not a change.
  const drafts = opTo(draft.op) === opFrom(draft.op) ? others : [...others, draft];
  store.set({ drafts, transient: null, settled });
  persist();
  syncPreview();
}

export function previewTransient(trace: ElementTrace | null, row: RowTrace | null, scope: RowScope | null, toToken: string | null): void {
  const s = store.get();
  let transient: Draft | null = null;
  if (trace && row && scope && toToken && s.index) {
    const id = scopeDraftId(scope.target);
    const existing = s.drafts.find((d) => d.id === id) ?? null;
    transient = makeDraft(trace, row, scope, toToken, s.index, existing);
  }
  if ((transient?.after ?? null) === (s.transient?.after ?? null) && transient?.id === s.transient?.id) return;
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

export function requestProbe(trace: ElementTrace, rowId: string, scope: ScopeId): void {
  const key = `${trace.traceId}:${rowId}:${scope}`;
  const s = store.get();
  if (s.probes[key]) return;
  store.set({ probes: { ...s.probes, [key]: "pending" } });
  emitToPreview(EVENTS.probe, { rowId, scope, traceId: trace.traceId });
}

/**
 * Choose the scope a row is edited at. A change already staged for the row is
 * moved to the new scope (the token that gives the same result there), or
 * dropped when no such token exists.
 */
export function chooseScope(trace: ElementTrace, row: RowTrace, scopeId: ScopeId): void {
  const s = store.get();
  const key = rowKey(trace, row);
  const next = row.scopes.find((scope) => scope.id === scopeId);
  if (!next || !next.available || !s.index) return;
  const previous = currentScope(row, s.scopeChoice[key]);
  store.set({ scopeChoice: { ...s.scopeChoice, [key]: scopeId }, scopeConfirm: null });
  const staged = draftOfRow(row, s.drafts);
  if (!staged || staged.scope === scopeId) return;
  const from = row.scopes.find((scope) => scope.id === staged.scope) ?? previous;
  // A layout row has one scope, so only token changes are ever moved.
  const translated = from && !isLayoutOp(staged.op) ? translateTarget(s.index, from, next, staged.op.toToken) : null;
  if (translated) stageDraft(trace, row, next, translated);
  else removeDraft(staged.id);
}

/** The system-token scope changes every component using the role: ask before choosing it. */
export function requestScope(trace: ElementTrace, row: RowTrace, scopeId: ScopeId): void {
  if (scopeId === "system-token") store.set({ scopeConfirm: { rowKey: rowKey(trace, row), scope: scopeId } });
  else chooseScope(trace, row, scopeId);
}

export function cancelScopeConfirm(): void {
  store.set({ scopeConfirm: null });
}

export function navigate(action: "parent" | "first-child" | "next" | "previous"): void {
  emitToPreview(EVENTS.navigate, { action });
}

export function selectDescriptor(descriptor: Descriptor): void {
  emitToPreview(EVENTS.highlight, { descriptor: null });
  emitToPreview(EVENTS.navigate, { descriptor });
}

export function highlight(descriptor: Descriptor | null): void {
  emitToPreview(EVENTS.highlight, { descriptor });
}

/**
 * Stage the second change a pairing warning offers: the content token follows
 * the container's new role. It is witnessed on the same element as the
 * container change, by its text color.
 */
export function stageOffer(container: Draft, offer: { token: string; fromToken: string; toToken: string }): void {
  const s = store.get();
  const token = s.index?.tokens.items.find((t) => t.name === offer.token);
  if (!s.index || !token || token.tier !== "comp" || !token.declaredValue) return;
  const op = { type: "rebind-token" as const, token: token.name, tier: "comp" as const, fromToken: offer.fromToken, toToken: offer.toToken, file: token.file, line: token.line };
  const mirror = s.index.tokens.mirrors.find((m) => m.source === token.file)?.mirror ?? null;
  const usedBy = token.usedBy;
  const draft: Draft = {
    schema: PROTOCOL_VERSION,
    id: draftId(op),
    rowId: "color",
    group: "color",
    parts: ["color"],
    elementLabel: container.elementLabel,
    storyId: container.storyId,
    scope: "component-token",
    witness: container.witness ? { descriptor: container.witness.descriptor, property: "color", beforeComputed: "" } : null,
    op,
    before: `var(${offer.fromToken})`,
    after: `var(${offer.toToken})`,
    writesTo: { files: mirror ? [token.file, mirror] : [token.file], line: token.line, declarations: usedBy.length, components: new Set(usedBy.map((u) => u.file)).size },
    inheritedFrom: null,
    indexRevision: s.index.revision,
    createdAt: Date.now(),
  };
  store.set({ drafts: [...s.drafts.filter((d) => d.id !== draft.id), draft], settled: s.settled.filter((id) => id !== draft.id) });
  persist();
  syncPreview();
}

/** Refresh what the server knows after anything was written. */
export async function refreshServer(): Promise<void> {
  await Promise.all([fetchIndex(), fetchState()]);
}

/** Mark documents pending sync as done. */
export async function resolvePending(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await postJson("/pending-docs/resolve", { ids });
  await fetchState();
}

/** Step 1 of synchronising mirrors: ask what would be overwritten. */
export async function checkMirrorSync(): Promise<void> {
  store.set({ mirrorSync: { phase: "checking", files: [], error: null } });
  const dry = await postJson<{ files: Array<{ mirror: string; source: string; diffLines: number }> }>("/sync-mirror", { dryRun: true });
  if (!dry.ok) store.set({ mirrorSync: { phase: "error", files: [], error: dry.error } });
  else store.set({ mirrorSync: { phase: "confirm", files: dry.data.files, error: null } });
}

/** Step 2, after the person confirmed: copy the source of truth over the mirrors. */
export async function confirmMirrorSync(): Promise<void> {
  const files = store.get().mirrorSync.files;
  store.set({ mirrorSync: { phase: "syncing", files, error: null } });
  const result = await postJson("/sync-mirror", { dryRun: false });
  if (!result.ok) store.set({ mirrorSync: { phase: "error", files, error: result.error } });
  else store.set({ mirrorSync: { phase: "idle", files: [], error: null } });
  await refreshServer();
}

export function cancelMirrorSync(): void {
  store.set({ mirrorSync: { phase: "idle", files: [], error: null } });
}
