# Storybook Integration

Use this reference when creating `<FeaturePrototype>.stories.tsx` and `<featurePrototypeMeta>.ts`.

## Story Requirements

The default story should:

- Use `layout: "fullscreen"` when rendering a full product surface.
- Render a clickable prototype, not a static screenshot.
- Attach the meta object to `parameters.prototype`.
- Support `prototypeFlowPreview=true` for compact iframe preview styling.
- Support `prototypeRoute=<route-id>` so UI Flow route cards can render the correct route.
- Add `data-prototype-route-preview="true"` to the route preview shell for template-compatible iframe measurement.
- Keep `data-prototype-root="true"` on the prototype root for backward-compatible viewers.

The Static Flow story should:

- Export `StaticFlow` from `<FeaturePrototypeFlowExport>.stories.tsx`.
- Use the same Storybook title and `parameters.prototype` object as the interactive story.
- Use `layout: "fullscreen"`.
- Render route cards and flow-only nodes from `flow.routes`, `flow.nodes`, and key `flow.transitions`.
- Read saved layout through `../prototypeFlowLayout` so positions edited in the Prototype Inspector match the export artifact.

## Metadata Shape

Expose a meta object with:

- `id`
- `title`
- `description`
- `owner`
- `status`
- `docs`
- `flow`
- `data`
- `figmaExport`
- `components` (optional; see Component Composition Metadata below)

The `docs` object should import raw markdown from:

- `docs/PRD.md`
- `docs/UI_SPEC.md`
- `docs/FLOW_SPEC.md`
- `docs/DATA_SPEC.md`
- `docs/PRODUCTION_HANDOFF.md`
- `docs/IMPLEMENTATION_GUIDE.md`
- `docs/ACCEPTANCE.md`

Use `productionHandoff` as the `docs` key for `docs/PRODUCTION_HANDOFF.md`.

The `flow` object should expose:

- `routes`
- `nodes`
- `transitions`

The `data` object should summarize:

- fixture inventory
- route data requirements
- API replacement points
- source ownership when known

The `figmaExport` object should expose:

- `flowStoryId`: the Storybook id for the `StaticFlow` export, for example `pages-prototypes-example-prototype--static-flow`.

`PRODUCTION_HANDOFF.md` should be exposed with the other docs so reviewers can inspect frontend implementation guidance without leaving Storybook.

## Component Composition Metadata

`components` is an OPTIONAL top-level meta key — a sibling of `flow`, `data`, `docs`, and `figmaExport` — that records which components compose each route. This section is the single source for the contract; other references link here instead of restating it.

```ts
components: {
  routes: [
    {
      route: 'route-id',              // MUST be an existing flow route id
      components: [
        {
          name: 'BottomSheetCell',    // local import binding / display name (PascalCase)
          origin: 'shared',           // 'shared' | 'local' | 'promoted'
          importPath: 'src/components/bottom-sheet-cell', // shared/promoted: package or repo path; local: prototype-relative file
          storyId: 'components-lists-bottom-sheet-cell--default', // optional; enables click-through
          storyTitle: 'Components/Lists/Bottom Sheet Cell',       // optional; display + derivation evidence
          note: 'variant / prop usage notes',                     // optional
        },
      ],
    },
  ],
}
```

Rules:

- The key is optional. Every consumer must tolerate its absence (older prototypes) and ignore unknown extra fields.
- `origin` semantics: `shared` = the component existed before this prototype (a UI_SPEC Component Map entry); `local` = created for this prototype (a UI_SPEC Component Gaps entry or prototype-local file, usually with no story); `promoted` = was a gap, then promoted into the hub's shared component library in the promote workflow step (has a hub path and story id).
- The authoring source of truth stays `docs/UI_SPEC.md` Component Map / Component Gaps. `meta.components` is the machine-readable echo: author it in the compose step, and update the affected entry in the promote step in the same motion as the doc move (`origin` `local` → `promoted`, plus the new `storyId`).
- Resolve each `storyId` through the resolution chain in `references/component-discovery.md`; never guess an id silently. When no id resolves (typical for `local`), omit `storyId` — the inspector shows the source path without a link.
- Docs links are derived at runtime, never stored: strip the trailing `--<storyName>` segment from `storyId` and append `--docs` (`?path=/docs/<base>--docs`). The docs link is only a secondary link.

Both the interactive story and the `StaticFlow` story share one meta object, so composition data surfaces in both automatically; both must tolerate the key being absent.

## UI Flow Viewer Boundary

This skill creates the metadata contract and includes a bundled Prototype Inspector runtime.

If the target project has no prototype inspector:

1. Still generate `parameters.prototype`.
2. Install the bundled runtime only when the user asks for Storybook UI Flow review:
   `node <skill-root>/scripts/install_prototype_inspector.mjs --project-root <repo-root>`.
3. Do not replace an existing `.storybook/prototype-inspector` folder or `src/pages/prototypes/prototypeFlowLayout.ts` unless the user approves `--force`. Re-running with `--force` is also how an existing install picks up bundled addon updates.
4. The inspector CSS defines a `--pi-*` token layer: each token reads the `--sbt-*` design token when the project defines it and otherwise falls back to built-in neutral values (with a `prefers-color-scheme: dark` fallback set), so the panels render correctly in any React Storybook project. When the project uses another token prefix, pass `--token-prefix <prefix>` (for example `--token-prefix md`) to bind the layer to the project's tokens, or redefine `--pi-*` tokens on `.prototype-inspector` in a stylesheet loaded after the addon CSS.

If the target project already has a prototype inspector, match its parameter name, preview-mode query conventions, route preview selector, and saved layout helper. For repos created from `design-system-to-storybook/storybook-template`, keep the existing `prototypeFlowLayout.ts` schema and Static Flow pattern.

## Bundled Prototype Inspector

The bundled addon reads `parameters.prototype` and provides a Storybook toolbar with:

- `Story`: the original story.
- `Docs`: PRD, UI Spec, Flow Spec, Data Spec, Frontend Handoff, Implementation Guide, and Acceptance markdown.
- `UI Flow`: route cards, flow-only nodes, key transition lines, zoom, drag, pan, layout import, and layout export.
- `Components`: per-route composition from `meta.components` — component name, origin badge (`shared` / `new` / `promoted`), story title, import path, and notes. When a `storyId` is present, the row opens `?path=/story/<storyId>` in a new tab (the same URL mechanism as `Open Static Flow`), with a secondary link to the derived `--docs` path; without a `storyId`, the row shows the source path with no link. A prototype without `meta.components` gets a friendly empty state, not an error.
- `Data`: fixture summary, API replacement points, source ownership, route data map, state rules, and raw metadata.
- `Open Static Flow`: when `parameters.prototype.figmaExport.flowStoryId` is present, open the Figma-ready static flow story that uses the same saved layout.

UI Flow route cards also carry a compact component strip/badge sourced from the same `meta.components` data. The `Components` mode and route-card strip ship with the bundled addon: an existing install picks them up by re-running `install_prototype_inspector.mjs --force`.
