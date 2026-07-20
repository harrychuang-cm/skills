import { C as CreateVisualCommentRequest, a as VISUAL_COMMENT_LIMITS } from './visualComment-CktpX_T5.js';

type VisualCommentLimits = {
    [Key in keyof typeof VISUAL_COMMENT_LIMITS]: number;
};
type VisualMeeting = {
    id: string;
    title: string;
    startedAt: string;
    closedAt: string | null;
};
type VisualCapture = {
    id: string;
    capturedAt: string;
    story: CreateVisualCommentRequest["story"];
    viewport: CreateVisualCommentRequest["viewport"];
    image: {
        path: string;
        mimeType: "image/webp" | "image/png";
        width: number;
        height: number;
        cssWidth: number;
        cssHeight: number;
        sha256: string;
        bytes: number;
    };
};
type VisualComment = {
    id: string;
    clientRequestId: string;
    captureId: string;
    authorName: string;
    body: string;
    pin: {
        xRatio: number;
        yRatio: number;
    };
    createdAt: string;
};
type VisualMeetingFile = {
    version: 1;
    session: VisualMeeting;
    captures: Record<string, VisualCapture>;
    comments: VisualComment[];
};
type VisualCommentStoreState = {
    version: 1;
    activeSessionId: string | null;
};
type VisualCommentStoreOptions = {
    cwd?: string;
    commentsDir?: string;
    reportRenderer?: {
        index(meetings: VisualMeeting[], activeSessionId: string | null): string;
        meeting(meeting: VisualMeetingFile): string;
    };
    limits?: Partial<VisualCommentLimits>;
};
declare class VisualCommentStoreError extends Error {
    readonly code: string;
    readonly statusCode: number;
    constructor(message: string, code: string, statusCode: number);
}
declare function createVisualCommentStore(options?: VisualCommentStoreOptions): {
    root: string;
    getState: () => Promise<VisualCommentStoreState>;
    listMeetings: () => Promise<VisualMeeting[]>;
    getOverview: (storyId?: string) => Promise<{
        version: 1;
        activeSession: VisualMeeting | null;
        recentSessions: VisualMeeting[];
        comments: VisualComment[];
    }>;
    getMeeting: (id: string) => Promise<VisualMeetingFile>;
    startMeeting: (title: string) => Promise<{
        meeting: VisualMeetingFile;
    } & {
        reportStale: boolean;
    }>;
    closeMeeting: (id: string) => Promise<{
        meeting: VisualMeetingFile;
    } & {
        reportStale: boolean;
    }>;
    createComment: (id: string, requestValue: unknown) => Promise<{
        comment: VisualComment;
        meeting: VisualMeetingFile;
        replay: boolean;
    } & {
        reportStale: boolean;
    }>;
};

export { type VisualCapture, type VisualComment, VisualCommentStoreError, type VisualCommentStoreOptions, type VisualCommentStoreState, type VisualMeeting, type VisualMeetingFile, createVisualCommentStore };
