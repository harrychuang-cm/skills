import { IncomingMessage, ServerResponse } from 'node:http';
import { FigmaReviewEntry } from './review.js';
import 'react';
import './options-BxmVHgJe.js';

declare const defaultFigmaReviewStatusApiPath = "/__figma_export_review_status";
declare const defaultFigmaExportPayloadApiPath = "/__figma-export/payloads";
declare const defaultFigmaExportPayloadDir = "design-system/figma-export-payloads";
type FigmaReviewStatusFile = {
    stories: Record<string, FigmaReviewEntry>;
    version: 1;
};
type FigmaReviewStatusPluginOptions = {
    apiPath?: string;
    cwd?: string;
    filePath?: string;
    name?: string;
    payloadApiPath?: string;
    payloadDir?: string;
};
type MiddlewareHandler = (request: IncomingMessage, response: ServerResponse, next?: (error?: unknown) => void) => void;
type MiddlewareServer = {
    middlewares: {
        use(path: string, handler: MiddlewareHandler): void;
    };
};
declare function sanitizePayloadStoryId(value: unknown): string;
declare function handleFigmaExportPayloadRequest({ payloadDir, request, response, }: {
    payloadDir: string;
    request: IncomingMessage;
    response: ServerResponse;
}): Promise<void>;
declare function createFigmaExportPayloadStoreHandler(options: {
    payloadDir: string;
}): MiddlewareHandler;
declare function createFigmaReviewStatusPlugin(options?: FigmaReviewStatusPluginOptions): {
    configureServer(server: MiddlewareServer): void;
    name: string;
};

export { type FigmaReviewStatusFile, type FigmaReviewStatusPluginOptions, createFigmaExportPayloadStoreHandler, createFigmaReviewStatusPlugin, defaultFigmaExportPayloadApiPath, defaultFigmaExportPayloadDir, defaultFigmaReviewStatusApiPath, handleFigmaExportPayloadRequest, sanitizePayloadStoryId };
