// Path containment, file facts and CSS enumeration. Never follows symlinked
// directories; writable targets must be plain, single-link regular files.
import fs from "node:fs";
import path from "node:path";

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function relativePosix(from, to) {
  return toPosix(path.relative(from, to));
}

export function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function fileFacts(absPath) {
  const stat = fs.lstatSync(absPath);
  return {
    isSymlink: stat.isSymbolicLink(),
    isFile: stat.isFile(),
    nlink: stat.nlink,
    mode: stat.mode & 0o7777,
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

/** realpath of the file and of every ancestor directory. */
export function realpathChain(absPath) {
  const chain = [];
  let current = absPath;
  for (;;) {
    chain.push(fs.realpathSync(current));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return chain;
}

/** Reasons a path cannot be written, or [] when it can. */
export function writableProblems(absPath, expectedChain) {
  const problems = [];
  let facts;
  try {
    facts = fileFacts(absPath);
  } catch {
    return ["missing"];
  }
  if (facts.isSymlink) problems.push("symlink");
  if (!facts.isFile) problems.push("not-a-regular-file");
  if (facts.nlink !== 1) problems.push("hard-linked");
  try {
    fs.accessSync(absPath, fs.constants.W_OK);
    fs.accessSync(path.dirname(absPath), fs.constants.W_OK);
  } catch {
    problems.push("not-writable");
  }
  if (expectedChain) {
    let chain;
    try {
      chain = realpathChain(absPath);
    } catch {
      chain = [];
    }
    if (chain.length !== expectedChain.length || chain.some((p, i) => p !== expectedChain[i])) {
      problems.push("realpath-changed");
    }
  }
  return problems;
}

/** All *.css files below root, sorted; symlinks, dot folders and node_modules skipped. */
export function listCssFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".css")) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out.sort();
}

/** All regular files below root, sorted; symlinks, dot folders and node_modules skipped. */
export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out.sort();
}
