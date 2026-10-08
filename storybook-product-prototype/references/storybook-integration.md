# Storybook Integration

Use this reference when creating `<FeaturePrototype>.stories.tsx` (React) or `<FeaturePrototype>.stories.ts` (Vue) and `<featurePrototypeMeta>.ts`.

## Story Requirements

The default story should:

- Use `layout: "fullscreen"` when rendering a full product surface.
- Render a clickable prototype, not a static screenshot.
- Attach the meta object to `parameters.prototype`.
- Support `prototypeFlowPreview=true` for compact iframe preview styling; in this mode the prototype must hide its own chrome (prototype header and route navigation) so previews show only real page content.
- Support `prototypeRoute=<route-id>` so UI Flow route cards can render the correct route.
- Add `data-prototype-route-preview="true"` to the route preview shell for template-compatible iframe measurement. Width is declared (the shell sets the preview-size CSS variables inline from `flow.viewport`, per-route override first) while height is still measured from the rendered content — declaration and measurement split the two axes.
- Keep `data-prototype-root="true"` on the prototype root for backward-compatible viewers.

The Static Flow story should:

- Export `StaticFlow` from `<FeaturePrototypeFlowExport>.stories.tsx`.
- Use the same Storybook title and `parameters.prototype` object as the interactive story.
- Use `layout: "fullscreen"`.
- Render route cards and flow-only nodes from `flow.routes`, `flow.nodes`, and key `flow.transitions`.
- Read saved layout through `../prototypeFlowLayout` so positions edited in the Prototype Inspector match the export artifact.

## Vue Story Conventions

The Vue overlay templates follow the same story requirements with these framework-native conventions:

- Story files are `.stories.ts` (`<FeaturePrototype>.stories.ts`, `<FeaturePrototypeFlowExport>.stories.ts`), typed with `Meta` and `StoryObj` from `@storybook/vue3-vite`.
- The prototype component is a `<script setup lang="ts">` SFC imported as a default export (`import FeaturePrototype from "./FeaturePrototype.vue"`); component references inside SFC templates use PascalCase.
- The story `render` function returns a `{ components, setup, template }` object that binds args onto the component.
- `parameters.prototype`, `layout: "fullscreen"`, the `StaticFlow` export name, and the `prototypeRoute` / `prototypeFlowPreview` query modes are identical to the React contract — the meta, flow, and data modules stay plain TypeScript and are shared unchanged across frameworks.

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

Data Authority remains solely in the raw `docs.dataSpec` markdown under `## Data Authority`; do not copy the registry into `data`. The Inspector reads its single fenced JSON block, displays FAKE values separately from UI-model/transport confirmation, and shows source and owner. Missing, malformed, or unsupported authority is unverified; free-text `data.overview.status` and demo confirmation cannot override it. See [handoff-authority.md](handoff-authority.md).

The `figmaExport` object should expose:

- `flowStoryId`: the Storybook id for the `StaticFlow` export, for example `pages-prototypes-example-prototype--static-flow`.

`PRODUCTION_HANDOFF.md` should be exposed with the other docs so reviewers can inspect frontend implementation guidance without leaving Storybook.

## Component Composition Metadata

`components` is an OPTIONAL top-level meta key — a sibling of `flow`, `data`, `docs`, and `figmaExport` — that records which components compose each route. This section is the single source for the contract; other references link here instead of restating it.

```ts
components: {
  classPrefix: 'cm-',               // optional; project-wide component root-class prefix used to derive highlight selectors
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
          domSelector: '.cm-bottom-sheet-cell', // optional; explicit CSS selector for this component's rendered root(s) in the route preview; overrides derivation
          targets: {                  // optional; per-platform production counterparts
            web: 'src/components/bottom-sheet-cell', // production component/import path, when it exists
            ios: null,                // string = SwiftUI view name; null = must be newly built; key absent = platform out of scope
            android: 'BottomSheetCell', // string = composable name; same null/absent semantics
          },
        },
      ],
    },
  ],
}
```

Rules:

- The key is optional. Every consumer must tolerate its absence (older prototypes) and ignore unknown extra fields.
- `targets` is the OPTIONAL per-platform mapping for multi-platform deliveries: each of `web`, `ios`, and `android` holds the production counterpart's name or path (a string), an explicit `null` meaning the counterpart must be newly built, or is absent meaning that platform is out of scope for the entry. Entries without `targets` keep the single-target contract unchanged. Fill it when `PRODUCTION_HANDOFF.md` Target Surfaces declares more than one platform, so a native receiver can tell which SwiftUI view or composable corresponds to each prototype component instead of re-deriving the mapping.
- `origin` semantics: `shared` = the component existed before this prototype (a UI_SPEC Component Map entry); `local` = created for this prototype (a UI_SPEC Component Gaps entry or prototype-local file, usually with no story); `promoted` = was a gap, then promoted into the hub's shared component library in the promote workflow step (has a hub path and story id).
- The authoring source of truth stays `docs/UI_SPEC.md` Component Map / Component Gaps. `meta.components` is the machine-readable echo: author it in the compose step, and update the affected entry in the promote step in the same motion as the doc move (`origin` `local` → `promoted`, plus the new `storyId`).
- Resolve each `storyId` through the resolution chain in `references/component-discovery.md`; never guess an id silently. When no id resolves (typical for `local`), omit `storyId` — the inspector shows the source path without a link.
- Docs links are derived at runtime, never stored: strip the trailing `--<storyName>` segment from `storyId` and append `--docs` (`?path=/docs/<base>--docs`). The docs link is only a secondary link.
- `classPrefix` and `domSelector` are the OPTIONAL highlight fields. The inspector resolves each entry's highlight selector as: the entry's `domSelector` when present; otherwise, when `classPrefix` is set, `"." + classPrefix + kebab(name)` (PascalCase → kebab-case, e.g. `BottomSheetCell` → `.cm-bottom-sheet-cell`; digits stay attached to the preceding word — `Grid12` → `.cm-grid12` — so use `domSelector` when the project's class convention separates digits); otherwise the entry has no highlight affordance — its card still shows the origin badge, import path, and story links. `classPrefix` records the project's component root-class convention (see `references/component-discovery.md`); `domSelector` is the per-entry escape hatch for roots that do not follow it (page-level shells, prototype-local markup). Both fields are optional and every consumer must tolerate their absence.

Both the interactive story and the `StaticFlow` story share one meta object, so composition data surfaces in both automatically; both must tolerate the key being absent.

## UI Flow Viewer Boundary

This skill creates the metadata contract and includes a bundled Prototype Inspector runtime.

If the target project has no prototype inspector:

1. Still generate `parameters.prototype`.
2. Install the bundled runtime only when the user asks for Storybook UI Flow review:
   `node <skill-root>/scripts/install_prototype_inspector.mjs --project-root <repo-root>`.
   The runtime depends on two files outside its folder, and the installer writes both: `preview.js` imports the flow layout helper from `../../src/pages/prototypes/prototypeFlowLayout` and the fingerprint module from `../../scripts/prototype-review/fingerprint.mjs`. Do not copy `.storybook/prototype-inspector/` into a project without them; a missing import breaks every story's preview.
3. Do not replace an existing `.storybook/prototype-inspector` folder, `src/pages/prototypes/prototypeFlowLayout.ts`, or `scripts/prototype-review/fingerprint.mjs` unless the user approves `--force`. Re-running with `--force` is also how an existing install picks up bundled addon updates; repeat `--token-prefix <prefix>` on that rerun when the project uses one, because `--force` re-copies the stylesheet. When an existing helper lacks an export the Inspector imports, the installer names the missing exports and exits without writing anything; replacing that helper also needs the user's approval for `--force`.
4. The inspector CSS defines a `--pi-*` token layer: each token reads the `--sbt-*` design token when the project defines it and otherwise falls back to built-in neutral values (with a `prefers-color-scheme: dark` fallback set), so the panels render correctly in any React Storybook project. When the project uses another token prefix, pass `--token-prefix <prefix>` (for example `--token-prefix md`) to bind the layer to the project's tokens, or redefine `--pi-*` tokens on `.prototype-inspector` in a stylesheet loaded after the addon CSS.

If the target project already has a prototype inspector, match its parameter name, preview-mode query conventions, route preview selector, and saved layout helper. For repos created from `design-system-to-storybook/storybook-template`, keep the existing `prototypeFlowLayout.ts` schema and Static Flow pattern.

## Bundled Prototype Inspector

The bundled addon reads `parameters.prototype` and provides a Storybook toolbar with the modes below. The toolbar tool renders only while the selected story (or its autodocs page) declares `parameters.prototype`; on every other story it is hidden entirely. Visibility is parameter-driven — sidebar category naming (`Prototypes/`, `Flows/`, ...) carries no meaning.

- `Story`: the original story.
- `Docs`: PRD, UI Spec, Flow Spec, Data Spec, Frontend Handoff, Implementation Guide, and Acceptance markdown.
- `UI Flow`: route frames, flow-only nodes, key transition lines, layout import, and layout export on a camera canvas; see UI Flow Canvas below for navigation, shortcuts, and when layout changes are saved.
- `Components`: an interactive three-pane workspace over `meta.components`.
  - A route rail on the left lists the flow routes in flow order (route title plus id badge); the first route with composition data is selected by default.
  - The middle pane shows one card per component of the selected route — name, origin badge (`shared` / `new` / `promoted`), story title, import path, and notes. When a `storyId` is present, the card's `Story` button opens `?path=/story/<storyId>` in a new tab (the same URL mechanism as `Open Static Flow`), with a secondary `Docs` link to the derived `--docs` path; without a `storyId`, the card shows the source path with no link.
  - The right pane is a live same-origin iframe preview of the selected route (the same `prototypeFlowPreview=true` + `prototypeRoute=<route-id>` URL the UI Flow cards use), scaled to fit and reloaded on route switch.
  - Hovering or focusing a card whose highlight selector resolves (see Component Composition Metadata above) outlines the matching element(s) inside the preview iframe, scrolls the first match into view, and shows the match count on the card. A selector that matches nothing in the preview's current state is normal: the card shows a muted "not in current state" chip instead of a highlight.
  - The reverse direction works too (mouse only): hovering a component's rendered instance inside the live preview outlines just that instance and emphasizes its card in the middle pane, scrolling the card into view; when several entries' selectors match, the deepest (most specific) element wins. Leaving the preview hands the highlight back to a still-focused card or clears it, and the listeners never intercept clicks or navigation inside the preview.
  - Everything degrades gracefully: entries without a resolvable selector (no `domSelector` and no `classPrefix`) keep their full card — origin, links, import path — just without the hover-highlight. A prototype without `meta.components` gets a friendly empty state, not an error; a selected route without a composition entry shows a "No composition data for this route" message while the preview still renders.
- `Data`: Fake fixture values, schema scope/confirmation, contract source and owner from the raw Data Authority registry, API replacement requirements, route data map, state rules, and raw metadata. Confirmed UI models are explicitly distinct from confirmed real transport contracts; legacy or invalid registries remain unverified.
- `Open Static Flow`: when `parameters.prototype.figmaExport.flowStoryId` is present, open the Figma-ready static flow story that uses the same saved layout.

UI Flow route frames also carry a compact components button in their frame label, sourced from the same `meta.components` data. The `Components` mode and route-card strip ship with the bundled addon: an existing install picks them up by re-running `install_prototype_inspector.mjs --force` (with the same `--token-prefix <prefix>` when the project uses one). That rerun also installs `scripts/prototype-review/fingerprint.mjs`, which the current `preview.js` imports and earlier installer versions did not write.

Preview-size resolution for inspector installs: each card resolves `route.viewport` → `flow.viewport` → the form-factor tier CSS tokens → the built-in 375x812 constants. The tier tokens are read on the `.prototype-inspector` element first and `:root` second, so both the documented `--sbt-sys-size-viewport-*` bridge and legacy `:root`-level overrides work. Compatibility notes: the compact pair (`--prototype-inspector-viewport-compact-width/height`) keeps its phone semantics and remains the project-global default; the medium (`768px/1024px`) and wide (`1280px/800px`) pairs serve tablet and desktop form factors; the inspector sets `--prototype-inspector-active-viewport-width/height` inline per prototype so stylesheet layout caps follow the active prototype without redefining `compact`. Cards of prototypes that declare a viewport show a formFactor badge (for example `desktop · 1280x800`); legacy prototypes show none and keep their exact pre-viewport behavior.

### UI Flow Canvas

The UI Flow tab is a camera canvas, not a scrolling page: route frames, flow-only nodes and edges sit in one world layer moved by a single CSS transform, and the zoom group, layout group and dialogs stay fixed on screen. World coordinates are layout coordinates, so negative positions render in place and moving a frame past the content edge never shifts the other frames.

Gestures:

- Trackpad pinch, or Ctrl/Cmd/Alt + wheel, zooms around the pointer between 5% and 400%. In Safari the native pinch gesture does the same. Pinching over the zoom or layout controls still zooms the canvas, never the Storybook page.
- Two-finger scroll or a plain mouse wheel pans the canvas; on Windows and Linux, Shift + wheel pans horizontally. Wheel input over a scrollable side panel or menu keeps its normal scrolling.
- Space + drag, or a middle-button drag, pans from anywhere on the canvas. Cmd no longer pans: Cmd + drag on empty canvas leaves the camera where it is.
- Dragging a route frame or flow-only node moves it once the pointer travels 3 CSS pixels; a shorter press is a click and leaves the layout untouched. Press Escape before releasing to put the frame back.
- Hovering a frame emphasizes its connected edges and reveals the route id and `flowGroup` (or `navigationId`) next to its title.

Keyboard shortcuts (Cmd on macOS, Ctrl elsewhere):

| Keys | Action |
| --- | --- |
| Shift+1 | Fit all frames |
| Shift+0 or Cmd/Ctrl+0 | Zoom to 100% |
| `=` / `+` / keypad plus, or Cmd/Ctrl+`=` | Zoom in one step (5%, 10%, 25%, 50%, 100%, 200%, 400%) |
| `-` / keypad minus, or Cmd/Ctrl+`-` | Zoom out one step |
| Space (hold) | Pan mode while held |
| Escape | Close the zoom menu or Reset dialog; otherwise cancel an active drag |

The canvas consumes only the keys it handles, so Storybook never sees them. Unmodified 1, 2, 3, M and C, and every combination with Alt, stay reserved for Storybook and the browser: pressing 1 still focuses the Storybook sidebar. Typing in an input, textarea, select or contenteditable element is never intercepted. When a canvas control has keyboard focus (reached with Tab), Space, Enter and the arrow keys keep their native behaviour, so Space on a Tab-focused Zoom in zooms one step instead of starting pan mode; shortcuts that do not conflict with a control, such as Shift+1, keep working. While the zoom menu or the Reset dialog is open, the canvas handles only Escape. Clicking a control with the mouse does not move focus to it, so Space pans right after a click. The percentage button opens a zoom menu with Zoom to fit, 50%, 100% and 200%.

Camera memory: the UI Flow opens fitted to all frames, and Fit canvas stays pressed while the fit keeps tracking resizes and measured preview sizes; the first pan, zoom or frame move ends tracking. The camera of the complete flow is stored per prototype in sessionStorage under `prototype-inspector:flow-camera:<prototypeId>` whenever it comes to rest, and is restored when the UI Flow remounts in the same browser tab (for example after visiting Components). A missing or malformed value falls back to the fit. The camera is never written into the flow layout payload.

Saving happens on release: a frame drag updates only the moved frame and its connected edges until the pointer is released, then commits the rounded position as one layout action. Layout changes reach localStorage once per committed action (releasing a frame or node that moved, confirming Reset Layout, or a successful import); opening the canvas, panning, zooming and mid-drag movement write nothing, so the `StaticFlow` story picks up a moved frame or node after the drag is released, not during it.

Labels: frame titles, formFactor badges and edge labels are drawn in a screen-space layer, so they keep a readable size at every zoom level. A frame narrower than 48 screen pixels hides its label until hovered, and an edge label stays hidden until hovered when both of its frames are narrower than 150 screen pixels.

Level of detail: a frame loads its route only when it is large enough to read. Each time the camera comes to rest, every route frame takes one of four tiers:

- Culled: outside the canvas plus half a canvas on each side; only its box is positioned.
- Placeholder: narrower than 40 screen pixels; a flat surface.
- Snapshot: a cached image of the route UI, or a skeleton with the route title and id until the first snapshot exists.
- Live: the route's real iframe. A frame becomes live at 80% zoom or more with at least 40% of it on screen, or after the pointer rests on it for 200 ms at 40% zoom or more, and stays live down to 64% zoom while any of it is visible.

At most 6 frames are live at once, plus one frame another canvas feature pins live and the snapshot renderer, so the page never holds more than 8 route iframes. When more frames qualify, the frames showing the largest area on screen win, then frames that are already live, then those nearest the center. Only one iframe loads at a time, and a loading frame keeps its snapshot or skeleton on top until its story has rendered, so a frame never flashes blank when it becomes live. Route iframes are inert (`inert`, `tabindex="-1"`, `aria-hidden="true"`), so Tab never moves focus into a route document. Each route's measured preview size is cached with its snapshot, so frames keep their size in every tier.

Snapshots: one hidden renderer iframe, outside the comment canvas, loads the route preview URL and switches routes in place (Storybook's `FORCE_REMOUNT`); the Inspector draws its DOM into a WebP image. Captures run one at a time while the browser is idle, visible frames first, and pause while the canvas is panned, zoomed or dragged.

Snapshot cache: snapshots are kept per browser in the IndexedDB database `prototype-inspector-snapshots` (object store `tiles`, at most 300 records and 60 MB, least recently used first). Reopening the UI Flow shows the cached snapshots at their cached sizes at once, then recaptures each route once per page session and replaces only the snapshots whose markup changed. To clear the cache, delete the `prototype-inspector-snapshots` database in the browser's developer tools (Application > IndexedDB in Chrome) or clear the site data of the Storybook origin. When IndexedDB is unavailable, snapshots are kept in memory for the page session.

Code updates: in Storybook dev mode, every Vite hot update marks the open prototype's snapshots as out of date (their frame labels show a ↻ badge) and recaptures them, visible frames first, once the renderer has applied the same update; live frames refresh their own route's snapshot.

Known limitations:

- Storybooks served from the same origin (for example two projects that both run on `localhost:6006`) share the snapshot database: a frame can briefly show the other project's snapshot for the same story, prototype and route ids until its recapture replaces it.
- Snapshots are for finding your way around the flow, not for pixel review; zoom in until a frame is live to review the real route.
- Opening the UI Flow from the Static Flow story (`figmaExport.flowStoryId`) makes no snapshots: frames that are not live show skeletons.
- A story's `play` function runs every time the renderer or a live frame loads or remounts the story, so open the UI Flow from a story without a `play` function.
- The renderer relies on Storybook 10.x's `FORCE_REMOUNT` event and `storyRenderPhaseChanged` messages (verified with Storybook 10.4.1); when a route switch does not render in time, it reloads its iframe instead.

figma-export addon: when the addon's export workspace is open (`globals=figmaExport:on`, as in the tab Open Static Flow opens), the UI Flow canvas keeps its full size and the dock floats above it (the canvas pans, so anything under the dock can be moved into view); the zoom and layout groups move to the left edge of the canvas so the addon's comments toggle and dock never cover them, and while the dock is expanded the layout group wraps within the width the dock leaves (side dock) or sits above it (bottom dock, below 720 pixels).

Comments on the UI Flow canvas: with figma-export addon 0.14.0 or later, the addon listed before the inspector preset in `.storybook/main.*` `addons` (`install_prototype_inspector.mjs` places it that way and reorders an inverted list), and the project calling `configureFigmaExportReview` in `.storybook/preview.*`, reviewers can comment on the canvas while Figma export is on:

- Where: on a route frame's page (the area below its name), on a flow-only node, on a key transition line, or on blank canvas between frames. The comment sticks to that frame, node, position along the line, or canvas point.
- Pins follow: panning, zooming and dragging frames move the pins in the same animation frame, and a pin on blank canvas keeps its canvas position.
- Zoomed out: frames that are not live show cached snapshots. A comment on such a frame still sticks to its route; screenshots of line and canvas comments draw the pages of live frames only, and the other frames appear as their snapshots or skeletons.
- Separate from Story comments: UI Flow comments are recorded in the `ui-flow` view; the comments panel lists the current view's comments (the **Comment views** switch shows the others), and reports filter by view. **Show location** on a comment whose pin is off screen moves the camera to its frame, line or point.
- Figma export: UI Flow does not export a Figma payload. The export panel says **Open Static Flow to export this flow.** and links the Static Flow story when the prototype declares `figmaExport.flowStoryId`. Docs, Components and Data modes offer neither comments nor export.

The canvas talks to the addon only through DOM attributes (`data-sbfx-view`, `data-sbfx-anchor`, `data-sbfx-canvas`, `data-sbfx-export`, `data-sbfx-comments`) and DOM events (`sbfx:anchors-moved`, `sbfx:reveal-anchor`); the Inspector imports nothing from the addon, so without it the canvas behaves exactly as before.
