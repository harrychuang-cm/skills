// Apply, verify, undo. Only the manager sends POSTs, and only after a click
// in the panel. The preview measures and verifies; the server writes.
import type { PairingEntry } from "../shared/pairing.mjs";
import { EVENTS, type Draft, type Envelope, type IndexJson } from "../shared/protocol";
import { tokenizeComponent } from "../shared/literals.mjs";
import { normalizeValue, replaceComponent, replaceVarName } from "../shared/value-refs.mjs";
import { refreshServer, settle } from "./actions";
import { getJson, postJson } from "./api";
import { emitToPreview, onPreview } from "./channel";
import { IDLE_APPLY, store, type ApplyState, type DocumentEdit, type PostApplyReport, type VerifyItemView } from "./store";

const PENDING_KEY = "code-layer/v2/pending-verification";
const LAST_KEY = "code-layer/v2/last-apply";

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

/**
 * The batch for the server. Values are taken from the index, not from the
 * drafts: two staged references of one declaration both state the value the
 * file holds now, each with only its own reference replaced.
 */
export function buildApplyBatch(drafts: Draft[], index: IndexJson) {
  const operations = drafts.map((draft, i) => {
    const id = `op-${i + 1}`;
    const reason = {
      ...(draft.storyId ? { storyId: draft.storyId } : {}),
      element: draft.elementLabel.slice(0, 200),
      cssProperty: (draft.witness?.property ?? draft.rowId).slice(0, 100),
    };
    if (draft.op.type === "rebind-token") {
      const op = draft.op;
      const declared = index.tokens.items.find((t) => t.name === op.token)?.declaredValue;
      const values = currentValues(declared ? normalizeValue(declared) : null, 0, draft);
      return { id, type: op.type, token: op.token, fromToken: op.fromToken, toToken: op.toToken, before: { value: values.before }, after: { value: values.after }, reason };
    }
    const op = draft.op;
    const rule = index.css.files.find((f) => f.file === op.file)?.rules[op.ordinal];
    const declared = rule?.declarations.filter((d) => d.property === op.property).at(-1)?.value;
    const locator = { ordinal: op.ordinal, selector: rule?.selector ?? op.selector, atRules: rule?.atRules ?? [], occurrence: rule?.occurrence ?? 0 };
    if (op.type === "add-declaration") {
      return { id, type: op.type, file: op.file, rule: locator, declaration: { property: op.property }, toKeyword: op.toKeyword, after: { value: op.toKeyword }, reason };
    }
    if (op.type === "set-keyword") {
      // The value the file holds now with this keyword replaced; the staged values when the source has moved on.
      let values = { before: draft.before, after: draft.after };
      if (declared != null) {
        try {
          values = { before: declared, after: replaceComponent(declared, op.component, op.fromKeyword, op.toKeyword) };
        } catch {
          // the server answers that the source changed
        }
      }
      return { id, type: op.type, file: op.file, rule: locator, declaration: { property: op.property }, component: op.component, fromKeyword: op.fromKeyword, toKeyword: op.toKeyword, before: { value: values.before }, after: { value: values.after }, reason };
    }
    if (op.type === "tokenize-literal") {
      // The literal is only compared with the file by the server; what it writes is var() and the token's name.
      let values = { before: draft.before, after: draft.after };
      if (declared != null) {
        try {
          values = { before: declared, after: tokenizeComponent(declared, op.component, op.literal, op.toToken) };
        } catch {
          // the server answers that the source changed
        }
      }
      return { id, type: op.type, file: op.file, rule: locator, declaration: { property: op.property }, component: op.component, literal: op.literal, toToken: op.toToken, before: { value: values.before }, after: { value: values.after }, reason };
    }
    const values = currentValues(declared ?? null, op.refIndex, draft);
    return {
      id,
      type: op.type,
      file: op.file,
      rule: locator,
      declaration: { property: op.property },
      replacements: [{ refIndex: op.refIndex, fromToken: op.fromToken, toToken: op.toToken }],
      fromToken: op.fromToken,
      toToken: op.toToken,
      before: { value: values.before },
      after: { value: values.after },
      reason,
    };
  });
  const batchId = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return { schemaVersion: 1, batchId, indexRevision: index.revision, operations };
}

/**
 * What the batch states as the value before and after. Normally the value the
 * index holds now, with the staged reference re-bound. When that reference no
 * longer holds the token the change was staged on, the source has moved on:
 * the values the change was staged with are sent, and the server answers that
 * the source changed.
 */
function currentValues(declared: string | null, refIndex: number, draft: Draft): { before: string; after: string } {
  if (declared !== null && (draft.op.type === "rebind-token" || draft.op.type === "rebind-declaration")) {
    try {
      return { before: declared, after: replaceVarName(declared, refIndex, draft.op.fromToken, draft.op.toToken) };
    } catch {
      // fall through to the staged values
    }
  }
  return { before: draft.before, after: draft.after };
}

/** Ask for the post-apply round of a transaction until it has finished. */
async function followPostApply(applyId: string, initial: { status: string; commands: string[] } | undefined): Promise<void> {
  if (!initial || initial.status === "none") return;
  setApplyFor(applyId, { postApply: { status: "queued", commands: initial.commands, results: [], stale: false } });
  for (let attempt = 0; attempt < 600; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 10 ? 300 : 1000));
    const report = await getJson<{ postApply: PostApplyReport }>(`/applies/${applyId}`);
    if (!report.ok) return;
    setApplyFor(applyId, { postApply: report.data.postApply });
    if (report.data.postApply.status === "done" || report.data.postApply.status === "none") return;
  }
}

/** Patch the apply state only while it still shows that transaction (or the undo of it). */
function setApplyFor(applyId: string, patch: Partial<ApplyState>): void {
  const state = store.get().applyState;
  if (state.applyId === applyId || followed === applyId) setApply(patch);
}

/** The transaction whose post-apply round is being followed (an undo has its own id). */
let followed: string | null = null;

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
    setApply({ phase: "done", result: { status: "timeout", items: [] }, progress: "report.noReply" });
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
    store.set({ applyState: { ...IDLE_APPLY, phase: "error", error: { code: "conflict", message: "staged changes conflict with the source" } } });
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
  const response = await postJson<ApplyResponse>("/apply", buildApplyBatch(drafts, s.index));
  if (!response.ok) {
    emitToPreview(EVENTS.applyCancel, { armId, draftIds });
    setApply({ phase: "error", error: response.error });
    void refreshServer();
    return;
  }
  settle(draftIds);
  const pending: PendingVerification = { applyId: response.data.applyId, originalApplyId: response.data.applyId, armId, mode: "apply", expect: response.data.expect, draftIds, drafts };
  savePending(pending);
  setApply({ applyId: response.data.applyId, documents: response.data.documents ?? [], pairing: response.data.pairing ?? [] });
  followed = response.data.applyId;
  void followPostApply(response.data.applyId, response.data.postApply);
  void refreshServer();
  await requestVerification(pending);
}

type ApplyResponse = {
  applyId: string;
  expect: Expect;
  documents?: DocumentEdit[];
  pairing?: PairingEntry[];
  postApply?: { status: string; commands: string[] };
};
type UndoResponse = { undoId: string; expect: Expect; postApply?: { status: string; commands: string[] } };

async function verifyUndo(state: ApplyState, response: UndoResponse, undoMode: "exact" | "reverse"): Promise<void> {
  const pending: PendingVerification = {
    applyId: response.undoId,
    originalApplyId: state.applyId!,
    armId: state.armId!,
    mode: "undo",
    expect: response.expect,
    draftIds: state.drafts.map((d) => d.id),
    drafts: state.drafts,
  };
  savePending(pending);
  setApply({ undone: true, undoMode, result: null, error: null });
  followed = response.undoId;
  void followPostApply(response.undoId, response.postApply);
  void refreshServer();
  await requestVerification(pending);
}

export async function undoApplied(): Promise<void> {
  const state = store.get().applyState;
  if (!state.applyId || !state.armId) return;
  setApply({ phase: "undoing", error: null });
  const response = await postJson<UndoResponse>("/undo", { applyId: state.applyId });
  if (!response.ok) {
    setApply({ phase: "done", error: response.error });
    return;
  }
  await verifyUndo(state, response.data, "exact");
}

/** After a whole-file undo was refused: put back only the references this apply changed. */
export async function reverseApplied(): Promise<void> {
  const state = store.get().applyState;
  if (!state.applyId || !state.armId) return;
  setApply({ phase: "undoing", error: null });
  const response = await postJson<UndoResponse>("/undo/reverse", { applyId: state.applyId });
  if (!response.ok) {
    setApply({ phase: "done", error: response.error });
    return;
  }
  await verifyUndo(state, response.data, "reverse");
}

export async function skipApplied(): Promise<void> {
  const state = store.get().applyState;
  if (!state.applyId) return;
  const response = await postJson<{ skipped: string }>("/undo/skip", { applyId: state.applyId });
  if (!response.ok) setApply({ error: response.error });
  else setApply({ skipped: true, error: null });
  void refreshServer();
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
