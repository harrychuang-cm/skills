// Wire the Code Layer preset into a Storybook main config: one element at the
// end of the `addons` array. Pure function over the source text; the caller
// decides whether to write.
import { appendElement, findArrayOpen, maskStringsAndComments, readArrayElements } from "./array_literal.mjs";

export const PRESET_MARKER = "code-layer/preset.js";

/**
 * @param {string} source  contents of .storybook/main.{ts,mts,js,mjs,cjs}
 * @param {{ fileName: string, configDirName?: string }} options
 * @returns {{ status: "present" | "added", source: string, entry: string | null, notes: string[] }}
 *   Throws with a readable message when the config cannot be wired safely.
 */
export function wireMain(source, { fileName, configDirName = ".storybook" }) {
  const notes = [];
  const masked = maskStringsAndComments(source);
  if (/\bdefineMain\s*\(/.test(masked)) {
    throw new Error("這個專案使用 CSF factories（defineMain）；Storybook 會忽略 previewAnnotations，Code Layer 驗證階段不支援。");
  }
  const open = findArrayOpen(source, "addons");
  const array = open === -1 ? null : readArrayElements(source, open);
  const presetElements = array ? array.elements.filter((e) => source.slice(e.start, e.end).includes(PRESET_MARKER)) : [];
  const mentions = source.split(PRESET_MARKER).length - 1;

  if (mentions > 0) {
    if (presetElements.length === 1 && mentions === 1) return { status: "present", source, entry: null, notes };
    if (presetElements.length > 1) throw new Error(`${fileName} 的 addons 陣列有 ${presetElements.length} 個 Code Layer preset，請手動移除重複的。`);
    throw new Error(`${fileName} 提到 ${PRESET_MARKER}，但不是 addons 陣列的一個元素；請手動檢查。`);
  }
  if (!array) {
    throw new Error(`${fileName} 找不到 addons 陣列；請手動把 Code Layer preset 加進 addons。`);
  }

  const presetPath = `${configDirName}/code-layer/preset.js`;
  const isCommonJs = fileName.endsWith(".cjs") || (/\bmodule\.exports\b/.test(masked) && !/^\s*(import|export)\s/m.test(masked));
  let next = source;
  let entry;
  if (isCommonJs) {
    entry = `require("node:path").resolve(process.cwd(), ${JSON.stringify(presetPath)})`;
  } else {
    entry = `resolve(process.cwd(), ${JSON.stringify(presetPath)})`;
    const importsResolve = /import\s*\{[^}]*\bresolve\b[^}]*\}\s*from\s*["'](?:node:)?path["']/.test(source);
    const shadowed = !importsResolve && /\bresolve\b/.test(masked);
    if (shadowed) {
      throw new Error(`${fileName} 已經有別的 resolve，請手動加入：resolve(process.cwd(), "${presetPath}")（從 node:path 匯入）。`);
    }
    if (!importsResolve) {
      const firstImport = /^import\s/m.exec(source);
      const at = firstImport ? firstImport.index : 0;
      next = `${next.slice(0, at)}import { resolve } from "node:path";\n${next.slice(at)}`;
      notes.push(`在 ${fileName} 加入 import { resolve } from "node:path"`);
    }
  }
  const openAfterImport = findArrayOpen(next, "addons");
  next = appendElement(next, openAfterImport, entry);
  notes.push(`在 ${fileName} 的 addons 陣列末尾加入 Code Layer preset`);
  return { status: "added", source: next, entry, notes };
}
