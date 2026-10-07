declare const VISUAL_COMMENT_KINDS: readonly ["visual-fix", "tracking"];
type VisualCommentKind = (typeof VISUAL_COMMENT_KINDS)[number];
type VisualCommentOptions = {
    enabled?: boolean;
    apiPath?: string;
    captureSelector?: string;
    authorStorageKey?: string;
    shortcuts?: boolean;
};
type VisualCommentStoryMetadata = {
    id: string;
    title: string;
    name: string;
    url?: string;
    prototypeId?: string;
    routeId?: string;
    stateId?: string;
    view?: string;
};
type VisualCommentNearbyAnchor = {
    id: string;
    label?: string;
    dx: number;
    dy: number;
};
type VisualCommentAnchor = {
    type: "element";
    id: string;
    label?: string;
    route?: string;
    x: number;
    y: number;
    width: number;
    height: number;
} | {
    type: "path";
    id: string;
    label?: string;
    t: number;
} | {
    type: "canvas";
    x: number;
    y: number;
    nearby?: VisualCommentNearbyAnchor[];
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
    kind?: VisualCommentKind;
    story: VisualCommentStoryMetadata;
    pin: VisualCommentPin;
    anchor?: VisualCommentAnchor;
    viewport: VisualCommentViewport;
    capture: VisualCommentCapture;
};
type VisualCommentRect = {
    left: number;
    top: number;
    width: number;
    height: number;
};
type VisualCommentCaptureResult = {
    capture: VisualCommentCapture;
    pin: VisualCommentPin;
    anchor?: VisualCommentAnchor;
    pinFrame?: VisualCommentRect;
    pinFrameReference?: VisualCommentFrameReference;
    viewport: VisualCommentViewport;
};
/** An anchored capture: the image and the client rect it shows. */
type VisualCommentFrameReference = {
    kind: "element";
    id: string;
    left: number;
    top: number;
    width: number;
    height: number;
} | {
    kind: "world";
    x: number;
    y: number;
    width: number;
    height: number;
};
type VisualCommentAnchoredCapture = {
    capture: VisualCommentCapture;
    rect: VisualCommentRect;
    reference?: VisualCommentFrameReference;
};
type VisualCommentPointSelection = {
    pin: VisualCommentPin;
    anchor?: VisualCommentAnchor;
    viewport: VisualCommentViewport;
};
/** Resolves the host-declared anchor at a press inside the capture target. */
type VisualCommentAnchorResolver = (target: HTMLElement, clientX: number, clientY: number, pressed: Element | null) => VisualCommentAnchor | undefined;
type VisualCommentCaptureController = {
    cancel(): void;
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
/**
 * Arms the next pointer sequence before prototype handlers run. The returned
 * controller is also used by the panel Cancel action and unmount cleanup.
 */
declare function beginVisualCommentCapture({ capture, documentRef, onCancel, onCaptured, onError, onPointSelected, resolveAnchor, captureAnchor, selector, }: {
    capture?: (target: HTMLElement) => Promise<VisualCommentCapture>;
    captureAnchor?: (target: HTMLElement, anchor: VisualCommentAnchor) => Promise<VisualCommentAnchoredCapture | null>;
    documentRef?: Document;
    onCancel?: () => void;
    onCaptured(result: VisualCommentCaptureResult): void;
    onError(error: Error): void;
    onPointSelected?: (selection: VisualCommentPointSelection) => void;
    resolveAnchor?: VisualCommentAnchorResolver;
    selector?: string;
}): VisualCommentCaptureController;

export { type CreateVisualCommentRequest as C, type VisualCommentKind as V, type VisualCommentPin as a, type VisualCommentAnchor as b, beginVisualCommentCapture as c, type VisualCommentCaptureController as d, VISUAL_COMMENT_LIMITS as e, type VisualCommentOptions as f };
