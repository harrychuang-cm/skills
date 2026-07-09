import type { Plugin } from "vite";

export declare const componentCoverageApiPath: string;

/**
 * Dev middleware routes mounted under componentCoverageApiPath:
 * - GET /state — requests + raw reports
 * - POST /requests — intake submission
 * - PUT /reports/:fileName/review — replace a report's review state
 *   ({ reviews, reviewStatus }); analyzer fields are preserved
 * - DELETE /reports/:fileName — delete a report
 */
export declare function createComponentCoverageApiPlugin(options?: {
  apiPath?: string;
  rootDir?: string;
}): Plugin;
