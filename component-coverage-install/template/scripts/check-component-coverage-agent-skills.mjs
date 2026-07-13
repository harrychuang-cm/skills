import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const manifestCandidates = [
  "outputs/component-coverage/TEMPLATE_MANIFEST.json",
  "TEMPLATE_MANIFEST.json",
];
const manifestPath = manifestCandidates.find((candidate) => existsSync(candidate));

if (!manifestPath) {
  console.error(
    `Component coverage agent skill check failed:\n- Missing template manifest. Expected one of: ${manifestCandidates.join(", ")}.`,
  );
  process.exit(1);
}

let manifest;

try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(
    `Component coverage agent skill check failed:\n- Could not parse ${manifestPath}: ${error instanceof Error ? error.message : String(error)}.`,
  );
  process.exit(1);
}

const installTargets = manifest.installTargets;
const expectedHashes = manifest.skillContentSha256;
const issues = [];
let checkedCopies = 0;

function sha256(contents) {
  const normalizedContents = contents.toString("utf8").replace(/\r\n/g, "\n");

  return createHash("sha256").update(normalizedContents).digest("hex");
}

if (
  !installTargets ||
  typeof installTargets !== "object" ||
  Array.isArray(installTargets)
) {
  issues.push(`${manifestPath}: installTargets must be an object.`);
}

if (
  !expectedHashes ||
  typeof expectedHashes !== "object" ||
  Array.isArray(expectedHashes)
) {
  issues.push(`${manifestPath}: skillContentSha256 must be an object.`);
}

if (issues.length === 0) {
  for (const [source, targets] of Object.entries(installTargets)) {
    const expectedHash = expectedHashes[source];

    if (!Array.isArray(targets) || targets.length === 0) {
      issues.push(`${source}: installTargets must declare at least one target.`);
      continue;
    }

    if (new Set(targets).size !== targets.length) {
      issues.push(`${source}: installTargets contains duplicate target paths.`);
    }

    if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      issues.push(`${source}: missing or invalid skillContentSha256 value.`);
      continue;
    }

    if (existsSync(source)) {
      const sourceHash = sha256(readFileSync(source));

      if (sourceHash !== expectedHash) {
        issues.push(
          `${source}: template source hash ${sourceHash} does not match manifest ${expectedHash}.`,
        );
      }
    }

    let canonicalContents = null;
    let canonicalPath = null;

    for (const target of targets) {
      if (typeof target !== "string" || target.length === 0) {
        issues.push(`${source}: installTargets contains an invalid target path.`);
        continue;
      }

      if (!existsSync(target)) {
        issues.push(`${source}: missing installed copy ${target}.`);
        continue;
      }

      const contents = readFileSync(target);
      const actualHash = sha256(contents);
      checkedCopies += 1;

      if (actualHash !== expectedHash) {
        issues.push(
          `${target}: normalized content hash ${actualHash} does not match manifest ${expectedHash}.`,
        );
      }

      if (canonicalContents && !canonicalContents.equals(contents)) {
        issues.push(`${target}: content drifted from ${canonicalPath}.`);
      } else if (!canonicalContents) {
        canonicalContents = contents;
        canonicalPath = target;
      }
    }
  }

  for (const source of Object.keys(expectedHashes)) {
    if (!(source in installTargets)) {
      issues.push(`${source}: skillContentSha256 has no installTargets entry.`);
    }
  }
}

if (issues.length > 0) {
  console.error("Component coverage agent skill check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  `Component coverage agent skill check passed: ${Object.keys(installTargets).length} skills and ${checkedCopies} installed copies match ${manifestPath}.`,
);
