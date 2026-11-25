// Logical and physical properties resolve to the same side (shared/sides.mjs).
import assert from "node:assert/strict";
import test from "node:test";

import { addon } from "./helpers.mjs";

const { SUPPORTED_FLOWS, affectedSlots, mayOverlap, physicalSideOf, physicalToLogical, sidesOf } = await addon("shared/sides.mjs");
const { overriddenByLater } = await addon("server/css-index.mjs");

/** { slot: componentIndex } of a successful mapping. */
function slots(property, components, writingMode, direction) {
  const result = sidesOf(property, components, writingMode, direction);
  assert.equal(result.ok, true, `${property}: ${JSON.stringify(result)}`);
  return Object.fromEntries(result.slots.map((s) => [s.slot, s.component]));
}

const refused = (property, components, writingMode, direction) => {
  const result = sidesOf(property, components, writingMode, direction);
  assert.equal(result.ok, false, `${property} should be refused`);
  return result;
};

test("the block-start side follows the writing mode (specification table)", () => {
  // padding-block-start sets: top (horizontal-tb), right (vertical-rl), left (vertical-lr).
  assert.equal(physicalSideOf("block-start", "horizontal-tb", "ltr"), "top");
  assert.equal(physicalSideOf("block-start", "vertical-rl", "ltr"), "right");
  assert.equal(physicalSideOf("block-start", "vertical-lr", "ltr"), "left");
  // So the physical property of that side and the logical one are the same slot.
  assert.equal(physicalToLogical("padding-top", "horizontal-tb", "ltr"), "padding-block-start");
  assert.equal(physicalToLogical("padding-right", "vertical-rl", "ltr"), "padding-block-start");
  assert.equal(physicalToLogical("padding-left", "vertical-lr", "ltr"), "padding-block-start");
  assert.deepEqual(slots("padding-block-start", 1, "vertical-rl", "ltr"), { "padding-block-start": 0 });
  assert.deepEqual(slots("padding-right", 1, "vertical-rl", "ltr"), { "padding-block-start": 0 });
});

test("every writing mode and direction: all four physical sides map to distinct logical sides", () => {
  const expected = {
    "horizontal-tb/ltr": { top: "block-start", right: "inline-end", bottom: "block-end", left: "inline-start" },
    "horizontal-tb/rtl": { top: "block-start", right: "inline-start", bottom: "block-end", left: "inline-end" },
    "vertical-rl/ltr": { top: "inline-start", right: "block-start", bottom: "inline-end", left: "block-end" },
    "vertical-rl/rtl": { top: "inline-end", right: "block-start", bottom: "inline-start", left: "block-end" },
    "vertical-lr/ltr": { top: "inline-start", right: "block-end", bottom: "inline-end", left: "block-start" },
    "vertical-lr/rtl": { top: "inline-end", right: "block-end", bottom: "inline-start", left: "block-start" },
  };
  assert.deepEqual(SUPPORTED_FLOWS.map((f) => `${f.writingMode}/${f.direction}`).sort(), Object.keys(expected).sort());
  for (const [flow, sides] of Object.entries(expected)) {
    const [writingMode, direction] = flow.split("/");
    for (const [physical, logical] of Object.entries(sides)) {
      assert.equal(physicalToLogical(`margin-${physical}`, writingMode, direction), `margin-${logical}`, `${flow} margin-${physical}`);
      assert.equal(physicalSideOf(logical, writingMode, direction), physical, `${flow} ${logical}`);
      assert.equal(physicalToLogical(`border-${physical}-width`, writingMode, direction), `border-${logical}-width`);
    }
  }
});

test("padding and margin: one to four components", () => {
  assert.deepEqual(slots("padding", 1), { "padding-block-start": 0, "padding-inline-end": 0, "padding-block-end": 0, "padding-inline-start": 0 });
  assert.deepEqual(slots("padding", 2), { "padding-block-start": 0, "padding-inline-end": 1, "padding-block-end": 0, "padding-inline-start": 1 });
  assert.deepEqual(slots("margin", 3), { "margin-block-start": 0, "margin-inline-end": 1, "margin-block-end": 2, "margin-inline-start": 1 });
  assert.deepEqual(slots("margin", 4), { "margin-block-start": 0, "margin-inline-end": 1, "margin-block-end": 2, "margin-inline-start": 3 });
  // `margin: 0 0 var(--gap)`: only the block-end side comes from the reference.
  assert.equal(slots("margin", ["0", "0", "var(--gap)"])["margin-block-end"], 2);
  // The four values are physical: in a vertical flow the first one is an inline side.
  assert.deepEqual(slots("padding", 4, "vertical-rl", "ltr"), { "padding-inline-start": 0, "padding-block-start": 1, "padding-inline-end": 2, "padding-block-end": 3 });
  assert.deepEqual(slots("padding", 2, "horizontal-tb", "rtl"), { "padding-block-start": 0, "padding-inline-start": 1, "padding-block-end": 0, "padding-inline-end": 1 });
  assert.equal(refused("padding", 5).reason, "unsupported-value");
  assert.equal(refused("padding", 0).reason, "unsupported-value");
});

test("padding-block, padding-inline and gap: one or two components, independent of the writing mode", () => {
  assert.deepEqual(slots("padding-block", 1), { "padding-block-start": 0, "padding-block-end": 0 });
  assert.deepEqual(slots("padding-block", 2), { "padding-block-start": 0, "padding-block-end": 1 });
  assert.deepEqual(slots("padding-inline", 2, "vertical-rl", "rtl"), { "padding-inline-start": 0, "padding-inline-end": 1 });
  assert.deepEqual(slots("margin-inline", 1), { "margin-inline-start": 0, "margin-inline-end": 0 });
  assert.equal(refused("padding-block", 3).reason, "unsupported-value");
  assert.deepEqual(slots("gap", 1), { "row-gap": 0, "column-gap": 0 });
  assert.deepEqual(slots("gap", 2), { "row-gap": 0, "column-gap": 1 });
  assert.deepEqual(slots("column-gap", 1), { "column-gap": 0 });
  assert.equal(refused("gap", 3).reason, "unsupported-value");
});

test("border-radius: one to four components map to corners; a slash is not supported", () => {
  assert.deepEqual(slots("border-radius", 1), { "border-start-start-radius": 0, "border-start-end-radius": 0, "border-end-end-radius": 0, "border-end-start-radius": 0 });
  assert.deepEqual(slots("border-radius", 2), { "border-start-start-radius": 0, "border-start-end-radius": 1, "border-end-end-radius": 0, "border-end-start-radius": 1 });
  assert.deepEqual(slots("border-radius", 3), { "border-start-start-radius": 0, "border-start-end-radius": 1, "border-end-end-radius": 2, "border-end-start-radius": 1 });
  assert.deepEqual(slots("border-radius", 4), { "border-start-start-radius": 0, "border-start-end-radius": 1, "border-end-end-radius": 2, "border-end-start-radius": 3 });
  // Physical corners: top-left is start-start only in a horizontal left-to-right flow.
  assert.equal(physicalToLogical("border-top-left-radius", "horizontal-tb", "ltr"), "border-start-start-radius");
  assert.equal(physicalToLogical("border-top-left-radius", "horizontal-tb", "rtl"), "border-start-end-radius");
  assert.equal(physicalToLogical("border-top-left-radius", "vertical-rl", "ltr"), "border-end-start-radius");
  assert.equal(physicalToLogical("border-top-right-radius", "vertical-rl", "ltr"), "border-start-start-radius");
  assert.equal(physicalToLogical("border-bottom-left-radius", "vertical-lr", "ltr"), "border-start-end-radius");
  assert.deepEqual(slots("border-radius", 4, "vertical-rl", "ltr"), { "border-end-start-radius": 0, "border-start-start-radius": 1, "border-start-end-radius": 2, "border-end-end-radius": 3 });
  const slash = refused("border-radius", ["var(--a)", "var(--b)", "/", "var(--c)"]);
  assert.equal(slash.reason, "unsupported-value");
  assert.equal(slash.affected.length, 4, "the declaration still overrides the four corners");
});

test("border and outline: width, style and color are told apart by the kind of each component", () => {
  const sides = ["block-start", "inline-end", "block-end", "inline-start"];
  const all = (width, style, color) => Object.fromEntries(sides.flatMap((s) => [[`border-${s}-width`, width], [`border-${s}-style`, style], [`border-${s}-color`, color]]));
  const w = { text: "var(--w)", kind: "dimension" };
  const c = { text: "var(--c)", kind: "color" };
  assert.deepEqual(slots("border", [w, "solid", c]), all(0, 1, 2));
  assert.deepEqual(slots("border", [c, w, "dashed"]), all(1, 2, 0), "any order");
  assert.deepEqual(slots("border", ["1px", "solid"]), all(0, 1, null), "a missing part is reset without a component");
  assert.deepEqual(slots("border", ["thin", "dotted", "currentcolor"]), all(0, 1, 2));
  assert.deepEqual(slots("border-block-start", [w, "solid", c]), { "border-block-start-width": 0, "border-block-start-style": 1, "border-block-start-color": 2 });
  assert.deepEqual(Object.keys(slots("border-inline", ["1px", "solid", "red"])).sort(), ["border-inline-end-color", "border-inline-end-style", "border-inline-end-width", "border-inline-start-color", "border-inline-start-style", "border-inline-start-width"]);
  assert.deepEqual(slots("border-right", [w, "solid", c], "vertical-rl", "ltr"), { "border-block-start-width": 0, "border-block-start-style": 1, "border-block-start-color": 2 });
  assert.deepEqual(slots("outline", [w, "solid", c]), { "outline-width": 0, "outline-style": 1, "outline-color": 2 });
  assert.equal(refused("border", ["var(--w)", "solid", "var(--c)"]).reason, "unsupported-value", "a var() of unknown kind cannot be placed");
  assert.equal(refused("border", [w, w, c]).reason, "unsupported-value", "two widths");
  assert.equal(refused("border", [w, "solid", c, "red"]).reason, "unsupported-value");
  assert.deepEqual(slots("border-color", [c, c]), { "border-block-start-color": 0, "border-inline-end-color": 1, "border-block-end-color": 0, "border-inline-start-color": 1 });
  assert.deepEqual(slots("border-block-width", 2), { "border-block-start-width": 0, "border-block-end-width": 1 });
});

test("sizes, single properties and other shorthands", () => {
  assert.equal(physicalToLogical("width", "horizontal-tb", "ltr"), "inline-size");
  assert.equal(physicalToLogical("width", "vertical-rl", "ltr"), "block-size");
  assert.equal(physicalToLogical("min-height", "horizontal-tb", "ltr"), "min-block-size");
  assert.equal(physicalToLogical("max-height", "vertical-lr", "rtl"), "max-inline-size");
  assert.equal(physicalToLogical("min-inline-size"), "min-inline-size", "a slot is returned unchanged");
  assert.equal(physicalToLogical("padding"), null, "a shorthand is not one side");
  assert.equal(physicalToLogical("transform"), null);
  assert.deepEqual(slots("font-size", 1), { "font-size": 0 });
  assert.deepEqual(slots("opacity", 1), { opacity: 0 });
  assert.deepEqual(slots("background", [{ text: "var(--fill)", kind: "color" }]), { "background-color": 0 });
  assert.deepEqual(slots("background", ["none"]), { "background-color": null }, "the shorthand resets the color");
  assert.equal(refused("background", ["var(--unknown)"]).reason, "unsupported-value");
  assert.equal(refused("background", ["red", "blue"]).reason, "unsupported-value");
  assert.deepEqual(slots("flex-flow", ["column", "wrap"]), { "flex-direction": 0, "flex-wrap": 1 });
  assert.deepEqual(slots("flex-flow", ["wrap"]), { "flex-direction": null, "flex-wrap": 0 });
  const font = refused("font", 3);
  assert.equal(font.reason, "unsupported-shorthand");
  assert.deepEqual(font.affected, ["font-family", "font-size", "font-weight", "line-height"]);
  assert.equal(refused("transform", 1).reason, "unknown-property");
  assert.equal(affectedSlots("transform"), null);
});

test("sideways writing modes are reported as unsupported, with the sides they would touch", () => {
  for (const mode of ["sideways-rl", "sideways-lr", "nonsense"]) {
    const result = refused("padding", 1, mode, "ltr");
    assert.equal(result.reason, "unsupported-writing-mode");
    assert.equal(result.affected.length, 4);
    assert.equal(physicalToLogical("padding-left", mode, "ltr"), null);
    assert.equal(physicalSideOf("block-start", mode, "ltr"), null);
    assert.equal(refused("padding-block-start", 1, mode, "ltr").reason, "unsupported-writing-mode");
  }
});

test("overlap inside a rule: a component is overridden only when every side it sets is set again later, in every flow", () => {
  assert.ok(mayOverlap("padding", "padding-top"));
  assert.ok(mayOverlap("padding-top", "padding-block-start"), "the same side in a horizontal flow");
  assert.ok(mayOverlap("padding-top", "padding-inline-start"), "the same side in a vertical flow");
  assert.ok(!mayOverlap("padding-block", "padding-inline"));
  assert.ok(!mayOverlap("padding-top", "padding-bottom"));
  assert.ok(!mayOverlap("border", "border-radius"));
  assert.ok(mayOverlap("border", "border-block-start-color"));
  assert.ok(mayOverlap("gap", "column-gap"));
  assert.ok(mayOverlap("width", "inline-size") && mayOverlap("width", "block-size"));
  assert.ok(!mayOverlap("transform", "color"));
  assert.ok(mayOverlap("transform", "transform"));

  const part = (text) => ({ text, shape: "raw" });
  // `margin: 0 0 var(--gap)` followed by `margin-block-start`: the block-end side survives.
  assert.deepEqual(overriddenByLater("margin", [part("0"), part("0"), part("var(--gap)")], ["margin-block-start"]), { components: [false, false, false], declaration: false });
  // `padding: a b` followed by `padding-inline`: the second component is gone in a horizontal flow
  // but still sets the block sides in a vertical one, so it is not judged overridden.
  assert.deepEqual(overriddenByLater("padding", [part("a"), part("b")], ["padding-inline"]).declaration, false);
  assert.deepEqual(overriddenByLater("padding-block", [part("a"), part("b")], ["padding-block-end"]), { components: [false, true], declaration: false });
  assert.deepEqual(overriddenByLater("padding", [part("a")], ["padding"]), { components: [true], declaration: true });
  assert.deepEqual(overriddenByLater("padding", [part("a")], ["padding-block", "padding-inline"]), { components: [true], declaration: true });
  assert.deepEqual(overriddenByLater("padding", [part("a")], []), { components: [false], declaration: false });
  assert.deepEqual(overriddenByLater("transform", [part("none")], ["transform"]), { components: [true], declaration: true }, "an unknown property is compared by name");
  assert.deepEqual(overriddenByLater("transform", [part("none")], ["color"]), { components: [false], declaration: false });
  const border = [{ text: "var(--w)", shape: "single-var", kind: "dimension" }, part("solid"), { text: "var(--c)", shape: "single-var", kind: "color" }];
  assert.deepEqual(overriddenByLater("border", border, ["border-color"]), { components: [false, false, true], declaration: false });
});
