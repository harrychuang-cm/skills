// Inherited values: when the selected element does not declare an inherited
// property (or declares `inherit`, or `currentcolor` for the text color), walk
// up to the ancestor whose declaration provides the value and say what kind of
// place that is. Only a declaration of the selected element's own component
// can be edited from here.
import type { InheritedFrom } from "../shared/protocol";
import { describe, labelFor } from "./descriptor";
import { storyRoot } from "./frame";
import { STYLE_ATTRIBUTE } from "./tokens";
import type { SlotWinner, TraceContext } from "./tracer";

/** SVG paint properties inherit although their groups are not typographic. */
const INHERITED_SLOTS = new Set(["fill", "stroke", "stroke-width"]);

export function inheritsSlot(groupInherited: boolean, slot: string): boolean {
  return groupInherited || INHERITED_SLOTS.has(slot);
}

export type InheritedSource =
  | { kind: "own" }
  | { kind: "found"; winner: SlotWinner; element: Element; inherited: InheritedFrom }
  | { kind: "default"; inherited: InheritedFrom };

/** The winner hands the question on to the parent: `inherit`, or `currentcolor` for the text color. */
function passesThrough(winner: SlotWinner, slot: string): boolean {
  if (winner.source === "presentation-attribute" || !winner.decl || winner.component === null) return false;
  const text = (winner.decl.components[winner.component]?.text ?? "").trim().toLowerCase();
  return text === "inherit" || (slot === "color" && text === "currentcolor");
}

function componentRoot(node: Element, root: Element | null): Element | null {
  if (!root || !root.contains(node)) return null;
  for (let current: Element | null = node; current && current !== root; current = current.parentElement) {
    if (current.hasAttribute("data-component")) return current;
  }
  return null;
}

function classify(element: Element, ancestor: Element, winner: SlotWinner, ctx: TraceContext): InheritedFrom {
  const root = storyRoot();
  const inStory = Boolean(root && root !== ancestor && root.contains(ancestor));
  const label = inStory ? labelFor(ancestor, ctx.classPrefixes) : `<${ancestor.tagName.toLowerCase()}>`;
  const descriptor = inStory ? describe(ancestor, null, ctx.classPrefixes) : null;
  if (winner.source === "inline-style") return { kind: "outside", label, descriptor: null, source: STYLE_ATTRIBUTE };
  const identity = winner.candidate?.entry.identity ?? null;
  const selectedRoot = componentRoot(element, root);
  const declaringRoot = componentRoot(ancestor, root);
  if (identity?.ok && selectedRoot && declaringRoot === selectedRoot && identity.file.componentId === selectedRoot.getAttribute("data-component")) {
    return { kind: "same-component", label, descriptor, source: identity.file.workspacePath };
  }
  // A declaration of an enclosing component, or of another component's stylesheet reaching into this one.
  if (identity && declaringRoot) return { kind: "other-component", label, descriptor, source: identity.file.workspacePath };
  return { kind: "outside", label, descriptor: null, source: identity?.file.workspacePath ?? winner.candidate?.entry.label ?? null };
}

/**
 * Where the value of an inherited slot comes from.
 * `own`: the element's own declaration; `found`: an ancestor's; `default`: no
 * declaration anywhere, the browser default.
 */
export function findInheritedSource(
  element: Element,
  slot: string,
  own: SlotWinner | null,
  winnersOf: (node: Element) => Map<string, SlotWinner>,
  ctx: TraceContext,
): InheritedSource {
  if (own && !passesThrough(own, slot)) return { kind: "own" };
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const winner = winnersOf(ancestor).get(slot);
    if (!winner || passesThrough(winner, slot)) continue;
    return { kind: "found", winner, element: ancestor, inherited: classify(element, ancestor, winner, ctx) };
  }
  return { kind: "default", inherited: { kind: "default", label: null, descriptor: null, source: null } };
}
