## MODIFIED Requirements

### Requirement: Append-only visual comment records

A create-comment request SHALL contain a clientRequestId, authorName, body, story metadata, viewport metadata, capture metadata and data URL, and normalized pin. The server SHALL generate comment and capture IDs plus createdAt and asset metadata. A stored comment's authorName, body, pin, captureId, and createdAt MUST remain immutable. The API SHALL expose only two post-creation lifecycle mutations: changing the comment's resolved state and deleting one identified comment. The API MUST NOT expose general comment editing or bulk deletion.

The panel SHALL store the participant's display name in browser localStorage under the configured authorStorageKey. An empty trimmed authorName SHALL persist as "Anonymous". A canonical-save failure SHALL leave the in-memory composer draft and capture available for retry until the participant cancels or navigates away.

#### Scenario: Comment is attributed without authentication

- **WHEN** a browser stores the display name "Mina" and submits a comment
- **THEN** meeting.json records authorName "Mina" on the server-generated comment without creating an account or credential

#### Scenario: Empty author uses the anonymous label

- **WHEN** authorName contains only whitespace
- **THEN** the server stores authorName "Anonymous"

#### Scenario: Save failure preserves the draft

- **WHEN** capture succeeds but the canonical save returns HTTP 500
- **THEN** the panel retains the body, pin, and captured image and offers retry without recapturing

#### Scenario: Lifecycle mutation does not edit unrelated comment content

- **WHEN** a participant completes, reopens, or deletes one identified comment
- **THEN** the server changes only resolvedAt or removes that comment and its unreferenced screenshot evidence without rewriting another comment's authorName, body, pin, captureId, or createdAt

## ADDED Requirements

### Requirement: Concise visual comment capture action

When an active meeting is available and comments capability permits capture, the visual comments detail panel SHALL render its default primary capture action with the visible text and accessible name `Add comment`. Activating `Add comment` SHALL enter the existing point-capture flow. The public `addVisualComment` label override key SHALL remain supported and a consumer-provided value MUST replace the default text without changing capture behavior.

#### Scenario: Default action uses concise copy

- **WHEN** an active meeting loads with comments capability available and no custom labels
- **THEN** the enabled capture action is named `Add comment` and the Review panel does not render `Add visual comment`

#### Scenario: Custom capture action label remains supported

- **WHEN** a consumer supplies a custom value through the `addVisualComment` label key
- **THEN** the capture action displays that value and activating it enters the same point-capture flow

### Requirement: Independent visual comments panel

For an included Story view, visual comments SHALL render as an independent capture-ignored panel anchored at the top-right instead of inside Export review. The panel SHALL default to a collapsed icon-only launcher that uses the existing Storybook `EditIcon`. In that collapsed state, the 36×36 button SHALL occupy the complete 36×36 panel surface without a hidden copy track or inter-column gap, and the 14×14 SVG, button, and panel centers MUST differ by no more than 0.5 CSS pixel on either axis. Activating the launcher SHALL expand a header whose left column stacks the `Visual comments` subheading and the single `Reports` outline button in two rows while the Edit icon button occupies the right column of the same header row. The Reports button SHALL use compact intrinsic／hug-content width, align to the start of the left column, and MUST NOT fill that column. Meeting controls, point-capture flow, and comment composer SHALL render below that header. The launcher MUST expose synchronized `aria-expanded`, `aria-controls`, and Open or Close comments accessible labels.

The expanded comments panel and the bottom-right Figma workspace MUST NOT overlap at wide or narrow viewports. Each surface SHALL scroll internally when constrained. Collapsing the panel SHALL hide the expanded header content and detail region while preserving a pending composer draft for reopening. If point capture is armed but no point has been selected, collapsing the panel MUST cancel that hidden capture mode. Starting or ending a meeting, saving a comment, subsequent overview refreshes, and a same-story preview remount caused by those mutations MUST preserve the participant's current expanded state.

#### Scenario: Edit icon opens the comments details

- **WHEN** an included Story first renders and the participant activates the top-right Edit icon launcher
- **THEN** the launcher changes from `aria-expanded="false"` to `aria-expanded="true"` and the Visual comments detail region exposes Reports and meeting controls

#### Scenario: Collapsed Edit launcher is centered

- **WHEN** an included Story renders the visual comments panel in its collapsed state
- **THEN** the 36×36 button fills the launcher surface and the 14×14 Edit icon, button, and panel centers remain within 0.5 CSS pixel on both axes

#### Scenario: Expanded header uses compact two-row navigation

- **WHEN** the visual comments panel is expanded
- **THEN** `Visual comments` is a subheading above one smaller, intrinsic-width outline `Reports` button aligned to the start of the header left column, and the Edit icon launcher occupies the header right column without an extra launcher-only row

#### Scenario: Starting a meeting preserves the expanded panel

- **WHEN** the participant expands visual comments and activates `Start meeting`
- **THEN** the meeting becomes active while the launcher remains `aria-expanded="true"` and the meeting detail remains visible

#### Scenario: Saving a comment preserves the expanded panel

- **WHEN** the participant saves a comment from an expanded visual comments panel and the same Story preview remounts after the canonical comment and screenshot are written
- **THEN** the comment is saved, the composer clears, and the launcher remains `aria-expanded="true"` with the active meeting detail visible

#### Scenario: Collapsed launcher hides comment details

- **WHEN** the participant closes the expanded visual comments panel
- **THEN** only the top-right Edit icon launcher remains visible and the detail region is hidden from interaction

#### Scenario: Independent panels do not overlap

- **WHEN** visual comments details and the Figma export-review workspace are both expanded in a vertically constrained preview
- **THEN** the comments panel remains above the workspace, their rectangles do not intersect, and overflow remains reachable through each surface's internal scrolling

#### Scenario: Closing armed capture cancels hidden interception

- **WHEN** the participant activates Add comment and closes the comments panel before selecting a point
- **THEN** point capture is cancelled, the capture prompt disappears, and Story pointer interaction is restored

#### Scenario: Closing a composer preserves its draft

- **WHEN** a captured snapshot composer contains an author and comment draft and the participant closes then reopens the comments panel
- **THEN** the same snapshot, pin, author, and comment draft remain available for submission

### Requirement: Report comment lifecycle actions

Each comment card in an active or closed session report SHALL display an Open or Completed status. A legacy comment without resolvedAt SHALL display Open. Completing a comment SHALL persist a server-generated resolvedAt timestamp; completing it again MUST preserve the existing timestamp. Reopening SHALL clear its resolved state. Each card SHALL provide an icon-only Delete button with canonical Storybook TrashIcon geometry, an accessible `Delete comment` name, and DOM／visual placement immediately before Complete or Reopen. Activating Delete SHALL open an in-page `role="dialog"` modal confirmation naming both the comment and screenshot without depending on native dialog APIs and MUST NOT send a request. Only activating Confirm delete SHALL send the delete request; Cancel, Escape, backdrop close, or closing the dialog MUST preserve the comment and screenshot evidence and return focus to Delete. Confirmed deletion SHALL permanently remove that comment. When no remaining comment references its capture, confirmed deletion MUST also remove the capture record. When no remaining capture references the same image path, confirmed deletion MUST delete the session image asset. A shared capture or shared image asset MUST remain available until its final reference is removed.

The server SHALL expose `PATCH /sessions/:sessionId/comments/:commentId` with body `{ "resolved": boolean }` and `DELETE /sessions/:sessionId/comments/:commentId` for both active and closed meetings. Successful mutation SHALL atomically update canonical meeting JSON and regenerate the affected session report and root index. A report-generation failure after canonical mutation SHALL return `reportStale: true`. The static report SHALL surface a per-card mutation error without hiding or changing the stored comment.

Before serving a Reports index or session HTML page, the server SHALL regenerate that derived HTML from current canonical state or meeting JSON through the serialized store queue. A stale pre-upgrade report HTML file MUST NOT preserve outdated Delete controls when canonical evidence is readable. Serving screenshot assets SHALL remain a read-only path without report regeneration.

#### Scenario: Completed comment can be reopened

- **WHEN** a participant completes an Open comment, repeats Complete, and then activates Reopen
- **THEN** the comment transitions Open to Completed to Open, the repeated Complete preserves the first resolvedAt timestamp, and every successful transition is visible after report reload

#### Scenario: Closed meeting comments remain maintainable

- **WHEN** a participant completes or reopens a comment in a closed meeting report
- **THEN** the mutation succeeds without reopening the meeting or allowing a new comment to be created

#### Scenario: Delete cancellation preserves the comment and screenshot

- **WHEN** a participant activates the Delete icon button and then cancels, presses Escape, or closes the in-page confirmation dialog
- **THEN** no delete request is sent and the comment, capture record, and image asset remain available

#### Scenario: Delete icon precedes resolution action

- **WHEN** an Open or Completed comment card is rendered
- **THEN** one accessible TrashIcon Delete button appears immediately before Complete or Reopen without visible `Delete` button text

#### Scenario: Confirmed delete requires the second action

- **WHEN** a participant activates the Delete icon button and then activates Confirm delete in the in-page dialog
- **THEN** the first action sends no request and the confirmation action sends exactly one DELETE request for that comment

#### Scenario: Stale session report receives current confirmation UI

- **WHEN** a session report HTML file contains a pre-upgrade Delete control while canonical meeting JSON remains readable and the participant requests that session report
- **THEN** the server regenerates the HTML before responding and the response contains the current TrashIcon button and in-page confirmation dialog

#### Scenario: Confirmed delete removes unreferenced screenshot evidence

- **WHEN** a participant confirms deletion of a comment whose capture has no other comments
- **THEN** the comment count and capture count each decrease by one, the unshared image asset is deleted, and the regenerated report contains neither the comment card nor its snapshot

#### Scenario: Shared screenshot asset remains referenced

- **WHEN** a confirmed deletion removes one capture whose image path is still referenced by another capture
- **THEN** the deleted comment and capture are removed while the shared image asset remains available to the other capture

#### Scenario: Lifecycle mutation failure is local to the card

- **WHEN** the server returns 400, 404, or 500 for a Complete, Reopen, or Delete request
- **THEN** the report preserves the comment and its current status, re-enables that card's actions, and displays an actionable error in that card

### Requirement: Rendered-pixel capture validity

The browser capture pipeline SHALL render the resolved capture target through the production `html-to-image` path, preserve the target's visible content and resolved non-transparent ancestor background, and encode the result within the existing image dimension, pixel, and byte limits. Before opening a submittable composer, the client MUST verify that the encoded canvas contains at least one visible pixel. An all-transparent result MUST be treated as a capture failure and MUST NOT be submitted or stored.

#### Scenario: Real Story content appears in the capture

- **WHEN** the capture target contains a colored surface, a contrasting border, and rendered text
- **THEN** the decoded WebP or PNG contains visible pixels from the target content rather than only transparency or a fallback background

#### Scenario: All-transparent output is rejected

- **WHEN** the production capture path returns a canvas whose pixels all have zero alpha
- **THEN** the panel reports a retryable capture error, keeps create-comment disabled, and sends no comment request

#### Scenario: Workspace chrome is excluded from body capture

- **WHEN** the configured capture selector resolves to `body` while the Figma workspace, comments panel, capture prompt, composer, and export controls are mounted
- **THEN** the captured image includes the Story UI and excludes every addon surface marked `data-sbfx-capture-ignore`

### Requirement: Discoverable active and historical meetings

The visual comments overview SHALL return `captureCount` and `commentCount` for the active session and each recent closed session. The panel SHALL expose exactly one `Reports` navigation link and MUST NOT render an active-session `Open` link, a closed meeting history heading, closed meeting cards, or per-session report links. The static report index SHALL distinguish the current active meeting from closed meeting history, display both counts for every meeting, and provide each session report link. A session report SHALL link back to the meeting index and SHALL render each stored snapshot with its pin, author, body, creation time, and story metadata.

#### Scenario: A new active meeting does not hide prior evidence

- **WHEN** the current meeting has zero comments and a prior closed meeting has one capture and one comment
- **THEN** the panel retains current meeting controls and one `Reports` link without rendering closed meeting cards, while the report index labels the prior meeting as closed with captureCount 1, commentCount 1, and an openable session report link

#### Scenario: Panel delegates all report browsing to Reports

- **WHEN** the overview contains an active report URL and multiple recent closed sessions
- **THEN** the panel renders one `Reports` link to the meeting index and renders no active `Open` link, closed meeting history heading, or per-session list

#### Scenario: Reports index links resolve to static session reports

- **WHEN** a participant opens the canonical Reports URL or follows the legacy no-trailing-slash Reports URL and activates a meeting's `Open report` link
- **THEN** navigation resolves under `/reports/sessions/<meeting-id>/index.html`, returns the stored session evidence, and does not fall through to the `/sessions/<meeting-id>` comments API route

#### Scenario: Closed-session evidence remains grouped

- **WHEN** a participant opens a closed session report containing comments from multiple stories
- **THEN** every comment is rendered with its own immutable snapshot and pin while the report identifies the meeting as closed and provides navigation to all meetings

#### Scenario: Empty session is explicit

- **WHEN** a meeting contains zero captures and zero comments
- **THEN** its report states both zero counts and still provides navigation to the meeting index instead of presenting an isolated `No comments yet` page

### Requirement: Comment capability failure is actionable

The panel SHALL track visual comments availability separately from review-status persistence. A failed comments request MUST identify the configured comments endpoint and SHALL disable only meeting and comment mutations until a later successful refresh. A review-status failure MUST NOT erase a loaded comments overview, hide the `Reports` navigation link, or claim that stored comments were lost.

#### Scenario: Review status fails while comments remain available

- **WHEN** the review-status endpoint returns HTTP 404 and the comments endpoint returns HTTP 200 with recent sessions
- **THEN** the panel displays the review-status endpoint error while meeting controls and the single `Reports` navigation link remain available

#### Scenario: Comments endpoint is unavailable

- **WHEN** the comments endpoint returns HTTP 404
- **THEN** the panel names that endpoint, disables meeting and comment mutation controls, and leaves export and review-status controls usable

#### Scenario: Comments capability recovers

- **WHEN** a later scheduled refresh of the configured comments endpoint succeeds after an earlier failure
- **THEN** the panel clears the comments capability error, refreshes meeting counts, and enables valid meeting actions without reloading the Story
