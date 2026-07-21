## ADDED Requirements

### Requirement: Integrated Figma workspace dock

When Figma export is enabled for an included Story view, the preview SHALL render one Figma workspace chrome containing both the Figma export section and the Export review section in that fixed DOM and visual order. Above the narrow breakpoint the workspace SHALL be anchored at the bottom-right. The workspace SHALL reserve non-overlapping Story canvas space, SHALL provide internal scrolling for content that exceeds the available viewport, and MUST NOT render the two sections as independently overlapping fixed panels.

#### Scenario: Wide preview uses a bottom-right dock

- **WHEN** Figma export is enabled in a preview wider than the workspace narrow breakpoint
- **THEN** one bottom-right workspace is visible, the Story canvas remains visible beside it, and the Figma export section appears above the Export review section on the shared workspace surface

#### Scenario: Narrow preview uses a bottom dock

- **WHEN** Figma export is enabled in a preview at or below the workspace narrow breakpoint
- **THEN** one bottom workspace reserves block space, remains internally scrollable, and does not float over the Story interaction area

#### Scenario: Section order stays stable across mount timing

- **WHEN** either workspace section mounts first or remounts during a Story rerender
- **THEN** the named export slot remains immediately before the named review slot and the workspace contains no duplicate slots

#### Scenario: Workspace lifecycle follows its sections

- **WHEN** Story rerenders or hot module replacement remounts one workspace section
- **THEN** the existing workspace and the other mounted section remain connected without duplicate workspace roots or premature teardown

### Requirement: Figma export controls workspace disclosure

The Figma export collapse control SHALL act as the parent disclosure for the shared workspace. When Figma export is collapsed, the workspace SHALL hide the `Figma export` title label, Story subtitle, paired disclosure glyph, and complete Export review slot without unmounting Review or changing its independent collapse preference. The collapsed workspace and standalone exporter SHALL use intrinsic／hug-content width smaller than 320 CSS pixels and SHALL visibly retain only the canonical Figma mark plus the addon version. The compact surface SHALL remain the accessible Expand control with synchronized `aria-expanded`, accessible label, click, and keyboard semantics. When Figma export is expanded again at a wide viewport, the workspace SHALL return to exactly 320 CSS pixels, restore the title, subtitle, inward Collapse icon, actions, and Export review slot in its prior internal collapse state. Narrow expanded viewports SHALL retain the existing full-width bottom-dock behavior. The only visible addon version label in the workspace SHALL be rendered in the Figma export header; the Export review header MUST NOT render version information.

#### Scenario: Collapsed workspace exposes only Figma export

- **WHEN** the participant collapses the Figma export section
- **THEN** the workspace is smaller than 320 CSS pixels, visibly shows only the Figma mark and addon version, and the title, subtitle, chevron glyph, Export review header, body, and Review version information are not visible or layout-participating

#### Scenario: Compact surface remains operable

- **WHEN** keyboard or pointer focus reaches the collapsed icon-and-version disclosure
- **THEN** activating that compact surface changes `aria-expanded` to `true` and restores the complete expanded workspace

#### Scenario: Reopening restores the review preference

- **WHEN** Export review has an existing expanded or collapsed preference and the participant collapses then re-expands Figma export
- **THEN** the Export review slot returns with that unchanged prior preference and component state

#### Scenario: Workspace shows one version label

- **WHEN** the shared workspace is expanded and both section headers are rendered
- **THEN** exactly one visible addon version label appears beside the Figma export title and no version label appears beside Export review

### Requirement: Export access persists throughout visual review

The Export review and Figma export sections SHALL retain independent collapse preferences within the shared bottom-right workspace. Starting point capture or opening the separate top-right visual comments panel MUST keep both workspace section headers visible and operable. The comments detail panel and workspace SHALL use their own scrolling when vertically constrained and MUST NOT cover, remove, intersect, or z-index occlude one another.

#### Scenario: Point capture keeps export visible

- **WHEN** a participant activates Add comment
- **THEN** the capture instruction appears in the separate visual comments panel while the Figma export and Export review section headers remain visible in the bottom-right workspace

#### Scenario: Composer expands within the comments panel

- **WHEN** a captured snapshot opens the author and comment composer
- **THEN** the composer scrolls within the top-right comments panel without intersecting the bottom-right workspace and the participant can still expand or collapse either workspace section

#### Scenario: Collapse preferences remain independent

- **WHEN** the participant collapses Export review but leaves Figma export expanded and then changes stories
- **THEN** the next included Story preserves those two independent states

### Requirement: Compact Figma export action layout

Above the workspace narrow breakpoint, the shared Figma workspace and standalone Figma exporter SHALL use an inline-size limit of exactly 320 CSS pixels. The shared workspace SHALL reserve 344 CSS pixels of Story canvas inline space to include its existing 24-pixel inline-end offset. The Figma export action group SHALL retain the existing DOM order while rendering Copy JSON and Download JSON as separate full-width rows, followed by `Console script` and `Copy design to Figma` as two equal-width columns on one shared row. At or below the narrow breakpoint, the shared workspace SHALL retain the existing full-width bottom-dock behavior and the same action composition instead of forcing a 320-pixel side dock or reverting to four single-column rows.

#### Scenario: Wide workspace uses the compact width

- **WHEN** Figma export is enabled in a preview wider than the workspace narrow breakpoint
- **THEN** the shared side workspace is 320 CSS pixels wide and the Story canvas reserves 344 CSS pixels without overlapping the workspace

#### Scenario: Primary export actions occupy full-width rows

- **WHEN** the expanded Figma export section renders its four actions
- **THEN** Copy JSON and Download JSON share the same horizontal start and available width and each occupies a separate full-width row

#### Scenario: Utility actions share the bottom row

- **WHEN** the expanded Figma export section renders the actions after Download JSON
- **THEN** `Console script` and the icon-only `Copy design to Figma` action occupy two equal-width non-overlapping columns on the same row

#### Scenario: Narrow workspace remains a bottom dock

- **WHEN** Figma export is enabled at or below the workspace narrow breakpoint
- **THEN** the shared workspace spans the viewport between its existing mobile inline offsets, remains a bottom dock rather than a fixed 320-pixel side panel, and retains the two full-width rows plus the two-column utility row

### Requirement: Single-source Storybook review configuration

The Storybook preview decorator, Vite server plugin, config generator, and template SHALL consume one Figma export project configuration for review-status and visual-comments settings. The effective `review.apiPath`, `review.commentsApiPath`, `review.commentsDir`, `review.commentsEnabled`, `review.visualComments.apiPath`, `captureSelector`, and `authorStorageKey` MUST remain consistent across preview and server wiring. Generated or template configuration that resolves different client and server API paths MUST fail its configuration verification.

#### Scenario: Preview and server use the same status endpoint

- **WHEN** a project config sets review.apiPath to `/__md_figma_review_status`
- **THEN** both the preview status client and Vite status middleware use `/__md_figma_review_status`

#### Scenario: Comments settings propagate atomically

- **WHEN** a generated config sets commentsApiPath to `/__md_figma_review_comments`, commentsDir to `design-system/md-review`, and captureSelector to `[data-review-root]`
- **THEN** the server middleware, preview comments client, capture pipeline, and generated config test resolve exactly those values

#### Scenario: Split configuration is rejected

- **WHEN** preview wiring resolves `/__figma_export_review_status` while server wiring resolves `/__md_figma_review_status`
- **THEN** the template or generator verification fails and reports both conflicting endpoints

### Requirement: Capability-scoped workspace status

The integrated workspace SHALL present Export generation, review-status persistence, and visual-comments availability as separate capability states. Each failure message MUST name the affected capability and endpoint or operation. A failure in one capability MUST NOT hide or disable controls belonging exclusively to another available capability.

#### Scenario: Status persistence returns HTTP 404

- **WHEN** saving review status to the configured endpoint returns HTTP 404 while export generation and comments remain available
- **THEN** the workspace identifies the review-status endpoint failure, keeps Figma export actions visible, and keeps meeting/report controls usable

#### Scenario: Export generation fails independently

- **WHEN** Figma payload generation fails while status and comments APIs remain available
- **THEN** only the Export section reports the generation failure and the Review section retains its current controls and data

### Requirement: Semantic Figma export iconography

The renderer-agnostic Figma export panel SHALL render the canonical Storybook Figma mark in both the header brand slot and the icon-only `Copy design to Figma` action. Both instances MUST share the same 14×14 filled-path geometry and current text color. The header SVG box SHALL be horizontally and vertically centered in its 32×32 mark slot. The copy, download, `Console script`, and collapse actions MUST retain their existing distinct icons and accessible names.

#### Scenario: Export brand entry points use the canonical Figma mark

- **WHEN** the Figma export panel is expanded for an included Story
- **THEN** the header mark and `Copy design to Figma` action display the same canonical Figma icon instead of the former approximate stroke-and-circle graphic

#### Scenario: Icon correction preserves action semantics

- **WHEN** the Figma icon geometry is updated
- **THEN** the icon-only action remains named `Copy design to Figma`, the command-icon action is named `Console script`, and the Copy JSON, Download JSON, command, and collapse controls retain their existing distinct icons

#### Scenario: Export header mark is centered

- **WHEN** the expanded Figma export header is rendered
- **THEN** the center of its 14×14 Figma SVG box matches the horizontal and vertical center of the 32×32 mark slot within 0.5 CSS pixel

### Requirement: Distinct review iconography

The Export review header SHALL use the existing Storybook `EyeIcon` to represent preview and review activity. It MUST NOT reuse the Figma brand mark reserved for the Figma export section and action. The icon SHALL remain decorative inside the existing `aria-hidden` review mark wrapper.

#### Scenario: Review and export sections have distinct icons

- **WHEN** the integrated workspace renders both expanded section headers
- **THEN** Export review displays `EyeIcon` while Figma export displays the centered canonical Figma mark

### Requirement: Consistent workspace collapse controls

The Export review and Figma export header controls SHALL use the same action-oriented 14×14 filled disclosure geometry and current text color. When a visible section is expanded, its control SHALL display a Collapse icon whose upper chevron points down and lower chevron points up so both chevrons converge toward the center. When a visible section is collapsed, its control SHALL display an Unfold More icon whose upper chevron points up and lower chevron points down so both chevrons diverge away from the center. The Figma export parent disclosure SHALL continue to hide this glyph only in its existing compact icon-and-version collapsed state. Clicking either control MUST update that section's content visibility, icon, `aria-expanded`, accessible label, and independent persisted preference to the same resulting state.

#### Scenario: Expanded sections show the inward Collapse icon

- **WHEN** Figma export and Export review are both expanded and their header controls are visible
- **THEN** both controls display the same 14×14 inward Collapse geometry, report `aria-expanded="true"`, and expose Collapse accessible labels

#### Scenario: Collapsed review shows the outward Unfold More icon

- **WHEN** Export review is collapsed while the parent Figma export workspace remains expanded
- **THEN** the Review control displays the 14×14 outward Unfold More geometry, reports `aria-expanded="false"`, exposes an Expand accessible label, and retains its independent collapse preference

#### Scenario: Activating a disclosure updates its complete state

- **WHEN** a participant activates a visible expanded or collapsed section control
- **THEN** only that section changes state and its paired-chevron geometry, content visibility, `aria-expanded`, accessible label, and persisted preference all describe the same resulting state

#### Scenario: Compact Figma export preserves its minimal disclosure

- **WHEN** the participant collapses the Figma export parent disclosure into its icon-and-version compact state
- **THEN** the paired-chevron glyph remains hidden, the compact surface reports `aria-expanded="false"` with an Expand accessible label, and activating the surface restores the expanded header with the inward Collapse icon

### Requirement: Figma importer supports valid local development domains

The bundled and Storybook-template Figma importer manifests SHALL list exactly `http://localhost:6006`, `http://localhost:6007`, `http://localhost:6008`, and `http://localhost:8080` in `networkAccess.devAllowedDomains`. They MUST NOT list IPv4 or IPv6 literal origins, wildcard ports, or additional development origins. The plugin URL input SHALL default to `http://localhost:6006`, and the installer SHALL fail validation before copying when the bundled manifest contains an IP-literal development domain. The existing bridge endpoint and export payload contracts MUST remain unchanged.

#### Scenario: Bundled manifest imports with localhost development origins

- **WHEN** Figma Desktop validates the bundled importer manifest for local Storybook development
- **THEN** `devAllowedDomains` contains the four explicit localhost origins for ports 6006, 6007, 6008, and 8080 and contains no `127.0.0.1` or other IP-literal entry

#### Scenario: Plugin defaults to the supported Storybook hostname

- **WHEN** a participant opens the importer without a previously entered Storybook URL
- **THEN** the URL field defaults to `http://localhost:6006` and the existing bridge request and payload shapes are preserved

#### Scenario: Installer rejects an invalid bundled IP literal

- **WHEN** installer validation reads a bundled manifest whose `devAllowedDomains` contains an IPv4 or IPv6 literal origin
- **THEN** installation stops before target creation or file copy and reports the invalid entry with guidance to use `localhost`

#### Scenario: Template importer matches the canonical bundle

- **WHEN** the importer is rebuilt and synchronized into the self-contained Storybook template
- **THEN** the canonical and template manifests have the same exact localhost-only allowlist, their generated runtime and visible version agree with the package patch version, and regression verification passes
