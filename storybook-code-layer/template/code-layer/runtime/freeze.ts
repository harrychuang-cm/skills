// Frozen measurement: every probe, effect check and before/after capture runs
// with transitions disabled, restores what it changed while still frozen, and
// forces a recalculation before the freeze is lifted, so no transition plays.

let freezeSheet: CSSStyleSheet | null = null;

export function withFreeze<T>(element: Element | null, fn: () => T): T {
  if (!freezeSheet) {
    freezeSheet = new CSSStyleSheet();
    freezeSheet.replaceSync("*, *::before, *::after { transition: none !important; }");
  }
  const sheet = freezeSheet;
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  try {
    return fn();
  } finally {
    if (element) void getComputedStyle(element).getPropertyValue("color");
    void getComputedStyle(document.documentElement).getPropertyValue("color");
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
  }
}

export function isAnimating(element: Element, property: string): boolean {
  if (typeof element.getAnimations !== "function") return false;
  return element.getAnimations().some((animation) => {
    const effect = animation.effect as KeyframeEffect | null;
    if (!effect || typeof effect.getKeyframes !== "function") return false;
    const camel = property.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
    return effect.getKeyframes().some((frame) => camel in frame || property in frame);
  });
}
