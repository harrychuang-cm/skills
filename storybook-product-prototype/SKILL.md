---
name: storybook-product-prototype
description: Create PRD-led Storybook product prototypes and frontend implementation handoff docs for web or app development, with deterministic fixtures, typed UI Flow route and transition metadata, API/data contracts, interactive prototype stories, template-compatible Static Flow export stories, and an optional Prototype Inspector runtime for Story/Docs/UI Flow/Components/Data review. Use after design-system-to-storybook or independently when turning a product idea into PRD, UI Flow, Data Spec, Production Handoff, Acceptance Criteria, and a clickable Storybook prototype; when scaffolding a prototype folder; when preparing engineer or AI collaboration from design to frontend implementation; when documenting API/data contracts without real data wiring; when aligning UI Flow with the design-system-to-storybook storybook-template contract; when installing a Storybook UI Flow viewer; or when validating prototype and handoff docs across React and Vue Storybook projects.
---

# Storybook Product Prototype

Use this skill to create a product prototype workflow that starts with PRD and flow decisions, then generates docs, deterministic fixtures, typed route metadata, a clickable Storybook story, a Static Flow export story, and frontend implementation handoff guidance for web or app development. The skill is project-agnostic and supports React and Vue TypeScript Storybook projects for scaffolding and validation; other projects can adapt the generated files. `scripts/scaffold_prototype.py` and `scripts/validate_prototype.py` accept `--framework {auto,react,vue}` (default `auto`): the scaffold detects the framework from the nearest `package.json` above the target root, and the validator classifies the prototype folder from its component file (`*Prototype.vue` vs `*Prototype.tsx`).

When the target was created or upgraded by `design-system-to-storybook/storybook-template`, treat that template's Prototype Inspector, `prototypeFlowLayout.ts`, `parameters.prototype`, `prototypeRoute`, `prototypeFlowPreview`, and Static Flow story pattern as the canonical UI Flow contract.

## First Actions

1. Detect the target repo root and Storybook setup.
2. Read existing prototype or page conventions if present: `src/pages/prototypes`, `src/pages`, `src/screens`, `src/components`, `.storybook`, and nearby `*.stories.*` — and identify design-system sources: `design-system/` artifacts from design-system-to-storybook, `package.json` UI dependencies, the Storybook `index.json`, and token/theme CSS imported by `.storybook/preview.*`.
3. If the user is still exploring the product idea, run a discussion first and ask one focused product question at a time. Do not create files until route, data, platform, and acceptance scope are clear.
4. If the user asks to scaffold immediately, use `scripts/scaffold_prototype.py` and then fill the generated docs from the product brief.
5. If the target project already has a prototype inspector, `prototypeFlowLayout.ts`, Static Flow story, or `parameters.prototype` convention, adapt to it instead of creating a second contract.
6. If the target project has no prototype inspector and the user asks for UI Flow runtime review, install the bundled Prototype Inspector with `scripts/install_prototype_inspector.mjs`; the installer also adds the shared flow layout helper expected by Static Flow exports and the fingerprint module `scripts/prototype-review/fingerprint.mjs` that the runtime imports (see step 9).
7. If the user only wants metadata or scaffolding, still generate `parameters.prototype` and document that visual UI Flow review requires the runtime viewer.

## Reference Loading

Read only the reference needed for the current step:

- Product discovery and docs structure: `references/prototype-standard.md`
- PRD conversation and requirement shaping: `references/prd-workshop.md`
- Component and token discovery before composing UI: `references/component-discovery.md`
- Prototype visual quality and token usage: `references/visual-quality.md`
- Route, node, transition, and trigger rules: `references/ui-flow-contract.md`
- Storybook story and metadata integration: `references/storybook-integration.md`
- Fixture and API replacement rules: `references/data-contract.md`
- Fake/Real schema authority, decision status, review evidence, and repo skill delivery: `references/handoff-authority.md` (read whenever producing or consuming a handoff)
- Frontend implementation handoff for web/app development: `references/production-handoff.md`
- Where this skill sits in the prototype-to-production chain and which gates follow it: `references/pipeline-stations.md` (this skill owns stations 1 and 3)

## Workflow

### 1. Frame The Product

Before writing implementation files, confirm:

- Product name and owner.
- Primary user and problem.
- Entry route and initial state.
- Target production surfaces: web, native app, hybrid app, or shared component package.
- Primary review viewport: phone (375x812), tablet (768x1024), desktop (1280x800), or a custom WxH. App targets default to phone; web-only products must choose deliberately — a desktop web product reviewed in phone frames hides its real information density. Both answers are serialized at scaffold time via `--target-surface` and `--viewport` (or set `flow.viewport` / `meta.surface` by hand on an existing prototype).
- Required routes and branch states.
- Which of those screens already ship in production and which are new in this change,
  and for each existing one whether it is being modified or only re-created as a
  context stand-in. Nothing later in the workflow asks this again.
- Required user-triggered transitions.
- Existing components to reuse.
- Fixture data needed by each route.
- Non-goals and external systems that must remain mocked.
- Acceptance criteria for Storybook review.

Ask only for answers that would change the route model, data contract, or acceptance criteria.

### 2. Discover Components And Tokens

Read `references/component-discovery.md`, then:

- Resolve `ds-governance` from the explicitly selected cm-skills checkout, the skill catalog, or [the sibling source](../ds-governance/SKILL.md). When available, run its discovery phase and honor its token and composition gates, reusing prior authorization for the same scope. If unavailable, use `references/component-discovery.md` as the existing standalone fallback and record that the companion was unavailable.
- Work down the discovery tiers (design-system-to-storybook artifacts, Storybook index/stories, source exports), optionally via `scripts/inventory_components.py <repo-root>`.
- Capture story ids and titles for discovered components when they are derivable (Story Id Resolution in `references/component-discovery.md`); step 6 reuses them as `meta.components` story links.
- Always run the token scan and record the actual token prefix in use.
- Record the results as the Component Map, Component Gaps, and Token Binding sections of `docs/UI_SPEC.md`.
- Do not write `docs/UI_SPEC.md` content or prototype CSS before this completes.

### 3. Generate Docs First

Create these docs before composing UI:

- `docs/PRD.md`
- `docs/FLOW_SPEC.md`
- `docs/UI_SPEC.md`
- `docs/DATA_SPEC.md`
- `docs/PRODUCTION_HANDOFF.md`
- `docs/ACCEPTANCE.md`
- `docs/IMPLEMENTATION_GUIDE.md`

The docs are the durable handoff. They must be specific enough for another engineer or AI agent to continue without private conversation context. `PRODUCTION_HANDOFF.md` translates prototype choices into frontend implementation guidance; it must not claim Storybook-only code, fixtures, or data sources are production-ready. Read `references/handoff-authority.md`: maintain one Data Authority registry in `DATA_SPEC.md`, separate Fake Data from Real Data Contract, and record proposed/open/confirmed/superseded decisions with scope, source, and owner. A Builder suggestion never becomes a production requirement through wording or demo approval.

### 4. Model UI Flow Before UI

Create `<featurePrototypeFlow>.ts` before the main React surface.

Naming is load-bearing: keep the literal word `Prototype` in the file name
(`priceAlertPrototypeFlow.ts`, not `priceAlertFlow.ts`), and name the id arrays
`<name>RouteIds` and `<name>FlowNodeIds`. `scripts/validate_prototype.py` locates these
files and id arrays by that convention; a non-conforming name still validates through a
fallback, but every tool keyed on the convention stops finding it. `scaffold_prototype.py`
already emits conforming names — prefer it over hand-writing the file set.

Rules:

- Use stable route ids, not visible labels.
- Add every visible or reachable screen to the route metadata.
- Add flow-only nodes for decision, success, error, loading, or async branch states that are not product screens.
- Add every route-changing user action to the transitions array.
- Give every transition entering a visible route explicit `motion` (`none`, `platform-default`, or `custom`), non-return `presentation`, and return `backBehavior`. Custom motion uses `motionRef: "FLOW_SPEC.md#explicit-anchor"` and a matching definition of entering/returning and reduced-motion behavior. Missing intent remains an open decision; do not invent push, pop, or animation defaults.
- Use stable triggers such as `quoteRow.click`, `submitButton.click`, `bottomNavigation.watchlist`, or `settingsSheet.dismiss`.
- Use `flowLine: "key"` only for transitions that should be drawn on the full UI Flow canvas; keep the full transition list in metadata. `reference` transitions are not drawn on the full canvas, but they take part in deriving branch journeys.
- Declare one entry in `<featureCamel>Journeys` (exported as `flow.journeys`) for each PRD Core Journey (`### Journey N: <Name>`): a lowercase kebab-case `id`, the journey name as `title`, and `steps` listing route or flow-node ids in order (a step may repeat, for example a return to review). The UI Flow journey list shows each declared journey as a single-line view; branches no journey covers are derived automatically. Keep the exported array a literal `[]` until the first journey exists.
- Add optional `sourceAnchor: { x, y }` to a transition only when a Static Flow export needs a stable edge origin for future Figma export layout. Treat `x` and `y` as route-card-relative ratios from `0` to `1`.

### 5. Create Deterministic Data

Create `<featurePrototypeData>.ts`.

Rules:

- Keep all prototype data local and deterministic.
- Mirror every fixture group as `fixtures/<group>.json` with the same values; the JSON file is the language-neutral carrier native platforms and receiving mock adapters load.
- Author one JSON Schema block per fixture group in `DATA_SPEC.md`'s `Data Schemas (JSON Schema)` section and keep it in sync with the fixtures.
- Classify every fixture in the single `Data Authority` JSON registry: `values: fake`, `schemaScope: ui-model | transport`, status, source, and named owner. `confirmed` requires source reference, revision, confirmer, and date; confirmed UI models still authorize only UI/mock types. Contracts separately record id, kind, status, source, and owner. Empty contracts are valid; do not invent a real API to fill the file.
- Use existing component prop types where possible.
- Include branch, empty, loading, and error fixtures when those states are in scope.
- Document fixture ownership and future API replacement points in `DATA_SPEC.md`.
- Do not call live product APIs from a prototype.
- Define UI-facing data shapes for UI models and mocks. Define transport DTOs only from confirmed transport evidence; map real responses to the UI model when their shapes differ. Leave real data source, auth, backend client, cache, storage, and persistence wiring to the receiving engineer or AI in the production repo.
- For Remote Config, text describing the controlled region, product intent, demonstration states, open defaults/fallbacks, and RD owner is sufficient. Leave technical key, provider, polling, cache, permissions, and rollout details open without confirmed sources.

### 6. Compose The Storybook Prototype

Create the framework-native prototype component (React `.tsx` or Vue SFC), Static Flow export, CSS, metadata, stories, and index files.

Rules:

- Compose component-first from the Component Map in `docs/UI_SPEC.md`: every screen region renders its mapped existing component via import; local markup only for Component Gaps regions.
- Keep route state explicit and typed by route ids.
- Wire clicks through route mappings and transition triggers, not rendered text.
- Keep prototype-only CSS scoped under a feature root class.
- Write CSS per `references/visual-quality.md`: one `--proto-*` alias block bound to the Token Binding record; raw values only as alias fallbacks; interactive controls ship hover/focus-visible/active/disabled states; in-scope routes render loading/empty/error fixtures.
- Attach the complete meta object to `parameters.prototype`.
- Support `prototypeFlowPreview=true` and `prototypeRoute=<route-id>` query modes for iframe route previews. Flow preview mode (the `isFlowPreview` prop or that query) must hide the prototype's own chrome — the prototype header and route navigation — so flow cards show only real page content; the validator rejects components without this conditional.
- Add `data-prototype-route-preview="true"` on the route preview shell. Keep `data-prototype-root="true"` on the prototype root for older viewers.
- Create `<FeaturePrototypeFlowExport>.tsx` and `<FeaturePrototypeFlowExport>.stories.tsx` with `StaticFlow`, reading layout from `../prototypeFlowLayout` and rendering route cards from the same flow metadata.
- Add `figmaExport.flowStoryId` to the prototype meta object so export tools can locate the Static Flow story.
- Author `meta.components.routes` from the UI_SPEC Component Map and Component Gaps: cover every route, mark each component `shared`, `local`, or `promoted` by its source section, and resolve each `storyId` through the resolution chain in `references/component-discovery.md` — never guess ids. Contract: `references/storybook-integration.md`.

### 7. Prepare Frontend Implementation Handoff

Create or update `docs/PRODUCTION_HANDOFF.md`.

Rules:

- Fill `Design System Continuity` with the token namespace record, the Component Map echo, the per-screen composition echo from `meta.components` (each route's components with origin and story id — format in `references/production-handoff.md`), and locally created promotion candidates.
- State whether production is web, app, hybrid, or cross-platform, and record the primary review viewport (formFactor and size) next to it, mirroring `flow.viewport` and `meta.surface.target`.
- Give every row of `Prototype To Frontend Map` a delivery scope before anything else:
  `A` existing (already ships; the prototype re-creates it so the new behavior can be
  judged at real information density — do not rebuild), `B` new, `C` Storybook-only, or
  `U` unverified. `U` must also appear in `Open Product Decisions` with an owner; never
  guess `B`. Rows may be a region inside a route, and a parent's scope does not carry
  down to its children. Fill `Do Not Rebuild` with the `A` rows most likely to be built
  by mistake and the evidence that settles each.
- Map prototype route ids to production pages, screens, navigation destinations, or shared components.
- Separate Storybook-only behavior from reusable production behavior.
- For web, document routing, rendering mode when known, responsive constraints, accessibility, analytics, and browser-specific behavior.
- For app, document screen ownership, navigation stack, safe-area/viewport constraints, permissions, offline behavior, and platform gestures when relevant.
- Reference the Data Authority registry when documenting fixture replacement: UI/model expectations and mocks are distinct from confirmed transport request/response/error contracts. Record open/proposed integration needs and owners instead of deriving backend contracts from Fake values.
- List frontend state handling for loading, empty, error, disabled, optimistic, retry, permission, and async branch states that matter.
- Define handoff acceptance separately from Storybook acceptance and from final production integration acceptance.
- State integration ownership as three stages — prototype (this skill: UI behavior, fixtures, contracts) → frontend assembly (`frontend-product-implementation`: routes, interaction states, typed adapter seams, mock adapters) → data integration (real APIs, auth, storage, persistence) — and fill `Data Integration Ownership` with the stage-3 receiver or an open decision with an owner.
- Record open product, design, API, platform, or security decisions instead of inventing them.
- Shape the receiver-consumed items exactly as `references/production-handoff.md` → `Receiver Consumption Contract` lists them: `Review Status` as a bullet list with a `Status:` line, `Open Product Decisions` split into the numbered `### 🚧 擋開工` list (write `無` when empty) and the `### 不擋開工` decision register, `Existing Surfaces`/`New Surfaces` in the PRD, and every story referenced by story id. The receiving repo's lint does not parse prose variants.
- Clear every `🚧 擋開工` item before asking for confirmation: resolve it with its owner, record the answer in the decision register with status `confirmed` and its source, and leave `無` under the heading. `--handoff-ready` fails while a numbered blocking decision remains — an open one forces the receiving team to answer it without you. Only a decision that stops all implementation belongs in that list; one that limits part of the work stays in the register and independent work continues.
- Keep `Review Status` at `pending` until the team reviews the Storybook demo and confirms the product direction; `--handoff-ready` fails while it is `pending`.
- Record named, dated, scoped demo confirmation separately from `Semantic Review` (`Reviewed by`, `Reviewed on`, `Scope`, `Result: passed`, `Related updates`). Actually review suggestions, superseded rules, and affected Data/Handoff/Flow/Acceptance, fixtures, metadata, exports, and tests before marking that review passed. Neither demo confirmation nor a validator result confirms an API, analytics parameter, or config key.
- Record skills actually used through the existing project installer with opt-in `--record-usage` and an explicit skill list. Verify repo-local copies, `docs/SKILL_USAGE.json`, and relative links in the managed `CLAUDE.md`/`AGENTS.md` blocks; preserve existing content. Required/support dependencies are separate from selected skills. Do not use `all`, global installation, or external symlinks for this handoff.

### 8. Promote Confirmed Components Into The Hub

The Storybook project is the durable prototype and component hub; production targets vary and may have no component library. This step usually runs after the first validation and demo pass (step 10) has given the team something to review. After the team confirms the product direction, and before treating the handoff docs as final:

1. Revisit `Component Gaps`: identify gap components the confirmed scope needs, especially ones that recur across routes or prototypes.
2. Ask the user which candidates to promote into the hub's shared component library now. Promotion is an explicit decision, not an automatic step.
3. Promote approved candidates with the `design-system-to-storybook` flow when that skill is available — hand each candidate in as an explicit component brief, since it has no extracted design-system spec; otherwise build the shared component to the same bar: its own file, typed props, token-bound styles, and its own stories.
4. Update the prototype to import the promoted component, move its entry from `Component Gaps` to the `Component Map`, flip its `meta.components` entry in the same motion (`origin` `local` → `promoted`, add the new `storyId`), and re-run validation.
5. Record the outcome in `Design System Continuity`: `promoted` candidates with their shared-component path and story id; remaining `local` candidates with their prototype file path and consuming routes/regions.

Skip promotion when the team has not confirmed the direction yet, when a gap component is a one-off, or when the user declines; unpromoted candidates remain valid handoff input as local markup.

### 9. Install The Runtime Viewer When Requested

If the project needs the Storybook toolbar and Docs/UI Flow/Components/Data runtime, run:

```sh
node <skill-root>/scripts/install_prototype_inspector.mjs --project-root <repo-root>
```

The installer adds the addon preset to `.storybook/main.*` and writes three groups of files:

- `.storybook/prototype-inspector/` — the Inspector runtime, copied whole from the bundled `assets/prototype-inspector/`.
- `src/pages/prototypes/prototypeFlowLayout.ts` — the shared flow layout helper used by the addon and Static Flow exports.
- `scripts/prototype-review/fingerprint.mjs` — the canonical metadata fingerprint module, kept outside the Inspector folder so node-side review scripts can reuse the same implementation.

`preview.js` imports the helper and the fingerprint module by relative path and loads as a global preview annotation, so if either file is missing, no story loads. Without `--force`, an existing helper or fingerprint module is reused, and an existing `.storybook/prototype-inspector` folder stops the install. An existing helper that lacks any export the Inspector imports (for example an older helper without `getPrototypeFlowLayoutViewportSignature`) is refused before anything is written: the installer prints `Existing flow layout helper <path> is missing exports required by the Prototype Inspector: <names>. Rerun with --force to replace it with the bundled helper.`, exits non-zero, and leaves every project file unchanged, including `.storybook/main.*`. Review the helper for project edits before rerunning with `--force`, which replaces it with the bundled helper.

The inspector styles itself through a `--pi-*` token layer that reads `--sbt-*` tokens when the project defines them and falls back to built-in neutral light/dark values otherwise. When the project uses a different token prefix (recorded in the Token Binding discovery), pass `--token-prefix <prefix>` (for example `--token-prefix md`) so the inspector binds to the project's tokens while keeping the fallbacks.

Use `--force` only when intentionally replacing installed files; re-running with `--force` is also how existing installs pick up bundled addon updates. Repeat the project's token prefix on every upgrade, because `--force` re-copies the bundled stylesheet and drops the earlier bridge (omit `--token-prefix` when the project uses the default `--sbt-*` tokens):

```sh
node <skill-root>/scripts/install_prototype_inspector.mjs --project-root <repo-root> --force --token-prefix <prefix>
```

Warning: `--force` copies every bundled file over a customized `.storybook/prototype-inspector/` folder (for example a project's own fork of the Inspector runtime) and replaces the helper and fingerprint module with the bundled copies, so project edits to those files are lost. Merge project-specific Inspector changes by hand instead of forcing over them.

The Prototype Inspector is React-only: its preview decorator returns React elements, so it cannot render in Vue (or other non-React) Storybook projects, and the installer aborts without writing files when `.storybook/main.*` references a non-React renderer such as `@storybook/vue3-vite`. In Vue projects, skip this step and review the flow through the `StaticFlow` story plus direct reading of the `docs/` handoff files; the `prototypeRoute` and `prototypeFlowPreview` query modes still work because they are implemented inside the prototype component itself.

### 10. Validate

Run the checks that fit the target repo:

- `python3 <skill-root>/scripts/validate_prototype.py <prototype-folder>` — add `--strict-style` to turn validation warnings (component map, token discipline, CSS scope, doc coverage, `meta.components` composition) into errors, and `--storybook-index <path>` to cross-check `meta.components` story ids against a built Storybook index. The validator auto-detects React vs Vue folders; pass `--framework react` or `--framework vue` explicitly when a folder mixes both component formats.
- `python3 <skill-root>/scripts/export_prototype_contracts.py <prototype-folder>` — regenerate `docs/TOKENS.json` (W3C DTCG) from the `--proto-*` alias block and normalize `fixtures/*.json` formatting. Re-run it whenever the alias block or fixtures change; native token codegen consumes the DTCG file, not the CSS.
- Project typecheck, usually `npm run typecheck`
- Storybook render or build, usually `npm run storybook` or `npm run storybook:build`
- Manual Storybook review of Story, Docs, UI Flow, Components, and Data if the project has a prototype inspector; in the Components mode, confirm every route lists its composition and story links open the right stories.
- Manual UI Flow canvas check when the bundled inspector is installed or its assets changed, in Chrome, Safari and Firefox: a trackpad pinch zooms the canvas and never the Storybook page (once with the pointer over the canvas, once over the zoom group); Shift+1 and Shift+0 fit and zoom to 100% without triggering Storybook shortcuts; pressing 1 still focuses the Storybook sidebar; Tab to Zoom in and press Space zooms exactly one step; text and frames are sharp once zooming stops; the zoom and layout groups stay put while panning; with the Storybook toolbar zoom at 150%, a dragged frame still follows the pointer; with `globals=figmaExport:on` the zoom and layout groups are fully visible and clickable; zoomed out (Shift+1) on a first open, snapshots fill in from the center outward and stop while you pan, and after a reload they appear at once at their cached sizes; zooming to 100% (Shift+0) turns the frames in view live without flashing blank; editing a route component in Storybook dev shows the ↻ badge and then the edited snapshot; repeated Tab presses never move focus into a route frame; with IndexedDB blocked (for example a private window that blocks site data) the canvas still shows snapshots. With figma-export addon 0.14.0 or later and `globals=figmaExport:on`, also check UI Flow comments in the same three browsers: leave one comment on a frame, one on a transition line and one on blank canvas; after panning, zooming and dragging the frame each pin is still on its spot; Escape closes the comment composer without cancelling a drag; the Story view's comment list does not show the UI Flow comments; the Figma export panel in UI Flow points to Static Flow.
- The UX self-review pass from `references/visual-quality.md`: hierarchy, interaction states, contrast, and token binding checked against the rendered stories.
- Manual `StaticFlow` story review when future Figma export or design review depends on a stable flow artifact.
- Handoff review with `--handoff-ready` before using the docs as an engineering or AI implementation brief: it cross-checks doc route/fixture references, fixture carriers and acceptance ids, Data Authority structure/source fields, named/dated/scoped demo and semantic review records, and explicit navigation/motion intent; it also fails while the `🚧 擋開工` list still carries a numbered decision and while `docs/flow.json` (when present) differs from a fresh `export_flow.py` export. On a fully passing run it writes version-2 `docs/HANDOFF_MANIFEST.json`: docs plus Flow/Data/Meta, fixtures, and existing flow/token export hashes, both digests, and a changelog. Pass `--changelog "<summary>"` to label the reviewed version. `--production-ready` remains only a backward-compatible alias; the check does not establish external source truth or semantic correctness.
- At ingestion and before completing receiving work, detect drift with `python3 <skill-root>/scripts/validate_prototype.py <prototype-folder> --verify-manifest`: added, removed, or changed covered artifacts fail. Receivers record `docsDigest`, `artifactsDigest`, and the consumed version. A version-1 or missing manifest is incomplete provenance. For changed decisions, update all affected docs/carriers/tests, supersede replaced instructions, and re-review before publishing a new local snapshot.

Do not mark the prototype complete unless docs, flow metadata, fixture data, frontend handoff, story metadata, and interactive behavior describe the same product behavior.

## Scaffolding

Use the scaffold script when creating a new prototype from scratch:

```sh
python3 <skill-root>/scripts/scaffold_prototype.py "Portfolio Alerts" \
  --target-root src/pages/prototypes \
  --owner "Product Team" \
  --viewport desktop --target-surface web
```

The scaffold creates a folder based on the feature name, adds `prototypeFlowLayout.ts` to the prototypes root when needed, and fills template tokens. It detects the target framework from the nearest `package.json` above the target root and prints the result; pass `--framework react` or `--framework vue` to override. Vue mode produces `.vue` components with `.stories.ts` stories from the bundled Vue overlay template set instead of the React `.tsx` files. `--viewport {phone|tablet|desktop|<W>x<H>}` (default phone) declares the primary review viewport in `flow.viewport` and `--target-surface {web,app,hybrid,package}` (default web) records the platform decision in `meta.surface`; presets map to 375x812 / 768x1024 / 1280x800. After scaffolding, replace the generated bracketed guidance with concrete product content before implementation.

Warning: `--force` re-scaffolds regenerate the flow file, so repeat `--viewport`/`--target-surface` on every `--force` run — a plain `--force` reverts the prototype to the phone/web defaults, which no validator can distinguish from an intentional phone scaffold (the visible tell is the Inspector's layout-signature notice when saved layouts stop applying).

In the skill source checkout, run `node storybook-product-prototype/scripts/test_authority_inspector.mjs` after changing the Inspector authority view; it uses the existing Storybook template React dependencies to render valid and unverified cases. This is render/semantic verification, separate from browser visual review.

Run `python3 <skill-root>/scripts/test_scaffold_validate.py` after changing the templates or scripts; it scaffolds and validates one prototype per framework and fails when the two rounds diverge.

Run `node <skill-root>/scripts/test_install_prototype_inspector.mjs` after changing `install_prototype_inspector.mjs` or the bundled Inspector assets; it installs into temporary React Storybook projects and checks the installed files, the fingerprint reuse rule and the refusal of an incompatible flow layout helper.

After changing the UI Flow canvas (`flow-canvas.js`, `flow-canvas-geometry.js`, `flow-snapshot.js`, `flow-snapshot-cache.js`, `flow-canvas-hmr.js` or their CSS), run the canvas tests in the skill source checkout:

- `node --test storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs` checks the routing and label helpers against golden outputs recorded from the pre-camera `preview.js`, the camera math (zoom steps, wheel and pointer classification, fit, shortcuts) and the level-of-detail tiers, live budget and measured-size rules against fixed example tables.
- `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` server-renders the canvas with the Storybook template React dependencies and checks its layers, control names, frame labels, zoom menu, contrast and frame tiers.
- `node --test storybook-product-prototype/scripts/test_flow_snapshot_cache.test.mjs` checks the snapshot cache on its memory adapter: key format, least-recently-used eviction by count and size, format versions, reads by prototype key prefix and stale marks.
- `node --test storybook-product-prototype/scripts/test_flow_snapshot.test.mjs` checks the snapshot scale and size caps, the standard property list and the capture failure reasons.
- `node storybook-product-prototype/scripts/test_flow_snapshot_fidelity.mjs [--url "<UI Flow iframe URL>"]` compares snapshots with Chrome screenshots of fixed test pages (it prints `SKIPPED: no Chrome` when no system Chrome is found); with `--url` it also compares real routes of a running Storybook, switches the renderer between two routes and checks that a capture aborted while encoding is dropped.

To measure canvas performance, create a disposable Storybook copy with generated bench prototypes and measure a running Storybook in system Chrome:

- `node <skill-root>/scripts/create_flow_bench_fixture.mjs --out <new folder outside the repo>` copies the Storybook template and adds bench prototypes, including a 100-route flow; it is also a ready-made fixture for the manual canvas check.
- `node <skill-root>/scripts/bench_flow_canvas.mjs --url "<UI Flow iframe URL>" --project-root <that folder> --out <json>` records open time, DOM size, memory at fit and at 100%, route and renderer iframe counts, drag and gesture commit counts, layout writes and snapshot timings (a cold capture of every route, the cached display on the next visit, and a drag while snapshots are captured) as JSON.
- `node <skill-root>/scripts/check_flow_snapshots.mjs --url "<UI Flow iframe URL>" [--edit-file <that folder>/src/pages/prototypes/bench-shared/BenchRouteScreen.tsx]` checks the snapshot lifecycle in system Chrome: the first open captures every route once from the centre outward, a reload shows the cached snapshots at once and revalidates each route once, a new tab does not wait for the opening fit, and with `--edit-file` an edit in Storybook dev marks the snapshots as updating and replaces them only after the renderer applied it (the file is restored afterwards).
- `node <skill-root>/scripts/check_flow_canvas_comments.mjs --url "<prototype story iframe URL>"` checks the canvas against figma-export review comments in system Chrome on that fixture (it carries figma-export addon 0.14.0 or later): anchor movement notifications during pan and drag, location requests, keys handled by the comment composer, capture taking precedence over frame interaction, and comments placed on frames, lines and blank canvas.

## Quality Bar

- The prototype is a clickable product flow, not a static screenshot recreation.
- Every screen region maps to a discovered design-system component in the UI_SPEC Component Map, or has an explicit Component Gaps entry.
- `meta.components` records every route's composition with origins (`shared` / `local` / `promoted`) that match the Component Map and Component Gaps, and story ids resolved, not guessed.
- Prototype and Static Flow CSS consume `--proto-*` aliases bound to recorded project tokens; interactive controls ship hover/focus-visible/active/disabled states; in-scope routes render loading/empty/error.
- PRD, UI Spec, Flow Spec, Data Spec, Acceptance Criteria, and Storybook metadata stay consistent.
- Production Handoff maps the prototype to web/app frontend implementation work without treating Storybook-only code, fixtures, or data sources as production integration.
- Handoff docs carry a `Review Status` confirmed by the team demo review before they are used as an implementation brief.
- A confirmed handoff has no open `🚧 擋開工` decision: the list reads `無`, and answered decisions stay in the decision register as `confirmed` rows with their source.
- Team-confirmed, recurring gap components are promoted into the hub's shared component library or recorded as `local` promotion candidates with file paths.
- UI Flow is generated from route, flow-node, and transition metadata.
- UI Flow route cards preview the correct route through `prototypeRoute` and `prototypeFlowPreview`.
- `flow.viewport` matches the declared target surface: a desktop web product is never reviewed in phone frames, and the Static Flow export, shell, and Inspector all render the declared size.
- Static Flow export uses the same metadata and saved inspector layout as the runtime UI Flow.
- `figmaExport.flowStoryId` points to the `StaticFlow` story for future Figma export automation.
- Fixture data is deterministic and local, mirrored in `fixtures/<group>.json`, and schema-documented in `DATA_SPEC.md`'s `Data Schemas (JSON Schema)` section.
- Every fixture is explicitly Fake with separate schema scope/status and source. UI/mock assembly may proceed with proposed/open models and named owners; transport DTOs require confirmed transport evidence. Suggested analytics fields and unconfirmed Remote Config keys never become formal requirements.
- `docs/TOKENS.json` is regenerated after `--proto-*` alias block changes so native token codegen never reads stale values.
- Acceptance criteria carry stable `AC-S-*`/`AC-H-*`/`AC-P-*` ids, and `AC-P` entries carry `(assembly)`/`(integration)` owner tags.
- Every visible-route transition carries motion and its required presentation/return semantics; app non-return transitions also carry presentation. Custom motion resolves to an explicit Flow Spec anchor, and no missing field is silently defaulted.
- A passing `--handoff-ready` run leaves a version-2 manifest with complete covered carrier hashes. Named, dated, scoped semantic review remains separate from hash integrity and demo confirmation.
- Storybook `parameters.prototype` remains the review contract.
- Runtime UI Flow rendering is provided by the bundled Prototype Inspector when installed, or by an existing project-specific viewer when present.
