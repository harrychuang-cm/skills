import { resolve } from "node:path";
import { createFigmaReviewStatusPlugin } from "@harrychuang/storybook-addon-figma-export/review-server";
import type { StorybookConfig } from "@storybook/react-vite";

import { storybookTemplateProjectConfig } from "./project.config.ts";

const reviewStatusApiPath =
  storybookTemplateProjectConfig.figmaExport.review.apiPath;
const reviewStatusFilePath = resolve(
  process.cwd(),
  storybookTemplateProjectConfig.figmaExport.review.statusFilePath,
);
const prototypeInspectorAddonPreset = resolve(
  process.cwd(),
  ".storybook/prototype-inspector/preset.js",
);

const config: StorybookConfig = {
  stories: storybookTemplateProjectConfig.storybook.stories,
  addons: [
    "@storybook/addon-docs",
    "@harrychuang/storybook-addon-figma-export",
    prototypeInspectorAddonPreset,
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: storybookTemplateProjectConfig.storybook.staticDirs,
  async viteFinal(config) {
    const plugins = [...(config.plugins ?? [])];
    if (storybookTemplateProjectConfig.figmaExport.review.enabled) {
      plugins.push(
        createFigmaReviewStatusPlugin({
          apiPath: reviewStatusApiPath,
          filePath: reviewStatusFilePath,
          name: storybookTemplateProjectConfig.figmaExport.review.pluginName,
        }),
      );
    }

    return {
      ...config,
      plugins,
    };
  },
};

export default config;
