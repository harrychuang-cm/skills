## ADDED Requirements

### Requirement: Evidence writes do not reload the preview

The review status Vite plugin SHALL exclude its resolved comments directory, review status file, and export payload directory from the dev server's file watching, and MUST NOT require any change to the project's Storybook or Vite configuration to do so. While those paths are inside the project root, starting or ending a meeting and creating, editing, resolving, or deleting a comment MUST NOT reload the Story preview page. The existing open-state and comment-kind continuation across a page reload SHALL remain in effect for reloads from other causes.

#### Scenario: Saving a comment keeps the prototype state

- **WHEN** the comments directory is inside the project root, a prototype is in state B, and a participant saves a comment
- **THEN** the preview page is not reloaded and the prototype remains in state B

##### Example: requests against an in-project comments directory

| Request | Preview page reloads |
| ------- | -------------------- |
| Start meeting | 0 |
| Save comment | 0 |
| Edit comment | 0 |
| Delete comment | 0 |
| End meeting | 0 |

#### Scenario: Project configuration is untouched

- **WHEN** the addon runs in a project whose Storybook configuration declares no `server.watch` setting
- **THEN** evidence writes do not reload the preview and the project's configuration files are unchanged

### Requirement: Direct commenting without a named meeting

When no meeting is active and comments capability is available, activating Add comment SHALL enter the point-capture flow. When the participant saves that comment, the client SHALL first create a meeting whose title is `Notes ` followed by the participant's local date as `YYYY-MM-DD`, and SHALL then create the comment in that meeting. If the create-meeting request returns HTTP 409 with an active meeting, the client SHALL create the comment in that active meeting. If meeting creation fails for any other reason, the composer SHALL stay open with its body, kind, pin, and capture, SHALL show the error, and MUST NOT send a create-comment request. The panel SHALL keep Start meeting with a participant-entered title available as a secondary action while no meeting is active, and SHALL keep End meeting available while a meeting is active.

#### Scenario: First comment creates a dated meeting

- **WHEN** no meeting is active, the participant's local date is 2026-10-01, and the participant saves a comment
- **THEN** exactly one meeting titled `Notes 2026-10-01` is created and active, and it contains that comment with ordinal `1`

#### Scenario: Later comments reuse the meeting

- **WHEN** the meeting `Notes 2026-10-01` is active and the participant saves another comment
- **THEN** no meeting is created and the comment is stored in `Notes 2026-10-01` with ordinal `2`

#### Scenario: A concurrently started meeting is reused

- **WHEN** another browser starts the meeting `Weekly design review` after this browser opened its composer, and this participant saves the comment
- **THEN** the create-meeting request returns HTTP 409, the comment is stored in `Weekly design review`, and no meeting titled `Notes 2026-10-01` exists

#### Scenario: Meeting creation failure keeps the draft

- **WHEN** the create-meeting request returns HTTP 500 while the participant saves the first comment
- **THEN** the composer stays open with the same body, kind, pin, and capture, shows the error, and no create-comment request is sent

#### Scenario: Named meeting remains available

- **WHEN** no meeting is active and the participant chooses the secondary Start meeting action and enters `Weekly design review`
- **THEN** a meeting titled `Weekly design review` becomes active and later comments are stored in it

### Requirement: Anchored comment composer

After capture succeeds, the comment composer SHALL render as one capture-ignored, body-level surface anchored beside the pending pin and MUST NOT render inside the visual comments panel. It SHALL contain, in this order, the `Comment type` control, the comment body field, and the Cancel and Save comment actions. It MUST NOT contain a snapshot thumbnail or a display-name field. The body field SHALL receive focus when the composer opens and SHALL show the placeholder `What should change here?` while `Visual fix` is selected and `Event name, parameters, and when it fires` while `Tracking` is selected. Every composer control SHALL be visible without scrolling at a viewport of 1280 × 860 CSS pixels.

At a viewport width of 720 CSS pixels or more, the composer SHALL be 320 CSS pixels wide and SHALL place its inline-start edge 24 CSS pixels to the inline-end side of the pin center. When that placement would leave less than 12 CSS pixels to the viewport's inline-end edge, the composer SHALL instead place its inline-end edge 24 CSS pixels to the inline-start side of the pin center. The composer SHALL be shifted along the block axis to keep at least 12 CSS pixels from the viewport's block edges, and MUST NOT cover the pin. Below 720 CSS pixels wide, the composer SHALL dock to the bottom edge of the viewport across its width, and SHALL dock to the top edge instead when the pin lies inside the area the bottom dock covers.

The composer SHALL stay open and unchanged when the visual comments panel is collapsed or expanded. Save comment SHALL be disabled while the body is empty or a save is in progress. A failed save SHALL keep the composer open with its body, kind, pin, and capture and SHALL show the error. A successful save or Cancel SHALL close the composer and remove the pending pin.

#### Scenario: Composer opens beside the pin with the body focused

- **WHEN** capture succeeds after the participant selects a Story point
- **THEN** one composer appears beside the pin outside the visual comments panel, shows `Comment type`, the body field, Cancel, and Save comment in that order, has no snapshot thumbnail or display-name field, and the body field has focus

#### Scenario: Every control is visible at 1280 by 860

- **WHEN** the composer opens in a 1280 × 860 CSS pixel viewport while the Figma export workspace is expanded
- **THEN** the `Comment type` control, the body field, Cancel, and Save comment are all inside the viewport without scrolling any surface

#### Scenario: Composer flips to stay inside the viewport

- **WHEN** the composer opens for a pin near the viewport's inline-end edge
- **THEN** the composer sits on the inline-start side of the pin and does not cover it

##### Example: placement in a 1280 CSS pixel wide viewport

| Pin center x | Composer inline-start edge | Composer inline-end edge | Side |
| ------------ | -------------------------- | ------------------------ | ---- |
| 200 | 224 | 544 | inline-end |
| 900 | 924 | 1244 | inline-end |
| 1000 | 656 | 976 | inline-start |
| 1200 | 856 | 1176 | inline-start |

#### Scenario: Narrow viewport docks the composer away from the pin

- **WHEN** the composer opens in a viewport narrower than 720 CSS pixels
- **THEN** it docks across the viewport width at the bottom edge, or at the top edge when the pin lies inside the area the bottom dock covers

#### Scenario: Placeholder follows the selected kind

- **WHEN** the participant switches `Comment type` from `Visual fix` to `Tracking` with an empty body
- **THEN** the body placeholder changes from `What should change here?` to `Event name, parameters, and when it fires`

#### Scenario: Collapsing the panel leaves the composer open

- **WHEN** the participant collapses the visual comments panel while the composer holds a draft
- **THEN** the composer stays open beside its pin with the same body, kind, and pin

### Requirement: Comment keyboard shortcuts

In Story view with comments capability available, pressing `C` with no modifier key while focus is not inside an input, textarea, select, or contenteditable element SHALL enter the point-capture flow, whether the visual comments panel is expanded or collapsed. While the composer is open, `Meta+Enter` or `Control+Enter` SHALL perform Save comment when Save comment is enabled, and `Escape` SHALL perform Cancel. The Add comment action SHALL display a `C` hint and Save comment SHALL display its shortcut hint; both hints MUST be excluded from the actions' accessible names. Setting `visualComments.shortcuts` to `false` SHALL disable the `C` and `Meta+Enter`／`Control+Enter` shortcuts and remove their hints, while `Escape` keeps cancelling. The option SHALL default to enabled. Shortcuts MUST NOT act in Docs view.

#### Scenario: C starts a comment while the panel is collapsed

- **WHEN** the visual comments panel is collapsed, focus is on the Story body, and the participant presses `C`
- **THEN** point capture is armed and the capture prompt is visible on the Story

#### Scenario: C typed into a prototype field is not intercepted

- **WHEN** focus is inside a text input of the prototype and the participant presses `C`
- **THEN** the character is entered into that input and point capture is not armed

#### Scenario: Modifier save shortcut stores the comment

- **WHEN** the composer body contains text and the participant presses `Meta+Enter` or `Control+Enter`
- **THEN** exactly one create-comment request is sent with that body, kind, and pin

#### Scenario: Escape cancels the composer

- **WHEN** the composer is open and the participant presses `Escape`
- **THEN** the composer and the pending pin are removed and no create-comment request is sent

#### Scenario: Shortcuts are disabled by configuration

- **WHEN** `visualComments.shortcuts` is `false` and the participant presses `C` on the Story body
- **THEN** point capture is not armed and the Add comment action shows no `C` hint

### Requirement: Comment list kind filter

The expanded visual comments panel SHALL render one group with the accessible name `Filter comments` containing three toggle options, `All`, `Visual fix`, and `Tracking`. Each option SHALL show the count of current-Story comments of the active meeting that it matches. `All` SHALL be selected when the panel mounts. Selecting an option SHALL list only the matching comments and SHALL keep that selection while the panel stays mounted. An option whose count is zero SHALL remain selectable and the list SHALL then show one empty message. Changing the filter MUST NOT send a request.

#### Scenario: Filter narrows the list to one kind

- **WHEN** the participant selects a filter option
- **THEN** the list shows only the current-Story comments of that kind and the option counts are unchanged

##### Example: two visual fixes and three tracking comments on the current Story

| Selected option | Option labels | Items in the list |
| --------------- | ------------- | ----------------- |
| `All` | `All 5`, `Visual fix 2`, `Tracking 3` | 5 |
| `Visual fix` | `All 5`, `Visual fix 2`, `Tracking 3` | 2 |
| `Tracking` | `All 5`, `Visual fix 2`, `Tracking 3` | 3 |

#### Scenario: Empty filter shows one message

- **WHEN** the current Story has only `Visual fix` comments and the participant selects `Tracking`
- **THEN** the option reads `Tracking 0`, the list shows one empty message, and no request is sent

### Requirement: Commenting identity in the panel

The expanded visual comments panel footer SHALL show `Commenting as ` followed by the stored display name, or `Anonymous` when none is stored, with one Change action that reveals a display-name field. Confirming that field SHALL store the name in browser localStorage under the configured authorStorageKey, and comments created afterwards SHALL carry it as authorName. The comment composer MUST NOT ask for a display name.

#### Scenario: Name set once is used by later comments

- **WHEN** the participant sets the display name to `Mina` in the panel footer and then saves two comments
- **THEN** both stored comments have authorName `Mina` and the composer showed no display-name field

#### Scenario: Missing name shows Anonymous

- **WHEN** no display name is stored
- **THEN** the footer reads `Commenting as Anonymous` and a saved comment has authorName `Anonymous`

### Requirement: Comment surface visual rules

The visual comments panel, the comment composer, the capture prompt, the pending pin, the panel edit modal, and the delete confirmation SHALL satisfy all of the following in React + Vite and Vue 3 + Vite Story view:

- Every rendered text has a computed font size of at least 12 CSS pixels.
- No element has a background color or border color whose alpha is greater than 0 and less than 1, except the single scrim behind the edit modal and the delete confirmation.
- No element has a gradient background image or a backdrop filter.
- A comment list item has no border and no outline as container decoration, and contains no nested container that has its own border or its own fill; a focus-visible outline is permitted.

Hierarchy between these surfaces SHALL be expressed with opaque surface colors or shadows.

#### Scenario: Expanded panel with comments passes the style audit

- **WHEN** the expanded panel lists comments of both kinds in Open and Completed states
- **THEN** every element inside the panel satisfies the four rules

##### Example: values the audit rejects

| Element | Computed style | Result |
| ------- | -------------- | ------ |
| list item timestamp | `font-size: 10px` | rejected |
| form field | `border-color: rgba(255, 255, 255, 0.08)` | rejected |
| list item | `border: 1px solid rgb(52, 56, 74)` | rejected |
| list item | `border: 0px`, `background-color: rgb(32, 34, 45)` | accepted |
| modal scrim | `background-color: rgba(0, 0, 0, 0.68)` | accepted |

#### Scenario: Composer and dialogs pass the style audit

- **WHEN** the comment composer, the panel edit modal, and the delete confirmation are each open
- **THEN** every element inside each surface satisfies the four rules, with the scrim as the only translucent color

## MODIFIED Requirements

### Requirement: Point-based pre-action UI capture

The panel SHALL provide an Add visual comment mode in Story view whenever comments capability is available, with or without an active meeting. The preview SHALL intercept the next pointer sequence within the resolved capture target during capture phase, prevent the underlying prototype action, freeze the target bounds and pointer position, hide elements marked data-sbfx-capture-ignore, wait two animation frames, and capture the pre-action UI state before opening the comment composer.

The capture target SHALL resolve from the configured captureSelector, then #storybook-root, then document.body. A configured selector that resolves no element, a target with zero bounds, or an encoding failure MUST produce a visible retryable error and MUST NOT open the composer or call the comment API. That error SHALL be visible whether the visual comments panel is expanded or collapsed.

While comment mode is armed, a capture-ignored capture prompt SHALL be visible on the Story, outside the visual comments panel, with a Cancel action.

#### Scenario: Commenting on an interactive control preserves its state

- **WHEN** a prototype is in state B and the participant enters comment mode and clicks a button that normally transitions to state C
- **THEN** the button handler does not run and the captured image represents state B

#### Scenario: Addon chrome is excluded

- **WHEN** the Export review panel, export overlay, capture instruction, composer, and transient pin layer carry data-sbfx-capture-ignore
- **THEN** none of those elements appear in the captured image

#### Scenario: Project captures a body portal

- **WHEN** captureSelector is configured as "body" and a modal is rendered through a body portal
- **THEN** the image includes the modal while excluding every element marked data-sbfx-capture-ignore

#### Scenario: Invalid capture target fails safely

- **WHEN** captureSelector matches no element or the resolved target has zero width or height
- **THEN** the panel exits comment mode, reports the capture error, and sends no create-comment request

#### Scenario: Capture is available without a meeting

- **WHEN** no meeting is active, comments capability is available, and the participant enters comment mode and clicks a point in the capture target
- **THEN** the pre-action UI state is captured and the comment composer opens

#### Scenario: Capture prompt is visible while the panel is collapsed

- **WHEN** the participant enters comment mode while the visual comments panel is collapsed
- **THEN** the capture prompt and its Cancel action are visible on the Story and are excluded from the captured image

#### Scenario: Participant cancels capture mode

- **WHEN** the participant presses Escape or activates Cancel before capture completes
- **THEN** the panel removes its pointer interception and creates no capture, asset, or comment

#### Scenario: Docs view does not offer capture

- **WHEN** the current Storybook context has viewMode "docs"
- **THEN** Add visual comment is disabled and no capture listener is installed

### Requirement: Concise visual comment capture action

When comments capability permits capture, with or without an active meeting, the visual comments detail panel SHALL render its default primary capture action with the visible text and accessible name `Add comment`. Activating `Add comment` SHALL enter the existing point-capture flow. The public `addVisualComment` label override key SHALL remain supported and a consumer-provided value MUST replace the default text without changing capture behavior.

#### Scenario: Default action uses concise copy

- **WHEN** the panel loads with comments capability available and no custom labels, with or without an active meeting
- **THEN** the enabled capture action is named `Add comment` and the Review panel does not render `Add visual comment`

#### Scenario: Custom capture action label remains supported

- **WHEN** a consumer supplies a custom value through the `addVisualComment` label key
- **THEN** the capture action displays that value and activating it enters the same point-capture flow

### Requirement: Independent visual comments panel

For an included Story view, visual comments SHALL render as an independent capture-ignored panel anchored at the top-right instead of inside Export review. The panel SHALL default to a collapsed icon-only launcher that uses the Storybook `CommentIcon`. In that collapsed state, the 36×36 button SHALL occupy the complete 36×36 panel surface without a hidden copy track or inter-column gap, and the 14×14 SVG, button, and panel centers MUST differ by no more than 0.5 CSS pixel on either axis. Activating the launcher SHALL expand a header whose start column stacks the `Comments` heading above the active meeting title, and whose end column holds the single `Reports` button followed by the launcher button in the same row. The start column SHALL show no meeting title when no meeting is active. The Reports button SHALL use compact intrinsic／hug-content width. Below that header the panel SHALL render, in this order, the primary Add comment action, the comment kind filter, the current-Story comment list, and a footer holding the commenting identity and the meeting controls. The comment composer and the capture prompt MUST NOT render inside the panel. The launcher MUST expose synchronized `aria-expanded`, `aria-controls`, and Open or Close comments accessible labels.

The expanded comments panel and the bottom-right Figma workspace MUST NOT overlap at wide or narrow viewports. Each surface SHALL scroll internally when constrained. Collapsing the panel SHALL hide the expanded header content and detail region and MUST NOT close, hide, or alter an open comment composer or its pending pin. Collapsing the panel MUST NOT cancel armed point capture; the capture prompt and its Cancel action SHALL stay visible on the Story. Starting or ending a meeting, saving a comment, subsequent overview refreshes, and a same-story preview remount caused by those mutations MUST preserve the participant's current expanded state.

#### Scenario: Comment icon opens the comments details

- **WHEN** an included Story first renders and the participant activates the top-right Comment icon launcher
- **THEN** the launcher changes from `aria-expanded="false"` to `aria-expanded="true"` and the detail region exposes Reports, Add comment, the kind filter, and the footer

#### Scenario: Collapsed Comment launcher is centered

- **WHEN** an included Story renders the visual comments panel in its collapsed state
- **THEN** the 36×36 button fills the launcher surface and the 14×14 Comment icon, button, and panel centers remain within 0.5 CSS pixel on both axes

#### Scenario: Expanded header shows heading, meeting title, and Reports

- **WHEN** the visual comments panel is expanded while the meeting `Notes 2026-10-01` is active
- **THEN** the header start column shows `Comments` above `Notes 2026-10-01`, and the end column shows one intrinsic-width `Reports` button followed by the launcher button without an extra launcher-only row

#### Scenario: Detail region follows the fixed order

- **WHEN** the visual comments panel is expanded with at least one current-Story comment
- **THEN** Add comment, the kind filter, the comment list, and the footer appear in that order from top to bottom, and the panel contains no comment composer

#### Scenario: Starting a meeting preserves the expanded panel

- **WHEN** the participant expands visual comments and activates `Start meeting`
- **THEN** the meeting becomes active while the launcher remains `aria-expanded="true"` and the meeting detail remains visible

#### Scenario: Saving a comment preserves the expanded panel

- **WHEN** the participant saves a comment from an expanded visual comments panel and the same Story preview remounts after the canonical comment and screenshot are written
- **THEN** the comment is saved, the composer closes, and the launcher remains `aria-expanded="true"` with the active meeting detail visible

#### Scenario: Collapsed launcher hides comment details

- **WHEN** the participant closes the expanded visual comments panel
- **THEN** the top-right Comment icon launcher remains visible, the detail region is hidden from interaction, and an open comment composer stays visible

#### Scenario: Independent panels do not overlap

- **WHEN** visual comments details and the Figma export-review workspace are both expanded in a vertically constrained preview
- **THEN** the comments panel remains above the workspace, their rectangles do not intersect, and overflow remains reachable through each surface's internal scrolling

#### Scenario: Collapsing the panel keeps armed capture cancellable

- **WHEN** the participant activates Add comment and collapses the comments panel before selecting a point
- **THEN** point capture stays armed, the capture prompt with its Cancel action stays visible on the Story, and activating Cancel or pressing Escape restores Story pointer interaction

#### Scenario: Collapsing the panel leaves an open composer untouched

- **WHEN** a comment composer contains a kind selection and comment draft and the participant collapses then reopens the comments panel
- **THEN** the composer stays open beside its pin throughout with the same capture, pin, kind, and comment draft available for submission

### Requirement: Adjustable pending comment point

After the participant selects a Story point for Add comment, the client SHALL display a numbered circular live tag at that point before the asynchronous capture completes. The tag SHALL display the active meeting's next comment ordinal, or `1` when no meeting is active, mirror the draft's normalized pin, be marked capture-ignore, and MUST NOT appear in the captured screenshot. After capture succeeds the Story live tag SHALL become the point editor: one focusable numbered pin.

After capture succeeds and before Save comment, the participant SHALL be able to reposition the pending point by dragging the Story pin with Pointer Events or by using keyboard arrows while the pin is focused. Pointer and key events on the pin MUST NOT reach the prototype. Arrow keys SHALL move the normalized pin by `0.01` per axis and Shift plus Arrow SHALL move it by `0.05`; every result MUST be clamped to `0..1` of the capture target. The comment composer SHALL follow the pin. The comment composer MUST NOT render a snapshot thumbnail of the capture. Adjustment instructions and the pin's accessible name SHALL come from centralized `FigmaReviewLabels` defaults and the focusable pin SHALL expose a visible focus state.

Save comment SHALL submit the final pending pin through the existing create-comment request. Cancel, capture failure, or unmount SHALL remove the live tag and MUST NOT create a comment. Collapsing or expanding the comments panel MUST NOT hide or move the pin and SHALL preserve the pending screenshot, point, kind, and body draft. Saved comments SHALL reuse the same normalized pointer and keyboard adjustment rules inside their panel or report Edit preview, but MUST NOT create a Story live tag, recapture, or replace the stored screenshot.

#### Scenario: Point selection gives immediate numbered feedback

- **WHEN** an active meeting has three comments and the participant selects a Story point while the capture promise is still pending
- **THEN** a circular live tag displaying `4` is visible immediately at the selected point and is marked capture-ignore

#### Scenario: Live tag is excluded from captured evidence

- **WHEN** the production capture runs after the live tag is visible
- **THEN** the screenshot contains the Story UI without the live tag while pin `4` stays on the Story at the selected normalized point

#### Scenario: Pointer adjustment updates the pending point

- **WHEN** the participant drags pin `4` on the Story before Save comment
- **THEN** the pin moves to the clamped normalized coordinates, the comment composer follows it, the prototype receives no pointer event, and no comment request is sent

#### Scenario: Keyboard adjustment supports coarse and fine movement

- **WHEN** the participant focuses pin `4` on the Story, presses ArrowRight once, then presses Shift plus ArrowDown once
- **THEN** `xRatio` increases by `0.01`, `yRatio` increases by `0.05`, both values remain within `0..1`, and the focus indicator remains visible

#### Scenario: Save uses the final adjusted point

- **WHEN** the participant moves the pending point from `(0.25, 0.40)` to `(0.60, 0.70)` and activates Save comment
- **THEN** the single create-comment request stores pin `{ "xRatio": 0.60, "yRatio": 0.70 }` with the existing screenshot and body

#### Scenario: Cancel removes unsaved point state

- **WHEN** the participant adjusts a pending point and cancels before Save comment
- **THEN** the live tag and composer are removed, zero create-comment requests are sent, and no pin mutation remains

#### Scenario: Panel collapse leaves the pending point visible

- **WHEN** the participant collapses then reopens the comments panel while an unsaved adjusted composer exists
- **THEN** the pin and composer stay visible while collapsed with the same screenshot, normalized pin, ordinal, kind, and body

#### Scenario: First comment without a meeting shows ordinal one

- **WHEN** no meeting is active and the participant selects a Story point
- **THEN** the pin displays `1`

### Requirement: Recent editable comments in visual comments panel

When an active meeting exists, the expanded visual comments panel SHALL render every comment for the current Story from that active meeting, ordered by descending server-generated createdAt, in a list that scrolls inside the panel. It MUST NOT include comments from another Story or a closed meeting. Each item SHALL display its meeting-wide ordinal, author, createdAt, body, and Open or Completed status.

Each recent item SHALL provide Edit and icon-only Delete actions using centralized `FigmaReviewLabels` defaults. Edit SHALL open one body-level, capture-ignored overlay modal with a labelled `role="dialog"`, `aria-modal="true"`, a responsive surface larger than the 320px visual comments panel at wide viewports, and a viewport-bounded scrollable surface at narrow viewports. The modal SHALL render the stored screenshot and numbered normalized point before the body field, and SHALL provide Save changes and Cancel. Save changes SHALL reject an empty or over-limit body and an invalid pin, then SHALL send one atomic edit request containing the current body and pin drafts. Cancel, Escape, or backdrop close SHALL restore the canonical body and pin without sending a request, close the modal, and return focus to the originating Edit action. A successful Save SHALL close the modal and preserve the expanded panel; a failed Save SHALL retain the modal and both drafts. Activating Delete SHALL open an in-page `role="dialog"` confirmation that states the comment and unreferenced screenshot evidence will be permanently deleted and MUST NOT send a request. Only Confirm delete SHALL send DELETE; Cancel, Escape, or backdrop close SHALL preserve the comment and screenshot and return focus to Delete. Saving an edit or confirming a delete SHALL refresh the list from canonical overview data.

#### Scenario: Panel lists every current-Story comment newest first

- **WHEN** the active meeting contains current-Story comments created at 10:00, 10:01, 10:02, and 10:03 plus a newer comment from another Story
- **THEN** the panel list contains the current-Story comments from 10:03, 10:02, 10:01, and 10:00 in that order, each with its meeting-wide ordinal, and does not contain the other Story's comment

#### Scenario: Long list scrolls inside the panel

- **WHEN** the active meeting contains twelve current-Story comments and the panel height cannot show them all
- **THEN** the list scrolls inside the panel while Add comment, the kind filter, and the footer stay reachable without scrolling the Story

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
- **THEN** exactly one DELETE request is sent, reference-aware screenshot cleanup runs, the panel remains expanded, and the list no longer contains the deleted comment
