// Keep the project's own type check away from the installed addon: when the
// project tsconfig.json includes files under .storybook/, add
// ".storybook/code-layer/**" to its `exclude` array (the addon has its own
// tsconfig.json). Pure function over the source text.
import { appendElement, findArrayOpen, readArrayElements, removeElement } from "./array_literal.mjs";

/** Parse JSONC (comments, trailing commas) for reading only. */
export function parseJsonc(source) {
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === '"') {
      let end = i + 1;
      for (; end < source.length && source[end] !== '"'; end += 1) if (source[end] === "\\") end += 1;
      out += source.slice(i, end + 1);
      i = end;
    } else if (c === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      i = (end === -1 ? source.length : end) - 1;
    } else if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
    } else if (c === ",") {
      const rest = /^\s*([}\]])/.exec(source.slice(i + 1).replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""));
      if (!rest) out += c;
    } else {
      out += c;
    }
  }
  return JSON.parse(out);
}

function globToRegExp(pattern) {
  let p = pattern.replace(/^\.\//, "");
  if (!/[*?]/.test(p) && !/\.[a-z]+$/i.test(p)) p = `${p.replace(/\/$/, "")}/**/*`;
  let re = "";
  for (let i = 0; i < p.length; i += 1) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") {
      if (p[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Does the include list pull in files from <configDirName>/code-layer/? */
export function includesAddon(tsconfig, configDirName = ".storybook") {
  if (Array.isArray(tsconfig.files) && !tsconfig.include) return false;
  const include = Array.isArray(tsconfig.include) ? tsconfig.include : ["**/*"];
  const samples = ["runtime/index.ts", "manager.tsx", "shared/protocol.ts"].map((f) => `${configDirName}/code-layer/${f}`);
  return include.some((pattern) => samples.some((sample) => globToRegExp(String(pattern)).test(sample)));
}

/**
 * @returns {{ status: "present" | "added" | "not-needed" | "manual", source: string, entry: string, notes: string[] }}
 */
export function wireTsconfig(source, { fileName = "tsconfig.json", configDirName = ".storybook" } = {}) {
  const entry = `${configDirName}/code-layer/**`;
  const parsed = parseJsonc(source);
  const notes = [];
  if (!includesAddon(parsed, configDirName)) return { status: "not-needed", source, entry, notes };
  if (Array.isArray(parsed.exclude) && parsed.exclude.some((e) => String(e).replace(/^\.\//, "") === entry)) {
    return { status: "present", source, entry, notes };
  }
  const open = findArrayOpen(source, "exclude");
  if (open === -1 || !readArrayElements(source, open)) {
    // Adding a new exclude list would drop TypeScript's default excludes;
    // leave that decision to a person.
    notes.push(`${fileName} has no exclude array; add "exclude": [..., "${entry}"] by hand (keeping what the project needs excluded), so the project's own type check skips the addon`);
    return { status: "manual", source, entry, notes };
  }
  const next = appendElement(source, open, JSON.stringify(entry));
  notes.push(`adds "${entry}" to exclude in ${fileName}`);
  return { status: "added", source: next, entry, notes };
}

/**
 * Remove the exclude entry the installer added.
 * @returns {{ status: "removed" | "absent", source: string, notes: string[] }}
 */
export function unwireTsconfig(source, { fileName = "tsconfig.json", configDirName = ".storybook" } = {}) {
  const entry = `${configDirName}/code-layer/**`;
  const open = findArrayOpen(source, "exclude");
  const array = open === -1 ? null : readArrayElements(source, open);
  const index = array ? array.elements.findIndex((e) => source.slice(e.start, e.end).replace(/^["'](?:\.\/)?|["']$/g, "") === entry) : -1;
  if (index === -1) return { status: "absent", source, notes: [] };
  return { status: "removed", source: removeElement(source, open, index), notes: [`removes "${entry}" from exclude in ${fileName}`] };
}
