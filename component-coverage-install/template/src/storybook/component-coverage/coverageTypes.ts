import type { ComponentDocumentationProvenance } from "../componentCatalog";

/**
 * Single source of truth for the component-coverage file contract.
 * scripts/check-component-coverage-reports.mjs,
 * .agents/skills/component-coverage-analyze/SKILL.md,
 * .claude/skills/component-coverage-analyze/SKILL.md,
 * .agents/skills/component-coverage-implement/SKILL.md, and
 * .claude/skills/component-coverage-implement/SKILL.md mirror these shapes;
 * any change here must be synchronized with all of them.
 */

export const coverageRequestStatuses = ["pending", "analyzed"] as const;

export type CoverageRequestStatus = (typeof coverageRequestStatuses)[number];

export const coverageMatchFits = ["exact", "variant-needed", "partial"] as const;

export type CoverageMatchFit = (typeof coverageMatchFits)[number];

export const coverageGapStatuses = ["none", "extend", "missing"] as const;

export type CoverageGapStatus = (typeof coverageGapStatuses)[number];

/** Request id format: <YYYYMMDD-HHmmss>-<slug> */
export const coverageRequestIdPattern = /^\d{8}-\d{6}-[a-z0-9][a-z0-9-]*$/;

export type CoverageRequest = {
  id: string;
  createdAt: string;
  title: string;
  prdText: string;
  /** File names stored alongside request.json in the same request directory. */
  images: readonly string[];
  status: CoverageRequestStatus;
};

export type CoverageMatch = {
  componentId: string;
  /** Must equal the catalog-derived `Components/<category>/<name>` title. */
  storyTitle: string;
  fit: CoverageMatchFit;
  reason: string;
  provenance: ComponentDocumentationProvenance;
  componentPath: string;
};

export type CoverageGap =
  | { status: "none" }
  | {
      status: Exclude<CoverageGapStatus, "none">;
      suggestedName: string;
      suggestedCategory: string;
      suggestedRole: string;
      rationale: string;
    };

/**
 * Region of a source image (fractions of the natural size, 0..1) that shows
 * where this block sits in the uploaded UI. `image` is a file name inside
 * the originating request directory.
 */
export type CoverageEvidenceRegion = {
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const coverageReviewStatuses = ["draft", "confirmed"] as const;

/** Absent `reviewStatus` on a report is treated as `draft`. */
export type CoverageReviewStatus = (typeof coverageReviewStatuses)[number];

/**
 * Allowed review decisions are scoped by the block's coverage classification
 * (see classifyCoverageBlock): reviewing a missing block answers "build it or
 * not", an extend block answers "extend it or not", a reusable block only
 * carries an optional approval.
 */
export const coverageReviewDecisionsBySection = {
  missing: ["build-new", "use-existing", "skip"],
  extend: ["extend", "no-extend", "skip"],
  reusable: ["approve"],
} as const;

export type CoverageReviewDecision =
  (typeof coverageReviewDecisionsBySection)[keyof typeof coverageReviewDecisionsBySection][number];

/**
 * Developer review layered on top of the analyzer output. Review updates
 * never alter analyzer-produced fields. `use-existing` requires
 * `overrideComponentId` to name a catalog component.
 */
export type CoverageBlockReview = {
  decision: CoverageReviewDecision;
  note?: string;
  overrideComponentId?: string;
  reviewedAt: string;
};

export type CoverageBlock = {
  id: string;
  label: string;
  /** What in the source image or PRD text this block was identified from. */
  evidence: string;
  matches: readonly CoverageMatch[];
  gap: CoverageGap;
  evidenceRegion?: CoverageEvidenceRegion;
  review?: CoverageBlockReview;
};

export type CoverageSummary = {
  reusable: number;
  extend: number;
  missing: number;
};

export type CoverageAnalyzerInfo = {
  engine: string;
  catalogEntryCount: number;
};

export type CoverageReport = {
  id: string;
  requestId: string;
  createdAt: string;
  sourceSummary: string;
  blocks: readonly CoverageBlock[];
  summary: CoverageSummary;
  analyzer: CoverageAnalyzerInfo;
  reviewStatus?: CoverageReviewStatus;
};

export type CoverageSection = keyof CoverageSummary;

/**
 * Contract rule for both report summaries and the three report view sections:
 * gap status decides first; a gap-free block is reusable only when its best
 * match fit is `exact`, otherwise it still needs extension work.
 */
export function classifyCoverageBlock(block: CoverageBlock): CoverageSection {
  if (block.gap.status === "missing") {
    return "missing";
  }

  if (block.gap.status === "extend") {
    return "extend";
  }

  return block.matches.some((match) => match.fit === "exact")
    ? "reusable"
    : "extend";
}

export function getAllowedReviewDecisions(
  block: CoverageBlock,
): readonly CoverageReviewDecision[] {
  return coverageReviewDecisionsBySection[classifyCoverageBlock(block)];
}

/**
 * Shared confirmability rule for the report view and the dev middleware:
 * a report may hold reviewStatus `confirmed` only when every block classified
 * `extend` or `missing` carries a review decision (reusable blocks are
 * optional and never block confirmation).
 */
export function canConfirmCoverageReview(
  report: Pick<CoverageReport, "blocks">,
): boolean {
  return report.blocks.every(
    (block) =>
      classifyCoverageBlock(block) === "reusable" ||
      Boolean(block.review?.decision),
  );
}

export function deriveCoverageSummary(
  blocks: readonly CoverageBlock[],
): CoverageSummary {
  const summary: CoverageSummary = { reusable: 0, extend: 0, missing: 0 };

  for (const block of blocks) {
    summary[classifyCoverageBlock(block)] += 1;
  }

  return summary;
}
