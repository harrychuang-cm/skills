// Platform features the tool cannot work without. Checked before the first
// activation: when one is missing the tool stays suspended and attaches
// nothing, instead of running half of itself.

export type Capability = { id: string; present: () => boolean };

export const REQUIRED_CAPABILITIES: Capability[] = [
  { id: "popover", present: () => typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function" },
  { id: "adopted-stylesheets", present: () => "adoptedStyleSheets" in document && Array.isArray(document.adoptedStyleSheets) },
  {
    id: "constructable-stylesheets",
    present: () => {
      try {
        return typeof CSSStyleSheet === "function" && typeof new CSSStyleSheet().replaceSync === "function";
      } catch {
        return false;
      }
    },
  },
  { id: "web-crypto", present: () => typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function" },
  { id: "elements-from-point", present: () => typeof document.elementsFromPoint === "function" },
  { id: "get-animations", present: () => typeof Element !== "undefined" && typeof Element.prototype.getAnimations === "function" },
];

/** Ids of the required features this browser lacks (empty: the tool can run). */
export function missingCapabilities(): string[] {
  return REQUIRED_CAPABILITIES.filter((capability) => {
    try {
      return !capability.present();
    } catch {
      return true;
    }
  }).map((capability) => capability.id);
}
