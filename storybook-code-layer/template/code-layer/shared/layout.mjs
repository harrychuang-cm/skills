// Layout structure that can be edited by choosing a keyword: the four flex
// container properties and the fixed list of keywords each accepts. One
// definition for the dev server (validation), the preview (tracing, probes)
// and the inspector (options).
//
// These are the only values Code Layer writes that are not token names.

/** Slot -> keywords, in the order the inspector offers them. */
export const LAYOUT_OPTIONS = {
  "flex-direction": ["row", "column", "row-reverse", "column-reverse"],
  "flex-wrap": ["nowrap", "wrap"],
  "align-items": ["flex-start", "center", "flex-end", "stretch", "baseline"],
  "justify-content": ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
};

export const LAYOUT_PROPERTIES = Object.keys(LAYOUT_OPTIONS);

/** Computed `display` values of a flex container. */
export const FLEX_DISPLAYS = ["flex", "inline-flex"];

/**
 * Shorthands that set a layout slot. A rule that declares one of them already
 * sets the slot, so a declaration of the longhand must not be added beside it.
 */
export const LAYOUT_SHORTHANDS = {
  "flex-direction": ["flex-flow"],
  "flex-wrap": ["flex-flow"],
  "align-items": ["place-items"],
  "justify-content": ["place-content"],
};

/** One CSS identifier, as a keyword component is written. */
export const KEYWORD_PATTERN = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

export function isLayoutProperty(property) {
  return Object.prototype.hasOwnProperty.call(LAYOUT_OPTIONS, property);
}

/** The keywords a layout slot accepts; an empty list for any other property. */
export function layoutOptions(property) {
  return isLayoutProperty(property) ? LAYOUT_OPTIONS[property] : [];
}

export function isLayoutKeyword(property, keyword) {
  return layoutOptions(property).includes(keyword);
}

export function isFlexDisplay(value) {
  return FLEX_DISPLAYS.includes(String(value ?? "").trim().toLowerCase());
}

/** Properties whose declaration in a rule means the slot is already set there. */
export function settersOf(property) {
  return isLayoutProperty(property) ? [property, ...LAYOUT_SHORTHANDS[property]] : [];
}

/**
 * A keyword of the list that differs from `current`: the sentinel a probe
 * uses to see whether a target drives the element.
 */
export function layoutSentinel(property, current) {
  const now = String(current ?? "").trim().toLowerCase();
  return layoutOptions(property).find((keyword) => keyword !== now) ?? null;
}
