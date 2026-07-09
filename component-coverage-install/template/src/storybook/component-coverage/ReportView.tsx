import { useEffect, useMemo, useRef, useState } from "react";

import {
  componentCatalog,
  componentCatalogEntries,
  type ComponentCatalogId,
} from "../componentCatalog";
import {
  componentCoverageStaticBase,
  type CoverageReviewSubmitPayload,
} from "./coverageApi";
import {
  canConfirmCoverageReview,
  classifyCoverageBlock,
  getAllowedReviewDecisions,
  type CoverageBlock,
  type CoverageBlockReview,
  type CoverageEvidenceRegion,
  type CoverageMatch,
  type CoverageReport,
  type CoverageRequest,
  type CoverageReviewDecision,
  type CoverageSection,
  type CoverageSummary,
} from "./coverageTypes";

const sectionOrder = ["reusable", "extend", "missing"] as const;

const sectionCopy = {
  reusable: { heading: "可直接使用", hint: "無需決策" },
  extend: { heading: "需擴充 variant", hint: "請決定：擴充／不擴充／不實作" },
  missing: { heading: "缺少需新建", hint: "請決定：新建／改用現有／不實作" },
} as const satisfies Record<CoverageSection, { heading: string; hint: string }>;

const fitCopy = {
  exact: "完全符合",
  "variant-needed": "需新增 variant",
  partial: "部分符合",
} as const satisfies Record<CoverageMatch["fit"], string>;

const provenanceCopy = {
  extracted: "Figma 擷取",
  "implementation-derived": "實作推導",
} as const satisfies Record<CoverageMatch["provenance"], string>;

const reviewDecisionCopy = {
  approve: "確認可用",
  "build-new": "同意新建",
  extend: "同意擴充",
  "no-extend": "不需擴充",
  skip: "不實作",
  "use-existing": "改用現有元件",
} as const satisfies Record<CoverageReviewDecision, string>;

const copiedResetDelayMs = 2000;

export function analyzeCommandFor(requestId: string) {
  return `/component-coverage-analyze ${requestId}`;
}

/**
 * One row of the unified request/report pipeline list. Valid requests join
 * their report by requestId; reports without a matching request (the normal
 * case in read-only mode) become orphan rows; invalid files become error rows.
 */
export type PipelineRow =
  | {
      kind: "request";
      key: string;
      request: CoverageRequest;
      report?: CoverageReport;
      reportFileName?: string;
    }
  | { kind: "orphan-report"; key: string; fileName: string; report: CoverageReport }
  | { kind: "invalid-request"; key: string; id: string; error: string }
  | { kind: "invalid-report"; key: string; fileName: string; error: string };

type PipelineStage = "pending" | "report-missing" | "in-review" | "confirmed";

const stageCopy = {
  pending: "待分析",
  "report-missing": "找不到報告",
  "in-review": "待覆核",
  confirmed: "覆核完成",
} as const satisfies Record<PipelineStage, string>;

/** Single derivation point for the stage chip (see spec stage table). */
function derivePipelineStage(
  report: CoverageReport | undefined,
  requestStatus: CoverageRequest["status"] | undefined,
): PipelineStage {
  if (!report) {
    return requestStatus === "pending" ? "pending" : "report-missing";
  }

  return isReportConfirmed(report) ? "confirmed" : "in-review";
}

function collectReviews(
  report: CoverageReport,
): Record<string, CoverageBlockReview> {
  const reviews: Record<string, CoverageBlockReview> = {};

  for (const block of report.blocks) {
    if (block.review) {
      reviews[block.id] = block.review;
    }
  }

  return reviews;
}

function isReportConfirmed(report: CoverageReport) {
  return (report.reviewStatus ?? "draft") === "confirmed";
}

function primaryMatch(block: CoverageBlock) {
  return (
    block.matches.find((match) => match.fit === "variant-needed") ??
    block.matches[0]
  );
}

/**
 * Self-contained implementation prompt assembled from report data only, so it
 * stays portable to any agent and does not depend on this project's modules.
 */
function buildImplementationPrompt(report: CoverageReport): string {
  const reuse: string[] = [];
  const extend: string[] = [];
  const build: string[] = [];
  const skipped: string[] = [];

  for (const block of report.blocks) {
    const section = classifyCoverageBlock(block);
    const review = block.review;
    const note = review?.note ? `；覆核備註：${review.note}` : "";
    const match = primaryMatch(block);
    const matchRef = match
      ? `\`${match.componentId}\`（${match.componentPath}，story：${match.storyTitle}）`
      : "";

    if (review?.decision === "skip") {
      skipped.push(`- ${block.label}${note}`);
    } else if (review?.decision === "use-existing" && review.overrideComponentId) {
      reuse.push(
        `- ${block.label}：改用現有元件 \`${review.overrideComponentId}\`（開發者覆核指定，取代原「缺少需新建」判定）${note}`,
      );
    } else if (review?.decision === "no-extend") {
      reuse.push(
        `- ${block.label}：直接使用 ${matchRef}，開發者覆核判定不需擴充${note}`,
      );
    } else if (section === "reusable") {
      reuse.push(`- ${block.label}：直接使用 ${matchRef}${note}`);
    } else if (section === "extend") {
      const rationale =
        block.gap.status !== "none" ? block.gap.rationale : (match?.reason ?? "");

      extend.push(
        `- ${block.label}：為 ${matchRef} 新增 variant。分析理由：${rationale}${note}`,
      );
    } else if (block.gap.status === "missing") {
      build.push(
        `- ${block.label}：新建元件 \`${block.gap.suggestedName}\`（分類 ${block.gap.suggestedCategory}／角色 ${block.gap.suggestedRole}）。理由：${block.gap.rationale}${note}`,
      );
    }
  }

  const lines = [
    `為請求 ${report.requestId} 實作 UI。以下需求來自 Component Coverage 報告（outputs/component-coverage/reports/${report.requestId}.json）與開發者覆核結論；來源圖片與 PRD 位於 outputs/component-coverage/requests/${report.requestId}/。`,
    "",
    "## 來源摘要",
    report.sourceSummary,
    "",
  ];

  if (reuse.length > 0) {
    lines.push("## 直接使用現有元件", ...reuse, "");
  }

  if (extend.length > 0) {
    lines.push("## 擴充既有元件（新增 variant 與 stories）", ...extend, "");
  }

  if (build.length > 0) {
    lines.push("## 新建元件（含元件目錄登錄與 stories）", ...build, "");
  }

  if (skipped.length > 0) {
    lines.push("## 排除項目（覆核決定不實作）", ...skipped, "");
  }

  lines.push(
    "## 實作順序與守則",
    "1. 先完成元件層工作（擴充 variant、新建元件），每個元件都要有 stories，並遵循 design token 治理：優先重用既有元件與 tokens，不寫一次性樣式。",
    "2. 元件層完成後，再依來源圖片與報告區塊組合界面。",
    "3. 完成後執行專案檢查並確認全數通過。",
  );

  return lines.join("\n");
}

export function CopyTextButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const clipboardAvailable =
    typeof navigator !== "undefined" && !!navigator.clipboard?.writeText;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), copiedResetDelayMs);
    } catch {
      setFallbackOpen(true);
    }
  };

  if (!clipboardAvailable || fallbackOpen) {
    return (
      <div className="cm-coverage__copy-fallback">
        <span className="cm-coverage__copy-fallback-label">
          {label}（請手動選取複製）
        </span>
        <textarea
          className="cm-coverage__copy-fallback-text"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          rows={Math.min(8, text.split("\n").length)}
          value={text}
        />
      </div>
    );
  }

  return (
    <button
      className="cm-coverage__copy-button"
      onClick={() => void handleCopy()}
      type="button"
    >
      {copied ? "已複製 ✓" : label}
    </button>
  );
}

export function formatTimestamp(value: string) {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function storyDocsPath(storyTitle: string) {
  const slug = storyTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `/docs/${slug}--docs`;
}

function openStoryDocs(storyTitle: string) {
  const search = `?path=${storyDocsPath(storyTitle)}`;

  try {
    const managerWindow = window.top;

    if (managerWindow && managerWindow !== window) {
      managerWindow.location.href = `${managerWindow.location.pathname}${search}`;
      return;
    }
  } catch {
    // Cross-origin manager — fall back to navigating this frame.
  }

  window.location.href = search;
}

function matchDisplayName(match: CoverageMatch) {
  return componentCatalog[match.componentId as ComponentCatalogId]?.name ?? match.componentId;
}

function CoverageBar({ summary }: { summary: CoverageSummary }) {
  const total = summary.reusable + summary.extend + summary.missing;

  if (total === 0) {
    return null;
  }

  const segments = [
    { count: summary.reusable, key: "reusable", label: "可用" },
    { count: summary.extend, key: "extend", label: "需擴充" },
    { count: summary.missing, key: "missing", label: "缺少" },
  ] as const;
  const reusablePercent = Math.round((summary.reusable / total) * 100);

  return (
    <div className="cm-coverage__bar-wrap">
      <div
        aria-label={`覆蓋度：可用 ${summary.reusable}、需擴充 ${summary.extend}、缺少 ${summary.missing}`}
        className="cm-coverage__bar"
        role="img"
      >
        {segments.map((segment) =>
          segment.count > 0 ? (
            <span
              className={`cm-coverage__bar-segment cm-coverage__bar-segment--${segment.key}`}
              key={segment.key}
              style={{ flexGrow: segment.count }}
            />
          ) : null,
        )}
      </div>
      <span className="cm-coverage__bar-legend">
        {segments.map((segment) => `${segment.label} ${segment.count}`).join("・")}
        ・可用率 {reusablePercent}%
      </span>
    </div>
  );
}

function SummaryStats({
  onNavigate,
  summary,
}: {
  onNavigate: (section: CoverageSection) => void;
  summary: CoverageSummary;
}) {
  const total = summary.reusable + summary.extend + summary.missing;

  if (total === 0) {
    return null;
  }

  const reusablePercent = Math.round((summary.reusable / total) * 100);
  const tiles = [
    { key: "reusable", label: "可直接使用", value: summary.reusable },
    { key: "extend", label: "需擴充", value: summary.extend },
    { key: "missing", label: "缺少", value: summary.missing },
  ] as const;

  return (
    <div className="cm-coverage__stats">
      {tiles.map((tile) => (
        <button
          aria-label={`跳至「${sectionCopy[tile.key].heading}」`}
          className="cm-coverage__stat cm-coverage__stat--link"
          key={tile.key}
          onClick={() => onNavigate(tile.key)}
          type="button"
        >
          <span
            className={`cm-coverage__stat-value cm-coverage__stat-value--${tile.key}`}
          >
            {tile.value}
          </span>
          <span className="cm-coverage__stat-label">{tile.label}</span>
        </button>
      ))}
      <div className="cm-coverage__stat">
        <span className="cm-coverage__stat-value">{reusablePercent}%</span>
        <span className="cm-coverage__stat-label">可用率</span>
      </div>
    </div>
  );
}

type PreviewControl = {
  expandedPreview: string;
  onTogglePreview: (previewKey: string) => void;
  storyIndex: ReadonlyMap<string, string>;
};

function MatchCard({
  match,
  preview,
  previewKey,
}: {
  match: CoverageMatch;
  preview: PreviewControl;
  previewKey: string;
}) {
  const storyId = preview.storyIndex.get(match.storyTitle);
  const expanded = preview.expandedPreview === previewKey;

  return (
    <div className="cm-coverage__match">
      <div className="cm-coverage__match-header">
        <span className="cm-coverage__match-name">{matchDisplayName(match)}</span>
        <span className={`cm-coverage__chip cm-coverage__chip--fit-${match.fit}`}>
          {fitCopy[match.fit]}
        </span>
        <span className="cm-coverage__chip cm-coverage__chip--provenance">
          {provenanceCopy[match.provenance]}
        </span>
        {storyId ? (
          <button
            aria-expanded={expanded}
            className="cm-coverage__preview-toggle"
            onClick={() => preview.onTogglePreview(previewKey)}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="14"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
              width="14"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {expanded ? "收合預覽" : "預覽元件"}
          </button>
        ) : null}
      </div>
      <p className="cm-coverage__match-reason">{match.reason}</p>
      {storyId && expanded ? (
        <iframe
          className="cm-coverage__preview-frame"
          loading="lazy"
          src={`iframe.html?id=${storyId}&viewMode=story`}
          title={`${matchDisplayName(match)} story 預覽`}
        />
      ) : null}
      <div className="cm-coverage__match-footer">
        <code className="cm-coverage__code">{match.componentPath}</code>
        <a
          className="cm-coverage__story-link"
          href={`?path=${storyDocsPath(match.storyTitle)}`}
          onClick={(event) => {
            event.preventDefault();
            openStoryDocs(match.storyTitle);
          }}
          target="_top"
        >
          開啟 {match.storyTitle}
        </a>
      </div>
    </div>
  );
}

function BlockReviewPanel({
  block,
  editable,
  onSave,
}: {
  block: CoverageBlock;
  editable: boolean;
  onSave: (blockId: string, review: CoverageBlockReview) => Promise<void>;
}) {
  const allowedDecisions = getAllowedReviewDecisions(block);
  const review = block.review;
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<CoverageReviewDecision | "">(
    review?.decision ?? "",
  );
  const [note, setNote] = useState(review?.note ?? "");
  const [overrideId, setOverrideId] = useState(review?.overrideComponentId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!editable && !review) {
    return null;
  }

  const showForm = editable && (editing || !review);
  const canSave =
    decision !== "" && (decision !== "use-existing" || overrideId !== "");

  const handleSave = async () => {
    if (decision === "" || (decision === "use-existing" && overrideId === "")) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave(block.id, {
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(decision === "use-existing" ? { overrideComponentId: overrideId } : {}),
        reviewedAt: new Date().toISOString(),
      });
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cm-coverage__review" data-reviewed={review ? "true" : "false"}>
      <span className="cm-coverage__review-title">開發者覆核</span>
      {review && !showForm ? (
        <div className="cm-coverage__review-summary">
          <span
            className={`cm-coverage__chip cm-coverage__chip--review-${review.decision}`}
          >
            {reviewDecisionCopy[review.decision]}
          </span>
          {review.decision === "use-existing" && review.overrideComponentId ? (
            <code className="cm-coverage__code">{review.overrideComponentId}</code>
          ) : null}
          {review.note ? (
            <span className="cm-coverage__review-note">{review.note}</span>
          ) : null}
          <span className="cm-coverage__review-meta">
            {formatTimestamp(review.reviewedAt)}
          </span>
          {editable ? (
            <button
              className="cm-coverage__review-edit"
              onClick={() => setEditing(true)}
              type="button"
            >
              編輯
            </button>
          ) : null}
        </div>
      ) : null}
      {showForm ? (
        <div className="cm-coverage__review-form">
          <div
            aria-label={`${block.label} 覆核決策`}
            className="cm-coverage__review-options"
            role="group"
          >
            {allowedDecisions.map((option) => (
              <button
                aria-pressed={decision === option}
                className={`cm-coverage__review-option${
                  decision === option ? " cm-coverage__review-option--active" : ""
                }`}
                key={option}
                onClick={() => setDecision(option)}
                type="button"
              >
                {reviewDecisionCopy[option]}
              </button>
            ))}
          </div>
          {decision === "use-existing" ? (
            <select
              aria-label="選擇現有元件"
              className="cm-coverage__review-select"
              onChange={(event) => setOverrideId(event.target.value)}
              value={overrideId}
            >
              <option value="">選擇現有元件…</option>
              {componentCatalogEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}（{entry.id}）
                </option>
              ))}
            </select>
          ) : null}
          <input
            aria-label="覆核備註"
            className="cm-coverage__review-input"
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            placeholder="備註（選填）"
            type="text"
            value={note}
          />
          <div className="cm-coverage__review-actions">
            <button
              className="cm-coverage__review-save"
              disabled={!canSave || saving}
              onClick={() => void handleSave()}
              type="button"
            >
              {saving ? "儲存中…" : "儲存覆核"}
            </button>
            {review ? (
              <button
                className="cm-coverage__review-cancel"
                onClick={() => {
                  setEditing(false);
                  setDecision(review.decision);
                  setNote(review.note ?? "");
                  setOverrideId(review.overrideComponentId ?? "");
                }}
                type="button"
              >
                取消
              </button>
            ) : null}
          </div>
          {error ? <span className="cm-coverage__review-error">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function ReviewProgress({
  editable,
  onSubmit,
  report,
}: {
  editable: boolean;
  onSubmit: (payload: CoverageReviewSubmitPayload) => Promise<void>;
  report: CoverageReport;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmed = isReportConfirmed(report);
  const confirmable = canConfirmCoverageReview(report);
  const decisionBlocks = report.blocks.filter(
    (block) => classifyCoverageBlock(block) !== "reusable",
  );
  const reviewedCount = decisionBlocks.filter(
    (block) => block.review?.decision,
  ).length;
  const totalCount = decisionBlocks.length;
  const remainingCount = totalCount - reviewedCount;

  const submit = async (reviewStatus: "draft" | "confirmed") => {
    setBusy(true);
    setError("");

    try {
      await onSubmit({ reviews: collectReviews(report), reviewStatus });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : String(submitError),
      );
    } finally {
      setBusy(false);
    }
  };

  const draftHint =
    totalCount === 0
      ? "沒有需要覆核的區塊，可直接確認。"
      : remainingCount > 0
        ? `尚有 ${remainingCount} 個區塊待覆核（標有「待覆核」徽章）。`
        : "全部覆核完成，確認後即可交接實作。";

  return (
    <div
      className="cm-coverage__gate"
      data-status={confirmed ? "confirmed" : "draft"}
    >
      <div className="cm-coverage__gate-status">
        <span className="cm-coverage__gate-progress">
          覆核進度 {reviewedCount}/{totalCount}
        </span>
        {confirmed ? (
          <span className="cm-coverage__chip cm-coverage__chip--confirmed">
            覆核已確認
          </span>
        ) : (
          <span className="cm-coverage__gate-hint">{draftHint}</span>
        )}
        {editable ? (
          confirmed ? (
            <button
              className="cm-coverage__gate-button"
              disabled={busy}
              onClick={() => void submit("draft")}
              type="button"
            >
              還原為草稿
            </button>
          ) : (
            <button
              className="cm-coverage__gate-button cm-coverage__gate-button--confirm"
              disabled={!confirmable || busy}
              onClick={() => void submit("confirmed")}
              type="button"
            >
              確認覆核完成
            </button>
          )
        ) : null}
      </div>
      {confirmed ? (
        <div className="cm-coverage__handoff">
          <span className="cm-coverage__handoff-title">開始實作</span>
          <div className="cm-coverage__handoff-actions">
            <CopyTextButton
              label="複製實作指令"
              text={`/component-coverage-implement ${report.requestId}`}
            />
            <CopyTextButton
              label="複製完整需求提示詞"
              text={buildImplementationPrompt(report)}
            />
          </div>
          <span className="cm-coverage__handoff-hint">
            預設用 Claude Code 執行實作指令；完整提示詞可貼給任何 agent。
          </span>
        </div>
      ) : null}
      {error ? <span className="cm-coverage__review-error">{error}</span> : null}
    </div>
  );
}

function BlockCard({
  block,
  onOpenImage,
  onSaveReview,
  preview,
  requestId,
  reviewEditable,
}: {
  block: CoverageBlock;
  onOpenImage: (src: string) => void;
  onSaveReview: (blockId: string, review: CoverageBlockReview) => Promise<void>;
  preview: PreviewControl;
  requestId: string;
  reviewEditable: boolean;
}) {
  const needsDecision = classifyCoverageBlock(block) !== "reusable";
  const unreviewed = needsDecision && !block.review?.decision;

  return (
    <article className="cm-coverage__block">
      <header className="cm-coverage__block-header">
        <div className="cm-coverage__block-title-row">
          <h4 className="cm-coverage__block-label">{block.label}</h4>
          {unreviewed ? (
            <span className="cm-coverage__chip cm-coverage__chip--needs-review">
              待覆核
            </span>
          ) : null}
        </div>
        <p className="cm-coverage__block-evidence">辨識依據：{block.evidence}</p>
      </header>
      {block.evidenceRegion ? (
        <CroppedEvidence
          onOpen={onOpenImage}
          region={block.evidenceRegion}
          requestId={requestId}
        />
      ) : null}
      {block.matches.map((match) => (
        <MatchCard
          key={`${block.id}-${match.componentId}`}
          match={match}
          preview={preview}
          previewKey={`${block.id}:${match.componentId}`}
        />
      ))}
      {block.gap.status !== "none" ? (
        <div className={`cm-coverage__gap cm-coverage__gap--${block.gap.status}`}>
          <span className="cm-coverage__gap-title">
            {block.gap.status === "missing" ? "建議新建" : "建議擴充"}：
            {block.gap.suggestedName}
          </span>
          <span className="cm-coverage__gap-meta">
            分類 {block.gap.suggestedCategory}・角色 {block.gap.suggestedRole}
          </span>
          <p className="cm-coverage__gap-rationale">{block.gap.rationale}</p>
        </div>
      ) : null}
      <BlockReviewPanel
        block={block}
        editable={reviewEditable}
        key={`${block.id}-${block.review?.reviewedAt ?? "unreviewed"}`}
        onSave={onSaveReview}
      />
    </article>
  );
}

function Lightbox({ onClose, src }: { onClose: () => void; src: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="cm-coverage__lightbox"
      onClick={onClose}
      role="dialog"
    >
      <img alt="放大檢視" className="cm-coverage__lightbox-image" src={src} />
    </div>
  );
}

function CroppedEvidence({
  onOpen,
  region,
  requestId,
}: {
  onOpen: (src: string) => void;
  region: CoverageEvidenceRegion;
  requestId: string;
}) {
  const [cropSrc, setCropSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      const sx = region.x * image.naturalWidth;
      const sy = region.y * image.naturalHeight;
      const sw = Math.max(1, Math.round(region.width * image.naturalWidth));
      const sh = Math.max(1, Math.round(region.height * image.naturalHeight));
      const canvas = document.createElement("canvas");

      canvas.width = sw;
      canvas.height = sh;

      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

      try {
        setCropSrc(canvas.toDataURL("image/png"));
      } catch {
        // Tainted canvas or encoding failure — hide silently.
      }
    };
    image.src = `${componentCoverageStaticBase}/requests/${requestId}/${region.image}`;

    return () => {
      cancelled = true;
    };
  }, [region, requestId]);

  if (!cropSrc) {
    return null;
  }

  return (
    <figure className="cm-coverage__crop">
      <figcaption className="cm-coverage__crop-label">原圖位置</figcaption>
      <button
        className="cm-coverage__crop-button"
        onClick={() => onOpen(cropSrc)}
        type="button"
      >
        <img alt="缺失元素的原圖位置" className="cm-coverage__crop-image" src={cropSrc} />
      </button>
    </figure>
  );
}

function SourceImages({
  onOpen,
  request,
}: {
  onOpen: (src: string) => void;
  request: CoverageRequest;
}) {
  const [failedNames, setFailedNames] = useState<readonly string[]>([]);
  const visibleImages = request.images.filter((name) => !failedNames.includes(name));

  if (visibleImages.length === 0) {
    return null;
  }

  return (
    <div className="cm-coverage__source">
      <span className="cm-coverage__source-label">來源圖片</span>
      <div className="cm-coverage__source-strip">
        {visibleImages.map((name) => {
          const url = `${componentCoverageStaticBase}/requests/${request.id}/${name}`;

          return (
            <button
              className="cm-coverage__source-thumb"
              key={name}
              onClick={() => onOpen(url)}
              title={`檢視 ${name}`}
              type="button"
            >
              <img
                alt={name}
                className="cm-coverage__source-image"
                onError={() =>
                  setFailedNames((current) => [...current, name])
                }
                src={url}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReportDetail({
  fileName,
  isDevMode,
  onOpenImage,
  onReviewSubmit,
  preview,
  report,
  request,
}: {
  fileName: string;
  isDevMode: boolean;
  onOpenImage: (src: string) => void;
  onReviewSubmit: (
    fileName: string,
    payload: CoverageReviewSubmitPayload,
  ) => Promise<void>;
  preview: PreviewControl;
  report: CoverageReport;
  request?: CoverageRequest;
}) {
  const sections = useMemo(() => {
    const grouped: Record<CoverageSection, CoverageBlock[]> = {
      extend: [],
      missing: [],
      reusable: [],
    };

    for (const block of report.blocks) {
      grouped[classifyCoverageBlock(block)].push(block);
    }

    return grouped;
  }, [report]);
  const sectionRefs = useRef<Record<CoverageSection, HTMLElement | null>>({
    extend: null,
    missing: null,
    reusable: null,
  });
  const reviewEditable = isDevMode && !isReportConfirmed(report);

  const scrollToSection = (section: CoverageSection) => {
    sectionRefs.current[section]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleBlockReview = async (
    blockId: string,
    review: CoverageBlockReview,
  ) => {
    const reviews = collectReviews(report);

    reviews[blockId] = review;
    await onReviewSubmit(fileName, { reviews, reviewStatus: "draft" });
  };

  return (
    <div className="cm-coverage__report-detail">
      <p className="cm-coverage__report-source">{report.sourceSummary}</p>
      <SummaryStats onNavigate={scrollToSection} summary={report.summary} />
      <ReviewProgress
        editable={isDevMode}
        onSubmit={(payload) => onReviewSubmit(fileName, payload)}
        report={report}
      />
      {request ? <SourceImages onOpen={onOpenImage} request={request} /> : null}
      {sectionOrder.map((section) => (
        <section
          className="cm-coverage__section"
          key={section}
          ref={(element) => {
            sectionRefs.current[section] = element;
          }}
        >
          <header className="cm-coverage__section-header">
            <h3
              className={`cm-coverage__section-heading cm-coverage__section-heading--${section}`}
            >
              {sectionCopy[section].heading}
              <span className="cm-coverage__section-count">
                {sections[section].length}
              </span>
              <span className="cm-coverage__section-hint">
                {sectionCopy[section].hint}
              </span>
            </h3>
          </header>
          {sections[section].length === 0 ? (
            <p className="cm-coverage__section-empty">此分類沒有項目。</p>
          ) : (
            sections[section].map((block) => (
              <BlockCard
                block={block}
                key={block.id}
                onOpenImage={onOpenImage}
                onSaveReview={handleBlockReview}
                preview={preview}
                requestId={report.requestId}
                reviewEditable={reviewEditable}
              />
            ))
          )}
        </section>
      ))}
      <p className="cm-coverage__report-analyzer">
        分析引擎 {report.analyzer.engine}・比對元件目錄 {report.analyzer.catalogEntryCount} 筆
      </p>
    </div>
  );
}

const deleteConfirmTimeoutMs = 3000;

function DeleteReportControl({
  fileName,
  onDelete,
}: {
  fileName: string;
  onDelete: (fileName: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const revertTimerRef = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(revertTimerRef.current), []);

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true);
      setError("");
      revertTimerRef.current = window.setTimeout(
        () => setConfirming(false),
        deleteConfirmTimeoutMs,
      );
      return;
    }

    window.clearTimeout(revertTimerRef.current);
    setDeleting(true);

    try {
      await onDelete(fileName);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : String(deleteError),
      );
      setConfirming(false);
      setDeleting(false);
    }
  };

  return (
    <span className="cm-coverage__delete">
      {error ? <span className="cm-coverage__delete-error">{error}</span> : null}
      <button
        aria-label={confirming ? `確認刪除 ${fileName}` : `刪除 ${fileName}`}
        className={`cm-coverage__delete-button${confirming ? " cm-coverage__delete-button--confirm" : ""}`}
        disabled={deleting}
        onClick={(event) => {
          event.stopPropagation();
          void handleClick();
        }}
        type="button"
      >
        {confirming ? (
          "確認刪除"
        ) : (
          <svg
            aria-hidden="true"
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        )}
      </button>
    </span>
  );
}

function AnalyzeGuidance({
  note,
  requestId,
  text,
}: {
  note?: string;
  requestId: string;
  text: string;
}) {
  return (
    <div className="cm-coverage__guidance">
      <span className="cm-coverage__guidance-text">{text}</span>
      <CopyTextButton label="複製指令" text={analyzeCommandFor(requestId)} />
      {note ? <span className="cm-coverage__guidance-note">{note}</span> : null}
    </div>
  );
}

function PipelineRowView({
  isDevMode,
  onDelete,
  onSelect,
  row,
  selected,
}: {
  isDevMode: boolean;
  onDelete: (fileName: string) => Promise<void>;
  onSelect: (fileName: string) => void;
  row: PipelineRow;
  selected: boolean;
}) {
  if (row.kind === "invalid-request") {
    return (
      <div className="cm-coverage__report-item cm-coverage__report-item--invalid">
        <span className="cm-coverage__report-title">{row.id}</span>
        <p className="cm-coverage__report-error">{row.error}</p>
      </div>
    );
  }

  if (row.kind === "invalid-report") {
    return (
      <div className="cm-coverage__report-item cm-coverage__report-item--invalid">
        <span className="cm-coverage__report-title">{row.fileName}</span>
        <p className="cm-coverage__report-error">
          格式錯誤（{row.error}），請跑 npm run check:coverage-reports。
        </p>
        {isDevMode ? (
          <DeleteReportControl fileName={row.fileName} onDelete={onDelete} />
        ) : null}
      </div>
    );
  }

  const report = row.report;
  const reportFileName = row.kind === "request" ? row.reportFileName : row.fileName;
  const request = row.kind === "request" ? row.request : undefined;
  const stage = derivePipelineStage(report, request?.status);
  const title =
    row.kind === "request"
      ? row.request.title || row.request.id
      : row.report.requestId;
  const metaParts =
    row.kind === "request"
      ? [
          row.request.id,
          formatTimestamp(row.request.createdAt),
          `圖片 ${row.request.images.length} 張`,
        ]
      : [row.fileName, formatTimestamp(row.report.createdAt)];
  const expandable = Boolean(report && reportFileName);

  const rowBody = (
    <>
      <span className="cm-coverage__report-title">{title}</span>
      <span className="cm-coverage__report-meta">{metaParts.join("・")}</span>
      <span className={`cm-coverage__chip cm-coverage__chip--stage-${stage}`}>
        {stageCopy[stage]}
      </span>
      {report ? (
        <span className="cm-coverage__report-counts">
          <CoverageBar summary={report.summary} />
          {isDevMode && reportFileName ? (
            <DeleteReportControl fileName={reportFileName} onDelete={onDelete} />
          ) : null}
        </span>
      ) : null}
    </>
  );

  if (!expandable) {
    return (
      <div className="cm-coverage__report-item cm-coverage__report-item--static">
        {rowBody}
        {stage === "pending" ? (
          <AnalyzeGuidance
            note="分析完成後清單會自動更新。"
            requestId={request?.id ?? ""}
            text="下一步：複製指令，在 Claude Code 執行分析。"
          />
        ) : null}
        {stage === "report-missing" ? (
          <AnalyzeGuidance
            requestId={request?.id ?? ""}
            text="已分析但找不到報告檔，請重新執行分析指令。"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      aria-expanded={selected}
      className={`cm-coverage__report-item${selected ? " cm-coverage__report-item--selected" : ""}`}
      onClick={() => onSelect(reportFileName ?? "")}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(reportFileName ?? "");
        }
      }}
      role="button"
      tabIndex={0}
    >
      {rowBody}
    </div>
  );
}

export type ReportViewProps = {
  isDevMode: boolean;
  onDelete: (fileName: string) => Promise<void>;
  onReviewSubmit: (
    fileName: string,
    payload: CoverageReviewSubmitPayload,
  ) => Promise<void>;
  onSelect: (fileName: string) => void;
  rows: readonly PipelineRow[];
  selectedReport: string;
  storyIndex: ReadonlyMap<string, string>;
};

export function ReportView({
  isDevMode,
  onDelete,
  onReviewSubmit,
  onSelect,
  rows,
  selectedReport,
  storyIndex,
}: ReportViewProps) {
  const [expandedPreview, setExpandedPreview] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState("");
  const preview: PreviewControl = {
    expandedPreview,
    onTogglePreview: (previewKey) =>
      setExpandedPreview((current) => (current === previewKey ? "" : previewKey)),
    storyIndex,
  };

  return (
    <div className="cm-coverage__report-list">
      {rows.map((row) => {
        const report =
          row.kind === "request" || row.kind === "orphan-report"
            ? row.report
            : undefined;
        const reportFileName =
          row.kind === "request"
            ? row.reportFileName
            : row.kind === "orphan-report"
              ? row.fileName
              : undefined;
        const expanded =
          Boolean(reportFileName) && selectedReport === reportFileName;

        return (
          <div key={row.key}>
            <PipelineRowView
              isDevMode={isDevMode}
              onDelete={onDelete}
              onSelect={onSelect}
              row={row}
              selected={expanded}
            />
            {report && reportFileName && expanded ? (
              <ReportDetail
                fileName={reportFileName}
                isDevMode={isDevMode}
                onOpenImage={setLightboxSrc}
                onReviewSubmit={onReviewSubmit}
                preview={preview}
                report={report}
                request={row.kind === "request" ? row.request : undefined}
              />
            ) : null}
          </div>
        );
      })}
      {lightboxSrc ? (
        <Lightbox onClose={() => setLightboxSrc("")} src={lightboxSrc} />
      ) : null}
    </div>
  );
}
