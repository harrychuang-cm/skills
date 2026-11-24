// Stable element descriptors that survive re-renders and hot updates, plus labels.
import type { Descriptor } from "../shared/protocol";
import { renderChildren, renderParent, storyRoot } from "./frame";

export function titleCase(kebab: string): string {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function prefixedClass(element: Element, prefixes: string[]): string | null {
  for (const name of Array.from(element.classList)) {
    if (prefixes.some((prefix) => name.startsWith(prefix))) return name;
  }
  return null;
}

function componentAncestor(element: Element, root: Element): Element | null {
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
    if (node.hasAttribute("data-component")) return node;
  }
  return null;
}

export function labelFor(element: Element, prefixes: string[]): string {
  const component = element.getAttribute("data-component");
  if (component) {
    const variant = element.getAttribute("data-variant");
    return variant ? `${titleCase(component)} / ${variant}` : titleCase(component);
  }
  const root = storyRoot();
  const owner = root ? componentAncestor(element, root) : null;
  const cls = prefixedClass(element, prefixes);
  const part = cls?.includes("__") ? cls.split("__")[1].split("--")[0] : null;
  if (owner) return `${titleCase(owner.getAttribute("data-component") ?? "")} › ${part ?? element.tagName.toLowerCase()}`;
  return part ?? cls ?? element.tagName.toLowerCase();
}

export function describe(element: Element, storyId: string | null, prefixes: string[]): Descriptor | null {
  const root = storyRoot();
  if (!root || !root.contains(element) || element === root) return null;
  const anchorElement = componentAncestor(element, root);
  let occurrence = 0;
  if (anchorElement) {
    const name = anchorElement.getAttribute("data-component") ?? "";
    occurrence = Array.from(root.querySelectorAll(`[data-component="${CSS.escape(name)}"]`)).indexOf(anchorElement);
  }
  const base = anchorElement ?? root;
  const path: Descriptor["path"] = [];
  for (let node: Element | null = element; node && node !== base; node = renderParent(node, base)) {
    const parent = renderParent(node, base) ?? base;
    const key = prefixedClass(node, prefixes);
    const siblings = renderChildren(parent).filter((child) =>
      key ? child.classList.contains(key) : child.tagName === node!.tagName,
    );
    path.unshift({ tag: node.tagName.toLowerCase(), key, index: Math.max(0, siblings.indexOf(node)) });
  }
  return {
    storyId,
    anchor: {
      component: anchorElement?.getAttribute("data-component") ?? null,
      variant: anchorElement?.getAttribute("data-variant") ?? null,
      occurrence,
    },
    path,
    signature: { tag: element.tagName.toLowerCase(), classes: Array.from(element.classList).slice(0, 8) },
    label: labelFor(element, prefixes),
  };
}

export function resolve(descriptor: Descriptor): Element | null {
  const root = storyRoot();
  if (!root) return null;
  let base: Element | null = root;
  if (descriptor.anchor.component) {
    const all = root.querySelectorAll(`[data-component="${CSS.escape(descriptor.anchor.component)}"]`);
    base = all[descriptor.anchor.occurrence] ?? null;
    if (!base) return null;
  }
  let current: Element = base;
  for (const step of descriptor.path) {
    const candidates = renderChildren(current).filter((child) =>
      step.key ? child.classList.contains(step.key) : child.tagName.toLowerCase() === step.tag,
    );
    const next = candidates[step.index];
    if (!next || next.tagName.toLowerCase() !== step.tag) return null;
    current = next;
  }
  return current.tagName.toLowerCase() === descriptor.signature.tag ? current : null;
}

export function pathText(descriptor: Descriptor): string {
  const head = descriptor.anchor.component
    ? `[data-component="${descriptor.anchor.component}"]#${descriptor.anchor.occurrence}`
    : "#storybook-root";
  const steps = descriptor.path.map((step) => `${step.key ? `.${step.key}` : step.tag}[${step.index}]`);
  return [head, ...steps].join(" › ");
}
