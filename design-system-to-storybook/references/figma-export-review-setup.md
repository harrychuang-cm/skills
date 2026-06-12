# Figma Export Review Setup

Use this reference when the Figma export toolbar appears but the review overlay or Open source action is missing.

Also use this reference before wiring `.storybook/main.*` or `.storybook/preview.*` for the bundled Figma export addon.

The addon has two preview UIs:

- `createFigmaExportDecorator`: shows the export overlay for copying JSON or plugin-console code.
- `createFigmaExportReviewDecorator`: wraps the export overlay and also shows the review overlay with the Open source action.

For this skill, use `createFigmaExportReviewDecorator` by default. Do not configure only `createFigmaExportDecorator` unless the user explicitly opts out of review/Open source.

## Installer And Config

Install the bundled addon with:

```sh
node <skill-root>/scripts/install_figma_export_addon.mjs <product-repo-root>
```

The installer:

- copies `assets/figma-export-addon/` into `<product-repo-root>/.storybook/vendor/figma-export-addon/`
- detects `npm`, `pnpm`, `yarn`, or `bun`
- installs `file:.storybook/vendor/figma-export-addon`
- installs `@storybook/icons@^1.0.0` only when the target package does not already declare `@storybook/icons`

Generate config before editing Storybook files:

```sh
node <skill-root>/scripts/generate_figma_export_config.mjs <design-system-package-root> --product-root <product-repo-root> --write
```

Default output is `<product-repo-root>/.storybook/figma-export.config.ts`. Keep project-specific Figma URLs, node IDs, class prefixes, theme globals, local graphics, token imports, review API settings, and source fallbacks in `.storybook/figma-export.config.ts`, `.storybook/preview.*`, or product code. The bundled addon should stay generic.

The generated config covers:

- `componentClassPrefixes` and `tokenPrefix`, inferred from token CSS variables such as `--cm-ref-*`, `--cm-sys-*`, and `--cm-comp-*`
- `storyTitlePrefix`, inferred from existing story titles when possible
- `absoluteFidelityComponents`, inferred from page/screen/composite/product-pattern entries and graphic or typographic lockups that need tighter visual parity
- review API path, plugin name, and status JSON path
- source fallback values, such as design-system Figma file URL and per-component node overrides from `STORYBOOK_SOURCE_TRACE.md`

## Configuration Rules

1. Add `"@harrychuang/storybook-addon-figma-export"` to `.storybook/main.*` `addons`, preserving existing addons.
2. Import `figmaExportProjectConfig` from `.storybook/figma-export.config.ts` and build `figmaExportOptions` from that config.
3. Merge `createFigmaExportReviewDecorator`, `globalTypes`, and `initialGlobals` into the existing preview export. Do not overwrite existing decorators or globals.
4. Use plain `createFigmaExportDecorator` only if the user explicitly opts out of review/Open source.
5. Set `tokenPrefix` only when the CSS token prefix is explicit or auto-detection would be ambiguous.
6. Keep `tokenLayers` aligned to `ref`, `sys`, and `comp` unless the extraction uses different segment names.
7. Set `storyTitlePrefix` to `false` when the project has no established story namespace; otherwise include every relevant namespace such as `Components/`, `Pages/`, and `Foundations/`.
8. Set `componentClassPrefixes` from component CSS class prefixes when available.
9. Configure review/Open source using bundled addon helpers instead of copying a product-specific panel.
10. Remember that the review overlay and Open source action render only when the Storybook `figmaExport` toolbar global is toggled on.

## Why The Review Overlay Is Missing

Common causes:

- `.storybook/preview.*` imports only `createFigmaExportDecorator`, not `createFigmaExportReviewDecorator`.
- `.storybook/preview.*` does not import `@harrychuang/storybook-addon-figma-export/review.css`.
- Storybook toolbar global `figmaExport` is still `off`; the review overlay renders only after the toolbar is toggled on.
- `figmaExportOptions.storyTitlePrefix` excludes the current story title. Use `false` to include all stories, or include every namespace such as `Components/`, `Pages/`, and `Foundations/`.
- `.storybook/main.*` does not include `"@harrychuang/storybook-addon-figma-export"` in `addons`, so the toolbar control is missing.
- `.storybook/main.*` does not mount `createFigmaReviewStatusPlugin`, so the overlay may show a save/load error after it renders.

## Why Open Source Is Missing

Common causes:

- The story has no `parameters.figmaSourceUrl`, `parameters.figma.url`, or `parameters.design.url`.
- The preview fallback callback does not call `getFigmaSourceUrl` from `@harrychuang/storybook-addon-figma-export/source`.
- `designSystemFileUrlFallback` from `.storybook/figma-export.config.ts` was passed without mapping it to `designSystemFileUrl`.
- `nodeOverrides` keys do not match the component slug derived from the Storybook title after `storyTitlePrefix` is removed.

## Preview Wiring

In `.storybook/preview.*`, prefer this shape:

```ts
import {
  createFigmaExportGlobalTypes,
  createFigmaExportInitialGlobals,
  type FigmaExportAddonOptions,
} from "@harrychuang/storybook-addon-figma-export";
import { createFigmaExportReviewDecorator } from "@harrychuang/storybook-addon-figma-export/review";
import { getFigmaSourceUrl } from "@harrychuang/storybook-addon-figma-export/source";
import "@harrychuang/storybook-addon-figma-export/styles.css";
import "@harrychuang/storybook-addon-figma-export/review.css";

import { figmaExportProjectConfig } from "./figma-export.config";

const figmaExportOptions: FigmaExportAddonOptions = figmaExportProjectConfig.addon;

export const decorators = [
  createFigmaExportReviewDecorator(figmaExportOptions, {
    apiPath: figmaExportProjectConfig.review.apiPath,
    enabled: figmaExportProjectConfig.review.enabled,
    getFigmaSourceUrl: (context, componentTitle) =>
      getFigmaSourceUrl(context.parameters, componentTitle, {
        componentSpecModules,
        designSystemFileUrl: figmaExportProjectConfig.source.designSystemFileUrlFallback,
        nodeOverrides: figmaExportProjectConfig.source.nodeOverrides,
      }),
  }),
];

export const globalTypes = {
  ...createFigmaExportGlobalTypes(figmaExportOptions),
};

export const initialGlobals = {
  ...createFigmaExportInitialGlobals(figmaExportOptions),
};
```

Preserve existing decorators, globals, and initial globals when merging this into a real project.

## Main Wiring

In `.storybook/main.*`, preserve existing config and add:

```ts
import { createFigmaReviewStatusPlugin } from "@harrychuang/storybook-addon-figma-export/review-server";
import { figmaExportProjectConfig } from "./figma-export.config";

export default {
  addons: [
    "@harrychuang/storybook-addon-figma-export",
  ],
  async viteFinal(config) {
    config.plugins = [
      ...(config.plugins ?? []),
      createFigmaReviewStatusPlugin({
        apiPath: figmaExportProjectConfig.review.apiPath,
        filePath: figmaExportProjectConfig.review.statusFilePath,
        name: figmaExportProjectConfig.review.pluginName,
      }),
    ];
    return config;
  },
};
```

For non-Vite Storybook builders, keep the preview decorator but record review-status persistence as blocked unless the project already has a middleware hook equivalent.
