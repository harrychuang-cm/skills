## ADDED Requirements

### Requirement: Story comments across meetings in the overview

When the comments overview is requested with a `storyId`, it SHALL include every comment whose capture records that Story ID from every meeting in the comments store, active and closed, each carrying the derived field `sessionId`, the ID of the meeting that stores it. The `ordinal` field SHALL remain the comment's meeting-wide ordinal. Each comment's `preview.imageUrl` SHALL address the screenshot asset inside its own meeting's session directory.

The response SHALL include `meetings`: the active meeting, the five most recently started closed meetings, and every other meeting that holds at least one returned comment, without duplicates, ordered by descending `startedAt`. Each entry SHALL carry `id`, `title`, `startedAt`, `closedAt`, `active`, `commentCount` for the whole meeting, `storyCommentCount` for the requested Story, `tracking` with the `open` and `total` counts of `tracking` comments across every Story of the meeting, `projectRelativeSessionPath`, and `reportUrl`.

A meeting file that cannot be parsed SHALL be skipped while the other meetings are returned. A comment whose capture is missing SHALL NOT be returned for any Story. None of the derived fields SHALL be written to canonical meeting JSON. When the overview is requested without a `storyId`, its comments SHALL remain limited to the active meeting exactly as before, each carrying `sessionId`, and the response SHALL NOT include `meetings`.

#### Scenario: Closed meeting comments are returned for the Story

- **WHEN** no meeting is active and closed meeting `Design review 7/29` holds two comments on Story `prototypes-inventory-prototype--default` and two comments on other Stories
- **THEN** the overview for `prototypes-inventory-prototype--default` returns exactly the two comments with that meeting's `sessionId` and their meeting-wide ordinals, and its `meetings` entry has `active` false, `commentCount` 4, and `storyCommentCount` 2

#### Scenario: Meeting list combines active, recent, and Story meetings

- **WHEN** the store holds an active meeting, seven closed meetings, and the requested Story has comments only in the oldest closed meeting
- **THEN** `meetings` lists the active meeting, the five most recently started closed meetings, and the oldest closed meeting, in descending `startedAt` order, with `storyCommentCount` 0 for every entry except the oldest

#### Scenario: Screenshot URL follows the comment's meeting

- **WHEN** a returned comment is stored in closed meeting M1 while meeting M2 is active
- **THEN** its `preview.imageUrl` addresses the asset under M1's session directory and requesting that URL returns the image

#### Scenario: Unreadable meeting file is skipped

- **WHEN** one meeting's meeting.json contains invalid JSON and another meeting holds a comment on the requested Story
- **THEN** the overview returns that comment and omits the unreadable meeting from `meetings` without an error

#### Scenario: Overview without a Story is unchanged

- **WHEN** the overview is requested without `storyId` while a closed meeting and an active meeting both hold comments
- **THEN** it returns only the active meeting's comments with their meeting-wide ordinals and `sessionId`, and no `meetings` field

### Requirement: Meeting view switch in the panel

The expanded visual comments panel SHALL render a section with the accessible name `Meetings` that lists every entry of the overview's `meetings`. Each row SHALL show the meeting title, an `Active` mark for the active meeting, the meeting's `commentCount`, and an `Open report` link to that meeting's report. A row whose `storyCommentCount` is greater than zero SHALL also render one button with `role="switch"`, visible text `View <storyCommentCount>`, and `aria-checked` reflecting whether that meeting is being viewed; other rows SHALL render no switch.

At most one meeting SHALL be viewed at a time. When the panel mounts and when the current Story changes, no meeting SHALL be viewed. Turning a switch on SHALL view that meeting and turn every other switch off; turning the viewed meeting's switch off SHALL leave no meeting viewed. When the most recently requested overview shows that the viewed meeting no longer has a comment on the current Story, no meeting SHALL be viewed; an older overview MUST NOT clear the view. After the participant saves a new comment, the meeting that stored it SHALL become the viewed meeting. The viewed meeting MUST NOT be written to browser storage, and switching MUST NOT send a request.

While a meeting is viewed, the panel SHALL show `Viewing <meeting title>` above the comment list. While no meeting is viewed, the Story SHALL show no saved pins and the list position SHALL show `Turn on View for a meeting below to see its comments and pins.` when any meeting holds a comment on the current Story, and `No comments on this story yet.` otherwise.

#### Scenario: Panel opens with every meeting off

- **WHEN** closed meeting `Design review 7/29` holds two comments on the current Story and the participant expands the panel
- **THEN** its row shows a switch `View 2` with `aria-checked="false"`, the Story shows no saved pins, and the list position shows `Turn on View for a meeting below to see its comments and pins.`

#### Scenario: Turning a meeting on shows that report's comments

- **WHEN** the participant turns on `View 2` for `Design review 7/29`
- **THEN** the switch reports `aria-checked="true"`, `Viewing Design review 7/29` appears, the list shows that meeting's two comments on the current Story with their meeting-wide ordinals, and the Story shows their two pins

#### Scenario: Only one meeting is viewed at a time

- **WHEN** `Design review 7/29` is viewed and the participant turns on the switch of `Design review 10/2`
- **THEN** the 7/29 switch reports `aria-checked="false"`, the 10/2 switch reports `aria-checked="true"`, and the list and pins contain only 10/2's comments on the current Story

#### Scenario: Turning the viewed meeting off

- **WHEN** the participant turns off the viewed meeting's switch
- **THEN** no switch is checked, no saved pin remains on the Story, and the list position shows the View hint

#### Scenario: Meeting without comments on this Story has no switch

- **WHEN** the active meeting holds comments only on other Stories
- **THEN** its row shows `Active`, its comment count, and `Open report`, and renders no switch

#### Scenario: Saving a comment views the meeting that stored it

- **WHEN** closed meeting `Design review 7/29` is viewed, no meeting is active, and the participant saves a new comment
- **THEN** a meeting titled `Notes <local date>` is created with the comment, its row's switch reports `aria-checked="true"`, the 7/29 switch reports `aria-checked="false"`, and the new comment's pin is shown

#### Scenario: Changing Story resets the view

- **WHEN** a meeting is viewed and the participant navigates to another Story
- **THEN** no meeting is viewed on the new Story

#### Scenario: Story without comments

- **WHEN** no meeting holds a comment on the current Story
- **THEN** no row renders a switch and the list position shows `No comments on this story yet.`

### Requirement: Saved pin information card

Hovering a saved pin with a pointer or focusing it with the keyboard SHALL show one information card next to that pin, and leaving or blurring the pin SHALL remove it; at most one card SHALL be shown at a time. The card SHALL show, in order: `Comment <ordinal> · <kind label> · <Open or Completed>`; the comment body limited to three lines; the author and the readable creation time; and the comment's screenshot as a thumbnail no wider than 240 CSS pixels, or the text `Screenshot unavailable` when the comment has no screenshot or the image fails to load. The card SHALL be marked capture-ignore, MUST NOT receive pointer events, and MUST NOT appear in a captured screenshot. The card SHALL be no wider than 264 CSS pixels and no wider than the viewport width minus 24 CSS pixels. It SHALL be placed 12 CSS pixels on the inline-end side of the pin, SHALL move to the inline-start side when it would come within 12 CSS pixels of the viewport's inline-end edge, and SHALL be shifted vertically to stay at least 12 CSS pixels from the viewport's top and bottom edges. When neither side leaves 12 CSS pixels between the card and the viewport edge, the card SHALL instead be placed 12 CSS pixels below the pin, or 12 CSS pixels above it when below would come within 12 CSS pixels of the viewport's bottom edge, centered on the pin and shifted horizontally to stay at least 12 CSS pixels inside the viewport, so that it does not cover the pin. While a new comment is being placed, no card SHALL be shown. The card SHALL follow the comment surface visual rules.

#### Scenario: Hovering a pin shows its card

- **WHEN** the participant hovers saved pin `3`, an Open Tracking comment with a screenshot
- **THEN** one card appears next to the pin reading `Comment 3 · Tracking · Open`, the body, the author and time, and the screenshot thumbnail, and moving the pointer away removes it

#### Scenario: Keyboard focus shows the card

- **WHEN** the participant moves keyboard focus onto saved pin `3`
- **THEN** pin 3's card appears, and it disappears when focus moves to another element

#### Scenario: Missing screenshot

- **WHEN** the hovered comment's screenshot is unavailable
- **THEN** the card shows `Screenshot unavailable` in place of the thumbnail

#### Scenario: Card flips near the viewport edge

- **WHEN** a hovered pin lies within 100 CSS pixels of the viewport's inline-end edge
- **THEN** the card is placed on the inline-start side of the pin and stays fully inside the viewport

#### Scenario: Narrow preview places the card below or above the pin

- **WHEN** the preview is narrower than a card on either side of the hovered pin
- **THEN** the card is placed below the pin, or above it near the bottom edge, stays inside the viewport, and does not overlap the pin

##### Example: placement in a 375 by 812 preview with a 200 px tall card

| Pin center (x, y) | Card placement | Card box (left, top, width) |
| ----------------- | -------------- | --------------------------- |
| (200, 300) | below the pin | (68, 324, 264) |
| (200, 700) | above the pin | (68, 476, 264) |
| (100, 300) | below the pin, kept inside | (12, 324, 264) |

#### Scenario: Card is excluded from captures

- **WHEN** a card is visible and the participant starts a new comment
- **THEN** the card disappears and the captured screenshot contains no card

## MODIFIED Requirements

### Requirement: Recent editable comments in visual comments panel

While a meeting is viewed, the expanded visual comments panel SHALL render every comment for the current Story from the viewed meeting, whether that meeting is active or closed, ordered by descending server-generated createdAt, in a list that scrolls inside the panel. It MUST NOT include comments from another Story or another meeting. Each item SHALL display its meeting-wide ordinal, author, createdAt, body, and Open or Completed status.

Each item SHALL provide Edit and icon-only Delete actions using centralized `FigmaReviewLabels` defaults, and both actions SHALL send their requests to the meeting that stores the comment. Edit SHALL open one body-level, capture-ignored overlay modal with a labelled `role="dialog"`, `aria-modal="true"`, a responsive surface larger than the 320px visual comments panel at wide viewports, and a viewport-bounded scrollable surface at narrow viewports. The modal SHALL render the stored screenshot and numbered normalized point before the body field, and SHALL provide Save changes and Cancel. Save changes SHALL reject an empty or over-limit body and an invalid pin, then SHALL send one atomic edit request containing the current body and pin drafts. Cancel, Escape, or backdrop close SHALL restore the canonical body and pin without sending a request, close the modal, and return focus to the originating Edit action. A successful Save SHALL close the modal and preserve the expanded panel; a failed Save SHALL retain the modal and both drafts. Activating Delete SHALL open an in-page `role="dialog"` confirmation that states the comment and unreferenced screenshot evidence will be permanently deleted and MUST NOT send a request. Only Confirm delete SHALL send DELETE; Cancel, Escape, or backdrop close SHALL preserve the comment and screenshot and return focus to Delete. Saving an edit or confirming a delete SHALL refresh the list from canonical overview data.

#### Scenario: Panel lists every current-Story comment of the viewed meeting newest first

- **WHEN** the viewed meeting contains current-Story comments created at 10:00, 10:01, 10:02, and 10:03 plus a newer comment from another Story, and another meeting holds a comment on the current Story
- **THEN** the panel list contains the viewed meeting's current-Story comments from 10:03, 10:02, 10:01, and 10:00 in that order, each with its meeting-wide ordinal, and contains neither the other Story's comment nor the other meeting's comment

#### Scenario: Long list scrolls inside the panel

- **WHEN** the viewed meeting contains twelve current-Story comments and the panel height cannot show them all
- **THEN** the list scrolls inside the panel while Add comment, the kind filter, and the footer stay reachable without scrolling the Story

#### Scenario: Panel edit opens a larger accessible evidence modal

- **WHEN** a participant activates Edit on a listed comment with available evidence
- **THEN** one labelled body-level modal opens above a dimmed backdrop with the stored screenshot, meeting-wide numbered point, body field, Save changes, and Cancel, while no inline editor expands inside the 320px list item

#### Scenario: Panel modal edit atomically updates body and point and stays open

- **WHEN** a participant edits a listed comment body and point, activates Save changes, and the same Story preview refreshes from the canonical overview
- **THEN** one PATCH stores both values, the modal closes, the updated body and pin are visible after canonical refresh, the screenshot and other evidence metadata are unchanged, and the panel remains expanded

#### Scenario: Editing a comment of a closed meeting targets that meeting

- **WHEN** meeting M2 is active, closed meeting M1 is viewed, and the participant saves an edit to a listed comment
- **THEN** exactly one PATCH is sent to `/sessions/M1/comments/<comment id>`, M2 is unchanged, and the list shows the updated body after refresh

#### Scenario: Panel edit cancellation preserves canonical content and focus

- **WHEN** a participant changes the body and point drafts and activates Cancel, presses Escape, or clicks the backdrop
- **THEN** no PATCH request is sent, the modal closes, the item returns to its canonical body and pin, and focus returns to the originating Edit action

#### Scenario: Failed panel edit keeps the modal draft

- **WHEN** a participant changes the body and point and the edit PATCH fails
- **THEN** the modal remains open with both drafts and a visible error while canonical comment evidence remains unchanged

#### Scenario: Panel delete requires confirmation

- **WHEN** a participant activates a listed comment's Delete button and then cancels the in-page dialog
- **THEN** no DELETE request is sent, focus returns to Delete, and the comment and screenshot remain visible

#### Scenario: Panel confirmed delete refreshes the list

- **WHEN** a participant confirms deletion of one listed comment of a viewed closed meeting
- **THEN** exactly one DELETE request is sent to that meeting, reference-aware screenshot cleanup runs, the panel remains expanded, and the list no longer contains the deleted comment

### Requirement: Comment list kind filter

The expanded visual comments panel SHALL render one group with the accessible name `Filter comments` containing three toggle options, `All`, `Visual fix`, and `Tracking`. Each option SHALL show the count of the viewed meeting's current-Story comments that it matches, and SHALL show `0` while no meeting is viewed. `All` SHALL be selected when the panel mounts. Selecting an option SHALL list only the matching comments and SHALL keep that selection while the panel stays mounted, including when another meeting is viewed. An option whose count is zero SHALL remain selectable and the list SHALL then show one empty message. Changing the filter MUST NOT send a request.

#### Scenario: Filter narrows the list to one kind

- **WHEN** the participant selects a filter option while a meeting is viewed
- **THEN** the list shows only the viewed meeting's current-Story comments of that kind and the option counts are unchanged

##### Example: two visual fixes and three tracking comments on the current Story in the viewed meeting

| Selected option | Option labels | Items in the list |
| --------------- | ------------- | ----------------- |
| `All` | `All 5`, `Visual fix 2`, `Tracking 3` | 5 |
| `Visual fix` | `All 5`, `Visual fix 2`, `Tracking 3` | 2 |
| `Tracking` | `All 5`, `Visual fix 2`, `Tracking 3` | 3 |

#### Scenario: Empty filter shows one message

- **WHEN** the viewed meeting has only `Visual fix` comments on the current Story and the participant selects `Tracking`
- **THEN** the option reads `Tracking 0`, the list shows one empty message, and no request is sent

#### Scenario: Counts follow the viewed meeting

- **WHEN** meeting M1 holds one `tracking` comment and meeting M2 holds two `visual-fix` comments on the current Story, and the participant views M1, then M2, then turns M2 off
- **THEN** the labels read `All 1`, `Visual fix 0`, `Tracking 1`; then `All 2`, `Visual fix 2`, `Tracking 0`; then `All 0`, `Visual fix 0`, `Tracking 0`

### Requirement: Saved comment pins on the Story

While the visual comments panel is expanded, a meeting is viewed, and the panel's `Show pins` control is on, the Story SHALL display one numbered pin for every current-Story comment of the viewed meeting that passes the panel's kind filter. While no meeting is viewed, no saved pin SHALL be displayed. `Show pins` SHALL be on when the panel mounts and its state MUST NOT be written to browser storage. Collapsing the panel or turning `Show pins` off SHALL remove every saved pin. Each pin SHALL show the comment's meeting-wide ordinal at the comment's own stored normalized position within the current bounds of the resolved capture target, including when the comment's screenshot evidence is unavailable, SHALL be repositioned when the viewport resizes or scrolls, SHALL be marked capture-ignore, and MUST NOT appear in a captured screenshot. While a new comment is being placed, from the start of point selection until its composer closes, saved pins SHALL remain visible and MUST NOT receive pointer events, so that a point under a saved pin can be chosen.

A `Visual fix` pin SHALL be circular and a `Tracking` pin SHALL be a rounded square. Each pin's accessible name SHALL be `Comment <ordinal>, <kind label>, <Open or Completed>`. A Completed comment's pin SHALL use the subdued surface color.

The comments overview SHALL expose, for each comment, a derived `state` object holding the `routeId` and `stateId` recorded on its capture when present, and MUST NOT persist it to canonical meeting JSON. When a comment's recorded `routeId` or `stateId` differs from the Story's current value, its pin MUST NOT be displayed and its list item SHALL show `Captured in another state`. A comment with no recorded `routeId` and no recorded `stateId` SHALL always be eligible for a pin. When a configured capture selector matches no element, or the resolved capture target has zero bounds, no saved pin SHALL be displayed and the panel list SHALL remain usable; saved pins MUST NOT fall back to another element's bounds.

#### Scenario: Viewed meeting shows pins for the current Story

- **WHEN** the viewed meeting holds four comments on the current Story, one of them without screenshot evidence, and one comment on another Story, and another meeting holds a comment on the current Story
- **THEN** the Story shows exactly four numbered pins at those comments' normalized positions with their meeting-wide ordinals

#### Scenario: Collapsing the panel removes the pins

- **WHEN** the participant collapses the panel or turns `Show pins` off
- **THEN** no saved pin remains on the Story and prototype controls beneath the former pins receive clicks again

#### Scenario: Pins follow the kind filter and show kind and status

- **WHEN** the panel lists comments of both kinds and states for the viewed meeting and the participant changes the kind filter
- **THEN** only pins of comments in the filtered list are displayed, each with the shape and accessible name of its kind and status

##### Example: four comments on the current Story in the viewed meeting

- **GIVEN** comment 1 `visual-fix` Open, comment 2 `tracking` Completed, comment 3 `visual-fix` Open, and comment 5 `tracking` Open on the current Story, and comment 4 on another Story

| Kind filter | Pins displayed | Accessible names |
| ----------- | -------------- | ---------------- |
| `All` | 1 (circle), 2 (rounded square, subdued), 3 (circle), 5 (rounded square) | `Comment 1, Visual fix, Open`; `Comment 2, Tracking, Completed`; `Comment 3, Visual fix, Open`; `Comment 5, Tracking, Open` |
| `Visual fix` | 1, 3 | `Comment 1, Visual fix, Open`; `Comment 3, Visual fix, Open` |
| `Tracking` | 2, 5 | `Comment 2, Tracking, Completed`; `Comment 5, Tracking, Open` |

#### Scenario: A comment captured in another state has no pin

- **WHEN** a comment was captured with stateId `modal-open` and the Story's current stateId is `default`
- **THEN** that comment has no pin on the Story and its list item shows `Captured in another state`

##### Example: state matching

| Recorded routeId / stateId | Current routeId / stateId | Pin displayed |
| -------------------------- | ------------------------- | ------------- |
| `/order` / `modal-open` | `/order` / `modal-open` | yes |
| `/order` / `modal-open` | `/order` / `default` | no |
| `/order` / none | `/cart` / none | no |
| none / none | `/order` / `default` | yes |
| none / none | none / none | yes |

#### Scenario: Pins are excluded from captures

- **WHEN** saved pins are displayed and the participant adds a new comment
- **THEN** the captured screenshot contains no saved pin

#### Scenario: A point under a saved pin can receive a new comment

- **WHEN** the participant starts a new comment and clicks the point covered by saved pin `3`
- **THEN** the composer opens for a new comment at that point, comment 3 is not selected by that click, and the prototype control beneath runs no handler

#### Scenario: Unresolvable capture target shows no pins

- **WHEN** the configured capture selector matches no element while a meeting is viewed
- **THEN** no saved pin is displayed and the panel list still shows the comments

### Requirement: Panel tracking prompt handoff

When the viewed meeting holds at least one `tracking` comment on any Story, the expanded visual comments panel SHALL render a `Copy tracking prompts` action; the action MUST NOT require the viewed meeting to be active. Activating it SHALL collect the viewed meeting's `tracking` comments on the current Story whose status is Open, order them by meeting-wide ordinal ascending, and write one Tracking Instrumentation Request containing one `### Comment <ordinal>` subsection per collected comment through `navigator.clipboard.writeText`. When another Story of the viewed meeting also has an Open `tracking` comment, the panel SHALL additionally render a `Copy all stories` action that collects the Open `tracking` comments of every Story in the viewed meeting. When no meeting is viewed or the viewed meeting holds no `tracking` comment, neither action SHALL render. Completed comments and `visual-fix` comments MUST NOT be included. The actions MUST NOT attach images, change any comment, or send a request to an AI service. The kind filter MUST NOT change which comments either action collects.

The comments overview SHALL expose `activeProjectRelativeSessionPath`, the active meeting's session directory relative to the project root with forward slashes, or `null` when that directory is outside the project root or no meeting is active, and each `meetings` entry SHALL expose the same value for its own meeting as `projectRelativeSessionPath`. Each subsection's Evidence SHALL be the same fields the viewed meeting's report emits for that comment, so that the copied Markdown equals the Markdown of that report's batch copy for the same scope.

The panel SHALL show exactly one of these messages in a polite live region after each activation:

- `Tracking prompt copied. Comments included: <N>.` after the clipboard write succeeds.
- `No open tracking comments to copy.` when the scope holds no Open `tracking` comment; no clipboard write SHALL occur.
- `Unable to copy AI prompt. Check browser clipboard permission.` when meeting data cannot be read or the clipboard write fails.

#### Scenario: Panel copies the viewed meeting's open tracking comments

- **WHEN** the participant activates a panel copy action while a meeting is viewed
- **THEN** the clipboard receives one Tracking Instrumentation Request whose subsections are exactly the Open `tracking` comments of that action's scope in ascending ordinal order

##### Example: five comments across two stories in the viewed meeting, viewing Story A

- **GIVEN** comment 1 `visual-fix` Open on Story A, comment 2 `tracking` Open on Story A, comment 3 `tracking` Completed on Story A, comment 4 `tracking` Open on Story B, and comment 5 `tracking` Open on Story A

| Action | Subsections in the copied prompt | Message |
| ------ | -------------------------------- | ------- |
| `Copy tracking prompts` | `### Comment 2`, `### Comment 5` | `Tracking prompt copied. Comments included: 2.` |
| `Copy all stories` | `### Comment 2`, `### Comment 4`, `### Comment 5` | `Tracking prompt copied. Comments included: 3.` |

#### Scenario: Copy works for a closed meeting without an active meeting

- **WHEN** no meeting is active and the participant views closed meeting `Design review 7/29`, which holds two Open `tracking` comments on the current Story and none on other Stories
- **THEN** the panel renders `Copy tracking prompts` without `Copy all stories`, and the copied Markdown equals the Markdown that report's batch copy produces for the current Story

#### Scenario: Copy all stories appears only when another Story has open tracking comments

- **WHEN** every Open `tracking` comment of the viewed meeting is on the current Story
- **THEN** the panel renders `Copy tracking prompts` and does not render `Copy all stories`

#### Scenario: No copy action without a viewed tracking meeting

- **WHEN** no meeting is viewed, or the viewed meeting holds only `visual-fix` comments
- **THEN** the panel renders neither `Copy tracking prompts` nor `Copy all stories`

#### Scenario: Nothing open to copy

- **WHEN** every `tracking` comment of the viewed meeting on the current Story is Completed and the participant activates `Copy tracking prompts`
- **THEN** no clipboard write occurs and the live region announces `No open tracking comments to copy.`

#### Scenario: Clipboard failure is reported

- **WHEN** `navigator.clipboard.writeText` rejects during a panel copy
- **THEN** the live region announces `Unable to copy AI prompt. Check browser clipboard permission.` and no mutation request is sent

#### Scenario: Session path outside the project is unavailable

- **WHEN** the configured comments directory resolves outside the project root
- **THEN** the overview returns `activeProjectRelativeSessionPath` `null` and `projectRelativeSessionPath` `null` for every `meetings` entry, and the copied prompt contains `Project-relative screenshot path: unavailable` with no absolute host path

### Requirement: Discoverable active and historical meetings

The visual comments overview SHALL return `captureCount` and `commentCount` for the active session and each recent closed session. The panel SHALL expose exactly one `Reports` navigation link to the meeting index in its header and MUST NOT render an active-session `Open` link. The panel's `Meetings` section SHALL list the meetings defined by the Meeting view switch in the panel requirement, each with one `Open report` link to its own session report. The static report index SHALL distinguish the current active meeting from closed meeting history, but SHALL list only meetings whose derived `captureCount` or `commentCount` is greater than zero. It SHALL display both counts and a session report link for every listed meeting, SHALL omit an active or closed group heading when that group has no listed meetings, and SHALL render one empty-state message when no meeting has evidence. Index filtering MUST NOT delete canonical meeting JSON or disable a direct session report URL. A session report SHALL link back to the meeting index and SHALL render each stored snapshot with its pin, author, body, creation time, and story metadata.

#### Scenario: A new active meeting does not hide prior evidence

- **WHEN** the current meeting has zero comments and a prior closed meeting has one capture and one comment
- **THEN** the panel retains current meeting controls, one header `Reports` link, and a `Meetings` row for each meeting with its `Open report` link, while the report index labels the prior meeting as closed with captureCount 1, commentCount 1, and an openable session report link

#### Scenario: Panel lists meetings with their own report links

- **WHEN** the overview contains an active meeting and multiple recent closed meetings
- **THEN** the panel renders one header `Reports` link to the meeting index, no active `Open` link, and one `Meetings` row per listed meeting whose `Open report` link resolves under `/reports/sessions/<meeting-id>/index.html`

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
