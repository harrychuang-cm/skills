import "./figma-code-exporter.css";
import {
  syncFigmaExportOverlay,
  type FigmaExportPreviewContext,
} from "./overlay";
import {
  defaultFigmaExportGlobalName,
  type FigmaExportAddonOptions,
} from "./options";
import { getFigmaReviewRegistration, runHostRender } from "./reviewRegistry";

export type { FigmaExportPreviewContext } from "./overlay";

export function getFigmaExportGlobalName(
  options?: FigmaExportAddonOptions,
): string {
  return options?.globalName ?? defaultFigmaExportGlobalName;
}

// Pass-through decorator: the story result is returned unchanged (strict
// identity, no wrapper element), so it is valid for every Storybook renderer
// (React, Vue, Svelte, Angular, Web Components). The export overlay is a
// document.body side effect handled by the overlay module.
export function createFigmaExportDecorator(options?: FigmaExportAddonOptions) {
  return function figmaExportDecorator<StoryResult>(
    storyFn: () => StoryResult,
    context: FigmaExportPreviewContext,
  ): StoryResult {
    syncFigmaExportOverlay(context, options);
    return storyFn();
  };
}

// Host decorator. Storybook applies the preview entry's decorators at the
// addon's position in the addons list, so with the addon listed before an
// addon whose decorator replaces the story (the Prototype Inspector's UI Flow,
// for example) review keeps following every mode. It only acts after the
// project called configureFigmaExportReview; otherwise it is a pure
// pass-through. The export overlay and review workspace are synchronized by
// the review entry's registration, never by this bundle's own overlay copy,
// so one page never mounts two overlays.
export function figmaExportHostDecorator<StoryResult>(
  storyFn: () => StoryResult,
  context: FigmaExportPreviewContext,
): StoryResult {
  const registration = getFigmaReviewRegistration();
  if (!registration) return storyFn();
  registration.sync(context);
  return runHostRender(storyFn);
}

export const decorators = [figmaExportHostDecorator];

export function createFigmaExportGlobalTypes(
  options?: FigmaExportAddonOptions,
): Record<string, { defaultValue: "off"; description: string }> {
  return {
    [getFigmaExportGlobalName(options)]: {
      defaultValue: "off",
      description: "Show the component-to-Figma code exporter.",
    },
  };
}

export function createFigmaExportInitialGlobals(
  options?: FigmaExportAddonOptions,
): Record<string, "off"> {
  return {
    [getFigmaExportGlobalName(options)]: "off",
  };
}
