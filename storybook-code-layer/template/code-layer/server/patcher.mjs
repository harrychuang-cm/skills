// Byte-exact edits of a stylesheet.
//
// Three kinds of edit, all planned as byte ranges of the original file:
//   name       the custom property name inside a var() reference
//   component  one top-level component of a declared value (a layout keyword)
//   insert     one declaration appended to a rule (a zero-length range)
//   remove     one declaration taken out again (the inverse of an insert)
//
// The result is proven twice:
// 1. on bytes, independently of PostCSS: the new file equals the old file with
//    exactly the planned byte ranges replaced;
// 2. by re-parsing: apart from the declarations that were added or removed the
//    node sequence is unchanged, untouched declarations keep their raw values,
//    and each target declaration has the expected new value.
import { findVarRefs, replaceVarName, splitTopLevel } from "../shared/value-refs.mjs";
import { byteOffset, encodeCss } from "./css-source.mjs";

export class PatchError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const PROPERTY_NAME = /^[a-z][a-z-]*$/;
const KEYWORD = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;
/** Exactly one var() reference to a custom property, without fallback: what a tokenization writes. */
const TOKEN_REFERENCE = /^var\(--[A-Za-z0-9_-]+\)$/;

/** A literal a reverse apply may write back: one top-level component, no reference, comment or structure. */
function plainLiteral(text) {
  const parts = splitTopLevel(text);
  return parts.length === 1 && !parts[0].separator && parts[0].text === text && !/var\(|[;{}!]|\/\*/i.test(text);
}

/** Raw value span of a PostCSS declaration inside the BOM-less text. */
export function locateDeclValue(text, decl) {
  const start = decl.source?.start?.offset;
  if (typeof start !== "number") {
    throw new PatchError("locator-mismatch", `declaration ${decl.prop} has no source offset`);
  }
  const between = decl.raws.between ?? ":";
  const rawValue = decl.raws.value?.raw ?? decl.value;
  const betweenStart = start + decl.prop.length;
  const valueStart = betweenStart + between.length;
  if (
    text.slice(start, betweenStart) !== decl.prop ||
    text.slice(betweenStart, valueStart) !== between ||
    text.slice(valueStart, valueStart + rawValue.length) !== rawValue
  ) {
    throw new PatchError("locator-mismatch", `declaration ${decl.prop} does not match its source span`, {
      line: decl.source.start.line,
    });
  }
  return { valueStart, valueEnd: valueStart + rawValue.length, rawValue };
}

/** Offset of the `}` that closes a rule. */
function closingBrace(text, rule) {
  const end = rule.source?.end?.offset;
  if (typeof end !== "number") throw new PatchError("locator-mismatch", `rule ${rule.selector} has no source end`);
  // PostCSS versions differ on whether the end offset is the brace or the position after it.
  for (const at of [end, end - 1]) if (text[at] === "}") return at;
  throw new PatchError("locator-mismatch", `rule ${rule.selector} does not end where its source says`, { line: rule.source.start.line });
}

/**
 * Where and what to insert to append `property: value;` to a rule: directly
 * after the rule's last node, preceded by the whitespace that precedes its
 * last declaration (a line break and that declaration's indentation when the
 * whitespace holds a comment).
 * Returns { at, text, declaration } with `declaration` the text without the whitespace.
 */
export function planInsertion(text, rule, property, value) {
  if (!PROPERTY_NAME.test(property) || !KEYWORD.test(value)) throw new PatchError("unsupported-value-shape", `cannot insert ${property}: ${value}`);
  const nodes = rule.nodes ?? [];
  const decls = nodes.filter((node) => node.type === "decl");
  if (decls.length === 0 || nodes.some((node) => node.type !== "decl" && node.type !== "comment") || rule.raws.semicolon !== true) {
    throw new PatchError("unsupported-value-shape", `rule ${rule.selector} cannot take a new declaration`, { line: rule.source?.start?.line });
  }
  const close = closingBrace(text, rule);
  const after = rule.raws.after ?? "";
  const at = close - after.length;
  if (text.slice(at, close) !== after) throw new PatchError("locator-mismatch", `rule ${rule.selector} does not match its source span`, { line: rule.source.start.line });
  const before = decls[decls.length - 1].raws.before ?? "";
  const lineBreak = text.includes("\r\n") ? "\r\n" : "\n";
  // PostCSS keeps comments as nodes, so this is whitespace; anything else is not copied.
  const whitespace = /[^\s]/.test(before) ? lineBreak + /[ \t]*$/.exec(before)[0] : before;
  const declaration = `${property}: ${value};`;
  return { at, text: whitespace + declaration, declaration };
}

/**
 * The span of a declaration that an earlier insert wrote: `inserted` is the
 * exact text of that insert. The declaration must still read as it was written.
 */
function locateInserted(text, decl, inserted) {
  const start = decl.source?.start?.offset;
  const declaration = `${decl.prop}: ${decl.raws.value?.raw ?? decl.value};`;
  if (typeof start !== "number" || !inserted.endsWith(declaration)) {
    throw new PatchError("stale-before", `${decl.prop} is no longer the declaration that was added`, { line: decl.source?.start?.line });
  }
  const from = start - (inserted.length - declaration.length);
  const to = start + declaration.length;
  if (from < 0 || text.slice(from, to) !== inserted) {
    throw new PatchError("stale-before", `the text around ${decl.prop} is no longer what was added`, { line: decl.source.start.line });
  }
  return { from, to };
}

function planEdit(source, edit) {
  const kind = edit.kind ?? "name";
  const text = source.text;
  if (kind === "insert") {
    const plan = planInsertion(text, edit.rule, edit.property, edit.value);
    return { kind, rule: edit.rule, decl: null, property: edit.property, value: edit.value, fromName: "", toName: plan.text, start: plan.at, end: plan.at, line: edit.rule.source.start.line };
  }
  if (kind === "remove") {
    const { from, to } = locateInserted(text, edit.decl, edit.inserted);
    return { kind, rule: edit.decl.parent, decl: edit.decl, fromName: edit.inserted, toName: "", start: from, end: to, line: edit.decl.source.start.line };
  }
  const { valueStart, rawValue } = locateDeclValue(text, edit.decl);
  const line = edit.decl.source.start.line;
  if (kind === "component" || kind === "tokenize" || kind === "restore") {
    const part = splitTopLevel(rawValue)[edit.component];
    if (!part || part.separator || part.text !== edit.fromText) {
      throw new PatchError("locator-mismatch", `component ${edit.component} of ${edit.decl.prop} is not ${edit.fromText}`, { line });
    }
    // What each kind may write: a keyword (set-keyword), exactly one reference to a token (tokenize-literal),
    // or the recorded literal as one plain component (its inverse).
    if (kind === "component" && !KEYWORD.test(edit.toText)) throw new PatchError("unsupported-value-shape", `invalid keyword ${edit.toText}`);
    if (kind === "tokenize" && !TOKEN_REFERENCE.test(edit.toText)) throw new PatchError("unsupported-value-shape", `invalid token reference ${edit.toText}`);
    if (kind === "restore" && !plainLiteral(edit.toText)) throw new PatchError("unsupported-value-shape", `invalid literal ${edit.toText}`);
    return { kind, decl: edit.decl, fromName: edit.fromText, toName: edit.toText, start: valueStart + part.start, end: valueStart + part.end, valueStart, line, rawValue };
  }
  const ref = findVarRefs(rawValue)[edit.refIndex];
  if (!ref || ref.name !== edit.fromName) {
    throw new PatchError("locator-mismatch", `var() reference ${edit.refIndex} of ${edit.decl.prop} is not ${edit.fromName}`, { line });
  }
  if (!/^--[A-Za-z0-9_-]+$/.test(edit.toName)) {
    throw new PatchError("unsupported-value-shape", `invalid token name ${edit.toName}`);
  }
  return {
    kind,
    decl: edit.decl,
    fromName: edit.fromName,
    toName: edit.toName,
    start: valueStart + ref.nameStart,
    end: valueStart + ref.nameEnd,
    valueStart,
    line,
    rawValue,
    newRawValue: replaceVarName(rawValue, edit.refIndex, edit.fromName, edit.toName),
  };
}

/**
 * Plan edits on one file.
 * source: { bytes, text, hasBom } (from readCssSource)
 * edits:  [{ decl, refIndex, fromName, toName, opId }]                       name (the default kind)
 *         [{ kind: "component", decl, component, fromText, toText, opId }]         a keyword
 *         [{ kind: "tokenize" | "restore", decl, component, fromText, toText, opId }] a literal and its token
 *         [{ kind: "insert", rule, property, value, opId }]
 *         [{ kind: "remove", decl, inserted, opId }]
 * Returns { newBytes, newText, spans } or throws PatchError. In a span,
 * `fromName` / `toName` are the old and the new text of its range.
 */
export function applyNameEdits(source, edits) {
  const spans = edits
    .map((edit, order) => ({ ...planEdit(source, edit), opId: edit.opId, order }))
    .map((span) => ({ ...span, byteStart: byteOffset(source.text, span.start, source.hasBom), byteEnd: byteOffset(source.text, span.end, source.hasBom) }))
    // Two inserts at one place keep the order they were asked in.
    .sort((a, b) => a.start - b.start || a.order - b.order);

  for (let i = 1; i < spans.length; i += 1) {
    if (spans[i].start < spans[i - 1].end) {
      throw new PatchError("duplicate-target", "two edits target the same bytes", {
        line: spans[i].line,
      });
    }
  }

  let newText = source.text;
  for (const span of [...spans].reverse()) {
    newText = newText.slice(0, span.start) + span.toName + newText.slice(span.end);
  }
  const newBytes = encodeCss(newText, source.hasBom);
  proveByteEdits(source.bytes, newBytes, spans);
  return { newBytes, newText, spans };
}

/** Proof 1: everything outside the planned byte ranges is identical. */
export function proveByteEdits(oldBytes, newBytes, spans) {
  let oldIndex = 0;
  let newIndex = 0;
  for (const span of spans) {
    const from = Buffer.from(span.fromName, "utf8");
    const to = Buffer.from(span.toName, "utf8");
    const keep = span.byteStart - oldIndex;
    if (keep < 0) throw new PatchError("proof-failed", "edit ranges overlap");
    if (!oldBytes.subarray(oldIndex, span.byteStart).equals(newBytes.subarray(newIndex, newIndex + keep))) {
      throw new PatchError("proof-failed", "bytes outside the edit ranges changed", { line: span.line });
    }
    newIndex += keep;
    if (!oldBytes.subarray(span.byteStart, span.byteEnd).equals(from)) {
      throw new PatchError("proof-failed", "old bytes at the edit range are not the old text", { line: span.line });
    }
    if (!newBytes.subarray(newIndex, newIndex + to.length).equals(to)) {
      throw new PatchError("proof-failed", "new bytes at the edit range are not the new text", { line: span.line });
    }
    oldIndex = span.byteEnd;
    newIndex += to.length;
  }
  if (!oldBytes.subarray(oldIndex).equals(newBytes.subarray(newIndex))) {
    throw new PatchError("proof-failed", "bytes after the last edit changed");
  }
}

function nodeSignature(node) {
  switch (node.type) {
    case "decl":
      return `decl|${node.prop}|${node.important ? "!" : ""}`;
    case "rule":
      return `rule|${node.selector}`;
    case "atrule":
      return `atrule|${node.name}|${node.params}`;
    case "comment":
      return `comment|${node.text}`;
    default:
      return node.type;
  }
}

/**
 * Proof 2: re-parse and compare the node sequence. Declarations the batch
 * removes are expected to be gone; declarations it adds are expected as the
 * last declarations of their rule, in the order of the spans.
 */
export function proveReparse(postcss, oldRoot, newText, spans) {
  const removed = new Set(spans.filter((span) => span.kind === "remove").map((span) => span.decl));
  const inserts = new Map();
  for (const span of spans) {
    if (span.kind !== "insert") continue;
    inserts.set(span.rule, [...(inserts.get(span.rule) ?? []), span]);
  }
  // What the new tree must contain, in order.
  const expected = [];
  const walk = (container) => {
    for (const node of container.nodes ?? []) {
      if (removed.has(node)) continue;
      if (node.type === "decl") {
        const oldRaw = node.raws.value?.raw ?? node.value;
        const own = spans.filter((span) => span.decl === node && span.kind !== "remove");
        expected.push({ signature: nodeSignature(node), raw: own.length ? applySpansToValue(oldRaw, own) : oldRaw, line: node.source?.start?.line });
        continue;
      }
      expected.push({ signature: nodeSignature(node), raw: null });
      if (node.nodes) walk(node);
      for (const span of inserts.get(node) ?? []) expected.push({ signature: `decl|${span.property}|`, raw: span.value, line: span.line, parent: nodeSignature(node) });
    }
  };
  walk(oldRoot);

  let newRoot;
  try {
    newRoot = postcss.parse(newText);
  } catch (error) {
    throw new PatchError("proof-failed", `patched text does not parse: ${error.message}`);
  }
  const newNodes = [];
  newRoot.walk((node) => newNodes.push(node));
  if (expected.length !== newNodes.length) {
    throw new PatchError("proof-failed", "node count is not what the edits predict");
  }
  for (let i = 0; i < expected.length; i += 1) {
    const want = expected[i];
    const got = newNodes[i];
    if (want.signature !== nodeSignature(got)) {
      throw new PatchError("proof-failed", `node ${i} changed shape`);
    }
    if (got.type !== "decl") continue;
    if ((got.raws.value?.raw ?? got.value) !== want.raw) {
      throw new PatchError("proof-failed", `declaration ${got.prop} has an unexpected value after patching`, { line: want.line });
    }
    // Same place in the sequence and the same parent: the added declaration closes the rule it was meant for.
    if (want.parent && (got.parent?.type !== "rule" || nodeSignature(got.parent) !== want.parent)) {
      throw new PatchError("proof-failed", `added declaration ${got.prop} is not inside its rule`, { line: want.line });
    }
  }
}

function applySpansToValue(rawValue, declSpans) {
  let value = rawValue;
  for (const span of [...declSpans].sort((a, b) => b.start - a.start)) {
    const localStart = span.start - span.valueStart;
    const localEnd = span.end - span.valueStart;
    if (rawValue.slice(localStart, localEnd) !== span.fromName) {
      throw new PatchError("proof-failed", "edit range does not hold the old text");
    }
    value = value.slice(0, localStart) + span.toName + value.slice(localEnd);
  }
  return value;
}

/** Full patch of one parsed file: plan, prove on bytes, prove by re-parse. */
export function patchFile(postcss, source, root, edits) {
  const result = applyNameEdits(source, edits);
  proveReparse(postcss, root, result.newText, result.spans);
  return result;
}
