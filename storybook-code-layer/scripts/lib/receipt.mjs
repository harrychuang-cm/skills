// INSTALL_RECEIPT.json: what the installer put into a project, so a later
// update or removal can tell its own work from the project's.
//
// Version 2 records the wiring edits the installer actually made (as distinct
// from wiring it found in place). Version 1 (template 0.1.0) is still read: it
// does not say who added the import or the tsconfig entry, so those are
// treated as the project's.
import fs from "node:fs";
import path from "node:path";

export const RECEIPT_NAME = "INSTALL_RECEIPT.json";
export const RECEIPT_SCHEMA = 2;

/**
 * Read a receipt in either version, normalised to the version-2 shape plus
 * `sourceSchema`. Returns null when there is none; throws when it is not JSON
 * or of an unknown version.
 */
export function readReceipt(installDir) {
  const file = path.join(installDir, RECEIPT_NAME);
  if (!fs.existsSync(file)) return null;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${RECEIPT_NAME} is not valid JSON: ${error.message}`);
  }
  if (raw.schemaVersion === RECEIPT_SCHEMA) return { ...raw, sourceSchema: 2 };
  if (raw.schemaVersion === 1) {
    return {
      schemaVersion: RECEIPT_SCHEMA,
      sourceSchema: 1,
      name: raw.name,
      version: raw.version,
      manifestSha256: raw.manifestSha256 ?? null,
      files: raw.files ?? {},
      wiring: {
        // The 0.1.0 installer did not record what it added. The preset element
        // is Code Layer's in any case; the import and the tsconfig entry are
        // left to the project.
        main: { file: raw.wiring?.main?.file ?? null, addedElement: true, addedResolveImport: false },
        tsconfig: raw.wiring?.tsconfig === "excluded" ? "present" : raw.wiring?.tsconfig ?? "not-needed",
      },
      installedAt: raw.installedAt ?? null,
    };
  }
  throw new Error(`${RECEIPT_NAME} has schemaVersion ${raw.schemaVersion}, which this installer does not know`);
}

export function buildReceipt({ manifest, manifestSha256, files, wiring, installedAt }) {
  return { schemaVersion: RECEIPT_SCHEMA, name: manifest.name, version: manifest.version, manifestSha256, files, wiring, installedAt };
}

export function serializeReceipt(receipt) {
  const { sourceSchema: _ignored, ...rest } = receipt;
  return `${JSON.stringify(rest, null, 2)}\n`;
}

/** Same installation facts, whatever the timestamp. */
export function sameReceipt(a, b) {
  const strip = (r) => {
    if (!r) return null;
    const { installedAt: _at, sourceSchema: _schema, ...rest } = r;
    return JSON.stringify(rest);
  };
  return strip(a) === strip(b);
}

/** Compare dotted versions numerically: negative when a < b. */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
