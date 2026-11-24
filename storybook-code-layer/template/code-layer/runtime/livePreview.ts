// Live preview of staged drafts by editing the traced CSSOM rule in place.
// Classification reads only <style> textContent (never the CSSOM we edit):
//   before -> apply the preview;  after -> already in source;  else -> conflict.
// Removing previews from a sheet = re-assigning its own text (rebuilds it).
import { findRootDeclaration, normalizeValue } from "../shared/value-refs.mjs";
import type { Draft, DraftStatus, IndexJson, PreviewStatePayload, SyncPayload } from "../shared/protocol";
import { resolve } from "./descriptor";
import { withFreeze } from "./freeze";
import { flattenStyleRules, resetStyle, ruleAt, styleByDevId, styleTextHash } from "./sheets";

type Located = { style: HTMLStyleElement | null; state: "before" | "after" | "other" | "missing"; message: string | null };
type StatusEntry = { status: DraftStatus; message: string | null };

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
      if (!style) return { style: null, state: "missing", message: "token 樣式表尚未載入" };
      const decl = findRootDeclaration(style.textContent ?? "", draft.op.token);
      if (!decl || decl === "ambiguous") return { style, state: "other", message: "頁面上的 token 檔找不到唯一的宣告" };
      const value = normalizeValue(decl.value);
      if (value === before) return { style, state: "before", message: null };
      if (value === after) return { style, state: "after", message: null };
      return { style, state: "other", message: `目前的值是 ${value}` };
    }
    const op = draft.op;
    const file = index.css.files.find((f) => f.file === op.file);
    if (!file) return { style: null, state: "other", message: "索引中沒有這個檔案" };
    const style = styleByDevId(file.devId);
    if (!style) return { style: null, state: "missing", message: "這個元件的 CSS 尚未載入到頁面" };
    if ((await styleTextHash(style)) !== file.servedTextHash) {
      return { style, state: "other", message: "頁面 CSS 與索引不一致（等待更新）" };
    }
    const rule = file.rules[op.ordinal];
    if (!rule || rule.selector !== op.selector) return { style, state: "other", message: "規則位置已變更" };
    const decls = rule.declarations.filter((d) => d.property === op.property);
    const decl = decls[decls.length - 1];
    if (!decl) return { style, state: "other", message: "宣告已不存在" };
    const value = normalizeValue(decl.value);
    if (value === before) return { style, state: "before", message: null };
    if (value === after) return { style, state: "after", message: null };
    return { style, state: "other", message: `目前的值是 ${value}` };
  }

  private applyOne(style: HTMLStyleElement, draft: Draft): boolean {
    if (!style.sheet) return false;
    if (draft.op.type === "rebind-token") {
      const token = draft.op.token;
      const rules = flattenStyleRules(style.sheet.cssRules).filter(
        (flat) => flat.rule.selectorText === ":root" && flat.rule.style.getPropertyValue(token) !== "",
      );
      if (rules.length !== 1) return false;
      rules[0].rule.style.setProperty(token, draft.after);
      return true;
    }
    const rule = ruleAt(style, draft.op.ordinal);
    if (!rule) return false;
    rule.style.setProperty(draft.op.property, draft.after, rule.style.getPropertyPriority(draft.op.property));
    return true;
  }

  private async run(): Promise<void> {
    const index = this.getIndex();
    const statuses = new Map<string, StatusEntry>();
    const desired = new Map<HTMLStyleElement, Draft[]>();
    const paused = !this.active || this.compare;
    for (const draft of this.effectiveDrafts()) {
      if (!index) {
        statuses.set(draft.id, { status: "pending-load", message: "索引載入中" });
        continue;
      }
      const located = await this.locate(draft, index);
      if (located.state === "missing" || !located.style) {
        statuses.set(draft.id, { status: "pending-load", message: located.message });
        continue;
      }
      if (located.state === "after") {
        statuses.set(draft.id, { status: "in-source", message: null });
        continue;
      }
      if (located.state === "other") {
        statuses.set(draft.id, { status: "conflict", message: located.message });
        continue;
      }
      if (paused) {
        statuses.set(draft.id, { status: "paused", message: this.compare ? "按住對照中" : "Code Layer 未啟用" });
        continue;
      }
      const list = desired.get(located.style) ?? [];
      list.push(draft);
      desired.set(located.style, list);
      statuses.set(draft.id, { status: "previewing", message: null });
    }

    const styles = new Set([...this.applied.keys(), ...desired.keys()]);
    for (const style of styles) {
      const want = desired.get(style) ?? [];
      const signature = want.map((d) => `${d.id}=${d.after}`).sort().join("|");
      const current = this.applied.get(style);
      if (current && style.isConnected && current.sheet === style.sheet && current.signature === signature) continue;
      if (current && style.isConnected) resetStyle(style);
      this.applied.delete(style);
      if (!style.isConnected || want.length === 0) continue;
      for (const draft of want) {
        if (!this.applyOne(style, draft)) statuses.set(draft.id, { status: "conflict", message: "找不到要預覽的規則" });
      }
      this.applied.set(style, { sheet: style.sheet, signature });
    }

    const storyId = this.getStoryId();
    for (const draft of this.effectiveDrafts()) {
      if (statuses.get(draft.id)?.status !== "previewing" || !draft.witness || draft.storyId !== storyId) continue;
      const element = resolve(draft.witness.descriptor);
      if (!element) continue;
      const now = withFreeze(element, () => getComputedStyle(element).getPropertyValue(draft.witness!.property).trim());
      if (now === draft.witness.beforeComputed) {
        statuses.set(draft.id, { status: "no-visible-effect", message: "預覽沒有改變這個元素的計算值" });
      }
    }

    this.statuses = statuses;
    this.emit({ rev: this.rev, items: [...statuses].map(([id, entry]) => ({ id, ...entry })) });
  }
}
