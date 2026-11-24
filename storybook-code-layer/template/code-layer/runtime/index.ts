// Preview runtime controller. A singleton per main preview frame; dormant in
// any other frame (nested route previews, iframe.html opened directly).
import { buildReference } from "../shared/reference";
import {
  API_BASE,
  EVENTS,
  GLOBAL_KEY,
  type Descriptor,
  type EffectiveState,
  type ElementTrace,
  type IndexJson,
  type PreviewStatePayload,
  type SelectionPayload,
  type SyncPayload,
} from "../shared/protocol";
import { emitToManager, getChannel, onManager, onOwnCore, type Channel } from "./channel";
import { describe, labelFor, resolve } from "./descriptor";
import { Guards } from "./events";
import { isMainPreviewFrame, storyRoot } from "./frame";
import { pickAt, selectionTarget } from "./hitTest";
import { LivePreview } from "./livePreview";
import { Overlay } from "./overlay";
import { flattenStyleRules } from "./sheets";
import { specificity } from "./cascade";
import { buildContext, probeRow, traceElement, type TraceContext } from "./tracer";
import { measure, runVerification, saveArmed, type VerifyRequest, type Witness } from "./verify";

type Globals = Record<string, unknown>;
type AnyPayload = Record<string, unknown> | undefined;

const RUNTIME_KEY = "__CODE_LAYER_RUNTIME__";

/** Vite-managed style texts changed (our own preview resets keep the same text). */
const styleTexts = new WeakMap<Element, string>();
function styleTextsChanged(): boolean {
  let changed = false;
  for (const style of Array.from(document.querySelectorAll("style[data-vite-dev-id]"))) {
    const text = style.textContent ?? "";
    if (styleTexts.get(style) !== text) {
      styleTexts.set(style, text);
      changed = true;
    }
  }
  return changed;
}

export class Runtime {
  readonly channel: Channel = getChannel();
  globals: Globals = {};
  storyId: string | null = null;
  viewMode = "story";
  index: IndexJson | null = null;
  indexState: "loading" | "ok" | "error" = "loading";
  serverReadOnly = false;
  effective: EffectiveState = { state: "off", reason: null };
  selected: Element | null = null;
  selectedDescriptor: Descriptor | null = null;
  lastTrace: ElementTrace | null = null;
  context: TraceContext | null = null;
  private overlay: Overlay | null = null;
  private guards: Guards | null = null;
  private active = false;
  private disposers: Array<() => void> = [];
  private observer: MutationObserver | null = null;
  private refreshTimer = 0;
  private moveFrame = 0;
  private pendingMove: { x: number; y: number } | null = null;
  private readonly storyMeta = new Map<string, { title: string; name: string }>();
  private traceSeq = 0;
  readonly live = new LivePreview(
    () => this.index,
    () => this.storyId,
    (payload: PreviewStatePayload) => emitToManager(this.channel, EVENTS.previewState, payload),
  );
  /** Exposed for the scripted browser checks. */
  readonly debug = { flattenStyleRules, specificity };

  get prefixes(): string[] {
    return this.index?.components?.classPrefixes ?? [];
  }

  start(): void {
    const c = this.channel;
    this.disposers.push(
      onOwnCore(c, "globalsUpdated", (p) => this.setGlobals((p as AnyPayload)?.globals as Globals)),
      onOwnCore(c, "setGlobals", (p) => this.setGlobals((p as AnyPayload)?.globals as Globals)),
      onOwnCore(c, "currentStoryWasSet", (p) =>
        this.setStory(((p as AnyPayload)?.storyId as string) ?? null, ((p as AnyPayload)?.viewMode as string) ?? "story"),
      ),
      onOwnCore(c, "storyRenderPhaseChanged", (p) => {
        const phase = (p as AnyPayload)?.newPhase;
        if (phase === "completing" || phase === "completed") this.afterRender();
      }),
      onOwnCore(c, "storyRendered", () => this.afterRender()),
      onOwnCore(c, "docsRendered", () => {
        this.viewMode = "docs";
        this.evaluate();
      }),
      onManager<{ clear?: boolean; descriptor?: Descriptor }>(c, EVENTS.select, (p) => {
        if (p.clear) this.clearSelection("cleared");
        else if (p.descriptor) this.restoreFrom(p.descriptor, "restore");
      }),
      onManager<SyncPayload>(c, EVENTS.sync, (p) => this.live.sync(p)),
      onManager<{ armId: string; draftIds: string[] }>(c, EVENTS.applyArm, (p) => void this.arm(p.armId, p.draftIds)),
      onManager<{ armId: string; draftIds: string[] }>(c, EVENTS.applyCancel, (p) => {
        this.live.unsettleLocal(p.draftIds);
        void this.live.reconcile();
      }),
      onManager<VerifyRequest>(c, EVENTS.applyWritten, (p) => void this.verify(p)),
      onManager<{ rowId: string; traceId: string }>(c, EVENTS.probe, (p) => {
        void this.probe(p.rowId).then((result) =>
          emitToManager(c, EVENTS.probeResult, { rowId: p.rowId, traceId: p.traceId, result }),
        );
      }),
    );
    const globals = (c.last("globalsUpdated") ?? c.last("setGlobals")) as AnyPayload[] | undefined;
    if (globals?.[0]?.globals) this.globals = globals[0].globals as Globals;
    const story = c.last("currentStoryWasSet") as AnyPayload[] | undefined;
    if (story?.[0]) {
      this.storyId = (story[0].storyId as string) ?? null;
      this.viewMode = (story[0].viewMode as string) ?? "story";
    }
    this.observer = new MutationObserver((records) => {
      if (records.some((r) => r.type === "attributes")) this.evaluate();
      if (records.some((r) => r.type !== "attributes") && styleTextsChanged()) this.scheduleRefresh();
    });
    styleTextsChanged();
    this.observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    this.observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    const hot = import.meta.hot;
    if (hot) {
      const onUpdate = () => this.scheduleRefresh();
      hot.on("vite:afterUpdate", onUpdate);
      this.disposers.push(() => hot.off?.("vite:afterUpdate", onUpdate));
    }
    emitToManager(c, EVENTS.ready, {});
    void this.loadIndex();
    this.evaluate();
  }

  destroy(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.observer?.disconnect();
    clearTimeout(this.refreshTimer);
    this.deactivate();
  }

  // ---- index ---------------------------------------------------------------

  async loadIndex(): Promise<void> {
    try {
      const [indexResponse, stateResponse] = await Promise.all([
        fetch(`${API_BASE}/index`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`${API_BASE}/state`, { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (!indexResponse.ok) throw new Error(`index ${indexResponse.status}`);
      this.index = (await indexResponse.json()) as IndexJson;
      const state = stateResponse.ok ? ((await stateResponse.json()) as { readOnly?: { active?: boolean } }) : null;
      this.serverReadOnly = Boolean(state?.readOnly?.active);
      this.indexState = "ok";
    } catch {
      this.index = null;
      this.indexState = "error";
    }
    this.context = null;
    this.evaluate(true);
    void this.live.reconcile();
    if (this.active) {
      this.emitTokenValues();
      if (this.selectedDescriptor) this.restoreFrom(this.selectedDescriptor, "hmr");
    }
  }

  scheduleRefresh(): void {
    this.context = null;
    void this.live.reconcile();
    clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => void this.loadIndex(), 150);
  }

  // ---- effective state -----------------------------------------------------

  computeEffective(): EffectiveState {
    if (this.globals[GLOBAL_KEY] !== true) return { state: "off", reason: null };
    if (this.viewMode !== "story") return { state: "suspended", reason: "docs" };
    if (this.globals.figmaExport === "on") return { state: "suspended", reason: "figma-export" };
    if (typeof this.globals.prototypeMode === "string" && this.globals.prototypeMode !== "story") {
      return { state: "suspended", reason: "prototype-mode" };
    }
    if (storyRoot()?.querySelector(".prototype-inspector")) return { state: "suspended", reason: "prototype-mode" };
    if (document.body.classList.contains("sb-show-errordisplay")) return { state: "suspended", reason: "story-error" };
    if (this.indexState === "error") return { state: "suspended", reason: "index-unavailable" };
    return { state: "active", reason: null };
  }

  evaluate(forceStatus = false): void {
    const next = this.computeEffective();
    const changed = next.state !== this.effective.state || next.reason !== this.effective.reason;
    this.effective = next;
    if (next.state === "active") this.activate();
    else this.deactivate();
    if (changed || forceStatus) this.emitStatus();
  }

  private activate(): void {
    if (this.active) return;
    this.active = true;
    this.overlay ??= new Overlay(() => void this.copyReference());
    this.guards ??= new Guards({
      onMove: (x, y) => this.onMove(x, y),
      onClick: (x, y) => this.onClick(x, y),
      onKeyDown: (event) => this.onKeyDown(event),
    });
    this.overlay.mount();
    this.guards.attach();
    this.live.setActive(true);
    this.emitTokenValues();
    if (this.selectedDescriptor) this.restoreFrom(this.selectedDescriptor, "restore");
  }

  private deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.live.setActive(false);
    this.guards?.detach();
    this.overlay?.unmount();
    cancelAnimationFrame(this.moveFrame);
  }

  emitStatus(): void {
    emitToManager(this.channel, EVENTS.status, {
      effective: this.effective,
      storyId: this.storyId,
      indexRevision: this.index?.revision ?? null,
      serverReadOnly: this.serverReadOnly,
    });
  }

  emitTokenValues(): void {
    if (!this.index) return;
    const live = getComputedStyle(document.documentElement);
    const values: Record<string, string> = {};
    for (const token of this.index.tokens.items) values[token.name] = live.getPropertyValue(token.name).trim();
    emitToManager(this.channel, EVENTS.tokenValues, { revision: this.index.revision, values });
  }

  // ---- story & globals -----------------------------------------------------

  private setGlobals(globals: Globals | undefined): void {
    if (!globals) return;
    this.globals = globals;
    this.context = null;
    this.evaluate();
    if (this.active) {
      this.emitTokenValues();
      if (this.selectedDescriptor) this.restoreFrom(this.selectedDescriptor, "restore");
    }
  }

  private setStory(storyId: string | null, viewMode: string): void {
    const changed = storyId !== this.storyId;
    if (changed) {
      this.storyId = storyId;
      this.clearSelection("story-change");
    }
    this.viewMode = viewMode;
    this.evaluate(changed);
  }

  private afterRender(): void {
    this.context = null;
    this.evaluate();
    if (this.active && this.selectedDescriptor) this.restoreFrom(this.selectedDescriptor, "hmr");
  }

  private async storyMetaFor(storyId: string | null): Promise<{ title: string; name: string } | null> {
    if (!storyId) return null;
    if (!this.storyMeta.has(storyId)) {
      try {
        const response = await fetch("/index.json", { credentials: "same-origin" });
        const json = (await response.json()) as { entries: Record<string, { title: string; name: string }> };
        for (const [id, entry] of Object.entries(json.entries)) this.storyMeta.set(id, { title: entry.title, name: entry.name });
      } catch {
        return null;
      }
    }
    return this.storyMeta.get(storyId) ?? null;
  }

  // ---- selection -----------------------------------------------------------

  private onMove(x: number, y: number): void {
    this.pendingMove = { x, y };
    if (this.moveFrame) return;
    this.moveFrame = requestAnimationFrame(() => {
      this.moveFrame = 0;
      const move = this.pendingMove;
      if (!move || !this.overlay) return;
      const hit = pickAt(move.x, move.y, this.overlay.host);
      const target = hit ? selectionTarget(hit) : null;
      this.overlay.setHover(target, target ? labelFor(target, this.prefixes) : "");
    });
  }

  private onClick(x: number, y: number): void {
    if (!this.overlay) return;
    const hit = pickAt(x, y, this.overlay.host);
    if (!hit) {
      this.clearSelection("cleared");
      return;
    }
    this.select(selectionTarget(hit), "pointer");
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") this.clearSelection("cleared");
  }

  select(element: Element, reason: SelectionPayload["reason"]): void {
    this.selected = element;
    this.selectedDescriptor = describe(element, this.storyId, this.prefixes);
    const html = element as HTMLElement;
    const width = html.offsetWidth ?? Math.round(element.getBoundingClientRect().width);
    const height = html.offsetHeight ?? Math.round(element.getBoundingClientRect().height);
    this.overlay?.setSelection(element, labelFor(element, this.prefixes), `${width} × ${height}`);
    void this.traceSelected(reason);
  }

  clearSelection(reason: SelectionPayload["reason"]): void {
    const had = this.selected !== null || this.selectedDescriptor !== null;
    this.selected = null;
    this.selectedDescriptor = null;
    this.lastTrace = null;
    this.traceSeq += 1;
    this.overlay?.setSelection(null, "", "");
    if (had) emitToManager(this.channel, EVENTS.selection, { trace: null, reason });
  }

  private restoreFrom(descriptor: Descriptor, reason: SelectionPayload["reason"]): void {
    const element = resolve(descriptor);
    if (element) {
      this.select(element, reason);
      return;
    }
    const root = storyRoot();
    const rendered = !!root && root.childElementCount > 0 && !document.body.classList.contains("sb-show-preparing-story");
    if (!rendered || (descriptor.storyId !== null && descriptor.storyId !== this.storyId)) {
      // The story is not on screen yet: keep the descriptor and retry after render.
      this.selected = null;
      this.selectedDescriptor = descriptor;
      return;
    }
    this.clearSelection("lost");
  }

  async ensureContext(): Promise<TraceContext | null> {
    if (!this.index) return null;
    if (!this.context) this.context = await buildContext(this.index);
    return this.context;
  }

  private async traceSelected(reason: SelectionPayload["reason"]): Promise<void> {
    const sequence = ++this.traceSeq;
    const element = this.selected;
    if (!element || !this.index) return;
    const context = await this.ensureContext();
    const meta = await this.storyMetaFor(this.storyId);
    if (sequence !== this.traceSeq || !context || element !== this.selected) return;
    const trace = traceElement(element, context, {
      storyId: this.storyId,
      storyTitle: meta?.title ?? null,
      storyName: meta?.name ?? null,
      traceId: `t${sequence}`,
    });
    this.lastTrace = trace;
    emitToManager(this.channel, EVENTS.selection, { trace, reason });
  }

  /** The last text handed to the clipboard (kept for scripted checks). */
  lastCopied: string | null = null;

  async copyReference(): Promise<void> {
    if (!this.lastTrace) return;
    const text = buildReference(this.lastTrace);
    this.lastCopied = text;
    try {
      await navigator.clipboard.writeText(text);
      this.overlay?.showToast("已複製物件參照");
    } catch {
      emitToManager(this.channel, EVENTS.request, { action: "copy", text });
      this.overlay?.showToast("已交給面板複製物件參照");
    }
  }

  /** Before an apply: measure each witness with previews on (B) and off (A). */
  private async arm(armId: string, draftIds: string[]): Promise<void> {
    const drafts = this.live.currentDrafts().filter((d) => draftIds.includes(d.id));
    const targets = drafts.map((draft) => ({
      draft,
      element: draft.witness && draft.storyId === this.storyId ? resolve(draft.witness.descriptor) : null,
    }));
    const previewed = new Map<string, string>();
    for (const { draft, element } of targets) if (element && draft.witness) previewed.set(draft.id, measure(element, draft.witness.property));
    this.live.settleLocal(draftIds);
    this.live.clearAll();
    const witnesses: Witness[] = [];
    for (const { draft, element } of targets) {
      if (!element || !draft.witness) continue;
      witnesses.push({
        draftId: draft.id,
        storyId: draft.storyId,
        descriptor: draft.witness.descriptor,
        property: draft.witness.property,
        A: measure(element, draft.witness.property),
        B: previewed.get(draft.id) ?? "",
      });
    }
    void this.live.reconcile();
    saveArmed({ armId, draftIds, drafts, witnesses, armedAt: Date.now() });
    emitToManager(this.channel, EVENTS.applyArmed, { armId, witnesses: witnesses.length });
  }

  private async waitReady(timeout: number): Promise<void> {
    const started = Date.now();
    for (;;) {
      const root = storyRoot();
      const rendered = !!root && root.childElementCount > 0 && !document.body.classList.contains("sb-show-preparing-story");
      if ((this.index && rendered) || Date.now() - started > timeout) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async verify(request: VerifyRequest): Promise<void> {
    await this.waitReady(15000);
    const result = await runVerification(request, {
      index: () => this.index,
      storyId: () => this.storyId,
      settleAndClear: async () => {
        this.live.settleLocal(request.draftIds);
        await this.live.reconcile();
      },
      onSoftTimeout: () => emitToManager(this.channel, EVENTS.verifyProgress, { applyId: request.applyId, message: "等待樣式更新…" }),
    });
    emitToManager(this.channel, EVENTS.verifyResult, { applyId: request.applyId, mode: request.mode, ...result });
  }

  /** Debug helper used by the browser checks. */
  async probe(rowId: string): Promise<string> {
    const context = await this.ensureContext();
    const row = this.lastTrace?.rows.find((r) => r.id === rowId);
    if (!context || !row || !this.selected) return "no-trace";
    return probeRow(this.selected, rowId, row.verdict, context);
  }
}

export function bootRuntime(): Runtime | null {
  if (!isMainPreviewFrame()) return null;
  const scope = globalThis as unknown as Record<string, Runtime | undefined>;
  const existing = scope[RUNTIME_KEY];
  if (existing) return existing;
  const runtime = new Runtime();
  scope[RUNTIME_KEY] = runtime;
  (window as unknown as Record<string, unknown>).__CODE_LAYER__ = runtime;
  runtime.start();
  return runtime;
}

export function disposeRuntime(): void {
  const scope = globalThis as unknown as Record<string, Runtime | undefined>;
  scope[RUNTIME_KEY]?.destroy();
  delete scope[RUNTIME_KEY];
}
