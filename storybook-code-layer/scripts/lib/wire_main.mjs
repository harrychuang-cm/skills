// Wire the Code Layer preset into a Storybook main config: one element at the
// end of the `addons` array. Pure function over the source text; the caller
// decides whether to write.
import { appendElement, findArrayOpen, maskStringsAndComments, readArrayElements, removeElement } from "./array_literal.mjs";

export const PRESET_MARKER = "code-layer/preset.js";
const RESOLVE_IMPORT = 'import { resolve } from "node:path";\n';

/**
 * @param {string} source  contents of .storybook/main.{ts,mts,js,mjs,cjs}
 * @param {{ fileName: string, configDirName?: string }} options
 * @returns {{ status: "present" | "added", source: string, entry: string | null, notes: string[], addedResolveImport: boolean }}
 *   Throws with a readable message when the config cannot be wired safely.
 */
export function wireMain(source, { fileName, configDirName = ".storybook" }) {
  const notes = [];
  const masked = maskStringsAndComments(source);
  if (/\bdefineMain\s*\(/.test(masked)) {
    throw new Error("this project uses CSF factories (defineMain); Storybook then ignores preview annotations contributed by presets, which Code Layer needs");
  }
  const open = findArrayOpen(source, "addons");
  const array = open === -1 ? null : readArrayElements(source, open);
  const presetElements = array ? array.elements.filter((e) => source.slice(e.start, e.end).includes(PRESET_MARKER)) : [];
  const mentions = source.split(PRESET_MARKER).length - 1;

  if (mentions > 0) {
    if (presetElements.length === 1 && mentions === 1) return { status: "present", source, entry: null, notes, addedResolveImport: false };
    if (presetElements.length > 1) throw new Error(`the addons array of ${fileName} lists the Code Layer preset ${presetElements.length} times; remove the duplicates by hand`);
    throw new Error(`${fileName} mentions ${PRESET_MARKER}, but not as an element of the addons array; check the file by hand`);
  }
  if (!array) {
    throw new Error(`${fileName} has no addons array the installer can edit; add the Code Layer preset to addons by hand`);
  }

  const presetPath = `${configDirName}/code-layer/preset.js`;
  const isCommonJs = fileName.endsWith(".cjs") || (/\bmodule\.exports\b/.test(masked) && !/^\s*(import|export)\s/m.test(masked));
  let next = source;
  let entry;
  let addedResolveImport = false;
  if (isCommonJs) {
    entry = `require("node:path").resolve(process.cwd(), ${JSON.stringify(presetPath)})`;
  } else {
    entry = `resolve(process.cwd(), ${JSON.stringify(presetPath)})`;
    const importsResolve = /import\s*\{[^}]*\bresolve\b[^}]*\}\s*from\s*["'](?:node:)?path["']/.test(source);
    const shadowed = !importsResolve && /\bresolve\b/.test(masked);
    if (shadowed) {
      throw new Error(`${fileName} already uses another \`resolve\`; add this element to addons by hand, with resolve imported from node:path: resolve(process.cwd(), "${presetPath}")`);
    }
    if (!importsResolve) {
      const firstImport = /^import\s/m.exec(source);
      const at = firstImport ? firstImport.index : 0;
      next = `${next.slice(0, at)}${RESOLVE_IMPORT}${next.slice(at)}`;
      addedResolveImport = true;
      notes.push(`adds \`import { resolve } from "node:path"\` to ${fileName}`);
    }
  }
  const openAfterImport = findArrayOpen(next, "addons");
  next = appendElement(next, openAfterImport, entry);
  notes.push(`adds the Code Layer preset as the last element of addons in ${fileName}`);
  return { status: "added", source: next, entry, notes, addedResolveImport };
}

/**
 * Take the Code Layer preset out of the `addons` array again, and — only when
 * the installer added it and nothing else uses it — the `resolve` import.
 * @returns {{ status: "removed" | "absent", source: string, notes: string[], removedImport: boolean }}
 */
export function unwireMain(source, { fileName, removeResolveImport = false }) {
  const notes = [];
  const open = findArrayOpen(source, "addons");
  const array = open === -1 ? null : readArrayElements(source, open);
  const index = array ? array.elements.findIndex((e) => source.slice(e.start, e.end).includes(PRESET_MARKER)) : -1;
  if (index === -1) return { status: "absent", source, notes, removedImport: false };
  let next = removeElement(source, open, index);
  notes.push(`removes the Code Layer preset from addons in ${fileName}`);
  let removedImport = false;
  if (removeResolveImport && next.includes(RESOLVE_IMPORT)) {
    const without = next.replace(RESOLVE_IMPORT, "");
    // Keep the import when the file uses `resolve` for something else.
    if (!/\bresolve\b/.test(maskStringsAndComments(without))) {
      next = without;
      removedImport = true;
      notes.push(`removes the \`import { resolve } from "node:path"\` the installer added`);
    }
  }
  return { status: "removed", source: next, notes, removedImport };
}
