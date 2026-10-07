import type { Preview } from "@storybook/react-vite";

import { figmaExportProjectConfig } from "./figma-export.config.ts";
import { storybookTemplateProjectConfig } from "./project.config.ts";
import {
  createFigmaExportGlobalTypes,
  createFigmaExportInitialGlobals,
  type FigmaExportAddonOptions,
} from "@harrychuang/storybook-addon-figma-export";
import { configureFigmaExportReview } from "@harrychuang/storybook-addon-figma-export/review";
import { getFigmaSourceUrl } from "@harrychuang/storybook-addon-figma-export/source";
import "@harrychuang/storybook-addon-figma-export/styles.css";
import "@harrychuang/storybook-addon-figma-export/review.css";
import "../tokens/tokens.css";
import "../src/styles/storybook.css";

const backgroundThemeOptions =
  storybookTemplateProjectConfig.storybook.backgrounds;

const figmaExportOptions = {
  absoluteFidelityComponents: [
    ...figmaExportProjectConfig.addon.absoluteFidelityComponents,
  ],
  componentClassPrefixes: [
    ...figmaExportProjectConfig.addon.componentClassPrefixes,
  ],
  embeddedSvgByDataGraphic: {
    ...figmaExportProjectConfig.addon.embeddedSvgByDataGraphic,
  },
  storyTitlePrefix:
    figmaExportProjectConfig.addon.storyTitlePrefix === false
      ? false
      : [...figmaExportProjectConfig.addon.storyTitlePrefix],
  visualComments: figmaExportProjectConfig.review.visualComments,
} satisfies FigmaExportAddonOptions;

const componentSpecModules = import.meta.glob<string>(
  "../design-system/components/*.md",
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
);

const figmaDesignSystemFileUrl =
  figmaExportProjectConfig.source.designSystemFileUrlFallback;

// The addon's preview entry, loaded from the addons list in main.ts, applies
// review through its host decorator. Because the addon is listed before the
// Prototype Inspector preset, review and visual comments also follow the
// Inspector's UI Flow, Docs, Components and Data modes.
configureFigmaExportReview(
  figmaExportOptions,
  {
    apiPath: figmaExportProjectConfig.review.apiPath,
    enabled: figmaExportProjectConfig.review.enabled,
    getFigmaSourceUrl: (context, componentTitle) =>
      getFigmaSourceUrl(
        context.parameters as Record<string, unknown> | undefined,
        componentTitle,
        {
          componentSpecModules,
          designSystemFileUrl: figmaDesignSystemFileUrl,
          nodeOverrides: figmaExportProjectConfig.source.nodeOverrides,
        },
      ),
  },
);

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const selectedBackground = context.globals.backgrounds;
      const selectedTheme =
        typeof selectedBackground === "string"
          ? selectedBackground
          : selectedBackground?.value;
      const storybookTheme = selectedTheme === "light" ? "light" : "dark";

      document.documentElement.dataset[
        storybookTemplateProjectConfig.storybook.themeDataAttribute
      ] = storybookTheme;
      document.body.dataset[
        storybookTemplateProjectConfig.storybook.themeDataAttribute
      ] = storybookTheme;

      return Story();
    },
  ],
  globalTypes: {
    ...createFigmaExportGlobalTypes(figmaExportOptions),
  },
  initialGlobals: {
    backgrounds: {
      value: "dark",
      grid: false,
    },
    ...createFigmaExportInitialGlobals(figmaExportOptions),
  },
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "dark",
      options: backgroundThemeOptions,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: [
          "Governance",
          ["Storybook Architecture", "Component Catalog"],
          "Foundations",
          "Components",
          ["Examples"],
          "Pages",
          ["Prototypes"],
        ],
      },
    },
  },
};

export default preview;
