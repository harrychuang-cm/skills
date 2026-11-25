// Pure CSS text helpers shared by the dev server (Node) and the preview
// runtime (browser). No imports and no environment-specific globals.
//
// All offsets are UTF-16 string offsets into the text that was passed in.

const CSS_WIDE_KEYWORDS = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "currentcolor",
]);

const NAME_CHAR = /[A-Za-z0-9_\-\u0080-￿]/;
const IDENT_BEFORE = /[A-Za-z0-9_\-]/;

/**
 * Replace comment bodies and string contents with spaces (newlines kept), so
 * structural scanning never matches inside them. The result has the same
 * length as the input.
 */
export function maskCss(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let j = i; j < stop; j += 1) out += text[j] === "\n" ? "\n" : " ";
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      out += c;
      i += 1;
      while (i < n && text[i] !== c && text[i] !== "\n") {
        if (text[i] === "\\" && i + 1 < n) {
          out += "  ";
          i += 2;
          continue;
        }
        out += " ";
        i += 1;
      }
      if (i < n && text[i] === c) {
        out += c;
        i += 1;
      }
      continue;
    }
    if (c === "\\" && i + 1 < n) {
      out += c + text[i + 1];
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Remove comments (outside strings); string contents are kept verbatim. */
export function stripComments(text) {
  const masked = maskCss(text);
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (masked[i] === " " && text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += " ";
      i = stop;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

/** Comments removed, whitespace runs collapsed to one space, trimmed. */
export function normalizeValue(text) {
  return stripComments(String(text)).replace(/\s+/g, " ").trim();
}

function parenDepthAt(masked, index) {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    if (masked[i] === "(") depth += 1;
    else if (masked[i] === ")") depth = Math.max(0, depth - 1);
  }
  return depth;
}

/**
 * Every `var(` occurrence in source order.
 * Each entry: { name, start, end, nameStart, nameEnd, hasFallback, closed, depth }.
 * `name` is null when `var(` is not followed by a custom property name.
 */
export function findVarRefs(text) {
  const masked = maskCss(text);
  const refs = [];
  const pattern = /var\(/gi;
  let match;
  while ((match = pattern.exec(masked))) {
    const at = match.index;
    if (at > 0 && IDENT_BEFORE.test(masked[at - 1])) continue;
    const open = at + 3;
    let i = open + 1;
    while (i < masked.length && /\s/.test(masked[i])) i += 1;
    let name = null;
    let nameStart = i;
    let nameEnd = i;
    if (masked[i] === "-" && masked[i + 1] === "-") {
      nameStart = i;
      i += 2;
      while (i < masked.length && NAME_CHAR.test(masked[i])) i += 1;
      nameEnd = i;
      name = text.slice(nameStart, nameEnd);
    }
    let depth = 0;
    let close = -1;
    for (let j = open; j < masked.length; j += 1) {
      if (masked[j] === "(") depth += 1;
      else if (masked[j] === ")") {
        depth -= 1;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }
    let k = nameEnd;
    while (k < masked.length && /\s/.test(masked[k])) k += 1;
    refs.push({
      name,
      start: at,
      end: close === -1 ? masked.length : close + 1,
      nameStart,
      nameEnd,
      hasFallback: masked[k] === ",",
      closed: close !== -1,
      depth: parenDepthAt(masked, at),
    });
  }
  return refs;
}

/**
 * Top-level components of a value: split at whitespace that is outside
 * parentheses, strings and comments. A comma or a slash at the top level is
 * returned as its own component with `separator` set, so a caller can tell a
 * space-separated shorthand from a list or a slash-separated value.
 * Each entry: { text, start, end, separator: "," | "/" | null }.
 */
export function splitTopLevel(text) {
  const value = String(text);
  const masked = maskCss(value);
  const out = [];
  let depth = 0;
  let quote = null;
  let start = -1;
  const close = (end) => {
    if (start === -1) return;
    out.push({ text: value.slice(start, end), start, end, separator: null });
    start = -1;
  };
  for (let i = 0; i < masked.length; i += 1) {
    const c = masked[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      if (start === -1) start = i;
      quote = c;
      continue;
    }
    if (c === "(") {
      if (start === -1) start = i;
      depth += 1;
      continue;
    }
    if (c === ")") {
      if (start === -1) start = i;
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    if (/\s/.test(c)) {
      close(i);
      continue;
    }
    if (c === "," || c === "/") {
      close(i);
      out.push({ text: c, start: i, end: i + 1, separator: c });
      continue;
    }
    if (start === -1) start = i;
  }
  close(masked.length);
  return out;
}

/**
 * Shape of a declared value:
 * - { kind: "single-var", name }          the whole value is one var() without fallback
 * - { kind: "var-list", names }           a space-separated shorthand in which every component is
 *                                         either exactly one var() without fallback or has no var()
 * - { kind: "var-with-fallback", name }   one var() with a fallback
 * - { kind: "expression", names, detail } any other value with var(): "function" (a reference inside
 *                                         a function), "fallback", "list" (comma) or "slash"
 * - { kind: "keyword", keyword }          CSS-wide keyword or currentcolor
 * - { kind: "raw" }                       a literal value
 * Every shape carries `components`: [{ text, start, end, shape, refIndex }] where shape is
 * "single-var" | "raw" | "expression" | "separator" and refIndex is the position of the
 * component's reference among all var() references of the value (null without one).
 */
export function classifyValue(text) {
  const value = String(text);
  const masked = maskCss(value);
  const refs = findVarRefs(value);
  const parts = splitTopLevel(value);
  const plain = (part) => ({ text: part.text, start: part.start, end: part.end, shape: part.separator ? "separator" : "raw", refIndex: null });
  if (refs.length === 0) {
    const keyword = normalizeValue(value).toLowerCase();
    const components = parts.map(plain);
    if (CSS_WIDE_KEYWORDS.has(keyword)) return { kind: "keyword", keyword, components };
    return { kind: "raw", components };
  }
  if (refs.length === 1 || (refs.length > 1 && refs.slice(1).every((r) => r.depth > 0 && r.start < refs[0].end))) {
    const r = refs[0];
    const before = masked.slice(0, r.start).trim();
    const after = masked.slice(r.end).trim();
    if (r.name && r.closed && before === "" && after === "") {
      const single = !r.hasFallback && refs.length === 1;
      const components = [{ text: value.slice(r.start, r.end), start: r.start, end: r.end, shape: single ? "single-var" : "expression", refIndex: 0 }];
      if (single) return { kind: "single-var", name: r.name, components };
      return { kind: "var-with-fallback", name: r.name, components };
    }
  }
  let separator = null;
  let fallback = false;
  let nested = false;
  const components = parts.map((part) => {
    if (part.separator) {
      separator ??= part.separator;
      return plain(part);
    }
    const inside = [];
    refs.forEach((ref, index) => {
      if (ref.start >= part.start && ref.start < part.end) inside.push({ ref, index });
    });
    if (inside.length === 0) return plain(part);
    const { ref, index } = inside[0];
    const whole = inside.length === 1 && ref.depth === 0 && ref.name && ref.closed && ref.start === part.start && ref.end === part.end;
    if (whole && !ref.hasFallback) return { text: part.text, start: part.start, end: part.end, shape: "single-var", refIndex: index };
    if (whole || (ref.depth === 0 && ref.hasFallback && ref.start === part.start && ref.end === part.end)) fallback = true;
    else nested = true;
    return { text: part.text, start: part.start, end: part.end, shape: "expression", refIndex: index };
  });
  const names = refs.map((r) => r.name).filter(Boolean);
  if (!separator && !fallback && !nested && refs.every((r) => r.name)) return { kind: "var-list", names, components };
  const detail = separator === "," ? "list" : separator === "/" ? "slash" : fallback && !nested ? "fallback" : "function";
  return { kind: "expression", names, detail, components };
}

/** Replace the custom property name of the refIndex-th var() reference. */
export function replaceVarName(text, refIndex, fromName, toName) {
  const refs = findVarRefs(text);
  const ref = refs[refIndex];
  if (!ref || ref.name !== fromName) {
    const error = new Error(`var() reference ${refIndex} is not ${fromName}`);
    error.code = "locator-mismatch";
    throw error;
  }
  return text.slice(0, ref.nameStart) + toName + text.slice(ref.nameEnd);
}

/**
 * Declarations found anywhere in a stylesheet text. Used by the browser to
 * read the token sheet's textContent (which Vite produced from an @import
 * entry) without trusting the CSSOM.
 * Each entry: { prelude, property, value, important, valueStart, valueEnd }.
 * `prelude` is the comment-free, whitespace-collapsed text before the
 * enclosing `{`.
 */
export function scanDeclarations(text) {
  const masked = maskCss(text);
  const out = [];
  const stack = [];
  let segmentStart = 0;
  let parenDepth = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === "(") parenDepth += 1;
    else if (c === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (parenDepth === 0 && c === "{") {
      stack.push(normalizeValue(text.slice(segmentStart, i)));
      segmentStart = i + 1;
    } else if (parenDepth === 0 && (c === ";" || c === "}")) {
      if (stack.length > 0) {
        const decl = readDeclaration(text, masked, segmentStart, i);
        if (decl) out.push({ prelude: stack[stack.length - 1], ...decl });
      }
      if (c === "}") stack.pop();
      segmentStart = i + 1;
    }
  }
  return out;
}

function readDeclaration(text, masked, start, end) {
  const segment = masked.slice(start, end);
  let depth = 0;
  let colon = -1;
  for (let i = 0; i < segment.length; i += 1) {
    if (segment[i] === "(") depth += 1;
    else if (segment[i] === ")") depth = Math.max(0, depth - 1);
    else if (segment[i] === ":" && depth === 0) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;
  // From the masked text: a comment before the declaration (a section heading, or
  // the trailing note of the previous line) is not part of the property name.
  const property = masked.slice(start, start + colon).trim();
  if (!property || /[\s{}]/.test(property)) return null;
  let valueStart = start + colon + 1;
  let valueEnd = end;
  const maskedValue = masked.slice(valueStart, valueEnd);
  const importantMatch = /!\s*important\s*$/i.exec(maskedValue.trimEnd());
  const important = Boolean(importantMatch);
  if (importantMatch) valueEnd = valueStart + importantMatch.index;
  while (valueStart < valueEnd && /\s/.test(text[valueStart])) valueStart += 1;
  while (valueEnd > valueStart && /\s/.test(text[valueEnd - 1])) valueEnd -= 1;
  return { property, value: text.slice(valueStart, valueEnd), important, valueStart, valueEnd };
}

/** The declared value of `name` inside a `:root` block, or null / "ambiguous". */
export function findRootDeclaration(text, name) {
  const matches = scanDeclarations(text).filter(
    (d) => d.prelude === ":root" && d.property === name,
  );
  if (matches.length === 0) return null;
  if (matches.length > 1) return "ambiguous";
  return matches[0];
}
