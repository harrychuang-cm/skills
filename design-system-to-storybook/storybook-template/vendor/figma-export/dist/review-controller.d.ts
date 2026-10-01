import { V as VisualCommentKind, a as VisualCommentPin, b as beginVisualCommentCapture, c as VisualCommentCaptureController } from './visualComment-CG4UoVVu.js';

type FigmaReviewStatus = "not-started" | "exported" | "imported" | "needs-fix" | "approved";
type FigmaReviewEntry = {
    componentTitle?: string;
    figmaNodeUrl?: string;
    figmaReviewStatus: FigmaReviewStatus;
    name?: string;
    notes?: string;
    notesOpen?: boolean;
    storyTitle?: string;
    updatedAt?: string;
};
type VisualCommentOverview = {
    activeSession: {
        id: string;
        title: string;
        startedAt: string;
        closedAt: string | null;
        captureCount: number;
        commentCount: number;
    } | null;
    activeProjectRelativeSessionPath?: string | null;
    activeReportUrl: string | null;
    activeTracking?: {
        open: number;
        total: number;
    };
    comments: Array<{
        id: string;
        authorName: string;
        body: string;
        createdAt: string;
        kind?: VisualCommentKind;
        ordinal: number;
        pin?: VisualCommentPin;
        preview: {
            imageUrl: string;
            width: number;
            height: number;
            pin: VisualCommentPin;
        } | null;
        resolvedAt?: string | null;
        state?: {
            routeId?: string;
            stateId?: string;
        };
    }>;
    recentSessions: Array<{
        id: string;
        title: string;
        startedAt: string;
        closedAt: string | null;
        captureCount: number;
        commentCount: number;
    }>;
    reportUrl: string;
};
type VisualCommentMeeting = {
    captures: Record<string, {
        capturedAt: string;
        image: {
            mimeType: string;
            path: string;
        };
        story: {
            id: string;
            name: string;
            prototypeId?: string;
            routeId?: string;
            stateId?: string;
            title: string;
            url?: string;
        };
        viewport: {
            devicePixelRatio: number;
            height: number;
            width: number;
        };
    }>;
    comments: Array<{
        body: string;
        captureId: string;
        createdAt: string;
        id: string;
        kind?: VisualCommentKind;
        pin: VisualCommentPin;
        resolvedAt?: string | null;
    }>;
};
type FetchLike = typeof fetch;
declare function createReviewStatusController({ apiPath, fetcher, }: {
    apiPath: string;
    fetcher?: FetchLike;
}): {
    load(storyId: string, signal?: AbortSignal): Promise<Partial<FigmaReviewEntry> | null>;
    save(storyId: string, entry: FigmaReviewEntry): Promise<{
        entry?: Partial<FigmaReviewEntry>;
    }>;
};
declare function createVisualCommentsController({ apiPath, fetcher, }: {
    apiPath: string;
    fetcher?: FetchLike;
}): {
    beginCapture(options: Parameters<typeof beginVisualCommentCapture>[0]): VisualCommentCaptureController;
    delete(path: string): Promise<{
        error?: string;
        reportStale?: boolean;
    }>;
    ensureMeeting(title: string): Promise<string>;
    getMeeting(sessionId: string): Promise<VisualCommentMeeting>;
    getOverview(storyId: string): Promise<VisualCommentOverview>;
    patch(path: string, body: unknown): Promise<{
        error?: string;
        reportStale?: boolean;
    }>;
    post(path: string, body?: unknown): Promise<{
        error?: string;
        reportStale?: boolean;
    }>;
    resolveTarget(selector?: string): HTMLElement | null;
};

export { type FigmaReviewEntry, type FigmaReviewStatus, type VisualCommentMeeting, type VisualCommentOverview, createReviewStatusController, createVisualCommentsController };
