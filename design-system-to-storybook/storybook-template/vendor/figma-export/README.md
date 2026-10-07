# @harrychuang/storybook-addon-figma-export

Storybook 10 addon: export a rendered story into a Figma import payload (payload version 2). Core export works with React, Vue, Svelte, Angular, and Web Components because every preview decorator returns the renderer story result unchanged and the addon UI is plain DOM mounted outside the story root. React + Vite and Vue 3 + Vite have the full verified Export review, Visual Comments, meeting, evidence, persistence, report, and source-action workflow; other renderer/builder combinations retain core export unless the installer capability report says otherwise. The preview and review bundles import no React, React DOM, or Storybook icons. Exports are scoped to `#storybook-root` by default (falling back to `document.body` with a warning). When both tools are enabled, Figma export and Export review share one responsive workspace dock that reserves Story canvas space instead of covering the rendered UI (a host-declared pannable canvas keeps its full size, and the dock floats above it). Prefers a three-layer CSS token model (`ref`, `sys`, `comp`); projects without layered tokens still export with an empty variable set.

## Visual fidelity capture

Beyond layout, tokens, and SVG, the exporter captures:

- **Shadows** — `box-shadow` (including `inset`) and `text-shadow` export as `styles.effects` (`DROP_SHADOW` / `INNER_SHADOW`).
- **Per-corner radius** — asymmetric `border-radius` exports as `styles.radiusCorners`; percentage radii approximate to the shorter box side.
- **Raster images** — non-SVG `img` and `canvas` elements embed as PNG base64 (`imageBase64`, longest side capped at 2048px) with `imageScaleMode` mapped from `object-fit`.
- **Modern colors** — `oklch()`, `lab()`, `color()`, `hsl()`, and named colors normalize to hex/rgba through the browser color engine (clamped to sRGB), for both computed styles and token raw values.
- **Text styles** — `text-transform` is baked into the exported string, rendered line breaks are preserved (`<br>`, `white-space: pre*`), and `letter-spacing`, `text-decoration` (underline/line-through), and `font-style: italic` export as text fields. CSS font-family fallback lists remain available in token `rawValue`, while the Figma variable `value` is normalized to one unquoted family so both JSON and Console-script imports avoid combined-family font errors.
- **Measured auto layout** — flex containers derive item spacing and effective padding from the children's real bounding rects, so margin-driven spacing, `space-around`/`space-evenly` (measured edge offsets become padding), `order`, and `row-reverse`/`column-reverse` visual order survive. Column containers read `row-gap` as the main-axis gap. CSS border widths fold into the exported padding (borders take layout space in CSS but Figma inside strokes do not). Non-uniform spacing (that `space-between` cannot explain) falls back to pixel-true absolute layout.
- **Flex wrap** — wrapped flex containers export `layoutWrap: "WRAP"` with measured in-line `gap` and `counterAxisSpacing`.
- **Mixed inline text** — bare text nodes that sit next to inline elements (`Hello <b>world</b> tail`) export as their own text leaves with Range-measured bounds instead of being dropped; the containing frame keeps every child at its measured position.
- **Wrapped text** — multi-line text keeps its browser wrap width and exports `textGrowHeight: true` (importer ≥ 1.3.0 maps it to Figma's fixed-width `HEIGHT` auto-resize; older importers keep the fixed box as before), so Figma re-flows the height with its own font metrics instead of unwrapping the paragraph into one long line. Single-line truncation (`text-overflow: ellipsis`) and multi-line `-webkit-line-clamp: N` export as `maxLines` + `textTruncation: "ENDING"`.
- **Backgrounds** — multi-layer `background-image` lists are split per layer: `linear-gradient` (including `to top right` corner keywords, resolved against the box aspect ratio), `radial-gradient` stops, and `url()` bitmaps (fetched and embedded like `img` captures, `background-size` mapped to `imageScaleMode`) all export together with `background-color`.
- **Blur filters** — `filter: blur()` exports as a `LAYER_BLUR` and `backdrop-filter: blur()` as a `BACKGROUND_BLUR` entry in `styles.blurEffects` (kept apart from shadow `effects` so older importers still accept the payload).
- **Border styles** — uniform `dashed`/`dotted` borders export `styles.borderStyle` for the importer's dash patterns; text boxes inset their inner text by border width in addition to padding.
- **Structure** — `display: contents` wrappers expand to their rendered children, and absolutely positioned siblings are ordered bottom-to-top by `z-index` (positioned-over-static included) before export.
- **CSS transforms** — rotated elements export their untransformed box plus a rotation-only `transformMatrix` (importer ≥ 1.4.0 applies it as `relativeTransform`), with full nested-transform tracking: counter-rotated inner content (`rotate(45deg)` badge with a `rotate(-45deg)` label) carries the correct inverse rotation, and `scale()` folds into exported sizes and font sizes. Containers holding transformed children switch to pixel-true absolute layout. Skews and mirror flips fall back to the axis-aligned bounding box.
- **Form controls** — `<input>` values (passwords masked as bullets), placeholders (with the real `::placeholder` color), `<textarea>` content, and the selected `<option>` label export as text nodes; single-line controls center their text vertically. Native checkbox/radio/select glyphs are browser chrome and not captured — use custom-styled (`appearance: none`) controls or `data-figma-rasterize`.
- **Rasterize escape hatch** — `data-figma-rasterize="true"` exports that subtree as one bitmap exactly as painted (canvas/WebGL, conic gradients, masks, any CSS the node graph cannot represent).
- **Browser reference snapshot** — every export attaches a PNG render of the story (`payload.reference`, disable with `referenceImage: false`); the importer places it as a locked "Browser Reference" layer beside the import so any remaining gap is visible at a glance.
- **Binding correctness** — token bindings skip rules inside non-matching media queries and rank matching declarations by CSS specificity (inline styles highest).
- **Value-preserving bindings** — computed styles are ground truth: a token binding is exported only when the variable's resolved value matches the style value it would replace in Figma (numbers within subpixel tolerance, colors channel-wise, font families by first candidate). Unitless line-height ratios, padding tokens on bordered auto-layout boxes, and locally overridden custom properties are pruned instead of repainting the node with the raw token value; the importer double-checks the same invariant at bind time.

Known limitations (by design): browser/Figma font metrics may wrap text differently; skew/mirror transforms, masks, and non-blur filters are not captured structurally (use `data-figma-rasterize`); wide-gamut colors clamp to sRGB; raster embeds cap at 2048px and reference snapshots skip stories larger than 8 megapixels; icon-font glyphs render only when the same font exists in Figma.

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

The store also keeps a **synced baseline** per story — the "last confirmed sync" copy used by the `figma-sync-back` skill's three-way comparison. Regular exports never overwrite it:

- `POST /__figma-export/payloads/<storyId>/promote` copies the current payload into `synced/<storyId>.json` and answers 200 with a baseline summary; promoting a story that has no current payload answers 404.
- `GET /__figma-export/payloads/<storyId>/baseline` answers the frozen baseline payload, or 404 when the story was never promoted.
- List summaries carry `hasBaseline` and `baselineGeneratedAt` so tools can detect stale baselines at a glance.

Promote only after a sync is confirmed (the Figma import matches the story again) — the baseline is the reference point that lets the sync-back comparison tell "Figma changed" apart from "code changed".

## Verification suite

Run from the addon root (after `npm run build` for the store test):

```bash
node test/run-export-fixture.mjs      # capture features incl. shadow DOM case
node test/run-overlay-fixture.mjs     # renderer-agnostic overlay + token-less + auto-sync
node test/run-payload-store-test.mjs  # bridge store endpoints (CORS, sanitize, round trip)
npm run test:visual-comments          # store, HTTP, safe report, CDP browser/UI fixture
npm run test:renderer-fixtures        # real React and Vue 3 Storybook builds
npm run test:renderer-parity          # shared React/Vue browser behavior contract
npm run test:renderer-neutral         # strict identity, lifecycle, forbidden imports
```

The browser runners bundle the sources, render the fixtures in headless Chromium, and assert the spec scenarios; payloads land in `test/.last-fixture-payload.json`.

## Install

This copy is bundled by the `design-system-to-storybook` skill. During normal
skill usage, do not install it from GitHub. Run the skill installer from the
skill root instead:

```bash
node scripts/install_figma_export_addon.mjs <product-repo-root>
```

The installer detects the Storybook renderer, builder, and major version before
any mutation. It packs this package into a versioned tarball under
`.storybook/vendor/`, installs that immutable local file dependency, and safely
wraps ESM `.storybook/main.*` and `.storybook/preview.*` with generated
renderer-neutral wiring. Use `--renderer` only to resolve conflicting static
signals, `--json` for the capability report, or `--skip-configure` when the
project already owns equivalent wiring.

Requires `storybook@^10`. React and React DOM are optional peers used by the
Storybook manager/React projects; Vue product code does not need to declare
either dependency.

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
When the toolbar toggle is on, the exporter overlay renders `Copy JSON` and
`Download JSON` as separate full-width rows. `Console script` and the icon-only
`Copy design to Figma` action share one equal-width two-column row. The Figma
copy action writes an SVG design representation to the clipboard so it can be
pasted directly into Figma for quick visual review.

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

Replace `your-prefix-` with the class prefix used by your component library, or use an empty array when you want the exporter to derive layer names without a project prefix. `storyTitlePrefix: false` keeps the addon available for every story; set it to a string or string array only when your project wants to filter exports. Prefixes are matched with `startsWith` against the full story title, so use top-level namespaces such as `Components/` — a deeper prefix like `Components/Examples/` silently excludes every sibling subcategory (`Components/Actions/...`).

Adjust `figmaExportOptions` for your design tokens and story naming.

### Export review panel

Use the bundled review helpers when you want Storybook to track each story's
Figma source URL and export/import review state. The
`design-system-to-storybook` skill wires this review decorator by default so the
Open source action is available when source URLs can be resolved.

Keep review settings in one project-local `.storybook/figma-export.config.ts`.
Both the preview decorator and Vite plugin must import that same object; do not
repeat status or comments endpoint strings in `main.ts` and `preview.ts`.

`.storybook/main.ts`:

```ts
import type { StorybookConfig } from "storybook";
import { createFigmaReviewStatusPlugin } from "@harrychuang/storybook-addon-figma-export/review-server";
import { figmaExportProjectConfig } from "./figma-export.config";

const config: StorybookConfig = {
  // ...stories, addons, framework
  async viteFinal(config) {
    return {
      ...config,
      plugins: [
        ...(config.plugins ?? []),
        createFigmaReviewStatusPlugin({
          apiPath: figmaExportProjectConfig.review.apiPath,
          filePath: figmaExportProjectConfig.review.statusFilePath,
          name: figmaExportProjectConfig.review.pluginName,
          commentsEnabled: figmaExportProjectConfig.review.commentsEnabled,
          commentsApiPath: figmaExportProjectConfig.review.commentsApiPath,
          commentsDir: figmaExportProjectConfig.review.commentsDir,
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
import { configureFigmaExportReview } from "@harrychuang/storybook-addon-figma-export/review";
import { getFigmaSourceUrl } from "@harrychuang/storybook-addon-figma-export/source";
import { figmaExportProjectConfig } from "./figma-export.config";
import "@harrychuang/storybook-addon-figma-export/styles.css";

configureFigmaExportReview(figmaExportOptions, {
  apiPath: figmaExportProjectConfig.review.apiPath,
  visualComments: figmaExportProjectConfig.review.visualComments,
  getFigmaSourceUrl(context) {
    return getFigmaSourceUrl(context.parameters, context.title ?? "", {
      componentSpecModules,
      designSystemFileUrl,
      nodeOverrides,
    });
  },
});

const preview: Preview = {
  globalTypes: {
    ...createFigmaExportGlobalTypes(figmaExportOptions),
  },
  initialGlobals: {
    ...createFigmaExportInitialGlobals(figmaExportOptions),
  },
};
```

`configureFigmaExportReview` hands the export overlay and the review panel to
the decorator the addon already registers for every story (Storybook loads the
addon's `./preview` entry, which exports `decorators`), so nothing goes into
`decorators`. Because that decorator belongs to the addon, it wraps the
decorators of addons listed after it in `main.ts`. List
`@harrychuang/storybook-addon-figma-export` before any addon whose decorator
renders its own view, such as the Prototype Inspector preset, so the panel and
comments also work in that view. `createFigmaExportReviewDecorator` still works;
when a project keeps it next to `configureFigmaExportReview`, the panel mounts
once.

The default source resolver reads `parameters.figmaSourceUrl`,
`parameters.figma.url`, or `parameters.design.url`. Use `getFigmaSourceUrl`
for project-specific fallbacks, such as parsing local design-system Markdown.
The fallback inputs (`componentSpecModules`, `designSystemFileUrl`, and
`nodeOverrides`) should come from project-local Storybook config, not from the
addon package.

The Figma export and Export review disclosures use the same action-oriented
14px icon language. Expanded controls show an inward **Collapse** pair, while a
collapsed Export review control shows an outward **Unfold More** pair. The
compact Figma export surface continues to hide its glyph and uses the full
Figma-mark-plus-version surface as the accessible Expand control.

### Visual comments

The renderer-neutral review helper adds a visual comments tool to every included
Story. Commenting takes four steps and never needs the panel to be open:

1. Press **C**, or open the top-right Comment icon launcher and choose
   **Add comment**. A prompt appears on the Story; **Esc** cancels.
2. Click the element. The capture-phase handler blocks that pointer sequence
   before the prototype can change state, captures the current preview with
   `html-to-image`, removes nodes marked `data-sbfx-capture-ignore`, and opens a
   composer beside the numbered pin.
3. Choose the **Comment type** and type the comment. The body field already has
   focus. Drag the pin on the Story, or focus it and use Arrow keys (1%) and
   Shift+Arrow keys (5%), to adjust the point; the composer follows the pin.
4. Press **Cmd/Ctrl+Enter**, or choose **Save comment**. **Esc** or **Cancel**
   discards the pin.

No meeting has to be started first. When none is active, the first saved comment
creates one titled `Notes YYYY-MM-DD` (the local date) and later comments reuse
it. For a group review, use **Start a named meeting** in the panel footer to give
the meeting its own title; **End meeting** closes it. Other browsers on the same
Storybook host discover the active meeting through five-second polling, and a
comment saved while another browser starts a meeting lands in that meeting.

Saving a comment does not reload the preview. The review status plugin excludes
its comments directory, review status file, and payload directory from the dev
server's file watching by itself, so the prototype stays in the state you were
annotating and no project configuration is needed.

The composer sits beside the pin and flips to the other side near the viewport
edge; below 720px wide it docks to the bottom edge, or to the top when the pin
would be covered. It stays open when the panel is collapsed or expanded.

The expanded panel shows the **Comments** heading with the active meeting title,
**Reports**, the primary **Add comment** action, a kind filter (**All**,
**Visual fix**, **Tracking**, each with its count), the comment list, and a
**Meetings** section.

**Meetings** lists the active meeting (marked **Active**), the five most recent
closed meetings, and any older meeting that holds a comment on the current Story,
each with its comment count and an **Open report** link. A meeting that holds
comments on the current Story also has a **View** switch showing how many, for
example **View 2**. Turning it on lays that meeting's comments over the Story:
the list, the kind counts, the pins, Edit and Delete, and the tracking handoff
all follow the viewed meeting, and **Viewing** above the list names it. One
meeting is viewed at a time; turning another one on turns the first off. Every
switch starts off when the panel mounts and when you move to another Story, so
the list first shows **Turn on View for a meeting below to see its comments and
pins.** (or **No comments on this story yet.** when no meeting has one). Saving a
comment turns on the meeting that stored it, so the new pin appears at once.
Comments of a closed meeting can be edited and deleted from the panel as well;
the requests go to that meeting.

The list shows the viewed meeting's comments on the current Story, newest
first, with the same numbers as that meeting's report, kind, Open/Completed
status, author, and time. The list scrolls inside the panel.
The footer shows **Commenting as** with the stored display name (or
`Anonymous`); **Change** sets it once and the composer never asks for it.
Clicking a comment's pin, or choosing Edit on a comment whose pin is shown,
opens an edit panel beside that pin, placed like the composer (it flips near the
viewport edge and docks to the top or bottom edge below 720px). It shows the
screenshot taken with the comment, with the comment number marking its point
(at most 296 × 200 pixels; **Moved since the screenshot** below it when the
comment has moved), then **Comment type**, the body, **Cancel**, and **Save
changes**; the pin's hover card stays hidden while its panel is open. The panel follows the pin while the canvas pans or the pin is
dragged, a press outside does not close it, and **Save changes** stores the body
and kind; move the pin itself by dragging it. When the pin is off screen, the
panel first asks the page to show its location (see Comment views and anchors);
when no pin can be shown, for example a comment listed from another view, a pin
scrolled out of the viewport, or with **Pins** off, Edit opens a capture-ignored
overlay modal with the stored screenshot and numbered point. In the modal, click
or drag the numbered pin or use Arrow keys (1%) and Shift+Arrow keys (5%) when
the point can be edited; a line, canvas, or moved comment shows its point fixed
(with **Moved since the screenshot** for a moved one). **Save changes** stores the
body, a changed kind, and an edited point in one atomic update. In both, Cancel or Escape (and
the modal's backdrop) restores the drafts and returns focus to Edit; a failed
update keeps the drafts open, and a successful update closes the editor and
leaves the panel expanded. Pins use one
meeting-wide `1..N` sequence across Stories and captures; deleting a comment
recomputes a contiguous sequence. The **Reports** route remains the single place to browse
active and closed meetings that still contain a capture or comment. Meetings with
`0 captures · 0 comments` and empty group headings are omitted; when no meeting has
evidence, the index renders one empty state. Canonical meeting JSON and direct session
report URLs remain readable. Each session report contains its
snapshots on the addon's dark raised surface, pins, authors, comments, timestamps,
and Story metadata.

While the panel is expanded and a meeting is viewed, every comment of the
current Story in that meeting also shows as a
numbered pin on the Story at the point it was placed: a circle for a
**Visual fix**, a rounded square for **Tracking**, and a subdued color once the
comment is Completed. Pins follow the kind filter; **Pins** in the panel toolbar
hides them, and collapsing the panel removes them so they never block the
prototype while you are using it. Clicking a pin selects its comment in the list,
opens its edit panel, and never triggers the control beneath it; the selected
comment's pin keeps a ring, clicking it again scrolls back to the comment, and
clicking another pin switches the panel to that comment (an unsaved draft is
dropped, as with **Cancel**). Dragging a pin (past 4
pixels) moves the comment: the pin follows the pointer, Escape puts it back, and
releasing it saves the new location at once. A focused pin also moves with the
Arrow keys (1 pixel, 10 with Shift) and is saved 600 ms after the last key or
when it loses focus. After a move the panel shows **Comment moved.** with
**Undo** for 5 seconds; a failed move puts the pin back and says why. The
release is resolved like a new comment: a frame, then a line within 8 pixels,
then the canvas (see Comment views and anchors); a comment without an anchor
keeps a ratio position, and an anchored comment dropped where nothing resolves
goes back with **Drop the pin on a frame, a line or the canvas.** Moving a
comment within the frame it was captured on keeps its screenshot point in step;
any other move keeps the screenshot as it was and marks the comment **Moved
since the screenshot** in the list, the pin card, the report, and the AI prompt. While you are placing
a new comment, saved pins stay visible but let clicks through, so a point under
a pin can be commented on again. Hovering or focusing a list item highlights
its pin. Hovering or focusing a pin shows a card beside it with the comment,
its kind and status, author and time, and the screenshot taken when the comment
was made (or **Screenshot unavailable**); compare it with the Story to tell
whether a comment from an older meeting still points at the right element. When
the preview is too narrow for the card on either side of the pin, as in a
phone-width preview, the card appears below the pin (above it near the bottom
edge) so it never covers the pin. A
pin is a position ratio within the capture target, not a link to an element, so
it does not follow a component that moves, unless the page declares anchors
(see Comment views and anchors below).
A comment whose screenshot is missing still shows its pin. When `captureSelector`
is set and matches no element, no pins are shown. A comment
captured in a different route or state (recorded from the prototype root's
`data-route` and `data-prototype-state`) shows no pin and is marked
**Captured in another state** in the list; the addon does not replay state.

Keyboard shortcuts act only in Story view and only while focus is outside an
input, textarea, select, or contenteditable element, so typing `c` into a
prototype field is never intercepted. Set `visualComments.shortcuts` to `false`
when the prototype itself uses the **C** key; **Esc** keeps cancelling.

| `visualComments` option | Description |
| --- | --- |
| `enabled` | Turn visual comments off with `false` |
| `apiPath` | Same-origin comments API path |
| `captureSelector` | Capture target; `"body"` includes portals |
| `authorStorageKey` | `localStorage` key of the display name |
| `shortcuts` | `false` disables **C** and **Cmd/Ctrl+Enter** (default `true`) |

Upgrading from 0.14.x: saved pins can be dragged (and moved with the Arrow
keys) to move their comments, with **Undo**, and clicking a pin or Edit opens an
edit panel beside the pin, with the comment's screenshot, instead of a centered
modal whenever the pin is shown. Line and canvas comments now capture the pages
of the visible frames (up to 12) into their screenshot. Moving needs the 0.15.0
review server: the comment edit request gains `anchor` (a move) and, together
with `anchor` and `pin`, `movedAt` (a restore), and an older server rejects
them, so the panel puts the pin back and shows the error. A comment moved
somewhere its screenshot no longer shows stores `movedAt` and reads **Moved
since the screenshot**; its screenshot point is then fixed. Stored meetings need
no migration.

Upgrading from 0.13.x: call `configureFigmaExportReview(figmaExportOptions,
reviewOptions)` once at module level in `.storybook/preview.ts` and remove
`createFigmaExportReviewDecorator(...)` from `decorators`. The addon's own
decorator then renders the panel, including in views that a later addon renders
itself (such as the Prototype Inspector's UI Flow), so list the addon before
those addons in `main.ts`. Keeping the old decorator still works and the panel
mounts once, but those views stay without comments. Comments gain optional
`anchor` and `story.view` fields (see Comment views and anchors); a 0.13.0
server ignores them, and stored meetings need no migration. Comment screenshots
now keep the paint of SVG children styled by stylesheet rules, and the workspace
reservation now also narrows a fluid `#storybook-root` (its size variables used
to be scoped to the workspace and never reached the Story root), except a Story
root that holds a host-declared canvas (`data-sbfx-canvas`): a canvas pans, so
it keeps its full size and the workspace floats above it.

Upgrading from 0.12.x: the panel no longer shows the active meeting's comments
as soon as it opens. Turn on the meeting's **View** switch under **Meetings**
(saving a comment does it for you). In exchange, any earlier meeting with
comments on the current Story can be viewed the same way, without opening its
report. The comments overview (`GET <apiPath>?storyId=<id>`) now returns that
Story's comments from every meeting, each with its `sessionId`, plus a
`meetings` list for the panel; without `storyId` it is unchanged. Stored meetings
need no migration.

Upgrading from 0.12.0: captures — comment screenshots, the browser reference
snapshot, and `data-figma-rasterize` — no longer copy every CSS custom property
onto every cloned node. In a project with thousands of design tokens that copy
froze the tab for minutes on a screen of a few hundred nodes. A custom property
is now copied only when the captured markup references it through `var()` (for
example `fill="var(--token)"` inside an inline SVG). Nothing to configure or
migrate.

Upgrading from 0.11.x: the report page has a new layout (see Reports below), the
panel gains saved pins and the tracking handoff, and the workspace keeps 38% of
the viewport height (up to 340px) instead of 46% (up to 420px) while the comments
panel is expanded, so the comment list has more room. Stored meetings need no
migration.

Upgrading from 0.10.x: the comment composer and the capture prompt are no longer
inside the panel, the launcher uses the Comment icon, and the panel list shows
every current-Story comment instead of the newest three. Project CSS that
targeted the old panel structure needs to be revisited. Stored meetings need no
migration.

```ts
createFigmaExportReviewDecorator(figmaExportOptions, {
  apiPath: figmaExportProjectConfig.review.apiPath,
  visualComments: figmaExportProjectConfig.review.visualComments,
});

createFigmaReviewStatusPlugin({
  apiPath: figmaExportProjectConfig.review.apiPath,
  commentsEnabled: figmaExportProjectConfig.review.commentsEnabled,
  commentsApiPath: figmaExportProjectConfig.review.commentsApiPath,
  commentsDir: figmaExportProjectConfig.review.commentsDir,
});
```

Canonical `meeting.json` files and content-addressed PNG/WebP assets are written
under `design-system/figma-export-review/`; `index.html` and per-meeting reports
are derived, portable projections with relative asset paths. Each comment places
an accessible Trash icon aligned to the left edge, with **Copy AI prompt**, Edit,
and Complete/Reopen grouped in that order at the right edge. Both active and
closed reports show the stored screenshot inside each comment editor and allow
its body and normalized point to be edited in place; Save changes updates both
in one request without recapturing or replacing the image, while Cancel keeps
the canonical comment unchanged.
It produces the same provider-neutral Markdown for Claude, Cursor, Codex, and
other assistants, including the review text, Story metadata, normalized pin,
viewport, a repository-root-relative screenshot path when safe, the report path,
and the same-origin screenshot URL. The report first attempts one clipboard item
with both Markdown and a PNG screenshot. Browsers without rich clipboard support
fall back to text, and the prompt tells an assistant to request a manual image
attachment instead of guessing when it cannot inspect any screenshot reference.
No absolute host path, provider command, API key, or AI network request is added.

**Reports.** A meeting report keeps a toolbar pinned while you scroll: the
meeting title and counts, a kind filter (**All**, **Visual fix**, **Tracking**
with counts), **Hide completed**, and the tracking batch control. The filter
state is written to the URL fragment (for example
`#kind=tracking&completed=hidden`), so a shared link opens the same view; a
filter never changes what **Copy tracking prompts** collects. At 1024px wide or
more each capture shows its screenshot beside its comments; narrower windows
stack them. Timestamps are shown in the viewer's local time as
`YYYY-MM-DD HH:mm`, with the stored ISO value in the `title`. The capture heading
is plain text with an **Open story** link when the stored Story URL is a valid
HTTP(S) URL.

The Trash icon's first activation only opens an accessible in-page confirmation
without depending on the native dialog API; Cancel, Escape, or clicking the
backdrop sends no request, and Confirm delete removes the comment, its
unreferenced capture record, and an image asset only after no remaining capture
shares that path. Screenshot pixels are otherwise durable evidence—route/state
fields are metadata, not state replay.

This is a trusted-LAN, same-origin tool with no authentication. Do not expose
the writable middleware to an untrusted network. DOM-to-image capture is not a
framebuffer recorder: video, WebGL, nested iframes, cross-origin images without
CORS, and some browser-only CSS may fail or differ. It does not promise
pixel-perfect browser chrome capture. Rollback may remove the UI/middleware but
must not delete the review directory; retained reports and canonical data stay
readable.

### Comment views and anchors

A host page, such as a canvas that lays several screens side by side, can tell
the addon which view is showing and what a comment sticks to. The addon reads
these attributes only inside the capture target (the export attribute inside the
export scope) and matches anchor ids by attribute value, so an id may contain
characters such as `>` or `:`.

| Attribute | Where | Meaning |
| --- | --- | --- |
| `data-sbfx-view="<name>"` | The host's root element | Current comment view. Names match `^[a-z0-9][a-z0-9-]{0,39}$`; anything else, or no attribute, is `story` |
| `data-sbfx-anchor="<id>"`, optional `data-sbfx-anchor-label`, `data-sbfx-anchor-route` | An HTML element people comment on, such as a frame | Element anchor: the pin keeps its point inside the element in layout pixels; the first element in document order wins |
| `data-sbfx-anchor="<id>"` with `data-sbfx-anchor-kind="path"`, optional `data-sbfx-anchor-label` | An SVG `polyline`, `polygon`, `line`, or `path` | Path anchor: a click within 8 CSS pixels of the line sticks to that position along it |
| `data-sbfx-canvas` | The canvas container | Canvas anchor scope: a click elsewhere on the canvas is stored in world coordinates with up to two nearby element anchors; pins outside it are hidden |
| `data-sbfx-canvas-world` | The panned and zoomed layer inside the canvas (`transform-origin: 0 0`) | World coordinate system |
| `data-sbfx-comments="unavailable"` | Any element in the capture target | Comments are not offered: **C** and **Add comment** show **Comments are not available in this view.** |
| `data-sbfx-export="unavailable"`, optional `data-sbfx-export-label`, `data-sbfx-export-href` | Any element in the export scope | Figma export is not offered: the export panel shows a notice and, when given, a same-origin link instead of the export actions |

A click resolves to an element anchor first, then a path anchor, then the
canvas; with none of them it is an ordinary ratio pin. The screenshot pin is
always stored as well.

The host tells the addon about movement and receives requests through two
events:

- When anchored elements move without a re-render (panning, zooming), dispatch
  `new CustomEvent("sbfx:anchors-moved", { bubbles: true })` on `document` or
  any element in it. The addon repositions every visible anchored pin inside the
  handler, so pins stay on their frame in the same frame of animation.
- **Show location** on a comment whose anchor is off screen dispatches a
  bubbling, cancelable `sbfx:reveal-anchor` event on `document` with
  `detail = { commentId, view, anchor }`. Bring the anchor into view and call
  `preventDefault()`; otherwise the panel shows **This location is not
  available in this view.**

Each comment records its view (`capture.story.view`, omitted for `story`). The
panel lists and pins the current view's comments; the **Comment views** switch
shows other views' comments in the list, and their pins appear only in their
own view. Reports have a **View** filter, and the handoff prompt adds
`Comment view` and `Comment location` lines. An element-anchored comment
captures the element itself; when the element holds a same-origin preview
iframe whose page runs the review runtime, the screenshot is that page. Path and
canvas comments capture the canvas and draw into it the pages of up to 12
visible frames whose same-origin preview iframe runs the review runtime (a frame
that fails or takes longer than 4 seconds stays empty); element comments
without such an iframe capture the element at its layout size. When an anchored element's size has
changed since the comment, the list marks **Layout changed since this comment**.
Every saved pin can be dragged to a new frame, line, or canvas point; the
modal's point editing stays limited to comments without an anchor and
element-anchored comments that have not moved since their screenshot, and the
others show their screenshot with the point fixed.

While placing a pin, only the primary button places it; other buttons reach the
page and keep capture mode on. The rest of the placing click sequence (a second
press within 500 ms, its click, `dblclick`, and `contextmenu`) never reaches the
page, and Escape in capture mode, the composer, and the Edit and Delete dialogs
never reaches page key handlers.

### Tracking comments

Every visual comment has a kind: **Visual fix** (the default) or **Tracking**.
Use Tracking to mark an analytics requirement on the Story the same way you
would comment on a design file, then hand the comments to a coding assistant.

1. Press **C** (or choose **Add comment**) and click the element to instrument.
2. In the composer beside the pin, set **Comment type** to **Tracking**, write
   the requirement in free text, and press **Cmd/Ctrl+Enter**.
3. Open **Reports**. A Tracking card's **Copy AI prompt** produces a
   `# Tracking Instrumentation Request` instead of the visual fix request.
4. To hand over several at once without leaving the Story, view the meeting
   under **Meetings** and use **Copy tracking prompts** in the panel footer. It
   copies one request containing the viewed meeting's Open Tracking comments on
   the current Story in ordinal order; **Copy all stories** appears beside it
   when other Stories of that meeting also have Open Tracking comments. This
   works for closed meetings too. The same batch is available on the meeting's
   report, where **Tracking scope** narrows it to one Story. Completed comments
   and Visual fix comments are never included, and both places produce identical
   Markdown.

The request asks the assistant to derive four fields per comment — event name,
parameters, recording timing, and value definitions — to write `unspecified` for
a field the comment does not state, and to ask before implementing it. It tells
the assistant to reuse the repository's existing tracking call convention, not to
add an analytics SDK, and not to invent events or parameters. A comment that
states all four fields needs no follow-up question, for example:

```text
點擊「送出」時送 order_submit_click；參數 stock_id（目前股票代號）、amount（下單張數，整數）。
只在送出成功後記錄一次，重送不重複計算。
```

A short comment such as `依埋點文件的 order_submit_click` also works when the
repository already documents the event; the assistant asks about anything left
`unspecified`.

The kind label appears in the panel's recent comments, in the edit panel and
modal, and on every report card. A comment saved with the wrong kind can be
corrected without losing its screenshot: change **Comment type** in the edit
panel beside its pin (or the edit modal when the pin is not shown) or in the
report's inline editor and save.

The composer preselects the kind of the last saved comment, so a run of
tracking comments needs **Tracking** chosen only once. Saving no longer reloads
the preview, so that preselection normally just stays in the page. For reloads
from other causes within 15 seconds of a panel request, the kind is also carried
in a `sessionStorage` entry that is removed as soon as it is read. Any other page
load — a manual refresh, a source change, or a new tab — starts from
**Visual fix** again. The kind is never written to `localStorage`.

The batch copy is text only. Each comment lists its repository-root-relative
screenshot path so a coding agent running at the repository root can open the
image; a single card's **Copy AI prompt** still attaches the screenshot when the
browser supports it. Nothing here sends an AI request: the addon only writes
text to the clipboard.

When the Story belongs to a prototype that keeps a Data Authority registry
(`DATA_SPEC.md`), the request tells the assistant to record each event as an
`analytics` contract with status `proposed`. A tracking comment never confirms
an analytics contract by itself.

Storage and API: `meeting.json` stays at `version` 1. Each new comment stores
`kind` (`visual-fix` or `tracking`); a comment stored by an older addon has no
`kind` and reads as `visual-fix`. A create request accepts an optional `kind`,
and the comment edit request accepts one or more of `body`, `pin`, and `kind`.
Rolling back to 0.9.x keeps the data readable, but that version ignores `kind`:
Tracking comments then show as plain comments and copy the visual fix request
until the addon is upgraded again.

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
| `storyTitlePrefix` | Story title prefix filter (top-level namespaces such as `Components/`), or `false` for all stories |
| `componentClassPrefixes` | Class prefixes used when naming exported layers |
| `absoluteFidelityComponents` | Components exported with absolute layout |
| `embeddedSvgByDataGraphic` | Inline SVG map keyed by `data-graphic` |

## Troubleshooting

- **Toolbar shows "Figma export on" but no export tools appear.** The preview shows a small dismissible "Figma export" notice explaining why: the current story is excluded by `storyTitlePrefix`. Check that the filter covers the story title's top-level namespace: use `Components/`, not a deeper path like `Components/Examples/` (prefixes are `startsWith` matches, so a deep prefix excludes `Components/Actions/...` and every other sibling). Set `storyTitlePrefix: false` to include all stories.
- **No toolbar toggle on a Docs (autodocs) page.** Intentional: the addon works in Story view only, so the toolbar toggle, export overlay, and review panel all stay hidden on docs pages. Open the entry as a story to export it.
- **Inline SVG icons look black in a reference snapshot.** The browser reference snapshot and `data-figma-rasterize` clone an `<svg>` as-is and do not inline styles for its children, so children colored only by a stylesheet rule (for example `.icon path { stroke: currentColor }`) fall back to the SVG defaults. Attributes and inline styles are preserved, including `fill="var(--token)"`. Comment screenshots inline the computed paint of SVG children for the duration of the capture, so they keep these colors.
- **No notice and no tools.** Confirm the preview imports `@harrychuang/storybook-addon-figma-export/styles.css` and that the addon is set up: `configureFigmaExportReview` is called in `preview.ts`, or a decorator (`createFigmaExportDecorator` or `createFigmaExportReviewDecorator`) is registered.
- **No panel or comments in a view another addon renders (for example UI Flow).** List `@harrychuang/storybook-addon-figma-export` before that addon in `main.ts` `addons` and use `configureFigmaExportReview`; a decorator inside `preview.ts` is wrapped by the other addon and never runs in its view.

## API exports

- `@harrychuang/storybook-addon-figma-export` — types and utilities
- `@harrychuang/storybook-addon-figma-export/preview` — decorator and globals helpers
- `@harrychuang/storybook-addon-figma-export/preset` — Storybook preset (used automatically via `addons`)
- `@harrychuang/storybook-addon-figma-export/manager` — toolbar registration (side effect)
- `@harrychuang/storybook-addon-figma-export/review` — optional export review panel: `configureFigmaExportReview` and the older `createFigmaExportReviewDecorator`
- `@harrychuang/storybook-addon-figma-export/review-server` — optional Vite middleware for persisted review state
- `@harrychuang/storybook-addon-figma-export/source` — source URL resolver helpers for story parameters and documented Figma node fallbacks
- `@harrychuang/storybook-addon-figma-export/styles.css` — exporter and review overlay styles
- `@harrychuang/storybook-addon-figma-export/review.css` — optional direct export review panel styles
