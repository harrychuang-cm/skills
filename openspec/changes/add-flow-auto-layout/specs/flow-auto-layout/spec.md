## Purpose

Lets a reviewer rearrange the whole Prototype Inspector UI Flow canvas in one action so that each feature becomes its own left-to-right row, which keeps complex prototypes readable. The arrangement is saved like a dragged layout, can be fine-tuned and undone, and keeps feature names beside their rows.

## ADDED Requirements

### Requirement: Auto layout command

The UI Flow layout control group SHALL start with a button whose visible text is `Auto Layout` and whose accessible name is `Auto layout UI Flow`. Activating it SHALL rearrange every route frame and flow-only node of the complete flow as defined by the Feature lane sources, Lane arrangement, and Shared screens in one lane requirements. When a saved layout exists, activation SHALL first open a confirmation dialog titled `Auto layout this UI Flow?` with the text `Frames are rearranged by feature, left to right. You can undo right after.` and the actions `Auto Layout` and `Cancel`; Cancel and Escape SHALL close it and change nothing, and while it is open the canvas SHALL handle only Escape, as for the other UI Flow dialogs. When no saved layout exists, activation SHALL apply at once. Applying SHALL clear the frame hover, close the dialog, and make the camera fit all frames and keep fit tracking, like opening the canvas. The button SHALL be disabled while the canvas shows a journey simplified view.

#### Scenario: Applying auto layout without a saved layout

- **WHEN** a reviewer opens a flow with no saved layout and activates `Auto layout UI Flow`
- **THEN** the frames are rearranged without a dialog, the camera fits all frames, and Fit canvas is pressed

#### Scenario: A saved layout asks first

- **WHEN** a reviewer who has dragged frames activates `Auto layout UI Flow` and then chooses Cancel in the dialog
- **THEN** every frame keeps its dragged position

#### Scenario: Disabled in a journey view

- **WHEN** the canvas shows the journey `request-changes` of the storybook-template example prototype
- **THEN** the `Auto layout UI Flow` button is disabled

---

### Requirement: Feature lane sources

The auto layout SHALL build its feature lanes from the first available source in this order: the journeys the flow declares, as one lane per journey in declaration order, keyed `declared:<journey id>`; otherwise, when at least one route or flow-only node declares `flowGroup`, one lane per `flowGroup` ordered by the group's earliest declared member, keyed `group:<flowGroup>`; otherwise the journeys derived from branch points, one lane per derived journey in derivation order, keyed by the derived journey's key; otherwise one lane holding every screen, keyed `single`. Screens are the flow's routes followed by its flow-only nodes, in declaration order. Each screen SHALL belong to the first lane that lists it, and screens that belong to no lane SHALL form a last lane keyed `other` and titled `Other screens`. Lanes left without screens SHALL be dropped, and when one lane remains, no feature name SHALL be shown.

#### Scenario: Declared journeys win

- **WHEN** a flow with the routes intake, review, handoff and archive declares the journeys `submit` (intake, review) and `close` (review, handoff, archive), and every route also declares a `flowGroup`
- **THEN** the layout has the lanes `submit` with intake and review and `close` with handoff and archive, titled by the journeys, and `flowGroup` is not used

#### Scenario: A journey that owns no screen is dropped

- **WHEN** the storybook-template example prototype declares `approve-request` (intake, review, approval-decision, handoff) and `request-changes` (intake, review, approval-decision, review)
- **THEN** `approve-request` owns every screen, the `request-changes` lane is dropped, and no feature name is shown

##### Example: lane source selection

| Flow declares | Lanes | Source |
| ----- | ----- | ----- |
| journeys A and B, each owning a screen | `declared:A`, `declared:B`, then `other` titled `Other screens` when a screen is in neither | journeys |
| no journeys; `flowGroup` entry, review, handoff | `group:entry`, `group:review`, `group:handoff` | flowGroup |
| no journeys or `flowGroup`; one decision with two outgoing key lines | one lane per derived journey that owns a screen | derived |
| no journeys, `flowGroup` or branch point | `single`, no feature name | single |

---

### Requirement: Lane arrangement

Lanes SHALL be stacked from the top in source order: the first lane's top is world y 0, every lane starts at world x 0, and the top of each further lane is 240 world pixels below the lowest frame bottom of the lane above. Only qualifying transitions SHALL order screens: both ends are screens, `flowLine` is `key` or `reference`, and `kind` is neither `return` nor `global`. Frame sizes SHALL be the larger of a route's measured preview size and its resolved viewport, so that the Static Flow, which sizes frames from the viewport, places them without overlap.

A lane built from a journey SHALL place its screens in one row in the order of their first appearance in the journey's steps, each frame 160 world pixels right of the previous frame, skipping screens owned by an earlier lane.

A lane built from a `flowGroup`, from `Other screens`, or from the single-lane source SHALL use only the qualifying transitions between its own screens. Its screens SHALL be split into groups that these transitions connect, ignoring direction; the groups SHALL be placed left to right in the order of their first declared screen, each starting 160 world pixels right of the previous group's rightmost frame. Within a group, a depth-first walk SHALL start from the screens without incoming transitions in declaration order and then from any screen not yet reached in declaration order, ignoring every transition to a screen on the walk's current path; each screen's column SHALL be the length of the longest remaining path reaching it; screens sharing a column SHALL be placed below each other in declaration order as sub-rows. Columns SHALL be separated by 160 world pixels and be as wide as their widest frame, a narrower frame being centered in its column.

In every row and sub-row the visible rects SHALL be vertically centered on one line, placed below the row's top by the largest distance from a frame top to its visible-rect center in that row; each further sub-row SHALL start 120 world pixels below the lowest frame bottom of the row above. Positions SHALL be whole world pixels, and no two frames SHALL overlap.

#### Scenario: A journey lane reads left to right

- **WHEN** a lane comes from the journey intake → review → approval-decision → handoff of 377 × 878 route frames and a 220 × 220 decision node
- **THEN** the four screens sit in one row from x 0 with 160 world pixels between frames and the decision node's center on the routes' visible-rect center line

##### Example: the example prototype's journey lane

- **GIVEN** route frames of 377 × 878 whose visible rect starts 65 world pixels below the frame top, and a 220 × 220 decision node
- **WHEN** a journey lane holds intake, review, approval-decision and handoff
- **THEN** intake is at (0, 0), review at (537, 0), approval-decision at (1074, 361) and handoff at (1454, 0)

#### Scenario: A branch opens a sub-row

- **WHEN** a `flowGroup` lane holds review with qualifying transitions to approved and to rejected
- **THEN** approved and rejected share the column after review, approved above rejected in declaration order, and rejected's top is 120 world pixels below approved's bottom

#### Scenario: A return line does not reorder screens

- **WHEN** a lane's handoff has a transition back to intake whose kind is `return`
- **THEN** intake stays in the first column and handoff stays after review

#### Scenario: A cycle without an entry

- **WHEN** a `flowGroup` lane holds a, b and c with qualifying transitions a→b, b→c and c→a and no other transition into them
- **THEN** a, b and c take the columns 0, 1 and 2

#### Scenario: Unconnected screens sit side by side

- **WHEN** a lane holds three screens with no qualifying transition between them
- **THEN** they are placed left to right in declaration order in one row, not stacked in one column

##### Example: three unconnected route frames

- **GIVEN** a `flowGroup` lane with the route frames x, y and z of 377 × 878 and no transition between them
- **WHEN** the auto layout arranges the lane
- **THEN** x is at (0, 0), y at (537, 0) and z at (1074, 0)

---

### Requirement: Shared screens in one lane

A screen listed by more than one lane SHALL be positioned only in the first lane that lists it, and later lanes SHALL leave it out of their rows. On the complete canvas the screen SHALL connect to those later lanes only through the key transitions the canvas draws.

#### Scenario: A shared detail screen

- **WHEN** journeys `subscribe` and `recurring` both include `fund-detail`
- **THEN** `fund-detail` appears once, in the `subscribe` lane, and the `recurring` lane starts with its next screen

---

### Requirement: Saved auto layout and undo

Applying auto layout SHALL write the new positions through the same layout storage as dragging, so that reloading the canvas, the Static Flow and the layout export use them, and frames SHALL remain draggable afterwards. After applying, the layout control group SHALL show `Auto layout applied.` with an `Undo` action in a `role="status"` element for 8000 milliseconds; when that time ends while the camera moves or a frame is dragged, the notice SHALL stay until the gesture has ended, without a React commit during the gesture. Undo SHALL restore the positions and feature names saved before the auto layout, or clear the saved layout and feature names when none existed, and SHALL hide the notice; positions that the saved layout did not apply, such as a layout saved for another viewport, are not restored. A drag release, Reset, Import, another auto layout, a change of the saved layout's source (another prototype, viewport or node set), selecting a journey, or unmounting the canvas SHALL end the possibility to undo. Until one of these layout changes or Undo happens, when a frame is measured larger than the size the auto layout used, the auto layout SHALL be computed again with the measured sizes and saved, keeping the Undo snapshot, so that frames measured after applying do not overlap.

#### Scenario: Undo restores the dragged layout

- **WHEN** a reviewer with a dragged layout applies auto layout, confirms, and activates Undo within 8000 milliseconds
- **THEN** every frame returns to its dragged position and no feature name is shown

#### Scenario: The arrangement survives a reload

- **WHEN** a reviewer applies auto layout and reloads the Storybook page
- **THEN** the frames keep the auto layout positions and the feature names are shown

#### Scenario: Frames measured after applying do not overlap

- **WHEN** a reviewer applies auto layout while a route whose content is 1,040 pixels tall is still sized at its 812-pixel viewport, and its measurement arrives afterwards
- **THEN** the lanes are arranged again with the measured size, saved, and no two frames overlap

#### Scenario: The notice outlasts a drag without a commit

- **WHEN** the 8000-millisecond notice time ends while the reviewer is still dragging a frame
- **THEN** no React commit happens until the release, and the release ends the possibility to undo

---

### Requirement: Feature names beside lanes

When the auto layout has more than one lane, the canvas SHALL show each lane's title in the screen-space label layer, with its right edge one screen gutter (the `--pi-sys-spacing-screen-gutter` token, 24 CSS pixels unless the project's tokens change it) left of the left edge of the lane's first frame's visible rect and its top aligned with that visible rect's top, following that frame when it is dragged or the camera moves. A name SHALL be hidden when its frame is not in the flow and while the canvas shows a journey simplified view; it SHALL take no pointer input and carry no comment anchor. While names are shown, fitting the camera SHALL keep 240 screen pixels free at the canvas's left edge, or half the canvas width when the canvas is narrower than 480 pixels, so that a fitted canvas of usual width shows every name.

The titles SHALL be stored under the localStorage key `prototype-inspector:flow-lanes:<prototypeId>`, using the same normalized prototype id as the layout key, as `{ version: 1, viewport, labels }` with each label `{ key, title, anchor }`. A stored record SHALL NOT be shown when its viewport signature differs from the flow's; a record without a signature counts as `phone:375x812`, and a flow without a signature accepts any record. Opening the canvas SHALL neither write nor remove the record. Reset SHALL remove it; the layout export SHALL include the stored names whose anchor frame is in the flow as `lanes`, also while a journey simplified view hides them, and an import SHALL write the file's `lanes` with the flow's current signature, dropping names whose anchor is not in the flow, or remove the record when the file has none. The UI Flow layout helper file and its schema version MUST NOT change.

#### Scenario: Feature names follow their lanes

- **WHEN** an auto layout produced the `flowGroup` lanes `entry` and `purchase` and the reviewer drags the first frame of `purchase` 200 world pixels down
- **THEN** `purchase` is shown left of that frame at its new position and `entry` does not move

#### Scenario: Reset removes the feature names

- **WHEN** a reviewer resets the UI Flow layout after an auto layout
- **THEN** no feature name is shown and the lanes key is removed

##### Example: name placement

With the default 24-pixel screen gutter:

| Camera (x, y, zoom) | Anchor frame box | Name right edge | Name top |
| ----- | ----- | ----- | ----- |
| (100, 50, 0.5) | route frame at (0, 0) | 76.5 | 82.5 |
| (−200, 0, 2) | route frame at (0, 0) | −222 | 130 |
