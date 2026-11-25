// Selection navigation, after the conventions of a design tool: a click picks
// at the current nesting level, a double-click or Enter goes one level down,
// Shift+Enter goes to the parent, Tab walks the siblings.
//
// "Selectable" means: inside the story root, generating a box, and not part of
// any tool's own chrome. A wrapper with `display: contents` generates no box,
// so it is skipped and its children count as children of its parent.
import { isForeignChrome, storyRoot } from "./frame";

function generatesBox(element: Element): boolean {
  const display = getComputedStyle(element).display;
  return display !== "contents" && display !== "none";
}

export function isSelectable(element: Element): boolean {
  const root = storyRoot();
  if (!root || element === root || !root.contains(element)) return false;
  if (isForeignChrome(element)) return false;
  return generatesBox(element);
}

/** Selectable children of an element (or of the story root), box-less wrappers flattened away. */
export function selectableChildren(element: Element): Element[] {
  const out: Element[] = [];
  for (const child of Array.from(element.children)) {
    if (isForeignChrome(child)) continue;
    const display = getComputedStyle(child).display;
    if (display === "none") continue;
    if (display === "contents") out.push(...selectableChildren(child));
    else out.push(child);
  }
  return out;
}

/** The selectable parent, or null when the element sits directly in the story root. */
export function selectableParent(element: Element): Element | null {
  const root = storyRoot();
  if (!root) return null;
  for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (isSelectable(parent)) return parent;
    if (!root.contains(parent)) return null;
  }
  return null;
}

/** The level an element lives at: its selectable parent, or the story root. */
export function levelOf(element: Element): Element | null {
  return selectableParent(element) ?? storyRoot();
}

/** Next or previous selectable sibling, wrapping at the ends; null when there is no other sibling. */
export function siblingOf(element: Element, step: 1 | -1): Element | null {
  const level = levelOf(element);
  if (!level) return null;
  const siblings = selectableChildren(level);
  const at = siblings.indexOf(element);
  if (at === -1 || siblings.length < 2) return null;
  return siblings[(at + step + siblings.length) % siblings.length];
}

/** The child of `level` that contains (or is) `hit`; null when `hit` is not inside `level`. */
export function childContaining(level: Element, hit: Element): Element | null {
  if (!level.contains(hit) || level === hit) return null;
  return selectableChildren(level).find((child) => child === hit || child.contains(hit)) ?? null;
}

/** Selectable ancestors from the outermost down to the element itself. */
export function ancestry(element: Element): Element[] {
  const out: Element[] = [];
  for (let node: Element | null = element; node; node = selectableParent(node)) out.unshift(node);
  return out;
}

/** The deepest selectable element at or above `hit`. */
export function selectableAt(hit: Element): Element | null {
  const root = storyRoot();
  for (let node: Element | null = hit; node && node !== root; node = node.parentElement) {
    if (isSelectable(node)) return node;
  }
  return null;
}
