// Byte-exact replacement of custom property names inside var() references.
//
// Only the bytes of the token name change. The result is proven twice:
// 1. on bytes, independently of PostCSS: the new file equals the old file with
//    exactly the planned byte ranges replaced;
// 2. by re-parsing: the node sequence is unchanged, untouched declarations keep
//    their raw values, and each target declaration has the expected new value.
import { findVarRefs, replaceVarName } from "../shared/value-refs.mjs";
import { byteOffset, encodeCss } from "./css-source.mjs";

export class PatchError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.code = code;
    this.details = details;
  }
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

/**
 * Plan name edits on one file.
 * source: { bytes, text, hasBom } (from readCssSource)
 * edits:  [{ decl, refIndex, fromName, toName, opId }]
 * Returns { newBytes, newText, spans } or throws PatchError.
 */
export function applyNameEdits(source, edits) {
  const spans = edits
    .map((edit) => {
      const { valueStart, rawValue } = locateDeclValue(source.text, edit.decl);
      const refs = findVarRefs(rawValue);
      const ref = refs[edit.refIndex];
      if (!ref || ref.name !== edit.fromName) {
        throw new PatchError(
          "locator-mismatch",
          `var() reference ${edit.refIndex} of ${edit.decl.prop} is not ${edit.fromName}`,
          { line: edit.decl.source.start.line },
        );
      }
      if (!/^--[A-Za-z0-9_-]+$/.test(edit.toName)) {
        throw new PatchError("unsupported-value-shape", `invalid token name ${edit.toName}`);
      }
      const start = valueStart + ref.nameStart;
      const end = valueStart + ref.nameEnd;
      return {
        opId: edit.opId,
        decl: edit.decl,
        fromName: edit.fromName,
        toName: edit.toName,
        start,
        end,
        valueStart,
        line: edit.decl.source.start.line,
        rawValue,
        newRawValue: replaceVarName(rawValue, edit.refIndex, edit.fromName, edit.toName),
        byteStart: byteOffset(source.text, start, source.hasBom),
        byteEnd: byteOffset(source.text, end, source.hasBom),
      };
    })
    .sort((a, b) => a.start - b.start);

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
      throw new PatchError("proof-failed", "old bytes at the edit range are not the old name", { line: span.line });
    }
    if (!newBytes.subarray(newIndex, newIndex + to.length).equals(to)) {
      throw new PatchError("proof-failed", "new bytes at the edit range are not the new name", { line: span.line });
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

/** Proof 2: re-parse and compare the node sequence. */
export function proveReparse(postcss, oldRoot, newText, spans) {
  const targetByDecl = new Map(spans.map((span) => [span.decl, span]));
  const oldNodes = [];
  oldRoot.walk((node) => oldNodes.push(node));
  let newRoot;
  try {
    newRoot = postcss.parse(newText);
  } catch (error) {
    throw new PatchError("proof-failed", `patched text does not parse: ${error.message}`);
  }
  const newNodes = [];
  newRoot.walk((node) => newNodes.push(node));
  if (oldNodes.length !== newNodes.length) {
    throw new PatchError("proof-failed", "node count changed after patching");
  }
  for (let i = 0; i < oldNodes.length; i += 1) {
    const before = oldNodes[i];
    const after = newNodes[i];
    if (nodeSignature(before) !== nodeSignature(after)) {
      throw new PatchError("proof-failed", `node ${i} changed shape`);
    }
    if (before.type !== "decl") continue;
    const oldRaw = before.raws.value?.raw ?? before.value;
    const newRaw = after.raws.value?.raw ?? after.value;
    const expected = targetByDecl.has(before)
      ? applySpansToValue(oldRaw, spans.filter((s) => s.decl === before))
      : oldRaw;
    if (newRaw !== expected) {
      throw new PatchError("proof-failed", `declaration ${before.prop} has an unexpected value after patching`, {
        line: before.source?.start?.line,
      });
    }
  }
}

function applySpansToValue(rawValue, declSpans) {
  let value = rawValue;
  for (const span of [...declSpans].sort((a, b) => b.start - a.start)) {
    const localStart = span.start - span.valueStart;
    const localEnd = span.end - span.valueStart;
    if (rawValue.slice(localStart, localEnd) !== span.fromName) {
      throw new PatchError("proof-failed", "edit range does not hold the old name");
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
