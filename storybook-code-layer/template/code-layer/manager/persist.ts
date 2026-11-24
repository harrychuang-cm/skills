// Draft persistence (localStorage, per project) and per-tab selection memory
// (sessionStorage). Storage can be unavailable; every access is guarded.
import type { Descriptor, Draft } from "../shared/protocol";

const DRAFTS_KEY = (projectId: string) => `code-layer/v1/${projectId}/drafts`;
const SELECTION_KEY = "code-layer/v1/selection";
const SETTLED_KEY = (projectId: string) => `code-layer/v1/${projectId}/settled`;

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

export function loadDrafts(projectId: string): Draft[] {
  const saved = read<{ schema: number; drafts: Draft[] } | null>(localStorage, DRAFTS_KEY(projectId), null);
  return saved?.schema === 1 && Array.isArray(saved.drafts) ? saved.drafts : [];
}

/**
 * Written immediately: drafts change only on stage/remove/settle (never on
 * hover), and a delayed write is lost when the tab reloads right after an
 * apply, which would bring the applied drafts back.
 */
export function saveDrafts(projectId: string, drafts: Draft[]): void {
  write(localStorage, DRAFTS_KEY(projectId), { schema: 1, drafts });
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
