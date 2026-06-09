---
name: design-system-to-storybook
description: >-
  Build or update token-backed Storybook foundations, shared UI components, and
  stories from an extracted design-system package. Use after
  design-system-extractor, or when Codex must read design-system Markdown and
  token files, automatically trace original design sources such as Figma
  URLs/nodes, UI images, rendered routes, and frontend folders, map component
  specs into a product repo, create or update Storybook docs, plan large
  component batches, and verify implementation with the bundled Figma export
  addon without bypassing tokens.
---

# Design System to Storybook

Use this skill to turn an already extracted design-system package into a product repo's Storybook implementation. The design-system documentation and tokens are the normative source of truth. Original Figma nodes, UI images, rendered routes, and frontend folders recorded by `design-system-extractor` are supporting evidence for implementation details, Storybook parity, and visual verification.

This is a downstream implementation skill. Do not re-extract a design system here. If the required design-system docs, token architecture, source evidence, or component specs are missing, ask to run or continue `design-system-extractor` first.

## Expected Inputs

- **Design-system package:** usually contains `design-system/`, `tokens/`, and generated docs under `docs/design-system/`.
- **Product repo:** the codebase where Storybook, shared UI components, and token imports should be created or updated.
- **Implementation scope:** specific components, all extracted components, foundations only, or a product-owned component library.
- **Runtime constraints:** framework, package manager, styling system, existing Storybook setup, and test commands.
- **Batch budget:** optional number of components to implement in the current pass.
- **Extractor source evidence:** `DESIGN_EVIDENCE_MAP.md`, `SESSION_STATE.md`, component spec `Evidence` tables, component-review image links, and any Figma URLs/nodes, UI screenshots, rendered routes, or frontend folders listed there.
- **Bundled Figma export addon:** enabled by default for compatible React Storybook 10 projects.

## First Actions

1. Locate the design-system package root and the product repo root. They may be the same folder.
2. Read `design-system/SESSION_STATE.md`, `DESIGN_EVIDENCE_MAP.md`, `TOKEN_ARCHITECTURE.md`, `COMPONENT_INVENTORY.md`, `DESIGN_ELEMENTS.md`, and relevant `design-system/components/*.md`.
3. Run the source trace script to resolve extractor sources before implementation: `node <skill-root>/scripts/trace_sources.mjs <design-system-package-root> --write`.
4. Inspect referenced design sources for the selected scope: use Figma MCP for Figma nodes, inspect local UI images/crops, and inspect referenced frontend folders/routes when present.
5. Inspect product conventions before editing: component folders, story format, token files, theme providers, Storybook config, build scripts, lint/typecheck scripts, and package manager.
6. Record an implementation map before code changes. Prefer `design-system/STORYBOOK_IMPLEMENTATION_MAP.md` when the design-system package lives in the product repo; otherwise use `docs/design-system/storybook-implementation.md`.
7. Install the bundled Figma export addon and configure it when the product has a compatible React Storybook 10 setup.
8. If the component inventory has more than 8 implementable items, create or update a component queue before reading every spec or editing code.
9. If the product has explicit design-system governance instructions, follow them. Otherwise apply the gates in this skill.

## Scope Modes

Choose the smallest mode that satisfies the user request:

- **Foundations:** import or mirror tokens and add Storybook docs for color, typography, spacing, radius, elevation, and motion.
- **Component pass:** implement selected `extracted` or `planned` component specs as shared components with stories.
- **Library pass:** build or update a reusable component package from the full component inventory.
- **Batch pass:** implement one dependency-aligned group from a large component queue.
- **Adoption pass:** replace ad hoc product UI with documented shared components after the Storybook catalog exists.

Do not compose product screens before the required shared components and stories exist unless the user explicitly asks for a product route first.

## Workflow

### 1. Package Readiness

Confirm the extracted package is usable:

| Required file | Purpose |
|---|---|
| `design-system/SESSION_STATE.md` | extraction status, known gaps, and recommended next step |
| `design-system/DESIGN_EVIDENCE_MAP.md` | source inventory, source fingerprints, and evidence IDs |
| `design-system/TOKEN_ARCHITECTURE.md` | token layers and naming rules |
| `tokens/tokens-ref.css` | raw reference values |
| `tokens/tokens-sys.css` | reusable semantic roles |
| `tokens/tokens-comp.css` | component-facing slots |
| `design-system/COMPONENT_INVENTORY.md` | component priority and status |
| `design-system/components/*.md` | anatomy, variants, states, accessibility, and token contracts |

If a required file is absent, continue only for the modes that still have enough evidence. For example, foundations can proceed without component specs, but component implementation cannot.

### 2. Source Trace And Design Source Discovery

Build a source trace before editing code:

```sh
node <skill-root>/scripts/trace_sources.mjs <design-system-package-root> --write
```

Default output is `design-system/STORYBOOK_SOURCE_TRACE.md`. Use it to connect component specs to original sources:

- **Figma URL or normalized node:** use Figma MCP to inspect the referenced node. Prefer `get_design_context` for component-level nodes, `get_metadata` for pages/structure, `get_variable_defs` for token variables, and `get_screenshot` for visual parity references. If only a page is known, use metadata to find the most relevant frame/component before implementing.
- **UI image or screenshot crop:** resolve the local path, inspect the actual bitmap, and use it as the visual reference for Storybook screenshot checks. Do not rely on alt text or filename alone.
- **Frontend folder or prototype source:** inspect the referenced code, Storybook entries, token files, rendered routes, and component API. Treat prototype code as migration evidence only when the user asks to migrate it; otherwise use it to understand behavior and states.
- **Rendered route:** run or inspect the route only if the product setup makes that cheap and safe. Record viewport, state, and command in the implementation map when used for verification.

Use the `Story Source URL Parameters` section from `STORYBOOK_SOURCE_TRACE.md` when creating or updating stories. Prefer Figma URLs and write them to `parameters.figmaSourceUrl`; use non-Figma web URLs only when they are the best available source and write them to `parameters.design.url`. Do not invent a URL from a local image path or normalized Figma fingerprint unless the design-system docs also provide the matching Figma file URL.

If the trace finds source IDs in component specs that cannot be resolved, mark the affected component `blocked` or `needs-extraction` in the queue before writing component code. If the trace finds Figma or image evidence for a component, do not skip that source unless the source is unavailable; record the reason.

Use original sources to clarify implementation details, not to silently override extracted design decisions. When Figma/image/frontend evidence contradicts the extracted tokens or component spec, stop and update the implementation map with the conflict; ask whether to revise the extraction or implement the documented spec.

### 3. Product Discovery

Find the local implementation pattern before adding files:

- Storybook config: `.storybook/`, `*.stories.*`, `*.mdx`, docs pages, decorators, preview styles.
- Components: `src/components/`, `components/`, `src/ui/`, `src/design-system/`, `packages/ui/`, or existing exports.
- Tokens and themes: CSS variables, token CSS imports, Tailwind config, theme objects, Sass variables, style dictionaries, or package-level token builds.
- Accessibility and tests: existing interaction tests, visual tests, a11y addons, Playwright, Vitest, Jest, Testing Library.
- i18n: locale files or message catalogs when stories or components need visible text.

Do not install Storybook or unrelated dependencies unless the user asked for Storybook setup or approves it after discovery. The bundled Figma export addon in the next section is the default dependency exception for compatible projects.

### 4. Figma Export Addon

Install and configure the bundled `@harrychuang/storybook-addon-figma-export` by default when all requirements are met:

- Storybook exists and is `^10`
- React is available in the host project
- package manager is detectable
- `.storybook/main.*` and `.storybook/preview.*` can be updated safely

The addon package is vendored in this skill at `assets/figma-export-addon/`, sourced from `harrychuang/storybook-addons#main:packages/figma-export`. Do not install it from GitHub during normal use.

Install it with the bundled installer:

```sh
node <skill-root>/scripts/install_figma_export_addon.mjs <product-repo-root>
```

The installer:

- copies `assets/figma-export-addon/` into `<product-repo-root>/.storybook/vendor/figma-export-addon/`
- detects `npm`, `pnpm`, `yarn`, or `bun`
- installs `file:.storybook/vendor/figma-export-addon`
- installs `@storybook/icons@^1.0.0` only when the target package does not already declare `@storybook/icons`

Use `--copy-only` only when you need to inspect or manually install the vendored package. If the bundled addon asset is missing or incomplete, mark `figma-export-addon` as `blocked`; do not fall back to GitHub unless the user explicitly asks to refresh the vendored asset.

If Storybook is missing, not version 10, or the project is not React-based, do not force the addon. Mark `figma-export-addon` as `blocked` in the implementation map with the reason and ask before installing or upgrading Storybook.

Configuration rules:

1. Add `"@harrychuang/storybook-addon-figma-export"` to `.storybook/main.*` `addons`, preserving existing addons.
2. In `.storybook/preview.*`, import:
   - `createFigmaExportDecorator`
   - `createFigmaExportGlobalTypes`
   - `createFigmaExportInitialGlobals`
   - `FigmaExportAddonOptions`
   - `@harrychuang/storybook-addon-figma-export/styles.css`
3. Merge the decorator, `globalTypes`, and `initialGlobals` into the existing preview export. Do not overwrite existing decorators or globals.
4. Infer `figmaExportOptions` from the extracted token architecture and Storybook titles:
   - set `tokenPrefix` only when the CSS token prefix is explicit or auto-detection would be ambiguous
   - keep `tokenLayers` aligned to `ref`, `sys`, and `comp` unless the extraction uses different segment names
   - set `storyTitlePrefix` to the project's component story namespace, usually `"Components/"`
   - set `componentClassPrefixes` from component CSS class prefixes when available
5. When the project needs export review/status tracking, use the bundled addon helpers instead of copying a product-specific panel:
   - `.storybook/main.*`: import `createFigmaReviewStatusPlugin` from `@harrychuang/storybook-addon-figma-export/review-server`
   - `.storybook/preview.*`: use `createFigmaExportReviewDecorator` from `@harrychuang/storybook-addon-figma-export/review`
   - import `@harrychuang/storybook-addon-figma-export/review.css`
   - pass a project-specific `getFigmaSourceUrl` callback only for local Markdown/Figma URL fallback logic
6. Record the copied vendor path, installed package spec, config files, options, and review helper usage in the implementation map.

### 5. Implementation Map

Before editing code, create or update the implementation map with:

| Design-system item | Source file | Product target | Decision | Status |
|---|---|---|---|---|
| token layer or component | extracted doc/token path | target token/component/story path | reuse, extend, create, defer | planned, done, blocked |

Also record:

- package manager and framework
- Storybook version or catalog alternative
- Figma export addon status and options
- bundled addon vendor path in the product repo
- source trace path and per-component source IDs
- original Figma nodes, local images, frontend folders, and rendered routes used for implementation
- token import strategy
- components reused from the product repo
- current batch, when using a queue
- open questions and blocked specs

### 6. Large Inventory Planning

Use this section when `COMPONENT_INVENTORY.md` contains more than 8 components, or when the user asks to build a full library.

Create or update `design-system/STORYBOOK_COMPONENT_QUEUE.md` when the design-system package lives in the product repo. Otherwise create `docs/design-system/storybook-component-queue.md`. Use `assets/storybook-component-queue-template.md` as the output shape when starting a new queue.

Plan before implementation:

1. Categorize components as foundations, primitives, form controls, navigation, data display, feedback, overlays, layout, composites, or product-specific patterns.
2. Build a dependency order: tokens first, primitives before composites, lower-level slots before containers, common variants before rare variants.
3. Rank by reuse, source confidence, implementation risk, token readiness, and whether an existing product component can be extended.
4. Mark blocked items explicitly: `needs-extraction`, `needs-source`, `needs-token`, `needs-api-decision`, `needs-existing-component-review`, or `out-of-scope`.
5. Pick the next batch from adjacent dependencies. Default to 3-5 simple components, 1-2 complex composites, or one cross-cutting foundation pass.
6. Read only the selected batch specs and their direct dependencies. Do not load every component spec into context unless generating or repairing the queue.
7. Finish token integration, component code, stories, and verification for the current batch before starting the next batch.

Each batch should produce a clean resumable state:

| Batch | Components | Dependencies | Design sources | Target files | Validation | Status |
|---|---|---|---|---|---|---|
| `B01` | component names | tokens/components needed first | source IDs, Figma nodes, images, or routes | planned product files | checks to run | queued/done/blocked |

### 7. Token Integration

Integrate tokens before components:

1. Reuse the product repo's existing token pipeline when present.
2. Preserve the extracted layer model unless the repo already has a stronger convention.
3. Keep inheritance intact: component tokens reference semantic tokens; semantic tokens reference primitive/reference tokens.
4. Avoid hardcoded visual values in components and stories when tokens exist.
5. Add Storybook foundation docs or MDX only after token imports render correctly.

If the product repo has no token system, ask whether to establish one before implementing components.

### 8. Storybook Foundations

Create or update foundations stories/docs for the token groups touched by this pass:

- colors: reference palettes, semantic roles, foreground/background pairings
- typography: font family, size, line-height, weight, display/body roles
- spacing and layout density
- radius and shape
- elevation, borders, opacity
- motion duration, easing, and reduced-motion behavior when specified

Use the project's existing docs style. If none exists, create the smallest useful Storybook docs page that displays token names, rendered examples, and usage notes.

### 9. Component Implementation

For each selected component spec:

1. Read the component spec and its referenced tokens.
2. Resolve its evidence IDs through `STORYBOOK_SOURCE_TRACE.md`.
3. Inspect the original source when available:
   - Figma node/page through Figma MCP, including screenshot when visual parity matters.
   - UI image/crop through local image inspection.
   - Frontend folder/prototype code for behavior, API shape, and existing implementation clues.
   - Rendered route/story for measured layout and states when runnable.
4. Search for an existing shared component with matching purpose, anatomy, behavior, and states.
5. Prefer reuse or extension over creating a new component.
6. Implement props, slots, variants, states, accessibility behavior, and responsive behavior from the spec.
7. Resolve the story source URL from `STORYBOOK_SOURCE_TRACE.md` for the component.
8. Keep component styles token-backed. Do not reach directly into reference tokens from component CSS unless the extracted architecture explicitly allows it.
9. Export the component through the repo's existing public API.

If the extracted spec lacks a necessary state, mark it blocked or implement only the documented states. Do not invent undocumented visual variants as normative design-system behavior.

For a batch pass, keep implementation scoped to the selected batch. If a new primitive or API decision would change later batches, update the queue and implementation map before continuing.

### 10. Story Coverage

Every new or changed shared component needs Storybook coverage:

- default appearance
- documented variants and sizes
- hover, focus-visible, active/pressed, disabled when interactive
- loading, empty, error, selected, expanded, or validation states when the spec defines them
- responsive or density stories when layout changes by viewport
- theme stories when the product supports multiple themes

Every component story should carry the best source URL the trace can resolve:

```ts
parameters: {
  figmaSourceUrl: "https://www.figma.com/design/...?...node-id=...",
}
```

If the best source is a non-Figma URL, use:

```ts
parameters: {
  design: { url: "https://..." },
}
```

Set this at the story meta level when all variants share the same source. Set it per story only when variants/states map to different Figma nodes or source URLs. The bundled review helper reads `parameters.figmaSourceUrl`, `parameters.figma.url`, and `parameters.design.url` automatically for the Open source action.

Prefer existing story conventions. Use Autodocs or MDX only when the repo already uses them or the user asks for docs pages.

### 11. Verification

Run the cheapest reliable checks available:

- Storybook build or relevant story preview
- Figma export addon config check when installed
- lint and typecheck
- unit or interaction tests for changed components
- visual screenshot checks for high-risk components against the best resolved original source
- token audit or CSS variable scan when available

If Storybook is runnable, open the relevant stories and inspect rendered states before calling the pass done. When the selected component has Figma evidence, compare against a Figma MCP screenshot or exported frame when available. When the Figma export addon is installed, confirm the Storybook toolbar loads without console errors and the export overlay can be enabled for at least one component story.

For large inventories, verify per batch and keep the full-library check for milestone boundaries. Do not wait until dozens of components are complete before running Storybook build or typecheck if those checks are available.

### 12. Closeout

Update the implementation map and component queue with completed files, blocked items, token decisions, and verification results.

Report:

- design-system package path used
- source trace path and original sources inspected
- product files changed
- tokens reused or added
- bundled Figma export addon installed/configured or blocked reason
- components reused, extended, or created
- stories added or updated
- batch completed and next queued batch, when applicable
- checks run and any failures
- next recommended component pass, if the inventory is not complete

## Gates

### Extraction Package Gate

Do not treat guesses, unrecorded screenshots, or ad hoc visual impressions as source of truth in this skill. If a component or token is not documented in the extracted package, either defer it or ask to expand the extraction first.

### Source Trace Gate

Before implementing a component, resolve its extractor evidence IDs to original sources when those IDs exist. If the source trace shows Figma, image, frontend-folder, or rendered-route evidence, inspect at least the sources needed for the current component batch or record why they are unavailable. Do not implement a new component solely from an unlisted Figma node, image, or code folder; mark it `needs-extraction` instead.

### Token Gate

Do not hardcode colors, spacing, radii, typography, shadows, or motion values in shared components when equivalent tokens exist. If a required token is missing, ask whether to add it at the correct layer before continuing.

### Component Gate

Do not create a new shared component before checking the product's existing components and stories. If a candidate is close to an existing component, extend the existing one or ask whether to make it a variant.

### Batch Gate

Do not attempt to implement a large inventory in one pass. When there are more than 8 implementable components, create or update the component queue, choose a bounded batch, and leave the remaining work queued.

### Figma Export Addon Gate

Do not silently skip addon setup for compatible React Storybook 10 projects. Install and configure it before component implementation unless the user opts out. If the project is incompatible, record the reason and continue with Storybook implementation only after the blocked addon status is explicit.

Use the bundled addon installer instead of GitHub dependency specs. If `@storybook/icons` is missing and package-manager install cannot reach the registry, record the addon as blocked with that dependency reason.

### Story Gate

Do not mark a shared component implementation complete without a story, example, or documented catalog entry covering its main states.

### Story Source URL Gate

Do not mark a component story complete until the best resolved source URL from `STORYBOOK_SOURCE_TRACE.md` is written to story parameters, or until the implementation map records that no URL source exists. Prefer `parameters.figmaSourceUrl` for Figma; use `parameters.design.url` for other web sources. Local screenshots and frontend folders are implementation evidence, but they are not Open source URLs unless the product serves them through a stable URL.

### Adoption Gate

Do not rewrite product screens to use the new library until the relevant shared components are implemented and documented, unless the user explicitly requests route adoption as the current pass.

## Resource Map

- `scripts/trace_sources.mjs`: scans extractor output and writes `design-system/STORYBOOK_SOURCE_TRACE.md` with Figma, image, frontend-folder, and rendered-route sources.
- `scripts/install_figma_export_addon.mjs`: copies the bundled Figma export addon into a product repo and installs it as a local `file:` dependency.
- `assets/storybook-component-queue-template.md`: queue template for large component inventories.
- `assets/figma-export-addon/`: vendored `@harrychuang/storybook-addon-figma-export` package, sourced from `https://github.com/harrychuang/storybook-addons/tree/main/packages/figma-export`.
