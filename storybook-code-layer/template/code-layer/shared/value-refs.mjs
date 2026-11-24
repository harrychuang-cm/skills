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
 * Shape of a declared value:
 * - { kind: "single-var", name }          the whole value is one var() without fallback
 * - { kind: "var-with-fallback", name }   one var() with a fallback
 * - { kind: "expression", names }         var() inside a function, several var(), or var() plus other text
 * - { kind: "keyword", keyword }          CSS-wide keyword or currentcolor
 * - { kind: "raw" }                       a literal value
 */
export function classifyValue(text) {
  const masked = maskCss(String(text));
  const refs = findVarRefs(String(text));
  if (refs.length === 0) {
    const keyword = normalizeValue(text).toLowerCase();
    if (CSS_WIDE_KEYWORDS.has(keyword)) return { kind: "keyword", keyword };
    return { kind: "raw" };
  }
  if (refs.length === 1 || (refs.length > 1 && refs.slice(1).every((r) => r.depth > 0 && r.start < refs[0].end))) {
    const r = refs[0];
    const before = masked.slice(0, r.start).trim();
    const after = masked.slice(r.end).trim();
    if (r.name && r.closed && before === "" && after === "") {
      if (!r.hasFallback && refs.length === 1) return { kind: "single-var", name: r.name };
      return { kind: "var-with-fallback", name: r.name };
    }
  }
  return { kind: "expression", names: refs.map((r) => r.name).filter(Boolean) };
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
  const property = text.slice(start, start + colon).trim();
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
