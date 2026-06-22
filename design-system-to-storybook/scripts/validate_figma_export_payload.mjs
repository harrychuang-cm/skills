#!/usr/bin/env node
import { readFileSync } from "node:fs";

const genericNodeNames = new Set([
  "a",
  "article",
  "aside",
  "button",
  "div",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "header",
  "img",
  "li",
  "main",
  "nav",
  "p",
  "section",
  "span",
  "svg",
  "ul",
]);
const styleBindingMap = {
  backgroundColor: "backgroundColor",
  borderColor: "borderColor",
  borderWidth: "borderWidth",
  gap: "gap",
  opacity: "opacity",
  paddingBottom: "paddingBottom",
  paddingLeft: "paddingLeft",
  paddingRight: "paddingRight",
  paddingTop: "paddingTop",
  radius: "cornerRadius",
};
const textStyleBindingMap = {
  color: "textColor",
  fontFamily: "fontFamily",
  fontSize: "fontSize",
  fontWeight: "fontWeight",
  lineHeight: "lineHeight",
};

function printUsage() {
  console.error(
    [
      "Usage: node <skill-root>/scripts/validate_figma_export_payload.mjs <payload.sbfx.json> [more files] [--strict]",
      "Reads Storybook Figma export JSON payloads and reports token-binding, naming, sizing, and layout issues that reduce Figma import quality.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const strict = argv.includes("--strict");
  const files = argv.filter((arg) => arg !== "--strict");
  return { files, strict };
}

function readPayload(file) {
  const raw = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function walkNodes(node, visitor, ancestry = []) {
  visitor(node, ancestry);
  const children = Array.isArray(node.children) ? node.children : [];
  children.forEach((child, index) =>
    walkNodes(child, visitor, [...ancestry, `${node.name || node.kind || "node"}[${index}]`])
  );
}

function nodePath(node, ancestry) {
  return [...ancestry, node.name || node.kind || "node"].join(" > ");
}

function addIssue(issues, severity, message, node, ancestry) {
  issues.push({
    message,
    path: node ? nodePath(node, ancestry) : "",
    severity,
  });
}

function hasPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validatePayload(payload) {
  const issues = [];

  if (!isRecord(payload)) {
    return {
      boundNodeCount: 0,
      issues: [{ severity: "error", path: "", message: "Payload is not an object." }],
      maxDepth: 0,
      nodeCount: 0,
      referencedTokenCount: 0,
      textNodeCount: 0,
    };
  }

  if (payload.version !== 1) {
    addIssue(issues, "error", "Expected payload version 1.", null, []);
  }

  if (!isRecord(payload.root)) {
    addIssue(issues, "error", "Missing root export node.", null, []);
    return {
      boundNodeCount: 0,
      issues,
      maxDepth: 0,
      nodeCount: 0,
      referencedTokenCount: 0,
      textNodeCount: 0,
    };
  }

  const tokenPrefix = payload.tokenSystem?.prefix;
  const exportedTokens = new Set(
    Array.isArray(payload.tokens)
      ? payload.tokens.map((token) => token?.cssName).filter(Boolean)
      : [],
  );
  const referencedTokens = new Set();
  let nodeCount = 0;
  let boundNodeCount = 0;
  let textNodeCount = 0;
  let maxDepth = 0;

  walkNodes(payload.root, (node, ancestry) => {
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, ancestry.length + 1);

    if (!isRecord(node)) {
      addIssue(issues, "error", "Node is not an object.", null, ancestry);
      return;
    }

    const path = nodePath(node, ancestry);
    const bindings = isRecord(node.bindings) ? node.bindings : {};
    const styles = isRecord(node.styles) ? node.styles : {};
    const bindingValues = Object.values(bindings).filter(Boolean);
    if (bindingValues.length > 0) boundNodeCount += 1;

    for (const token of bindingValues) {
      referencedTokens.add(token);
      if (typeof token !== "string" || !token.startsWith("--")) {
        addIssue(issues, "warn", `Binding "${token}" is not a CSS custom property name.`, node, ancestry);
        continue;
      }
      if (tokenPrefix && !token.startsWith(`--${tokenPrefix}-`)) {
        addIssue(issues, "warn", `Binding "${token}" does not match token prefix "${tokenPrefix}".`, node, ancestry);
      }
    }

    if (typeof node.name !== "string" || !node.name.trim()) {
      addIssue(issues, "warn", "Node is missing a stable name.", node, ancestry);
    } else if (genericNodeNames.has(node.name.trim().toLowerCase())) {
      addIssue(issues, "warn", `Node name "${node.name}" is generic; add data-component, data-variant, data-icon, or a prefixed class.`, node, ancestry);
    }

    if (!hasPositiveNumber(styles.width) || !hasPositiveNumber(styles.height)) {
      addIssue(issues, "error", `Node has invalid bounds at ${path}.`, node, ancestry);
    }

    for (const [styleName, bindingName] of Object.entries(styleBindingMap)) {
      if (styleName === "opacity" && styles[styleName] === 1) {
        continue;
      }
      if (styles[styleName] !== undefined && bindings[bindingName] === undefined) {
        addIssue(issues, "warn", `${styleName} is exported as a computed value without a ${bindingName} token binding.`, node, ancestry);
      }
    }

    if (node.kind === "text") {
      textNodeCount += 1;
      if (typeof node.text !== "string" || !node.text.trim()) {
        addIssue(issues, "warn", "Text node has empty text content.", node, ancestry);
      }
      for (const [styleName, bindingName] of Object.entries(textStyleBindingMap)) {
        if (styles[styleName] !== undefined && bindings[bindingName] === undefined) {
          addIssue(issues, "warn", `Text ${styleName} is exported without a ${bindingName} token binding.`, node, ancestry);
        }
      }
    }

    if (
      node.kind === "frame" &&
      Array.isArray(node.children) &&
      node.children.length > 1 &&
      node.layoutStrategy === "absolute" &&
      styles.display !== "grid"
    ) {
      addIssue(issues, "warn", "Frame has multiple children but exports as absolute layout; prefer flex auto-layout unless pixel fidelity requires absolute positioning.", node, ancestry);
    }

    if (
      (node.kind === "image" || node.kind === "svg") &&
      typeof node.svgText === "string" &&
      node.svgText.includes("var(")
    ) {
      addIssue(issues, "warn", "SVG export still contains CSS var() references; inline or embedded SVG paint should resolve before import.", node, ancestry);
    }

    if (node.kind === "image" && !node.svgText) {
      addIssue(issues, "warn", "Image node has no SVG text; Figma import may only preserve raster bounds.", node, ancestry);
    }
  });

  if (referencedTokens.size > 0) {
    for (const token of referencedTokens) {
      if (!exportedTokens.has(token)) {
        issues.push({
          severity: "error",
          path: "",
          message: `Binding references ${token}, but the token is missing from payload.tokens.`,
        });
      }
    }
  }

  if (referencedTokens.size === 0) {
    issues.push({
      severity: "warn",
      path: "",
      message: "Payload has no token bindings; Figma import will create mostly static layers.",
    });
  }

  if (nodeCount > 80) {
    issues.push({
      severity: "warn",
      path: "",
      message: `Payload has ${nodeCount} nodes; consider simplifying decorative wrappers before export.`,
    });
  }

  if (maxDepth > 9) {
    issues.push({
      severity: "warn",
      path: "",
      message: `Payload nesting depth is ${maxDepth}; deep DOM trees become hard to edit in Figma.`,
    });
  }

  return {
    boundNodeCount,
    issues,
    maxDepth,
    nodeCount,
    referencedTokenCount: referencedTokens.size,
    textNodeCount,
  };
}

function printResult(file, result) {
  console.log(`\n${file}`);
  console.log(
    `nodes=${result.nodeCount} text=${result.textNodeCount} boundNodes=${result.boundNodeCount} tokens=${result.referencedTokenCount} depth=${result.maxDepth}`,
  );

  if (result.issues.length === 0) {
    console.log("ok: no export-readiness issues found");
    return;
  }

  for (const issue of result.issues) {
    const location = issue.path ? ` ${issue.path}` : "";
    console.log(`${issue.severity}: ${issue.message}${location}`);
  }
}

const { files, strict } = parseArgs(process.argv.slice(2));
if (files.length === 0) {
  printUsage();
  process.exitCode = 1;
} else {
  let hasError = false;
  let hasWarning = false;

  for (const file of files) {
    try {
      const payload = readPayload(file);
      const result = validatePayload(payload);
      printResult(file, result);
      hasError ||= result.issues.some((issue) => issue.severity === "error");
      hasWarning ||= result.issues.some((issue) => issue.severity === "warn");
    } catch (error) {
      hasError = true;
      console.error(`\n${file}`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  process.exitCode = hasError || (strict && hasWarning) ? 1 : 0;
}
