// Reading CSS sources for indexing and patching.
// PostCSS is resolved through the project's Vite install (Vite depends on it),
// so the addon adds no dependency.
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const BOM = "﻿";
const BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);

export function loadPostcss(projectRoot) {
  const requireFromProject = createRequire(path.join(projectRoot, "package.json"));
  const vitePackage = requireFromProject.resolve("vite/package.json");
  return createRequire(vitePackage)("postcss");
}

export function diskHash(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

export function servedTextHashSync(text) {
  return `sha256:${crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`;
}

/**
 * Decode bytes as strict UTF-8. Succeeds only when re-encoding the decoded
 * text (with the BOM put back) reproduces the exact bytes, so byte-level
 * patching through string offsets is safe.
 */
export function decodeCss(bytes) {
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "invalid-utf8" };
  }
  const hasBom = decoded.startsWith(BOM);
  const text = hasBom ? decoded.slice(1) : decoded;
  const reencoded = Buffer.concat([hasBom ? BOM_BYTES : Buffer.alloc(0), Buffer.from(text, "utf8")]);
  if (!reencoded.equals(bytes)) return { ok: false, reason: "not-roundtrip" };
  return { ok: true, text, hasBom };
}

export function readCssSource(absPath) {
  const bytes = fs.readFileSync(absPath);
  const decoded = decodeCss(bytes);
  return {
    absPath,
    bytes,
    diskHash: diskHash(bytes),
    ok: decoded.ok,
    reason: decoded.ok ? null : decoded.reason,
    text: decoded.ok ? decoded.text : null,
    hasBom: decoded.ok ? decoded.hasBom : false,
    servedTextHash: decoded.ok ? servedTextHashSync(decoded.text) : null,
  };
}

export function encodeCss(text, hasBom) {
  return Buffer.concat([hasBom ? BOM_BYTES : Buffer.alloc(0), Buffer.from(text, "utf8")]);
}

/** Byte offset (in the encoded file) of a UTF-16 offset in the BOM-less text. */
export function byteOffset(text, offset, hasBom) {
  return (hasBom ? BOM_BYTES.length : 0) + Buffer.byteLength(text.slice(0, offset), "utf8");
}

/** Files whose served text Vite may transform; identity cannot be proven. */
export function servedTextMayDiffer(text) {
  return /@import\b|url\(|image-set\(/i.test(text);
}
