// Which logical longhand ("slot") each top-level component of a declaration
// sets. Shared by the dev server (Node) and the preview runtime (browser), so
// both agree on how a shorthand, a physical property and a logical property
// map to the same side of an element.
//
// A slot is always a logical longhand name: `padding-block-start`,
// `border-inline-end-width`, `border-start-end-radius`, `inline-size`,
// `row-gap`, `background-color`, `font-size`, ...
import { inferKind } from "./kinds.mjs";

const LOGICAL_SIDES = ["block-start", "inline-end", "block-end", "inline-start"];
const PHYSICAL_SIDES = ["top", "right", "bottom", "left"];
const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };
const BORDER_PARTS = ["width", "style", "color"];
const BORDER_STYLES = new Set(["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"]);
const WIDTH_KEYWORDS = new Set(["thin", "medium", "thick"]);
const FLEX_DIRECTIONS = new Set(["row", "row-reverse", "column", "column-reverse"]);
const FLEX_WRAPS = new Set(["nowrap", "wrap", "wrap-reverse"]);

/** Properties that are their own slot whatever the writing mode. */
const SINGLE = new Set([
  "display", "flex-direction", "flex-wrap", "align-items", "justify-content",
  "row-gap", "column-gap",
  "inline-size", "block-size", "min-inline-size", "min-block-size", "max-inline-size", "max-block-size",
  "opacity", "background-color", "fill",
  "outline-width", "outline-style", "outline-color", "stroke", "stroke-width",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color",
]);

const WRITING_MODES = {
  "horizontal-tb": { blockStart: "top", inlineAxis: "horizontal" },
  "vertical-rl": { blockStart: "right", inlineAxis: "vertical" },
  "vertical-lr": { blockStart: "left", inlineAxis: "vertical" },
};

/** Every combination this module supports; `sideways-*` writing modes are not. */
export const SUPPORTED_FLOWS = Object.keys(WRITING_MODES).flatMap((writingMode) => ["ltr", "rtl"].map((direction) => ({ writingMode, direction })));

/** Physical side -> logical side for a writing mode and direction; null when unsupported. */
function logicalSides(writingMode, direction) {
  const mode = WRITING_MODES[writingMode];
  if (!mode || (direction !== "ltr" && direction !== "rtl")) return null;
  const inlineStart = mode.inlineAxis === "horizontal" ? (direction === "ltr" ? "left" : "right") : direction === "ltr" ? "top" : "bottom";
  return {
    [mode.blockStart]: "block-start",
    [OPPOSITE[mode.blockStart]]: "block-end",
    [inlineStart]: "inline-start",
    [OPPOSITE[inlineStart]]: "inline-end",
  };
}

/** The physical side ("top" | "right" | "bottom" | "left") a logical side is on, or null. */
export function physicalSideOf(logicalSide, writingMode, direction) {
  const map = logicalSides(writingMode, direction);
  if (!map) return null;
  return PHYSICAL_SIDES.find((side) => map[side] === logicalSide) ?? null;
}

function cornerSlot(vertical, horizontal, map) {
  const a = map[vertical];
  const b = map[horizontal];
  const block = a.startsWith("block") ? a : b;
  const inline = a.startsWith("block") ? b : a;
  return `border-${block.slice("block-".length)}-${inline.slice("inline-".length)}-radius`;
}

const sideSlot = (prefix, side, suffix) => `${prefix}-${side}${suffix}`;

/** Component index for each of top, right, bottom, left in a 1–4 value shorthand. */
function boxIndexes(count) {
  if (count === 1) return [0, 0, 0, 0];
  if (count === 2) return [0, 1, 0, 1];
  if (count === 3) return [0, 1, 2, 1];
  if (count === 4) return [0, 1, 2, 3];
  return null;
}

/** Component index for each of top-left, top-right, bottom-right, bottom-left. */
function cornerIndexes(count) {
  if (count === 1) return [0, 0, 0, 0];
  if (count === 2) return [0, 1, 0, 1];
  if (count === 3) return [0, 1, 2, 1];
  if (count === 4) return [0, 1, 2, 3];
  return null;
}

function parseProperty(property) {
  if (SINGLE.has(property)) return { type: "single", slot: property };
  let m;
  if (property === "padding" || property === "margin") return { type: "box", prefix: property, suffix: "" };
  if ((m = /^border-(width|style|color)$/.exec(property))) return { type: "box", prefix: "border", suffix: `-${m[1]}` };
  if ((m = /^(padding|margin)-(block|inline)$/.exec(property))) return { type: "axis", prefix: m[1], axis: m[2], suffix: "" };
  if ((m = /^border-(block|inline)-(width|style|color)$/.exec(property))) return { type: "axis", prefix: "border", axis: m[1], suffix: `-${m[2]}` };
  if ((m = /^(padding|margin)-(top|right|bottom|left)$/.exec(property))) return { type: "physical-side", prefix: m[1], side: m[2], suffix: "" };
  if ((m = /^border-(top|right|bottom|left)-(width|style|color)$/.exec(property))) return { type: "physical-side", prefix: "border", side: m[1], suffix: `-${m[2]}` };
  if ((m = /^(padding|margin)-(block-start|block-end|inline-start|inline-end)$/.exec(property))) return { type: "single", slot: property };
  if ((m = /^border-(block-start|block-end|inline-start|inline-end)-(width|style|color)$/.exec(property))) return { type: "single", slot: property };
  if (property === "border") return { type: "border", sides: LOGICAL_SIDES };
  if ((m = /^border-(block|inline)$/.exec(property))) return { type: "border", sides: [`${m[1]}-start`, `${m[1]}-end`] };
  if ((m = /^border-(block-start|block-end|inline-start|inline-end)$/.exec(property))) return { type: "border", sides: [m[1]] };
  if ((m = /^border-(top|right|bottom|left)$/.exec(property))) return { type: "border", physicalSide: m[1] };
  if (property === "border-radius") return { type: "radius" };
  if ((m = /^border-(top|bottom)-(left|right)-radius$/.exec(property))) return { type: "physical-corner", vertical: m[1], horizontal: m[2] };
  if (/^border-(start|end)-(start|end)-radius$/.test(property)) return { type: "single", slot: property };
  if (property === "gap") return { type: "gap" };
  if ((m = /^(min-|max-)?(width|height)$/.exec(property))) return { type: "size", bound: m[1] ?? "", physical: m[2] };
  if (property === "outline") return { type: "outline" };
  if (property === "background") return { type: "background" };
  if (property === "font") return { type: "font" };
  if (property === "flex-flow") return { type: "flex-flow" };
  return null;
}

function normalizeComponents(components) {
  if (typeof components === "number") return Array.from({ length: components }, () => ({ text: null, kind: null }));
  return components.map((component) => {
    if (typeof component === "string") return { text: component, kind: inferKind(component) };
    return { text: component.text ?? null, kind: component.kind ?? (component.text == null ? null : inferKind(component.text)) };
  });
}

/** width | style | color | null for one component of a border-like shorthand. */
function borderPart(component) {
  const text = component.text == null ? null : String(component.text).trim().toLowerCase();
  if (text !== null && BORDER_STYLES.has(text)) return "style";
  if (text !== null && WIDTH_KEYWORDS.has(text)) return "width";
  if (text === "currentcolor" || text === "transparent") return "color";
  if (component.kind === "color") return "color";
  if (component.kind === "dimension" || component.kind === "zero") return "width";
  return null;
}

/** Assign the components of `<width> || <style> || <color>` to their parts. */
function borderAssignments(components) {
  if (components.length < 1 || components.length > 3) return null;
  const assigned = { width: null, style: null, color: null };
  for (let index = 0; index < components.length; index += 1) {
    const part = borderPart(components[index]);
    if (!part || assigned[part] !== null) return null;
    assigned[part] = index;
  }
  return assigned;
}

const failure = (reason, affected) => ({ ok: false, reason, affected });

/**
 * Slots a property can set, whatever its value. Null for a property outside
 * the table or an unsupported writing mode.
 */
export function affectedSlots(property, writingMode = "horizontal-tb", direction = "ltr") {
  const parsed = parseProperty(property);
  if (!parsed) return null;
  const map = logicalSides(writingMode, direction);
  switch (parsed.type) {
    case "single":
      return [parsed.slot];
    case "box":
      return LOGICAL_SIDES.map((side) => sideSlot(parsed.prefix, side, parsed.suffix));
    case "axis":
      return [sideSlot(parsed.prefix, `${parsed.axis}-start`, parsed.suffix), sideSlot(parsed.prefix, `${parsed.axis}-end`, parsed.suffix)];
    case "physical-side":
      return map ? [sideSlot(parsed.prefix, map[parsed.side], parsed.suffix)] : null;
    case "border": {
      if (parsed.physicalSide && !map) return null;
      const sides = parsed.physicalSide ? [map[parsed.physicalSide]] : parsed.sides;
      return sides.flatMap((side) => BORDER_PARTS.map((part) => sideSlot("border", side, `-${part}`)));
    }
    case "radius":
      return ["border-start-start-radius", "border-start-end-radius", "border-end-end-radius", "border-end-start-radius"];
    case "physical-corner":
      return map ? [cornerSlot(parsed.vertical, parsed.horizontal, map)] : null;
    case "gap":
      return ["row-gap", "column-gap"];
    case "size": {
      if (!map) return null;
      const horizontal = WRITING_MODES[writingMode].inlineAxis === "horizontal";
      const inline = (parsed.physical === "width") === horizontal;
      return [`${parsed.bound}${inline ? "inline" : "block"}-size`];
    }
    case "outline":
      return ["outline-width", "outline-style", "outline-color"];
    case "background":
      return ["background-color"];
    case "font":
      return ["font-family", "font-size", "font-weight", "line-height"];
    case "flex-flow":
      return ["flex-direction", "flex-wrap"];
    default:
      return null;
  }
}

/**
 * For a declaration `property: <components>`, which component sets which slot.
 *
 * components: a count, or an array of component texts or { text, kind }
 *   (kind as inferred from the resolved value, needed for var() components of
 *   border-like shorthands).
 * Returns { ok: true, slots: [{ slot, component }] } where component is the
 *   index of the component, or null when the shorthand resets the slot to its
 *   initial value without a component for it.
 * Returns { ok: false, reason, affected } when the mapping cannot be decided:
 *   "unknown-property", "unsupported-writing-mode", "unsupported-value"
 *   (wrong number or kind of components, slash-separated radius) or
 *   "unsupported-shorthand" (font). `affected` lists the slots the declaration
 *   still overrides, so a row can say why it is read-only.
 */
export function sidesOf(property, components, writingMode = "horizontal-tb", direction = "ltr") {
  const parsed = parseProperty(property);
  if (!parsed) return failure("unknown-property", []);
  const map = logicalSides(writingMode, direction);
  const affected = affectedSlots(property, writingMode, direction) ?? affectedSlots(property) ?? [];
  if (!map) return failure("unsupported-writing-mode", affected);
  const list = normalizeComponents(components);
  if (list.some((c) => c.text === "/" || c.text === ",")) return failure("unsupported-value", affected);
  const count = list.length;
  const all = (component) => ({ ok: true, slots: affected.map((slot) => ({ slot, component })) });

  switch (parsed.type) {
    case "single":
    case "physical-side":
    case "physical-corner":
    case "size":
      return count === 1 ? all(0) : failure("unsupported-value", affected);
    case "box": {
      const indexes = boxIndexes(count);
      if (!indexes) return failure("unsupported-value", affected);
      return { ok: true, slots: PHYSICAL_SIDES.map((side, i) => ({ slot: sideSlot(parsed.prefix, map[side], parsed.suffix), component: indexes[i] })) };
    }
    case "axis": {
      if (count !== 1 && count !== 2) return failure("unsupported-value", affected);
      return { ok: true, slots: [{ slot: affected[0], component: 0 }, { slot: affected[1], component: count === 2 ? 1 : 0 }] };
    }
    case "radius": {
      const indexes = cornerIndexes(count);
      if (!indexes) return failure("unsupported-value", affected);
      const corners = [["top", "left"], ["top", "right"], ["bottom", "right"], ["bottom", "left"]];
      return { ok: true, slots: corners.map(([v, h], i) => ({ slot: cornerSlot(v, h, map), component: indexes[i] })) };
    }
    case "gap": {
      if (count !== 1 && count !== 2) return failure("unsupported-value", affected);
      return { ok: true, slots: [{ slot: "row-gap", component: 0 }, { slot: "column-gap", component: count === 2 ? 1 : 0 }] };
    }
    case "border":
    case "outline": {
      const assigned = borderAssignments(list);
      if (!assigned) return failure("unsupported-value", affected);
      return { ok: true, slots: affected.map((slot) => ({ slot, component: assigned[slot.slice(slot.lastIndexOf("-") + 1)] })) };
    }
    case "background": {
      const colors = list.map((c, i) => ({ c, i })).filter(({ c }) => borderPart(c) === "color");
      if (colors.length > 1) return failure("unsupported-value", affected);
      if (colors.length === 0 && list.some((c) => c.kind === null || c.kind === "unknown")) return failure("unsupported-value", affected);
      return all(colors.length === 1 ? colors[0].i : null);
    }
    case "flex-flow": {
      if (count < 1 || count > 2) return failure("unsupported-value", affected);
      const found = { "flex-direction": null, "flex-wrap": null };
      for (let i = 0; i < count; i += 1) {
        const text = String(list[i].text ?? "").trim().toLowerCase();
        const slot = FLEX_DIRECTIONS.has(text) ? "flex-direction" : FLEX_WRAPS.has(text) ? "flex-wrap" : null;
        if (!slot || found[slot] !== null) return failure("unsupported-value", affected);
        found[slot] = i;
      }
      return { ok: true, slots: affected.map((slot) => ({ slot, component: found[slot] })) };
    }
    case "font":
      return failure("unsupported-shorthand", affected);
    default:
      return failure("unknown-property", []);
  }
}

/**
 * The logical longhand a physical property stands for under a writing mode
 * and direction (`padding-left` -> `padding-inline-start`, `width` ->
 * `inline-size`). A property that is already a slot is returned unchanged.
 * Null for shorthands, unknown properties and unsupported writing modes.
 */
export function physicalToLogical(property, writingMode = "horizontal-tb", direction = "ltr") {
  const parsed = parseProperty(property);
  if (!parsed) return null;
  if (parsed.type === "single") return parsed.slot;
  if (parsed.type !== "physical-side" && parsed.type !== "physical-corner" && parsed.type !== "size") return null;
  const slots = affectedSlots(property, writingMode, direction);
  return slots ? slots[0] : null;
}

/**
 * Whether two declarations of one rule may set the same slot under any
 * supported writing mode. The server uses it to tell that a later declaration
 * of a rule overrides (part of) an earlier one.
 */
export function mayOverlap(a, b) {
  if (a === b) return true;
  for (const { writingMode, direction } of SUPPORTED_FLOWS) {
    const left = affectedSlots(a, writingMode, direction);
    const right = affectedSlots(b, writingMode, direction);
    if (left && right && left.some((slot) => right.includes(slot))) return true;
  }
  return false;
}
