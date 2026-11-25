// Small source-text helpers for editing an array literal in place (a
// Storybook main config or a tsconfig.json) without reformatting anything
// else. Strings, template literals, comments and nested brackets are skipped,
// so a comma inside an element does not split it.
// Adapted from storybook-product-prototype/scripts/install_prototype_inspector.mjs.

/**
 * The elements of the array literal whose "[" is at openIndex, as
 * { start, end } source ranges (whitespace trimmed), plus the index of its
 * closing "]". Returns null when the array is not closed.
 */
export function readArrayElements(source, openIndex) {
  const elements = [];
  let depth = 0;
  let elementStart = openIndex + 1;
  const pushElement = (end) => {
    let start = elementStart;
    let stop = end;
    while (start < stop && /\s/.test(source[start])) start += 1;
    while (stop > start && /\s/.test(source[stop - 1])) stop -= 1;
    if (stop > start) elements.push({ start, end: stop });
  };
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      for (index += 1; index < source.length && source[index] !== char; index += 1) {
        if (source[index] === "\\") index += 1;
      }
    } else if (char === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index);
      if (index === -1) break;
    } else if (char === "/" && source[index + 1] === "*") {
      index = source.indexOf("*/", index + 2) + 1;
      if (index === 0) break;
    } else if ("([{".includes(char)) {
      depth += 1;
    } else if (")]}".includes(char)) {
      if (depth === 0) {
        pushElement(index);
        return { closeIndex: index, elements };
      }
      depth -= 1;
    } else if (char === "," && depth === 0) {
      pushElement(index);
      elementStart = index + 1;
    }
  }
  return null;
}

function indentOf(source, index) {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  return /^[ \t]*/.exec(source.slice(lineStart))[0];
}

/**
 * Source with `entry` appended as the last element of the array whose "[" is
 * at openIndex. Keeps the existing style: the new element gets the indentation
 * of the current last element, and a trailing comma only if the current last
 * element has one.
 */
export function appendElement(source, openIndex, entry) {
  const array = readArrayElements(source, openIndex);
  if (!array) throw new Error("array literal is not closed");
  const last = array.elements.at(-1);
  if (!last) {
    const closeIndent = indentOf(source, array.closeIndex);
    const inner = `${closeIndent}  `;
    const body = source.slice(openIndex + 1, array.closeIndex);
    if (body.includes("\n")) {
      return `${source.slice(0, openIndex + 1)}\n${inner}${entry}\n${closeIndent}${source.slice(array.closeIndex)}`;
    }
    return `${source.slice(0, openIndex + 1)}${entry}${source.slice(array.closeIndex)}`;
  }
  const indent = indentOf(source, last.start);
  const sameLine = !source.slice(openIndex, last.end).includes("\n");
  const comma = /^\s*,/.exec(source.slice(last.end));
  if (comma) {
    const insertAt = last.end + comma[0].length;
    return sameLine
      ? `${source.slice(0, insertAt)} ${entry},${source.slice(insertAt)}`
      : `${source.slice(0, insertAt)}\n${indent}${entry},${source.slice(insertAt)}`;
  }
  return sameLine
    ? `${source.slice(0, last.end)}, ${entry}${source.slice(last.end)}`
    : `${source.slice(0, last.end)},\n${indent}${entry}${source.slice(last.end)}`;
}

/**
 * Source with the element at `elementIndex` of the array whose "[" is at
 * openIndex removed, together with its separator and the whitespace that
 * `appendElement` put before it. Removing an element that `appendElement`
 * added gives back the text from before (except for an array that was empty
 * and spread over several lines).
 */
export function removeElement(source, openIndex, elementIndex) {
  const array = readArrayElements(source, openIndex);
  if (!array) throw new Error("array literal is not closed");
  const element = array.elements[elementIndex];
  if (!element) throw new Error(`array has no element ${elementIndex}`);
  const next = array.elements[elementIndex + 1];
  if (next) return source.slice(0, element.start) + source.slice(next.start);
  const previous = array.elements[elementIndex - 1];
  const trailingComma = /^\s*,/.exec(source.slice(element.end));
  if (trailingComma) {
    // `prev,\n  entry,` -> `prev,`: drop from just after the previous comma.
    const from = previous ? previous.end + /^\s*,/.exec(source.slice(previous.end))[0].length : openIndex + 1;
    return source.slice(0, from) + source.slice(element.end + trailingComma[0].length);
  }
  // `prev,\n  entry` -> `prev`: drop the comma that was added after the previous element too.
  return source.slice(0, previous ? previous.end : openIndex + 1) + source.slice(element.end);
}

/** Index of the "[" of the first `<key>: [` (or `"key": [`) outside strings and comments, or -1. */
export function findArrayOpen(source, key) {
  const masked = maskStringsAndComments(source);
  const pattern = new RegExp(`(?:^|[\\s,{])(?:"${key}"|'${key}'|${key})\\s*:\\s*\\[`, "g");
  const match = pattern.exec(masked);
  return match ? match.index + match[0].length - 1 : -1;
}

/** Same length as `source`; string bodies and comments replaced by spaces (key quotes kept). */
export function maskStringsAndComments(source) {
  let out = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      for (; end < source.length && source[end] !== char; end += 1) {
        if (source[end] === "\\") end += 1;
      }
      const body = source.slice(index, end + 1);
      // Keep short identifier-like strings (object keys such as "exclude").
      const closed = end < source.length;
      out += /^["'][A-Za-z_$][\w$]*["']$/.test(body) ? body : char + " ".repeat(body.length - (closed ? 2 : 1)) + (closed ? char : "");
      index = end;
    } else if (char === "/" && source[index + 1] === "/") {
      let end = source.indexOf("\n", index);
      if (end === -1) end = source.length;
      out += " ".repeat(end - index);
      index = end - 1;
    } else if (char === "/" && source[index + 1] === "*") {
      let end = source.indexOf("*/", index + 2);
      end = end === -1 ? source.length : end + 2;
      out += source.slice(index, end).replace(/[^\n]/g, " ");
      index = end - 1;
    } else {
      out += char;
    }
  }
  return out;
}
