// File helpers shared by the manifest builder and the installer.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TEMPLATE_ROOT = path.join(SKILL_ROOT, "template");
export const TEMPLATE_DIR = path.join(TEMPLATE_ROOT, "code-layer");
export const MANIFEST_FILE = path.join(TEMPLATE_ROOT, "TEMPLATE_MANIFEST.json");
/** Files in .storybook/code-layer/ that belong to the project, never to the template. */
export const PROJECT_OWNED = new Set(["code-layer.config.json", "INSTALL_RECEIPT.json"]);

export function sha256(bufferOrFile) {
  const data = Buffer.isBuffer(bufferOrFile) || typeof bufferOrFile !== "string" ? bufferOrFile : fs.readFileSync(bufferOrFile);
  return `sha256:${crypto.createHash("sha256").update(data).digest("hex")}`;
}

/** Regular files under root (sorted, POSIX separators); symlinks and .DS_Store skipped. */
export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store" || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out.sort();
}

/** Write via a temporary file in the same directory, then rename; keeps the target's mode. */
export function writeAtomic(target, data) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const mode = fs.existsSync(target) ? fs.statSync(target).mode & 0o777 : 0o644;
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.install-tmp`;
  const fd = fs.openSync(temp, "wx", mode);
  try {
    fs.writeSync(fd, data);
    fs.fchmodSync(fd, mode);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, target);
}
