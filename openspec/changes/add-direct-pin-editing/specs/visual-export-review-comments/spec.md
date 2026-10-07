## MODIFIED Requirements

### Requirement: Recent editable comments in visual comments panel

While a meeting is viewed, the expanded visual comments panel SHALL render every comment for the current Story from the viewed meeting, whether that meeting is active or closed, ordered by descending server-generated createdAt, in a list that scrolls inside the panel. It MUST NOT include comments from another Story or another meeting. Each item SHALL display its meeting-wide ordinal, author, createdAt, body, and Open or Completed status.

Each item SHALL provide Edit and icon-only Delete actions using centralized `FigmaReviewLabels` defaults, and both actions SHALL send their requests to the meeting that stores the comment.

A saved pin counts as displayed only while it is rendered and its center lies inside the viewport. When Edit is activated while the comment's saved pin is displayed on the Story, Edit SHALL open one body-level, capture-ignored, non-modal edit panel with `role="dialog"` and the accessible name `Edit comment <ordinal>`, without a backdrop, placed beside that pin by the placement rules of the Anchored comment composer requirement: the same width, pin gap, inline-axis flip, block-axis margins, and docking below 720 CSS pixels. The edit panel SHALL contain, in this order, a preview of the comment's stored screenshot with the comment's meeting-wide ordinal marking the stored screenshot pin, the `Comment type` control, the body field, Cancel, and Save changes. The preview SHALL keep the screenshot's aspect ratio within 296 CSS pixels of width and 200 CSS pixels of height, its ordinal marker MUST NOT be draggable, it SHALL show `Screenshot unavailable` when the comment has no screenshot, and it SHALL be followed by `Moved since the screenshot` when the comment has `movedAt`. The body field SHALL receive focus when the edit panel opens. The edit panel SHALL follow the pin whenever the pin is repositioned, including during and after a drag of that pin, and a press outside the edit panel MUST NOT close it. Save changes in the edit panel SHALL reject an empty or over-limit body and SHALL send one edit request containing the body draft, the kind draft when it differs from the stored kind, and no pin.

When Edit is activated while the comment's saved pin is not displayed and the comment is an anchored comment of the current view, the panel SHALL first dispatch the request of the Anchor location request requirement; when the host handles it and the pin is displayed in the next animation frame, the edit panel SHALL open beside the pin. In every other case Edit SHALL open one body-level, capture-ignored overlay modal with a labelled `role="dialog"`, `aria-modal="true"`, a responsive surface larger than the 320px visual comments panel at wide viewports, and a viewport-bounded scrollable surface at narrow viewports. The modal SHALL render the stored screenshot and numbered normalized point before the body field, and SHALL provide Save changes and Cancel. The point SHALL be draggable only when the comment has no `movedAt` and has no anchor or an element anchor; otherwise the modal SHALL still render the stored screenshot with a numbered point that MUST NOT be draggable, followed by `Moved since the screenshot` when the comment has `movedAt`, and `Screenshot evidence is unavailable.` SHALL be shown only when the comment has no screenshot or the screenshot fails to load. Save changes in the modal SHALL reject an empty or over-limit body and an invalid pin, then SHALL send one atomic edit request containing the body draft, the pin draft only when the point is draggable, and the kind draft when it differs from the stored kind.

For both surfaces, Cancel or Escape SHALL restore the canonical body, kind, and pin drafts without sending a request, close the surface, and return focus to the originating Edit action, and a backdrop close of the modal SHALL do the same. A successful Save SHALL close the surface and preserve the expanded panel; a failed Save SHALL retain the surface with its drafts and a visible error. Activating Delete SHALL open an in-page `role="dialog"` confirmation that states the comment and unreferenced screenshot evidence will be permanently deleted and MUST NOT send a request. Only Confirm delete SHALL send DELETE; Cancel, Escape, or backdrop close SHALL preserve the comment and screenshot and return focus to Delete. Saving an edit or confirming a delete SHALL refresh the list from canonical overview data.

#### Scenario: Panel lists every current-Story comment of the viewed meeting newest first

- **WHEN** the viewed meeting contains current-Story comments created at 10:00, 10:01, 10:02, and 10:03 plus a newer comment from another Story, and another meeting holds a comment on the current Story
- **THEN** the panel list contains the viewed meeting's current-Story comments from 10:03, 10:02, 10:01, and 10:00 in that order, each with its meeting-wide ordinal, and contains neither the other Story's comment nor the other meeting's comment

#### Scenario: Long list scrolls inside the panel

- **WHEN** the viewed meeting contains twelve current-Story comments and the panel height cannot show them all
- **THEN** the list scrolls inside the panel while Add comment, the kind filter, and the footer stay reachable without scrolling the Story

#### Scenario: Edit opens beside a displayed pin

- **WHEN** a participant activates Edit on a listed comment whose pin is displayed on the Story in a 1280 × 860 CSS pixel viewport
- **THEN** one non-modal edit panel named `Edit comment <ordinal>` opens beside that pin without a backdrop, shows the screenshot preview with the numbered stored point, `Comment type`, the body field, Cancel, and Save changes in that order, the body field has focus, and no centered modal opens

#### Scenario: Edit panel flips near the inline-end edge

- **WHEN** the edit panel opens for a pin near the viewport's inline-end edge
- **THEN** the edit panel sits on the inline-start side of the pin and does not cover it

##### Example: edit panel placement in a 1280 CSS pixel wide viewport

| Pin center x | Panel inline-start edge | Panel inline-end edge | Side |
| ------------ | ----------------------- | --------------------- | ---- |
| 200 | 224 | 544 | inline-end |
| 1100 | 756 | 1076 | inline-start |

#### Scenario: Edit panel follows its pin

- **WHEN** the edit panel is open for a frame comment on the UI Flow canvas and the reviewer pans the canvas by 200 CSS pixels
- **THEN** the edit panel keeps the same offset from the pin in every rendered frame

#### Scenario: Edit reveals an off-screen anchored pin first

- **WHEN** a participant activates Edit on an anchored comment of the current view whose pin lies outside the visible canvas and the host handles the location request
- **THEN** the host moves the camera, the pin is displayed, and the edit panel opens beside it

#### Scenario: Edit falls back to the evidence modal

- **WHEN** a participant activates Edit on a comment listed from another view, or on a comment whose pin cannot be displayed
- **THEN** one labelled body-level modal opens above a dimmed backdrop with the stored screenshot, meeting-wide numbered point, body field, Save changes, and Cancel

#### Scenario: Evidence modal keeps the screenshot of a moved comment

- **WHEN** pins are hidden and a participant activates Edit on a listed comment that has `movedAt`
- **THEN** the modal shows the stored screenshot with a numbered point that is not draggable and `Moved since the screenshot`, does not show `Screenshot evidence is unavailable.`, and Save changes sends a PATCH without a pin

#### Scenario: Edit on a pin scrolled out of the viewport uses the modal

- **WHEN** a participant activates Edit on a Story comment without an anchor whose pin lies below the viewport
- **THEN** the evidence modal opens and no edit panel opens

#### Scenario: Edit panel saves body and kind

- **WHEN** a participant changes the body and kind in the edit panel and activates Save changes
- **THEN** one PATCH containing the body and kind and no pin is sent, the edit panel closes, and the panel remains expanded

#### Scenario: Panel modal edit atomically updates body and point and stays open

- **WHEN** a participant edits a listed comment body and point in the modal, activates Save changes, and the same Story preview refreshes from the canonical overview
- **THEN** one PATCH stores both values, the modal closes, the updated body and pin are visible after canonical refresh, the screenshot and other evidence metadata are unchanged, and the panel remains expanded

#### Scenario: Editing a comment of a closed meeting targets that meeting

- **WHEN** meeting M2 is active, closed meeting M1 is viewed, and the participant saves an edit to a listed comment
- **THEN** exactly one PATCH is sent to `/sessions/M1/comments/<comment id>`, M2 is unchanged, and the list shows the updated body after refresh

#### Scenario: Panel edit cancellation preserves canonical content and focus

- **WHEN** a participant changes the drafts in the edit panel or the modal and activates Cancel, presses Escape, or clicks the modal backdrop
- **THEN** no PATCH request is sent, the surface closes, the item returns to its canonical body, kind, and pin, and focus returns to the originating Edit action

#### Scenario: Failed panel edit keeps the draft

- **WHEN** a participant changes the drafts in the edit panel or the modal and the edit PATCH fails
- **THEN** the surface remains open with its drafts and a visible error while canonical comment evidence remains unchanged

#### Scenario: Panel delete requires confirmation

- **WHEN** a participant activates a listed comment's Delete button and then cancels the in-page dialog
- **THEN** no DELETE request is sent, focus returns to Delete, and the comment and screenshot remain visible

#### Scenario: Panel confirmed delete refreshes the list

- **WHEN** a participant confirms deletion of one listed comment of a viewed closed meeting
- **THEN** exactly one DELETE request is sent to that meeting, reference-aware screenshot cleanup runs, the panel remains expanded, and the list no longer contains the deleted comment

### Requirement: Pin and list correspondence

Activating a saved pin by pointer or keyboard, without a drag, SHALL select its comment in the panel list and open that comment's edit panel beside the pin as defined by the Recent editable comments in visual comments panel requirement: the list item SHALL scroll into view and carry `aria-current="true"`, any previously selected item SHALL lose `aria-current`, and focus SHALL move to the edit panel's body field. Every activation SHALL scroll the list item into view, including when that comment is already selected; activating the pin of the comment whose edit panel is open SHALL keep that edit panel open, and activating another pin SHALL close the open edit panel without a request, discarding its drafts as Cancel does, and open the edit panel of the activated pin's comment. An activation after a drag or keyboard move of a pin was cancelled SHALL select the comment and open its edit panel like any other activation. While a comment's edit panel is open, that comment's saved pin information card MUST NOT be shown. The selected comment's pin SHALL carry a selected mark, and no other pin SHALL carry it. Activating a pin MUST NOT deliver a pointer or click event to the prototype beneath it. Hovering or focusing a list item SHALL mark its pin as highlighted, and leaving the item SHALL remove that mark. The highlighted mark SHALL be separate from the selected mark and SHALL be on at most one pin: the hovered item's pin, otherwise the focused item's pin. These interactions MUST NOT send a request.

#### Scenario: Activating a pin selects its list item and opens its edit panel

- **WHEN** the participant clicks saved pin `7` while the list item for comment 7 is scrolled out of view
- **THEN** that list item is scrolled into view with `aria-current="true"`, no other item carries `aria-current`, pin `7` alone carries the selected mark, the edit panel of comment 7 opens beside the pin with the screenshot preview and focus in its body field, and the prototype control beneath the pin does not run its handler

#### Scenario: Activating the selected pin again reveals its list item

- **WHEN** comment 7 is already selected with its edit panel open, its list item has been scrolled out of view, and the participant clicks saved pin `7` again
- **THEN** that list item is scrolled into view again and the edit panel of comment 7 stays open

#### Scenario: Activating another pin switches the edit panel

- **WHEN** the edit panel of comment 7 is open with a changed body draft and the participant clicks saved pin `3`
- **THEN** no request is sent, the edit panel of comment 7 closes with its draft discarded, and the edit panel of comment 3 opens beside pin `3`

#### Scenario: Activating a pin after a cancelled keyboard move

- **WHEN** a participant focuses saved pin `5`, presses ArrowUp, presses Escape, and then presses Enter
- **THEN** comment 5 is selected and its edit panel opens on that first Enter

#### Scenario: Focusing a list item highlights its pin

- **WHEN** the participant hovers or focuses the list item for comment 2 while another comment is selected
- **THEN** pin `2` is marked highlighted, no other pin is, the selected pin keeps only its selected mark, and the highlighted mark is removed when the pointer or focus leaves the item

## ADDED Requirements

### Requirement: Direct saved pin relocation

A saved pin SHALL be movable by dragging it with the primary pointer button. A press on a saved pin SHALL start a drag only after the pointer moves more than 4 CSS pixels from the press point; a press released before that SHALL keep the existing selection behavior, and the `click` that follows a completed drag MUST NOT select the comment. During a drag the pin SHALL follow the pointer while keeping the offset of the press within the pin, SHALL stay inside the visible bounds used to place that pin, its saved pin information card MUST NOT be shown, re-renders of the panel during the drag, including overview refreshes, MUST NOT move the pin away from the pointer, and the pointer events of the drag MUST NOT reach the Story or the host canvas. Escape during a drag SHALL return the pin to its position before the drag, MUST NOT send a request, and MUST NOT reach page key handlers. Releasing the pointer SHALL resolve and save the new location as defined by the Relocation target resolution requirement.

While a saved pin has keyboard focus, each Arrow key press SHALL move it by 1 CSS pixel and each Shift + Arrow key press by 10 CSS pixels in viewport space, and SHALL call `preventDefault` and `stopPropagation`; the pin SHALL be displayed at its moved position from the first press. The keyboard-moved location SHALL be resolved and saved once, 600 milliseconds after the last Arrow key press or when the pin loses focus, whichever comes first; Escape before that save SHALL return the pin to its position before the keyboard move without a request, and when an edit panel is open that Escape MUST NOT close it. A press on any saved pin while a keyboard move waits for its save SHALL save that keyboard move first, and a press on the pin whose move is being saved MUST NOT start a drag.

While a new comment is being placed, saved pins SHALL keep not receiving pointer events and MUST NOT be draggable. While a move of a comment is being saved, its pin MUST NOT start another drag or keyboard move, and overview refreshes MUST NOT reposition it until the save settles.

#### Scenario: Dragging a frame comment's pin

- **WHEN** a participant presses the pin of a comment anchored to `route:review` and moves the pointer 60 CSS pixels right inside the same frame before releasing it
- **THEN** the pin follows the pointer during the move, no pin information card is shown, the frame receives no pointer event, and one move request is sent on release

#### Scenario: A short press still selects

- **WHEN** a participant presses a saved pin, moves the pointer 3 CSS pixels, and releases it
- **THEN** no request is sent and the comment is selected in the list as before

#### Scenario: Escape cancels a drag

- **WHEN** a participant drags a saved pin 80 CSS pixels and presses Escape before releasing
- **THEN** the pin returns to its previous position, no request is sent, and no bubble-phase document listener receives the key

#### Scenario: Keyboard moves save once

- **WHEN** a participant focuses a saved pin, presses ArrowRight three times and Shift + ArrowDown once within 600 milliseconds, and waits
- **THEN** the pin moves 3 CSS pixels right and 10 CSS pixels down and exactly one request is sent about 600 milliseconds after the last key

#### Scenario: Escape cancels a keyboard move while an edit panel is open

- **WHEN** the edit panel of comment 7 is open with a changed body draft and the participant focuses pin `3`, presses ArrowRight twice, and presses Escape
- **THEN** pin `3` returns to its previous position, no request is sent, and the edit panel of comment 7 stays open with its draft

#### Scenario: Pressing a pin saves a waiting keyboard move

- **WHEN** a participant presses ArrowRight three times on focused pin `3` and presses pin `7` within 600 milliseconds
- **THEN** exactly one move request for comment 3 is sent for the pin 3 CSS pixels to the right, and pin `7` handles the press as usual

#### Scenario: The first Arrow key press shows at once

- **WHEN** a participant presses Shift + ArrowDown once on a focused saved pin
- **THEN** the pin is displayed 10 CSS pixels lower before the move request is sent

#### Scenario: Pins cannot be dragged while placing a comment

- **WHEN** a participant has started placing a new comment and presses on a saved pin
- **THEN** the press reaches the capture under the pin and the saved pin does not move

---

### Requirement: Relocation target resolution

When a drag or keyboard move ends, the panel SHALL resolve the pin center's client point in the order of the Host-declared comment anchors requirement — element anchor, then path anchor within 8 CSS pixels, then canvas anchor — ignoring addon chrome such as pins. When an anchor resolves, the panel SHALL send a move request containing that anchor. When no anchor resolves and the comment has no anchor, the panel SHALL send an edit request containing the pin as the normalized position within the current capture target. When no anchor resolves and the comment has an anchor, the panel SHALL return the pin to its previous position, MUST NOT send a request, and SHALL show `Drop the pin on a frame, a line or the canvas.`. The pin SHALL stay at its released position while the request is pending; when the request fails, including a validation error from a server that does not accept `anchor`, the pin SHALL return to its previous position and the panel SHALL show `Couldn't move the comment.` followed by the error message.

#### Scenario: A frame comment moved to another frame

- **WHEN** a participant drags the pin of a comment anchored to `route:review` onto the preview of `route:handoff` and releases it
- **THEN** a move request with an element anchor whose `id` is `route:handoff` is sent, and after it succeeds the pin is placed from the new anchor

#### Scenario: Dropping an anchored comment outside every anchor

- **WHEN** a participant releases the pin of an element-anchored comment over a Story area that declares no anchor and no canvas
- **THEN** the pin returns to its previous position, no request is sent, and `Drop the pin on a frame, a line or the canvas.` is shown

#### Scenario: A failed move returns the pin

- **WHEN** a participant drags a pin and the move request fails with a validation error
- **THEN** the pin returns to its previous position and the panel shows `Couldn't move the comment.` with the error

##### Example: release outcomes

| Comment's anchor | Released over | Request sent | Outcome after success |
| ----- | ----- | ----- | ----- |
| element `route:review` | `route:review` preview | `{ anchor: element route:review with the new x and y }` | `pin` follows the anchor, no `movedAt` |
| element `route:review` | `route:handoff` preview | `{ anchor: element route:handoff }` | `pin` kept, `movedAt` set |
| path `edge:intake->review` | blank canvas | `{ anchor: canvas point }` | `pin` kept, `movedAt` set |
| none | Story area without anchors | `{ pin: new normalized position }` | `pin` updated, no `movedAt` |
| canvas point | area without anchors or canvas | none | pin returns, message shown |

---

### Requirement: Comment location edit requests

The comment edit request SHALL accept `anchor` and `movedAt` in addition to `body`, `pin`, and `kind`. A request containing an `anchor` object and neither `pin` nor `movedAt` SHALL move the comment: the server SHALL validate the anchor with the rules of the Anchor data validation and compatibility requirement and store it; when the comment has no `movedAt` and its previous anchor and the new anchor are element anchors with the same `id`, the server SHALL set `pin` to the new anchor's `x / width` and `y / height`, each clamped to the range 0 to 1, and SHALL keep `movedAt`; otherwise the server SHALL keep `pin` and SHALL set `movedAt` to the server's current time as an ISO 8601 string. A request containing `anchor` (an object or null), `pin`, and `movedAt` (an ISO 8601 string not later than the server's current time, or null) SHALL restore those three values as given, removing the anchor or the moved mark when the value is null. Any other request that contains `anchor` or `movedAt`, an `anchor` of null outside a restore, an invalid anchor, or an invalid `movedAt` SHALL be rejected with a validation error and no write. A request whose only location field is `pin` SHALL keep the behavior of the Anchor data validation and compatibility requirement, and SHALL be rejected with a validation error when the comment has `movedAt`, because its screenshot no longer shows the anchor; the evidence modal MUST NOT offer pin editing for such a comment. The overview SHALL project `movedAt` unchanged, the meeting file version SHALL stay 1, and `movedAt` MUST NOT take part in the create idempotency hash.

#### Scenario: Moving within the same frame keeps the screenshot pin aligned

- **WHEN** a comment anchored to element `route:review` with width 375 and height 812 receives `{ anchor: { type: "element", id: "route:review", x: 300, y: 203, width: 375, height: 812 } }`
- **THEN** the stored pin is (0.8, 0.25), the anchor is stored, and the comment has no `movedAt`

#### Scenario: Moving a moved comment again keeps its screenshot pin

- **WHEN** a comment captured on `route:review` and already moved to `route:handoff` receives a move to another point of `route:handoff`
- **THEN** its stored pin is unchanged and `movedAt` is updated to the time of this move

#### Scenario: Restoring a moved comment

- **WHEN** a moved comment receives a restore request with its previous anchor, pin, and `movedAt` null
- **THEN** the stored anchor and pin equal the previous values and the comment has no `movedAt`

##### Example: edit request validation

| Request | Result |
| ----- | ----- |
| `{ anchor: { type: "canvas", x: 600, y: 300 } }` | accepted; `movedAt` set |
| `{ anchor: null }` | rejected |
| `{ anchor: { type: "canvas", x: 600, y: 300 }, pin: { xRatio: 0.1, yRatio: 0.1 } }` | rejected |
| `{ anchor: null, pin: { xRatio: 0.2, yRatio: 0.3 }, movedAt: null }` | accepted; restore |
| `{ anchor: { type: "path", id: "edge:a->b", t: 0.5 }, pin: { xRatio: 0.2, yRatio: 0.3 }, movedAt: "2999-01-01T00:00:00.000Z" }` | rejected |
| `{ movedAt: null }` | rejected |

---

### Requirement: Relocation feedback and undo

After a drag or keyboard move is saved, the panel SHALL show `Comment moved.` with an `Undo` action in a `role="status"` element outside the scrolling comment list for 5000 milliseconds. Undo SHALL send one restore request with the comment's anchor, pin, and `movedAt` from before the move, using null for an absent anchor or `movedAt`, and SHALL hide the notice; when it succeeds the pin SHALL be placed at its previous position. Only the most recent saved move SHALL be undoable, and a later saved move SHALL replace the notice. A failed Undo SHALL show `Couldn't move the comment.` with the error message.

#### Scenario: Undoing a move

- **WHEN** a participant drags a frame comment's pin to another frame and activates Undo within 5000 milliseconds
- **THEN** one restore request is sent, the pin returns to the original frame, and the comment shows no moved mark

#### Scenario: The undo notice expires

- **WHEN** 5000 milliseconds pass after a saved move without Undo
- **THEN** the notice is removed and the move stays stored

---

### Requirement: Moved comment indication

A comment with `movedAt` SHALL show `Moved since the screenshot` in its panel list item and in its saved pin information card, and the card's screenshot SHALL keep the stored pin. The meeting report card SHALL show the same text while keeping the stored screenshot pin, and the AI prompt evidence line that starts with `- Comment location:` SHALL end with ` (moved since the screenshot)`. A comment without `movedAt` MUST NOT show the text or the prompt suffix.

#### Scenario: A comment moved to another frame is marked everywhere

- **WHEN** a comment captured on `route:review` has been moved to `route:handoff`
- **THEN** its list item, pin information card, and report card show `Moved since the screenshot`, its screenshot still shows the pin on the review screen, and its copied AI prompt location line ends with ` (moved since the screenshot)`
