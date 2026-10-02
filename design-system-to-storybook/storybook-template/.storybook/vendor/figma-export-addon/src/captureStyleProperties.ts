// html-to-image copies every computed-style property onto every cloned node.
// Computed style enumerates custom properties too, so a token-heavy project
// (thousands of `--token` declarations) turns a few hundred nodes into millions
// of copies and blocks the tab for minutes. The standard properties already
// carry resolved values, so a clone only needs the custom properties its own
// markup still references through var(): html-to-image clones an <svg> natively
// without inlining its children, so `fill="var(--token)"` resolves through the
// properties copied onto the clone.

// html-to-image keeps the first list it receives for the lifetime of the page,
// by reference. One list is therefore shared by every capture on the page —
// across the separately bundled preview and review entries — and only ever
// grows, so a capture that is still cloning never loses a property.
const sharedListKey = Symbol.for("sbfx.captureStyleProperties");

function sharedList(): string[] {
  const host = globalThis as unknown as Record<symbol, string[] | undefined>;
  return (host[sharedListKey] ??= []);
}

const customPropertyReference = /var\(\s*(--[^\s,)]+)/g;

export function collectReferencedCustomProperties(markup: string): string[] {
  const names = new Set<string>();
  for (const match of markup.matchAll(customPropertyReference)) {
    names.add(match[1]);
  }
  return [...names];
}

/** The `includeStyleProperties` list every html-to-image capture must pass. */
export function getCaptureStyleProperties(target: Element): string[] {
  const list = sharedList();
  if (list.length === 0) {
    for (const name of Array.from(getComputedStyle(document.documentElement))) {
      if (!name.startsWith("--")) list.push(name);
    }
  }
  for (const name of collectReferencedCustomProperties(target.outerHTML)) {
    if (!list.includes(name)) list.push(name);
  }
  return list;
}
