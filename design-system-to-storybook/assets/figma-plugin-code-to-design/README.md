# Storybook Code To Design

Figma development plugin for importing Storybook Code To Design JSON exports. The plugin parses JSON only; it does not evaluate pasted JavaScript.

Version: `1.2.0`

## Fidelity fields (payload v2, all optional)

Payloads produced by the current exporter may carry additional optional fields; older payloads without them import exactly as before:

- `styles.effects` → Figma `DROP_SHADOW` / `INNER_SHADOW` effects on frames, text, and images
- `styles.radiusCorners` → per-corner radii (`topLeftRadius` etc.)
- `styles.layoutWrap` + `styles.counterAxisSpacing` → wrapped auto layout
- `styles.letterSpacing` (px), `styles.textDecoration` (`UNDERLINE`/`STRIKETHROUGH`), `styles.fontStyle: "italic"` → text styling; font style resolution covers weights 100–900 with italic variants and upright fallback
- `imageBase64` + `imageMimeType` + `styles.imageScaleMode` → raster fills via `figma.createImage` (decode failures warn and keep an empty frame)
- `colorFromCss` also accepts 4/8-digit hex, `hsl()/hsla()`, and `rgb(r g b / a)` syntax; `linear-gradient` supports arbitrary angles

Invalid types on these fields fail `parsePayload` with an error naming the node path and field.

## Verify pure helpers under Node

```sh
npm run build
node test/verify-pure-functions.cjs
```

The script stubs the `figma` global, loads `code.js`, and asserts color parsing, gradient transforms, font style candidates, and payload validation compatibility.

## Build

```sh
npm install
npm run build
```

`npm run build` compiles `code.ts` to `code.js`, which is the `main` entry in `manifest.json`.

## Load In Figma Desktop

1. Open Figma Desktop.
2. Go to `Plugins` -> `Development` -> `Import plugin from manifest...`.
3. Select this file: `manifest.json`.
4. Run `Plugins` -> `Development` -> `Storybook Code To Design`.

## Copy JSON From Storybook

1. In Storybook, open any story included by your Figma export addon options.
2. Enable the `Figma export` toolbar item.
3. Click `Copy JSON`. This is the primary importer flow.
4. `Copy Console Script` is kept only as a legacy fallback for plugin-console experiments.

The JSON payload includes:

- `version`
- `generatedAt`
- `storyId`
- `storyName`
- `componentTitle`
- `tokens`
- `root`

## Import Into Figma

1. Run the development plugin in a Figma design file.
2. Paste the Storybook JSON into the textarea.
3. Click `Import`.
4. Review the status panel for created/reused variable counts and any binding warnings.

## Variable Reuse Rules

The importer avoids duplicate variables by:

1. Finding collections from the payload `tokenSystem.collections`, falling back to `ref`, `sys`, and `comp`.
2. Looking for an existing variable in that collection by the payload `tokenSystem.pluginDataKey`, falling back to `storybookCssToken`.
3. Falling back to `variable.name`.
4. Creating a variable only when neither lookup finds one.

The importer also reads and writes the legacy `cmCssToken` plugin data key so older files continue to deduplicate correctly. CSS token names only need to be valid CSS custom property names beginning with `--`; no project-specific prefix is required.

If an existing variable has the same token identity but a different Figma variable type, the import stops with an error. Alias tokens are written as Figma `VARIABLE_ALIAS` values, so `comp -> sys -> ref` chains are preserved instead of flattened to raw values.
