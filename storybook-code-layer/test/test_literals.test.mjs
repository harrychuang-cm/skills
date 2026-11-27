// Tokenizing literals: the shared property table, the literal verdicts, the
// component replacement, the value comparison and the candidate order.
import assert from "node:assert/strict";
import test from "node:test";

import { addon } from "./helpers.mjs";

const table = await addon("shared/property-table.mjs");

// ---- 1.1 the shared property table ----------------------------------------------------

// The slots of the panel before the table moved to property-table.mjs (1.3.1), written out.
const SLOTS_BEFORE_THE_MOVE = [
  "display", "flex-direction", "align-items", "justify-content", "flex-wrap", "row-gap", "column-gap",
  "padding-block-start", "padding-inline-end", "padding-block-end", "padding-inline-start",
  "margin-block-start", "margin-inline-end", "margin-block-end", "margin-inline-start",
  "inline-size", "block-size", "min-inline-size", "min-block-size", "max-inline-size", "max-block-size",
  "opacity", "border-start-start-radius", "border-start-end-radius", "border-end-end-radius", "border-end-start-radius",
  "background-color", "fill",
  "border-block-start-color", "border-inline-end-color", "border-block-end-color", "border-inline-start-color",
  "border-block-start-width", "border-inline-end-width", "border-block-end-width", "border-inline-start-width",
  "outline-color", "outline-width", "stroke", "stroke-width",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color",
];

test("the server and the browser read one property table, with the same slots as before", () => {
  assert.deepEqual(Object.keys(table.GROUP_OF_SLOT).sort(), [...SLOTS_BEFORE_THE_MOVE].sort());
  for (const slot of SLOTS_BEFORE_THE_MOVE) {
    const kinds = table.kindsOfSlot(slot);
    assert.ok(Array.isArray(kinds), `${slot} has a kind list`);
  }
  assert.equal(table.kindsOfSlot("not-a-slot"), null);
  // Structural and keyword rows accept no token kind; the others accept their group's kinds.
  for (const slot of ["display", "flex-direction", "align-items", "justify-content", "flex-wrap"]) assert.deepEqual(table.kindsOfSlot(slot), [], slot);
  assert.deepEqual(table.kindsOfSlot("margin-block-start"), ["dimension", "zero", "percentage"]);
  assert.deepEqual(table.kindsOfSlot("line-height"), ["number", "dimension", "percentage", "zero"]);
  assert.deepEqual(table.kindsOfSlot("fill"), ["color"]);
  // A caller cannot change the table through the returned list.
  table.kindsOfSlot("color").push("dimension");
  assert.deepEqual(table.kindsOfSlot("color"), ["color"]);
  assert.deepEqual(table.SECTIONS, ["layout", "spacing", "size", "appearance", "fill", "stroke", "typography"]);
});

// ---- 1.2 literal verdicts, replacement and value comparison ----------------------------

const literals = await addon("shared/literals.mjs");
const LENGTH = ["dimension", "zero", "percentage"];

test("literal components follow the shape-to-verdict table of the specification", () => {
  const verdict = (value, index, accepted, available) => {
    const v = literals.literalVerdict(value, index, { accepted, available });
    return v.tokenizable ? `tokenizable:${v.kind}` : v.reason;
  };
  const lengthTokens = ["dimension", "zero"];
  const rows = [
    // value, component, accepted kinds, kinds of the tokens on offer, expected
    ["0 0 var(--gap)", 0, LENGTH, lengthTokens, "tokenizable:zero"],
    ["0 0 var(--gap)", 1, LENGTH, lengthTokens, "tokenizable:zero"],
    ["0 0 var(--gap)", 2, LENGTH, lengthTokens, "not-a-literal"],
    ["12px", 0, LENGTH, lengthTokens, "tokenizable:dimension"],
    ["1px solid #000", 0, ["dimension", "zero"], ["dimension", "color"], "tokenizable:dimension"],
    ["1px solid #000", 1, [], ["dimension", "color"], "keyword"],
    ["1px solid #000", 2, ["color"], ["dimension", "color"], "tokenizable:color"],
    ["70%", 0, LENGTH, ["dimension"], "tokenizable:percentage"],
    ["0.5", 0, ["number", "zero", "percentage"], ["color", "dimension"], "no-token-of-kind"],
    ["calc(100% - 16px)", 0, LENGTH, lengthTokens, "literal-expression"],
    ['"Noto Sans", sans-serif', 0, ["font-family"], ["font-family"], "literal-list"],
    ["fit-content", 0, LENGTH, lengthTokens, "keyword"],
    ["8px / 4px", 0, LENGTH, lengthTokens, "literal-list"],
    ["inherit", 0, LENGTH, lengthTokens, "keyword"],
    ["8px", 0, ["number", "zero", "percentage"], ["number"], "literal-expression"],
    ['"Noto Sans"', 0, ["font-family"], ["font-family"], "tokenizable:font-family"],
    ["700", 0, ["number"], ["number"], "tokenizable:number"],
  ];
  for (const [value, index, accepted, available, expected] of rows) {
    assert.equal(verdict(value, index, accepted, available), expected, `${value} [${index}]`);
  }
  assert.equal(literals.literalVerdict("12px", 3, { accepted: LENGTH, available: LENGTH }).reason, "not-a-literal", "no such component");
  // A list of literals is read-only as a list even where the sides of its components cannot be asked for.
  for (const value of ['"Noto Sans", sans-serif', "8px / 4px", "1px, 2px"]) assert.equal(literals.isLiteralList(value), true, value);
  for (const value of ["0 0 8px", "var(--a), sans-serif", "calc(100% - 16px)", ""]) assert.equal(literals.isLiteralList(value), false, value);
});

test("tokenizing a component and restoring it gives back the exact text", () => {
  const cases = [
    ["0 12px", 1, "12px"],
    ["8px /* tight */ 16px", 0, "8px"],
    ["8px /* tight */ 16px", 1, "16px"],
    ["0\n    0\n    var(--gap)", 1, "0"],
    ["1px\r\n  solid\r\n  #000", 2, "#000"],
    ["  70%  ", 0, "70%"],
  ];
  for (const [value, index, literal] of cases) {
    const tokenized = literals.tokenizeComponent(value, index, literal, "--md-sys-spacing-sm");
    assert.equal(tokenized.replace("var(--md-sys-spacing-sm)", literal), value, `only the component changed in ${JSON.stringify(value)}`);
    assert.equal(literals.restoreComponent(tokenized, index, "--md-sys-spacing-sm", literal), value, `restored ${JSON.stringify(value)}`);
  }
  // The comment beside a component is not part of it.
  assert.equal(literals.tokenizeComponent("8px /* tight */ 16px", 0, "8px", "--t"), "var(--t) /* tight */ 16px");
  // A component that does not hold the stated text is refused.
  assert.throws(() => literals.tokenizeComponent("0 12px", 1, "13px", "--t"), (e) => e.code === "locator-mismatch");
  assert.throws(() => literals.restoreComponent("0 var(--other)", 1, "--t", "12px"), (e) => e.code === "locator-mismatch");
});

test("same value: same color, same number and unit, or both zero", () => {
  const same = [["8px", "8px"], ["#FFF", "rgb(255, 255, 255)"], ["#ffffff", "white"], ["0", "0px"], ["0%", "0"], ["1.5", "1.5"], ["70%", "70%"]];
  const different = [["1em", "16px"], ["8px", "8"], ["8px", "8.5px"], ["#000", "#000001"], ["0", "1px"], ["red", "8px"]];
  for (const [a, b] of same) assert.equal(literals.sameValue(a, b), true, `${a} = ${b}`);
  for (const [a, b] of different) assert.equal(literals.sameValue(a, b), false, `${a} ≠ ${b}`);
  assert.equal(literals.sameValue(null, "0"), false);
});

// ---- 4.2 the order of the candidates of a literal row ------------------------------------

function indexWith(tokens, declarations) {
  return {
    tokens: { items: tokens.map(([name, tier, category, alias = null]) => ({ name, tier, category, alias })) },
    css: { files: [{ file: "src/components/x/X.css", rules: [{ declarations: declarations.map(([property, names]) => ({ property, components: names.map((n, i) => ({ text: `var(${n})`, refIndex: i })), refs: names.map((n, i) => ({ name: n, refIndex: i })) })) }] }] },
  };
}
const TOKENS = [
  ["--md-sys-spacing-sm", "sys", "spacing"],
  ["--md-sys-spacing-xs", "sys", "spacing"],
  ["--md-sys-spacing-md", "sys", "spacing"],
  ["--md-sys-shape-corner-md", "sys", "shape"],
  ["--md-sys-shape-corner-none", "sys", "shape"],
  ["--md-sys-typescale-body-size", "sys", "typescale"],
  ["--md-sys-size-icon", "sys", "size"],
  ["--md-sys-size-touch", "sys", "size"],
  ["--md-comp-x-gap", "comp", "x", "--md-sys-spacing-xs"],
];
const VALUES = { "--md-sys-spacing-sm": "8px", "--md-sys-spacing-xs": "4px", "--md-sys-spacing-md": "16px", "--md-sys-shape-corner-md": "8px", "--md-sys-shape-corner-none": "0", "--md-sys-typescale-body-size": "16px", "--md-sys-size-icon": "24px", "--md-sys-size-touch": "48px" };
function order(literal, groupId, index, names) {
  const items = new Map(index.tokens.items.map((t) => [t.name, t]));
  const home = literals.homeCategories(groupId, literals.categoryUsage(index));
  return literals.orderLiteralCandidates(literal, names.map((n) => items.get(n)), { home, valueOf: (t) => VALUES[t.name] ?? null, categoryOf: (t) => literals.tokenCategoryOf(t.name, items) });
}

test("the literal 8px on a padding row: same value first, then the spacing scale by distance, then other categories by name", () => {
  // Padding declarations reference only spacing tokens, one of them through a component token.
  const index = indexWith(TOKENS, [["padding", ["--md-sys-spacing-sm"]], ["padding-inline", ["--md-comp-x-gap"]]]);
  const result = order("8px", "padding", index, ["--md-sys-typescale-body-size", "--md-sys-spacing-md", "--md-sys-shape-corner-md", "--md-sys-spacing-xs", "--md-sys-spacing-sm"]);
  assert.deepEqual(result.map((r) => [r.token.name, r.group, r.same]), [
    ["--md-sys-spacing-sm", 1, true],
    ["--md-sys-spacing-xs", 2, false],
    ["--md-sys-spacing-md", 2, false],
    ["--md-sys-shape-corner-md", 3, true],
    ["--md-sys-typescale-body-size", 3, false],
  ]);
});

test("a zero margin is not matched to a corner token: spacing tokens come first", () => {
  const index = indexWith(TOKENS, [["margin", ["--md-sys-spacing-sm"]]]);
  const result = order("0", "margin", index, ["--md-sys-shape-corner-none", "--md-sys-spacing-md", "--md-sys-spacing-sm", "--md-sys-spacing-xs"]);
  assert.deepEqual(result.map((r) => [r.token.name, r.group, r.same]), [
    ["--md-sys-spacing-xs", 2, false],
    ["--md-sys-spacing-sm", 2, false],
    ["--md-sys-spacing-md", 2, false],
    ["--md-sys-shape-corner-none", 3, true],
  ]);
  assert.equal(result.filter((r) => r.group === 1).length, 0, "the first group is empty");
});

test("a size row that references no token borrows the categories of its section", () => {
  // No max-inline-size declaration references a token; min-block-size declarations reference size tokens.
  const index = indexWith(TOKENS, [["min-block-size", ["--md-sys-size-touch"]], ["padding", ["--md-sys-spacing-sm"]]]);
  assert.deepEqual([...literals.homeCategories("maxInlineSize", literals.categoryUsage(index))], ["size"]);
  const result = order("70%", "maxInlineSize", index, ["--md-sys-spacing-md", "--md-sys-size-touch", "--md-sys-shape-corner-md", "--md-sys-size-icon"]);
  assert.deepEqual(result.slice(0, 2).map((r) => [r.token.name, r.group]), [["--md-sys-size-icon", 2], ["--md-sys-size-touch", 2]]);
  assert.ok(result.slice(2).every((r) => r.group === 3));
});

test("a border shorthand that mixes a literal and a reference counts its reference's category for the border color", () => {
  const index = {
    tokens: { items: [{ name: "--md-sys-color-outline", tier: "sys", category: "color", kind: "color", alias: null }] },
    css: { files: [{ file: "src/components/x/X.css", rules: [{ declarations: [{
      property: "border",
      components: [{ text: "1px", refIndex: null, shape: "raw" }, { text: "solid", refIndex: null, shape: "keyword" }, { text: "var(--md-sys-color-outline)", refIndex: 0, shape: "single-var" }],
      refs: [{ name: "--md-sys-color-outline", refIndex: 0 }],
    }] }] }] },
  };
  const usage = literals.categoryUsage(index);
  const group = table.GROUP_OF_SLOT["border-block-start-color"].id;
  assert.deepEqual([...(usage.get(group) ?? [])], ["color"]);
});
