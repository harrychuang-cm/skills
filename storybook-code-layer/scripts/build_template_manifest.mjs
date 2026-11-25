#!/usr/bin/env node
// Build template/TEMPLATE_MANIFEST.json: version and sha256 of every file the
// installer copies into <project>/.storybook/code-layer/. Deterministic (no
// timestamps), so rebuilding an unchanged template gives identical bytes.
//
//   node scripts/build_template_manifest.mjs                    write the manifest
//   node scripts/build_template_manifest.mjs --check            exit 1 if it is stale
//   node scripts/build_template_manifest.mjs --record-release   also record this version's file hashes in
//                                                               KNOWN_MANIFESTS.json (do this when a version is released,
//                                                               so a later --update can tell its files from a person's edits)
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { MANIFEST_FILE, PROJECT_OWNED, TEMPLATE_DIR, TEMPLATE_ROOT, listFiles, sha256 } from "./lib/files.mjs";

const KNOWN_FILE = path.join(TEMPLATE_ROOT, "KNOWN_MANIFESTS.json");

/** Add (or replace) the current version in the list of released versions. Returns true when the file changed. */
export function recordRelease(manifest) {
  const known = JSON.parse(fs.readFileSync(KNOWN_FILE, "utf8"));
  const entry = { version: manifest.version, files: Object.fromEntries(manifest.files.map((file) => [file.path, file.sha256])) };
  const versions = known.versions.filter((v) => v.version !== manifest.version).concat([entry]);
  const text = `${JSON.stringify({ ...known, versions }, null, 2)}\n`;
  if (text === fs.readFileSync(KNOWN_FILE, "utf8")) return false;
  fs.writeFileSync(KNOWN_FILE, text);
  return true;
}

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
  } else {
    if (existing === text) process.stdout.write("TEMPLATE_MANIFEST.json unchanged.\n");
    else {
      fs.writeFileSync(MANIFEST_FILE, text);
      process.stdout.write(`Wrote TEMPLATE_MANIFEST.json (${JSON.parse(text).files.length} files).\n`);
    }
    if (process.argv.includes("--record-release")) {
      const manifest = JSON.parse(text);
      process.stdout.write(recordRelease(manifest) ? `Recorded ${manifest.version} in KNOWN_MANIFESTS.json.\n` : `KNOWN_MANIFESTS.json already has ${manifest.version}.\n`);
    }
  }
}
