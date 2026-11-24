// Same-origin calls to the Code Layer dev API. Only the manager sends POSTs.
import { API_BASE, SESSION_HEADER, type IndexJson } from "../shared/protocol";
import { store, type SessionInfo } from "./store";

export async function fetchSession(): Promise<SessionInfo | null> {
  try {
    const response = await fetch(`${API_BASE}/session`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as SessionInfo;
  } catch {
    return null;
  }
}

export async function fetchIndex(): Promise<IndexJson | null> {
  try {
    const response = await fetch(`${API_BASE}/index`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      store.set({ indexError: `index ${response.status}` });
      return null;
    }
    const index = (await response.json()) as IndexJson;
    store.set({ index, indexError: null });
    return index;
  } catch (error) {
    store.set({ indexError: String(error) });
    return null;
  }
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: { code: string; message: string; details?: unknown } };

export async function postJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  const session = store.get().session;
  if (!session) return { ok: false, status: 0, error: { code: "session-required", message: "尚未取得 session" } };
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", [SESSION_HEADER]: session.session },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as (T & { ok?: boolean; error?: { code: string; message: string } }) | null;
    if (!response.ok || !json || json.ok === false) {
      return { ok: false, status: response.status, error: json?.error ?? { code: "internal", message: `HTTP ${response.status}` } };
    }
    return { ok: true, data: json };
  } catch (error) {
    return { ok: false, status: 0, error: { code: "network", message: String(error) } };
  }
}
