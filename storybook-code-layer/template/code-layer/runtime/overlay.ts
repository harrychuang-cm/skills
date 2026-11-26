// Selection chrome: a popover (top layer) with an open shadow root holding a
// transparent shield, the hover and selection boxes and their labels.
// The host is a child of <body> on purpose: it hides while Storybook shows
// "preparing" and freezes while a manager modal makes <body> inert.
// Nothing is inserted into the story root.

import { t } from "../shared/i18n";

const CHROME_ATTRIBUTE = "data-code-layer-chrome";
export const UI_ATTRIBUTE = "data-code-layer-ui";
const ACCENT = "#0D99FF";

const STYLE = `
:host { all: initial; }
.shield { position: fixed; inset: 0; cursor: default; pointer-events: auto; background: transparent; }
.box { position: fixed; left: 0; top: 0; pointer-events: none; box-sizing: border-box; transform-origin: center center; display: none; }
.hover { border: 1px solid ${ACCENT}; }
.select { border: 2px solid ${ACCENT}; }
.highlight { border: 1px dashed ${ACCENT}; background: rgba(13, 153, 255, .08); }
.label { position: fixed; left: 0; top: 0; display: none; pointer-events: none; align-items: center; gap: 6px;
  font: 600 11px/16px system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; background: ${ACCENT};
  padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
.label .size { font-weight: 400; opacity: .85; }
.select-label { pointer-events: auto; }
.select-label button { all: unset; cursor: pointer; font: inherit; color: #fff; padding: 0 0 0 6px;
  border-left: 1px solid rgba(255,255,255,.45); }
.select-label button:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
.select-label button[hidden] { display: none; }
.toast { position: fixed; right: 12px; bottom: 12px; display: none; pointer-events: none;
  font: 500 12px/18px system-ui, -apple-system, sans-serif; color: #fff; background: rgba(20,20,20,.88);
  padding: 6px 10px; border-radius: 6px; }
`;

export type BoxGeometry = { left: number; top: number; width: number; height: number; transform: string | null };

function hasTransformedAncestor(element: Element): boolean {
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).transform !== "none") return true;
  }
  return false;
}

/** Outline geometry: the element's own 2D transform is reproduced; otherwise the bounding rect. */
export function geometryOf(element: Element): BoxGeometry {
  const rect = element.getBoundingClientRect();
  const transform = getComputedStyle(element).transform;
  if (element instanceof HTMLElement && transform !== "none" && transform.startsWith("matrix(") && !hasTransformedAncestor(element)) {
    const [a, b, c, d] = transform.slice(7, -1).split(",").map(Number);
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return { left: cx - width / 2, top: cy - height / 2, width, height, transform: `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)` };
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, transform: null };
}

export class Overlay {
  readonly host: HTMLDivElement;
  private readonly shield: HTMLDivElement;
  private readonly hoverBox: HTMLDivElement;
  private readonly selectBox: HTMLDivElement;
  private readonly hoverLabel: HTMLDivElement;
  private readonly selectLabel: HTMLDivElement;
  private readonly selectName: HTMLSpanElement;
  private readonly selectSize: HTMLSpanElement;
  private readonly toast: HTMLDivElement;
  private readonly highlightBox: HTMLDivElement;
  private readonly highlightLabel: HTMLDivElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly agentButton: HTMLButtonElement;
  private highlighted: Element | null = null;
  private hovered: Element | null = null;
  private selected: Element | null = null;
  private frame = 0;
  private toastTimer = 0;

  /** onAgent only tells the inspector to open its AI dialog; nothing typed passes through the page. */
  constructor(onCopy: () => void, onAgent: () => void) {
    this.host = document.createElement("div");
    this.host.setAttribute(CHROME_ATTRIBUTE, "");
    this.host.setAttribute("popover", "manual");
    this.host.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;" +
      "background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;color-scheme:normal;";
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.shield = Object.assign(document.createElement("div"), { className: "shield", tabIndex: -1 });
    this.hoverBox = Object.assign(document.createElement("div"), { className: "box hover" });
    this.selectBox = Object.assign(document.createElement("div"), { className: "box select" });
    this.hoverLabel = Object.assign(document.createElement("div"), { className: "label hover-label" });
    this.selectLabel = Object.assign(document.createElement("div"), { className: "label select-label" });
    this.selectLabel.setAttribute(UI_ATTRIBUTE, "");
    this.selectName = document.createElement("span");
    this.selectSize = Object.assign(document.createElement("span"), { className: "size" });
    const copy = Object.assign(document.createElement("button"), { type: "button" });
    this.copyButton = copy;
    copy.setAttribute(UI_ATTRIBUTE, "");
    this.highlightBox = Object.assign(document.createElement("div"), { className: "box highlight" });
    this.highlightLabel = Object.assign(document.createElement("div"), { className: "label highlight-label" });
    copy.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      onCopy();
    });
    const agent = Object.assign(document.createElement("button"), { type: "button", hidden: true });
    this.agentButton = agent;
    agent.setAttribute(UI_ATTRIBUTE, "");
    agent.setAttribute("data-code-layer-action", "agent");
    agent.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      onAgent();
    });
    this.selectLabel.append(this.selectName, this.selectSize, copy, agent);
    this.toast = Object.assign(document.createElement("div"), { className: "toast" });
    root.append(style, this.shield, this.highlightBox, this.hoverBox, this.selectBox, this.highlightLabel, this.hoverLabel, this.selectLabel, this.toast);
    this.relabel();
  }

  /** (Re)apply the texts of the chrome in the current interface language. */
  relabel(): void {
    this.copyButton.textContent = t("overlay.copy");
    this.copyButton.title = t("overlay.copyTitle");
    this.agentButton.textContent = t("overlay.ai");
    this.agentButton.title = t("overlay.aiTitle");
  }

  /** The AI control appears on the label only while agent runs are ready. */
  setAgentReady(ready: boolean): void {
    this.agentButton.hidden = !ready;
  }

  /** Outline an element the panel points at (a breadcrumb entry, a child). */
  setHighlight(element: Element | null, label: string): void {
    this.highlighted = element;
    this.highlightLabel.textContent = label;
  }

  mount(): void {
    if (!this.host.isConnected) document.body.appendChild(this.host);
    try {
      if (!this.host.matches(":popover-open")) this.host.showPopover();
    } catch {
      // Popover API unavailable: the fixed host with maximum z-index still works.
    }
    this.focusShield();
    const loop = () => {
      this.render();
      this.frame = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(loop);
  }

  unmount(): void {
    cancelAnimationFrame(this.frame);
    try {
      if (this.host.matches(":popover-open")) this.host.hidePopover();
    } catch {
      // ignore
    }
    this.host.remove();
  }

  focusShield(): void {
    this.shield.focus({ preventScroll: true });
  }

  setHover(element: Element | null, label: string): void {
    this.hovered = element === this.selected ? null : element;
    this.hoverLabel.textContent = label;
  }

  setSelection(element: Element | null, label: string, size: string): void {
    this.selected = element;
    this.selectName.textContent = label;
    this.selectSize.textContent = size;
    if (element === this.hovered) this.hovered = null;
  }

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.style.display = "block";
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.style.display = "none";
    }, 1800);
  }

  private place(box: HTMLDivElement, label: HTMLDivElement, element: Element | null): void {
    if (!element || !element.isConnected) {
      box.style.display = "none";
      label.style.display = "none";
      return;
    }
    const g = geometryOf(element);
    box.style.display = "block";
    box.style.width = `${g.width}px`;
    box.style.height = `${g.height}px`;
    box.style.transform = `translate(${g.left}px, ${g.top}px)${g.transform ? ` ${g.transform}` : ""}`;
    const rect = element.getBoundingClientRect();
    label.style.display = "flex";
    const top = rect.top >= 22 ? rect.top - 20 : rect.bottom + 4;
    label.style.transform = `translate(${Math.max(2, rect.left)}px, ${top}px)`;
  }

  private render(): void {
    if (!this.host.isConnected) document.body.appendChild(this.host);
    this.place(this.highlightBox, this.highlightLabel, this.highlighted);
    this.place(this.hoverBox, this.hoverLabel, this.hovered);
    this.place(this.selectBox, this.selectLabel, this.selected);
  }
}
