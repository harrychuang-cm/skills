import {
  componentCatalog,
  type ComponentCatalogId,
} from "../componentCatalog";
import {
  classifyCoverageBlock,
  type CoverageBlock,
  type CoverageCompositionBlock,
  type CoverageCompositionNode,
  type CoverageReport,
  type CoverageReviewDecision,
} from "./coverageTypes";

export type CompositionSlotState =
  | CoverageReviewDecision
  | "pending"
  | "reusable";

type CompositionSlotBase = {
  badgeLabel: string;
  blockId: string;
  skipped: boolean;
  state: CompositionSlotState;
};

export type CompositionComponentSlot = CompositionSlotBase & {
  kind: "component";
  componentId: string;
  componentName: string;
  storyTitle: string;
};

export type CompositionPlaceholderSlot = CompositionSlotBase & {
  kind: "placeholder";
  category: string;
  rationale: string;
  role: string;
  suggestedName: string;
};

export type CompositionUnavailableSlot = CompositionSlotBase & {
  kind: "unavailable";
  reason: string;
};

export type CompositionSlotResolution =
  | CompositionComponentSlot
  | CompositionPlaceholderSlot
  | CompositionUnavailableSlot;

const decisionBadgeCopy = {
  approve: "已確認可用",
  "build-new": "已決定新建",
  extend: "已決定擴充",
  "no-extend": "已決定沿用",
  skip: "不實作",
  "use-existing": "已改用現有",
} as const satisfies Record<CoverageReviewDecision, string>;

function slotState(block: CoverageBlock): CompositionSlotState {
  if (block.review?.decision) {
    return block.review.decision;
  }

  return classifyCoverageBlock(block) === "reusable" ? "reusable" : "pending";
}

function slotBadgeLabel(state: CompositionSlotState) {
  if (state === "pending") {
    return "待覆核";
  }

  if (state === "reusable") {
    return "可直接使用";
  }

  return decisionBadgeCopy[state];
}

function componentSlotFromCatalog(
  blockId: string,
  componentId: string,
  state: CompositionSlotState,
): CompositionComponentSlot | CompositionUnavailableSlot {
  const entry = componentCatalog[componentId as ComponentCatalogId];
  const base = {
    badgeLabel: slotBadgeLabel(state),
    blockId,
    skipped: state === "skip",
    state,
  };

  if (!entry) {
    return {
      ...base,
      kind: "unavailable",
      reason: `找不到元件目錄項目「${componentId}」`,
    };
  }

  return {
    ...base,
    kind: "component",
    componentId: entry.id,
    componentName: entry.name,
    storyTitle: entry.storyTitle,
  };
}

function gapPlaceholder(
  block: CoverageBlock,
  state: CompositionSlotState,
): CompositionPlaceholderSlot | CompositionUnavailableSlot {
  const base = {
    badgeLabel: slotBadgeLabel(state),
    blockId: block.id,
    skipped: state === "skip",
    state,
  };

  if (block.gap.status === "none") {
    return {
      ...base,
      kind: "unavailable",
      reason: "此區塊沒有可預覽 story，也沒有缺口說明。",
    };
  }

  return {
    ...base,
    category: block.gap.suggestedCategory,
    kind: "placeholder",
    rationale: block.gap.rationale,
    role: block.gap.suggestedRole,
    suggestedName: block.gap.suggestedName,
  };
}

/**
 * Applies developer review as an overlay without mutating analyzer output.
 * The composition node remains the source of layout and analyzer match choice.
 */
export function resolveCompositionSlot(
  block: CoverageBlock,
  node: CoverageCompositionBlock,
): CompositionSlotResolution {
  const state = slotState(block);
  const decision = block.review?.decision;

  if (decision === "use-existing") {
    if (!block.review?.overrideComponentId) {
      return {
        badgeLabel: slotBadgeLabel(state),
        blockId: block.id,
        kind: "unavailable",
        reason: "覆核指定改用現有元件，但沒有元件 id。",
        skipped: false,
        state,
      };
    }

    return componentSlotFromCatalog(
      block.id,
      block.review.overrideComponentId,
      state,
    );
  }

  if (
    decision === "build-new" ||
    classifyCoverageBlock(block) === "missing"
  ) {
    return gapPlaceholder(block, state);
  }

  const match = block.matches.find(
    (candidate) => candidate.componentId === node.matchComponentId,
  );

  if (!match) {
    return gapPlaceholder(block, state);
  }

  const entry = componentCatalog[match.componentId as ComponentCatalogId];

  return {
    badgeLabel: slotBadgeLabel(state),
    blockId: block.id,
    componentId: match.componentId,
    componentName: entry?.name ?? match.componentId,
    kind: "component",
    skipped: state === "skip",
    state,
    storyTitle: match.storyTitle,
  };
}

export function collectCompositionBlockIds(
  node: CoverageCompositionNode,
): readonly string[] {
  if (node.kind === "block") {
    return [node.blockId];
  }

  return node.children.flatMap(collectCompositionBlockIds);
}

export function getInitialCompositionBlockId(report: CoverageReport): string {
  if (!report.composition) {
    return "";
  }

  const orderedIds = collectCompositionBlockIds(report.composition.root);
  const blockById = new Map(report.blocks.map((block) => [block.id, block]));
  const firstUnreviewedDecision = orderedIds.find((blockId) => {
    const block = blockById.get(blockId);

    return (
      block !== undefined &&
      classifyCoverageBlock(block) !== "reusable" &&
      !block.review?.decision
    );
  });

  return firstUnreviewedDecision ?? orderedIds[0] ?? "";
}
