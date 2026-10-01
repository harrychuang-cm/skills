import { VisualMeetingSummary, VisualMeetingFile, VisualCommentReportRenderContext } from './visual-comment-store.js';
import './visualComment-CG4UoVVu.js';

type CommentPromptContext = {
    version: 1;
    comment: {
        id: string;
        body: string;
        createdAt: string;
        kind?: string;
        ordinal?: number;
    };
    story: {
        id: string;
        title: string;
        name: string;
        url?: string | null;
        prototypeId?: string;
        routeId?: string;
        stateId?: string;
    };
    screenshot: {
        projectRelativePath: string | null;
        reportRelativePath: string;
        mimeType: string;
    };
    pin: {
        xRatio: number;
        yRatio: number;
    };
    viewport: {
        width: number;
        height: number;
        devicePixelRatio: number;
    };
    capturedAt: string;
};
type CommentPromptScreenshotUrl = {
    href: string;
} | null;
type CommentPromptEntry = {
    context: CommentPromptContext;
    screenshotUrl: CommentPromptScreenshotUrl;
};
declare function createCommentPromptFormatter(): {
    contextKind: (context: CommentPromptContext) => "visual-fix" | "tracking";
    formatCommentPrompt: (context: CommentPromptContext, screenshotUrl: CommentPromptScreenshotUrl) => string;
    formatTrackingPrompt: (entries: CommentPromptEntry[]) => string;
    formatVisualFixPrompt: (context: CommentPromptContext, screenshotUrl: CommentPromptScreenshotUrl) => string;
};
declare const formatTrackingPrompt: (entries: CommentPromptEntry[]) => string;
declare const formatVisualFixPrompt: (context: CommentPromptContext, screenshotUrl: CommentPromptScreenshotUrl) => string;

declare function renderVisualCommentReport(meeting: VisualMeetingFile, context?: VisualCommentReportRenderContext): string;
declare function renderVisualCommentIndex(meetings: VisualMeetingSummary[], activeSessionId: string | null): string;

export { type CommentPromptContext, type CommentPromptEntry, createCommentPromptFormatter, formatTrackingPrompt, formatVisualFixPrompt, renderVisualCommentIndex, renderVisualCommentReport };
