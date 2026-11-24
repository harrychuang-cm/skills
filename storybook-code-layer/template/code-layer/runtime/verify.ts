// Post-apply verification in the preview.
// Level 1 (content reached the page): only <style> textContent is read, so a
//   preview can never satisfy it. Waits for hot updates, reloads, re-sends.
// Level 2 (rendered result): with this batch's previews removed, the
//   witness's computed value must equal what was previewed (B, measured at
//   arm time) or, without an arm measurement, the target token's live value.
//   "Verified" also requires that the value actually changed (A != expected).
import { findRootDeclaration, normalizeValue } from "../shared/value-refs.mjs";
import type { Descriptor, Draft, IndexJson } from "../shared/protocol";
import { toHex } from "./color";
import { resolve } from "./descriptor";
import { withFreeze } from "./freeze";
import { styleByDevId, styleTextHash } from "./sheets";

export type Expect = {
  css: Array<{ file: string; devId: string; servedTextHashAfter: string | null }>;
  tokens: Array<{ token: string; value: string }>;
};

export type Witness = { draftId: string; storyId: string | null; descriptor: Descriptor; property: string; A: string; B: string };
export type Armed = { armId: string; draftIds: string[]; drafts: Draft[]; witnesses: Witness[]; armedAt: number };

export type VerifyItem = {
  draftId: string;
  status: "verified" | "written-not-observable" | "mismatch" | "timeout";
  expected: string | null;
  actual: string | null;
  reason: string | null;
};

export type VerifyRequest = { applyId: string; armId: string; mode: "apply" | "undo"; expect: Expect; draftIds: string[]; drafts: Draft[] };

const ARMED_KEY = "code-layer/v1/armed";
const SOFT_TIMEOUT = 2000;
const HARD_TIMEOUT = 6000;

export function measure(element: Element, property: string): string {
  return withFreeze(element, () => getComputedStyle(element).getPropertyValue(property).trim());
}

/** Exact, colour-normalised, or numeric within 0.01 for the same unit. */
export function sameValue(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  if (a === b) return true;
  const ha = toHex(a);
  const hb = toHex(b);
  if (ha && hb) return ha === hb;
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  const unit = (s: string) => s.replace(/^[-+]?[\d.]+(e[-+]?\d+)?/i, "").trim();
  if (Number.isFinite(na) && Number.isFinite(nb) && unit(a) === unit(b)) return Math.abs(na - nb) <= 0.01;
  return false;
}

export function saveArmed(armed: Armed): void {
  try {
    const all = JSON.parse(sessionStorage.getItem(ARMED_KEY) ?? "{}") as Record<string, Armed>;
    all[armed.armId] = armed;
    const keys = Object.keys(all).sort((x, y) => all[y].armedAt - all[x].armedAt).slice(0, 10);
    sessionStorage.setItem(ARMED_KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, all[k]]))));
  } catch {
    // storage unavailable: verification falls back to token values
  }
}

export function loadArmed(armId: string): Armed | null {
  try {
    return (JSON.parse(sessionStorage.getItem(ARMED_KEY) ?? "{}") as Record<string, Armed>)[armId] ?? null;
  } catch {
    return null;
  }
}

function level1(draft: Draft, request: VerifyRequest, index: IndexJson | null): Promise<"ok" | "pending" | "not-loaded"> {
  const op = draft.op;
  if (op.type === "rebind-token") {
    const expect = request.expect.tokens.find((t) => t.token === op.token);
    const devId = index?.tokens.entry.devId;
    const style = devId ? styleByDevId(devId) : null;
    if (!expect) return Promise.resolve("ok");
    if (!style) return Promise.resolve("not-loaded");
    const decl = findRootDeclaration(style.textContent ?? "", op.token);
    const ok = !!decl && decl !== "ambiguous" && normalizeValue(decl.value) === normalizeValue(expect.value);
    return Promise.resolve(ok ? "ok" : "pending");
  }
  const expect = request.expect.css.find((c) => c.file === op.file);
  if (!expect) return Promise.resolve("ok");
  const style = styleByDevId(expect.devId);
  if (!style) return Promise.resolve("not-loaded");
  return styleTextHash(style).then((hash) => (hash === expect.servedTextHashAfter ? "ok" : "pending"));
}

/** The value a draft's witness should show after the write (or after the undo). */
function expectedFromTokens(draft: Draft, mode: "apply" | "undo"): string | null {
  const token = mode === "apply" ? draft.op.toToken : draft.op.fromToken;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || null;
}

export async function runVerification(
  request: VerifyRequest,
  context: { index: () => IndexJson | null; storyId: () => string | null; settleAndClear: () => Promise<void>; onSoftTimeout: () => void },
): Promise<{ status: VerifyItem["status"]; items: VerifyItem[] }> {
  await context.settleAndClear();
  const drafts = request.drafts.filter((d) => request.draftIds.includes(d.id));
  const started = Date.now();
  let softSent = false;
  const level1State = new Map<string, "ok" | "pending" | "not-loaded">();
  for (;;) {
    for (const draft of drafts) level1State.set(draft.id, await level1(draft, request, context.index()));
    if ([...level1State.values()].every((s) => s !== "pending")) break;
    if (!softSent && Date.now() - started > SOFT_TIMEOUT) {
      softSent = true;
      context.onSoftTimeout();
    }
    if (Date.now() - started > HARD_TIMEOUT) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 500))]);

  const armed = loadArmed(request.armId);
  const items: VerifyItem[] = drafts.map((draft) => {
    const state = level1State.get(draft.id);
    if (state === "pending") return { draftId: draft.id, status: "timeout", expected: null, actual: null, reason: "頁面上的樣式沒有在時限內更新" };
    if (state === "not-loaded") return { draftId: draft.id, status: "written-not-observable", expected: null, actual: null, reason: "此頁未載入該樣式表" };
    const witness = draft.witness;
    if (!witness || draft.storyId !== context.storyId()) {
      return { draftId: draft.id, status: "written-not-observable", expected: null, actual: null, reason: "見證元素不在這個 story" };
    }
    const element = resolve(witness.descriptor);
    if (!element) return { draftId: draft.id, status: "written-not-observable", expected: null, actual: null, reason: "第一層通過，第二層無法執行：找不到見證元素" };
    const measured = armed?.witnesses.find((w) => w.draftId === draft.id) ?? null;
    const A = measured?.A ?? witness.beforeComputed;
    const expected = request.mode === "apply" ? measured?.B ?? expectedFromTokens(draft, "apply") : A;
    const actual = measure(element, witness.property);
    if (!sameValue(actual, expected)) return { draftId: draft.id, status: "mismatch", expected, actual, reason: null };
    const changed = request.mode === "apply" ? !sameValue(A, expected) : !sameValue(measured?.B ?? expectedFromTokens(draft, "apply"), A);
    return { draftId: draft.id, status: changed ? "verified" : "written-not-observable", expected, actual, reason: changed ? null : "預覽開與關的值相同" };
  });
  const rank = { mismatch: 3, timeout: 2, "written-not-observable": 1, verified: 0 } as const;
  const status = items.reduce<VerifyItem["status"]>((worst, item) => (rank[item.status] > rank[worst] ? item.status : worst), "verified");
  return { status, items };
}
