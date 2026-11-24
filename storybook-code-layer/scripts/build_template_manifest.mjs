#!/usr/bin/env node
// Build template/TEMPLATE_MANIFEST.json: version and sha256 of every file the
// installer copies into <project>/.storybook/code-layer/. Deterministic (no
// timestamps), so rebuilding an unchanged template gives identical bytes.
//
//   node scripts/build_template_manifest.mjs           write the manifest
//   node scripts/build_template_manifest.mjs --check   exit 1 if it is stale
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { MANIFEST_FILE, PROJECT_OWNED, TEMPLATE_DIR, listFiles, sha256 } from "./lib/files.mjs";

export function buildManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, "package.json"), "utf8"));
  const files = listFiles(TEMPLATE_DIR).filter((rel) => !PROJECT_OWNED.has(rel));
  return {
    schemaVersion: 1,
    name: "storybook-code-layer",
    version: pkg.version,
    installDir: ".storybook/code-layer",
    projectOwned: [...PROJECT_OWNED].sort(),
    files: files.map((rel) => {
      const full = path.join(TEMPLATE_DIR, rel);
      return { path: rel, sha256: sha256(full), bytes: fs.statSync(full).size };
    }),
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** The manifest on disk, or null when it is missing or does not match the template. */
export function currentManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) return null;
  const onDisk = fs.readFileSync(MANIFEST_FILE, "utf8");
  return onDisk === serializeManifest(buildManifest()) ? JSON.parse(onDisk) : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = serializeManifest(buildManifest());
  const existing = fs.existsSync(MANIFEST_FILE) ? fs.readFileSync(MANIFEST_FILE, "utf8") : null;
  if (process.argv.includes("--check")) {
    if (existing === text) {
      process.stdout.write(`TEMPLATE_MANIFEST.json is current (${JSON.parse(text).files.length} files).\n`);
    } else {
      process.stderr.write("TEMPLATE_MANIFEST.json is missing or stale; run scripts/build_template_manifest.mjs.\n");
      process.exit(1);
    }
  } else if (existing === text) {
    process.stdout.write("TEMPLATE_MANIFEST.json unchanged.\n");
  } else {
    fs.writeFileSync(MANIFEST_FILE, text);
    process.stdout.write(`Wrote TEMPLATE_MANIFEST.json (${JSON.parse(text).files.length} files).\n`);
  }
}
