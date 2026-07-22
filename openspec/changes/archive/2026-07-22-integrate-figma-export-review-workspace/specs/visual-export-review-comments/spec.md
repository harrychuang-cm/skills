## MODIFIED Requirements

### Requirement: Append-only visual comment records

A create-comment request SHALL contain a clientRequestId, authorName, body, story metadata, viewport metadata, capture metadata and data URL, and normalized pin. The server SHALL generate comment and capture IDs plus createdAt and asset metadata. After creation, the API SHALL allow an identified comment's body, normalized pin, and resolved state to change or that identified comment to be deleted. A comment edit MUST preserve authorName, captureId, createdAt, resolvedAt, capture metadata, and image asset while atomically updating only the supplied body and pin. The API MUST NOT expose author, capture, createdAt, screenshot replacement, or bulk editing.

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

#### Scenario: Identified comment body and point can be corrected without replacing evidence

- **WHEN** a participant changes one identified comment body from `old label` to `new label` and its pin from `(0.25, 0.40)` to `(0.60, 0.70)`
- **THEN** one mutation stores the new body and pin on that comment while preserving its authorName, captureId, createdAt, resolvedAt, capture, and screenshot asset and without changing another comment

#### Scenario: Invalid point does not partially update the comment

- **WHEN** an edit payload contains a valid new body and a pin whose `xRatio` is greater than `1`
- **THEN** the server rejects the request and preserves both the canonical body and pin

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

### Requirement: Adjustable pending comment point

After the participant selects a Story point for Add comment, the client SHALL display a numbered circular live tag at that point before the asynchronous capture completes. The tag SHALL display the active meeting's next comment ordinal, mirror the draft's normalized pin, be marked capture-ignore, and MUST NOT appear in the captured screenshot. The Story live tag SHALL be a non-interactive visual mirror rather than a second point editor.

After capture succeeds and before Save comment, the snapshot preview SHALL allow the pending point to be repositioned by clicking the preview, dragging the focusable numbered pin with Pointer Events, or using keyboard arrows. Arrow keys SHALL move the normalized pin by `0.01` per axis and Shift plus Arrow SHALL move it by `0.05`; every result MUST be clamped to `0..1`. Preview and Story tags SHALL display the same next ordinal and normalized location. Adjustment instructions and the pin's accessible name SHALL come from centralized `FigmaReviewLabels` defaults and the focusable pin SHALL expose a visible focus state.

Save comment SHALL submit the final pending pin through the existing create-comment request. Cancel, capture failure, or unmount SHALL remove the live tag and MUST NOT create a comment. Collapsing the comments panel SHALL hide the live tag while preserving the existing pending screenshot, point, author, and body draft; reopening SHALL restore the tag and adjustable preview. Saved comments SHALL reuse the same normalized pointer and keyboard adjustment rules inside their panel or report Edit preview, but MUST NOT create a Story live tag, recapture, or replace the stored screenshot.

#### Scenario: Point selection gives immediate numbered feedback

- **WHEN** an active meeting has three comments and the participant selects a Story point while the capture promise is still pending
- **THEN** a circular live tag displaying `4` is visible immediately at the selected point and is marked capture-ignore

#### Scenario: Live tag is excluded from captured evidence

- **WHEN** the production capture runs after the live tag is visible
- **THEN** the screenshot contains the Story UI without the live tag while the composer overlays tag `4` at the selected normalized point

#### Scenario: Pointer adjustment updates the pending point

- **WHEN** the participant clicks a new preview location or drags tag `4` before Save comment
- **THEN** the preview tag and Story live tag move to the same clamped normalized coordinates and no comment request is sent

#### Scenario: Keyboard adjustment supports coarse and fine movement

- **WHEN** the participant focuses tag `4`, presses ArrowRight once, then presses Shift plus ArrowDown once
- **THEN** `xRatio` increases by `0.01`, `yRatio` increases by `0.05`, both values remain within `0..1`, and the focus indicator remains visible

#### Scenario: Save uses the final adjusted point

- **WHEN** the participant moves the pending point from `(0.25, 0.40)` to `(0.60, 0.70)` and activates Save comment
- **THEN** the single create-comment request stores pin `{ "xRatio": 0.60, "yRatio": 0.70 }` with the existing screenshot and body

#### Scenario: Cancel removes unsaved point state

- **WHEN** the participant adjusts a pending point and cancels before Save comment
- **THEN** the live tag and composer are removed, zero create-comment requests are sent, and no pin mutation remains

#### Scenario: Panel collapse preserves but hides the pending point

- **WHEN** the participant collapses then reopens the comments panel while an unsaved adjusted composer exists
- **THEN** the live tag is hidden while collapsed and the same screenshot, normalized pin, ordinal, author, and body reappear when reopened

### Requirement: Recent editable comments in visual comments panel

When an active meeting exists, the expanded visual comments panel SHALL render at most three comments for the current Story from that active meeting, ordered by descending server-generated createdAt. It MUST NOT include comments from another Story or a closed meeting. The fourth and older current-Story comments SHALL remain available through Reports and MUST NOT render in the panel list. Each item SHALL display its author, createdAt, body, and Open or Completed status.

Each recent item SHALL provide Edit and icon-only Delete actions using centralized `FigmaReviewLabels` defaults. Edit SHALL open one body-level, capture-ignored overlay modal with a labelled `role="dialog"`, `aria-modal="true"`, a responsive surface larger than the 320px visual comments panel at wide viewports, and a viewport-bounded scrollable surface at narrow viewports. The modal SHALL render the stored screenshot and numbered normalized point before the body field, and SHALL provide Save changes and Cancel. Save changes SHALL reject an empty or over-limit body and an invalid pin, then SHALL send one atomic edit request containing the current body and pin drafts. Cancel, Escape, or backdrop close SHALL restore the canonical body and pin without sending a request, close the modal, and return focus to the originating Edit action. A successful Save SHALL close the modal and preserve the expanded panel; a failed Save SHALL retain the modal and both drafts. Activating Delete SHALL open an in-page `role="dialog"` confirmation that states the comment and unreferenced screenshot evidence will be permanently deleted and MUST NOT send a request. Only Confirm delete SHALL send DELETE; Cancel, Escape, or backdrop close SHALL preserve the comment and screenshot and return focus to Delete. Saving an edit or confirming a delete SHALL refresh the list from canonical overview data.

#### Scenario: Panel renders the latest three current-Story comments

- **WHEN** the active meeting contains current-Story comments created at 10:00, 10:01, 10:02, and 10:03 plus a newer comment from another Story
- **THEN** the panel renders only the current-Story comments from 10:03, 10:02, and 10:01 in that order while Reports retains every comment

#### Scenario: Panel edit opens a larger accessible evidence modal

- **WHEN** a participant activates Edit on a recent comment with available evidence
- **THEN** one labelled body-level modal opens above a dimmed backdrop with the stored screenshot, meeting-wide numbered point, body field, Save changes, and Cancel, while no inline editor expands inside the 320px recent item

#### Scenario: Panel modal edit atomically updates body and point and stays open

- **WHEN** a participant edits a recent comment body and point, activates Save changes, and the same Story preview refreshes from the canonical overview
- **THEN** one PATCH stores both values, the modal closes, the updated body and pin are visible after canonical refresh, the screenshot and other evidence metadata are unchanged, and the panel remains expanded

#### Scenario: Panel edit cancellation preserves canonical content and focus

- **WHEN** a participant changes the body and point drafts and activates Cancel, presses Escape, or clicks the backdrop
- **THEN** no PATCH request is sent, the modal closes, the item returns to its canonical body and pin, and focus returns to the originating Edit action

#### Scenario: Failed panel edit keeps the modal draft

- **WHEN** a participant changes the body and point and the edit PATCH fails
- **THEN** the modal remains open with both drafts and a visible error while canonical comment evidence remains unchanged

#### Scenario: Panel delete requires confirmation

- **WHEN** a participant activates a recent comment's Delete button and then cancels the in-page dialog
- **THEN** no DELETE request is sent, focus returns to Delete, and the comment and screenshot remain visible

#### Scenario: Panel confirmed delete refreshes the recent list

- **WHEN** a participant confirms deletion of one recent comment
- **THEN** exactly one DELETE request is sent, reference-aware screenshot cleanup runs, the panel remains expanded, and the next eligible current-Story comment fills the available list position

### Requirement: Comment evidence preview surfaces

The visual comments overview SHALL expose a top-level derived meeting-wide `ordinal` and a derived `preview` for each current-Story comment. The preview SHALL contain a same-origin report asset URL, the stored image width and height, and the comment's normalized pin. The derived URL and ordinal MUST NOT be persisted to canonical meeting JSON. If the comment's capture or image metadata cannot be resolved, its `preview` SHALL be `null` while its top-level ordinal remains available and without failing the rest of the overview.

When a recent panel comment or report card enters Edit state, the editor SHALL render its stored screenshot and normalized pin before the body field using the same snapshot-preview visual primitive as the Add comment composer. The numbered pin SHALL be focusable and SHALL support preview click, Pointer Events drag, Arrow `0.01`, and Shift plus Arrow `0.05`, with every ratio clamped to `0..1`. Edit, Save changes, and Cancel MUST NOT capture or replace screenshot evidence. A missing or failed preview SHALL keep body-only editing usable, SHALL prevent an unknown point from being submitted, and SHALL expose an evidence-unavailable message.

Every static Reports snapshot canvas SHALL use the addon's existing `--sbfx-surface-raised` dark-gray semantic surface in both light and dark color schemes. The stored image SHALL retain `object-fit: contain`, so transparent pixels and letterbox space display the dark-gray canvas without cropping the evidence.

#### Scenario: Editing a saved comment shows its original evidence

- **WHEN** a participant activates Edit on a recent comment whose capture and image metadata are available
- **THEN** the editor shows that comment's stored screenshot at its stored aspect ratio with the normalized pin at the reviewed UI point before the body field

#### Scenario: Editing a saved point preserves screenshot evidence

- **WHEN** a participant moves a saved pin from `(0.25, 0.40)` to `(0.60, 0.70)` and activates Save changes from an editor with a visible preview
- **THEN** one edit PATCH stores the new pin while no capture request is made and the canonical capture and image asset remain unchanged

#### Scenario: Saved point cancellation restores the canonical pin

- **WHEN** a participant moves a saved pin and activates Cancel
- **THEN** no PATCH or capture request is sent and the editor closes with the canonical pin unchanged

#### Scenario: Missing evidence does not block body editing

- **WHEN** a legacy comment's capture or image metadata cannot be resolved
- **THEN** overview returns `preview: null`, the editor displays an evidence-unavailable message, body Save changes and Cancel remain usable, and no pin field is submitted

#### Scenario: Report snapshot letterbox stays dark gray

- **WHEN** a stored screenshot is rendered with contain sizing in either the light or dark color scheme
- **THEN** its transparent pixels and uncovered snapshot canvas use `--sbfx-surface-raised` instead of a white or light-gray background while the full image and pin remain visible

### Requirement: Meeting-scoped comment pin numbering

Every currently stored comment in a meeting SHALL receive a unique, contiguous display ordinal from `1` through the meeting's current comment count according to its position in the canonical `meeting.comments` array. The ordinal SHALL be derived before filtering comments by Story or capture and MUST NOT be persisted in version 1 meeting JSON. The same comment SHALL display the same ordinal in its static report snapshot pin, report card heading, and visual comments edit preview. A pending Add comment composer SHALL display the next ordinal equal to the active meeting's current comment count plus one.

Body or pin edits and Complete or Reopen mutations MUST preserve the canonical array order and therefore the current ordinal. After a confirmed Delete removes a comment, regenerated overview and report projections SHALL recompute contiguous ordinals for the remaining canonical array. A missing capture SHALL NOT remove that comment's array position from ordinal derivation, although its screenshot preview SHALL remain unavailable.

#### Scenario: Different captures share one meeting sequence

- **WHEN** a meeting's canonical comments array contains comment A on capture X, comment B on capture Y, and comment C on capture Z
- **THEN** their report snapshot pins and card headings display `1`, `2`, and `3` respectively instead of resetting to `1` for each capture

##### Example: three comments on three captures

- **GIVEN** `meeting.comments = [A(capture-x), B(capture-y), C(capture-z)]`
- **WHEN** the session report is generated
- **THEN** A uses ordinal `1`, B uses ordinal `2`, and C uses ordinal `3` in both pins and card headings

#### Scenario: Story filtering preserves the meeting-wide ordinal

- **WHEN** comment A for Story Alpha precedes comment B for Story Beta and the overview is filtered to Story Beta
- **THEN** comment B's edit preview displays ordinal `2` rather than being renumbered to `1`

#### Scenario: New comment preview uses the next meeting ordinal

- **WHEN** an active meeting currently contains three comments and the participant captures a fourth comment before saving it
- **THEN** the Add comment preview pin displays `4`

#### Scenario: Non-delete mutations preserve ordinals

- **WHEN** a participant edits the body or pin or completes and reopens comment B in the canonical array `[A, B, C]`
- **THEN** the projections continue to display A as `1`, B as `2`, and C as `3`

#### Scenario: Delete recomputes a contiguous sequence

- **WHEN** comment B is confirmed deleted from the canonical array `[A, B, C]`
- **THEN** regenerated overview and report projections display A as `1` and C as `2` without a gap

### Requirement: Report comment lifecycle actions

Each comment card in an active or closed session report SHALL display an Open or Completed status. A legacy comment without resolvedAt SHALL display Open. Completing a comment SHALL persist a server-generated resolvedAt timestamp; completing it again MUST preserve the existing timestamp. Reopening SHALL clear its resolved state. Each card SHALL provide an icon-only Delete button with canonical Storybook TrashIcon geometry and an accessible `Delete comment` name as the first action aligned to the container's left edge. `Copy AI prompt`, Edit, and Complete or Reopen SHALL retain that order inside one action group aligned to the container's right edge. Edit SHALL expose the stored screenshot with an adjustable normalized pin, a plain-text body editor, Save changes, and Cancel. Cancel MUST send no request. Saving valid body and pin drafts SHALL preserve authorName, captureId, createdAt, resolvedAt, capture, and image asset. Activating Delete SHALL open an in-page `role="dialog"` modal confirmation naming both the comment and screenshot without depending on native dialog APIs and MUST NOT send a request. Only activating Confirm delete SHALL send the delete request; Cancel, Escape, backdrop close, or closing the dialog MUST preserve the comment and screenshot evidence and return focus to Delete. Confirmed deletion SHALL permanently remove that comment. When no remaining comment references its capture, confirmed deletion MUST also remove the capture record. When no remaining capture references the same image path, confirmed deletion MUST delete the session image asset. A shared capture or shared image asset MUST remain available until its final reference is removed.

The server SHALL expose `PATCH /sessions/:sessionId/comments/:commentId` with either exclusive body `{ "resolved": boolean }` or an edit body containing one or both of `{ "body": string, "pin": { "xRatio": number, "yRatio": number } }`, and `DELETE /sessions/:sessionId/comments/:commentId` for both active and closed meetings. A body SHALL be trimmed, non-empty, and no longer than `VISUAL_COMMENT_LIMITS.maxBodyLength`; pin ratios SHALL be finite and within `0..1`. Empty edit objects, empty or over-limit body, invalid pin, resolved mixed with edit fields, or unknown-field PATCH bodies MUST return HTTP 400 without modifying canonical data. Successful edit SHALL atomically update all supplied fields in canonical meeting JSON and regenerate the affected session report and root index. A report-generation failure after canonical mutation SHALL return `reportStale: true`. The static report SHALL surface a per-card mutation error without hiding the stored comment or discarding failed body and pin drafts.

Before serving a Reports index or session HTML page, the server SHALL regenerate that derived HTML from current canonical state or meeting JSON through the serialized store queue. A stale pre-upgrade report HTML file MUST NOT preserve outdated Delete controls when canonical evidence is readable. Serving screenshot assets SHALL remain a read-only path without report regeneration.

#### Scenario: Completed comment can be reopened

- **WHEN** a participant completes an Open comment, repeats Complete, and then activates Reopen
- **THEN** the comment transitions Open to Completed to Open, the repeated Complete preserves the first resolvedAt timestamp, and every successful transition is visible after report reload

#### Scenario: Closed meeting comments remain maintainable

- **WHEN** a participant edits, completes, or reopens a comment in a closed meeting report
- **THEN** the mutation succeeds without reopening the meeting or allowing a new comment to be created

#### Scenario: Report comment body and point can be edited

- **WHEN** a participant edits an active or closed report comment to a valid non-empty body and normalized point and activates Save changes
- **THEN** one PATCH atomically changes the canonical body and pin, other evidence and resolution metadata remain unchanged, and the regenerated report displays both new values

#### Scenario: Invalid report edit retains draft and canonical body

- **WHEN** Save changes receives HTTP 400 or 500 for an empty, over-limit, invalid-pin, or failed comment edit
- **THEN** the report keeps the editor open with its body and pin drafts, leaves both canonical values unchanged, re-enables that card's actions, and displays the error only on that card

#### Scenario: Delete cancellation preserves the comment and screenshot

- **WHEN** a participant activates the Delete icon button and then cancels, presses Escape, or closes the in-page confirmation dialog
- **THEN** no delete request is sent and the comment, capture record, and image asset remain available

#### Scenario: Delete and follow-up actions occupy opposite edges

- **WHEN** an Open or Completed comment card is rendered
- **THEN** one accessible TrashIcon Delete button is the first action at the container's left edge without visible `Delete` text, while `Copy AI prompt`, Edit, and Complete or Reopen appear in that order as one group at the container's right edge

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

- **WHEN** the server returns 400, 404, or 500 for an Edit, Complete, Reopen, or Delete request
- **THEN** the report preserves the comment and its current status, retains a failed edit draft, re-enables that card's actions, and displays an actionable error in that card

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

The visual comments overview SHALL return `captureCount` and `commentCount` for the active session and each recent closed session. The panel SHALL expose exactly one `Reports` navigation link and MUST NOT render an active-session `Open` link, a closed meeting history heading, closed meeting cards, or per-session report links. The static report index SHALL distinguish the current active meeting from closed meeting history, but SHALL list only meetings whose derived `captureCount` or `commentCount` is greater than zero. It SHALL display both counts and a session report link for every listed meeting, SHALL omit an active or closed group heading when that group has no listed meetings, and SHALL render one empty-state message when no meeting has evidence. Index filtering MUST NOT delete canonical meeting JSON or disable a direct session report URL. A session report SHALL link back to the meeting index and SHALL render each stored snapshot with its pin, author, body, creation time, and story metadata.

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

#### Scenario: Empty meeting disappears after its last evidence is deleted

- **WHEN** confirmed Delete removes a closed meeting's last comment and its final unreferenced capture
- **THEN** the regenerated report index omits that meeting and omits the closed-history heading when no other closed meeting has evidence, while the canonical meeting JSON and direct session report URL remain readable

##### Example: Last closed comment cleanup

- **GIVEN** meeting `20260721-empty` is closed with `captureCount 1` and `commentCount 1`
- **WHEN** its only comment is confirmed deleted and reference-aware cleanup produces `captureCount 0` and `commentCount 0`
- **THEN** `20260721-empty` and `0 captures · 0 comments` are absent from the Reports index

#### Scenario: Reports index shows one empty state

- **WHEN** every active and closed meeting has zero captures and zero comments
- **THEN** the report index renders one empty-state message and renders neither the active-meeting heading nor the closed-meeting-history heading

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
