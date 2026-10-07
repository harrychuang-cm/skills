## ADDED Requirements

### Requirement: Self-registered review decorator

The addon's preview entry SHALL export a `decorators` array containing one host decorator, so Storybook applies it at the addon's position in the `addons` list. The review entry SHALL export `configureFigmaExportReview(figmaExportOptions, reviewOptions)`, taking the same options as `createFigmaExportReviewDecorator`, which SHALL register the review synchronization in the global symbol registry so the separately bundled preview entry can reach it. When review synchronization is registered, the host decorator SHALL synchronize the export overlay and the review workspace for every story render, exactly as `createFigmaExportReviewDecorator` does, and SHALL return the story function's result by strict identity. When nothing is registered, the host decorator SHALL return the story function's result by strict identity without any side effect. When the host decorator has synchronized a render, a `createFigmaExportReviewDecorator` decorator invoked within that same render SHALL return the story function's result without synchronizing again. The preview entry MUST NOT import the review entry, React or React DOM.

#### Scenario: Review runs around a mode that does not render the story

- **WHEN** the addon is listed before a decorator-providing addon whose decorator returns its own content without calling the story function, the project called `configureFigmaExportReview`, and the Figma export global is on
- **THEN** the review workspace and the visual comments panel mount for that Story view

#### Scenario: Turning export off in such a mode removes the workspace

- **WHEN** the review workspace is mounted while that mode is shown and the participant turns the Figma export global off
- **THEN** the review workspace, the visual comments panel and the `data-sbfx-workspace-open` marker on the html element are removed

#### Scenario: A project that only uses the legacy decorator keeps working

- **WHEN** a project wires `createFigmaExportReviewDecorator` in its preview and never calls `configureFigmaExportReview`
- **THEN** the host decorator has no side effect and the legacy decorator mounts the review workspace as before

#### Scenario: Both wirings mount one workspace

- **WHEN** a project calls `configureFigmaExportReview` and also keeps `createFigmaExportReviewDecorator` in its preview decorators
- **THEN** exactly one Figma workspace and one visual comments panel are present after the Story renders

---

### Requirement: Host-declared export availability

While the export scope is, or contains, an element carrying `data-sbfx-export="unavailable"`, the Figma export section SHALL replace its export actions with a notice whose text is that element's `data-sbfx-export-label` or, when absent, `Figma export is not available in this view.`, and SHALL show a link to that element's `data-sbfx-export-href` when it resolves to a same-origin URL. Copy JSON, Download JSON, Console script and Copy design to Figma SHALL be unavailable while the marker is present, and each action SHALL re-check the marker when invoked and refuse to export when it is present. The Export review section SHALL stay available.

#### Scenario: The canvas view points to its static export

- **WHEN** the export scope contains `data-sbfx-export="unavailable"` with `data-sbfx-export-label="Open Static Flow to export this flow."` and a same-origin `data-sbfx-export-href`
- **THEN** the Figma export section shows that label and a link to that URL, and Download JSON is not offered

---

### Requirement: Workspace reservation reaches fluid Story roots

While the Figma workspace is open and expanded, the reserved inline size for the side orientation and the reserved block size for the bottom orientation SHALL be resolvable from the `#storybook-root` rules that cap the Story canvas, so a `#storybook-root` that would otherwise fill the viewport does not extend beneath the workspace. While the Figma export panel is collapsed, the workspace is only a compact control and the rules SHALL NOT cap `#storybook-root`. A `#storybook-root` that contains a host-declared canvas, an element with `data-sbfx-canvas`, SHALL NOT be capped in either orientation, so the workspace floats above the pannable canvas. The verification fixture SHALL use a `#storybook-root` that fills the viewport width.

#### Scenario: A full-width Story root is capped beside the workspace

- **WHEN** the preview viewport is 1140 CSS pixels wide, `#storybook-root` fills it, and the side workspace with a 344-pixel reservation opens
- **THEN** `#storybook-root` is at most 796 CSS pixels wide and does not overlap the workspace

#### Scenario: A collapsed workspace leaves the Story root its full size

- **WHEN** the preview viewport is 1140 CSS pixels wide, `#storybook-root` fills it, the side workspace is open, and the reviewer collapses the Figma export panel
- **THEN** `#storybook-root` is 1140 CSS pixels wide, and expanding the panel again caps it at 796 CSS pixels

#### Scenario: A Story root hosting a declared canvas keeps its full size

- **WHEN** the preview viewport is 1140 CSS pixels wide, `#storybook-root` fills it and contains an element with `data-sbfx-canvas`, and the side workspace is open and expanded
- **THEN** `#storybook-root` is 1140 CSS pixels wide, and removing that element caps it at 796 CSS pixels

---

### Requirement: Wiring order and configuration call

The Figma export wiring SHALL place the addon entry before any Storybook addon entry whose path ends with `prototype-inspector/preset.js` and SHALL move an existing addon entry that follows such an entry so it precedes it. The storybook template and the generated preview wiring SHALL register review options with `configureFigmaExportReview` instead of adding `createFigmaExportReviewDecorator` to the preview decorators, and SHALL keep consuming the single Figma export project configuration.

#### Scenario: Wiring an existing Inspector project

- **WHEN** the wiring runs on a Storybook main config whose `addons` already lists `prototype-inspector/preset.js` and does not list the Figma export addon
- **THEN** the resulting `addons` list contains the Figma export addon immediately before the inspector preset entry
