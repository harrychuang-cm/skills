// UI Flow stylesheet rule tests: node --test storybook-product-prototype/scripts/test_flow_css_rules.test.mjs
//
// flow_css_rules.mjs decides which rules belong in flow-canvas.css and which
// rules --ui-flow-only may remove from a project's prototype-inspector.css, so
// the classification follows the spec's "rule classification" example table
// and every other byte must survive a split or a strip.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  findFlowRules,
  findMixedRules,
  isFlowRule,
  listSelectors,
  partitionFlowRules,
  splitCssRules,
  splitSelectorList,
  stripFlowRules,
} from "./flow_css_rules.mjs";

const inspectorCssUrl = new URL("../assets/prototype-inspector/prototype-inspector.css", import.meta.url);
const flowCssUrl = new URL("../assets/prototype-inspector/flow-canvas.css", import.meta.url);

// The single fragment of a one-rule stylesheet.
function classifyRule(css) {
  const rules = splitCssRules(css).filter((rule) => rule.kind !== "trailing");

  assert.equal(rules.length, 1, css);
  return rules[0];
}

// spec: inspector-runtime-distribution, "UI Flow module set", Example: rule classification.
const classificationTable = [
  [".prototype-inspector--flow { display: grid; }", "flow"],
  [".prototype-inspector__flow-controls .prototype-inspector__flow-zoom-menu-item { padding: 0; }", "flow"],
  ["@media (prefers-reduced-motion: reduce) { .prototype-inspector__flow-line { animation: none; } }", "flow"],
  [
    'html[data-sbfx-capture-mode="true"] .prototype-inspector--flow .prototype-inspector__flow-frame-preview iframe { pointer-events: none; }',
    "flow",
  ],
  ["@keyframes prototype-inspector-flow-dash { to { stroke-dashoffset: -8px; } }", "flow"],
  [
    ".prototype-inspector__flow-world:is([data-camera-moving], [data-dragging]) .prototype-inspector__flow-line { animation-play-state: paused; }",
    "flow",
  ],
  [".prototype-inspector__visually-hidden { position: absolute; }", "other"],
  [".prototype-inspector__markdown h2 { margin: 0; }", "other"],
  [":root { --pi-sys-color-primary: #000; }", "other"],
  [".prototype-inspector__markdown h3, .prototype-inspector__flow-summary h3 { margin: 0; }", "mixed"],
  [":is(.prototype-inspector__markdown, .prototype-inspector__flow-summary) h3 { margin: 0; }", "mixed"],
  [".prototype-inspector:not(.prototype-inspector--flow) .prototype-inspector__panel { padding: 0; }", "mixed"],
  ['.prototype-inspector__panel[data-label="prototype-inspector__flow-x"] { padding: 0; }', "other"],
  [".acme-prototype-inspector__flow-badge { color: red; }", "other"],
  ["@keyframes prototype-inspector-flowchart-pulse { to { opacity: 0; } }", "other"],
];

for (const [css, expected] of classificationTable) {
  test(`classifies ${css.slice(0, 72)} as ${expected}`, () => {
    const rule = classifyRule(css);
    const actual = rule.isFlow ? "flow" : rule.mixed ? "mixed" : "other";

    assert.equal(actual, expected);
    assert.equal(isFlowRule(rule), expected === "flow");
  });
}

test("classification edge cases", () => {
  // A class that only starts with the flow modifier is not the flow modifier.
  assert.equal(isFlowRule(".prototype-inspector--flowchart"), false);
  assert.equal(isFlowRule(".prototype-inspector--flow"), true);
  assert.equal(isFlowRule(".prototype-inspector--flow:hover, .prototype-inspector__flow-frame"), true);
  assert.equal(classifyRule("@keyframes spin { to { rotate: 1turn; } }").isFlow, false);
  // A statement without a block (invalid as a style rule) is never UI Flow, so
  // finding and stripping agree on it.
  const statement = "@media (x) {\n  .prototype-inspector__flow-x a: b;\n}\n";
  assert.deepEqual(findFlowRules(statement), []);
  assert.equal(stripFlowRules(statement), statement);
  assert.equal(classifyRule("@media (max-width: 700px) { }").isFlow, false);

  const mixedMedia = classifyRule(
    "@media (max-width: 700px) { .prototype-inspector__panel { gap: 0; } .prototype-inspector__flow-frame { gap: 0; } }",
  );

  assert.equal(mixedMedia.isFlow, false);
  assert.equal(mixedMedia.containsFlow, true);
  assert.deepEqual(splitSelectorList(".a:is(.b, .c), .d[data-x='1,2'] /* , */"), [".a:is(.b, .c)", ".d[data-x='1,2']"]);
});

const sample = `@import url("tokens.css");
/* Header */
:root {
  --pi-sys-color-primary: #000;
}

/* Brace in a string and in a comment: { */
.prototype-inspector__flow-frame::before {
  content: "}{";
}

.prototype-inspector__markdown h3,
.prototype-inspector__flow-summary h3 {
  margin: 0;
}

@media (max-width: 700px) {
  .prototype-inspector__panel {
    gap: 0;
  }

  /* Narrow canvas */
  .prototype-inspector__flow-canvas {
    inline-size: 100%;
  }

  @supports (display: grid) {
    .prototype-inspector__flow-minimap {
      display: none;
    }

    .prototype-inspector__panel-grid {
      display: grid;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .prototype-inspector__flow-line {
    animation: none;
  }
}

@keyframes prototype-inspector-flow-dash {
  /* { */
  to {
    stroke-dashoffset: -8px;
  }
}

.prototype-inspector__visually-hidden {
  position: absolute;
}
/* trailing */
`;

const sampleWithoutFlow = `@import url("tokens.css");
/* Header */
:root {
  --pi-sys-color-primary: #000;
}

.prototype-inspector__markdown h3,
.prototype-inspector__flow-summary h3 {
  margin: 0;
}

@media (max-width: 700px) {
  .prototype-inspector__panel {
    gap: 0;
  }

  @supports (display: grid) {
    .prototype-inspector__panel-grid {
      display: grid;
    }
  }
}

.prototype-inspector__visually-hidden {
  position: absolute;
}
/* trailing */
`;

test("fragments concatenate back to the source", () => {
  for (const source of [sample, fs.readFileSync(inspectorCssUrl, "utf8"), fs.readFileSync(flowCssUrl, "utf8")]) {
    const fragments = splitCssRules(source);

    assert.equal(fragments.map((fragment) => fragment.text).join(""), source);
    assert.ok(fragments.every((fragment) => fragment.text.length > 0));
  }
});

test("fragments keep their leading comment and report prelude lines", () => {
  const flowFrame = splitCssRules(sample).find((fragment) => fragment.selector === ".prototype-inspector__flow-frame::before");

  assert.ok(flowFrame.text.startsWith("\n/* Brace in a string and in a comment: { */\n"));
  assert.ok(flowFrame.text.endsWith("}\n"));
  assert.equal(flowFrame.line, 8);
  assert.equal(splitCssRules(sample)[0].kind, "statement");
  assert.equal(splitCssRules(sample).at(-1).kind, "trailing");
});

test("findFlowRules and findMixedRules list nested rules with their at-rules", () => {
  assert.deepEqual(findFlowRules(sample), [
    { line: 8, selector: ".prototype-inspector__flow-frame::before" },
    { line: 23, selector: "@media (max-width: 700px) > .prototype-inspector__flow-canvas" },
    { line: 28, selector: "@media (max-width: 700px) > @supports (display: grid) > .prototype-inspector__flow-minimap" },
    { line: 38, selector: "@media (prefers-reduced-motion: reduce)" },
    { line: 44, selector: "@keyframes prototype-inspector-flow-dash" },
  ]);
  assert.deepEqual(findMixedRules(sample), [
    { line: 12, selector: ".prototype-inspector__markdown h3, .prototype-inspector__flow-summary h3" },
  ]);
});

test("listSelectors lists every selector, inside at-rules too", () => {
  assert.deepEqual(listSelectors(".a, .b:is(.c, .d) { }\n@media (min-width: 1px) { .e { } @supports (x: y) { .f { } } }\n@keyframes k { to { } }\n@import url(x.css);\n"), [
    ".a",
    ".b:is(.c, .d)",
    ".e",
    ".f",
  ]);
});

test("stripFlowRules removes only UI Flow rules", () => {
  const stripped = stripFlowRules(sample);

  assert.equal(stripped, sampleWithoutFlow);
  assert.deepEqual(findFlowRules(stripped), []);
  assert.equal(stripFlowRules(sampleWithoutFlow), sampleWithoutFlow);
});

test("stripFlowRules keeps a comment on the kept rule's line and comments a blank line separates", () => {
  assert.equal(
    stripFlowRules(
      ".prototype-inspector__components-card { color: green; } /* Project: keep this note */\n.prototype-inspector__flow-viewport { inset: 0; }\n",
    ),
    ".prototype-inspector__components-card { color: green; } /* Project: keep this note */\n",
  );
  const withHeader = `.prototype-inspector__components-card {
  color: green;
}

/* ===== Project overrides: Components ===== */

/* Old flow badge. */
.prototype-inspector__flow-legacy-badge {
  color: red;
}

.prototype-inspector__components-chip {
  color: blue;
}
`;
  assert.equal(
    stripFlowRules(withHeader),
    `.prototype-inspector__components-card {
  color: green;
}

/* ===== Project overrides: Components ===== */

.prototype-inspector__components-chip {
  color: blue;
}
`,
  );
  // A comment that starts on the kept rule's line but spans lines stays whole.
  const spanning = ".prototype-inspector__panel { } /* starts\n ends */\n.prototype-inspector__flow-x { }\n";
  assert.equal(splitCssRules(spanning).map((fragment) => fragment.text).join(""), spanning);
  assert.doesNotThrow(() => splitCssRules(stripFlowRules(spanning)));
});

test("stripFlowRules never splits a comment or joins lines", () => {
  // A blank line inside the comment above a removed rule is not a separator.
  assert.equal(
    stripFlowRules(
      ".prototype-inspector__panel {\n  gap: 0;\n}\n\n/* Old flow badge.\n\n   Kept from the 2025 redesign. */\n.prototype-inspector__flow-badge {\n  color: red;\n}\n\n.prototype-inspector__card {\n  gap: 0;\n}\n",
    ),
    ".prototype-inspector__panel {\n  gap: 0;\n}\n\n.prototype-inspector__card {\n  gap: 0;\n}\n",
  );
  // CRLF files keep a heading a blank line separates.
  const crlf = ".prototype-inspector__panel {\r\n  gap: 0;\r\n}\r\n\r\n/* Project overrides */\r\n\r\n/* Old. */\r\n.prototype-inspector__flow-badge {\r\n  color: red;\r\n}\r\n\r\n.prototype-inspector__card {\r\n  gap: 0;\r\n}\r\n";
  assert.equal(
    stripFlowRules(crlf),
    ".prototype-inspector__panel {\r\n  gap: 0;\r\n}\r\n\r\n/* Project overrides */\r\n\r\n.prototype-inspector__card {\r\n  gap: 0;\r\n}\r\n",
  );
  // The first rule of an at-rule, and a rule sharing a line with a kept one.
  assert.equal(
    stripFlowRules(
      "@media (max-width: 700px) {\n  .prototype-inspector__flow-x {\n    gap: 0;\n  }\n  .prototype-inspector__panel {\n    gap: 0;\n  }\n}\n",
    ),
    "@media (max-width: 700px) {\n  .prototype-inspector__panel {\n    gap: 0;\n  }\n}\n",
  );
  assert.equal(
    stripFlowRules(".prototype-inspector__panel { } .prototype-inspector__flow-x { }\n.prototype-inspector__card { }\n"),
    ".prototype-inspector__panel { }\n.prototype-inspector__card { }\n",
  );
});

test("comment markers inside selector strings, multi-line removals and a BOM", () => {
  const globRule =
    '.prototype-inspector__flow-legacy[data-glob="/*"], .prototype-inspector__panel[data-glob="*/"] { outline: 0; }\n';
  assert.equal(classifyRule(globRule).mixed, true);
  assert.equal(stripFlowRules(globRule), globRule);
  assert.equal(
    stripFlowRules(
      ".prototype-inspector__panel { gap: 0; } .prototype-inspector__flow-x {\n  gap: 0;\n} .prototype-inspector__card { gap: 0; }\n",
    ),
    // The space before the card rule is its own leading text.
    ".prototype-inspector__panel { gap: 0; }\n .prototype-inspector__card { gap: 0; }\n",
  );
  assert.equal(
    stripFlowRules("\uFEFF.prototype-inspector__flow-x { gap: 0; }\n.prototype-inspector__panel { gap: 0; }\n"),
    "\uFEFF.prototype-inspector__panel { gap: 0; }\n",
  );
});

test("a comment on an at-rule's opening line stays when its first rule is removed", () => {
  assert.equal(
    stripFlowRules(
      "@media (max-width: 700px) { /* Project: mobile overrides */\n  .prototype-inspector__flow-canvas {\n    inset: 0;\n  }\n  .prototype-inspector__panel {\n    gap: 0;\n  }\n}\n",
    ),
    "@media (max-width: 700px) { /* Project: mobile overrides */\n  .prototype-inspector__panel {\n    gap: 0;\n  }\n}\n",
  );
});

test("escaped characters in selectors do not move parentheses or commas", () => {
  assert.equal(classifyRule(".prototype-inspector__flow-x .icon\\(, .prototype-inspector__panel { }").mixed, true);
  assert.equal(classifyRule(".prototype-inspector__panel:not(.a\\) .prototype-inspector__flow-x) { }").mixed, true);
  assert.equal(classifyRule(".prototype-inspector__flow-x .icon\\{ { gap: 0; }").isFlow, true);
});

test("partitionFlowRules splits a stylesheet into UI Flow rules and the rest", () => {
  const { flow, rest } = partitionFlowRules(sample);

  assert.equal(rest, sampleWithoutFlow);
  assert.ok(splitCssRules(flow).every((fragment) => fragment.kind === "trailing" || fragment.isFlow));
  assert.equal(stripFlowRules(flow).trim(), "");
  assert.ok(flow.includes("@media (max-width: 700px) {"));
  assert.ok(!flow.includes(".prototype-inspector__panel {"));
  assert.ok(!flow.includes(":root"));
});

test("the bundled stylesheets keep UI Flow rules in flow-canvas.css only", () => {
  const inspectorCss = fs.readFileSync(inspectorCssUrl, "utf8");
  const flowCss = fs.readFileSync(flowCssUrl, "utf8");

  assert.deepEqual(findFlowRules(inspectorCss), []);
  assert.deepEqual(findMixedRules(inspectorCss), []);
  assert.deepEqual(findMixedRules(flowCss), []);
  assert.deepEqual(
    splitCssRules(flowCss)
      .filter((fragment) => fragment.kind !== "trailing" && !fragment.isFlow)
      .map((fragment) => `${fragment.line}: ${fragment.selector}`),
    [],
  );
  assert.ok(findFlowRules(flowCss).length > 0);
  assert.doesNotMatch(flowCss, /var\(--sbt-/);
});

test("flow-canvas.css carries the shared visually-hidden rule for the UI Flow", () => {
  const body = (css, selector) =>
    splitCssRules(css).find((fragment) => fragment.selector === selector)?.body.trim();
  const shared = body(fs.readFileSync(inspectorCssUrl, "utf8"), ".prototype-inspector__visually-hidden");

  assert.ok(shared, "prototype-inspector.css keeps the rule for the other modes");
  assert.equal(
    body(fs.readFileSync(flowCssUrl, "utf8"), ".prototype-inspector--flow .prototype-inspector__visually-hidden"),
    shared,
    "the UI Flow copy declares the same properties",
  );
});

test("unbalanced braces and unterminated comments throw with their line", () => {
  assert.throws(() => splitCssRules(".a {\n  color: red;\n"), /Unbalanced "\{" opened at line 1/);
  assert.throws(() => splitCssRules(".a { }\n}\n"), /Unbalanced "\}" at line 2/);
  assert.throws(() => splitCssRules(".a { }\n/* open"), /Unterminated comment at line 2/);
  assert.throws(() => stripFlowRules('.a { content: "x; }'), /Unterminated string at line 1/);
});
