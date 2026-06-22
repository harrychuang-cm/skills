# SBFX JSON Importer

Local Figma development plugin for importing `.sbfx.json` files exported from
the Storybook Figma export panel.

The plugin is project-neutral. It imports Storybook Figma export payloads by
payload metadata, including token collections, plugin data keys, component
metadata, page artifacts, and exported node styles. It does not assume a
specific project prefix or domain.

## Usage

1. In Figma, open **Plugins > Development > Import plugin from manifest...**.
2. Select `figma/storybook-code-to-design/manifest.json`.
3. Export a story from Storybook with **Figma export > Download JSON**.
4. Run **SBFX JSON Importer** and choose the downloaded `.sbfx.json` file.

The importer validates payload version `2`, previews story, token, node, and
component counts before import, upserts the exported CSS-token variables,
creates editable Figma nodes, and scrolls to the imported root.

## Maintenance

`main.js` is generated from `@harrychuang/storybook-addon-figma-export/plugin-code`.
Do not edit it directly.

```sh
npm run build:figma-plugin
npm run check:figma-plugin
```

`npm run check` includes `check:figma-plugin`, so template verification fails if
the checked-in plugin importer drifts from the vendored Storybook addon code.
