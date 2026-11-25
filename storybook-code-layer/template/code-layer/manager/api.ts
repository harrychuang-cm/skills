// Same-origin calls to the Code Layer dev API. Only the manager sends POSTs.
import { applyBindingLocale } from "../shared/i18n";
import { API_BASE, SESSION_HEADER, type IndexJson } from "../shared/protocol";
import { store, type ServerState, type SessionInfo } from "./store";

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
    // The binding's language wins over the browser's.
    const changed = applyBindingLocale(index.locale ?? null);
    store.set({ index, indexError: null, ...(changed ? { localeTick: store.get().localeTick + 1 } : {}) });
    return index;
  } catch (error) {
    store.set({ indexError: String(error) });
    return null;
  }
}

/** Mirrors, undo stack, documents pending sync, contract drift, post-apply commands. */
export async function fetchState(): Promise<ServerState | null> {
  try {
    const response = await fetch(`${API_BASE}/state`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    const server = (await response.json()) as ServerState;
    store.set({ server });
    // Another dev server than the one this page got its session from (it was restarted), or no session yet: renew.
    const session = store.get().session;
    if (!session || (server.instance && session.instance && server.instance !== session.instance)) void renewSession();
    return server;
  } catch {
    return null;
  }
}

export type ApiError = { code: string; message: string; details?: unknown };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

export async function getJson<T>(path: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { credentials: "same-origin", cache: "no-store" });
    const json = (await response.json().catch(() => null)) as (T & { ok?: boolean; error?: ApiError }) | null;
    if (!response.ok || !json || json.ok === false) return { ok: false, status: response.status, error: json?.error ?? { code: "internal", message: `HTTP ${response.status}` } };
    return { ok: true, data: json };
  } catch (error) {
    return { ok: false, status: 0, error: { code: "network", message: String(error) } };
  }
}

/**
 * Take the session of the dev server that is running now. A dev server that
 * was restarted has a new one; the page that was open across the restart
 * renews it by itself. When the restarted server serves other manager code
 * than this page runs, the page says so (only a reload brings the new code).
 */
let renewing: Promise<SessionInfo | null> | null = null;
export function renewSession(): Promise<SessionInfo | null> {
  renewing ??= (async () => {
    try {
      const previous = store.get().session;
      const next = await fetchSession();
      if (!next) return null;
      const outdated = Boolean(previous?.build && next.build && previous.build !== next.build);
      // The page keeps the build it loaded with: that is what it is running, whatever the server has now.
      store.set({ session: previous?.build ? { ...next, build: previous.build } : next, ...(outdated ? { reloadRequired: true } : {}) });
      return next;
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

async function send<T>(path: string, body: unknown, session: SessionInfo): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", [SESSION_HEADER]: session.session },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as (T & { ok?: boolean; error?: ApiError }) | null;
    if (!response.ok || !json || json.ok === false) {
      return { ok: false, status: response.status, error: json?.error ?? { code: "internal", message: `HTTP ${response.status}` } };
    }
    return { ok: true, data: json };
  } catch (error) {
    return { ok: false, status: 0, error: { code: "network", message: String(error) } };
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  const session = store.get().session ?? (await renewSession());
  if (!session) return { ok: false, status: 0, error: { code: "session-required", message: "no session" } };
  const result = await send<T>(path, body, session);
  if (result.ok || result.error.code !== "session-required") return result;
  // The dev server was restarted since this page loaded. The refusal came before the server read
  // anything of the request, so it is safe to take the new session and send the same request once more.
  const renewed = await renewSession();
  return renewed && renewed.session !== session.session ? send<T>(path, body, renewed) : result;
}
