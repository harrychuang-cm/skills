// Cascade emulation for tracing: which rules match an element, ranked by
// specificity then source order. Heuristic by design; the probe confirms it.
import { scanDeclarations } from "../shared/value-refs.mjs";
import type { CssDecl } from "../shared/protocol";
import { conditionsState, flattenStyleRules, type FlatRule, type SheetIdentity } from "./sheets";

export type Specificity = [number, number, number];

export type SheetEntry = {
  sheet: CSSStyleSheet;
  order: number;
  devId: string | null;
  label: string;
  rules: FlatRule[];
  identity: SheetIdentity | null;
};

export type Candidate = {
  entry: SheetEntry;
  flat: FlatRule;
  specificity: Specificity;
  uncertain: boolean;
};

export type Decl = { property: string; value: string; important: boolean; indexed: CssDecl | null };

/** Split a selector list at top-level commas. */
export function splitSelectorList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

const IDENT = /[A-Za-z0-9_\-\u0080-￿]/;
const LEGACY_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);

function readIdent(text: string, i: number): number {
  while (i < text.length && (IDENT.test(text[i]) || text[i] === "\\")) i += text[i] === "\\" ? 2 : 1;
  return i;
}

function closeParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function maxSpecificity(selectors: string[]): Specificity {
  let best: Specificity = [0, 0, 0];
  for (const selector of selectors) {
    const s = specificity(selector);
    if (compareSpecificity(s, best) > 0) best = s;
  }
  return best;
}

export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function specificity(selector: string): Specificity {
  let a = 0;
  let b = 0;
  let c = 0;
  let i = 0;
  while (i < selector.length) {
    const ch = selector[i];
    if (ch === "\\") {
      i += 2;
    } else if (ch === "#") {
      a += 1;
      i = readIdent(selector, i + 1);
    } else if (ch === ".") {
      b += 1;
      i = readIdent(selector, i + 1);
    } else if (ch === "[") {
      b += 1;
      const end = selector.indexOf("]", i);
      i = end === -1 ? selector.length : end + 1;
    } else if (ch === ":") {
      if (selector[i + 1] === ":") {
        c += 1;
        i = readIdent(selector, i + 2);
        if (selector[i] === "(") i = closeParen(selector, i);
        continue;
      }
      const nameEnd = readIdent(selector, i + 1);
      const name = selector.slice(i + 1, nameEnd).toLowerCase();
      if (selector[nameEnd] === "(") {
        const end = closeParen(selector, nameEnd);
        const inner = selector.slice(nameEnd + 1, end - 1);
        if (name === "where") {
          // zero
        } else if (["is", "not", "has", "matches", "-webkit-any"].includes(name)) {
          const s = maxSpecificity(splitSelectorList(inner));
          a += s[0];
          b += s[1];
          c += s[2];
        } else if (name === "nth-child" || name === "nth-last-child") {
          b += 1;
          const of = inner.search(/\bof\b/i);
          if (of !== -1) {
            const s = maxSpecificity(splitSelectorList(inner.slice(of + 2)));
            a += s[0];
            b += s[1];
            c += s[2];
          }
        } else {
          b += 1;
        }
        i = end;
        continue;
      }
      if (LEGACY_PSEUDO_ELEMENTS.has(name)) c += 1;
      else b += 1;
      i = nameEnd;
    } else if (IDENT.test(ch)) {
      c += 1;
      i = readIdent(selector, i);
    } else {
      i += 1;
    }
  }
  return [a, b, c];
}

/** Highest specificity among the complex selectors of a list that match the element, or null. */
export function matchSpecificity(element: Element, selectorText: string): Specificity | null {
  let best: Specificity | null = null;
  for (const selector of splitSelectorList(selectorText)) {
    let matches = false;
    try {
      matches = element.matches(selector);
    } catch {
      matches = false;
    }
    if (!matches) continue;
    const s = specificity(selector);
    if (!best || compareSpecificity(s, best) > 0) best = s;
  }
  return best;
}

export function collectSheetEntries(identities: Map<string, SheetIdentity>): SheetEntry[] {
  const entries: SheetEntry[] = [];
  Array.from(document.styleSheets).forEach((sheet, order) => {
    let rules: FlatRule[];
    try {
      rules = flattenStyleRules(sheet.cssRules);
    } catch {
      return;
    }
    const owner = sheet.ownerNode as Element | null;
    const devId = owner?.getAttribute?.("data-vite-dev-id") ?? null;
    const identity = devId ? identities.get(devId) ?? null : null;
    const label = devId ? devId.split("/").slice(-3).join("/") : owner?.getAttribute?.("href") ?? "inline <style>";
    entries.push({ sheet, order, devId, label, rules, identity: identity && identity.style.sheet === sheet ? identity : null });
  });
  return entries;
}

/** Matching, active rules for an element, lowest priority first. */
export function candidatesFor(element: Element, entries: SheetEntry[]): Candidate[] {
  const out: Candidate[] = [];
  for (const entry of entries) {
    for (const flat of entry.rules) {
      const state = conditionsState(flat.conditions);
      if (state === "inactive") continue;
      const s = matchSpecificity(element, flat.rule.selectorText);
      if (!s) continue;
      out.push({ entry, flat, specificity: s, uncertain: state === "uncertain" });
    }
  }
  return out.sort(
    (x, y) => compareSpecificity(x.specificity, y.specificity) || x.entry.order - y.entry.order || x.flat.index - y.flat.index,
  );
}

/** Declarations of a candidate rule: from the index when the sheet is verified, else from the CSSOM. */
export function declarationsOf(candidate: Candidate): Decl[] {
  const identity = candidate.entry.identity;
  if (identity?.ok) {
    const indexed = identity.file.rules[candidate.flat.index];
    if (indexed) {
      return indexed.declarations.map((d) => ({ property: d.property, value: d.value, important: d.important, indexed: d }));
    }
  }
  return scanDeclarations(`x{${candidate.flat.rule.style.cssText}}`).map((d) => ({
    property: d.property,
    value: d.value,
    important: d.important,
    indexed: null,
  }));
}
