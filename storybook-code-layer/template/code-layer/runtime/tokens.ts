// Token chains as the page actually resolves them: for each link, which rule
// wins on :root (or the declaring element), compared with where the index
// says the token lives. A theme rule that wins marks the link "overridden".
import type { ChainLink, IndexJson, TokenItem } from "../shared/protocol";
import { normalizeValue } from "../shared/value-refs.mjs";
import { candidatesFor, type SheetEntry } from "./cascade";

export type EffectiveDecl = { entry: SheetEntry | null; selector: string; value: string };

/** Marks a value that comes from an element's style attribute (translated where it is shown). */
export const STYLE_ATTRIBUTE = "style-attribute";

export class TokenResolver {
  private readonly rootCache = new Map<string, EffectiveDecl | null>();
  private rootCandidates: ReturnType<typeof candidatesFor> | null = null;

  constructor(
    private readonly index: IndexJson,
    readonly tokens: Map<string, TokenItem>,
    private readonly entries: SheetEntry[],
  ) {}

  effectiveOn(element: Element, name: string): EffectiveDecl | null {
    const inline = (element as HTMLElement).style?.getPropertyValue?.(name);
    if (inline) return { entry: null, selector: STYLE_ATTRIBUTE, value: inline.trim() };
    const candidates =
      element === document.documentElement
        ? (this.rootCandidates ??= candidatesFor(document.documentElement, this.entries))
        : candidatesFor(element, this.entries);
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const value = candidates[i].flat.rule.style.getPropertyValue(name);
      if (value !== "") return { entry: candidates[i].entry, selector: candidates[i].flat.rule.selectorText, value: value.trim() };
    }
    return null;
  }

  effectiveOnRoot(name: string): EffectiveDecl | null {
    if (!this.rootCache.has(name)) this.rootCache.set(name, this.effectiveOn(document.documentElement, name));
    return this.rootCache.get(name) ?? null;
  }

  /** A component or ancestor (below <html>) re-declares the custom property. */
  scopedOverride(element: Element, name: string): EffectiveDecl | null {
    for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) {
      const found = this.effectiveOn(node, name);
      if (found) return found;
    }
    return null;
  }

  chain(name: string): ChainLink[] {
    const links: ChainLink[] = [];
    const first = this.tokens.get(name);
    const names = [name, ...(first?.chain ?? [])];
    const live = getComputedStyle(document.documentElement);
    for (const linkName of names) {
      const token = this.tokens.get(linkName);
      if (!token) {
        links.push({ name: linkName, tier: null, file: null, line: null, value: null, status: "not-a-token", overriddenBy: null });
        break;
      }
      const effective = this.effectiveOnRoot(linkName);
      let status: ChainLink["status"] = "ok";
      let overriddenBy: ChainLink["overriddenBy"] = null;
      if (token.rootless || !effective) {
        status = "undefined";
      } else {
        const devId = effective.entry?.devId ?? "";
        const expected =
          token.source === "tier" ? devId === this.index.tokens.entry.devId : devId.endsWith(`/${token.file}`);
        if (!expected || normalizeValue(effective.selector) !== ":root") {
          status = "overridden";
          const known = token.shadowedBy.find((s) => s.selector === normalizeValue(effective.selector));
          overriddenBy = known
            ? { file: known.file, line: known.line, selector: known.selector }
            : { file: effective.entry?.label ?? STYLE_ATTRIBUTE, line: null, selector: effective.selector };
        }
      }
      links.push({
        name: linkName,
        tier: token.tier,
        file: token.file,
        line: token.line,
        value: live.getPropertyValue(linkName).trim() || null,
        status,
        overriddenBy,
      });
      if (status === "undefined") break;
    }
    return links;
  }

  /** Live values of every indexed token, for picker swatches. */
  liveValues(): Record<string, string> {
    const live = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const name of this.tokens.keys()) out[name] = live.getPropertyValue(name).trim();
    return out;
  }
}
