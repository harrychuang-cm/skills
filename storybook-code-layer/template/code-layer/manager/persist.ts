// Draft persistence (localStorage, per project) and per-tab selection memory
// (sessionStorage). Storage can be unavailable; every access is guarded.
import { PROTOCOL_VERSION, type Descriptor, type Draft } from "../shared/protocol";

const DRAFTS_KEY = (projectId: string) => `code-layer/v2/${projectId}/drafts`;
const OLD_DRAFTS_KEY = (projectId: string) => `code-layer/v1/${projectId}/drafts`;
const SELECTION_KEY = "code-layer/v2/selection";
const SETTLED_KEY = (projectId: string) => `code-layer/v2/${projectId}/settled`;

function read<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: drafts stay in memory for this session.
  }
}

/**
 * Staged changes of this project. Changes stored in an older format cannot be
 * re-staged faithfully (they were only staged, never applied), so they are
 * discarded; `discarded` says so once, and the old entry is removed.
 */
export function loadDrafts(projectId: string): { drafts: Draft[]; discarded: boolean } {
  let discarded = false;
  try {
    const old = read<{ drafts?: unknown[] } | null>(localStorage, OLD_DRAFTS_KEY(projectId), null);
    if (old) {
      if (Array.isArray(old.drafts) && old.drafts.length > 0) discarded = true;
      localStorage.removeItem(OLD_DRAFTS_KEY(projectId));
    }
  } catch {
    // ignore
  }
  const saved = read<{ schema: number; drafts: Draft[] } | null>(localStorage, DRAFTS_KEY(projectId), null);
  if (saved && saved.schema !== PROTOCOL_VERSION) {
    if (Array.isArray(saved.drafts) && saved.drafts.length > 0) discarded = true;
    return { drafts: [], discarded };
  }
  const drafts = saved && Array.isArray(saved.drafts) ? saved.drafts.filter((draft) => draft?.schema === PROTOCOL_VERSION) : [];
  return { drafts, discarded };
}

/**
 * Written immediately: drafts change only on stage/remove/settle (never on
 * hover), and a delayed write is lost when the tab reloads right after an
 * apply, which would bring the applied drafts back.
 */
export function saveDrafts(projectId: string, drafts: Draft[]): void {
  write(localStorage, DRAFTS_KEY(projectId), { schema: PROTOCOL_VERSION, drafts });
}

export function loadSettled(projectId: string): string[] {
  return read<string[]>(sessionStorage, SETTLED_KEY(projectId), []);
}

export function saveSettled(projectId: string, settled: string[]): void {
  write(sessionStorage, SETTLED_KEY(projectId), settled);
}

export function rememberSelection(storyId: string, descriptor: Descriptor | null): void {
  const all = read<Record<string, Descriptor | null>>(sessionStorage, SELECTION_KEY, {});
  if (descriptor) all[storyId] = descriptor;
  else delete all[storyId];
  write(sessionStorage, SELECTION_KEY, all);
}

export function recallSelection(storyId: string): Descriptor | null {
  return read<Record<string, Descriptor | null>>(sessionStorage, SELECTION_KEY, {})[storyId] ?? null;
}

/** Where the person put the inspector, and how they like it: kept per project. */
/** `placed` is false until the person drags the inspector: until then it picks the side that covers no component. */
export type InspectorPrefs = { right: number; top: number; placed: boolean; collapsed: boolean; dev: boolean };
export const DEFAULT_INSPECTOR_PREFS: InspectorPrefs = { right: 12, top: 12, placed: false, collapsed: false, dev: false };
const INSPECTOR_KEY = (projectId: string) => `code-layer/v2/${projectId}/inspector`;

export function loadInspectorPrefs(projectId: string): InspectorPrefs {
  const saved = read<Partial<InspectorPrefs> | null>(localStorage, INSPECTOR_KEY(projectId), null);
  const number = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  return {
    right: number(saved?.right, DEFAULT_INSPECTOR_PREFS.right),
    top: number(saved?.top, DEFAULT_INSPECTOR_PREFS.top),
    placed: saved?.placed === true,
    collapsed: saved?.collapsed === true,
    dev: saved?.dev === true,
  };
}

export function saveInspectorPrefs(projectId: string, prefs: InspectorPrefs): void {
  write(localStorage, INSPECTOR_KEY(projectId), prefs);
}
