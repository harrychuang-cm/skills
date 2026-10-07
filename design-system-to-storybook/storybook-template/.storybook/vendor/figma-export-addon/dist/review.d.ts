import { R as ResolvedFigmaExportAddonOptions, b as FigmaExportAddonOptions } from './options-pWb_XEzN.js';
import { f as VisualCommentOptions } from './visualComment-DFPXUtKq.js';
export { FigmaReviewEntry, FigmaReviewStatus } from './review-controller.js';

declare const Fragment: unique symbol;
type DomComponent = (props: any) => DomChild;
type DomChild = DomVNode | DomPortal | string | number | boolean | null | undefined | DomChild[];
type DomVNode = {
    type: string | DomComponent | typeof Fragment;
    props: Record<string, unknown> & {
        children?: DomChild;
    };
};
type DomPortal = {
    type: typeof portalType;
    child: DomChild;
    target: Element;
};
declare const portalType: unique symbol;

type FigmaReviewLabels = Partial<{
    approved: string;
    activeMeeting: string;
    addVisualComment: string;
    commentsUnavailable: string;
    adjustCommentPoint: string;
    adjustCommentPointHint: string;
    adjustPendingPinHint: string;
    anonymousAuthor: string;
    authorName: string;
    cancelCapture: string;
    capturedInAnotherState: string;
    commentViews: string;
    layoutChanged: string;
    locationUnavailable: string;
    otherViewPinsNote: string;
    showLocation: string;
    pinDropUnavailable: string;
    pinMoveFailed: string;
    commentMoved: string;
    undoMove: string;
    movedSinceScreenshot: string;
    capturePrompt: string;
    changeAuthorName: string;
    cancelCommentEdit: string;
    cancelDelete: string;
    closeVisualComments: string;
    closeNotes: string;
    commentBody: string;
    commentComposer: string;
    commentKind: string;
    commentKindTracking: string;
    commentKindVisualFix: string;
    commentPlaceholderTracking: string;
    commentPlaceholderVisualFix: string;
    commentingAs: string;
    commentsHeading: string;
    commentsList: string;
    confirmDelete: string;
    copyAllStories: string;
    copyTrackingPrompts: string;
    deleteComment: string;
    deleteCommentDescription: string;
    deleteCommentTitle: string;
    dismissError: string;
    endMeeting: string;
    editComment: string;
    editFigmaSource: string;
    evidenceUnavailable: string;
    exported: string;
    figmaSource: string;
    filterAllComments: string;
    filterComments: string;
    imported: string;
    meetingsHeading: string;
    needsFix: string;
    noComments: string;
    noFilteredComments: string;
    notStarted: string;
    notes: string;
    notesSaved: string;
    openNotes: string;
    openSource: string;
    openVisualComments: string;
    review: string;
    saveAuthorName: string;
    saveCommentChanges: string;
    screenshotUnavailable: string;
    showPins: string;
    showPinsShort: string;
    startMeeting: string;
    startNamedMeeting: string;
    submitComment: string;
    sourcePlaceholder: string;
    title: string;
    viewMeeting: string;
    viewMeetingHint: string;
    viewingMeeting: string;
    visualComments: string;
}>;
type FigmaExportReviewOptions = {
    apiPath?: string;
    autoMarkExported?: boolean;
    enabled?: boolean;
    getComponentTitle?: (context: StorybookContext, options: ResolvedFigmaExportAddonOptions) => string;
    getFigmaSourceUrl?: (context: StorybookContext, componentTitle: string) => string | undefined;
    labels?: FigmaReviewLabels;
    showNotes?: boolean;
    visualComments?: VisualCommentOptions;
};
type FigmaExportReviewProps = {
    apiPath?: string;
    autoMarkExported?: boolean;
    children?: DomChild;
    componentTitle: string;
    enabled: boolean;
    figmaSourceUrl?: string;
    labels?: FigmaReviewLabels;
    showNotes?: boolean;
    storyId: string;
    storyName: string;
    storyTitle: string;
    storyUrl?: string;
    viewMode?: string;
    visualComments?: VisualCommentOptions;
};
type StorybookContext = {
    globals?: Record<string, unknown>;
    id?: string;
    name?: string;
    parameters?: Record<string, unknown>;
    title?: string;
    viewMode?: string;
};
declare const defaultFigmaReviewStatusApiPath = "/__figma_export_review_status";
declare function getDefaultFigmaExportComponentTitle(title: string | undefined, options: ResolvedFigmaExportAddonOptions): string;
declare function getDefaultFigmaSourceUrl(parameters: Record<string, unknown> | undefined): string | undefined;
declare function FigmaExportReview({ apiPath, autoMarkExported, componentTitle, enabled, figmaSourceUrl, labels: labelsOverride, showNotes, storyId, storyName, storyTitle, storyUrl, viewMode, visualComments, }: FigmaExportReviewProps): {
    type: string | DomComponent | typeof Fragment;
    props: Record<string, unknown> & {
        children?: DomChild;
    };
};
declare function createFigmaExportReviewDecorator(figmaExportOptions?: FigmaExportAddonOptions, reviewOptions?: FigmaExportReviewOptions): <StoryResult>(Story: () => StoryResult, context: StorybookContext) => StoryResult;
/**
 * Registers Figma export review for the addon's host decorator, which
 * Storybook applies from the addons list. Takes the same options as
 * createFigmaExportReviewDecorator; call it once from the project's preview
 * file instead of adding that decorator. With the addon listed before the
 * Prototype Inspector preset, review and visual comments then follow every
 * Inspector mode, including UI Flow.
 */
declare function configureFigmaExportReview(figmaExportOptions?: FigmaExportAddonOptions, reviewOptions?: FigmaExportReviewOptions): void;
declare function destroyFigmaReviewWorkspace(): void;

export { FigmaExportReview, type FigmaExportReviewOptions, type FigmaExportReviewProps, type FigmaReviewLabels, type StorybookContext, configureFigmaExportReview, createFigmaExportReviewDecorator, defaultFigmaReviewStatusApiPath, destroyFigmaReviewWorkspace, getDefaultFigmaExportComponentTitle, getDefaultFigmaSourceUrl };
