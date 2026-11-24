// What is under the pointer, and what a click selects.
// elementsFromPoint skips pointer-events:none elements (a known limit of the
// proof: such parts cannot be picked by pointer).
import { isForeignChrome, storyRoot } from "./frame";

export function pickAt(x: number, y: number, host: Element): Element | null {
  const root = storyRoot();
  if (!root) return null;
  for (const element of document.elementsFromPoint(x, y)) {
    if (element === host || host.contains(element)) continue;
    if (element === root || element === document.body || element === document.documentElement) continue;
    if (!root.contains(element)) continue;
    if (isForeignChrome(element)) continue;
    return element;
  }
  return null;
}

/** A click selects the outermost component root on the path, else the element itself. */
export function selectionTarget(element: Element): Element {
  const root = storyRoot();
  let outermost: Element | null = null;
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
    if (node.hasAttribute("data-component")) outermost = node;
  }
  return outermost ?? element;
}
