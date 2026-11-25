// Window capture-phase guards while the mode is active.
// - Pointer: the story never sees presses, clicks, context menus or drags.
//   Wheel and scroll are left alone so the page still scrolls.
// - Keys: every key without Ctrl/Meta/Alt stops here (Shift allowed, F-keys
//   pass), so neither the story nor Storybook's single-key shortcuts react.
//   Chords with Ctrl/Meta/Alt pass untouched.
// - Code Layer's own UI (marked with data-code-layer-ui) is exempt.
import { UI_ATTRIBUTE } from "./overlay";

const BLOCKED_POINTER = [
  "pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick",
  "contextmenu", "dragstart", "selectstart", "submit", "touchstart", "touchend",
];
const MOVE = ["pointermove", "mousemove", "pointerover", "pointerout", "mouseover", "mouseout"];
const KEYS = ["keydown", "keyup", "keypress"];
const PREVENT_DEFAULT_KEYS = new Set(["Escape", " ", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** A primary-button click: where, which click of a multi-click, and whether the platform's primary modifier was held. */
export type ClickInfo = { x: number; y: number; detail: number; primaryModifier: boolean };

export type GuardHandlers = {
  onMove(x: number, y: number): void;
  onClick(info: ClickInfo): void;
  onKeyDown(event: KeyboardEvent): void;
};

/** Command on macOS, Control elsewhere. */
function isMac(): boolean {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad/i.test(platform);
}

function fromOwnUi(event: Event): boolean {
  return event.composedPath().some((node) => node instanceof Element && node.hasAttribute(UI_ATTRIBUTE));
}

export class Guards {
  private attached = false;
  private readonly pointerListener = (event: Event) => this.onPointer(event);
  private readonly keyListener = (event: Event) => this.onKey(event as KeyboardEvent);

  constructor(private readonly handlers: GuardHandlers) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    for (const type of [...BLOCKED_POINTER, ...MOVE]) window.addEventListener(type, this.pointerListener, { capture: true, passive: false });
    for (const type of KEYS) window.addEventListener(type, this.keyListener, { capture: true });
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    for (const type of [...BLOCKED_POINTER, ...MOVE]) window.removeEventListener(type, this.pointerListener, { capture: true });
    for (const type of KEYS) window.removeEventListener(type, this.keyListener, { capture: true });
  }

  private onPointer(event: Event): void {
    if (fromOwnUi(event)) return;
    const pointer = event as PointerEvent;
    if (MOVE.includes(event.type)) {
      if (event.type === "pointermove" || event.type === "mousemove") this.handlers.onMove(pointer.clientX, pointer.clientY);
      event.stopImmediatePropagation();
      return;
    }
    if (event.type === "pointerdown") window.focus();
    if (event.type === "click" && pointer.button === 0) {
      this.handlers.onClick({ x: pointer.clientX, y: pointer.clientY, detail: pointer.detail, primaryModifier: isMac() ? pointer.metaKey : pointer.ctrlKey });
    }
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^F\d{1,2}$/.test(event.key)) return;
    if (fromOwnUi(event)) return;
    event.stopPropagation();
    if (PREVENT_DEFAULT_KEYS.has(event.key)) event.preventDefault();
    if (event.type === "keydown" && !event.repeat) this.handlers.onKeyDown(event);
  }
}
