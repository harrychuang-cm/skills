// Post-apply verification in the preview.
// Level 1 (content reached the page): only <style> textContent is read, so a
//   preview can never satisfy it. Waits for hot updates, reloads, re-sends.
// Level 2 (rendered result): with this batch's previews removed, the
//   witness's computed value must equal what was previewed (B, measured at
//   arm time) or, without an arm measurement, the target token's live value.
//   "Verified" also requires that the value actually changed (A != expected).
import { findRootDeclaration, normalizeValue } from "../shared/value-refs.mjs";
import { isLayoutOp, isLiteralOp, type Descriptor, type Draft, type IndexJson } from "../shared/protocol";
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
  /** verified-same: a tokenization whose token has the literal's value; the file changed and the look did not. */
  status: "verified" | "verified-same" | "written-not-observable" | "mismatch" | "timeout";
  expected: string | null;
  actual: string | null;
  /** A catalog key, translated by the panel. */
  reason: string | null;
};

export type VerifyRequest = { applyId: string; armId: string; mode: "apply" | "undo"; expect: Expect; draftIds: string[]; drafts: Draft[] };

const ARMED_KEY = "code-layer/v2/armed";
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
  // A layout keyword is its own computed value; before an added declaration there is nothing to name.
  if (isLayoutOp(draft.op)) return mode === "apply" ? draft.op.toKeyword : draft.op.type === "set-keyword" ? draft.op.fromKeyword : null;
  // After an undo a tokenized row holds its literal again, which is not a token to resolve.
  const token = isLiteralOp(draft.op) ? (mode === "apply" ? draft.op.toToken : null) : mode === "apply" ? draft.op.toToken : draft.op.fromToken;
  if (!token) return null;
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
    if (state === "pending") return { draftId: draft.id, status: "timeout", expected: null, actual: null, reason: "verify.reason.notUpdated" };
    if (state === "not-loaded") return { draftId: draft.id, status: "written-not-observable", expected: null, actual: null, reason: "verify.reason.sheetNotLoaded" };
    const witness = draft.witness;
    if (!witness || draft.storyId !== context.storyId()) {
      return { draftId: draft.id, status: "written-not-observable", expected: null, actual: null, reason: "verify.reason.witnessElsewhere" };
    }
    const element = resolve(witness.descriptor);
    if (!element) return { draftId: draft.id, status: "written-not-observable", expected: null, actual: null, reason: "verify.reason.witnessMissing" };
    const measured = armed?.witnesses.find((w) => w.draftId === draft.id) ?? null;
    const A = measured?.A ?? witness.beforeComputed;
    const expected = request.mode === "apply" ? measured?.B ?? expectedFromTokens(draft, "apply") : A;
    const actual = measure(element, witness.property);
    if (!sameValue(actual, expected)) return { draftId: draft.id, status: "mismatch", expected, actual, reason: null };
    const changed = request.mode === "apply" ? !sameValue(A, expected) : !sameValue(measured?.B ?? expectedFromTokens(draft, "apply"), A);
    if (changed) return { draftId: draft.id, status: "verified", expected, actual, reason: null };
    // A tokenization with a token of the literal's value: the content arrived, the witness is on this page, and its
    // value was the same with previews removed, with previews applied, and after the write. That is its success.
    if (isLiteralOp(draft.op)) return { draftId: draft.id, status: "verified-same", expected, actual, reason: null };
    return { draftId: draft.id, status: "written-not-observable", expected, actual, reason: "verify.reason.noChange" };
  });
  const rank = { mismatch: 3, timeout: 2, "written-not-observable": 1, verified: 0, "verified-same": 0 } as const;
  const worst = items.reduce<VerifyItem["status"]>((w, item) => (rank[item.status] > rank[w] ? item.status : w), "verified");
  // Verified overall; "the look is unchanged" only when that is true of every change.
  const status = rank[worst] > 0 ? worst : items.length > 0 && items.every((item) => item.status === "verified-same") ? "verified-same" : "verified";
  return { status, items };
}
