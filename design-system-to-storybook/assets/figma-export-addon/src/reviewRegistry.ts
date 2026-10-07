// Hand-off between the preview entry, which Storybook loads from the addons
// list, and the review entry, which the project imports from its preview file.
// tsup bundles every entry on its own (splitting: false), so module state is
// not shared between them; the global symbol registry is.

export type FigmaReviewHostContext = {
  globals?: Record<string, unknown>;
  id?: string;
  name?: string;
  parameters?: Record<string, unknown>;
  title?: string;
  viewMode?: string;
};

export type FigmaReviewRegistration = {
  sync(context: FigmaReviewHostContext): void;
};

const registryKey = Symbol.for("sbfx.review.registry");
const activeRenderKey = Symbol.for("sbfx.review.activeRender");

function host(): Record<symbol, unknown> {
  return globalThis as unknown as Record<symbol, unknown>;
}

/** Called by configureFigmaExportReview; the latest registration wins. */
export function registerFigmaReviewSync(registration: FigmaReviewRegistration): void {
  host()[registryKey] = registration;
}

export function getFigmaReviewRegistration(): FigmaReviewRegistration | undefined {
  const registration = host()[registryKey] as FigmaReviewRegistration | undefined;
  return typeof registration?.sync === "function" ? registration : undefined;
}

/**
 * Runs the story function while the host decorator owns the render: a legacy
 * review decorator invoked inside it passes the story through instead of
 * synchronizing a second time.
 */
export function runHostRender<StoryResult>(storyFn: () => StoryResult): StoryResult {
  const previous = host()[activeRenderKey];
  const token = {};
  host()[activeRenderKey] = token;
  try {
    return storyFn();
  } finally {
    host()[activeRenderKey] = previous;
  }
}

export function isHostRenderActive(): boolean {
  return Boolean(host()[activeRenderKey]);
}
