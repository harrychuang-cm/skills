// Kind of a resolved token value, used for "same type" checks and picker
// filtering. Kinds: color, dimension, percentage, angle, time, number, zero,
// font-family, keyword, unknown.
import { normalizeValue } from "./value-refs.mjs";

const NAMED_COLORS = new Set([
  "transparent", "black", "white", "red", "green", "blue", "yellow", "orange", "purple",
  "gray", "grey", "silver", "maroon", "navy", "teal", "olive", "lime", "aqua", "fuchsia",
]);
const GENERIC_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif",
  "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong",
]);
const LENGTH_UNITS =
  "px|rem|em|ex|ch|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|cqw|cqh|cqi|cqb|cqmin|cqmax|pt|pc|cm|mm|q|in";
const NUMBER = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?";

const patterns = [
  ["zero", new RegExp(`^[-+]?0+(?:\\.0+)?$`)],
  ["color", /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i],
  ["color", /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i],
  ["dimension", new RegExp(`^${NUMBER}(?:${LENGTH_UNITS})$`, "i")],
  ["percentage", new RegExp(`^${NUMBER}%$`)],
  ["angle", new RegExp(`^${NUMBER}(?:deg|rad|grad|turn)$`, "i")],
  ["time", new RegExp(`^${NUMBER}(?:ms|s)$`, "i")],
  ["number", new RegExp(`^${NUMBER}$`)],
];

export function inferKind(value) {
  if (value == null) return "unknown";
  const text = normalizeValue(value);
  if (text === "") return "unknown";
  for (const [kind, pattern] of patterns) if (pattern.test(text)) return kind;
  const lower = text.toLowerCase();
  if (NAMED_COLORS.has(lower)) return "color";
  if (/["']/.test(text) || text.includes(",") || GENERIC_FAMILIES.has(lower)) return "font-family";
  if (/^[a-z-]+$/i.test(text)) return "keyword";
  return "unknown";
}

/** Two kinds can replace each other in a re-bind. */
export function kindsCompatible(a, b) {
  if (a === "unknown" || b === "unknown") return false;
  if (a === b) return true;
  const numeric = new Set(["dimension", "number", "percentage", "zero"]);
  return (a === "zero" && numeric.has(b)) || (b === "zero" && numeric.has(a));
}

/** Category segment of a token name: --md-sys-color-primary -> "color". */
export function tokenCategory(name, prefix) {
  const match = new RegExp(`^--${prefix}-(?:ref|sys|comp)-([a-z0-9]+)`).exec(name);
  return match ? match[1] : null;
}
