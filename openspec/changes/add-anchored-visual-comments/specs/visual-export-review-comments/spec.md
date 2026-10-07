## ADDED Requirements

### Requirement: Host-declared comment view

The visual comments panel SHALL derive the current comment view from the resolved capture target: when the target is, or contains, an element carrying `data-sbfx-view`, the value of the first such element in document order SHALL be the current view; otherwise the current view SHALL be `story`. A value that does not match `^[a-z0-9][a-z0-9-]{0,39}$` SHALL be treated as `story`. The panel SHALL re-read the current view every time it re-synchronizes the capture target. Each new comment SHALL record, as `story.view` in its capture metadata, the current view at the moment its point was pressed, even when the view changes before the comment is saved, and SHALL omit the field when that view is `story`. After a comment is saved, the panel SHALL list the current view. The server SHALL accept an optional `story.view` matching the same pattern, SHALL reject any other value with a validation error and no write, and SHALL report the view of a comment whose capture has no `story.view` as `story`, without migrating stored meetings.

#### Scenario: A UI Flow comment records its view

- **WHEN** the capture target contains an element with `data-sbfx-view="ui-flow"` and a participant saves a comment
- **THEN** the stored capture metadata has `story.view` equal to `ui-flow` and the overview reports the comment's view as `ui-flow`

#### Scenario: Comments saved before views existed read as story

- **WHEN** a meeting file contains a comment whose capture metadata has no `story.view`
- **THEN** the overview reports that comment's view as `story` and the meeting file is not rewritten

##### Example: current view resolution

| Markup inside the capture target | Current view |
| ----- | ----- |
| no `data-sbfx-view` element | story |
| `data-sbfx-view="ui-flow"` | ui-flow |
| `data-sbfx-view="UI Flow"` | story |
| first element `data-sbfx-view="ui-flow"`, a later one `data-sbfx-view="docs"` | ui-flow |

---

### Requirement: View-scoped comment panel

The visual comments panel SHALL list, count and pin only the viewed meeting's current-Story comments whose view equals the listed view, and the kind filter counts SHALL count only those comments. The listed view SHALL be the current view when the panel mounts and whenever the current view changes. When the viewed meeting holds current-Story comments in other views, the panel SHALL show one control per other view, labelled with the view name and its comment count; activating it SHALL make that view the listed view and SHALL show a note that those comments' pins appear only in their own view. While the listed view differs from the current view, the panel MUST NOT show saved pins. Changing the listed view MUST NOT send a request.

#### Scenario: Story and UI Flow comments stay apart

- **WHEN** the viewed meeting holds 2 `story` comments and 3 `ui-flow` comments for the current Story and the panel opens while the current view is `ui-flow`
- **THEN** the list shows the 3 `ui-flow` comments, the `All` filter count is 3, and one control reads `story · 2`

#### Scenario: Listing another view shows no pins

- **WHEN** the current view is `ui-flow` and the participant activates the `story · 2` control
- **THEN** the list shows the 2 `story` comments with the note that their pins appear only in their own view, and no saved pins are drawn

---

### Requirement: Host-declared comment anchors

When the pointer press that places a comment lands inside the capture target, the client SHALL resolve one anchor in this order and SHALL keep the screenshot pin (`xRatio`, `yRatio` relative to the captured image) in every case:

1. Element anchor: the nearest ancestor-or-self of the pressed element, inside the capture target, that carries `data-sbfx-anchor` and does not carry `data-sbfx-anchor-kind="path"`. The anchor SHALL record `type: "element"`, `id` (the attribute value), optional `label` (`data-sbfx-anchor-label`), optional `route` (`data-sbfx-anchor-route`), the press position `x`, `y` in the element's layout pixels, and the element's layout `width` and `height` at the time of the press.
2. Path anchor: otherwise, among SVG geometry elements inside the capture target that carry both `data-sbfx-anchor` and `data-sbfx-anchor-kind="path"`, the one whose rendered geometry passes nearest to the press, provided that distance is at most 8 CSS pixels. The anchor SHALL record `type: "path"`, `id`, optional `label`, and `t`, the fraction of the element's total length at the nearest point, between 0 and 1.
3. Canvas anchor: otherwise, when the press lies inside an element carrying `data-sbfx-canvas` that contains an element carrying `data-sbfx-canvas-world`, the anchor SHALL record `type: "canvas"`, the press position `x`, `y` in the world element's untransformed coordinate space, and up to two `nearby` element anchors inside that canvas element, nearest first by distance from the press to each anchor element's bounds, each with `id`, optional `label`, and the world-space offset `dx`, `dy` from that anchor element's top-left corner to the press.
4. Otherwise the comment SHALL have no anchor.

Element anchor discovery SHALL skip elements marked `data-sbfx-capture-ignore`. The pending pin SHALL be adjustable as today; each adjustment SHALL recompute the anchor from the adjusted point by the same rules.

#### Scenario: A press on a frame records an element anchor

- **WHEN** an element with `data-sbfx-anchor="route:review"` and `data-sbfx-anchor-label="Review Request"` has a layout size of 375 by 812 and is rendered at half scale with its top-left at client (100, 200), and the participant presses at client (150, 300)
- **THEN** the comment's anchor is `{ type: "element", id: "route:review", label: "Review Request", x: 100, y: 200, width: 375, height: 812 }`

#### Scenario: A press near a line records a path anchor

- **WHEN** a polyline with `data-sbfx-anchor="edge:intake->review"` and `data-sbfx-anchor-kind="path"` runs horizontally for 400 CSS pixels on screen and the participant presses 5 pixels below the point 100 pixels from its start, outside every element anchor
- **THEN** the comment's anchor has `type: "path"`, `id: "edge:intake->review"` and `t: 0.25`

#### Scenario: A press on blank canvas records a canvas anchor with nearby frames

- **WHEN** the canvas element's world element is translated by (40, 20) and scaled by 0.5, the participant presses on blank canvas at the client point that maps to world (600, 300), and the nearest element anchors are `route:intake` at world (0, 0) and `route:review` at world (960, 0)
- **THEN** the anchor is `{ type: "canvas", x: 600, y: 300 }` with `nearby` listing `route:intake` then `route:review`, the first with offset (600, 300)

##### Example: anchor resolution order

| Press location | Anchor type |
| ----- | ----- |
| inside an element with `data-sbfx-anchor` | element |
| 6 px from a path anchor, outside element anchors | path |
| 9 px from the nearest path anchor, inside `data-sbfx-canvas` | canvas |
| outside element anchors, no path within 8 px, no declared canvas | none |

---

### Requirement: Anchored pin placement

A pending or saved comment that has an anchor SHALL be placed from its anchor instead of from the capture-target ratio. While a pending anchored comment is adjusted, its screenshot pin SHALL be computed against the current client rect of the area its screenshot captured, recomputed from the anchor element or the world element at that moment, and its anchor SHALL be resolved at the pin's current client point. The pending pin SHALL be confined to the part of that area that is visible inside the capture target, the canvas element and the viewport. An element anchor SHALL place the pin at the anchor element's current client top-left plus the stored layout offset multiplied by the element's current rendered-to-layout scale. A path anchor SHALL place the pin at the point at fraction `t` of the anchor element's current total length, mapped to client coordinates. A canvas anchor SHALL place the pin at the stored world point mapped through the world element's current transform. Anchors SHALL be resolved by `data-sbfx-anchor` value; when several elements carry the same value, the first in document order SHALL be used.

An anchored pin SHALL be hidden while its anchor element is absent, while its comment's view differs from the current view, while the canvas element is absent for a canvas anchor, or while its position lies outside the visible bounds of the capture target or, for an anchor inside an element carrying `data-sbfx-canvas`, outside that canvas element. In addition to viewport resize, scroll and the periodic re-synchronization, the panel SHALL reposition every visible anchored pin synchronously within the dispatch of each `sbfx:anchors-moved` event received on `document`, by writing pin positions directly without re-rendering the panel. Comments without an anchor SHALL keep the placement of the Saved comment pins on the Story requirement.

#### Scenario: A pin follows its frame while the canvas pans

- **WHEN** a saved pin is anchored to an element, the host moves that element 300 pixels left with a transform and dispatches `sbfx:anchors-moved` inside the same animation frame
- **THEN** the pin is drawn 300 pixels further left in that same frame

#### Scenario: Adjusting a pending pin after the canvas moved

- **WHEN** a participant places a comment on a frame, pans the canvas 200 CSS pixels left while the composer is open, and drags the pending pin 30 CSS pixels right
- **THEN** the screenshot pin moves by 30 CSS pixels of the screenshot area and the anchor is resolved at the pin's current position on the moved frame

#### Scenario: A pending frame pin stays inside the visible frame

- **WHEN** a participant places a comment near the bottom of a frame that extends beyond the canvas and presses Shift+ArrowDown until the pending pin reaches the canvas edge
- **THEN** the pending pin stops at the visible edge and the comment keeps its element anchor

#### Scenario: A pin whose anchor is gone is hidden

- **WHEN** the element carrying the comment's anchor id is removed from the document
- **THEN** the pin is hidden and the comment stays in the list

---

### Requirement: Anchor location request

Each listed comment that has an anchor and whose pin is hidden while its view equals the current view SHALL offer a `Show location` action. Activating it SHALL dispatch a cancelable, bubbling `sbfx:reveal-anchor` CustomEvent on `document` whose detail carries the comment id, the comment's view and its anchor (`type`, `id`, and `x`, `y` or `t`). When the host prevents the event's default action, the panel SHALL select the comment and re-synchronize pins on the next animation frame; otherwise the panel SHALL show the message `This location is not available in this view.` for that comment.

#### Scenario: The host reveals an off-screen frame

- **WHEN** a comment anchored to `route:review` has a hidden pin because the frame is outside the canvas element, the participant activates `Show location`, and the host listener prevents the default action and moves the frame into view
- **THEN** the comment is selected and its pin is drawn on the frame after the next animation frame

#### Scenario: Nobody handles the request

- **WHEN** no listener prevents the default action of `sbfx:reveal-anchor`
- **THEN** the panel shows `This location is not available in this view.` for that comment

---

### Requirement: Canvas anchor nearby context

The comment list, the meeting report and the portable AI context SHALL describe a canvas anchor as near the labels of its recorded `nearby` anchors, using the id when a label is absent, and SHALL describe an element anchor by its label (or id) and a path anchor by its label (or id) as a line. While the panel lists a canvas-anchored comment whose recorded nearby anchor element is present and whose current world top-left plus the recorded offset differs from the stored world point by more than 1 world pixel on either axis, the panel SHALL mark that comment `Layout changed since this comment`.

#### Scenario: A nearby frame moved after commenting

- **WHEN** a canvas-anchored comment recorded `route:review` with offset (-360, 300) at world (600, 300) and `route:review` is later moved to world (1200, 0)
- **THEN** the panel marks the comment `Layout changed since this comment` and still draws its pin at world (600, 300)

---

### Requirement: Anchored capture evidence

For an element anchor, the client SHALL capture the anchor element's content: when the anchor element contains a same-origin iframe whose window exposes the review runtime's capture hook under the global symbol registry key `sbfx.captureHook`, the client SHALL ask that window to capture its own resolved capture target and SHALL use that image; otherwise it SHALL capture the anchor element at its layout size, without the element's own position offsets or transform, so that an element inside a translated and scaled canvas renders its content. The client SHALL read every element, iframe and canvas rect that maps a capture onto the page in the same task as the press, before awaiting any capture. For a path or canvas anchor, the client SHALL capture the element carrying `data-sbfx-canvas` without iframe content and SHALL then draw into that image the pages of the visible same-origin iframes inside it whose windows expose the capture hook: at most 12 iframes, chosen by largest visible area and skipping any whose visible width or height is below 24 CSS pixels, each placed by the same mapping as an element anchor's capture and clipped to the intersection of its iframe and the canvas element. The client SHALL pass the hook a `maxScale` equal to the iframe's scale in the captured image, clamped to 0.25 to 2. Frame captures SHALL run in descending visible area, at most two at a time, within one shared budget of 4000 milliseconds that starts when the first frame capture starts; no frame capture SHALL start once the budget is spent, and a frame whose capture fails or has not finished when the budget ends SHALL stay empty without failing the capture. The screenshot pin SHALL be computed relative to the captured image's bounds. When the anchored capture fails, the client SHALL retry once by capturing the anchor element, or the canvas element, without iframe content before showing the existing retryable error. The review runtime SHALL register `sbfx.captureHook` on its window whenever it is loaded through `configureFigmaExportReview` or `createFigmaExportReviewDecorator`. Comments without an anchor SHALL keep capturing the resolved capture target.

#### Scenario: A frame comment captures the route page

- **WHEN** a participant comments on an element anchor that contains a same-origin Storybook preview iframe whose review runtime is loaded
- **THEN** the saved image shows that iframe's rendered route content, and the screenshot pin lies at the pressed point relative to that image

#### Scenario: A canvas comment shows the frames' pages

- **WHEN** a participant comments on blank canvas inside an element carrying `data-sbfx-canvas` that shows a frame whose same-origin preview iframe runs the review runtime
- **THEN** the saved image is a capture of the canvas element in which that iframe's area shows the iframe's rendered page

#### Scenario: A frame that cannot be captured stays empty

- **WHEN** a canvas comment is placed while one visible frame's capture hook fails
- **THEN** the comment is saved, that frame's area in the image is empty, and the other frames' pages are drawn

---

### Requirement: Anchor data validation and compatibility

The create request SHALL accept an optional `anchor` matching one of the three shapes of the Host-declared comment anchors requirement. The server SHALL reject, with a validation error and no write, an anchor with an unknown `type`, an `id` that is empty or longer than 200 characters, a `label` longer than 120 characters, a `route` longer than 240 characters, a non-finite coordinate, a non-positive element `width` or `height`, a `t` outside 0 to 1, or more than two `nearby` entries. The anchor SHALL be stored on the comment and projected unchanged in the overview. The idempotency hash SHALL include `anchor` only when it is present and `story.view` only when it is not `story`, so replays of comments created before this change keep their hash. The meeting file version SHALL stay 1. A comment edit that changes the pin of an element-anchored comment SHALL set the anchor's `x` and `y` to the new `xRatio` and `yRatio` multiplied by the anchor's `width` and `height`; a comment edit that sends a pin for a path- or canvas-anchored comment SHALL be rejected with a validation error, and the panel edit modal and the report SHALL NOT offer pin editing for those comments.

#### Scenario: A replayed legacy request keeps its hash

- **WHEN** a client replays a create request recorded before this change, with no `anchor` and no `story.view`
- **THEN** the server returns the stored comment with status 200 instead of a conflict

#### Scenario: Editing the pin of a frame comment moves its anchor

- **WHEN** an element-anchored comment with width 375 and height 812 is edited to pin (0.5, 0.25)
- **THEN** its stored anchor has `x` 187.5 and `y` 203

##### Example: anchor validation

| Anchor in request | Result |
| ----- | ----- |
| `{ type: "element", id: "route:a", x: 10, y: 20, width: 375, height: 812 }` | accepted |
| `{ type: "element", id: "", x: 10, y: 20, width: 375, height: 812 }` | rejected |
| `{ type: "path", id: "edge:a->b", t: 1.2 }` | rejected |
| `{ type: "canvas", x: 600, y: 300, nearby: [a, b, c] }` | rejected |
| `{ type: "frame", id: "a" }` | rejected |

---

### Requirement: Report view filter and anchor description

The meeting report SHALL show each comment's view and, for anchored comments, the anchor description defined by the Canvas anchor nearby context requirement in its card header. The report SHALL provide a `View` filter with `All views` and one option per view present in the meeting, SHALL select `All views` by default, SHALL mirror the selection in the URL fragment as `view=<name>` next to the existing kind and completed filters, and MUST NOT let the view filter change the tracking batch selection.

#### Scenario: Filtering the report to UI Flow comments

- **WHEN** a meeting report holds `story` and `ui-flow` comments and the reader selects the `ui-flow` view option
- **THEN** only `ui-flow` comment cards are shown and the URL fragment contains `view=ui-flow`

---

### Requirement: Capture-mode input routing

While a capture is armed, only a press with the primary button SHALL place a pin; presses with any other button SHALL reach the page unchanged and SHALL keep the capture armed. After the primary press, the client SHALL swallow the matching `pointerup` and `click`, and any further `pointerdown`, `pointerup`, `click`, `dblclick` and `contextmenu` events targeting the capture target within 500 milliseconds of that press. An Escape key press that cancels an armed capture, closes the comment composer, or closes a comment edit or delete dialog SHALL call `stopPropagation` in addition to `preventDefault`.

#### Scenario: A quick double-click places one pin and reaches nothing else

- **WHEN** a capture is armed and the participant double-clicks a frame within 300 milliseconds
- **THEN** one pin is placed and the page receives neither the second press nor a `dblclick` event

#### Scenario: Middle-button drag still reaches the page

- **WHEN** a capture is armed and the participant presses the middle button on the canvas
- **THEN** the page receives the press and the capture stays armed

#### Scenario: Escape closes the composer only

- **WHEN** the comment composer is open and the participant presses Escape
- **THEN** the composer closes and no document or window listener registered by the page receives that keydown in the bubble phase

---

### Requirement: Host-declared comment unavailability

While the resolved capture target is, or contains, an element carrying `data-sbfx-comments="unavailable"`, the visual comments panel SHALL hide `Add comment` and saved pins, SHALL ignore the C shortcut, SHALL keep the existing comment list readable, and SHALL show the message `Comments are not available in this view.`

#### Scenario: A documentation view declines comments

- **WHEN** the capture target contains an element with `data-sbfx-comments="unavailable"` and the participant presses C
- **THEN** no capture is armed, `Add comment` is not shown, and the panel shows `Comments are not available in this view.`

---

### Requirement: Stylesheet-styled SVG content in captures

Every visual comment capture SHALL render inline SVG descendants with the paint they show on screen, including paint that comes from stylesheet rules rather than attributes or inline styles. For each SVG descendant of the captured element, the captured image SHALL use that element's computed `fill`, `fill-opacity`, `stroke`, `stroke-width`, `stroke-dasharray`, `stroke-dashoffset`, `stroke-linecap`, `stroke-linejoin`, `stroke-opacity`, `opacity`, `visibility` and `display`. Any inline styles the client adds to the live document to achieve this SHALL be removed before the capture promise settles, whether the capture succeeds or fails: an element whose `style` attribute still equals what the client wrote SHALL get its original `style` attribute back exactly, and an element whose style the host changed during the capture SHALL keep the host's changes, losing only the properties the client added that still hold the values it wrote.

#### Scenario: A class-styled line keeps its stroke

- **WHEN** the capture target contains an SVG polyline whose class rule sets `fill: none` and `stroke: rgb(124, 58, 237)` and the participant captures a comment
- **THEN** the captured image shows the line in rgb(124, 58, 237) with no filled area, and after the capture the polyline's `style` attribute is the same as before

