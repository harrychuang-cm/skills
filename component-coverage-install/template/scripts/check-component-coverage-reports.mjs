import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Contract source of truth: src/storybook/component-coverage/coverageTypes.ts
// (this script mirrors it for Node without a TS build step).
const reportsDir = "outputs/component-coverage/reports";
const catalogPath = "src/storybook/componentCatalog.ts";
const matchFits = new Set(["exact", "variant-needed", "partial"]);
const gapStatuses = new Set(["none", "extend", "missing"]);
const provenances = new Set(["extracted", "implementation-derived"]);
const gapSuggestionFields = [
  "suggestedName",
  "suggestedCategory",
  "suggestedRole",
  "rationale",
];
const reviewStatuses = new Set(["draft", "confirmed"]);
const reviewDecisionsBySection = {
  missing: new Set(["build-new", "use-existing", "skip"]),
  extend: new Set(["extend", "no-extend", "skip"]),
  reusable: new Set(["approve"]),
};

if (!existsSync(catalogPath)) {
  console.error(`Component coverage report check failed: missing ${catalogPath}.`);
  process.exit(1);
}

// Every catalog entry carries an explicit storyTitle (parsing contract in the
// catalog header: id first, single-line string fields).
const catalogSource = readFileSync(catalogPath, "utf8");
const entryPattern =
  /\{\s*\n\s+id: "([^"]+)",[\s\S]*?\n\s+storyTitle: "([^"]+)"/g;
const storyTitleById = new Map();

for (const match of catalogSource.matchAll(entryPattern)) {
  const [, id, storyTitle] = match;
  storyTitleById.set(id, storyTitle);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function classifyBlock(block) {
  if (block.gap.status === "missing") {
    return "missing";
  }

  if (block.gap.status === "extend") {
    return "extend";
  }

  return block.matches.some((blockMatch) => blockMatch.fit === "exact")
    ? "reusable"
    : "extend";
}

function validateReport(report, addIssue) {
  for (const field of ["id", "requestId", "createdAt", "sourceSummary"]) {
    if (!isNonEmptyString(report[field])) {
      addIssue(`missing or empty top-level field "${field}".`);
    }
  }

  if (
    typeof report.analyzer !== "object" ||
    report.analyzer === null ||
    !isNonEmptyString(report.analyzer.engine) ||
    typeof report.analyzer.catalogEntryCount !== "number"
  ) {
    addIssue('invalid "analyzer": expected { engine, catalogEntryCount }.');
  }

  if (!Array.isArray(report.blocks)) {
    addIssue('missing "blocks" array.');
    return;
  }

  report.blocks.forEach((block, blockIndex) => {
    const blockRef = `blocks[${blockIndex}]`;

    for (const field of ["id", "label", "evidence"]) {
      if (!isNonEmptyString(block[field])) {
        addIssue(`${blockRef}: missing or empty field "${field}".`);
      }
    }

    if (!Array.isArray(block.matches)) {
      addIssue(`${blockRef}: missing "matches" array.`);
    } else {
      block.matches.forEach((blockMatch, matchIndex) => {
        const matchRef = `${blockRef}.matches[${matchIndex}]`;

        for (const field of ["componentId", "storyTitle", "reason", "componentPath"]) {
          if (!isNonEmptyString(blockMatch[field])) {
            addIssue(`${matchRef}: missing or empty field "${field}".`);
          }
        }

        if (!matchFits.has(blockMatch.fit)) {
          addIssue(`${matchRef}: invalid fit value "${blockMatch.fit}".`);
        }

        if (!provenances.has(blockMatch.provenance)) {
          addIssue(`${matchRef}: invalid provenance value "${blockMatch.provenance}".`);
        }

        if (!isNonEmptyString(blockMatch.componentId)) {
          return;
        }

        const expectedTitle = storyTitleById.get(blockMatch.componentId);

        if (!expectedTitle) {
          addIssue(`${matchRef}: unknown componentId "${blockMatch.componentId}" (not in ${catalogPath}).`);
        } else if (blockMatch.storyTitle !== expectedTitle) {
          addIssue(
            `${matchRef}: storyTitle is "${blockMatch.storyTitle}"; expected "${expectedTitle}".`,
          );
        }
      });
    }

    if (typeof block.gap !== "object" || block.gap === null) {
      addIssue(`${blockRef}: missing "gap" object.`);
    } else if (!gapStatuses.has(block.gap.status)) {
      addIssue(`${blockRef}.gap: invalid status value "${block.gap.status}".`);
    } else if (block.gap.status !== "none") {
      for (const field of gapSuggestionFields) {
        if (!isNonEmptyString(block.gap[field])) {
          addIssue(
            `${blockRef}.gap: status "${block.gap.status}" requires non-empty "${field}".`,
          );
        }
      }
    }

    if (block.evidenceRegion !== undefined) {
      const regionRef = `${blockRef}.evidenceRegion`;
      const region = block.evidenceRegion;

      if (typeof region !== "object" || region === null) {
        addIssue(`${regionRef}: must be an object.`);
      } else {
        if (!isNonEmptyString(region.image)) {
          addIssue(`${regionRef}: empty region image.`);
        }

        const coords = ["x", "y", "width", "height"];
        const numbersValid = coords.every(
          (field) =>
            typeof region[field] === "number" &&
            region[field] >= 0 &&
            region[field] <= 1,
        );

        if (!numbersValid) {
          addIssue(`${regionRef}: x/y/width/height must be fractions between 0 and 1.`);
        } else {
          if (region.width <= 0 || region.height <= 0) {
            addIssue(`${regionRef}: width and height must be greater than 0.`);
          }

          if (region.x + region.width > 1.01 || region.y + region.height > 1.01) {
            addIssue(`${regionRef}: region out of range (x+width or y+height exceeds 1).`);
          }
        }
      }
    }

    if (block.review !== undefined) {
      const reviewRef = `${blockRef}.review`;
      const review = block.review;

      if (typeof review !== "object" || review === null) {
        addIssue(`${reviewRef}: must be an object.`);
      } else {
        const blockIsClassifiable =
          typeof block.gap === "object" &&
          block.gap !== null &&
          gapStatuses.has(block.gap.status) &&
          Array.isArray(block.matches);

        if (blockIsClassifiable) {
          const section = classifyBlock(block);
          const allowedDecisions = reviewDecisionsBySection[section];

          if (!allowedDecisions.has(review.decision)) {
            addIssue(
              `${reviewRef}: disallowed decision "${review.decision}" for ${section} block (allowed: ${[...allowedDecisions].join(", ")}).`,
            );
          }
        }

        if (review.decision === "use-existing") {
          if (!isNonEmptyString(review.overrideComponentId)) {
            addIssue(
              `${reviewRef}: decision "use-existing" requires non-empty "overrideComponentId".`,
            );
          } else if (!storyTitleById.has(review.overrideComponentId)) {
            addIssue(
              `${reviewRef}: unknown overrideComponentId "${review.overrideComponentId}" (not in ${catalogPath}).`,
            );
          }
        }

        if (!isNonEmptyString(review.reviewedAt)) {
          addIssue(`${reviewRef}: missing or empty "reviewedAt".`);
        }
      }
    }
  });

  const blocksAreClassifiable = report.blocks.every(
    (block) =>
      typeof block.gap === "object" &&
      block.gap !== null &&
      gapStatuses.has(block.gap.status) &&
      Array.isArray(block.matches),
  );

  if (
    typeof report.summary !== "object" ||
    report.summary === null ||
    ["reusable", "extend", "missing"].some(
      (field) => typeof report.summary[field] !== "number",
    )
  ) {
    addIssue('invalid "summary": expected { reusable, extend, missing } counts.');
  } else if (blocksAreClassifiable) {
    const derived = { reusable: 0, extend: 0, missing: 0 };

    for (const block of report.blocks) {
      derived[classifyBlock(block)] += 1;
    }

    for (const field of ["reusable", "extend", "missing"]) {
      if (report.summary[field] !== derived[field]) {
        addIssue(
          `summary.${field} is ${report.summary[field]}; expected ${derived[field]} derived from blocks.`,
        );
      }
    }
  }

  if (report.reviewStatus !== undefined) {
    if (!reviewStatuses.has(report.reviewStatus)) {
      addIssue(
        `invalid reviewStatus value "${report.reviewStatus}" (expected draft or confirmed).`,
      );
    } else if (report.reviewStatus === "confirmed" && blocksAreClassifiable) {
      report.blocks.forEach((block, blockIndex) => {
        const section = classifyBlock(block);

        if (
          (section === "extend" || section === "missing") &&
          !(
            typeof block.review === "object" &&
            block.review !== null &&
            isNonEmptyString(block.review.decision)
          )
        ) {
          addIssue(
            `blocks[${blockIndex}]: incomplete review for confirmation ("${section}" block has no review decision).`,
          );
        }
      });
    }
  }
}

const issues = [];

// A fresh install has no reports yet — that is a passing state.
if (!existsSync(reportsDir)) {
  console.log(`Component coverage report check passed (no ${reportsDir} yet).`);
  process.exit(0);
}

const reportFiles = readdirSync(reportsDir)
  .filter((file) => file.endsWith(".json") && file !== "index.json")
  .sort();

for (const file of reportFiles) {
  const filePath = join(reportsDir, file);
  const addIssue = (message) => issues.push(`${filePath}: ${message}`);
  let report;

  try {
    report = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    addIssue(`invalid JSON (${error.message}).`);
    continue;
  }

  validateReport(report, addIssue);
}

if (issues.length > 0) {
  console.error("Component coverage report check failed:");
  for (const issue of issues) {
    console.error(`  - ${issue}`);
  }
  process.exit(1);
}

console.log(
  `Component coverage report check passed (${reportFiles.length} report${reportFiles.length === 1 ? "" : "s"}).`,
);
