// The scope gate: what an agent run may have changed in its working copy.
//
// Accepted only when every difference is a modification of an existing file
// in the allowed set: the writable token source files, the files under the
// component roots, and the component specification files — narrowed by the
// binding's allow-list when there is one. Created, deleted or renamed files,
// changes outside the set, edited token mirrors (the server writes those), a
// changed set of declared token names, and stylesheets that no longer parse
// are each a violation with the path and a reason code. The gate decides from
// the files alone; nothing the agent says about its work counts.
import fs from "node:fs";
import path from "node:path";

import { relativePosix } from "../paths.mjs";
import { diffWorkCopy, sha256 } from "./workcopy.mjs";

/** `**` any number of folders, `*` within one folder, `?` one character. */
export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      out += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/**
 * The allowed set and the mirrors, as workspace-relative paths.
 * specFiles: [{ abs }] of the component specification directory.
 */
export function allowedSet(config, specFiles = []) {
  const rel = (abs) => relativePosix(config.workspaceRoot, abs);
  const tokenSources = config.tokens.tiers.filter((t) => t.writable).map((t) => rel(t.source));
  const mirrors = [config.tokens.entry, ...config.tokens.tiers].map((t) => t.mirror).filter(Boolean).map(rel);
  const componentRoots = config.components.roots.map((root) => rel(root).replace(/\/+$/, ""));
  const specs = specFiles.map((f) => rel(f.abs));
  const globs = config.agent.allowedGlobs ? config.agent.allowedGlobs.map(globToRegExp) : null;
  return {
    tokenSources,
    mirrors,
    componentRoots,
    specs,
    globs: config.agent.allowedGlobs ?? null,
    /** The role of a path when it is allowed, else null. */
    roleOf(file) {
      if (globs && !globs.some((g) => g.test(file))) return null;
      if (tokenSources.includes(file)) return "token-source";
      if (specs.includes(file)) return "spec";
      if (componentRoots.some((root) => file.startsWith(`${root}/`))) return file.endsWith(".css") ? "component-css" : "component-file";
      return null;
    },
    /** What may be changed, for the request file and the confirmation: paths and folders, then the narrowing patterns. */
    describe() {
      return { paths: [...tokenSources, ...componentRoots.map((root) => `${root}/**`), ...specs], narrowedTo: config.agent.allowedGlobs ?? null };
    },
  };
}

function customPropertyNames(postcss, text) {
  const names = new Set();
  postcss.parse(text).walkDecls((decl) => {
    if (decl.prop.startsWith("--")) names.add(decl.prop);
  });
  return names;
}

/**
 * Judge a working copy against its snapshot.
 * The real workspace is read only for token source files, to compare the declared names.
 * Returns { ok, violations: [{ path, code }], changes: [{ path, role }] }.
 */
export function judgeWorkCopy({ config, postcss, copyRoot, snapshot, specFiles }) {
  const set = allowedSet(config, specFiles);
  const diff = diffWorkCopy(copyRoot, snapshot);
  const violations = [];
  const changes = [];
  for (const file of diff.created) violations.push({ path: file, code: "file-created" });
  for (const file of diff.deleted) violations.push({ path: file, code: "file-deleted" });
  for (const file of diff.modified) {
    if (set.mirrors.includes(file)) {
      violations.push({ path: file, code: "mirror-edited" });
      continue;
    }
    const role = set.roleOf(file);
    if (!role) {
      violations.push({ path: file, code: "outside-allowed-set" });
      continue;
    }
    const after = fs.readFileSync(path.join(copyRoot, file), "utf8");
    if (file.endsWith(".css")) {
      try {
        postcss.parse(after);
      } catch (error) {
        violations.push({ path: file, code: "css-parse-error", detail: String(error.reason ?? error.message).slice(0, 200) });
        continue;
      }
    }
    if (role === "token-source") {
      // Compare with the file as it was copied; if the real one moved on meanwhile, the run is stale.
      const realBytes = fs.readFileSync(path.join(config.workspaceRoot, file));
      if (sha256(realBytes) !== snapshot.get(file)) {
        violations.push({ path: file, code: "stale-base" });
        continue;
      }
      const before = realBytes.toString("utf8");
      let same = false;
      try {
        const a = customPropertyNames(postcss, before);
        const b = customPropertyNames(postcss, after);
        same = a.size === b.size && [...a].every((name) => b.has(name));
      } catch {
        same = false;
      }
      if (!same) {
        violations.push({ path: file, code: "token-set-changed" });
        continue;
      }
    }
    changes.push({ path: file, role });
  }
  return { ok: violations.length === 0, violations, changes, diff };
}
