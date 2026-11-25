// WCAG 2 contrast between two CSS colors, computed from token values (not from
// the browser, so a Storybook theme override cannot change the answer).

const NAMED = { white: "#ffffff", black: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00", gray: "#808080", grey: "#808080", silver: "#c0c0c0" };

function channel(text) {
  const value = text.trim();
  if (value.endsWith("%")) return (Number(value.slice(0, -1)) / 100) * 255;
  return Number(value);
}

/**
 * Parse an sRGB color written as a hex code, rgb()/rgba() or one of a few
 * names. Returns { r, g, b, a } (0–255, alpha 0–1) or null for anything else
 * (hsl(), color(), color-mix(), currentcolor, a var()).
 */
export function parseColor(text) {
  if (typeof text !== "string") return null;
  let value = text.trim().toLowerCase();
  if (NAMED[value]) value = NAMED[value];
  let m = /^#([0-9a-f]{3,8})$/.exec(value);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^rgba?\(([^)]*)\)$/.exec(value);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length !== 3 && parts.length !== 4) return null;
    const [r, g, b] = parts.slice(0, 3).map(channel);
    const a = parts.length === 4 ? (parts[3].endsWith("%") ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3])) : 1;
    if (![r, g, b, a].every(Number.isFinite)) return null;
    return { r, g, b, a };
  }
  return null;
}

/** Relative luminance of an opaque sRGB color (WCAG 2). */
export function luminance({ r, g, b }) {
  const linear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Contrast ratio (1–21) of a foreground on a background, both CSS color
 * strings. A translucent foreground is composited over the background; a
 * translucent background or an unparseable color gives null.
 */
export function contrastRatio(foreground, background) {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg || bg.a < 1) return null;
  const over = fg.a >= 1 ? fg : { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
  const a = luminance(over);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Two color strings denote the same color (falls back to text equality). */
export function sameColor(a, b) {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
  return x.r === y.r && x.g === y.g && x.b === y.b && x.a === y.a;
}
