// Is this document the top-level Storybook preview iframe of a same-origin manager?

export function isMainPreviewFrame(): boolean {
  try {
    if (window.parent === window) return false;
    if (window.parent !== window.top) return false;
    if (window.parent.location.origin !== location.origin) return false;
    return window.frameElement?.id === "storybook-preview-iframe";
  } catch {
    return false;
  }
}

export function storyRoot(): HTMLElement | null {
  return document.getElementById("storybook-root");
}

/** Tool chrome from other addons that must never be picked. */
export function isForeignChrome(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.classList) {
      for (const name of Array.from(node.classList)) {
        if (name.startsWith("sbfx-") && name !== "sbfx-story-scope") return true;
      }
      if (node.classList.contains("prototype-inspector")) return true;
    }
    if (node.id === "storybook-highlights-root") return true;
  }
  return false;
}

/** Children as rendered: display:contents wrappers are flattened away. */
export function renderChildren(element: Element): Element[] {
  const out: Element[] = [];
  for (const child of Array.from(element.children)) {
    if (getComputedStyle(child).display === "contents") out.push(...renderChildren(child));
    else out.push(child);
  }
  return out;
}

export function renderParent(element: Element, stopAt: Element): Element | null {
  let parent = element.parentElement;
  while (parent && parent !== stopAt && getComputedStyle(parent).display === "contents") parent = parent.parentElement;
  return parent;
}
