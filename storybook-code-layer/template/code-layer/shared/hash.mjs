// SHA-256 over UTF-8 text or bytes, identical in Node 24 and the browser
// (both expose globalThis.crypto.subtle; localhost is a secure context).

export async function sha256Hex(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  let hex = "";
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, "0");
  return `sha256:${hex}`;
}

/** Hash of the text Vite serves for a CSS module: UTF-8, BOM removed. */
export function servedTextHash(text) {
  return sha256Hex(text.startsWith("﻿") ? text.slice(1) : text);
}
