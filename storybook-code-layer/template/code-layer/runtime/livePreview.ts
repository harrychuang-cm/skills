// Live preview of staged drafts by editing the traced CSSOM rule in place.
// Classification reads only <style> textContent (never the CSSOM we edit):
//   before -> apply the preview;  after -> already in source;  else -> conflict.
// Removing previews from a sheet = re-assigning its own text (rebuilds it).
import { findRootDeclaration, findVarRefs, normalizeValue, replaceComponent, replaceVarName } from "../shared/value-refs.mjs";
import type { Draft, DraftStatus, IndexJson, PreviewStatePayload, SyncPayload } from "../shared/protocol";
import { resolve } from "./descriptor";
import { withFreeze } from "./freeze";
import { flattenStyleRules, resetStyle, ruleAt, styleByDevId, styleTextHash } from "./sheets";

type Params = Record<string, string>;
/** `message` is a catalog key; the manager translates it. */
type Located = { style: HTMLStyleElement | null; state: "before" | "after" | "other" | "missing"; message: string | null; params?: Params; base?: string };
type StatusEntry = { status: DraftStatus; message: string | null; params?: Params };

/**
 * Drafts on one declaration are previewed together: one text with every staged
 * reference and keyword replaced. A declaration that is added has a key of its own.
 */
function declarationKey(draft: Draft): string | null {
  const op = draft.op;
  if (op.type === "rebind-token") return null;
  return `${op.file}#${op.ordinal}#${op.type === "add-declaration" ? "+" : ""}${op.property}`;
}

export class LivePreview {
  private drafts: Draft[] = [];
  private transient: Draft | null = null;
  private compare = false;
  private settled = new Set<string>();
  /** Drafts this preview stopped previewing for an apply in flight. */
  private readonly localSettled = new Set<string>();
  private active = false;
  private rev = 0;
  private readonly applied = new Map<HTMLStyleElement, { sheet: CSSStyleSheet | null; signature: string }>();
  private running: Promise<void> = Promise.resolve();
  private dirty = false;
  statuses = new Map<string, StatusEntry>();

  constructor(
    private readonly getIndex: () => IndexJson | null,
    private readonly getStoryId: () => string | null,
    private readonly emit: (payload: PreviewStatePayload) => void,
  ) {}

  sync(payload: SyncPayload): void {
    this.drafts = payload.drafts;
    this.transient = payload.transient;
    this.compare = payload.compare;
    this.settled = new Set(payload.settled);
    this.rev = payload.rev;
    this.reconcile();
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.reconcile();
  }

  /** Remove every preview now (synchronously), e.g. before measuring a baseline. */
  clearAll(): void {
    for (const style of this.applied.keys()) if (style.isConnected) resetStyle(style);
    this.applied.clear();
  }

  hasPreviews(): boolean {
    return this.applied.size > 0;
  }

  currentDrafts(): Draft[] {
    return [...this.drafts];
  }

  settleLocal(ids: string[]): void {
    for (const id of ids) this.localSettled.add(id);
  }

  unsettleLocal(ids: string[]): void {
    for (const id of ids) this.localSettled.delete(id);
  }

  /** The last error a reconcile pass threw (kept for diagnostics). */
  lastError: string | null = null;

  reconcile(): Promise<void> {
    if (this.dirty) return this.running;
    this.dirty = true;
    // A pass that throws must not wedge the chain: later passes still run.
    this.running = this.running.then(async () => {
      this.dirty = false;
      try {
        await this.run();
      } catch (error) {
        this.lastError = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
        console.warn("[code-layer] live preview pass failed", error);
      }
    });
    return this.running;
  }

  private effectiveDrafts(): Draft[] {
    const skip = (id: string) => this.settled.has(id) || this.localSettled.has(id);
    const map = new Map(this.drafts.filter((d) => !skip(d.id)).map((d) => [d.id, d] as const));
    if (this.transient && !skip(this.transient.id)) map.set(this.transient.id, this.transient);
    return [...map.values()];
  }

  async locate(draft: Draft, index: IndexJson): Promise<Located> {
    const before = normalizeValue(draft.before);
    const after = normalizeValue(draft.after);
    if (draft.op.type === "rebind-token") {
      const style = index.tokens.entry.devId ? styleByDevId(index.tokens.entry.devId) : null;
      if (!style) return { style: null, state: "missing", message: "draft.message.tokenSheetMissing" };
      const decl = findRootDeclaration(style.textContent ?? "", draft.op.token);
      if (!decl || decl === "ambiguous") return { style, state: "other", message: "draft.message.tokenNotUnique" };
      const value = normalizeValue(decl.value);
      if (value === before) return { style, state: "before", message: null };
      if (value === after) return { style, state: "after", message: null };
      return { style, state: "other", message: "draft.message.currentValue", params: { value } };
    }
    const op = draft.op;
    const file = index.css.files.find((f) => f.file === op.file);
    if (!file) return { style: null, state: "other", message: "draft.message.fileNotIndexed" };
    const style = styleByDevId(file.devId);
    if (!style) return { style: null, state: "missing", message: "draft.message.sheetNotLoaded" };
    if ((await styleTextHash(style)) !== file.servedTextHash) {
      return { style, state: "other", message: "draft.message.pageDiffers" };
    }
    const rule = file.rules[op.ordinal];
    if (!rule || rule.selector !== op.selector) return { style, state: "other", message: "draft.message.ruleMoved" };
    const decls = rule.declarations.filter((d) => d.property === op.property);
    const decl = decls[decls.length - 1];
    if (op.type === "add-declaration") {
      // Nothing declares it yet: stage. It reads as written: in source. Anything else was put there by someone.
      if (!decl) return { style, state: "before", message: null, base: "" };
      if (decl.value === op.toKeyword) return { style, state: "after", message: null };
      return { style, state: "other", message: "draft.message.currentValue", params: { value: decl.value } };
    }
    if (!decl) return { style, state: "other", message: "draft.message.declarationGone" };
    if (op.type === "set-keyword") {
      const held = decl.components[op.component]?.text ?? null;
      if (held === op.fromKeyword) return { style, state: "before", message: null, base: decl.value };
      if (held === op.toKeyword) return { style, state: "after", message: null };
      return { style, state: "other", message: "draft.message.currentValue", params: { value: decl.value } };
    }
    // Only the staged reference decides: a sibling reference of the same value may change independently.
    const name = findVarRefs(decl.value)[op.refIndex]?.name ?? null;
    if (name === op.fromToken) return { style, state: "before", message: null, base: decl.value };
    if (name === op.toToken) return { style, state: "after", message: null };
    return { style, state: "other", message: "draft.message.currentValue", params: { value: decl.value } };
  }

  /** Apply the previews of one stylesheet: tokens one by one, declarations once per declaration. */
  private applyAll(style: HTMLStyleElement, drafts: Array<{ draft: Draft; base: string | null }>): Set<string> {
    const failed = new Set<string>();
    if (!style.sheet) return new Set(drafts.map((d) => d.draft.id));
    const declarations = new Map<string, Array<{ draft: Draft; base: string | null }>>();
    for (const entry of drafts) {
      const { draft } = entry;
      if (draft.op.type === "rebind-token") {
        const token = draft.op.token;
        const rules = flattenStyleRules(style.sheet.cssRules).filter((flat) => flat.rule.selectorText === ":root" && flat.rule.style.getPropertyValue(token) !== "");
        if (rules.length !== 1) failed.add(draft.id);
        else rules[0].rule.style.setProperty(token, draft.after);
        continue;
      }
      const key = declarationKey(draft)!;
      declarations.set(key, [...(declarations.get(key) ?? []), entry]);
    }
    for (const group of declarations.values()) {
      const op = group[0].draft.op;
      if (op.type === "rebind-token") continue;
      const rule = ruleAt(style, op.ordinal);
      if (op.type === "add-declaration") {
        // The preview of an added declaration is the property itself; resetting the sheet removes it.
        if (rule) rule.style.setProperty(op.property, op.toKeyword);
        else for (const { draft } of group) failed.add(draft.id);
        continue;
      }
      let text = group[0].base;
      if (!rule || text === null) {
        for (const { draft } of group) failed.add(draft.id);
        continue;
      }
      // Same replacements as the server: the name of the refIndex-th var(), the keyword of a component, nothing else.
      for (const { draft } of group) {
        try {
          if (draft.op.type === "rebind-declaration") text = replaceVarName(text, draft.op.refIndex, draft.op.fromToken, draft.op.toToken);
          else if (draft.op.type === "set-keyword") text = replaceComponent(text, draft.op.component, draft.op.fromKeyword, draft.op.toKeyword);
        } catch {
          failed.add(draft.id);
        }
      }
      rule.style.setProperty(op.property, text, rule.style.getPropertyPriority(op.property));
    }
    return failed;
  }

  private async run(): Promise<void> {
    const index = this.getIndex();
    const statuses = new Map<string, StatusEntry>();
    const desired = new Map<HTMLStyleElement, Array<{ draft: Draft; base: string | null }>>();
    const paused = !this.active || this.compare;
    for (const draft of this.effectiveDrafts()) {
      if (!index) {
        statuses.set(draft.id, { status: "pending-load", message: "draft.message.indexLoading" });
        continue;
      }
      const located = await this.locate(draft, index);
      if (located.state === "missing" || !located.style) {
        statuses.set(draft.id, { status: "pending-load", message: located.message, params: located.params });
        continue;
      }
      if (located.state === "after") {
        statuses.set(draft.id, { status: "in-source", message: null });
        continue;
      }
      if (located.state === "other") {
        statuses.set(draft.id, { status: "conflict", message: located.message, params: located.params });
        continue;
      }
      if (paused) {
        statuses.set(draft.id, { status: "paused", message: this.compare ? "draft.message.comparing" : "draft.message.inactive" });
        continue;
      }
      const list = desired.get(located.style) ?? [];
      list.push({ draft, base: located.base ?? null });
      desired.set(located.style, list);
      statuses.set(draft.id, { status: "previewing", message: null });
    }

    const styles = new Set([...this.applied.keys(), ...desired.keys()]);
    for (const style of styles) {
      const want = desired.get(style) ?? [];
      const signature = want.map(({ draft }) => `${draft.id}=${draft.after}`).sort().join("|");
      const current = this.applied.get(style);
      if (current && style.isConnected && current.sheet === style.sheet && current.signature === signature) continue;
      if (current && style.isConnected) resetStyle(style);
      this.applied.delete(style);
      if (!style.isConnected || want.length === 0) continue;
      for (const id of this.applyAll(style, want)) statuses.set(id, { status: "conflict", message: "draft.message.ruleNotFound" });
      this.applied.set(style, { sheet: style.sheet, signature });
    }

    const storyId = this.getStoryId();
    for (const draft of this.effectiveDrafts()) {
      if (statuses.get(draft.id)?.status !== "previewing" || !draft.witness || draft.storyId !== storyId) continue;
      const element = resolve(draft.witness.descriptor);
      if (!element) continue;
      const now = withFreeze(element, () => getComputedStyle(element).getPropertyValue(draft.witness!.property).trim());
      if (now === draft.witness.beforeComputed) {
        statuses.set(draft.id, { status: "no-visible-effect", message: "draft.message.noVisibleEffect" });
      }
    }

    this.statuses = statuses;
    this.emit({ rev: this.rev, items: [...statuses].map(([id, entry]) => ({ id, ...entry })) });
  }
}
