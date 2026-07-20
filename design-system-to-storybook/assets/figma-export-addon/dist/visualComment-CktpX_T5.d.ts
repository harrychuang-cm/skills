type VisualCommentOptions = {
    enabled?: boolean;
    apiPath?: string;
    captureSelector?: string;
    authorStorageKey?: string;
};
type VisualCommentStoryMetadata = {
    id: string;
    title: string;
    name: string;
    url?: string;
    prototypeId?: string;
    routeId?: string;
    stateId?: string;
};
type VisualCommentPin = {
    xRatio: number;
    yRatio: number;
};
type VisualCommentViewport = {
    width: number;
    height: number;
    devicePixelRatio: number;
    scrollX: number;
    scrollY: number;
};
type VisualCommentCapture = {
    dataUrl: string;
    mimeType: "image/webp" | "image/png";
    width: number;
    height: number;
    cssWidth: number;
    cssHeight: number;
};
type CreateVisualCommentRequest = {
    clientRequestId: string;
    authorName: string;
    body: string;
    story: VisualCommentStoryMetadata;
    pin: VisualCommentPin;
    viewport: VisualCommentViewport;
    capture: VisualCommentCapture;
};
declare const VISUAL_COMMENT_LIMITS: {
    readonly maxRequestBytes: number;
    readonly maxImageBytes: number;
    readonly maxImageLongestSide: 2048;
    readonly maxImagePixels: number;
    readonly maxSessionAssetsBytes: number;
    readonly maxTitleLength: 120;
    readonly maxAuthorLength: 80;
    readonly maxBodyLength: 2000;
};

export { type CreateVisualCommentRequest as C, type VisualCommentOptions as V, VISUAL_COMMENT_LIMITS as a };
