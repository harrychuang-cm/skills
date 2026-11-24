// Page stylesheets: the shared ordinal walk, and proof that a <style> on the
// page is exactly the file the server indexed (textContent hash + rule count).
// textContent is never affected by CSSOM edits, so identity checks stay honest
// while previews are applied.
import { servedTextHash } from "../shared/hash.mjs";
import type { CssFileInfo } from "../shared/protocol";

export type Condition = { type: "media" | "supports" | "uncertain"; text: string };
export type FlatRule = { rule: CSSStyleRule; conditions: Condition[]; index: number };

/** Same walk as the server: only style rules, depth first, parent first; every grouping rule entered; keyframes skipped. */
export function flattenStyleRules(list: CSSRuleList, conditions: Condition[] = [], out: FlatRule[] = []): FlatRule[] {
  for (const rule of Array.from(list)) {
    if (rule instanceof CSSStyleRule) {
      out.push({ rule, conditions, index: out.length });
      const nested = (rule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
      if (nested && nested.length > 0) flattenStyleRules(nested, conditions, out);
    } else if (typeof CSSKeyframesRule !== "undefined" && rule instanceof CSSKeyframesRule) {
      continue;
    } else if (rule instanceof CSSMediaRule) {
      flattenStyleRules(rule.cssRules, [...conditions, { type: "media", text: rule.conditionText ?? rule.media.mediaText }], out);
    } else if (typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule) {
      flattenStyleRules(rule.cssRules, [...conditions, { type: "supports", text: rule.conditionText }], out);
    } else if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) {
      flattenStyleRules((rule as CSSGroupingRule).cssRules, [...conditions, { type: "uncertain", text: rule.constructor.name }], out);
    }
  }
  return out;
}

export function conditionsState(conditions: Condition[]): "active" | "inactive" | "uncertain" {
  let uncertain = false;
  for (const condition of conditions) {
    if (condition.type === "media") {
      if (!window.matchMedia(condition.text).matches) return "inactive";
    } else if (condition.type === "supports") {
      try {
        if (!CSS.supports(condition.text)) return "inactive";
      } catch {
        uncertain = true;
      }
    } else {
      uncertain = true;
    }
  }
  return uncertain ? "uncertain" : "active";
}

const hashCache = new WeakMap<HTMLStyleElement, { text: string; hash: string }>();

export async function styleTextHash(style: HTMLStyleElement): Promise<string> {
  const text = style.textContent ?? "";
  const cached = hashCache.get(style);
  if (cached && cached.text === text) return cached.hash;
  const hash = await servedTextHash(text);
  hashCache.set(style, { text, hash });
  return hash;
}

export function styleByDevId(devId: string): HTMLStyleElement | null {
  for (const element of Array.from(document.querySelectorAll("style[data-vite-dev-id]"))) {
    if (element.getAttribute("data-vite-dev-id") === devId) return element as HTMLStyleElement;
  }
  return null;
}

export type SheetIdentity = {
  file: CssFileInfo;
  style: HTMLStyleElement;
  ok: boolean;
  reason: string | null;
};

export async function verifySheet(file: CssFileInfo): Promise<SheetIdentity | null> {
  const style = styleByDevId(file.devId);
  if (!style || !style.sheet) return null;
  if (!file.identityEligible) return { file, style, ok: false, reason: file.reason ?? "identity-ineligible" };
  const hash = await styleTextHash(style);
  if (hash !== file.servedTextHash) return { file, style, ok: false, reason: "text-mismatch" };
  const count = flattenStyleRules(style.sheet.cssRules).length;
  if (count !== file.styleRuleCount) return { file, style, ok: false, reason: "rule-count-mismatch" };
  return { file, style, ok: true, reason: null };
}

/** The CSSOM rule with the given shared ordinal in a verified sheet. */
export function ruleAt(style: HTMLStyleElement, ordinal: number): CSSStyleRule | null {
  if (!style.sheet) return null;
  return flattenStyleRules(style.sheet.cssRules)[ordinal]?.rule ?? null;
}

/** Remove every CSSOM edit on a <style> by re-assigning its own text (rebuilds the sheet). */
export function resetStyle(style: HTMLStyleElement): void {
  const text = style.textContent ?? "";
  style.textContent = text;
}
