import { Component, type CSSProperties, type ReactNode } from "react";

import {
  getCompositionPreviewRenderer,
  type CompositionPreviewRenderer,
} from "./compositionPreviewRegistry";
import {
  resolveCompositionSlot,
  type CompositionSlotResolution,
} from "./compositionPreviewModel";
import {
  classifyCoverageBlock,
  type CoverageBlock,
  type CoverageComposition,
  type CoverageCompositionBlock,
  type CoverageCompositionGroup,
  type CoverageCompositionNode,
} from "./coverageTypes";

export type CompositionPreviewProps = {
  blocks: readonly CoverageBlock[];
  composition: CoverageComposition;
  onSelectBlock: (blockId: string) => void;
  selectedBlockId: string;
};

type CompositionStyle = CSSProperties & {
  "--cca-composition-columns"?: number;
  "--cca-composition-span"?: number;
};

type CompositionSlotErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
};

type CompositionSlotErrorBoundaryState = {
  failed: boolean;
};

class CompositionSlotErrorBoundary extends Component<
  CompositionSlotErrorBoundaryProps,
  CompositionSlotErrorBoundaryState
> {
  state: CompositionSlotErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): CompositionSlotErrorBoundaryState {
    return { failed: true };
  }

  componentDidUpdate(previousProps: CompositionSlotErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function RegisteredCompositionPreview({
  renderer,
}: {
  renderer: CompositionPreviewRenderer;
}) {
  return <>{renderer()}</>;
}

function storyDocsPath(storyTitle: string) {
  const slug = storyTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `/docs/${slug}--docs`;
}

function PreviewUnavailable({
  copy,
  storyTitle,
  title = "此區塊無法產生真實元件預覽",
}: {
  copy: string;
  storyTitle?: string;
  title?: string;
}) {
  return (
    <div className="cm-coverage__composition-unavailable" role="status">
      <span className="cm-coverage__composition-unavailable-title">{title}</span>
      <span className="cm-coverage__composition-unavailable-copy">{copy}</span>
      {storyTitle ? (
        <a
          className="cm-coverage__story-link cm-coverage__composition-docs-link"
          href={`?path=${storyDocsPath(storyTitle)}`}
          target="_top"
        >
          開啟元件文件
        </a>
      ) : null}
    </div>
  );
}

function ComponentSlotBody({
  resolution,
}: {
  resolution: Extract<CompositionSlotResolution, { kind: "component" }>;
}) {
  const renderComponent = getCompositionPreviewRenderer(resolution.componentId);

  if (!renderComponent) {
    return (
      <PreviewUnavailable
        copy={`「${resolution.componentName}」尚未註冊可信任的組裝預覽 renderer；其他區塊仍可繼續審核。`}
        storyTitle={resolution.storyTitle}
      />
    );
  }

  const failureFallback = (
    <PreviewUnavailable
      copy={`「${resolution.componentName}」renderer 發生錯誤；錯誤已隔離，其他區塊仍可繼續審核。`}
      storyTitle={resolution.storyTitle}
    />
  );

  return (
    <CompositionSlotErrorBoundary
      fallback={failureFallback}
      resetKey={resolution.componentId}
    >
      <div
        aria-hidden="true"
        className="cm-coverage__composition-component-surface"
        data-preview-component={resolution.componentId}
        inert
      >
        <RegisteredCompositionPreview renderer={renderComponent} />
      </div>
    </CompositionSlotErrorBoundary>
  );
}

function PlaceholderSlotBody({
  resolution,
}: {
  resolution: Extract<CompositionSlotResolution, { kind: "placeholder" }>;
}) {
  return (
    <div className="cm-coverage__composition-placeholder">
      <span className="cm-coverage__composition-placeholder-kicker">
        缺少元件
      </span>
      <strong className="cm-coverage__composition-placeholder-title">
        {resolution.suggestedName}
      </strong>
      <span className="cm-coverage__composition-placeholder-meta">
        分類 {resolution.category}・角色 {resolution.role}
      </span>
      <p className="cm-coverage__composition-placeholder-rationale">
        {resolution.rationale}
      </p>
    </div>
  );
}

function UnavailableSlotBody({
  resolution,
}: {
  resolution: Extract<CompositionSlotResolution, { kind: "unavailable" }>;
}) {
  return <PreviewUnavailable copy={resolution.reason} />;
}

function CompositionBlockSlot({
  block,
  node,
  onSelectBlock,
  selected,
}: {
  block: CoverageBlock;
  node: CoverageCompositionBlock;
  onSelectBlock: (blockId: string) => void;
  selected: boolean;
}) {
  const resolution = resolveCompositionSlot(block, node);
  const coverage = classifyCoverageBlock(block);
  const style: CompositionStyle | undefined = node.span
    ? { "--cca-composition-span": node.span }
    : undefined;
  let body: ReactNode;

  if (resolution.kind === "component") {
    body = <ComponentSlotBody resolution={resolution} />;
  } else if (resolution.kind === "placeholder") {
    body = <PlaceholderSlotBody resolution={resolution} />;
  } else {
    body = <UnavailableSlotBody resolution={resolution} />;
  }

  return (
    <article
      className="cm-coverage__composition-slot"
      data-coverage={coverage}
      data-kind={resolution.kind}
      data-selected={selected ? "true" : "false"}
      data-skipped={resolution.skipped ? "true" : "false"}
      data-state={resolution.state}
      style={style}
    >
      {body}
      <button
        aria-label={`覆核 ${block.label}，${resolution.badgeLabel}`}
        aria-pressed={selected}
        className="cm-coverage__composition-slot-select"
        onClick={() => onSelectBlock(block.id)}
        type="button"
      >
        <span className="cm-coverage__composition-slot-label">{block.label}</span>
        <span
          className={`cm-coverage__chip cm-coverage__chip--composition-${resolution.state}`}
        >
          {resolution.badgeLabel}
        </span>
      </button>
    </article>
  );
}

function CompositionGroupView({
  blockById,
  group,
  onSelectBlock,
  selectedBlockId,
}: {
  blockById: ReadonlyMap<string, CoverageBlock>;
  group: CoverageCompositionGroup;
  onSelectBlock: (blockId: string) => void;
  selectedBlockId: string;
}) {
  const style: CompositionStyle | undefined = group.columns
    ? { "--cca-composition-columns": group.columns }
    : undefined;

  const renderNode = (node: CoverageCompositionNode): ReactNode => {
    if (node.kind === "group") {
      return (
        <CompositionGroupView
          blockById={blockById}
          group={node}
          key={node.id}
          onSelectBlock={onSelectBlock}
          selectedBlockId={selectedBlockId}
        />
      );
    }

    const block = blockById.get(node.blockId);

    if (!block) {
      return null;
    }

    return (
      <CompositionBlockSlot
        block={block}
        key={node.id}
        node={node}
        onSelectBlock={onSelectBlock}
        selected={selectedBlockId === block.id}
      />
    );
  };

  return (
    <section
      aria-label={group.label}
      className="cm-coverage__composition-group"
      data-layout={group.layout}
      style={style}
    >
      <div className="cm-coverage__composition-group-children">
        {group.children.map(renderNode)}
      </div>
    </section>
  );
}

export function CompositionPreview({
  blocks,
  composition,
  onSelectBlock,
  selectedBlockId,
}: CompositionPreviewProps) {
  const blockById = new Map(blocks.map((block) => [block.id, block]));

  return (
    <div
      aria-label={`${composition.label}，審核預覽，不是正式畫面`}
      className="cm-coverage__composition-canvas"
      data-viewport={composition.viewport}
      role="region"
    >
      <header className="cm-coverage__composition-canvas-header">
        <span className="cm-coverage__composition-canvas-title">
          {composition.label}
        </span>
        <span className="cm-coverage__composition-review-only">
          審核預覽，不是正式畫面
        </span>
      </header>
      <div className="cm-coverage__composition-screen">
        <CompositionGroupView
          blockById={blockById}
          group={composition.root}
          onSelectBlock={onSelectBlock}
          selectedBlockId={selectedBlockId}
        />
      </div>
    </div>
  );
}
