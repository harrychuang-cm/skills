import type { FigmaReviewEntry } from "./review.js";

export declare const defaultFigmaReviewStatusApiPath =
  "/__figma_export_review_status";

export type FigmaReviewStatusFile = {
  stories: Record<string, FigmaReviewEntry>;
  version: 1;
};

export type FigmaReviewStatusPluginOptions = {
  apiPath?: string;
  cwd?: string;
  filePath?: string;
  name?: string;
};

export declare function createFigmaReviewStatusPlugin(
  options?: FigmaReviewStatusPluginOptions,
): {
  configureServer(server: {
    middlewares: {
      use(
        path: string,
        handler: (
          request: import("node:http").IncomingMessage,
          response: import("node:http").ServerResponse,
          next?: (error?: unknown) => void,
        ) => void,
      ): void;
    };
  }): void;
  name: string;
};
