# @harrychuang/storybook-addon-figma-export

Storybook 10 addon: export a rendered story into a Figma import payload (payload version 2). Works with any Storybook renderer — React, Vue, Svelte, Angular, or Web Components — because the preview decorator is a pass-through (it returns the story result unchanged) and the export overlay is plain DOM mounted on document.body; the preview bundle imports no react. Exports are scoped to the `storybook-root` preview element (falling back to document.body with a warning). The optional review panel (`/review` entry) remains React-only. Prefers a three-layer CSS token model (`ref`, `sys`, `comp`); projects without layered tokens still export with an empty variable set.

## Visual fidelity capture

Beyond layout, tokens, and SVG, the exporter captures:

- **Shadows** — `box-shadow` (including `inset`) and `text-shadow` export as `styles.effects` (`DROP_SHADOW` / `INNER_SHADOW`).
- **Per-corner radius** — asymmetric `border-radius` exports as `styles.radiusCorners`; percentage radii approximate to the shorter box side.
- **Raster images** — non-SVG `img` and `canvas` elements embed as PNG base64 (`imageBase64`, longest side capped at 2048px) with `imageScaleMode` mapped from `object-fit`.
- **Modern colors** — `oklch()`, `lab()`, `color()`, `hsl()`, and named colors normalize to hex/rgba through the browser color engine (clamped to sRGB), for both computed styles and token raw values.
- **Text styles** — `text-transform` is baked into the exported string, rendered line breaks are preserved (`<br>`, `white-space: pre*`), and `letter-spacing`, `text-decoration` (underline/line-through), and `font-style: italic` export as text fields.
- **Measured auto layout** — flex containers derive item spacing and effective padding from the children's real bounding rects, so margin-driven spacing, `space-around`/`space-evenly`, `order`, and `row-reverse`/`column-reverse` visual order survive. Non-uniform spacing (that `space-between` cannot explain) falls back to pixel-true absolute layout.
- **Flex wrap** — wrapped flex containers export `layoutWrap: "WRAP"` with measured in-line `gap` and `counterAxisSpacing`.
- **Binding correctness** — token bindings skip rules inside non-matching media queries and rank matching declarations by CSS specificity (inline styles highest).

Known limitations (by design): browser/Figma font metrics may wrap text differently; `transform: rotate/scale`, z-index restacking, masks, and filters are not captured; wide-gamut colors clamp to sRGB; raster embeds cap at 2048px.

## Shadow DOM and token-less projects

- Open shadow roots export in place of the host's light children (slots expand to their flattened assigned elements). Component styles injected through `adoptedStyleSheets` — document-level or per shadow root — participate in token binding. Closed shadow roots stay unexported.
- Projects without `--<prefix>-<layer>-*` tokens degrade gracefully: the export completes with `payload.tokens` empty and no variable bindings instead of throwing.

## Local bridge (batch import into Figma)

Configure `payloadSyncUrl` in the addon options to push every successful export into the review-server payload store:

```ts
const figmaExportOptions = {
  payloadSyncUrl: "/__figma-export/payloads",
} satisfies FigmaExportAddonOptions;
```

`createFigmaReviewStatusPlugin` (see the review-server section) now also serves the store endpoints — POST/list/GET under `/__figma-export/payloads` with permissive CORS, persisted to `design-system/figma-export-payloads/` (`payloadDir` option). The paired Figma plugin's "Load from Storybook" section fetches that list and imports selected payloads without clipboard round-trips.

## Verification suite

Run from the addon root (after `npm run build` for the store test):

```bash
node test/run-export-fixture.mjs      # capture features incl. shadow DOM case
node test/run-overlay-fixture.mjs     # renderer-agnostic overlay + token-less + auto-sync
node test/run-payload-store-test.mjs  # bridge store endpoints (CORS, sanitize, round trip)
```

The browser runners bundle the sources, render the fixtures in headless Chromium, and assert the spec scenarios; payloads land in `test/.last-fixture-payload.json`.

## Install

This copy is bundled by the `design-system-to-storybook` skill. During normal
skill usage, do not install it from GitHub. Run the skill installer from the
skill root instead:

```bash
node scripts/install_figma_export_addon.mjs <product-repo-root>
```

The installer copies this package into
`.storybook/vendor/figma-export-addon/` in the target project and installs it
as `file:.storybook/vendor/figma-export-addon`.

Requires `storybook@^10`, `react`, and `@storybook/icons` in the host project.

## Setup

### 1. Register the addon (manager toolbar)

`.storybook/main.ts`:

```ts
import type { StorybookConfig } from "storybook";

const config: StorybookConfig = {
  addons: ["@harrychuang/storybook-addon-figma-export"],
  // ...framework, stories, etc.
};

export default config;
```

This loads the addon preset and registers the Figma export toolbar toggle.
When the toolbar toggle is on, the exporter overlay provides `Copy JSON`,
`Plugin Console Script`, and an icon-only `Copy design to Figma` action. The
Figma copy action writes an SVG design representation to the clipboard so it can
be pasted directly into Figma for quick visual review.

### 2. Wire preview (decorator + globals)

`.storybook/preview.ts`:

```ts
import type { Preview } from "storybook";

import {
  createFigmaExportDecorator,
  createFigmaExportGlobalTypes,
  createFigmaExportInitialGlobals,
} from "@harrychuang/storybook-addon-figma-export/preview";
import type { FigmaExportAddonOptions } from "@harrychuang/storybook-addon-figma-export";
import "@harrychuang/storybook-addon-figma-export/styles.css";

const figmaExportOptions = {
  componentClassPrefixes: ["your-prefix-"],
  storyTitlePrefix: false,
} satisfies FigmaExportAddonOptions;

const preview: Preview = {
  decorators: [createFigmaExportDecorator(figmaExportOptions)],
  globalTypes: {
    ...createFigmaExportGlobalTypes(figmaExportOptions),
  },
  initialGlobals: {
    ...createFigmaExportInitialGlobals(figmaExportOptions),
  },
};

export default preview;
```

Replace `your-prefix-` with the class prefix used by your component library, or use an empty array when you want the exporter to derive layer names without a project prefix. `storyTitlePrefix: false` keeps the addon available for every story; set it to a string or string array only when your project wants to filter exports.

Adjust `figmaExportOptions` for your design tokens and story naming.

### Export review panel

Use the bundled review helpers when you want Storybook to track each story's
Figma source URL and export/import review state. The
`design-system-to-storybook` skill wires this review decorator by default so the
Open source action is available when source URLs can be resolved.

`.storybook/main.ts`:

```ts
import type { StorybookConfig } from "storybook";
import { createFigmaReviewStatusPlugin } from "@harrychuang/storybook-addon-figma-export/review-server";

const config: StorybookConfig = {
  // ...stories, addons, framework
  async viteFinal(config) {
    return {
      ...config,
      plugins: [
        ...(config.plugins ?? []),
        createFigmaReviewStatusPlugin({
          filePath: "design-system/figma-export-review-status.json",
        }),
      ],
    };
  },
};

export default config;
```

`.storybook/preview.ts`:

```ts
import type { Preview } from "storybook";
import {
  createFigmaExportGlobalTypes,
  createFigmaExportInitialGlobals,
} from "@harrychuang/storybook-addon-figma-export/preview";
import { createFigmaExportReviewDecorator } from "@harrychuang/storybook-addon-figma-export/review";
import { getFigmaSourceUrl } from "@harrychuang/storybook-addon-figma-export/source";
import "@harrychuang/storybook-addon-figma-export/styles.css";

const preview: Preview = {
  decorators: [
    createFigmaExportReviewDecorator(figmaExportOptions, {
      getFigmaSourceUrl(context) {
        return getFigmaSourceUrl(context.parameters, context.title ?? "", {
          componentSpecModules,
          designSystemFileUrl,
          nodeOverrides,
        });
      },
    }),
  ],
  globalTypes: {
    ...createFigmaExportGlobalTypes(figmaExportOptions),
  },
  initialGlobals: {
    ...createFigmaExportInitialGlobals(figmaExportOptions),
  },
};
```

The default source resolver reads `parameters.figmaSourceUrl`,
`parameters.figma.url`, or `parameters.design.url`. Use `getFigmaSourceUrl`
for project-specific fallbacks, such as parsing local design-system Markdown.
The fallback inputs (`componentSpecModules`, `designSystemFileUrl`, and
`nodeOverrides`) should come from project-local Storybook config, not from the
addon package.

### Manual manager registration (optional)

If you do not use the preset entry in `addons`, register the tool yourself in `.storybook/manager.ts`:

```ts
import { registerFigmaExportTool } from "@harrychuang/storybook-addon-figma-export/manager";

registerFigmaExportTool();
```

## Token prefix detection

By default, the exporter auto-detects the token prefix from CSS custom properties that match the configured token layer segments:

```txt
--{prefix}-ref-*
--{prefix}-sys-*
--{prefix}-comp-*
```

Projects do not need all three default layers to export. The detector chooses the prefix with the broadest layer coverage and then the most matching tokens. If auto-detection fails, set `tokenPrefix` (for example `"your-prefix"`), and use `tokenLayers` when your layer segment names are not `ref`, `sys`, and `comp`.

## Options

| Option | Description |
| --- | --- |
| `tokenPrefix` | Explicit token prefix |
| `tokenLayers` | Custom segment names for `ref`, `sys`, `comp` |
| `collections` | Figma variable collection names per layer |
| `pluginDataKey` | Figma variable plugin data key for duplicate detection |
| `globalName` | Storybook global for the toolbar switch |
| `storyTitlePrefix` | Story title prefix filter, or `false` for all stories |
| `componentClassPrefixes` | Class prefixes used when naming exported layers |
| `absoluteFidelityComponents` | Components exported with absolute layout |
| `embeddedSvgByDataGraphic` | Inline SVG map keyed by `data-graphic` |

## API exports

- `@harrychuang/storybook-addon-figma-export` — types and utilities
- `@harrychuang/storybook-addon-figma-export/preview` — decorator and globals helpers
- `@harrychuang/storybook-addon-figma-export/preset` — Storybook preset (used automatically via `addons`)
- `@harrychuang/storybook-addon-figma-export/manager` — toolbar registration (side effect)
- `@harrychuang/storybook-addon-figma-export/review` — optional export review panel and decorator
- `@harrychuang/storybook-addon-figma-export/review-server` — optional Vite middleware for persisted review state
- `@harrychuang/storybook-addon-figma-export/source` — source URL resolver helpers for story parameters and documented Figma node fallbacks
- `@harrychuang/storybook-addon-figma-export/styles.css` — exporter and review overlay styles
- `@harrychuang/storybook-addon-figma-export/review.css` — optional direct export review panel styles
