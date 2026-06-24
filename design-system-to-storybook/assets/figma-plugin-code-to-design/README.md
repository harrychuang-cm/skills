# Storybook Code To Design

Figma development plugin for importing Storybook Code To Design JSON exports. The plugin parses JSON only; it does not evaluate pasted JavaScript.

Version: `1.1.6`

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

1. In Storybook, open a `Components/*` story, for example `Components/Valuation Label`.
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

1. Finding collections named `ref`, `sys`, and `comp`.
2. Looking for an existing variable in that collection by plugin data key `cmCssToken`.
3. Falling back to `variable.name`.
4. Creating a variable only when neither lookup finds one.

If an existing variable has the same token identity but a different Figma variable type, the import stops with an error. Alias tokens are written as Figma `VARIABLE_ALIAS` values, so `comp -> sys -> ref` chains are preserved instead of flattened to raw values.
