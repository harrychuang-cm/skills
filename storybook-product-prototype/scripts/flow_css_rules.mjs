// Rule-level parsing of the Prototype Inspector stylesheets, used to keep the
// UI Flow rules in flow-canvas.css (inspector-runtime-distribution, "UI Flow
// module set") and by install_prototype_inspector.mjs --ui-flow-only to find
// and remove UI Flow rules left in a project's prototype-inspector.css.
//
// A style rule targets the UI Flow when every selector in its list contains
// `.prototype-inspector--flow` or a `prototype-inspector__flow-` class outside
// parentheses, brackets and strings. An at-rule does when every rule inside it
// does, or when its prelude names a `prototype-inspector-flow` identifier
// (`@keyframes prototype-inspector-flow-dash`). A selector list that mixes both
// kinds, or a selector that names a UI Flow class only inside :not(), :is(),
// an attribute value or the like, is a mixed rule: it may style other modes, so
// it is listed and never removed.
//
// This is not a general CSS parser: it understands comments, strings, nested
// blocks and parenthesised selector arguments, which is all these stylesheets
// use, and throws on unbalanced braces instead of guessing.

const flowSelectorPattern = /\.prototype-inspector--flow(?![\w-])|\.prototype-inspector__flow-/;
// prototype-inspector-flow or prototype-inspector-flow-<name>, as a whole
// identifier (not prototype-inspector-flowchart).
const flowAtRulePattern = /(?<![\w-])prototype-inspector-flow(?![A-Za-z0-9_])/;
const keyframesPattern = /^@(?:-webkit-)?keyframes\b/;

function lineAt(source, index) {
  let line = 1;

  for (let position = 0; position < index; position += 1) {
    if (source.charCodeAt(position) === 10) {
      line += 1;
    }
  }
  return line;
}

// The text with comments and string contents blanked out (same length), so
// braces, semicolons and commas inside them never count.
function maskCommentsAndStrings(source) {
  let masked = "";
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);

      if (end < 0) {
        throw new Error(`Unterminated comment at line ${lineAt(source, index)}.`);
      }
      masked += source.slice(index, end + 2).replace(/[^\n]/g, " ");
      index = end + 2;
      continue;
    }

    const char = source[index];

    // An escaped character (\{ in a selector) is never structural.
    if (char === "\\" && index + 1 < source.length) {
      masked += source[index + 1] === "\n" ? "\\\n" : "\\_";
      index += 2;
      continue;
    }

    if (char === '"' || char === "'") {
      let end = index + 1;

      while (end < source.length && source[end] !== char) {
        end += source[end] === "\\" ? 2 : 1;
      }
      if (end >= source.length) {
        throw new Error(`Unterminated string at line ${lineAt(source, index)}.`);
      }
      masked += char + source.slice(index + 1, end).replace(/[^\n]/g, " ") + char;
      index = end + 1;
      continue;
    }

    masked += char;
    index += 1;
  }
  return masked;
}

// The text without its comments (each replaced by a space); strings stay,
// comment markers inside them included.
function removeComments(text) {
  let output = "";
  let index = 0;
  let quote = null;

  while (index < text.length) {
    const char = text[index];

    if (char === "\\") {
      output += text.slice(index, index + 2);
      index += 2;
    } else if (quote) {
      if (char === quote) quote = null;
      output += char;
      index += 1;
    } else if (char === '"' || char === "'") {
      quote = char;
      output += char;
      index += 1;
    } else if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      output += " ";
      index = end < 0 ? text.length : end + 2;
    } else {
      output += char;
      index += 1;
    }
  }
  return output;
}

// Selectors of a list, split on commas outside parentheses and brackets.
export function splitSelectorList(prelude) {
  const masked = maskCommentsAndStrings(prelude);
  const selectors = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];

    if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      selectors.push(prelude.slice(start, index));
      start = index + 1;
    }
  }
  selectors.push(prelude.slice(start));
  return selectors
    .map((selector) => removeComments(selector).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// The selector with the contents of parentheses, brackets and strings
// removed: what is left names the elements the selector itself matches.
function outerSelector(selector) {
  let outer = "";
  let depth = 0;
  let quote = null;

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];

    if (char === "\\") {
      if (!quote && depth === 0) outer += selector.slice(index, index + 2);
      index += 1;
    } else if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (depth === 0) {
      outer += char;
    }
  }
  return outer;
}

// Whether a selector targets the UI Flow (names a UI Flow class outside
// parentheses, brackets and strings).
export function isFlowSelector(selector) {
  return flowSelectorPattern.test(outerSelector(selector));
}

// { isFlow, mixed, containsFlow } for a prelude and its block body (null for
// a statement).
function classify(prelude, body) {
  // A statement (no block) is never a style rule.
  if (body === null) {
    return { containsFlow: false, isFlow: false, mixed: false };
  }
  if (prelude.startsWith("@")) {
    if (flowAtRulePattern.test(prelude)) {
      return { containsFlow: true, isFlow: true, mixed: false };
    }
    // Keyframe steps (from, to, 50%) are not selectors.
    if (keyframesPattern.test(prelude)) {
      return { containsFlow: false, isFlow: false, mixed: false };
    }

    const inner = splitCssRules(body).filter((rule) => rule.kind === "rule" || rule.kind === "at-rule");
    const flowCount = inner.filter((rule) => rule.isFlow).length;

    return {
      containsFlow: inner.some((rule) => rule.containsFlow),
      isFlow: inner.length > 0 && flowCount === inner.length,
      mixed: inner.some((rule) => rule.mixed),
    };
  }

  const selectors = splitSelectorList(prelude);
  const flowCount = selectors.filter(isFlowSelector).length;
  const mentionsFlow = selectors.some((selector) => flowSelectorPattern.test(selector));
  const isFlow = flowCount > 0 && flowCount === selectors.length;

  return { containsFlow: isFlow, isFlow, mixed: mentionsFlow && !isFlow };
}

// Where text that closes at `end` really ends: after the rest of its line
// when that holds only whitespace and single-line comments, through the line
// break; otherwise `end` itself.
function restOfLine(text, end) {
  let index = end;

  while (index < text.length) {
    if (text[index] === " " || text[index] === "\t") {
      index += 1;
    } else if (text.startsWith("/*", index)) {
      const close = text.indexOf("*/", index + 2);

      if (close < 0 || text.slice(index, close).includes("\n")) return end;
      index = close + 2;
    } else if (text[index] === "\n") {
      return index + 1;
    } else if (text.startsWith("\r\n", index)) {
      return index + 2;
    } else {
      return end;
    }
  }
  return index;
}

// Top-level fragments of a stylesheet. Each fragment's text holds the comments
// and whitespace before it and the newline after it, so the texts concatenate
// back to the source exactly. kind is "rule", "at-rule", "statement" (an
// at-rule ending with a semicolon) or "trailing" (text after the last rule).
// line and bodyLine are 1-based lines of the prelude and of its "{".
export function splitCssRules(source) {
  const masked = maskCommentsAndStrings(source);
  const fragments = [];
  let fragmentStart = 0;
  let preludeStart = -1;
  let blockStart = -1;
  let depth = 0;

  const finish = (end, prelude, body) => {
    const stop = restOfLine(source, end);

    const normalizedPrelude = removeComments(prelude).replace(/\s+/g, " ").trim();
    const kind = body === null ? "statement" : normalizedPrelude.startsWith("@") ? "at-rule" : "rule";

    fragments.push({
      ...classify(normalizedPrelude, body),
      body,
      bodyLine: body === null ? null : lineAt(source, blockStart),
      kind,
      line: lineAt(source, preludeStart),
      selector: normalizedPrelude,
      text: source.slice(fragmentStart, stop),
    });
    fragmentStart = stop;
    preludeStart = -1;
  };

  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];

    if (depth === 0 && preludeStart < 0 && !/\s/.test(char)) {
      preludeStart = index;
    }
    if (char === "{") {
      if (depth === 0) {
        blockStart = index;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth < 0) {
        throw new Error(`Unbalanced "}" at line ${lineAt(source, index)}.`);
      }
      if (depth === 0) {
        finish(index + 1, source.slice(preludeStart, blockStart), source.slice(blockStart + 1, index));
      }
    } else if (char === ";" && depth === 0 && preludeStart >= 0) {
      finish(index + 1, source.slice(preludeStart, index), null);
    }
  }

  if (depth !== 0) {
    throw new Error(`Unbalanced "{" opened at line ${lineAt(source, blockStart)}.`);
  }
  if (fragmentStart < source.length) {
    fragments.push({
      body: null,
      bodyLine: null,
      containsFlow: false,
      isFlow: false,
      kind: "trailing",
      line: lineAt(source, fragmentStart),
      mixed: false,
      selector: "",
      text: source.slice(fragmentStart),
    });
  }
  return fragments;
}

// Whether a fragment from splitCssRules, or a selector list, targets the UI Flow.
export function isFlowRule(rule) {
  if (typeof rule === "string") {
    const prelude = rule.replace(/\s+/g, " ").trim();

    return classify(prelude, "").isFlow;
  }
  return Boolean(rule?.isFlow);
}

// What stays of a removed fragment: its leading comments up to the last blank
// line before the rule. Comments directly above a rule describe it and go
// with it; a comment a blank line separates (a section heading, say) stays.
// A comment, line breaks included, counts as non-blank text, so a blank line
// inside a comment is not a separator.
function detachedLeading(fragment) {
  const masked = maskCommentsAndStrings(fragment.text);
  const preludeStart = masked.search(/\S/);
  const leading = fragment.text.slice(0, preludeStart < 0 ? 0 : preludeStart);
  const lines = leading.replace(/\/\*[\s\S]*?\*\//g, (comment) => "x".repeat(comment.length));
  const last = [...lines.matchAll(/\r?\n[ \t]*(?=\r?\n)/g)].at(-1);

  if (!last) return "";
  const kept = leading.slice(0, last.index + (lines[last.index] === "\r" ? 2 : 1));

  return kept.trim() ? kept : "";
}

// The fragments' text without UI Flow rules, filtering at-rules that hold
// both kinds; atLineStart says whether the text before them ends a line. A
// removed fragment leaves its detached leading comments. When the output so
// far does not end a line (after an at-rule's "{", or after a kept rule on
// the same line), the line break the removed fragment carried is put back
// before the next kept text unless that text starts with its own.
function stripFragmentList(fragments, atLineStart) {
  let output = "";
  let lineStart = atLineStart;
  let pendingBreak = "";

  for (const fragment of fragments) {
    let piece = fragment.text;

    if (fragment.isFlow) {
      piece = detachedLeading(fragment);
      if (!piece && !lineStart && !pendingBreak) {
        pendingBreak =
          /^\r?\n/.exec(fragment.text)?.[0] ??
          /\r?\n$/.exec(fragment.text)?.[0] ??
          fragment.text.match(/\r?\n/g)?.at(-1) ??
          "";
      }
    } else if (fragment.kind === "at-rule" && fragment.containsFlow) {
      const masked = maskCommentsAndStrings(fragment.text);
      const openIndex = masked.indexOf("{");
      const closeIndex = masked.lastIndexOf("}");
      // A comment on the "{" line belongs to the at-rule's head.
      const headEnd = restOfLine(fragment.text, openIndex + 1);
      const bodyStart = fragment.text.slice(openIndex + 1, headEnd).trim() ? headEnd : openIndex + 1;

      piece =
        fragment.text.slice(0, bodyStart) +
        stripFragmentList(splitCssRules(fragment.text.slice(bodyStart, closeIndex)), bodyStart > openIndex + 1) +
        fragment.text.slice(closeIndex);
    }
    if (piece) {
      output += (/^\r?\n/.test(piece) ? "" : pendingBreak) + piece;
      pendingBreak = "";
      lineStart = piece.endsWith("\n");
    }
  }
  return output + pendingBreak;
}

// An at-rule fragment rebuilt with only the inner rules `keep` accepts; nested
// at-rules holding both kinds are filtered the same way.
function filterAtRule(fragment, keep) {
  const masked = maskCommentsAndStrings(fragment.text);
  const openIndex = masked.indexOf("{");
  const closeIndex = masked.lastIndexOf("}");
  const kept = splitCssRules(fragment.body)
    .map((rule) => {
      if (rule.kind === "at-rule" && rule.containsFlow && !rule.isFlow) {
        return filterAtRule(rule, keep);
      }
      return rule.kind === "trailing" || rule.kind === "statement" || keep(rule) ? rule.text : "";
    })
    .join("");

  return fragment.text.slice(0, openIndex + 1) + kept + fragment.text.slice(closeIndex);
}

function collectNested(fragments, predicate, prefix = "", lineOffset = 0) {
  const found = [];

  for (const fragment of fragments) {
    const line = fragment.line + lineOffset;

    if (predicate(fragment)) {
      found.push({ line, selector: prefix + fragment.selector });
    } else if (fragment.kind === "at-rule" && !keyframesPattern.test(fragment.selector)) {
      found.push(
        ...collectNested(
          splitCssRules(fragment.body),
          predicate,
          `${prefix}${fragment.selector} > `,
          fragment.bodyLine + lineOffset - 1,
        ),
      );
    }
  }
  return found;
}

// Every selector of a stylesheet's style rules, including those inside
// conditional at-rules; keyframe steps and statements are left out.
export function listSelectors(source) {
  return splitCssRules(source).flatMap((fragment) => {
    if (fragment.kind === "rule") {
      return splitSelectorList(fragment.selector);
    }
    if (fragment.kind === "at-rule" && !keyframesPattern.test(fragment.selector)) {
      return listSelectors(fragment.body);
    }
    return [];
  });
}

// UI Flow rules of a stylesheet, including those inside at-rules that also
// hold other rules: [{ selector, line }].
export function findFlowRules(source) {
  return collectNested(splitCssRules(source), (fragment) => fragment.isFlow);
}

// Mixed rules (UI Flow and other selectors in one list): [{ selector, line }].
export function findMixedRules(source) {
  return collectNested(splitCssRules(source), (fragment) => fragment.kind === "rule" && fragment.mixed);
}

// The stylesheet without its UI Flow rules. Each goes with the comments
// directly above it, the blank lines before it and the rest of its last
// line; comments a blank line separates from it, mixed rules and every other
// rule stay, and no two kept lines are joined.
export function stripFlowRules(source) {
  // A byte order mark belongs to the file, not to its first rule.
  if (source.startsWith("\uFEFF")) {
    return `\uFEFF${stripFlowRules(source.slice(1))}`;
  }
  return stripFragmentList(splitCssRules(source), true);
}

// The UI Flow rules and the rest, each in source order; an at-rule holding
// both kinds is split into one copy for each.
export function partitionFlowRules(source) {
  let flow = "";
  let rest = "";

  for (const fragment of splitCssRules(source)) {
    if (fragment.isFlow) {
      flow += fragment.text;
    } else if (fragment.kind === "at-rule" && fragment.containsFlow) {
      flow += filterAtRule(fragment, (rule) => rule.isFlow);
      rest += filterAtRule(fragment, (rule) => !rule.isFlow);
    } else {
      rest += fragment.text;
    }
  }
  return { flow, rest };
}
