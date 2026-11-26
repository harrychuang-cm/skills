// AI runs from the inspector: readiness, the prompt dialog, submitting,
// following a run until it ends, answering its question, undoing its import.
// Only the manager talks to the server; the text a person typed is kept in
// this tab (sessionStorage) because the server never sends it back.
import { getLocale } from "../shared/i18n";
import { EVENTS, type ElementTrace } from "../shared/protocol";
import { buildReference } from "../shared/reference";
import { refreshServer } from "./actions";
import { getJson, postJson } from "./api";
import { emitToPreview } from "./channel";
import { store, type AgentRunView, type AgentState, type AgentStatus } from "./store";

const RUN_KEY = "code-layer/v2/agent-run";
const DRAFTS_KEY = "code-layer/v2/agent-drafts";
const POLL_MS = 1000;

/** settled: the run's end has been handled (its element's draft cleared or kept). */
type StoredRun = { runId: string; text: string; before: AgentState["before"]; settled?: boolean };

/** Runs that end this way used the typed text; any other end keeps it, ready to send again. */
const CONSUMED = new Set(["imported", "needs-decision"]);

function patch(next: Partial<AgentState>): void {
  store.set({ agent: { ...store.get().agent, ...next } });
}

function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: the text is simply not shown after a reload
  }
}

/** One key per element of a story: typed text is kept apart for each. */
export function agentElementKey(trace: ElementTrace): string {
  return `${trace.storyId ?? ""}|${trace.pathText}`;
}

export function agentRunActive(): boolean {
  const run = store.get().agent.run;
  return Boolean(run && !run.final);
}

/** Readiness, and the preview told whether its selection label may show the AI button. */
export async function fetchAgentStatus(): Promise<AgentStatus | null> {
  const result = await getJson<AgentStatus>("/agent/status");
  const status = result.ok ? result.data : null;
  const previous = store.get().agent.status;
  patch({ status });
  if (Boolean(previous?.ready) !== Boolean(status?.ready) || !previous) emitToPreview(EVENTS.agent, { ready: Boolean(status?.ready) });
  return status;
}

export function announceAgentReadiness(): void {
  emitToPreview(EVENTS.agent, { ready: Boolean(store.get().agent.status?.ready) });
}

export function openAgentDialog(): void {
  if (!store.get().selection) return;
  store.set({ openRow: null });
  patch({ dialog: true, error: null });
  void fetchAgentStatus();
}

export function closeAgentDialog(): void {
  patch({ dialog: false });
}

export function setAgentDraft(key: string, text: string): void {
  const drafts = { ...store.get().agent.drafts, [key]: text };
  if (!text) delete drafts[key];
  patch({ drafts });
  writeSession(DRAFTS_KEY, drafts);
}

function rowsOf(trace: ElementTrace): Record<string, string> {
  return Object.fromEntries(trace.rows.map((row) => [row.id, row.computedDisplay]));
}

/** Once per run: a request that was carried out leaves an empty box; a denied, cancelled or failed one keeps its text. */
function settleDraft(run: AgentRunView): void {
  const stored = readSession<StoredRun>(RUN_KEY);
  if (!stored || stored.runId !== run.runId || stored.settled) return;
  if (CONSUMED.has(run.state) && stored.before) setAgentDraft(stored.before.key, "");
  writeSession(RUN_KEY, { ...stored, settled: true } satisfies StoredRun);
}

/**
 * The run whose "before" values wait for a fresh trace of its element. The
 * trace in the store can be older than the page: a live preview removed since
 * it was taken does not re-trace the selection.
 */
let freshBeforeFor: string | null = null;

/** Every selection the preview sends: the first one of the run's element after a request becomes its "before". */
export function agentSelectionArrived(trace: ElementTrace | null): void {
  const agent = store.get().agent;
  if (!freshBeforeFor || !trace || !agent.run || agent.run.runId !== freshBeforeFor || agent.run.final || !agent.before) return;
  if (agentElementKey(trace) !== agent.before.key) return;
  freshBeforeFor = null;
  const before = { key: agent.before.key, rows: rowsOf(trace) };
  patch({ before });
  const stored = readSession<StoredRun>(RUN_KEY);
  if (stored?.runId === agent.run.runId) writeSession(RUN_KEY, { ...stored, before });
}

let pollTimer = 0;

function stopPolling(): void {
  window.clearTimeout(pollTimer);
  pollTimer = 0;
}

async function poll(runId: string): Promise<void> {
  stopPolling();
  const result = await getJson<AgentRunView>(`/agent/runs/${runId}`);
  if (store.get().agent.run?.runId !== runId) return;
  if (result.ok) {
    const wasFinal = store.get().agent.run?.final ?? false;
    patch({ run: result.data });
    if (result.data.final && !wasFinal) {
      settleDraft(result.data);
      // The project changed (or not): what the server knows is refreshed; the page updates by itself.
      void refreshServer();
      void fetchAgentStatus();
      if (result.data.state === "needs-decision") patch({ dialog: true });
    }
    if (result.data.final) return;
  }
  pollTimer = window.setTimeout(() => void poll(runId), POLL_MS);
}

/**
 * Send a request for the selected element. With `followUpOf`, the text is the
 * answer to that run's question.
 */
export async function submitAgentRequest(text: string, followUpOf: string | null = null): Promise<boolean> {
  const trace = store.get().selection;
  if (!trace || !text.trim() || agentRunActive()) return false;
  patch({ busy: true, error: null, codeError: null });
  const body = {
    text,
    reference: buildReference(trace),
    element: { label: trace.label, storyId: trace.storyId, descriptor: trace.descriptor },
    locale: getLocale(),
    ...(followUpOf ? { followUp: { runId: followUpOf } } : {}),
  };
  const result = await postJson<{ runId: string; state: string; confirm: { mode: string; fallback: boolean } }>("/agent/runs", body);
  if (!result.ok) {
    patch({ busy: false, error: result.error });
    return false;
  }
  const before = { key: agentElementKey(trace), rows: rowsOf(trace) };
  const shownText = text;
  const run: AgentRunView = {
    runId: result.data.runId,
    state: result.data.state,
    final: false,
    runner: store.get().agent.status?.runners[0]?.label ?? "",
    element: { label: trace.label, storyId: trace.storyId },
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    elapsedMs: 0,
    confirm: result.data.confirm,
    result: null,
    changes: null,
    checks: null,
    reasons: null,
    applyId: null,
    followUpOf,
  };
  patch({ busy: false, run, text: shownText, before, undone: false });
  // The typed text stays in its box until the run has used it (see settleDraft).
  writeSession(RUN_KEY, { runId: run.runId, text: shownText, before } satisfies StoredRun);
  // Measure the element again now, so that "what changed" compares with the page as it is.
  freshBeforeFor = run.runId;
  emitToPreview(EVENTS.select, { descriptor: trace.descriptor });
  void poll(run.runId);
  return true;
}

export async function confirmAgentCode(code: string): Promise<void> {
  const run = store.get().agent.run;
  if (!run) return;
  const result = await postJson<{ ok: true }>(`/agent/runs/${run.runId}/confirm`, { code });
  if (result.ok) patch({ codeError: null });
  else {
    const details = result.error.details as { remaining?: number } | undefined;
    patch({ codeError: { code: result.error.code, remaining: details?.remaining ?? null } });
  }
  void poll(run.runId);
}

export async function cancelAgentRun(): Promise<void> {
  const run = store.get().agent.run;
  if (!run || run.final) return;
  const result = await postJson<AgentRunView>(`/agent/runs/${run.runId}/cancel`, {});
  if (!result.ok) patch({ error: result.error });
  void poll(run.runId);
}

/** Undo the run's import, like any apply: whole files back. */
export async function revertAgentImport(): Promise<void> {
  const run = store.get().agent.run;
  if (!run?.applyId) return;
  patch({ busy: true, error: null });
  const result = await postJson<{ undoId: string }>("/undo", { applyId: run.applyId });
  patch({ busy: false, ...(result.ok ? { undone: true } : { error: result.error }) });
  void refreshServer();
}

/** Close a finished run's report. */
export function dismissAgentRun(): void {
  stopPolling();
  patch({ run: null, text: null, before: null, error: null, codeError: null, undone: false });
  writeSession(RUN_KEY, null);
}

/** After a reload: the run this tab started, with the text it kept. */
export async function resumeAgentRun(): Promise<void> {
  const drafts = readSession<Record<string, string>>(DRAFTS_KEY);
  if (drafts) patch({ drafts });
  const stored = readSession<StoredRun>(RUN_KEY);
  const status = await fetchAgentStatus();
  const runId = stored?.runId ?? status?.activeRunId ?? null;
  if (!runId) return;
  const result = await getJson<AgentRunView>(`/agent/runs/${runId}`);
  if (!result.ok) {
    writeSession(RUN_KEY, null);
    return;
  }
  patch({ run: result.data, text: stored?.runId === runId ? stored.text : null, before: stored?.runId === runId ? stored.before : null });
  if (result.data.final) settleDraft(result.data);
  else void poll(runId);
}

/** Rows of the selected element whose value differs from what it was when the request was sent. */
export function changedRows(trace: ElementTrace | null, before: AgentState["before"]): Array<{ id: string; from: string; to: string }> {
  if (!trace || !before || agentElementKey(trace) !== before.key) return [];
  return trace.rows.filter((row) => row.id in before.rows && before.rows[row.id] !== row.computedDisplay).map((row) => ({ id: row.id, from: before.rows[row.id], to: row.computedDisplay }));
}
