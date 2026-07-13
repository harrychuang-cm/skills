import type { ReactNode } from "react";

import type { ComponentCatalogId } from "../componentCatalog";

export type CompositionPreviewRenderer = () => ReactNode;

/**
 * Trusted project-owned preview fixtures. Install binding: add direct imports
 * for reusable components that can render deterministically, then register a
 * zero-argument renderer keyed by its catalog id. Never accept props, imports,
 * children, CSS, or executable content from a coverage report.
 */
export const compositionPreviewRegistry: Partial<
  Record<ComponentCatalogId, CompositionPreviewRenderer>
> = {};

export function getCompositionPreviewRenderer(
  componentId: string,
): CompositionPreviewRenderer | undefined {
  return compositionPreviewRegistry[componentId as ComponentCatalogId];
}
