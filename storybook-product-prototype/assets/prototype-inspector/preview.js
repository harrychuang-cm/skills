import {
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { computeFingerprint } from "../../scripts/prototype-review/fingerprint.mjs";
import {
  createStorybookGlobals,
  getPrototypeViewport,
  getRoutePreviewSource,
  openPrototypeExternalUrl,
  PrototypeFlow,
} from "./flow-canvas.js";
import {
  defaultPrototypeModeGlobalName,
  isRecord,
  normalizeComponentRoutes,
  normalizeRouteComponents,
  normalizeRoutes,
} from "./flow-canvas-geometry.js";

import "./prototype-inspector.css";

const prototypeInspectorModes = [
  { id: "story", label: "Story" },
  { id: "docs", label: "Docs" },
  { id: "flow", label: "UI Flow" },
  { id: "components", label: "Components" },
  { id: "data", label: "Data" },
];

const docDefinitions = [
  { docKey: "prd", id: "prd", label: "PRD" },
  { docKey: "uiSpec", id: "ui-spec", label: "UI Spec" },
  { docKey: "flowSpec", id: "flow-spec", label: "Flow Spec" },
  { docKey: "dataSpec", id: "data-spec", label: "Data Spec" },
  {
    docKey: "productionHandoff",
    id: "production-handoff",
    label: "Frontend Handoff",
  },
  {
    docKey: "implementationGuide",
    id: "implementation-guide",
    label: "Implementation Guide",
  },
  { docKey: "acceptance", id: "acceptance", label: "Acceptance" },
];

const prototypeComponentOriginLabels = {
  local: "new",
  promoted: "promoted",
  shared: "shared",
};

const prototypeComponentMissingStateLabel = "不在目前狀態";

const defaultPrototypeParameterName = "prototype";
const previewHighlightStyleAttribute = "data-pi-highlight";
const previewHighlightTargetAttribute = "data-pi-highlight-target";
const previewHighlightRingLayerAttribute = "data-pi-highlight-ring-layer";
const previewHighlightRingAttribute = "data-pi-highlight-ring";
const previewReverseListenersAttribute = "data-pi-reverse-listeners";
const defaultNodePreviewWidth = 375;

function getPrototypeMode(value) {
  return prototypeInspectorModes.some((mode) => mode.id === value)
    ? value
    : "story";
}

function getPrototypeParameter(context, parameterName) {
  const prototype = context.parameters?.[parameterName];
  return isRecord(prototype) ? prototype : null;
}

function pascalToKebab(value) {
  return String(value ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

const markdownHeadingPattern = /^(#{1,6})\s+(.*)$/;
const markdownListItemPattern = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const markdownTaskItemPattern = /^\[( |x|X)\]\s+(.*)$/;
const markdownHorizontalRulePattern = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const markdownTableDividerPattern =
  /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const markdownLinkPattern = /^(!?)\[([^\]]*)\]\(([^)\s]*)(?:\s+"([^"]*)")?\)$/;
const markdownInlineTokenPattern =
  /(`[^`]+`)|(!?\[[^\]]*\]\([^)]*\))|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(~~[^~]+~~)/g;

function renderInlineMarkdown(value, keyPrefix) {
  const text = String(value);
  const nodes = [];
  const pattern = new RegExp(markdownInlineTokenPattern.source, "g");
  let lastIndex = 0;
  let tokenIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${tokenIndex}`;
    tokenIndex += 1;

    if (token.startsWith("`")) {
      nodes.push(createElement("code", { key }, token.slice(1, -1)));
    } else if (token.startsWith("![") || token.startsWith("[")) {
      const linkMatch = markdownLinkPattern.exec(token);
      if (!linkMatch) {
        nodes.push(token);
      } else if (linkMatch[1] === "!") {
        nodes.push(
          createElement("img", {
            alt: linkMatch[2],
            key,
            src: linkMatch[3],
            title: linkMatch[4],
          }),
        );
      } else {
        nodes.push(
          createElement(
            "a",
            {
              href: linkMatch[3],
              key,
              rel: "noreferrer",
              target: "_blank",
              title: linkMatch[4],
            },
            renderInlineMarkdown(linkMatch[2], key),
          ),
        );
      }
    } else if (token.startsWith("**")) {
      nodes.push(
        createElement("strong", { key }, renderInlineMarkdown(token.slice(2, -2), key)),
      );
    } else if (token.startsWith("~~")) {
      nodes.push(
        createElement("del", { key }, renderInlineMarkdown(token.slice(2, -2), key)),
      );
    } else {
      nodes.push(
        createElement("em", { key }, renderInlineMarkdown(token.slice(1, -1), key)),
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function MarkdownInline({ value }) {
  return createElement(Fragment, null, renderInlineMarkdown(String(value), "inline"));
}

function parseMarkdownTableRow(line) {
  let text = line.trim();
  if (text.startsWith("|")) {
    text = text.slice(1);
  }
  if (text.endsWith("|") && !text.endsWith("\\|")) {
    text = text.slice(0, -1);
  }

  // Split on pipes only outside backtick code spans, honoring \| escapes, so
  // cells containing TypeScript unions like `'ok' | 'error'` stay intact.
  const cells = [];
  let current = "";
  let inCode = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\" && text[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (character === "`") {
      inCode = !inCode;
      current += character;
      continue;
    }
    if (character === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

function parseMarkdownTableAlignments(dividerLine) {
  return parseMarkdownTableRow(dividerLine).map((cell) => {
    const leading = cell.startsWith(":");
    const trailing = cell.endsWith(":");
    if (leading && trailing) {
      return "center";
    }
    if (trailing) {
      return "right";
    }
    return undefined;
  });
}

function parseMarkdownList(lines, startIndex, baseIndent, keyPrefix) {
  const items = [];
  let index = startIndex;
  let ordered = false;
  let startNumber = 1;

  while (index < lines.length) {
    const match = markdownListItemPattern.exec(lines[index]);
    if (!match) {
      break;
    }

    const indent = match[1].length;
    if (indent < baseIndent) {
      break;
    }

    if (indent > baseIndent && items.length > 0) {
      const nested = parseMarkdownList(
        lines,
        index,
        indent,
        `${keyPrefix}-${items.length - 1}`,
      );
      items[items.length - 1].children.push(nested.element);
      index = nested.nextIndex;
      continue;
    }

    if (items.length === 0) {
      ordered = /^\d/.test(match[2]);
      if (ordered) {
        startNumber = Number.parseInt(match[2], 10) || 1;
      }
    }

    const itemKey = `${keyPrefix}-${items.length}`;
    const taskMatch = markdownTaskItemPattern.exec(match[3]);
    if (taskMatch) {
      items.push({
        children: [
          createElement("input", {
            checked: taskMatch[1] !== " ",
            disabled: true,
            key: `${itemKey}-check`,
            readOnly: true,
            type: "checkbox",
          }),
          createElement(
            "span",
            { key: `${itemKey}-copy` },
            renderInlineMarkdown(taskMatch[2], itemKey),
          ),
        ],
        task: true,
      });
    } else {
      items.push({ children: renderInlineMarkdown(match[3], itemKey), task: false });
    }

    index += 1;
  }

  return {
    element: createElement(
      ordered ? "ol" : "ul",
      {
        key: keyPrefix,
        start: ordered && startNumber !== 1 ? startNumber : undefined,
      },
      items.map((item, itemIndex) =>
        createElement(
          "li",
          {
            className: item.task ? "prototype-inspector__markdown-task" : undefined,
            key: `${keyPrefix}-${itemIndex}`,
          },
          item.children,
        ),
      ),
    ),
    nextIndex: index,
  };
}

function parseMarkdownBlocks(lines, keyPrefix) {
  const blocks = [];
  let index = 0;

  if (keyPrefix === "block" && lines[0]?.trim() === "---") {
    let closing = 1;
    while (closing < lines.length && lines[closing].trim() !== "---") {
      closing += 1;
    }
    if (closing < lines.length) {
      index = closing + 1;
    }
  }

  while (index < lines.length) {
    const line = lines[index];
    const key = `${keyPrefix}-${index}`;

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push(
        createElement(
          "pre",
          { className: "prototype-inspector__markdown-code", key },
          createElement("code", { "data-language": language }, codeLines.join("\n")),
        ),
      );
      index += 1;
      continue;
    }

    if (
      line.trimStart().startsWith("|") &&
      index + 1 < lines.length &&
      lines[index + 1].includes("-") &&
      markdownTableDividerPattern.test(lines[index + 1])
    ) {
      const headerCells = parseMarkdownTableRow(line);
      const alignments = parseMarkdownTableAlignments(lines[index + 1]);
      const bodyRows = [];
      index += 2;
      while (index < lines.length && lines[index].trimStart().startsWith("|")) {
        bodyRows.push(parseMarkdownTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        createElement(
          "div",
          {
            className:
              "prototype-inspector__table-wrap prototype-inspector__markdown-table-wrap",
            key,
          },
          createElement(
            "table",
            {
              className:
                "prototype-inspector__table prototype-inspector__markdown-table",
            },
            createElement(
              "thead",
              null,
              createElement(
                "tr",
                null,
                headerCells.map((cell, cellIndex) =>
                  createElement(
                    "th",
                    {
                      key: `${key}-th-${cellIndex}`,
                      scope: "col",
                      style: alignments[cellIndex]
                        ? { textAlign: alignments[cellIndex] }
                        : undefined,
                    },
                    renderInlineMarkdown(cell, `${key}-th-${cellIndex}`),
                  ),
                ),
              ),
            ),
            createElement(
              "tbody",
              null,
              bodyRows.map((row, rowIndex) =>
                createElement(
                  "tr",
                  { key: `${key}-tr-${rowIndex}` },
                  row.map((cell, cellIndex) =>
                    createElement(
                      "td",
                      {
                        key: `${key}-td-${rowIndex}-${cellIndex}`,
                        style: alignments[cellIndex]
                          ? { textAlign: alignments[cellIndex] }
                          : undefined,
                      },
                      renderInlineMarkdown(cell, `${key}-td-${rowIndex}-${cellIndex}`),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      continue;
    }

    const headingMatch = markdownHeadingPattern.exec(line);
    if (headingMatch) {
      const headingTag = ["h2", "h3", "h4", "h5", "h6", "h6"][
        headingMatch[1].length - 1
      ];
      blocks.push(
        createElement(
          headingTag,
          { key },
          renderInlineMarkdown(headingMatch[2], key),
        ),
      );
      index += 1;
      continue;
    }

    if (markdownHorizontalRulePattern.test(line)) {
      blocks.push(createElement("hr", { key }));
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quoteLines = [];
      while (index < lines.length && lines[index].trimStart().startsWith(">")) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        createElement(
          "blockquote",
          { key },
          parseMarkdownBlocks(quoteLines, `${key}-quote`),
        ),
      );
      continue;
    }

    const listMatch = markdownListItemPattern.exec(line);
    if (listMatch) {
      const list = parseMarkdownList(lines, index, listMatch[1].length, key);
      blocks.push(list.element);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !markdownHeadingPattern.test(lines[index]) &&
      !markdownListItemPattern.test(lines[index]) &&
      !markdownHorizontalRulePattern.test(lines[index]) &&
      !lines[index].trimStart().startsWith("|") &&
      !lines[index].trimStart().startsWith(">") &&
      !lines[index].startsWith("```")
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(
      createElement(
        "p",
        { key },
        renderInlineMarkdown(paragraphLines.join(" "), key),
      ),
    );
  }

  return blocks;
}

function MarkdownDocument({ value }) {
  const blocks = parseMarkdownBlocks(String(value).split(/\r?\n/), "block");
  return createElement("article", { className: "prototype-inspector__markdown" }, blocks);
}

// figma-export review reads these on the Docs, Components and Data roots: those
// modes document the prototype, so they offer neither comments nor Figma export.
const documentationModeDeclarations = {
  "data-sbfx-comments": "unavailable",
  "data-sbfx-export": "unavailable",
};

function PrototypeDocs({ prototype }) {
  const availableDocs = docDefinitions.filter((doc) => {
    const value = prototype.docs?.[doc.docKey];
    return typeof value === "string" && value.trim().length > 0;
  });
  const [selectedDocId, setSelectedDocId] = useState(availableDocs[0]?.id ?? "");
  const normalizedDocId = availableDocs.some((doc) => doc.id === selectedDocId)
    ? selectedDocId
    : availableDocs[0]?.id ?? "";
  const selectedDoc = availableDocs.find((doc) => doc.id === normalizedDocId);
  const content = selectedDoc ? prototype.docs?.[selectedDoc.docKey] : undefined;

  if (!content) {
    return createElement(PrototypeEmpty, {
      declarations: documentationModeDeclarations,
      message: "No prototype documents found.",
    });
  }

  return createElement(
    "div",
    { className: "prototype-inspector prototype-inspector--docs", ...documentationModeDeclarations },
    createElement(PrototypeHeader, {
      eyebrow: prototype.id,
      title: prototype.title,
    }),
    createElement(
      "div",
      { className: "prototype-inspector__tabs", role: "tablist" },
      availableDocs.map((doc) =>
        createElement(
          "button",
          {
            "aria-selected": normalizedDocId === doc.id,
            className: "prototype-inspector__tab",
            key: doc.id,
            onClick: () => setSelectedDocId(doc.id),
            role: "tab",
            type: "button",
          },
          doc.label,
        ),
      ),
    ),
    createElement(
      "div",
      { className: "prototype-inspector__body" },
      createElement(MarkdownDocument, { value: content }),
    ),
  );
}

function PrototypeHeader({ eyebrow, title, description }) {
  return createElement(
    "header",
    { className: "prototype-inspector__header" },
    eyebrow
      ? createElement("p", { className: "prototype-inspector__eyebrow" }, eyebrow)
      : null,
    createElement("h2", null, title),
    description
      ? createElement("p", { className: "prototype-inspector__lead" }, description)
      : null,
  );
}

function getPrototypeComponentStoryId(component) {
  return typeof component.storyId === "string" && component.storyId.trim()
    ? component.storyId.trim()
    : "";
}

function getPrototypeComponentDocsPath(storyId) {
  const separatorIndex = storyId.lastIndexOf("--");

  return separatorIndex > 0
    ? `/docs/${storyId.slice(0, separatorIndex)}--docs`
    : "";
}

function getPrototypeComponentHighlightSelector(component, components) {
  const domSelector =
    typeof component.domSelector === "string" && component.domSelector.trim()
      ? component.domSelector.trim()
      : "";

  if (domSelector) {
    return domSelector;
  }

  const classPrefix =
    isRecord(components) &&
    typeof components.classPrefix === "string" &&
    components.classPrefix.trim()
      ? components.classPrefix.trim()
      : "";
  const componentName =
    typeof component.name === "string" && component.name.trim()
      ? component.name.trim()
      : "";

  return classPrefix && componentName
    ? `.${classPrefix}${pascalToKebab(componentName)}`
    : "";
}

/**
 * Declared alternative compositions: meta 頂層 `compositions`。`default` 是
 * 現行組裝的保留 id，宣告了也一律略過。
 */
function normalizePrototypeCompositions(prototype) {
  const list = Array.isArray(prototype.compositions)
    ? prototype.compositions
    : [];

  return list
    .filter(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === "string" &&
        entry.id.trim() &&
        entry.id !== "default",
    )
    .map((entry) => ({
      description:
        typeof entry.description === "string" ? entry.description : "",
      id: entry.id.trim(),
      label:
        typeof entry.label === "string" && entry.label.trim()
          ? entry.label.trim()
          : entry.id.trim(),
    }));
}

/** `components.componentDefaults`: 元件名 → { alternatives: [...] }。 */
function normalizePrototypeComponentDefaults(components) {
  if (!isRecord(components) || !isRecord(components.componentDefaults)) {
    return {};
  }

  const defaults = {};

  Object.entries(components.componentDefaults).forEach(([name, value]) => {
    if (!isRecord(value)) {
      return;
    }

    const alternatives = Array.isArray(value.alternatives)
      ? value.alternatives.filter(
          (entry) =>
            isRecord(entry) &&
            typeof entry.name === "string" &&
            typeof entry.compositionId === "string" &&
            entry.compositionId.trim(),
        )
      : [];
    const tokenSlots = Array.isArray(value.tokenSlots)
      ? value.tokenSlots.filter(
          (entry) =>
            isRecord(entry) &&
            typeof entry.slot === "string" &&
            entry.slot.startsWith("--") &&
            typeof entry.label === "string" &&
            entry.label.trim(),
        )
      : [];
    const propSlots = Array.isArray(value.propSlots)
      ? value.propSlots.filter(
          (entry) =>
            isRecord(entry) &&
            typeof entry.prop === "string" &&
            entry.prop &&
            typeof entry.label === "string" &&
            entry.label.trim() &&
            Array.isArray(entry.options),
        )
      : [];

    defaults[name] = {
      alternatives,
      propSlots,
      propSlotsNote:
        typeof value.propSlotsNote === "string" && value.propSlotsNote.trim()
          ? value.propSlotsNote.trim()
          : "",
      tokenSlots,
    };
  });

  return defaults;
}

/**
 * routes gate：alternative 宣告 routes 時只在列出的 route 生效——
 * 名稱鍵是全域的，範圍宣告防止「只換 intro 的 dialog」溢出到其他畫面。
 */
function findCompositionAlternative(
  componentDefaults,
  componentName,
  compositionId,
  routeId,
) {
  if (!compositionId || compositionId === "default") {
    return null;
  }

  const alternatives = componentDefaults?.[componentName]?.alternatives ?? [];

  return (
    alternatives.find(
      (entry) =>
        entry.compositionId === compositionId &&
        (!Array.isArray(entry.routes) ||
          !routeId ||
          entry.routes.includes(routeId)),
    ) ?? null
  );
}

/** 該方案替換了哪些元件名（pills 的 swap summary）。 */
function getCompositionSwapSummary(componentDefaults, compositionId) {
  return Object.entries(componentDefaults)
    .filter(([, value]) =>
      value.alternatives.some((entry) => entry.compositionId === compositionId),
    )
    .map(([name]) => name);
}

/**
 * 讀取預覽文件 prototype 根節點的 data-composition 戳記。
 * 回傳 null＝文件尚未就緒（再試）；回傳 ""＝已就緒但沒有戳記；
 * 其餘為戳記字串。任何例外都吞掉——絕不拋錯。
 */
function readPreviewCompositionStamp(iframe) {
  const doc = getPreviewHighlightDocument(iframe);

  if (!doc || !isPreviewHighlightDocumentReady(doc)) {
    return null;
  }

  try {
    const root = doc.querySelector("[data-prototype-root]");
    return root?.getAttribute("data-composition") ?? "";
  } catch (error) {
    return null;
  }
}

function getPrototypeStorybookPathUrl(path) {
  if (typeof window === "undefined" || !path) {
    return "";
  }

  const url = new URL(window.location.href);

  if (url.pathname.endsWith("/iframe.html")) {
    url.pathname = url.pathname.replace(/\/iframe\.html$/, "/");
  }

  url.hash = "";
  url.search = "";
  url.searchParams.set("path", path);
  url.searchParams.set(
    "globals",
    createStorybookGlobals({
      [defaultPrototypeModeGlobalName]: "story",
    }),
  );

  return url.toString();
}

function openPrototypeStorybookPath(path) {
  const url = getPrototypeStorybookPathUrl(path);
  if (!url) {
    return;
  }

  openPrototypeExternalUrl(url);
}

function prefersReducedMotion() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch (error) {
    return false;
  }
}

function getPreviewHighlightDocument(iframe) {
  try {
    const doc = iframe?.contentDocument;

    return doc?.body ? doc : null;
  } catch (error) {
    return null;
  }
}

function isPreviewHighlightDocumentReady(doc) {
  try {
    const root = doc.querySelector("#storybook-root");

    return Boolean(
      root &&
        root.childElementCount > 0 &&
        !doc.body.classList.contains("sb-show-preparing-story") &&
        !doc.body.classList.contains("sb-show-preparing-docs"),
    );
  } catch (error) {
    return false;
  }
}

function getPreviewHighlightAccent() {
  try {
    const source =
      document.querySelector(".prototype-inspector") ?? document.documentElement;
    const value = getComputedStyle(source)
      .getPropertyValue("--pi-sys-color-primary")
      .trim();

    return value || "#2563eb";
  } catch (error) {
    return "#2563eb";
  }
}

function ensurePreviewHighlightStyle(doc, accent) {
  try {
    const host = doc.head ?? doc.body;

    if (!host) {
      return;
    }

    const existing = doc.querySelector(
      `style[${previewHighlightStyleAttribute}]`,
    );

    if (existing && existing.getAttribute("data-pi-highlight-accent") === accent) {
      return;
    }

    const style = existing ?? doc.createElement("style");

    style.setAttribute(previewHighlightStyleAttribute, "true");
    style.setAttribute("data-pi-highlight-accent", accent);
    style.textContent = [
      `[${previewHighlightTargetAttribute}] {`,
      `  outline: 2px solid ${accent};`,
      "  outline-offset: 2px;",
      "  animation: prototype-inspector-highlight-pulse 1.4s ease-in-out infinite;",
      "}",
      "@keyframes prototype-inspector-highlight-pulse {",
      "  0%, 100% { outline-offset: 2px; }",
      "  50% { outline-offset: 5px; }",
      "}",
      "@media (prefers-reduced-motion: reduce) {",
      `  [${previewHighlightTargetAttribute}] {`,
      "    animation: none;",
      "  }",
      "}",
      `[${previewHighlightRingLayerAttribute}] {`,
      "  position: fixed;",
      "  inset: 0;",
      "  z-index: 2147483647;",
      "  pointer-events: none;",
      "}",
      `[${previewHighlightRingAttribute}] {`,
      "  position: fixed;",
      "  box-sizing: border-box;",
      `  border: 2px solid ${accent};`,
      "  border-radius: 6px;",
      "  pointer-events: none;",
      "}",
    ].join("\n");

    if (!existing) {
      host.append(style);
    }
  } catch (error) {
    // Highlighting is optional; an unavailable preview document is a no-op.
  }
}

function queryPreviewSelectorMatches(doc, selector) {
  try {
    return [...doc.querySelectorAll(selector)];
  } catch (error) {
    return [];
  }
}

function startPreviewHighlightRings(doc) {
  try {
    const win = doc.defaultView;

    if (!win || !doc.body) {
      return;
    }

    let layer = doc.querySelector(`[${previewHighlightRingLayerAttribute}]`);

    if (layer?.piRingFrame) {
      return;
    }

    if (!layer) {
      layer = doc.createElement("div");
      layer.setAttribute(previewHighlightRingLayerAttribute, "true");
      doc.body.append(layer);
    }

    const step = () => {
      try {
        const targets = [
          ...doc.querySelectorAll(`[${previewHighlightTargetAttribute}]`),
        ];

        if (targets.length === 0) {
          layer.piRingFrame = null;
          layer.remove();
          return;
        }

        while (layer.children.length < targets.length) {
          const ring = doc.createElement("div");

          ring.setAttribute(previewHighlightRingAttribute, "true");
          layer.append(ring);
        }

        while (layer.children.length > targets.length) {
          layer.lastElementChild.remove();
        }

        targets.forEach((target, index) => {
          const rect = target.getBoundingClientRect();
          const ring = layer.children[index];

          ring.style.left = `${rect.left - 4}px`;
          ring.style.top = `${rect.top - 4}px`;
          ring.style.width = `${rect.width + 8}px`;
          ring.style.height = `${rect.height + 8}px`;
        });
        layer.piRingFrame = win.requestAnimationFrame(step);
      } catch (error) {
        layer.piRingFrame = null;
      }
    };

    layer.piRingFrame = win.requestAnimationFrame(step);
  } catch (error) {
    // The ring layer is a visual enhancement; failures fall back to the outline.
  }
}

function clearPreviewHighlight(iframe) {
  const doc = getPreviewHighlightDocument(iframe);

  if (!doc) {
    return;
  }

  try {
    doc
      .querySelectorAll(`[${previewHighlightTargetAttribute}]`)
      .forEach((element) =>
        element.removeAttribute(previewHighlightTargetAttribute),
      );
  } catch (error) {
    // Highlighting is optional; an unavailable preview document is a no-op.
  }
}

function applyPreviewHighlight(iframe, selector, options) {
  const doc = getPreviewHighlightDocument(iframe);

  if (!doc || !selector || !isPreviewHighlightDocumentReady(doc)) {
    return null;
  }

  clearPreviewHighlight(iframe);
  ensurePreviewHighlightStyle(doc, getPreviewHighlightAccent());

  const matches = queryPreviewSelectorMatches(doc, selector);
  const shouldScroll = options?.scroll !== false;

  try {
    matches.forEach((element) =>
      element.setAttribute(previewHighlightTargetAttribute, "true"),
    );

    if (shouldScroll) {
      matches[0]?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    }
  } catch (error) {
    // Keep the resolved match count even if the browser rejects scrolling.
  }

  if (matches.length > 0) {
    startPreviewHighlightRings(doc);
  }

  return matches.length;
}

function countPreviewSelectorMatches(iframe, selector) {
  const doc = getPreviewHighlightDocument(iframe);

  if (!doc || !selector || !isPreviewHighlightDocumentReady(doc)) {
    return null;
  }

  return queryPreviewSelectorMatches(doc, selector).length;
}

function markPreviewHighlightElement(iframe, element) {
  const doc = getPreviewHighlightDocument(iframe);

  if (!doc || !element || !isPreviewHighlightDocumentReady(doc)) {
    return;
  }

  try {
    const marked = doc.querySelectorAll(`[${previewHighlightTargetAttribute}]`);

    if (marked.length === 1 && marked[0] === element) {
      return;
    }
  } catch (error) {
    // Fall through to a full re-mark when the current marks cannot be read.
  }

  clearPreviewHighlight(iframe);
  ensurePreviewHighlightStyle(doc, getPreviewHighlightAccent());

  try {
    element.setAttribute(previewHighlightTargetAttribute, "true");
    startPreviewHighlightRings(doc);
  } catch (error) {
    // Highlighting is optional; an unavailable preview document is a no-op.
  }
}

function isDeeperPreviewReverseHoverElement(element, current) {
  try {
    return element !== current && current.contains(element);
  } catch (error) {
    return false;
  }
}

function resolvePreviewReverseHoverMatch(target, entries) {
  if (
    !target ||
    typeof target.closest !== "function" ||
    !Array.isArray(entries)
  ) {
    return null;
  }

  let match = null;

  entries.forEach((entry, index) => {
    if (!entry?.selector) {
      return;
    }

    let element = null;

    try {
      element = target.closest(entry.selector);
    } catch (error) {
      element = null;
    }

    if (!element) {
      return;
    }

    if (!match || isDeeperPreviewReverseHoverElement(element, match.element)) {
      match = { element, index };
    }
  });

  return match;
}

function normalizeDataItems(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readPrototypeDataAuthority(markdown) {
  const unverified = (message) => ({ valid: false, fixtures: [], contracts: [], message });
  if (typeof markdown !== "string") {
    return unverified("Data authority unverified: no Data Spec registry was provided.");
  }
  // Ignore headings inside fences. Horizontal whitespace keeps an immediately
  // following JSON block from being swallowed by the heading match.
  let inSection = false;
  let sectionCount = 0;
  let fence = null;
  const blocks = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (fence) {
      const closer = new RegExp(`^[ \\t]*${fence.character}{${fence.length},}[ \\t]*$`);
      if (closer.test(line)) {
        if (fence.inSection) blocks.push({ language: fence.language, text: fence.lines.join("\n") });
        fence = null;
      } else if (fence.inSection) {
        fence.lines.push(line);
      }
      continue;
    }
    const opener = line.match(/^[ \t]*(`{3,}|~{3,})([^\r\n]*)$/);
    if (opener) {
      fence = { character: opener[1][0], length: opener[1].length, language: opener[2].trim(), inSection, lines: [] };
      continue;
    }
    if (/^##[ \t]+Data Authority[ \t]*$/.test(line)) {
      sectionCount += 1;
      inSection = true;
    } else if (/^#{1,2}[ \t]+/.test(line)) {
      inSection = false;
    }
  }
  if (sectionCount === 0) {
    return unverified("Data authority unverified: the legacy Data Spec has no Data Authority registry.");
  }
  if (sectionCount !== 1 || (fence && fence.inSection) || blocks.length !== 1 || blocks[0]?.language !== "json") {
    return unverified("Data authority unverified: Data Authority must contain exactly one complete JSON block.");
  }
  let registry;
  try {
    const payload = blocks[0].text;
    registry = JSON.parse(payload);
    // JSON.parse silently keeps the last duplicate key. Reject that ambiguity
    // before displaying any confirmation, matching the producer validator.
    const objectKeys = [];
    const tokens = /"(?:\\.|[^"\\])*"|[{}\[\]]/g;
    for (const match of payload.matchAll(tokens)) {
      const token = match[0];
      if (token === "{" || token === "[") {
        objectKeys.push(token === "{" ? new Set() : null);
      } else if (token === "}" || token === "]") {
        objectKeys.pop();
      } else if (/^\s*:/.test(payload.slice(match.index + token.length))) {
        const keys = objectKeys[objectKeys.length - 1];
        const key = JSON.parse(token);
        if (keys.has(key)) throw new Error("duplicate JSON key");
        keys.add(key);
      }
    }
  } catch {
    return unverified("Data authority unverified: the registry contains malformed JSON or duplicate keys.");
  }
  if (!isRecord(registry) || registry.schemaVersion !== 1 || !Array.isArray(registry.fixtures) || !Array.isArray(registry.contracts)) {
    return unverified("Data authority unverified: unsupported registry version or missing fixture/contract arrays.");
  }
  const statuses = new Set(["proposed", "open", "confirmed", "superseded"]);
  const kinds = new Set(["api", "analytics", "remote-config", "storage", "static"]);
  const nonempty = (value) =>
    typeof value === "string" && value.trim().length > 0 &&
    !["unknown", "pending", "tbd", "todo", "none", "n/a"].includes(value.trim().toLowerCase()) &&
    !/\[(?!(?:x|X| )?\])[^\]\n]+\](?!\()/.test(value);
  const validSource = (source) => {
    if (!isRecord(source) || !["reference", "revision", "confirmedBy", "confirmedOn"].every((key) => nonempty(source[key]))) return false;
    const date = source.confirmedOn;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  };
  const validRecord = (record) =>
    isRecord(record) && statuses.has(record.status) && nonempty(record.owner) &&
    (record.source === null || validSource(record.source)) &&
    (record.status !== "confirmed" || validSource(record.source));
  const contractIds = new Set();
  for (const contract of registry.contracts) {
    if (!validRecord(contract) || !nonempty(contract.id) || !kinds.has(contract.kind) || contractIds.has(contract.id)) {
      return unverified("Data authority unverified: a contract has invalid fields, duplicate id, or incomplete confirmation evidence.");
    }
    contractIds.add(contract.id);
  }
  const groups = new Set();
  for (const fixture of registry.fixtures) {
    if (!validRecord(fixture) || !nonempty(fixture.group) || fixture.values !== "fake" || !["ui-model", "transport"].includes(fixture.schemaScope) || groups.has(fixture.group)) {
      return unverified("Data authority unverified: a fixture has invalid fields, duplicate group, or incomplete confirmation evidence.");
    }
    if (fixture.contractId !== undefined && (!nonempty(fixture.contractId) || !contractIds.has(fixture.contractId))) {
      return unverified("Data authority unverified: a fixture references an unknown contract id.");
    }
    groups.add(fixture.group);
  }
  return {
    valid: true,
    fixtures: registry.fixtures,
    contracts: registry.contracts,
    message: "Fixture values are FAKE. Schema confirmation and source evidence are recorded separately; this view does not verify the external source.",
  };
}

function getFixtureAuthorityLabel(fixture, contracts) {
  if (fixture.contractId && contracts.some((contract) => contract.id === fixture.contractId && contract.status === "superseded")) {
    return "Unverified — references a superseded contract";
  }
  if (fixture.status === "confirmed") {
    return fixture.schemaScope === "transport" ? "Transport schema confirmed" : "UI model confirmed — no transport authority";
  }
  return `${fixture.schemaScope === "transport" ? "Transport schema" : "UI model"} ${fixture.status} — no transport authority`;
}

function PrototypeDataAuthority({ authority }) {
  return createElement(
    PrototypeDataSection,
    { title: "Data Authority · FAKE fixture values", description: authority.message },
    authority.valid
      ? createElement(
          Fragment,
          null,
          createElement(PrototypeDataTable, {
            emptyMessage: "No fixture groups are declared in this registry.",
            columns: [
              { key: "group", label: "Fixture group" },
              { key: "values", label: "Values", render: () => "FAKE" },
              { key: "schemaScope", label: "Schema scope" },
              { key: "status", label: "Authority", render: (fixture) => getFixtureAuthorityLabel(fixture, authority.contracts) },
              { key: "source", label: "Source evidence" },
              { key: "owner", label: "Owner" },
              { key: "contractId", label: "Contract id" },
            ],
            rows: authority.fixtures,
          }),
          createElement("h4", null, "Real Data Contract decisions"),
          createElement("p", null, "A confirmed API source may define a separate transport DTO that maps into a proposed UI model. Confirming that contract does not confirm or relabel the fixture shape."),
          createElement(PrototypeDataTable, {
            emptyMessage: "No real contracts are provided. UI and mock assembly can proceed using the classified Fake data.",
            columns: [
              { key: "id", label: "Contract id" },
              { key: "kind", label: "Kind" },
              { key: "status", label: "Decision status" },
              { key: "source", label: "Source evidence" },
              { key: "owner", label: "Decision owner" },
            ],
            rows: authority.contracts,
          }),
        )
      : createElement("p", null, "Treat local fixture values as FAKE. Do not derive transport authority from legacy metadata, free-text status, or product demo confirmation."),
  );
}

function formatDataValue(value) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatDataValue).join(", ") : "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).filter(
      ([, entryValue]) => entryValue !== undefined && entryValue !== null,
    );

    return entries.length > 0
      ? entries
          .map(([key, entryValue]) => `${key}: ${formatDataValue(entryValue)}`)
          .join(" / ")
      : "-";
  }

  return String(value);
}

function PrototypeDataSection({ children, description, title }) {
  return createElement(
    "section",
    { className: "prototype-inspector__data-section" },
    createElement(
      "header",
      { className: "prototype-inspector__data-section-header" },
      createElement("h3", null, title),
      description
        ? createElement("p", null, description)
        : null,
    ),
    children,
  );
}

function PrototypeDataKeyValues({ value }) {
  if (!isRecord(value)) {
    return null;
  }

  return createElement(
    "dl",
    { className: "prototype-inspector__data-summary" },
    Object.entries(value).map(([key, entryValue]) =>
      createElement(
        "div",
        { className: "prototype-inspector__data-summary-item", key },
        createElement("dt", null, key),
        createElement("dd", null, formatDataValue(entryValue)),
      ),
    ),
  );
}

function PrototypeDataTags({ value }) {
  const values = Array.isArray(value)
    ? value.filter((item) => item !== undefined && item !== null && item !== "")
    : value
      ? [value]
      : [];

  if (values.length === 0) {
    return "-";
  }

  return createElement(
    "ul",
    { className: "prototype-inspector__data-tags" },
    values.map((item) =>
      createElement("li", { key: formatDataValue(item) }, formatDataValue(item)),
    ),
  );
}

function PrototypeDataCode({ value }) {
  return createElement("code", null, formatDataValue(value));
}

function PrototypeDataTable({ columns, emptyMessage = "No data found.", rows }) {
  if (!rows || rows.length === 0) {
    return createElement(PrototypeEmpty, { message: emptyMessage });
  }

  return createElement(
    "div",
    {
      className:
        "prototype-inspector__table-wrap prototype-inspector__data-table-wrap",
    },
    createElement(
      "table",
      { className: "prototype-inspector__table" },
      createElement(
        "thead",
        null,
        createElement(
          "tr",
          null,
          columns.map((column) =>
            createElement("th", { key: column.key }, column.label),
          ),
        ),
      ),
      createElement(
        "tbody",
        null,
        rows.map((row, rowIndex) =>
          createElement(
            "tr",
            { key: row.id ?? row.name ?? row.route ?? row.endpoint ?? rowIndex },
            columns.map((column) =>
              createElement(
                "td",
                { key: column.key },
                column.render
                  ? column.render(row)
                  : formatDataValue(row[column.key]),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function PrototypeDataSchemas({ schemas }) {
  if (schemas.length === 0) {
    return null;
  }

  return createElement(
    PrototypeDataSection,
    {
      description:
        "Field descriptions for UI and mock use. Transport use requires confirmed transport source evidence in Data Authority.",
      title: "Data Schemas · scope governed by Data Authority",
    },
    createElement(
      "div",
      { className: "prototype-inspector__data-schema-list" },
      schemas.map((schema) =>
        createElement(
          "article",
          { className: "prototype-inspector__data-schema", key: schema.name },
          createElement(
            "header",
            { className: "prototype-inspector__data-schema-header" },
            createElement("h4", null, schema.name),
            schema.description
              ? createElement("p", null, schema.description)
              : null,
          ),
          createElement(PrototypeDataTable, {
            columns: [
              {
                key: "name",
                label: "Field",
                render: (field) =>
                  createElement(PrototypeDataCode, { value: field.name }),
              },
              {
                key: "type",
                label: "Type",
                render: (field) =>
                  createElement(PrototypeDataCode, { value: field.type }),
              },
              { key: "required", label: "Required" },
              { key: "source", label: "Source" },
              { key: "description", label: "Description" },
            ],
            emptyMessage: "No fields found.",
            rows: normalizeDataItems(schema.fields),
          }),
        ),
      ),
    ),
  );
}

function PrototypeData({ prototype }) {
  const routes = normalizeRoutes(prototype.flow);
  const data = isRecord(prototype.data) ? prototype.data : {};
  const authority = readPrototypeDataAuthority(prototype.docs?.dataSpec);
  const apiContracts = normalizeDataItems(
    data.apiContracts ?? data.apis ?? data.api,
  );
  const dataSources = normalizeDataItems(
    data.dataSources ?? data.sources ?? data.source,
  );
  const schemas = normalizeDataItems(data.schemas ?? data.schema);
  const routeDataRequirements = normalizeDataItems(
    data.routeDataRequirements ?? data.routeRequirements,
  );
  const stateRules = normalizeDataItems(data.stateRules ?? data.states);

  return createElement(
    "div",
    { className: "prototype-inspector prototype-inspector--data", ...documentationModeDeclarations },
    createElement(PrototypeHeader, {
      eyebrow: prototype.id,
      title: "Prototype Data",
      description:
        "FAKE fixture values, schema authority, source evidence, UI mapping, and integration decisions.",
    }),
    createElement(
      "div",
      { className: "prototype-inspector__data-body" },
      createElement(PrototypeDataAuthority, { authority }),
      isRecord(data.overview)
        ? createElement(
            PrototypeDataSection,
            {
              description:
                "UI data overview. Per-schema authority comes only from the Data Spec registry.",
              title: "Overview",
            },
            createElement(PrototypeDataKeyValues, {
              value: {
                ...data.overview,
                status: authority.valid ? "See Data Authority for each schema and contract decision" : "Data authority unverified",
              },
            }),
          )
        : null,
      apiContracts.length > 0
        ? createElement(
            PrototypeDataSection,
            {
              description:
                "Requested replacement points. These fields do not establish a real API contract; use confirmed transport sources from Data Authority.",
              title: "API Replacement Requirements",
            },
            createElement(PrototypeDataTable, {
              columns: [
                {
                  key: "method",
                  label: "Method",
                  render: (api) =>
                    createElement(PrototypeDataCode, { value: api.method }),
                },
                {
                  key: "endpoint",
                  label: "Endpoint",
                  render: (api) =>
                    createElement(PrototypeDataCode, { value: api.endpoint }),
                },
                { key: "usage", label: "Usage" },
                {
                  key: "routes",
                  label: "Routes",
                  render: (api) =>
                    createElement(PrototypeDataTags, { value: api.routes }),
                },
                {
                  key: "request",
                  label: "Request",
                  render: (api) =>
                    createElement(PrototypeDataCode, { value: api.request }),
                },
                {
                  key: "response",
                  label: "Response",
                  render: (api) =>
                    createElement(PrototypeDataCode, { value: api.response }),
                },
                {
                  key: "mock",
                  label: "Mock",
                  render: (api) =>
                    createElement(PrototypeDataCode, { value: api.mock }),
                },
              ],
              rows: apiContracts,
            }),
          )
        : null,
      dataSources.length > 0
        ? createElement(
            PrototypeDataSection,
            {
              description:
                "Source requirements and ownership notes. Unconfirmed refresh or source choices remain proposals; consult Data Authority.",
              title: "Data Sources",
            },
            createElement(PrototypeDataTable, {
              columns: [
                {
                  key: "id",
                  label: "Source",
                  render: (source) =>
                    createElement(PrototypeDataCode, { value: source.id }),
                },
                { key: "owner", label: "Owner" },
                { key: "source", label: "System" },
                { key: "refresh", label: "Refresh" },
                { key: "description", label: "Description" },
              ],
              rows: dataSources,
            }),
          )
        : null,
      createElement(PrototypeDataSchemas, { schemas }),
      routeDataRequirements.length > 0 || routes.length > 0
        ? createElement(
            PrototypeDataSection,
            {
              description:
                "Route-level UI mapping between screens, APIs, and required data.",
              title: "Route Data Map",
            },
            createElement(PrototypeDataTable, {
              columns: [
                {
                  key: "route",
                  label: "Route",
                  render: (route) =>
                    createElement(PrototypeDataCode, {
                      value: route.route ?? route.id,
                    }),
                },
                { key: "state", label: "State" },
                {
                  key: "api",
                  label: "API",
                  render: (route) =>
                    createElement(PrototypeDataCode, { value: route.api }),
                },
                {
                  key: "requiredData",
                  label: "Required Data",
                  render: (route) =>
                    createElement(PrototypeDataTags, {
                      value: route.requiredData,
                    }),
                },
              ],
              rows:
                routeDataRequirements.length > 0
                  ? routeDataRequirements
                  : routes.map((route) => ({
                      api: "-",
                      requiredData: [],
                      route: route.id,
                      state: route.title ?? route.id,
                    })),
            }),
          )
        : null,
      stateRules.length > 0
        ? createElement(
            PrototypeDataSection,
            {
              description:
                "Runtime state and edge cases that should stay deterministic in the prototype.",
              title: "State Rules",
            },
            createElement(PrototypeDataTable, {
              columns: [
                { key: "trigger", label: "Trigger" },
                {
                  key: "fixture",
                  label: "Fixture",
                  render: (rule) =>
                    createElement(PrototypeDataCode, { value: rule.fixture }),
                },
                { key: "uiBehavior", label: "UI Behavior" },
              ],
              rows: stateRules,
            }),
          )
        : null,
      isRecord(data.fixtures)
        ? createElement(
            PrototypeDataSection,
            {
              description:
                "FAKE local deterministic examples for Storybook and mock adapters, including when their schema has a confirmed transport source.",
              title: "Fake Fixture Summary",
            },
            createElement(PrototypeDataKeyValues, { value: data.fixtures }),
          )
        : null,
      createElement(
        PrototypeDataSection,
        {
          description:
            "Raw metadata remains available for debugging and future automation.",
          title: "Raw Payload",
        },
        createElement(
          "pre",
          { className: "prototype-inspector__code" },
          JSON.stringify(prototype.data ?? prototype, null, 2),
        ),
      ),
    ),
  );
}

function PrototypeComponentOriginBadge({ origin }) {
  const originVariant =
    typeof origin === "string" &&
    Object.prototype.hasOwnProperty.call(prototypeComponentOriginLabels, origin)
      ? origin
      : "";
  const label = originVariant
    ? prototypeComponentOriginLabels[originVariant]
    : typeof origin === "string" && origin.trim()
      ? origin.trim()
      : "unknown";
  const className = originVariant
    ? `prototype-inspector__components-origin prototype-inspector__components-origin--${originVariant}`
    : "prototype-inspector__components-origin";

  return createElement("span", { className }, label);
}

function PrototypeComponentStoryLinks({ component }) {
  const storyId = getPrototypeComponentStoryId(component);
  const storyTitle =
    typeof component.storyTitle === "string" && component.storyTitle.trim()
      ? component.storyTitle.trim()
      : "";
  const docsPath = storyId ? getPrototypeComponentDocsPath(storyId) : "";

  if (!storyId && !storyTitle) {
    return "-";
  }

  return createElement(
    "div",
    { className: "prototype-inspector__components-story" },
    storyTitle
      ? createElement(
          "span",
          { className: "prototype-inspector__components-story-title" },
          storyTitle,
        )
      : null,
    storyId
      ? createElement(
          "div",
          { className: "prototype-inspector__components-links" },
          createElement(
            "button",
            {
              "aria-label": `Open the ${formatDataValue(component.name)} story`,
              className: "prototype-inspector__components-link",
              onClick: () => openPrototypeStorybookPath(`/story/${storyId}`),
              title: `Open story ${storyId}`,
              type: "button",
            },
            "Story",
          ),
          docsPath
            ? createElement(
                "button",
                {
                  "aria-label": `Open the ${formatDataValue(component.name)} docs`,
                  className:
                    "prototype-inspector__components-link prototype-inspector__components-link--secondary",
                  onClick: () => openPrototypeStorybookPath(docsPath),
                  title: `Open docs ${docsPath}`,
                  type: "button",
                },
                "Docs",
              )
            : null,
        )
      : null,
  );
}

const prototypeReviewApiBasePath = "/prototype-review-api";
const prototypeReviewStaticBasePath = "/prototype-reviews";
const prototypeReviewDecisionVerbs = ["keep", "swap", "flag"];
// 批次間五副本分歧窗口的定位標記：每輪 inspector 變更遞增。
const prototypeInspectorBuildTag = "flow-comments-2026-10-06";
const prototypeTokenWhitelistPath = "/derived-token-whitelist.json";
const previewTokenOverridesAttribute = "data-pi-token-overrides";

/**
 * 試調覆寫注入：在預覽 iframe 注入 <style data-pi-token-overrides>，以
 * prototype 根 subtree 的 custom-property 覆寫生效（design 決策：槽位消費
 * 者散在面板與子元素，元件 selector scope 蓋不到 sibling；React inline
 * style 只設 --cm-font-size-setting-scale，首發槽無遮蔽疑慮，!important
 * 為保險）。空 map＝移除節點。文件未就緒回 false（呼叫端重試）。
 */
function applyPreviewTokenOverrides(iframe, slotMap) {
  const doc = getPreviewHighlightDocument(iframe);

  if (!doc || !isPreviewHighlightDocumentReady(doc)) {
    return false;
  }

  try {
    let style = doc.querySelector(`style[${previewTokenOverridesAttribute}]`);
    const declarations = Object.entries(slotMap);

    if (declarations.length === 0) {
      style?.remove();
      return true;
    }

    if (!style) {
      style = doc.createElement("style");
      style.setAttribute(previewTokenOverridesAttribute, "true");
      (doc.head ?? doc.body)?.appendChild(style);
    }

    style.textContent = `[data-prototype-root] {\n${declarations
      .map(([slot, token]) => `  ${slot}: var(${token}) !important;`)
      .join("\n")}\n}`;
    return true;
  } catch (error) {
    return false;
  }
}

const prototypePropWhitelistPath = "/prop-slot-whitelist.json";

/**
 * 讀取預覽文件根節點的 data-prop-overrides 誠實戳記。
 * null＝未就緒（再試）；否則為 {applied, rendered} 物件（缺戳記＝空物件）。
 */
function readPreviewPropOverridesStamp(iframe) {
  const doc = getPreviewHighlightDocument(iframe);

  if (!doc || !isPreviewHighlightDocumentReady(doc)) {
    return null;
  }

  try {
    const raw = doc
      .querySelector("[data-prototype-root]")
      ?.getAttribute("data-prop-overrides");

    if (!raw) {
      return { applied: {}, rendered: {} };
    }

    const parsed = JSON.parse(raw);

    return {
      applied: isRecord(parsed.applied) ? parsed.applied : {},
      rendered: isRecord(parsed.rendered) ? parsed.rendered : {},
    };
  } catch (error) {
    return { applied: {}, rendered: {} };
  }
}

/** prop 白名單靜態產物：dev 與 static build 同路徑（tokens staticDir）。 */
function usePrototypePropWhitelist(prototypeId) {
  const [whitelist, setWhitelist] = useState(null);

  useEffect(() => {
    let isActive = true;

    fetchPrototypeReviewJson(prototypePropWhitelistPath).then((data) => {
      if (isActive && isRecord(data) && isRecord(data.prototypes)) {
        setWhitelist(data.prototypes[prototypeId] ?? {});
      }
    });

    return () => {
      isActive = false;
    };
  }, [prototypeId]);

  return whitelist;
}

/** 白名單靜態產物：dev 與 static build 同路徑（tokens staticDir）。 */
function usePrototypeTokenWhitelist() {
  const [whitelist, setWhitelist] = useState(null);

  useEffect(() => {
    let isActive = true;

    fetchPrototypeReviewJson(prototypeTokenWhitelistPath).then((data) => {
      if (isActive && isRecord(data) && isRecord(data.slots)) {
        setWhitelist(data.slots);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  return whitelist;
}

/**
 * 試調沙盒：純 React state、永不持久化。overrides 為 slot → 候選 token。
 * comparing＝按住「對照」時暫停沙盒（已採用的 overrides 由呼叫端保持）。
 */
function usePrototypeTokenSandbox() {
  const [overrides, setOverrides] = useState({});
  const [isComparing, setIsComparing] = useState(false);

  const setSlot = useCallback((slot, token) => {
    setOverrides((current) => {
      const next = { ...current };

      if (token) {
        next[slot] = token;
      } else {
        delete next[slot];
      }

      return next;
    });
  }, []);

  const resetSlots = useCallback((slots) => {
    setOverrides((current) => {
      const next = { ...current };

      slots.forEach((slot) => {
        delete next[slot];
      });

      return next;
    });
  }, []);

  const resetAll = useCallback(() => setOverrides({}), []);

  return {
    count: Object.keys(overrides).length,
    isComparing,
    overrides,
    resetAll,
    resetSlots,
    setIsComparing,
    setSlot,
  };
}

/** 收集當前 route 生效的已採用 overrides（keep 決策的 tokenOverrides）。 */
function collectAdoptedTokenOverrides(view, routeId, componentRoute) {
  const slotMap = {};

  normalizeRouteComponents(componentRoute).forEach((component) => {
    if (typeof component.name !== "string" || !component.name) {
      return;
    }

    const entry = resolveReviewDecision(view, routeId, component.name);

    if (entry?.decision !== "keep") {
      return;
    }

    (entry.tokenOverrides ?? []).forEach((override) => {
      slotMap[override.slot] = override.to;
    });
  });

  return slotMap;
}
const prototypeReviewDecisionVerbLabels = {
  flag: "標記",
  keep: "保留",
  swap: "替換",
};

/**
 * meta 的 components＋compositions 區塊的 canonical 指紋——實作在共用模組
 * scripts/prototype-review/fingerprint.mjs（遞迴鍵排序後雜湊，瀏覽器與
 * node 端同值）。帳本存這個值；重載時不符代表 metadata 已變更、決策可能
 * 過期——只顯示警告，永不清除決策。
 */
function computePrototypeMetaFingerprint(prototype) {
  return computeFingerprint(prototype);
}

function createEmptyPrototypeReviewLedger(prototypeId, metaFingerprint) {
  return {
    confirm: { status: "pending" },
    defaults: {},
    history: [],
    metaFingerprint,
    prototypeId,
    routes: {},
    updatedAt: null,
  };
}

function normalizeReviewDecisionEntry(value) {
  if (
    !isRecord(value) ||
    !prototypeReviewDecisionVerbs.includes(value.decision)
  ) {
    return null;
  }

  const entry = { decision: value.decision };

  if (typeof value.swapToCompositionId === "string" && value.swapToCompositionId) {
    entry.swapToCompositionId = value.swapToCompositionId;
  }

  if (typeof value.note === "string" && value.note.trim()) {
    entry.note = value.note.trim();
  }

  if (typeof value.decidedBy === "string" && value.decidedBy) {
    entry.decidedBy = value.decidedBy;
  }

  if (typeof value.decidedAt === "string" && value.decidedAt) {
    entry.decidedAt = value.decidedAt;
  }

  // 與 server sanitizer 同步的欄位白名單：keep 條目的 tokenOverrides 與
  // propOverrides 必須收下，否則重載／儲存回讀會被靜默剝除（三處同步）。
  if (entry.decision === "keep" && Array.isArray(value.tokenOverrides)) {
    entry.tokenOverrides = value.tokenOverrides
      .filter(
        (override) =>
          isRecord(override) &&
          typeof override.slot === "string" &&
          typeof override.from === "string" &&
          typeof override.to === "string",
      )
      .map((override) => ({
        from: override.from,
        slot: override.slot,
        to: override.to,
      }));
  }

  if (entry.decision === "keep" && Array.isArray(value.propOverrides)) {
    entry.propOverrides = value.propOverrides
      .filter(
        (override) =>
          isRecord(override) &&
          typeof override.prop === "string" &&
          typeof override.from === "string" &&
          typeof override.to === "string",
      )
      .map((override) => ({
        from: override.from,
        prop: override.prop,
        to: override.to,
      }));
  }

  return entry;
}

function normalizeReviewDecisionMap(value) {
  if (!isRecord(value)) {
    return {};
  }

  const map = {};

  Object.entries(value).forEach(([name, entry]) => {
    const normalized = normalizeReviewDecisionEntry(entry);

    if (normalized) {
      map[name] = normalized;
    }
  });

  return map;
}

function normalizePrototypeReviewLedger(value, prototypeId, metaFingerprint) {
  const empty = createEmptyPrototypeReviewLedger(prototypeId, metaFingerprint);

  if (!isRecord(value)) {
    return empty;
  }

  const routes = {};

  if (isRecord(value.routes)) {
    Object.entries(value.routes).forEach(([routeId, decisions]) => {
      const normalized = normalizeReviewDecisionMap(decisions);

      if (Object.keys(normalized).length > 0) {
        routes[routeId] = normalized;
      }
    });
  }

  return {
    confirm:
      isRecord(value.confirm) && value.confirm.status === "confirmed"
        ? {
            status: "confirmed",
            ...(typeof value.confirm.confirmedBy === "string"
              ? { confirmedBy: value.confirm.confirmedBy }
              : {}),
            ...(typeof value.confirm.confirmedAt === "string"
              ? { confirmedAt: value.confirm.confirmedAt }
              : {}),
          }
        : { status: "pending" },
    defaults: normalizeReviewDecisionMap(value.defaults),
    // history 唯讀顯示用（applied 徽章）；寫回時 server 一律忽略 body 的
    // history 並自磁碟續傳（server-authoritative）。
    history: Array.isArray(value.history)
      ? value.history.filter(isRecord)
      : [],
    metaFingerprint:
      typeof value.metaFingerprint === "string"
        ? value.metaFingerprint
        : metaFingerprint,
    prototypeId,
    routes,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

function getPrototypeReviewDraftStorageKey(prototypeId) {
  return `prototype-inspector:review-drafts:${prototypeId}`;
}

/** 草稿只進 localStorage；按下儲存才走 dev API。讀寫失敗一律靜默降級。 */
function readPrototypeReviewDrafts(prototypeId) {
  const empty = { defaults: {}, routes: {} };

  if (!prototypeId || typeof window === "undefined") {
    return empty;
  }

  try {
    const raw = window.localStorage.getItem(
      getPrototypeReviewDraftStorageKey(prototypeId),
    );

    if (!raw) {
      return empty;
    }

    const parsed = JSON.parse(raw);
    const routes = {};

    if (isRecord(parsed.routes)) {
      Object.entries(parsed.routes).forEach(([routeId, decisions]) => {
        const normalized = normalizeReviewDecisionMap(decisions);

        if (Object.keys(normalized).length > 0) {
          routes[routeId] = normalized;
        }
      });
    }

    return { defaults: normalizeReviewDecisionMap(parsed.defaults), routes };
  } catch (error) {
    return empty;
  }
}

function writePrototypeReviewDrafts(prototypeId, drafts) {
  if (!prototypeId || typeof window === "undefined") {
    return;
  }

  try {
    const key = getPrototypeReviewDraftStorageKey(prototypeId);
    const isEmpty =
      Object.keys(drafts.defaults).length === 0 &&
      Object.keys(drafts.routes).length === 0;

    if (isEmpty) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(drafts));
    }
  } catch (error) {
    // Draft persistence is a convenience; a blocked storage is a no-op.
  }
}

function areReviewDecisionsEqual(a, b) {
  if (!a || !b) {
    return false;
  }

  return (
    a.decision === b.decision &&
    (a.swapToCompositionId ?? "") === (b.swapToCompositionId ?? "") &&
    (a.note ?? "") === (b.note ?? "") &&
    JSON.stringify(a.tokenOverrides ?? []) ===
      JSON.stringify(b.tokenOverrides ?? []) &&
    JSON.stringify(a.propOverrides ?? []) ===
      JSON.stringify(b.propOverrides ?? [])
  );
}

/** 帳本＋草稿的合併視圖：草稿蓋過帳本、route 蓋過 defaults。 */
function mergePrototypeReviewView(ledger, drafts) {
  const routes = {};

  Object.entries(ledger.routes).forEach(([routeId, decisions]) => {
    routes[routeId] = { ...decisions };
  });
  Object.entries(drafts.routes).forEach(([routeId, decisions]) => {
    routes[routeId] = { ...(routes[routeId] ?? {}), ...decisions };
  });

  return {
    defaults: { ...ledger.defaults, ...drafts.defaults },
    routes,
  };
}

function countUnsavedReviewDrafts(ledger, drafts) {
  let count = 0;

  Object.entries(drafts.defaults).forEach(([name, entry]) => {
    if (!areReviewDecisionsEqual(ledger.defaults[name], entry)) {
      count += 1;
    }
  });
  Object.entries(drafts.routes).forEach(([routeId, decisions]) => {
    Object.entries(decisions).forEach(([name, entry]) => {
      if (!areReviewDecisionsEqual(ledger.routes[routeId]?.[name], entry)) {
        count += 1;
      }
    });
  });

  return count;
}

function resolveReviewDecision(view, routeId, componentName) {
  return (
    view.routes?.[routeId]?.[componentName] ??
    view.defaults?.[componentName] ??
    null
  );
}

/** 元件名 → 出現的 route id 集合（confirm 覆蓋率的分母）。 */
function collectPrototypeComponentNameRoutes(componentRoutes) {
  const map = new Map();

  componentRoutes.forEach((componentRoute) => {
    if (typeof componentRoute.route !== "string") {
      return;
    }

    normalizeRouteComponents(componentRoute).forEach((component) => {
      if (typeof component.name !== "string" || !component.name) {
        return;
      }

      if (!map.has(component.name)) {
        map.set(component.name, new Set());
      }

      map.get(component.name).add(componentRoute.route);
    });
  });

  return map;
}

/** defaults 有決策，或元件出現的每條 route 都有覆寫決策，才算已決。 */
function getUndecidedReviewComponents(view, nameRoutes) {
  const undecided = [];

  nameRoutes.forEach((routeIds, name) => {
    if (view.defaults[name]) {
      return;
    }

    const covered = [...routeIds].every((routeId) =>
      Boolean(view.routes[routeId]?.[name]),
    );

    if (!covered) {
      undecided.push(name);
    }
  });

  return undecided;
}

async function fetchPrototypeReviewJson(url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    return null;
  }
}

/**
 * 決策帳本的 client：dev API 讀寫（GET/PUT /prototype-review-api/<id>），
 * 靜態建置降級為唯讀（改讀 /prototype-reviews/<id>.json，儲存停用）。
 * 儲存送出「帳本＋草稿」的完整合併文件，所以重存單筆不會重置 confirm
 * 或其他決策。
 */
function usePrototypeReviewLedger(prototype) {
  const prototypeId =
    typeof prototype.id === "string" && prototype.id.trim()
      ? prototype.id.trim()
      : "";
  const metaFingerprint = useMemo(
    () => computePrototypeMetaFingerprint(prototype),
    [prototype],
  );
  const [ledger, setLedger] = useState(() =>
    createEmptyPrototypeReviewLedger(prototypeId, metaFingerprint),
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [drafts, setDrafts] = useState(() =>
    readPrototypeReviewDrafts(prototypeId),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!prototypeId) {
      setIsReadOnly(true);
      setIsLoaded(true);
      return undefined;
    }

    let isActive = true;

    const load = async () => {
      const fromApi = await fetchPrototypeReviewJson(
        `${prototypeReviewApiBasePath}/${prototypeId}`,
      );

      if (!isActive) {
        return;
      }

      if (fromApi) {
        setLedger(
          normalizePrototypeReviewLedger(fromApi, prototypeId, metaFingerprint),
        );
        setIsReadOnly(false);
        setIsLoaded(true);
        return;
      }

      const fromStatic = await fetchPrototypeReviewJson(
        `${prototypeReviewStaticBasePath}/${prototypeId}.json`,
      );

      if (!isActive) {
        return;
      }

      if (fromStatic) {
        setLedger(
          normalizePrototypeReviewLedger(
            fromStatic,
            prototypeId,
            metaFingerprint,
          ),
        );
      }

      setIsReadOnly(true);
      setIsLoaded(true);
    };

    load();

    return () => {
      isActive = false;
    };
  }, [metaFingerprint, prototypeId]);

  const applyDraft = useCallback(
    (componentName, entry, routeId) => {
      setDrafts((current) => {
        const next = routeId
          ? {
              ...current,
              routes: {
                ...current.routes,
                [routeId]: {
                  ...(current.routes[routeId] ?? {}),
                  [componentName]: entry,
                },
              },
            }
          : {
              ...current,
              defaults: { ...current.defaults, [componentName]: entry },
            };

        writePrototypeReviewDrafts(prototypeId, next);
        return next;
      });
    },
    [prototypeId],
  );

  // 捨棄草稿只動 localStorage，永不經 dev API（spec: Drafts are
  // discardable with two-step confirmation）。
  const discardDrafts = useCallback(() => {
    const empty = { defaults: {}, routes: {} };

    setDrafts(empty);
    writePrototypeReviewDrafts(prototypeId, empty);
  }, [prototypeId]);

  const discardDraft = useCallback(
    (componentName, routeId) => {
      setDrafts((current) => {
        const next = { defaults: { ...current.defaults }, routes: {} };

        Object.entries(current.routes).forEach(([id, decisions]) => {
          next.routes[id] = { ...decisions };
        });

        if (routeId) {
          delete next.routes[routeId]?.[componentName];

          if (
            next.routes[routeId] &&
            Object.keys(next.routes[routeId]).length === 0
          ) {
            delete next.routes[routeId];
          }
        } else {
          delete next.defaults[componentName];
        }

        writePrototypeReviewDrafts(prototypeId, next);
        return next;
      });
    },
    [prototypeId],
  );

  const markRemainingKeep = useCallback(
    (componentNames) => {
      const decidedAt = new Date().toISOString();

      setDrafts((current) => {
        const defaults = { ...current.defaults };

        componentNames.forEach((name) => {
          defaults[name] = { decidedAt, decision: "keep" };
        });

        const next = { ...current, defaults };

        writePrototypeReviewDrafts(prototypeId, next);
        return next;
      });
    },
    [prototypeId],
  );

  const save = useCallback(
    async (options = {}) => {
      if (!prototypeId || isReadOnly || isSaving) {
        return false;
      }

      const merged = mergePrototypeReviewView(ledger, drafts);
      const payload = {
        confirm: options.confirm ?? ledger.confirm ?? { status: "pending" },
        defaults: merged.defaults,
        metaFingerprint,
        prototypeId,
        routes: merged.routes,
        updatedAt: new Date().toISOString(),
      };

      setIsSaving(true);
      setSaveError("");

      try {
        const response = await fetch(
          `${prototypeReviewApiBasePath}/${prototypeId}`,
          {
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          },
        );

        if (!response.ok) {
          let errorBody = null;

          try {
            errorBody = await response.json();
          } catch (parseError) {
            errorBody = null;
          }

          if (errorBody?.code === "EXECUTION_ACTIVE") {
            throw new Error(
              `EXECUTION_ACTIVE:執行請求 ${errorBody.requestId ?? ""} 進行中，帳本暫停寫入——執行完成後重新整理`,
            );
          }

          if (errorBody?.error?.includes?.("PROP_WHITELIST_STALE")) {
            throw new Error(
              "PROP_STALE:變體白名單過期或選項未宣告——請重跑 npm run build:prop-whitelist",
            );
          }

          throw new Error(`PUT failed with status ${response.status}`);
        }

        let stored = null;

        try {
          stored = await response.json();
        } catch (error) {
          stored = null;
        }

        setLedger(
          normalizePrototypeReviewLedger(
            stored ?? payload,
            prototypeId,
            metaFingerprint,
          ),
        );
        setDrafts({ defaults: {}, routes: {} });
        writePrototypeReviewDrafts(prototypeId, { defaults: {}, routes: {} });
        return true;
      } catch (error) {
        const message = String(error?.message ?? "");

        setSaveError(
          message.startsWith("EXECUTION_ACTIVE:") ||
            message.startsWith("PROP_STALE:")
            ? message.split(":").slice(1).join(":")
            : "儲存決策帳本失敗——請確認 Storybook dev server 是否在執行。",
        );
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [drafts, isReadOnly, isSaving, ledger, metaFingerprint, prototypeId],
  );

  const confirmReview = useCallback(
    () =>
      save({
        confirm: { confirmedAt: new Date().toISOString(), status: "confirmed" },
      }),
    [save],
  );

  const view = useMemo(
    () => mergePrototypeReviewView(ledger, drafts),
    [drafts, ledger],
  );
  const unsavedCount = useMemo(
    () => countUnsavedReviewDrafts(ledger, drafts),
    [drafts, ledger],
  );
  const isStale = Boolean(
    ledger.updatedAt && ledger.metaFingerprint !== metaFingerprint,
  );

  return {
    applyDraft,
    confirm: ledger.confirm,
    confirmReview,
    discardDraft,
    discardDrafts,
    drafts,
    isLoaded,
    isReadOnly,
    isSaving,
    isStale,
    history: ledger.history ?? [],
    ledgerView: { defaults: ledger.defaults, routes: ledger.routes },
    markRemainingKeep,
    prototypeId,
    save,
    saveError,
    unsavedCount,
    view,
  };
}

/** 未儲存草稿的名單（two-step 確認顯示用）：[{componentName, routeId|null}] */
function listUnsavedReviewDrafts(review) {
  const entries = [];

  Object.entries(review.drafts.defaults).forEach(([name, entry]) => {
    if (!areReviewDecisionsEqual(review.ledgerView.defaults[name], entry)) {
      entries.push({ componentName: name, routeId: null });
    }
  });
  Object.entries(review.drafts.routes).forEach(([routeId, decisions]) => {
    Object.entries(decisions).forEach(([name, entry]) => {
      if (
        !areReviewDecisionsEqual(review.ledgerView.routes[routeId]?.[name], entry)
      ) {
        entries.push({ componentName: name, routeId });
      }
    });
  });

  return entries;
}

/** 決策狀態三分類（過濾與計數共用）：undecided | decided | flagged。 */
function classifyReviewDecisionState(entry) {
  if (!entry) {
    return "undecided";
  }

  return entry.decision === "flag" ? "flagged" : "decided";
}

/** 逐 route 進度（rail 徽章用）：defaults 層決策計入該元件出現的每個 route。 */
function getRouteReviewStats(view, componentRoute) {
  const routeId = typeof componentRoute?.route === "string" ? componentRoute.route : "";
  const names = normalizeRouteComponents(componentRoute)
    .map((component) => component.name)
    .filter((name) => typeof name === "string" && name);
  let decided = 0;
  let hasFlag = false;
  let flagFromDefaults = false;

  names.forEach((name) => {
    const entry = resolveReviewDecision(view, routeId, name);

    if (entry) {
      decided += 1;
    }

    if (entry?.decision === "flag") {
      hasFlag = true;

      if (!view.routes?.[routeId]?.[name]) {
        flagFromDefaults = true;
      }
    }
  });

  return { decided, flagFromDefaults, hasFlag, total: names.length };
}

function PrototypeCompositionPills({
  componentDefaults,
  compositions,
  onSelect,
  selectedCompositionId,
}) {
  if (compositions.length === 0) {
    return null;
  }

  const pills = [
    { id: "default", label: "現行方案", swaps: [] },
    ...compositions.map((composition) => ({
      description: composition.description,
      id: composition.id,
      label: composition.label,
      swaps: getCompositionSwapSummary(componentDefaults, composition.id),
    })),
  ];

  return createElement(
    "div",
    {
      "aria-label": "方案對照",
      className: "prototype-inspector__composition-pills",
      role: "group",
    },
    pills.map((pill) =>
      createElement(
        "button",
        {
          "aria-pressed": pill.id === selectedCompositionId,
          className: "prototype-inspector__composition-pill",
          key: pill.id,
          onClick: () => onSelect(pill.id),
          title: pill.description || undefined,
          type: "button",
        },
        createElement("span", null, pill.label),
        pill.swaps.length > 0
          ? createElement(
              "span",
              {
                className: "prototype-inspector__composition-pill-swaps",
              },
              `替換：${pill.swaps.join("、")}`,
            )
          : null,
      ),
    ),
  );
}

function PrototypeReviewBar({ executionPlan, nameRoutes, onExecute, onOpenOverview, review }) {
  const undecided = getUndecidedReviewComponents(review.view, nameRoutes);
  const total = nameRoutes.size;
  const decidedCount = total - undecided.length;
  const isConfirmed = review.confirm?.status === "confirmed";
  // 破壞性操作 inline 二段式確認：第一次點進入確認態（列名單），第二次
  // 執行；點擊 bar 上其他任何位置取消。不用原生 confirm()。
  const [confirming, setConfirming] = useState(null);
  const draftEntries = listUnsavedReviewDrafts(review);
  const latestRound =
    review.history.length > 0
      ? review.history[review.history.length - 1]
      : null;
  const describeDrafts = draftEntries
    .map(
      (entry) =>
        `${entry.componentName}${entry.routeId ? `（${entry.routeId}）` : ""}`,
    )
    .join("、");

  const handleBarPointerDown = (event) => {
    if (
      confirming &&
      !(
        event.target instanceof Element &&
        event.target.closest("[data-review-confirming]")
      )
    ) {
      setConfirming(null);
    }
  };

  return createElement(
    "div",
    {
      className: "prototype-inspector__review-bar",
      onPointerDownCapture: handleBarPointerDown,
    },
    createElement(
      "span",
      { className: "prototype-inspector__review-stat" },
      `決策進度：${decidedCount}/${total}`,
    ),
    review.unsavedCount > 0
      ? createElement(
          "span",
          { className: "prototype-inspector__review-chip" },
          `${review.unsavedCount} 筆未儲存`,
        )
      : null,
    isConfirmed
      ? createElement(
          "span",
          {
            className:
              "prototype-inspector__review-chip prototype-inspector__review-chip--confirmed",
          },
          "已確認",
        )
      : null,
    latestRound
      ? createElement(
          "a",
          {
            className: "prototype-inspector__applied-badge",
            href: `${prototypeReviewStaticBasePath}/${latestRound.reportFile ?? ""}`,
            rel: "noopener",
            target: "_blank",
            title: "開啟本輪執行報告",
          },
          `第 ${latestRound.round} 輪已套用・${String(
            latestRound.appliedCommit ?? "",
          ).slice(0, 7)}・${String(latestRound.appliedAt ?? "").slice(0, 10)}`,
        )
      : null,
    createElement("span", {
      className: "prototype-inspector__review-spacer",
    }),
    createElement(
      "button",
      {
        className: "prototype-inspector__review-action",
        onClick: onOpenOverview,
        type: "button",
      },
      "決策總覽",
    ),
    !review.isReadOnly && review.unsavedCount > 0
      ? createElement(
          "button",
          {
            className:
              confirming === "discard"
                ? "prototype-inspector__review-action prototype-inspector__review-action--confirming"
                : "prototype-inspector__review-action",
            "data-review-confirming":
              confirming === "discard" ? "true" : undefined,
            onClick: () => {
              if (confirming === "discard") {
                review.discardDrafts();
                setConfirming(null);
              } else {
                setConfirming("discard");
              }
            },
            type: "button",
          },
          confirming === "discard"
            ? `確定捨棄 ${draftEntries.length} 筆草稿？（${describeDrafts}）`
            : "捨棄未儲存草稿",
        )
      : null,
    !review.isReadOnly && undecided.length > 0
      ? createElement(
          "button",
          {
            className:
              confirming === "bulk-keep"
                ? "prototype-inspector__review-action prototype-inspector__review-action--confirming"
                : "prototype-inspector__review-action",
            "data-review-confirming":
              confirming === "bulk-keep" ? "true" : undefined,
            onClick: () => {
              if (confirming === "bulk-keep") {
                review.markRemainingKeep(undecided);
                setConfirming(null);
              } else {
                setConfirming("bulk-keep");
              }
            },
            type: "button",
          },
          confirming === "bulk-keep"
            ? `確定將 ${undecided.length} 個未決元件全部標記保留？（${undecided.join("、")}）`
            : "其餘全部標記保留",
        )
      : null,
    !review.isReadOnly
      ? createElement(
          "button",
          {
            className: "prototype-inspector__review-action",
            disabled: review.isSaving || review.unsavedCount === 0,
            onClick: () => review.save(),
            type: "button",
          },
          review.isSaving ? "儲存中…" : "儲存決策",
        )
      : null,
    !review.isReadOnly && !isConfirmed
      ? createElement(
          "button",
          {
            className:
              "prototype-inspector__review-action prototype-inspector__review-action--confirm",
            disabled: review.isSaving || undecided.length > 0,
            onClick: () => review.confirmReview(),
            title:
              undecided.length > 0
                ? `尚有 ${undecided.length} 個元件未決策，無法確認`
                : undefined,
            type: "button",
          },
          undecided.length > 0
            ? `確認（${undecided.length} 個未決）`
            : "確認審閱",
        )
      : null,
    !review.isReadOnly
      ? createElement(
          "button",
          {
            className:
              confirming === "execute"
                ? "prototype-inspector__review-action prototype-inspector__review-action--confirming"
                : "prototype-inspector__review-action prototype-inspector__review-action--confirm",
            "data-review-confirming":
              confirming === "execute" ? "true" : undefined,
            disabled: !isConfirmed || review.isSaving,
            onClick: () => {
              if (confirming === "execute") {
                onExecute();
                setConfirming(null);
              } else {
                setConfirming("execute");
              }
            },
            title: !isConfirmed
              ? "先完成「確認審閱」才能執行決策"
              : undefined,
            type: "button",
          },
          confirming === "execute"
            ? `將執行 ${executionPlan.executable} 項可執行決策／${executionPlan.flags} 項標記轉人工跟進——確定建立執行請求？`
            : "執行決策",
        )
      : null,
    review.isReadOnly
      ? createElement(
          "span",
          { className: "prototype-inspector__review-note" },
          "唯讀模式：儲存需要 Storybook dev server（靜態版只能檢視已儲存的帳本）。",
        )
      : null,
    review.isStale
      ? createElement(
          "span",
          {
            className:
              "prototype-inspector__review-warning",
            role: "status",
          },
          "組成 metadata 在這些決策儲存後已變更——確認前請重新審閱。",
        )
      : null,
    review.saveError
      ? createElement(
          "span",
          { className: "prototype-inspector__review-warning", role: "alert" },
          review.saveError,
        )
      : null,
  );
}

/** 執行計畫計數：可執行＝swap＋帶 overrides 的 keep；flag 轉人工跟進。 */
function getExecutionPlan(view) {
  let executable = 0;
  let flags = 0;

  const countEntry = (entry) => {
    if (entry.decision === "flag") {
      flags += 1;
    } else if (
      entry.decision === "swap" ||
      (entry.decision === "keep" &&
        ((entry.tokenOverrides?.length ?? 0) > 0 ||
          (entry.propOverrides?.length ?? 0) > 0))
    ) {
      executable += 1;
    }
  };

  Object.values(view.defaults).forEach(countEntry);
  Object.values(view.routes).forEach((decisions) =>
    Object.values(decisions).forEach(countEntry),
  );

  return { executable, flags };
}

/**
 * 執行請求常駐 banner（spec: A confirmed ledger can request execution）：
 * request id、一鍵複製句、request 齡、取消；static 退化為只顯示複製句。
 * 文案如實——執行發生在設計師自己開的 AI 會話，不是一鍵執行。
 */
function PrototypeExecutionBanner({ onCancel, prototypeId, state }) {
  const copyPhrase = `執行 ${prototypeId} 的決策`;
  const [isCopied, setIsCopied] = useState(false);
  const handleCopy = () => {
    try {
      navigator.clipboard?.writeText(copyPhrase);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      // clipboard 不可用時使用者可手動選取句子。
    }
  };

  if (state.error) {
    return createElement(
      "div",
      {
        className:
          "prototype-inspector__token-banner prototype-inspector__token-banner--confirm",
        role: "alert",
      },
      createElement("span", null, state.error),
    );
  }

  return createElement(
    "div",
    { className: "prototype-inspector__execution-banner", role: "status" },
    createElement(
      "span",
      null,
      state.copyOnly
        ? "靜態版無法建立執行請求——請在你的 AI 會話貼上下方句子執行："
        : `等待執行（請求 ${state.request.id}・${state.request.requestedAt.slice(0, 16).replace("T", " ")}）：請在你的 AI 會話貼上下方句子執行，完成後重新整理本頁。`,
    ),
    createElement(
      "code",
      { className: "prototype-inspector__execution-phrase" },
      copyPhrase,
    ),
    createElement(
      "button",
      {
        className: "prototype-inspector__review-action",
        onClick: handleCopy,
        type: "button",
      },
      isCopied ? "已複製" : "複製句子",
    ),
    !state.copyOnly && onCancel
      ? createElement(
          "button",
          {
            className: "prototype-inspector__review-action",
            onClick: onCancel,
            type: "button",
          },
          "取消請求",
        )
      : null,
  );
}

function formatReviewDecisionChip(entry) {
  if (!entry) {
    return "";
  }

  if (entry.decision === "swap") {
    return `替換 → ${entry.swapToCompositionId ?? "?"}`;
  }

  return prototypeReviewDecisionVerbLabels[entry.decision] ?? entry.decision;
}

/** 選中非 default 方案時的 diff 摘要列：換了什麼＋理由（＋route 範圍）。 */
function PrototypeCompositionSummary({ componentDefaults, selectedCompositionId }) {
  if (selectedCompositionId === "default") {
    return null;
  }

  const rows = [];

  Object.entries(componentDefaults).forEach(([name, value]) => {
    value.alternatives.forEach((alternative) => {
      if (alternative.compositionId === selectedCompositionId) {
        rows.push({ alternative, name });
      }
    });
  });

  if (rows.length === 0) {
    return null;
  }

  return createElement(
    "div",
    { className: "prototype-inspector__composition-diff" },
    rows.map(({ alternative, name }) =>
      createElement(
        "p",
        {
          className: "prototype-inspector__composition-diff-row",
          key: `${name}:${alternative.name}`,
        },
        createElement("strong", null, `${name} → ${alternative.name}`),
        Array.isArray(alternative.routes)
          ? createElement(
              "span",
              { className: "prototype-inspector__composition-diff-scope" },
              `（僅 ${alternative.routes.join("、")}）`,
            )
          : null,
        typeof alternative.reason === "string" && alternative.reason
          ? createElement(
              "span",
              { className: "prototype-inspector__composition-diff-reason" },
              `理由：${alternative.reason}`,
            )
          : null,
      ),
    ),
  );
}

function formatOverviewDecisionCell(entry) {
  const overrideCount = entry.tokenOverrides?.length ?? 0;

  return `${formatReviewDecisionChip(entry)}${
    overrideCount > 0 ? `＋${overrideCount} 項樣式調整` : ""
  }`;
}

/**
 * confirm 前的唯讀決策總覽（spec: A read-only decision overview precedes
 * confirmation）：未決清單可跳轉、defaults 表與逐 route 覆寫分段；
 * 無編輯控件、無確認鈕——確認入口維持 review bar 單一。
 */
function PrototypeReviewOverview({ nameRoutes, onClose, onJump, review }) {
  const undecided = getUndecidedReviewComponents(review.view, nameRoutes);
  const isDraftEntry = (layerRouteId, name, entry) =>
    !areReviewDecisionsEqual(
      layerRouteId
        ? review.ledgerView.routes[layerRouteId]?.[name]
        : review.ledgerView.defaults[name],
      entry,
    );
  const renderDecisionTable = (layerRouteId, decisions) =>
    createElement(
      "table",
      { className: "prototype-inspector__overview-table" },
      createElement(
        "thead",
        null,
        createElement(
          "tr",
          null,
          ["元件", "決策", "替換目標", "備註", "狀態"].map((label) =>
            createElement("th", { key: label }, label),
          ),
        ),
      ),
      createElement(
        "tbody",
        null,
        Object.entries(decisions).map(([name, entry]) =>
          createElement(
            "tr",
            {
              "data-decision": entry.decision,
              key: name,
            },
            createElement("td", null, name),
            createElement("td", null, formatOverviewDecisionCell(entry)),
            createElement("td", null, entry.swapToCompositionId ?? "—"),
            createElement("td", null, entry.note ?? "—"),
            createElement(
              "td",
              null,
              isDraftEntry(layerRouteId, name, entry) ? "草稿" : "已存",
            ),
          ),
        ),
      ),
    );

  return createElement(
    "div",
    {
      className: "prototype-inspector__overview-backdrop",
      onClick: (event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      },
    },
    createElement(
      "div",
      {
        "aria-label": "決策總覽",
        "aria-modal": "true",
        className: "prototype-inspector__overview",
        role: "dialog",
      },
      createElement(
        "header",
        { className: "prototype-inspector__overview-header" },
        createElement("h3", null, "決策總覽"),
        createElement(
          "button",
          {
            className: "prototype-inspector__review-action",
            onClick: onClose,
            type: "button",
          },
          "關閉",
        ),
      ),
      undecided.length > 0
        ? createElement(
            "section",
            { className: "prototype-inspector__overview-section" },
            createElement("h4", null, `未決（${undecided.length}）`),
            createElement(
              "div",
              { className: "prototype-inspector__overview-undecided" },
              undecided.map((name) =>
                createElement(
                  "button",
                  {
                    className: "prototype-inspector__overview-jump",
                    key: name,
                    onClick: () => onJump(name),
                    type: "button",
                  },
                  name,
                ),
              ),
            ),
          )
        : createElement(
            "p",
            { className: "prototype-inspector__overview-complete" },
            "所有元件皆已決策。",
          ),
      Object.keys(review.view.defaults).length > 0
        ? createElement(
            "section",
            { className: "prototype-inspector__overview-section" },
            createElement("h4", null, "defaults 層決策"),
            renderDecisionTable(null, review.view.defaults),
          )
        : null,
      Object.entries(review.view.routes).map(([routeId, decisions]) =>
        Object.keys(decisions).length > 0
          ? createElement(
              "section",
              {
                className: "prototype-inspector__overview-section",
                key: routeId,
              },
              createElement("h4", null, `route 覆寫：${routeId}`),
              renderDecisionTable(routeId, decisions),
            )
          : null,
      ),
    ),
  );
}

/**
 * 變體試調段（spec: Component cards offer a variant sandbox）：宣告槽
 * only、選項下拉、切換走 iframe 重載（畫面狀態會重設——常駐說明）、
 * requested-vs-rendered 由 data-prop-overrides 戳記誠實呈現、「採用」才
 * 進 keep 決策草稿的 propOverrides。無任何自由值輸入。
 */
function PrototypeComponentPropSandbox({
  adoptedProps,
  appliedStamp,
  componentName,
  effectiveDecision,
  isReadOnly,
  isReplaced,
  onAdopt,
  onSelect,
  propSlots,
  replacedByName,
  sandboxValues,
  whitelistForComponent,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingKeep, setIsConfirmingKeep] = useState(false);
  const sandboxProps = Object.keys(sandboxValues);

  if (isReadOnly) {
    const savedOverrides = effectiveDecision?.propOverrides ?? [];

    if (savedOverrides.length === 0) {
      return null;
    }

    return createElement(
      "div",
      { className: "prototype-inspector__token-sandbox" },
      createElement(
        "p",
        { className: "prototype-inspector__token-readonly" },
        `已採用變體調整：${savedOverrides
          .map((override) => `${override.prop}: ${override.from} → ${override.to}`)
          .join("；")}`,
      ),
    );
  }

  const handleAdopt = () => {
    if (sandboxProps.length === 0) {
      return;
    }

    if (effectiveDecision?.decision !== "keep" && !isConfirmingKeep) {
      setIsConfirmingKeep(true);
      return;
    }

    const existing = (effectiveDecision?.decision === "keep"
      ? (effectiveDecision.propOverrides ?? [])
      : []
    ).filter((override) => !(override.prop in sandboxValues));
    const adopted = sandboxProps.map((prop) => ({
      from: whitelistForComponent?.[prop]?.authoredDefault ?? "",
      prop,
      to: sandboxValues[prop],
    }));

    onAdopt([...existing, ...adopted]);
    setIsConfirmingKeep(false);
  };

  return createElement(
    "div",
    { className: "prototype-inspector__token-sandbox" },
    createElement(
      "button",
      {
        "aria-expanded": isOpen,
        className: "prototype-inspector__decision-toggle",
        onClick: () => setIsOpen((open) => !open),
        type: "button",
      },
      `變體試調（${propSlots.length}）${
        sandboxProps.length > 0 ? `・${sandboxProps.length} 筆試調中` : ""
      }`,
    ),
    isOpen
      ? createElement(
          "div",
          { className: "prototype-inspector__token-body" },
          createElement(
            "p",
            { className: "prototype-inspector__decision-hint" },
            "切換變體會重載畫面（未儲存的畫面狀態會重設）。",
          ),
          isReplaced
            ? createElement(
                "p",
                { className: "prototype-inspector__decision-empty" },
                `此方案下 ${componentName} 由 ${replacedByName ?? "替代元件"} 渲染——變體覆寫已請求但未套用。`,
              )
            : null,
          propSlots.map(({ label, prop }) => {
            const info = whitelistForComponent?.[prop];

            if (!info) {
              return createElement(
                "p",
                { className: "prototype-inspector__decision-empty", key: prop },
                `${label}：白名單缺此槽——請重跑 npm run build:prop-whitelist。`,
              );
            }

            const baseValue = adoptedProps[prop] ?? info.authoredDefault;
            const selectedValue = sandboxValues[prop] ?? baseValue;
            const isUnapplied =
              prop in sandboxValues &&
              appliedStamp?.[prop] !== sandboxValues[prop];

            return createElement(
              "label",
              { className: "prototype-inspector__token-row", key: prop },
              createElement(
                "span",
                { className: "prototype-inspector__token-label" },
                label,
                isUnapplied
                  ? createElement(
                      "span",
                      { className: "prototype-inspector__token-value" },
                      "（已請求但未套用）",
                    )
                  : null,
              ),
              createElement(
                "select",
                {
                  disabled: isReplaced,
                  onChange: (event) => {
                    const value = event.target.value;

                    onSelect(prop, value === baseValue ? null : value);
                  },
                  value: selectedValue,
                },
                info.options.map((option) =>
                  createElement(
                    "option",
                    { key: option, value: option },
                    `${option}${option === info.authoredDefault ? "・現值" : ""}`,
                  ),
                ),
              ),
            );
          }),
          createElement(
            "div",
            { className: "prototype-inspector__token-actions" },
            createElement(
              "button",
              {
                className: "prototype-inspector__review-action",
                disabled: sandboxProps.length === 0,
                onClick: () => {
                  sandboxProps.forEach((prop) => onSelect(prop, null));
                  setIsConfirmingKeep(false);
                },
                type: "button",
              },
              "重設此卡",
            ),
            createElement(
              "button",
              {
                className: isConfirmingKeep
                  ? "prototype-inspector__decision-apply prototype-inspector__review-action--confirming"
                  : "prototype-inspector__decision-apply",
                disabled: sandboxProps.length === 0 || isReplaced,
                onClick: handleAdopt,
                type: "button",
              },
              isConfirmingKeep
                ? `採用將同時把 ${componentName} 標記為保留——確定？`
                : "採用此調整",
            ),
          ),
        )
      : null,
  );
}

/**
 * 樣式試調段（spec: Component cards offer a token style sandbox）：
 * 宣告槽 only、白名單下拉、沙盒即時注入、「採用」才進 keep 決策草稿。
 * 無任何自由值輸入。
 */
function PrototypeComponentTokenSandbox({
  adoptedOverrides,
  componentName,
  effectiveDecision,
  isReadOnly,
  isReplaced,
  onAdopt,
  replacedByName,
  sandbox,
  tokenSlots,
  whitelist,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingKeep, setIsConfirmingKeep] = useState(false);
  const [gapSlot, setGapSlot] = useState("");
  const cardSlots = tokenSlots.map((slotEntry) => slotEntry.slot);
  const sandboxSlots = cardSlots.filter((slot) => sandbox.overrides[slot]);

  if (isReadOnly) {
    const savedOverrides = effectiveDecision?.tokenOverrides ?? [];

    if (savedOverrides.length === 0) {
      return null;
    }

    return createElement(
      "div",
      { className: "prototype-inspector__token-sandbox" },
      createElement(
        "p",
        { className: "prototype-inspector__token-readonly" },
        `已採用樣式調整：${savedOverrides
          .map((override) => `${override.slot} → ${override.to}`)
          .join("；")}`,
      ),
    );
  }

  const handleAdopt = () => {
    if (sandboxSlots.length === 0) {
      return;
    }

    if (effectiveDecision?.decision !== "keep" && !isConfirmingKeep) {
      setIsConfirmingKeep(true);
      return;
    }

    const existing = (effectiveDecision?.decision === "keep"
      ? (effectiveDecision.tokenOverrides ?? [])
      : []
    ).filter((override) => !sandbox.overrides[override.slot]);
    const adopted = sandboxSlots.map((slot) => ({
      from: whitelist?.[slot]?.current?.token ?? slot,
      slot,
      to: sandbox.overrides[slot],
    }));

    onAdopt([...existing, ...adopted]);
    sandbox.resetSlots(cardSlots);
    setIsConfirmingKeep(false);
  };

  return createElement(
    "div",
    { className: "prototype-inspector__token-sandbox" },
    createElement(
      "button",
      {
        "aria-expanded": isOpen,
        className: "prototype-inspector__decision-toggle",
        onClick: () => setIsOpen((open) => !open),
        type: "button",
      },
      `樣式試調（${tokenSlots.length}）${
        sandboxSlots.length > 0 ? `・${sandboxSlots.length} 筆試調中` : ""
      }`,
    ),
    isOpen && isReplaced
      ? createElement(
          "p",
          { className: "prototype-inspector__decision-empty" },
          `此方案下 ${componentName} 由 ${replacedByName ?? "替代元件"} 渲染，試調無效果——切回渲染此元件的方案再調整。`,
        )
      : null,
    isOpen && !isReplaced
      ? createElement(
          "div",
          { className: "prototype-inspector__token-body" },
          tokenSlots.map(({ label, slot }) => {
            const info = whitelist?.[slot];

            if (!info) {
              return createElement(
                "p",
                {
                  className: "prototype-inspector__decision-empty",
                  key: slot,
                },
                `${label}：白名單缺此槽位——請重跑 npm run build:token-whitelist。`,
              );
            }

            const baseToken = adoptedOverrides[slot] ?? info.current.token;
            const selectedToken = sandbox.overrides[slot] ?? baseToken;
            const selectedResolved =
              info.allowed.find(
                (candidate) => candidate.token === selectedToken,
              )?.resolved ?? "";

            return createElement(
              "label",
              {
                className: "prototype-inspector__token-row",
                key: slot,
              },
              createElement(
                "span",
                { className: "prototype-inspector__token-label" },
                label,
                info.kind === "color"
                  ? createElement("span", {
                      className: "prototype-inspector__token-swatch",
                      style: { background: selectedResolved },
                    })
                  : createElement(
                      "code",
                      { className: "prototype-inspector__token-value" },
                      selectedResolved,
                    ),
              ),
              createElement(
                "select",
                {
                  onChange: (event) => {
                    const value = event.target.value;

                    if (value === "__gap") {
                      setGapSlot(slot);
                      return;
                    }

                    setGapSlot("");
                    sandbox.setSlot(slot, value === baseToken ? null : value);
                  },
                  value: selectedToken,
                },
                info.allowed.map((candidate) =>
                  createElement(
                    "option",
                    { key: candidate.token, value: candidate.token },
                    `${candidate.token.replace("--cm-sys-", "")}（${candidate.resolved}）${
                      candidate.token === info.current.token ? "・現值" : ""
                    }`,
                  ),
                ),
                createElement(
                  "option",
                  { value: "__gap" },
                  "找不到合適的 token…",
                ),
              ),
              gapSlot === slot
                ? createElement(
                    "span",
                    { className: "prototype-inspector__decision-hint" },
                    "白名單沒有合適的 token——請改用「標記」決策寫下期望值，交由 token 缺口裁定。",
                  )
                : null,
            );
          }),
          createElement(
            "div",
            { className: "prototype-inspector__token-actions" },
            createElement(
              "button",
              {
                className: "prototype-inspector__review-action",
                disabled: sandboxSlots.length === 0,
                onClick: () => {
                  sandbox.resetSlots(cardSlots);
                  setIsConfirmingKeep(false);
                },
                type: "button",
              },
              "重設此卡",
            ),
            createElement(
              "button",
              {
                className: isConfirmingKeep
                  ? "prototype-inspector__decision-apply prototype-inspector__review-action--confirming"
                  : "prototype-inspector__decision-apply",
                disabled: sandboxSlots.length === 0,
                onClick: handleAdopt,
                type: "button",
              },
              isConfirmingKeep
                ? `採用將同時把 ${componentName} 標記為保留——確定？`
                : "採用此調整",
            ),
          ),
        )
      : null,
  );
}

function decisionDrawerSeed(entry) {
  return {
    note: entry?.note ?? "",
    swapTo: entry?.swapToCompositionId ?? "",
    verb: entry?.decision ?? "",
  };
}

function PrototypeComponentDecisionDrawer({
  componentName,
  compositions,
  decisionAlternatives,
  effectiveDecision,
  isRouteOverride,
  onApply,
  review,
  routeId,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [seed, setSeed] = useState(() => decisionDrawerSeed(effectiveDecision));
  const [verb, setVerb] = useState(seed.verb);
  const [swapTo, setSwapTo] = useState(seed.swapTo);
  const [note, setNote] = useState(seed.note);
  const [routeOnly, setRouteOnly] = useState(false);
  const [hasExternalChange, setHasExternalChange] = useState(false);
  const isPristine =
    verb === seed.verb && swapTo === seed.swapTo && note === seed.note;

  const reseed = useCallback((entry) => {
    const nextSeed = decisionDrawerSeed(entry);

    setSeed(nextSeed);
    setVerb(nextSeed.verb);
    setSwapTo(nextSeed.swapTo);
    setNote(nextSeed.note);
    setHasExternalChange(false);
  }, []);

  // dirty-guard re-seed（spec: decision drawer）：抽屜收合或無本地編輯時
  // 跟上外部決策；展開且有未套用編輯時保留輸入、只顯示提示，重開才載入。
  useEffect(() => {
    const nextSeed = decisionDrawerSeed(effectiveDecision);

    if (
      nextSeed.verb === seed.verb &&
      nextSeed.swapTo === seed.swapTo &&
      nextSeed.note === seed.note
    ) {
      return;
    }

    if (!isOpen || isPristine) {
      reseed(effectiveDecision);
    } else {
      setHasExternalChange(true);
    }
  }, [effectiveDecision, isOpen, isPristine, reseed, seed]);

  const handleToggle = () => {
    setIsOpen((open) => {
      const next = !open;

      if (next && hasExternalChange) {
        reseed(effectiveDecision);
      }

      return next;
    });
  };

  const hasAlternatives = decisionAlternatives.length > 0;
  const swapCompositionIds = decisionAlternatives.map(
    (entry) => entry.compositionId,
  );
  const canApply =
    Boolean(verb) &&
    (verb !== "swap" || Boolean(swapTo)) &&
    (verb !== "flag" || Boolean(note.trim()));

  const handleApply = () => {
    if (!canApply) {
      return;
    }

    const entry = {
      decidedAt: new Date().toISOString(),
      decision: verb,
    };

    if (verb === "swap") {
      entry.swapToCompositionId = swapTo;
    }

    if (note.trim()) {
      entry.note = note.trim();
    }

    onApply(entry, routeOnly ? routeId : "");
    setIsOpen(false);
  };

  return createElement(
    "div",
    { className: "prototype-inspector__components-decision" },
    createElement(
      "button",
      {
        "aria-expanded": isOpen,
        className: "prototype-inspector__decision-toggle",
        onClick: handleToggle,
        type: "button",
      },
      effectiveDecision
        ? `決策：${formatReviewDecisionChip(effectiveDecision)}${
            isRouteOverride ? "（僅此 route）" : ""
          }`
        : "審閱決策",
    ),
    isOpen
      ? createElement(
          "div",
          { className: "prototype-inspector__decision-body" },
          createElement(
            "p",
            { className: "prototype-inspector__decision-layer" },
            routeOnly
              ? `將寫入：僅此 route（${routeId}）`
              : "將寫入：defaults 層（所有 route）",
          ),
          hasExternalChange
            ? createElement(
                "p",
                {
                  className: "prototype-inspector__decision-external",
                  role: "status",
                },
                "此元件的決策已在別處更新——關閉抽屜重開可載入最新。",
              )
            : null,
          createElement(
            "div",
            {
              "aria-label": `${componentName} 的決策`,
              className: "prototype-inspector__decision-verbs",
              role: "group",
            },
            prototypeReviewDecisionVerbs.map((candidate) =>
              createElement(
                "button",
                {
                  "aria-pressed": verb === candidate,
                  className: "prototype-inspector__decision-verb",
                  disabled:
                    review.isReadOnly ||
                    (candidate === "swap" && !hasAlternatives),
                  key: candidate,
                  onClick: () => setVerb(candidate),
                  type: "button",
                },
                prototypeReviewDecisionVerbLabels[candidate] ?? candidate,
              ),
            ),
          ),
          !hasAlternatives
            ? createElement(
                "p",
                { className: "prototype-inspector__decision-empty" },
                `${componentName} 未宣告候選元件——無法替換。請在 prototype meta 的 componentDefaults.${componentName}.alternatives 宣告候選，或以「保留／標記＋備註」記錄意見。`,
              )
            : null,
          verb === "swap" && hasAlternatives
            ? createElement(
                "label",
                { className: "prototype-inspector__decision-field" },
                "替換為方案",
                createElement(
                  "select",
                  {
                    disabled: review.isReadOnly,
                    onChange: (event) => setSwapTo(event.target.value),
                    value: swapTo,
                  },
                  createElement("option", { value: "" }, "選擇方案"),
                  swapCompositionIds.map((compositionId) =>
                    createElement(
                      "option",
                      { key: compositionId, value: compositionId },
                      compositions.find(
                        (composition) => composition.id === compositionId,
                      )?.label ?? compositionId,
                    ),
                  ),
                ),
              )
            : null,
          createElement(
            "label",
            { className: "prototype-inspector__decision-field" },
            verb === "flag" ? "備註（標記必填）" : "備註",
            createElement("textarea", {
              disabled: review.isReadOnly,
              onChange: (event) => setNote(event.target.value),
              placeholder:
                verb === "flag"
                  ? "版面／位置等工具外意見——標記備註會導向 UI spec 修訂。"
                  : "此決策的補充說明（選填）。",
              rows: 2,
              value: note,
            }),
          ),
          verb === "flag"
            ? createElement(
                "p",
                { className: "prototype-inspector__decision-hint" },
                "標記備註會導向 UI spec 修訂（涵蓋版面與位置類意見）。",
              )
            : null,
          createElement(
            "label",
            { className: "prototype-inspector__decision-scope" },
            createElement("input", {
              checked: routeOnly,
              disabled: review.isReadOnly,
              onChange: (event) => setRouteOnly(event.target.checked),
              type: "checkbox",
            }),
            `僅套用於此 route（${routeId}）——不勾則套用到所有 route（defaults 層）`,
          ),
          createElement(
            "button",
            {
              className: "prototype-inspector__decision-apply",
              disabled: review.isReadOnly || !canApply,
              onClick: handleApply,
              type: "button",
            },
            "套用為草稿",
          ),
        )
      : null,
  );
}

function PrototypeComponentCard({
  component,
  hidden,
  isHighlighted,
  isPreviewHovered,
  matchCount,
  onHighlightEnd,
  onHighlightStart,
  review,
  selector,
}) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!isPreviewHovered) {
      return;
    }

    try {
      cardRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    } catch (error) {
      // Scrolling the emphasized card into view is best-effort.
    }
  }, [isPreviewHovered]);

  const storyId = getPrototypeComponentStoryId(component);
  const storyTitle =
    typeof component.storyTitle === "string" && component.storyTitle.trim()
      ? component.storyTitle.trim()
      : "";
  const importPath =
    typeof component.importPath === "string" && component.importPath.trim()
      ? component.importPath.trim()
      : "";
  const note =
    typeof component.note === "string" && component.note.trim()
      ? component.note.trim()
      : "";
  const hasHighlight = Boolean(selector);
  const handleHighlightBlur = (event) => {
    if (
      event.relatedTarget instanceof Element &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    onHighlightEnd();
  };
  const handleHighlightMouseLeave = (event) => {
    const ownerDocument = event.currentTarget?.ownerDocument;

    if (
      ownerDocument?.activeElement instanceof Element &&
      event.currentTarget.contains(ownerDocument.activeElement)
    ) {
      return;
    }

    onHighlightEnd();
  };

  return createElement(
    "article",
    {
      className: isPreviewHovered
        ? "prototype-inspector__components-card prototype-inspector__components-card--preview-hover"
        : "prototype-inspector__components-card",
      "data-draft": review?.isDraft ? "true" : undefined,
      "data-highlightable": hasHighlight ? "true" : undefined,
      "data-highlighted": hasHighlight && isHighlighted ? "true" : undefined,
      "data-replaced": review?.replacedBy ? "true" : undefined,
      "data-review-component": review?.componentName || undefined,
      hidden: hidden || undefined,
      onBlur: hasHighlight ? handleHighlightBlur : undefined,
      onFocus: hasHighlight ? onHighlightStart : undefined,
      onMouseEnter: hasHighlight ? onHighlightStart : undefined,
      onMouseLeave: hasHighlight ? handleHighlightMouseLeave : undefined,
      ref: cardRef,
      tabIndex: hasHighlight ? 0 : undefined,
    },
    createElement(
      "header",
      { className: "prototype-inspector__components-card-header" },
      createElement(
        "span",
        { className: "prototype-inspector__components-name" },
        formatDataValue(component.name),
      ),
      createElement(PrototypeComponentOriginBadge, {
        origin: component.origin,
      }),
      review?.effectiveDecision
        ? createElement(
            "span",
            {
              className: review.isDraft
                ? "prototype-inspector__decision-chip prototype-inspector__decision-chip--draft"
                : "prototype-inspector__decision-chip",
              "data-decision": review.effectiveDecision.decision,
            },
            `${formatReviewDecisionChip(review.effectiveDecision)}${
              review.isRouteOverride ? "（僅此 route）" : ""
            }${review.isDraft ? "（草稿）" : ""}`,
          )
        : null,
      review?.isDraft && !review.api.isReadOnly
        ? createElement(
            "button",
            {
              className: "prototype-inspector__draft-restore",
              onClick: () =>
                review.api.discardDraft(
                  review.componentName,
                  review.draftLayerRouteId,
                ),
              title: "移除這筆未儲存草稿，回到已儲存的決策",
              type: "button",
            },
            "還原此草稿",
          )
        : null,
      hasHighlight &&
        isHighlighted &&
        typeof matchCount === "number" &&
        matchCount > 0
        ? createElement(
            "span",
            { className: "prototype-inspector__components-match-count" },
            `×${matchCount}`,
          )
        : null,
      hasHighlight && matchCount === 0
        ? createElement(
            "span",
            { className: "prototype-inspector__components-state-chip" },
            prototypeComponentMissingStateLabel,
          )
        : null,
    ),
    storyId || storyTitle
      ? createElement(PrototypeComponentStoryLinks, { component })
      : null,
    importPath
      ? createElement(
          "code",
          { className: "prototype-inspector__components-card-path" },
          importPath,
        )
      : null,
    note
      ? createElement(
          "p",
          { className: "prototype-inspector__components-card-note" },
          note,
        )
      : null,
    review?.replacedBy
      ? createElement(
          "div",
          { className: "prototype-inspector__replaced" },
          createElement(
            "span",
            { className: "prototype-inspector__replaced-badge" },
            `本方案中由 ${review.replacedBy.name} 替代`,
          ),
          !review.api.isReadOnly
            ? createElement(
                "button",
                {
                  className: "prototype-inspector__review-action",
                  disabled: review.adoptSwapDisabled,
                  onClick: review.onAdoptSwap,
                  type: "button",
                },
                review.adoptSwapDisabled
                  ? "已是此決策"
                  : `就用這個替代（寫入：${
                      review.adoptSwapRouteOnly ? "僅此 route" : "defaults 層"
                    }）`,
              )
            : null,
        )
      : null,
    review
      ? createElement(PrototypeComponentDecisionDrawer, {
          componentName: review.componentName,
          compositions: review.compositions,
          decisionAlternatives: review.decisionAlternatives,
          effectiveDecision: review.effectiveDecision,
          isRouteOverride: review.isRouteOverride,
          // 穩定 key（route＋元件名）：套用草稿不再重掛抽屜；同步交給
          // 抽屜內的 dirty-guard re-seed（spec: decision drawer）。
          key: `${review.routeId}:${review.componentName}`,
          onApply: review.onApply,
          review: review.api,
          routeId: review.routeId,
        })
      : null,
    review?.tokenSandbox
      ? createElement(PrototypeComponentTokenSandbox, {
          adoptedOverrides: review.tokenSandbox.adoptedOverrides,
          componentName: review.componentName,
          effectiveDecision: review.effectiveDecision,
          isReadOnly: review.api.isReadOnly,
          isReplaced: Boolean(review.replacedBy),
          key: `sandbox:${review.routeId}:${review.componentName}`,
          onAdopt: review.tokenSandbox.onAdopt,
          replacedByName: review.replacedBy?.name,
          sandbox: review.tokenSandbox.sandbox,
          tokenSlots: review.tokenSandbox.tokenSlots,
          whitelist: review.tokenSandbox.whitelist,
        })
      : null,
    review?.propSandbox
      ? createElement(PrototypeComponentPropSandbox, {
          adoptedProps: review.propSandbox.adoptedProps,
          appliedStamp: review.propSandbox.appliedStamp,
          componentName: review.componentName,
          effectiveDecision: review.effectiveDecision,
          isReadOnly: review.api.isReadOnly,
          isReplaced: Boolean(review.replacedBy),
          key: `props:${review.routeId}:${review.componentName}`,
          onAdopt: review.propSandbox.onAdopt,
          onSelect: review.propSandbox.onSelect,
          propSlots: review.propSandbox.propSlots,
          replacedByName: review.replacedBy?.name,
          sandboxValues: review.propSandbox.sandboxValues,
          whitelistForComponent: review.propSandbox.whitelistForComponent,
        })
      : review?.propSlotsNote
        ? createElement(
            "p",
            { className: "prototype-inspector__decision-hint" },
            review.propSlotsNote,
          )
        : null,
  );
}

function PrototypeComponents({ prototype }) {
  const components = isRecord(prototype.components)
    ? prototype.components
    : null;
  const flowRoutes = useMemo(
    () => normalizeRoutes(prototype.flow),
    [prototype.flow],
  );
  const componentRoutes = useMemo(
    () => normalizeComponentRoutes(prototype.components),
    [prototype.components],
  );
  const railRoutes = useMemo(() => {
    const componentRouteMap = new Map();

    componentRoutes.forEach((componentRoute) => {
      if (
        typeof componentRoute.route === "string" &&
        !componentRouteMap.has(componentRoute.route)
      ) {
        componentRouteMap.set(componentRoute.route, componentRoute);
      }
    });

    return flowRoutes.length > 0
      ? flowRoutes.map((route) => ({
          componentRoute: componentRouteMap.get(route.id),
          route,
        }))
      : componentRoutes
          .filter((componentRoute) => typeof componentRoute.route === "string")
          .map((componentRoute) => ({
            componentRoute,
            route: { id: componentRoute.route, title: componentRoute.route },
          }));
  }, [componentRoutes, flowRoutes]);
  const defaultRouteId =
    railRoutes.find(
      (section) => normalizeRouteComponents(section.componentRoute).length > 0,
    )?.route.id ??
    railRoutes[0]?.route.id ??
    "";
  const [selectedRouteId, setSelectedRouteId] = useState(defaultRouteId);
  const normalizedRouteId = railRoutes.some(
    (section) => section.route.id === selectedRouteId,
  )
    ? selectedRouteId
    : defaultRouteId;
  const selectedSection =
    railRoutes.find((section) => section.route.id === normalizedRouteId) ??
    null;
  const compositionsList = useMemo(
    () => normalizePrototypeCompositions(prototype),
    [prototype],
  );
  const componentDefaults = useMemo(
    () => normalizePrototypeComponentDefaults(prototype.components),
    [prototype.components],
  );
  const nameRoutes = useMemo(
    () => collectPrototypeComponentNameRoutes(componentRoutes),
    [componentRoutes],
  );
  const review = usePrototypeReviewLedger(prototype);
  const tokenWhitelist = usePrototypeTokenWhitelist();
  const tokenSandbox = usePrototypeTokenSandbox();
  const propWhitelist = usePrototypePropWhitelist(review.prototypeId);
  // 變體沙盒：component → prop → 候選值；選了即經 URL 重載真實渲染，
  // 「採用」才進決策草稿。
  const [propSandbox, setPropSandbox] = useState({});
  const [renderedPropStamp, setRenderedPropStamp] = useState(null);
  const setPropSandboxValue = useCallback((componentName, prop, value) => {
    setPropSandbox((current) => {
      const next = { ...current, [componentName]: { ...current[componentName] } };

      if (value) {
        next[componentName][prop] = value;
      } else {
        delete next[componentName][prop];
      }

      if (Object.keys(next[componentName]).length === 0) {
        delete next[componentName];
      }

      return next;
    });
  }, []);
  const propSandboxCount = Object.values(propSandbox).reduce(
    (total, props) => total + Object.keys(props).length,
    0,
  );
  const [selectedCompositionId, setSelectedCompositionId] = useState("default");
  const [renderedCompositionStamp, setRenderedCompositionStamp] =
    useState(null);
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  // 執行請求（session 內）：POST 成功→常駐 banner；static POST 失敗→
  // 退化為複製句；409→顯示原因。
  const [executionState, setExecutionState] = useState(null);
  const executionPlan = useMemo(
    () => getExecutionPlan(review.view),
    [review.view],
  );
  const handleExecute = useCallback(async () => {
    try {
      const response = await fetch(
        `${prototypeReviewApiBasePath}/${review.prototypeId}/execution-requests`,
        { method: "POST" },
      );

      if (response.ok) {
        setExecutionState({ request: await response.json() });
        return;
      }

      let body = null;

      try {
        body = await response.json();
      } catch (parseError) {
        body = null;
      }

      if (body?.error) {
        setExecutionState({ error: body.error });
        return;
      }

      setExecutionState({ copyOnly: true });
    } catch (error) {
      setExecutionState({ copyOnly: true });
    }
  }, [review.prototypeId]);
  const handleCancelExecution = useCallback(async () => {
    const requestId = executionState?.request?.id;

    if (!requestId) {
      setExecutionState(null);
      return;
    }

    try {
      await fetch(
        `${prototypeReviewApiBasePath}/${review.prototypeId}/execution-requests/${requestId}`,
        {
          body: JSON.stringify({ status: "cancelled" }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
    } catch (error) {
      // 取消失敗時 banner 保留，使用者可重試。
      return;
    }

    setExecutionState(null);
  }, [executionState, review.prototypeId]);
  // 切 route/composition 時有未採用試調（token 或變體）→ 攔截確認。
  // pendingNav 保存確認後要執行的導航動作。
  const [pendingNav, setPendingNav] = useState(null);
  const sandboxTotalCount = tokenSandbox.count + propSandboxCount;
  const guardNav = useCallback(
    (action) => {
      if (tokenSandbox.count + propSandboxCount > 0) {
        setPendingNav(() => action);
      } else {
        action();
      }
    },
    [propSandboxCount, tokenSandbox.count],
  );
  const selectedEntries = useMemo(
    () =>
      normalizeRouteComponents(selectedSection?.componentRoute).map(
        (component) => {
          // 非 default 方案下，被替換元件的 highlight 要指向實際渲染的
          // 替代元件（alternative 的 domSelector 或 classPrefix 推導）。
          const alternative = findCompositionAlternative(
            componentDefaults,
            component.name,
            selectedCompositionId,
            normalizedRouteId,
          );

          return {
            alternative,
            component,
            selector: getPrototypeComponentHighlightSelector(
              alternative ?? component,
              components,
            ),
          };
        },
      ),
    [
      componentDefaults,
      components,
      normalizedRouteId,
      selectedCompositionId,
      selectedSection,
    ],
  );
  // 過濾計數：三分項互斥、相加＝全部；與 rail 徽章共用 resolve 函式。
  const decisionCounts = useMemo(() => {
    const counts = { all: 0, decided: 0, flagged: 0, undecided: 0 };

    selectedEntries.forEach((entry) => {
      const name =
        typeof entry.component.name === "string" ? entry.component.name : "";
      const state = classifyReviewDecisionState(
        name ? resolveReviewDecision(review.view, normalizedRouteId, name) : null,
      );

      counts.all += 1;
      counts[state] += 1;
    });

    return counts;
  }, [normalizedRouteId, review.view, selectedEntries]);
  // 已採用的 token overrides（帳本＋草稿的 keep 決策）＋沙盒的聯集注入；
  // 按住「對照」只暫停沙盒、已採用保持。
  const adoptedTokenOverrides = useMemo(
    () =>
      collectAdoptedTokenOverrides(
        review.view,
        normalizedRouteId,
        selectedSection?.componentRoute,
      ),
    [normalizedRouteId, review.view, selectedSection],
  );
  const activeTokenOverrides = useMemo(
    () =>
      tokenSandbox.isComparing
        ? adoptedTokenOverrides
        : { ...adoptedTokenOverrides, ...tokenSandbox.overrides },
    [adoptedTokenOverrides, tokenSandbox.isComparing, tokenSandbox.overrides],
  );
  // 已採用的變體覆寫（帳本＋草稿的 keep.propOverrides）與沙盒合併後
  // 一起走 URL——已採用的在儲存後仍持續反映於預覽。
  const adoptedPropOverrides = useMemo(() => {
    const map = {};

    normalizeRouteComponents(selectedSection?.componentRoute).forEach(
      (component) => {
        const name =
          typeof component.name === "string" ? component.name : "";

        if (!name) {
          return;
        }

        const entry = resolveReviewDecision(review.view, normalizedRouteId, name);

        if (entry?.decision !== "keep") {
          return;
        }

        (entry.propOverrides ?? []).forEach((override) => {
          map[name] = { ...map[name], [override.prop]: override.to };
        });
      },
    );

    return map;
  }, [normalizedRouteId, review.view, selectedSection]);
  const activePropOverrides = useMemo(() => {
    const merged = {};

    Object.entries(adoptedPropOverrides).forEach(([name, props]) => {
      merged[name] = { ...props };
    });
    Object.entries(propSandbox).forEach(([name, props]) => {
      merged[name] = { ...merged[name], ...props };
    });

    return merged;
  }, [adoptedPropOverrides, propSandbox]);
  const previewSource = getRoutePreviewSource(
    normalizedRouteId,
    selectedCompositionId,
    activePropOverrides,
  );
  const componentsPreviewRoute =
    railRoutes.find((section) => section.route.id === normalizedRouteId)
      ?.route ?? null;
  const componentsViewport = getPrototypeViewport(
    prototype,
    componentsPreviewRoute,
  );
  const previewViewportHeight = componentsViewport.height;
  const previewViewportWidth = componentsViewport.width;
  const previewPaneRef = useRef(null);
  const previewToolbarRef = useRef(null);
  const previewRef = useRef(null);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [matchCounts, setMatchCounts] = useState({});
  const [previewHoveredIndex, setPreviewHoveredIndex] = useState(null);
  const [previewLoadCount, setPreviewLoadCount] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);
  const activeHighlightRef = useRef(null);
  const previewReverseHoverRef = useRef(null);
  const selectedEntriesRef = useRef(selectedEntries);
  const refreshMatchCounts = useCallback(() => {
    const iframe = previewRef.current;

    if (!iframe) {
      return false;
    }

    const counts = {};
    let isReady = true;

    selectedEntries.forEach((entry, index) => {
      if (!entry.selector) {
        return;
      }

      const count = countPreviewSelectorMatches(iframe, entry.selector);

      if (count === null) {
        isReady = false;
        return;
      }

      counts[`${normalizedRouteId}:${index}`] = count;
    });

    if (!isReady) {
      return false;
    }

    setMatchCounts(counts);

    const active = activeHighlightRef.current;

    if (active?.selector) {
      applyPreviewHighlight(iframe, active.selector, { scroll: false });
    }

    return true;
  }, [normalizedRouteId, selectedEntries]);
  const clearPreviewReverseHover = useCallback(() => {
    if (previewReverseHoverRef.current === null) {
      return;
    }

    previewReverseHoverRef.current = null;
    setPreviewHoveredIndex(null);

    const active = activeHighlightRef.current;

    if (active?.selector) {
      applyPreviewHighlight(previewRef.current, active.selector, {
        scroll: false,
      });
    } else {
      clearPreviewHighlight(previewRef.current);
    }
  }, []);
  const handlePreviewReverseHover = useCallback(
    (event) => {
      const match = resolvePreviewReverseHoverMatch(
        event?.target,
        selectedEntriesRef.current,
      );

      if (!match) {
        clearPreviewReverseHover();
        return;
      }

      previewReverseHoverRef.current = match;
      setPreviewHoveredIndex(match.index);
      markPreviewHighlightElement(previewRef.current, match.element);
    },
    [clearPreviewReverseHover],
  );
  const attachPreviewReverseListeners = useCallback(
    (iframe) => {
      const doc = getPreviewHighlightDocument(iframe);

      if (!doc || !isPreviewHighlightDocumentReady(doc)) {
        return;
      }

      try {
        const root = doc.documentElement;

        if (
          !root ||
          root.getAttribute(previewReverseListenersAttribute) === "true"
        ) {
          return;
        }

        root.setAttribute(previewReverseListenersAttribute, "true");
        doc.addEventListener("mouseover", handlePreviewReverseHover, {
          capture: true,
          passive: true,
        });
        doc.addEventListener("mouseleave", clearPreviewReverseHover, {
          passive: true,
        });
      } catch (error) {
        // Reverse hover is optional; an unavailable preview document is a no-op.
      }
    },
    [clearPreviewReverseHover, handlePreviewReverseHover],
  );
  const detachPreviewReverseListeners = useCallback(
    (iframe) => {
      const doc = getPreviewHighlightDocument(iframe);

      if (!doc) {
        return;
      }

      try {
        doc.documentElement?.removeAttribute(previewReverseListenersAttribute);
        doc.removeEventListener("mouseover", handlePreviewReverseHover, {
          capture: true,
        });
        doc.removeEventListener("mouseleave", clearPreviewReverseHover);
      } catch (error) {
        // Detach is best-effort; a replaced document dies with its listeners.
      }
    },
    [clearPreviewReverseHover, handlePreviewReverseHover],
  );

  useEffect(() => {
    selectedEntriesRef.current = selectedEntries;
  }, [selectedEntries]);

  useEffect(() => {
    activeHighlightRef.current = null;
    previewReverseHoverRef.current = null;
    setHighlightedIndex(null);
    setPreviewHoveredIndex(null);
    setMatchCounts({});
    setRenderedCompositionStamp(null);
    setRenderedPropStamp(null);
  }, [normalizedRouteId, selectedCompositionId]);

  // 變體覆寫誠實戳記輪詢（data-prop-overrides）——與 composition 戳記同款。
  useEffect(() => {
    const hasPropSlots = Object.values(componentDefaults).some(
      (defaults) => defaults.propSlots.length > 0,
    );

    if (!hasPropSlots) {
      return undefined;
    }

    let isActive = true;
    let retryCount = 40;
    let retryTimer = null;

    const readStamp = () => {
      if (!isActive) {
        return;
      }

      const stamp = readPreviewPropOverridesStamp(previewRef.current);

      if (stamp !== null) {
        setRenderedPropStamp(stamp);
        return;
      }

      if (retryCount > 0) {
        retryCount -= 1;
        retryTimer = window.setTimeout(readStamp, 250);
      }
    };

    readStamp();

    return () => {
      isActive = false;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [componentDefaults, previewLoadCount, previewSource]);

  // 過濾在 route 切換時重置為全部（spec: filtered by decision state）。
  useEffect(() => {
    setDecisionFilter("all");
  }, [normalizedRouteId]);

  // token 覆寫注入：沙盒 ∪ 已採用；iframe 重載與就緒重試沿 match-count 模式。
  useEffect(() => {
    let isActive = true;
    let retryCount = 40;
    let retryTimer = null;

    const applyOverrides = () => {
      if (!isActive) {
        return;
      }

      if (applyPreviewTokenOverrides(previewRef.current, activeTokenOverrides)) {
        return;
      }

      if (retryCount > 0) {
        retryCount -= 1;
        retryTimer = window.setTimeout(applyOverrides, 250);
      }
    };

    applyOverrides();

    return () => {
      isActive = false;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [activeTokenOverrides, previewLoadCount, previewSource]);

  // requested vs rendered 方案比對：輪詢預覽文件的 data-composition 戳記，
  // 相符與否都記錄下來；讀不到（無 stamp 的舊 prototype）以 "" 收尾。
  useEffect(() => {
    if (compositionsList.length === 0) {
      return undefined;
    }

    let isActive = true;
    let retryCount = 40;
    let retryTimer = null;

    const readStamp = () => {
      if (!isActive) {
        return;
      }

      const stamp = readPreviewCompositionStamp(previewRef.current);

      if (stamp !== null) {
        setRenderedCompositionStamp(stamp);
        return;
      }

      if (retryCount > 0) {
        retryCount -= 1;
        retryTimer = window.setTimeout(readStamp, 250);
      } else {
        setRenderedCompositionStamp("");
      }
    };

    readStamp();

    return () => {
      isActive = false;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [compositionsList.length, previewLoadCount, previewSource]);

  useEffect(() => {
    let isActive = true;
    let retryCount = 40;
    let retryTimer = null;

    const updateMatchCounts = () => {
      if (!isActive) {
        return;
      }

      if (refreshMatchCounts()) {
        attachPreviewReverseListeners(previewRef.current);
        return;
      }

      if (retryCount > 0) {
        retryCount -= 1;
        retryTimer = window.setTimeout(updateMatchCounts, 250);
      }
    };

    updateMatchCounts();

    return () => {
      isActive = false;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [
    attachPreviewReverseListeners,
    previewLoadCount,
    previewSource,
    refreshMatchCounts,
  ]);

  useEffect(() => {
    const previewPane = previewPaneRef.current;

    if (!previewPane) {
      return undefined;
    }

    const updatePreviewScale = () => {
      // 方案 pills／警告 toolbar 佔掉 pane 上緣的高度，縮放要扣掉它，
      // 否則手機預覽會被 overflow: hidden 裁掉底部。
      const toolbarHeight = previewToolbarRef.current
        ? previewToolbarRef.current.getBoundingClientRect().height
        : 0;
      const availableWidth = Math.max(1, previewPane.clientWidth);
      const availableHeight = Math.max(
        1,
        previewPane.clientHeight - toolbarHeight,
      );

      setPreviewScale(
        Math.min(
          1,
          availableWidth / previewViewportWidth,
          availableHeight / previewViewportHeight,
        ),
      );
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePreviewScale);

    if (previewToolbarRef.current) {
      resizeObserver?.observe(previewToolbarRef.current);
    }

    updatePreviewScale();
    resizeObserver?.observe(previewPane);
    window.addEventListener("resize", updatePreviewScale);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePreviewScale);
    };
  }, [
    // toolbar 可能因 sandbox/pendingNav 出現或消失——重新掛 observer。
    compositionsList.length > 0 || sandboxTotalCount > 0 || pendingNav !== null,
    previewSource,
    previewViewportHeight,
    previewViewportWidth,
  ]);

  useEffect(() => {
    const iframe = previewRef.current;

    return () => {
      detachPreviewReverseListeners(iframe);
      clearPreviewHighlight(iframe);
    };
  }, [detachPreviewReverseListeners, normalizedRouteId, selectedCompositionId]);

  const activateHighlight = (index, selector) => {
    if (!selector || highlightedIndex === index) {
      return;
    }

    previewReverseHoverRef.current = null;
    setPreviewHoveredIndex(null);
    activeHighlightRef.current = { index, selector };
    setHighlightedIndex(index);

    const count = applyPreviewHighlight(previewRef.current, selector);

    if (count !== null) {
      setMatchCounts((counts) => ({
        ...counts,
        [`${normalizedRouteId}:${index}`]: count,
      }));
    }
  };
  const deactivateHighlight = (index) => {
    if (activeHighlightRef.current?.index !== index) {
      return;
    }

    activeHighlightRef.current = null;
    setHighlightedIndex(null);
    clearPreviewHighlight(previewRef.current);
  };
  const selectedRoute = selectedSection?.route ?? null;

  return createElement(
    "div",
    {
      className: "prototype-inspector prototype-inspector--components",
      ...documentationModeDeclarations,
      style: {
        "--prototype-inspector-active-viewport-height": `${previewViewportHeight}px`,
        "--prototype-inspector-active-viewport-width": `${previewViewportWidth}px`,
      },
    },
    createElement(PrototypeHeader, {
      eyebrow: prototype.id,
      title: "Prototype Components",
      description:
        "逐畫面的元件組成：shared／new／promoted 來源、Storybook story 連結、與即時預覽互相 highlight。",
    }),
    createElement(
      "div",
      { className: "prototype-inspector__components-body" },
      !components
        ? createElement(
            "div",
            { className: "prototype-inspector__components-empty" },
            createElement(
              "p",
              null,
              "此 prototype 尚未宣告逐畫面的元件組成。",
            ),
            createElement(
              "p",
              null,
              "在 prototype meta（",
              createElement("code", null, "parameters.prototype"),
              "）加入 ",
              createElement("code", null, "components"),
              " 區塊與 ",
              createElement("code", null, "components.routes[]"),
              " 條目，記錄每個畫面由哪些元件組成，並把各元件的 origin 標為 ",
              createElement("code", null, "shared"),
              "、",
              createElement("code", null, "local"),
              " 或 ",
              createElement("code", null, "promoted"),
              "。完整契約見本專案的 prototype metadata 文件。",
            ),
          )
        : railRoutes.length === 0
          ? createElement(
              "p",
              { className: "prototype-inspector__empty" },
              "此 prototype 找不到任何 route。",
            )
          : createElement(
              Fragment,
              null,
              createElement(
                "p",
                { className: "prototype-inspector__build-tag" },
                `inspector ${prototypeInspectorBuildTag}`,
              ),
              createElement(PrototypeReviewBar, {
                executionPlan,
                nameRoutes,
                onExecute: handleExecute,
                onOpenOverview: () => setIsOverviewOpen(true),
                review,
              }),
              executionState
                ? createElement(PrototypeExecutionBanner, {
                    onCancel: handleCancelExecution,
                    prototypeId: review.prototypeId,
                    state: executionState,
                  })
                : null,
              review.history.length > 0 &&
                Object.keys(review.view.defaults).length === 0 &&
                Object.keys(review.view.routes).length === 0 &&
                review.confirm?.status !== "confirmed"
                ? createElement(
                    "p",
                    {
                      className: "prototype-inspector__round-handover",
                      role: "status",
                    },
                    `第 ${
                      review.history[review.history.length - 1].round
                    } 輪決策已執行並歸檔——工作區已重置為新基準，接續審閱的是套用後的 prototype。`,
                  )
                : null,
              isOverviewOpen
                ? createElement(PrototypeReviewOverview, {
                    nameRoutes,
                    onClose: () => setIsOverviewOpen(false),
                    onJump: (componentName) => {
                      const targetRouteId = railRoutes.find((section) =>
                        nameRoutes.get(componentName)?.has(section.route.id),
                      )?.route.id;

                      setIsOverviewOpen(false);

                      if (!targetRouteId) {
                        return;
                      }

                      guardNav(() => {
                        setSelectedRouteId(targetRouteId);

                        // route 切換渲染後把目標卡捲入視野（重試至卡片出現）。
                        let scrollAttempts = 20;
                        const scrollToCard = () => {
                          const card = document.querySelector(
                            `[data-review-component="${componentName}"]`,
                          );

                          if (card) {
                            card.scrollIntoView({
                              behavior: prefersReducedMotion()
                                ? "auto"
                                : "smooth",
                              block: "center",
                            });
                            return;
                          }

                          if (scrollAttempts > 0) {
                            scrollAttempts -= 1;
                            window.setTimeout(scrollToCard, 100);
                          }
                        };

                        scrollToCard();
                      });
                    },
                    review,
                  })
                : null,
              createElement(
              "div",
              { className: "prototype-inspector__components-workspace" },
              createElement(
                "nav",
                {
                  "aria-label": "Prototype routes",
                  "aria-orientation": "vertical",
                  className: "prototype-inspector__components-rail",
                  role: "tablist",
                },
                railRoutes.map((section, index) => {
                  const stats = getRouteReviewStats(
                    review.view,
                    section.componentRoute,
                  );

                  return createElement(
                    "button",
                    {
                      "aria-selected": section.route.id === normalizedRouteId,
                      className:
                        "prototype-inspector__components-rail-button",
                      key: section.route.id ?? `route-${index}`,
                      onClick: () =>
                        guardNav(() => setSelectedRouteId(section.route.id)),
                      role: "tab",
                      type: "button",
                    },
                    createElement(
                      "span",
                      {
                        className:
                          "prototype-inspector__components-rail-title",
                      },
                      section.route.title ?? section.route.id,
                      stats.total > 0
                        ? createElement(
                            "span",
                            {
                              className:
                                stats.decided === stats.total
                                  ? "prototype-inspector__rail-progress prototype-inspector__rail-progress--done"
                                  : "prototype-inspector__rail-progress",
                            },
                            stats.decided === stats.total
                              ? "✓"
                              : `${stats.decided}/${stats.total}`,
                          )
                        : null,
                      stats.hasFlag
                        ? createElement("span", {
                            className: "prototype-inspector__rail-flag",
                            title: stats.flagFromDefaults
                              ? "含標記決策（defaults 層）"
                              : "含標記決策",
                          })
                        : null,
                    ),
                    createElement("code", null, section.route.id),
                  );
                }),
              ),
              createElement(
                "div",
                { className: "prototype-inspector__components-cards" },
                selectedEntries.length > 0
                  ? createElement(
                      "div",
                      {
                        "aria-label": "決策狀態過濾",
                        className: "prototype-inspector__filter",
                        role: "group",
                      },
                      [
                        ["all", "全部"],
                        ["undecided", "未決"],
                        ["decided", "已決"],
                        ["flagged", "已標記"],
                      ].map(([filterId, label]) =>
                        createElement(
                          "button",
                          {
                            "aria-pressed": decisionFilter === filterId,
                            className: "prototype-inspector__filter-pill",
                            key: filterId,
                            onClick: () => setDecisionFilter(filterId),
                            type: "button",
                          },
                          `${label}（${decisionCounts[filterId]}）`,
                        ),
                      ),
                    )
                  : null,
                selectedEntries.length === 0
                  ? createElement(
                      "p",
                      {
                        className:
                          "prototype-inspector__components-route-empty",
                      },
                      "此 route 沒有組成資料。",
                    )
                  : selectedEntries.map((entry, index) => {
                      const componentName =
                        typeof entry.component.name === "string"
                          ? entry.component.name
                          : "";
                      const routeDecision =
                        review.view.routes?.[normalizedRouteId]?.[
                          componentName
                        ] ?? null;
                      const effectiveDecision =
                        routeDecision ??
                        review.view.defaults?.[componentName] ??
                        null;
                      const savedDecision = resolveReviewDecision(
                        review.ledgerView,
                        normalizedRouteId,
                        componentName,
                      );
                      const decisionState =
                        classifyReviewDecisionState(effectiveDecision);
                      const draftLayerRouteId = review.drafts.routes[
                        normalizedRouteId
                      ]?.[componentName]
                        ? normalizedRouteId
                        : "";
                      const alternative = entry.alternative;
                      const adoptRouteOnly = Array.isArray(
                        alternative?.routes,
                      );
                      const tokenSlots =
                        componentDefaults[componentName]?.tokenSlots ?? [];
                      const propSlots =
                        componentDefaults[componentName]?.propSlots ?? [];
                      const propSlotsNote =
                        componentDefaults[componentName]?.propSlotsNote ?? "";
                      const adoptedForCard = {};
                      const adoptedPropsForCard = {};

                      if (effectiveDecision?.decision === "keep") {
                        (effectiveDecision.tokenOverrides ?? []).forEach(
                          (override) => {
                            adoptedForCard[override.slot] = override.to;
                          },
                        );
                        (effectiveDecision.propOverrides ?? []).forEach(
                          (override) => {
                            adoptedPropsForCard[override.prop] = override.to;
                          },
                        );
                      }

                      return createElement(PrototypeComponentCard, {
                        component: entry.component,
                        // 過濾用 hidden 隱藏、絕不重切 selectedEntries：
                        // matchCounts 與 highlight 以位置索引鍵定，重切會錯位。
                        hidden:
                          decisionFilter !== "all" &&
                          decisionState !== decisionFilter,
                        isHighlighted: highlightedIndex === index,
                        isPreviewHovered: previewHoveredIndex === index,
                        key: `${normalizedRouteId}-${index}`,
                        matchCount:
                          matchCounts[`${normalizedRouteId}:${index}`] ?? null,
                        onHighlightEnd: () => deactivateHighlight(index),
                        onHighlightStart: () =>
                          activateHighlight(index, entry.selector),
                        review: componentName
                          ? {
                              adoptSwapDisabled:
                                effectiveDecision?.decision === "swap" &&
                                effectiveDecision.swapToCompositionId ===
                                  selectedCompositionId,
                              adoptSwapRouteOnly: adoptRouteOnly,
                              api: review,
                              componentName,
                              compositions: compositionsList,
                              // swap 目標受 routes gate：替代未列出當前
                              // route 時不出現在抽屜的方案選單。
                              decisionAlternatives: (
                                componentDefaults[componentName]
                                  ?.alternatives ?? []
                              ).filter(
                                (candidate) =>
                                  !Array.isArray(candidate.routes) ||
                                  candidate.routes.includes(normalizedRouteId),
                              ),
                              draftLayerRouteId,
                              effectiveDecision,
                              isDraft:
                                Boolean(effectiveDecision) &&
                                !areReviewDecisionsEqual(
                                  effectiveDecision,
                                  savedDecision,
                                ),
                              isRouteOverride: Boolean(routeDecision),
                              onAdoptSwap: () =>
                                review.applyDraft(
                                  componentName,
                                  {
                                    decidedAt: new Date().toISOString(),
                                    decision: "swap",
                                    swapToCompositionId: selectedCompositionId,
                                  },
                                  adoptRouteOnly ? normalizedRouteId : "",
                                ),
                              onApply: (decisionEntry, scopeRouteId) =>
                                review.applyDraft(
                                  componentName,
                                  decisionEntry,
                                  scopeRouteId,
                                ),
                              replacedBy: alternative,
                              propSandbox:
                                propSlots.length > 0
                                  ? {
                                      adoptedProps: adoptedPropsForCard,
                                      appliedStamp:
                                        renderedPropStamp?.applied?.[
                                          componentName
                                        ] ?? {},
                                      onAdopt: (overrides) => {
                                        const adoptedEntry = {
                                          decidedAt: new Date().toISOString(),
                                          decision: "keep",
                                          propOverrides: overrides,
                                        };

                                        if (
                                          effectiveDecision?.decision ===
                                          "keep"
                                        ) {
                                          if (effectiveDecision.note) {
                                            adoptedEntry.note =
                                              effectiveDecision.note;
                                          }

                                          if (
                                            effectiveDecision.tokenOverrides
                                          ) {
                                            adoptedEntry.tokenOverrides =
                                              effectiveDecision.tokenOverrides;
                                          }
                                        }

                                        review.applyDraft(
                                          componentName,
                                          adoptedEntry,
                                          "",
                                        );
                                        setPropSandbox((current) => {
                                          const next = { ...current };

                                          delete next[componentName];
                                          return next;
                                        });
                                      },
                                      onSelect: (prop, value) =>
                                        setPropSandboxValue(
                                          componentName,
                                          prop,
                                          value,
                                        ),
                                      propSlots,
                                      sandboxValues:
                                        propSandbox[componentName] ?? {},
                                      whitelistForComponent:
                                        propWhitelist?.[componentName],
                                    }
                                  : null,
                              propSlotsNote,
                              routeId: normalizedRouteId,
                              tokenSandbox:
                                tokenSlots.length > 0
                                  ? {
                                      adoptedOverrides: adoptedForCard,
                                      onAdopt: (overrides) => {
                                        const adoptedEntry = {
                                          decidedAt: new Date().toISOString(),
                                          decision: "keep",
                                          tokenOverrides: overrides,
                                        };

                                        if (
                                          effectiveDecision?.decision ===
                                            "keep" &&
                                          effectiveDecision.note
                                        ) {
                                          adoptedEntry.note =
                                            effectiveDecision.note;
                                        }

                                        review.applyDraft(
                                          componentName,
                                          adoptedEntry,
                                          "",
                                        );
                                      },
                                      sandbox: tokenSandbox,
                                      tokenSlots,
                                      whitelist: tokenWhitelist,
                                    }
                                  : null,
                            }
                          : null,
                        selector: entry.selector,
                      });
                    }),
              ),
              createElement(
                "div",
                {
                  className: "prototype-inspector__components-preview",
                  ref: previewPaneRef,
                },
                compositionsList.length > 0 ||
                sandboxTotalCount > 0 ||
                pendingNav !== null
                  ? createElement(
                      "div",
                      {
                        className:
                          "prototype-inspector__components-preview-toolbar",
                        ref: previewToolbarRef,
                      },
                      createElement(PrototypeCompositionPills, {
                        componentDefaults,
                        compositions: compositionsList,
                        onSelect: (compositionId) =>
                          guardNav(() =>
                            setSelectedCompositionId(compositionId),
                          ),
                        selectedCompositionId,
                      }),
                      createElement(PrototypeCompositionSummary, {
                        componentDefaults,
                        selectedCompositionId,
                      }),
                      selectedCompositionId !== "default" &&
                        renderedCompositionStamp !== null &&
                        renderedCompositionStamp !== selectedCompositionId
                        ? createElement(
                            "p",
                            {
                              className:
                                "prototype-inspector__composition-warning",
                              role: "status",
                            },
                            `方案未接線：要求「${selectedCompositionId}」、實際渲染「${
                              renderedCompositionStamp || "（無戳記）"
                            }」。prototype adapter 尚未實作此方案。`,
                          )
                        : null,
                      sandboxTotalCount > 0
                        ? createElement(
                            "div",
                            {
                              className:
                                "prototype-inspector__token-banner",
                              role: "status",
                            },
                            createElement(
                              "span",
                              null,
                              `試調中：${sandboxTotalCount} 個覆寫生效（樣式 ${tokenSandbox.count}／變體 ${propSandboxCount}）`,
                            ),
                            createElement(
                              "button",
                              {
                                className:
                                  "prototype-inspector__review-action",
                                onPointerDown: () =>
                                  tokenSandbox.setIsComparing(true),
                                onPointerLeave: () =>
                                  tokenSandbox.setIsComparing(false),
                                onPointerUp: () =>
                                  tokenSandbox.setIsComparing(false),
                                title:
                                  "按住暫停本輪試調（已採用的調整保持生效）",
                                type: "button",
                              },
                              tokenSandbox.isComparing
                                ? "對照中…"
                                : "按住對照",
                            ),
                            createElement(
                              "button",
                              {
                                className:
                                  "prototype-inspector__review-action",
                                onClick: () => {
                                  tokenSandbox.resetAll();
                                  setPropSandbox({});
                                },
                                type: "button",
                              },
                              "全部重設",
                            ),
                          )
                        : null,
                      pendingNav !== null
                        ? createElement(
                            "div",
                            {
                              className:
                                "prototype-inspector__token-banner prototype-inspector__token-banner--confirm",
                              role: "alertdialog",
                            },
                            createElement(
                              "span",
                              null,
                              `有 ${sandboxTotalCount} 筆未採用試調，切換將捨棄。`,
                            ),
                            createElement(
                              "button",
                              {
                                className:
                                  "prototype-inspector__review-action",
                                onClick: () => {
                                  tokenSandbox.resetAll();
                                  setPropSandbox({});
                                  pendingNav();
                                  setPendingNav(null);
                                },
                                type: "button",
                              },
                              "繼續切換",
                            ),
                            createElement(
                              "button",
                              {
                                className:
                                  "prototype-inspector__review-action",
                                onClick: () => setPendingNav(null),
                                type: "button",
                              },
                              "留在此",
                            ),
                          )
                        : null,
                    )
                  : null,
                previewSource
                  ? createElement(
                      "div",
                      {
                        className:
                          "prototype-inspector__components-preview-frame",
                        style: {
                          "--prototype-components-preview-height": `${previewViewportHeight}px`,
                          "--prototype-components-preview-scale": previewScale,
                          "--prototype-components-preview-width": `${previewViewportWidth}px`,
                        },
                      },
                      createElement("iframe", {
                        key: `${normalizedRouteId}:${selectedCompositionId}`,
                        loading: "eager",
                        onLoad: () => {
                          previewReverseHoverRef.current = null;
                          setPreviewHoveredIndex(null);
                          setPreviewLoadCount((count) => count + 1);

                          if (refreshMatchCounts()) {
                            attachPreviewReverseListeners(previewRef.current);
                          }
                        },
                        ref: previewRef,
                        src: previewSource,
                        title: `${selectedRoute?.title ?? normalizedRouteId} 預覽`,
                      }),
                    )
                  : createElement(PrototypeEmpty, {
                      message: "無法取得 route 預覽。",
                    }),
              ),
              ),
            ),
    ),
  );
}

function PrototypeEmpty({ declarations, message }) {
  return createElement(
    "div",
    { className: "prototype-inspector prototype-inspector--empty", ...declarations },
    createElement("p", { className: "prototype-inspector__empty" }, message),
  );
}

function createPrototypeInspectorDecorator(options = {}) {
  const globalName = options.globalName ?? defaultPrototypeModeGlobalName;
  const parameterName = options.parameterName ?? defaultPrototypeParameterName;

  return (Story, context) => {
    const prototypeMode = getPrototypeMode(context.globals?.[globalName]);
    const prototype = getPrototypeParameter(context, parameterName);

    if (prototypeMode === "story" || !prototype) {
      return Story();
    }

    if (prototypeMode === "docs") {
      return createElement(PrototypeDocs, { prototype });
    }

    if (prototypeMode === "flow") {
      return createElement(PrototypeFlow, { prototype });
    }

    if (prototypeMode === "components") {
      return createElement(PrototypeComponents, { prototype });
    }

    return createElement(PrototypeData, { prototype });
  };
}

export const decorators = [createPrototypeInspectorDecorator()];

export const globalTypes = {
  [defaultPrototypeModeGlobalName]: {
    defaultValue: "story",
    description: "Controls the Prototype toolbar canvas mode.",
  },
};

export const initialGlobals = {
  [defaultPrototypeModeGlobalName]: "story",
};
