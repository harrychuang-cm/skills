// What is under the pointer, and what a click selects.
import { isForeignChrome, storyRoot } from "./frame";
import { childContaining, selectableAt } from "./navigate";

let revealSheet: CSSStyleSheet | null = null;

/**
 * Run a hit test that also reaches elements with `pointer-events: none`.
 * `elementsFromPoint` skips them, so for the duration of the synchronous call
 * a constructed sheet makes every element hit-testable; the browser does not
 * paint in between. SVG keeps `auto` semantics: only painted parts are hit.
 */
function withAllPointerEvents<T>(fn: () => T): T {
  if (!revealSheet) {
    revealSheet = new CSSStyleSheet();
    revealSheet.replaceSync("*, *::before, *::after { pointer-events: auto !important; }");
  }
  const sheet = revealSheet;
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  try {
    return fn();
  } finally {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
  }
}

function firstStoryElement(x: number, y: number, host: Element): Element | null {
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

/** The topmost story element under the point that receives pointer events. */
export function pickAt(x: number, y: number, host: Element): Element | null {
  return firstStoryElement(x, y, host);
}

/** The topmost story element under the point, including ones that do not receive pointer events. */
export function pickDeepAt(x: number, y: number, host: Element): Element | null {
  return withAllPointerEvents(() => firstStoryElement(x, y, host));
}

/** The outermost component root on the path of an element, else the element itself. */
export function outermostTarget(element: Element): Element {
  const root = storyRoot();
  let outermost: Element | null = null;
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
    if (node.hasAttribute("data-component")) outermost = node;
  }
  return outermost ?? selectableAt(element) ?? element;
}

/**
 * What a plain click selects. With nothing selected: the outermost component
 * root. With a selection: when the click lands inside the level the person
 * navigated to (the parent of the selection), the child of that level under
 * the pointer — so repeated clicks stay at that level.
 */
export function clickTarget(hit: Element, selected: Element | null, level: Element | null): Element {
  if (selected && level && level !== storyRoot()) {
    const child = childContaining(level, hit);
    if (child) return child;
  }
  return outermostTarget(hit);
}
