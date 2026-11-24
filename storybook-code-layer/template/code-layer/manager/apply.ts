// Apply, verify, undo. Only the manager sends POSTs, and only after a click
// in the panel. The preview measures and verifies; the server writes.
import { EVENTS, type Draft, type Envelope, type IndexJson } from "../shared/protocol";
import { settle } from "./actions";
import { postJson } from "./api";
import { emitToPreview, onPreview } from "./channel";
import { IDLE_APPLY, store, type ApplyState, type VerifyItemView } from "./store";

const PENDING_KEY = "code-layer/v1/pending-verification";
const LAST_KEY = "code-layer/v1/last-apply";

type Expect = { css: Array<{ file: string; devId: string; servedTextHashAfter: string | null }>; tokens: Array<{ token: string; value: string }> };
export type PendingVerification = {
  applyId: string;
  originalApplyId: string;
  armId: string;
  mode: "apply" | "undo";
  expect: Expect;
  draftIds: string[];
  drafts: Draft[];
};

function savePending(pending: PendingVerification | null): void {
  try {
    if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

function loadPending(): PendingVerification | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingVerification) : null;
  } catch {
    return null;
  }
}

function saveLast(state: ApplyState): void {
  try {
    sessionStorage.setItem(LAST_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function restoreLastApply(): void {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    if (raw && store.get().applyState.phase === "idle") store.set({ applyState: JSON.parse(raw) as ApplyState });
  } catch {
    // ignore
  }
}

function setApply(patch: Partial<ApplyState>): void {
  const next = { ...store.get().applyState, ...patch };
  store.set({ applyState: next });
  saveLast(next);
}

function waitForPreview<T>(event: string, match: (payload: Envelope<T>) => boolean, timeoutMs: number): Promise<Envelope<T> | null> {
  return new Promise((resolve) => {
    const off = onPreview<T>(event, (payload) => {
      if (!match(payload)) return;
      off();
      clearTimeout(timer);
      resolve(payload);
    });
    const timer = setTimeout(() => {
      off();
      resolve(null);
    }, timeoutMs);
  });
}

export function buildApplyBatch(drafts: Draft[], index: IndexJson) {
  const operations = drafts.map((draft, i) => {
    const id = `op-${i + 1}`;
    const reason = {
      ...(draft.storyId ? { storyId: draft.storyId } : {}),
      element: draft.elementLabel.slice(0, 200),
      cssProperty: (draft.witness?.property ?? draft.rowId).slice(0, 100),
    };
    if (draft.op.type === "rebind-token") {
      return { id, type: draft.op.type, token: draft.op.token, fromToken: draft.op.fromToken, toToken: draft.op.toToken, before: { value: draft.before }, after: { value: draft.after }, reason };
    }
    const op = draft.op;
    const rule = index.css.files.find((f) => f.file === op.file)?.rules[op.ordinal];
    return {
      id,
      type: op.type,
      file: op.file,
      rule: { ordinal: op.ordinal, selector: rule?.selector ?? op.selector, atRules: rule?.atRules ?? [], occurrence: rule?.occurrence ?? 0 },
      declaration: { property: op.property },
      replacements: [{ refIndex: 0, fromToken: op.fromToken, toToken: op.toToken }],
      fromToken: op.fromToken,
      toToken: op.toToken,
      before: { value: draft.before },
      after: { value: draft.after },
      reason,
    };
  });
  const batchId = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return { schemaVersion: 1, batchId, indexRevision: index.revision, operations };
}

async function requestVerification(pending: PendingVerification): Promise<void> {
  lastPending = pending;
  setApply({ phase: "verifying", progress: null, mode: pending.mode });
  const resultPromise = waitForPreview<{ applyId: string; mode: string; status: string; items: VerifyItemView[] }>(
    EVENTS.verifyResult,
    (p) => p.applyId === pending.applyId && p.mode === pending.mode,
    20000,
  );
  emitToPreview(EVENTS.applyWritten, pending);
  const result = await resultPromise;
  if (!result) {
    setApply({ phase: "done", result: { status: "timeout", items: [] }, progress: "preview 沒有回覆驗證結果（可按「重新驗證」）" });
    return;
  }
  savePending(null);
  setApply({ phase: "done", result: { status: result.status, items: result.items }, progress: null });
  void postJson(`/applies/${pending.applyId}/verification`, {
    status: result.status,
    items: result.items.map((item) => ({ id: item.draftId.slice(0, 64), status: item.status })),
  });
}

export async function applyDrafts(): Promise<void> {
  const s = store.get();
  if (!s.index || !s.session) return;
  const statuses = s.previewState;
  const conflicts = s.drafts.filter((d) => statuses[d.id]?.status === "conflict");
  if (conflicts.length > 0) {
    store.set({ applyState: { ...IDLE_APPLY, phase: "error", error: { code: "conflict", message: "有變更與目前的原始碼不一致，請先移除或重新選擇。" } } });
    return;
  }
  const inSource = s.drafts.filter((d) => statuses[d.id]?.status === "in-source");
  if (inSource.length) settle(inSource.map((d) => d.id));
  const drafts = store.get().drafts;
  if (drafts.length === 0) return;
  const draftIds = drafts.map((d) => d.id);
  const armId = `arm-${Date.now().toString(36)}`;
  store.set({ applyState: { ...IDLE_APPLY, phase: "arming", armId, drafts } });
  const armed = waitForPreview(EVENTS.applyArmed, (p: Envelope<{ armId: string }>) => p.armId === armId, 3000);
  emitToPreview(EVENTS.applyArm, { armId, draftIds });
  await armed;
  setApply({ phase: "writing" });
  const response = await postJson<{ applyId: string; expect: Expect }>("/apply", buildApplyBatch(drafts, s.index));
  if (!response.ok) {
    emitToPreview(EVENTS.applyCancel, { armId, draftIds });
    setApply({ phase: "error", error: response.error });
    return;
  }
  settle(draftIds);
  const pending: PendingVerification = { applyId: response.data.applyId, originalApplyId: response.data.applyId, armId, mode: "apply", expect: response.data.expect, draftIds, drafts };
  savePending(pending);
  setApply({ applyId: response.data.applyId });
  await requestVerification(pending);
}

export async function undoApplied(): Promise<void> {
  const state = store.get().applyState;
  if (!state.applyId || !state.armId) return;
  setApply({ phase: "undoing", error: null });
  const response = await postJson<{ undoId: string; expect: Expect }>("/undo", { applyId: state.applyId });
  if (!response.ok) {
    setApply({ phase: "done", error: response.error });
    return;
  }
  const pending: PendingVerification = {
    applyId: response.data.undoId,
    originalApplyId: state.applyId,
    armId: state.armId,
    mode: "undo",
    expect: response.data.expect,
    draftIds: state.drafts.map((d) => d.id),
    drafts: state.drafts,
  };
  savePending(pending);
  setApply({ undone: true, result: null });
  await requestVerification(pending);
}

export async function skipApplied(): Promise<void> {
  const state = store.get().applyState;
  if (!state.applyId) return;
  const response = await postJson<{ skipped: string }>("/undo/skip", { applyId: state.applyId });
  if (!response.ok) setApply({ error: response.error });
  else setApply({ skipped: true, error: null });
}

/** The last verification request (apply or undo), for "re-verify". */
let lastPending: PendingVerification | null = null;

export async function retryVerification(): Promise<void> {
  const pending = loadPending() ?? lastPending;
  if (pending) await requestVerification(pending);
}

/** Reload only the preview iframe; verification resumes when it reports ready. */
export function reloadPreviewAndVerify(): void {
  const pending = loadPending() ?? lastPending;
  if (pending) savePending(pending);
  const iframe = document.getElementById("storybook-preview-iframe") as HTMLIFrameElement | null;
  iframe?.contentWindow?.location.reload();
}

/** Called when the preview reports ready: finish a verification interrupted by a reload. */
export function resumePending(): void {
  const pending = loadPending();
  if (pending) void requestVerification(pending);
}
