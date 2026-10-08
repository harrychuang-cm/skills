## Purpose

Gives reviewers design-tool layout editing on the Prototype Inspector UI Flow canvas: selecting and marquee-selecting frames, moving them as a group with alignment guides and keyboard nudges, undoing layout changes, and orienting themselves through a minimap, flowGroup sections and frame navigation shortcuts. All edits change only saved frame positions. The capability builds on the extension points of the UI Flow canvas navigation capability (group drag, read-only views, keyboard routing, fit tracking, the screen-space layer and frame visible rects) and on the step instances of the journey focus view.

## ADDED Requirements

### Requirement: Frame selection

The selection SHALL be a set of instance keys: the node id of a route frame or flow-only node in the complete flow, and the step instance key '<stepIndex>:<nodeId>' in a journey focus view. Pressing and releasing the primary button on a route frame's preview, a flow-only node or a frame label without reaching the drag threshold SHALL select that frame alone, and with Shift held SHALL toggle that frame in the selection; the selection SHALL change on release. Pressing and releasing on empty canvas without dragging SHALL clear the selection. Mod+A SHALL select every route frame and flow-only node the canvas displays. Hit-testing SHALL use each frame's visible rect as defined by the canvas navigation capability and SHALL pick the topmost frame under the pointer, and a press on a drawn frame label SHALL target that label's frame. Each Escape press SHALL perform only the first applicable action in this order: close an open zoom menu or dialog, cancel an active frame drag, cancel an active marquee, clear a non-empty selection; when none applies, Escape SHALL propagate unchanged. Each selected frame SHALL show a 2-pixel outline around its visible rect, drawn at constant width in the screen-space layer inside an element that comment screenshots ignore (`data-sbfx-capture-ignore`) and kept on the frame on every animation frame of a pan, zoom or drag gesture without committing React renders of the UI Flow tree, and selected frames SHALL be raised above unselected frames through z-index without reordering DOM nodes. Selected route frames SHALL be passed to the level-of-detail tiers as promoted frames by instance key. The selection SHALL be kept only in memory and SHALL be cleared when another prototype opens.

#### Scenario: Shift-click builds a selection

- **WHEN** route frames A at (0, 0) and B at (480, 0) are shown and the reviewer clicks A, then Shift-clicks B, then Shift-clicks A again
- **THEN** the selection contains only B

#### Scenario: Outlines follow a pinch

- **WHEN** frames A at (0, 0) and B at (480, 0) are selected and the reviewer pinches from zoom 0.5 to zoom 1
- **THEN** both outlines stay on their frames' visible rects on every animation frame and no pi:flow:commit mark is recorded until the camera is idle

#### Scenario: Escape with nothing selected reaches Storybook

- **WHEN** the selection is empty, no menu, dialog, drag or marquee is active, and the reviewer presses Escape on the canvas
- **THEN** the canvas does not consume the key and the event propagates to Storybook

##### Example: Escape order

| State when Escape is pressed | Result | Reaches Storybook manager |
| ----- | ----- | ----- |
| zoom menu open, frame A selected | menu closed, A stays selected | no |
| group drag of frames A and B active | drag cancelled, A and B back at their original positions and still selected | no |
| marquee active, frame C selected before the marquee | marquee removed, only C selected | no |
| frame A selected, nothing else active | selection cleared | no |
| nothing selected, nothing active | none | yes |

---

### Requirement: Marquee selection

A primary-button drag that starts on empty canvas while Space is not held, and on macOS without Ctrl, SHALL draw a marquee rectangle in the screen-space layer with a 1-pixel outline in the selection color and no fill, ignored by comment screenshots. Every route frame and flow-only node whose visible rect intersects the rectangle SHALL become selected, replacing the selection, or added to the selection when Shift was held when the drag started. The selection SHALL update on screen while dragging, without committing React renders of the UI Flow tree, and settle on release in one commit. Escape during the drag SHALL remove the marquee and restore the selection from before the drag. A marquee drag SHALL NOT move the camera or end fit tracking.

#### Scenario: Touching frames are selected

- **WHEN** route A occupies world box (0, 0, 377, 878) with visible rect (1, 65, 375, 812), route B occupies (480, 0, 377, 878) with visible rect (481, 65, 375, 812), and the reviewer drags a marquee covering world rectangle (300, 100) to (500, 200)
- **THEN** both A and B are selected

#### Scenario: Escape restores the previous selection

- **WHEN** frame C is selected and the reviewer starts a marquee over frames D and E and presses Escape before releasing
- **THEN** the marquee disappears and only frame C is selected

##### Example: marquee results

| Selection before | Marquee | Shift at drag start | Selection after release |
| ----- | ----- | ----- | ----- |
| C | touches A and B | no | A, B |
| C | touches A and B | yes | A, B, C |
| C | touches A and B, Escape pressed before release | no | C |
| C | touches no frame | no | empty |

---

### Requirement: Group drag and keyboard nudge

This capability defines group drag for the frame drag of the canvas navigation capability: when the pressed frame is selected, dragging past the drag threshold SHALL move every selected frame by the same world offset, and when it is unselected, it SHALL first become the only selected frame. Holding Shift during a drag SHALL constrain the offset to the axis with the larger absolute movement. From the first pointer move past the drag threshold until release, the selected frames' transforms, the selection outline, the snapping guides and the section shapes SHALL be updated without committing React renders of the UI Flow tree. Escape during a group drag SHALL return every dragged frame to its original position and persist nothing. With a non-empty selection in the complete flow, the arrow keys SHALL move the selection by 20 world pixels and Shift with an arrow key by 100 world pixels. Arrow keydown events, including auto-repeat, SHALL accumulate into one pending nudge action that moves the frames on screen without committing React renders and commits 500 milliseconds after the last arrow keyup, or immediately before any other layout action, undo, redo, selection change, loss of window focus or UI Flow unmount; when the 500 milliseconds end during a camera gesture or a frame drag, the commit SHALL wait until the gesture has ended. The release of a group drag and the commit of a pending nudge action SHALL each be a committed layout action that the inspector persists exactly once. Arrow keys SHALL propagate unchanged when the selection is empty, and SHALL reach a keyboard-focused control unchanged where the canvas navigation capability leaves arrow keys to that control, such as the zoom menu or the journey list.

#### Scenario: Group drag persists once

- **WHEN** three frames are selected and the reviewer drags one of them and releases
- **THEN** all three move by the same offset, no pi:flow:commit mark is recorded between the first pointer move past the drag threshold and the release, and the layout is persisted exactly once

##### Example: keyboard nudges on a frame at (480, 980)

| Keys | Resulting position | Layout actions recorded |
| ----- | ----- | ----- |
| ArrowRight tapped three times, each press less than 500 ms after the previous release | (540, 980) | 1 |
| ArrowRight held until three keydown events (one press and two auto-repeats) fire, then released | (540, 980) | 1 |
| Shift+ArrowDown once | (480, 1080) | 1 |
| ArrowLeft tapped, then tapped again 600 ms after the first release | (440, 980) | 2 |
| ArrowRight, then Mod+Z within 500 ms | (480, 980) | 1 recorded, then undone |
| ArrowUp with nothing selected | unchanged, key propagates | 0 |
| ArrowDown while a journey list entry has keyboard focus | unchanged, key reaches the list | 0 |

---

### Requirement: Alignment snapping guides

While a frame drag is active in the complete flow, the inspector SHALL compare the left edge, horizontal center and right edge of the bounding box of the dragged selection's visible rects with the left edge, horizontal center and right edge of the visible rect of every unselected route frame and flow-only node that intersects the canvas viewport, and the top edge, vertical middle and bottom edge likewise. Each of the dragged box's three lines on an axis SHALL be compared with all three lines of each candidate on that axis. Each axis SHALL snap independently to the nearest candidate line whose distance is at most 6 screen pixels converted to world pixels and clamped to between 2 and 20 world pixels. Each active snap SHALL draw a 1-pixel guide line in the screen-space layer spanning the aligned visible rects, ignored by comment screenshots, in the guide color token `--pi-sys-color-annotation-touch-target`, which is distinct from the selection outline and from the four edge color variants. Holding Ctrl during the drag SHALL suspend snapping and hide the guides while held, evaluated on every pointer move. Keyboard nudges SHALL NOT snap.

#### Scenario: Left edges align

- **WHEN** at zoom 0.5 the reviewer drags a route frame so its box's left edge is at world x 487 while an unselected visible route frame's box left edge is at 480
- **THEN** the dragged frame's box snaps so its left edge is at 480 and a vertical guide is drawn along the two frames' aligned visible left edges at world x 481

#### Scenario: Ctrl suspends snapping

- **WHEN** the reviewer holds Ctrl while dragging the same frame to x 487
- **THEN** the frame stays at 487 and no guide is drawn

##### Example: snapping threshold by zoom

| Zoom | Threshold in world pixels |
| ----- | ----- |
| 4 | 2 |
| 1 | 6 |
| 0.5 | 12 |
| 0.3 | 20 |
| 0.1 | 20 |

##### Example: snapping between two route frames

| Dragged route frame box | Unselected route frame box | Zoom | Result |
| ----- | ----- | ----- | ----- |
| (2290, 905, 377, 878) | (2280, 0, 377, 878) | 0.1 | x snaps by -10 so the dragged box's left edge is at 2280; y does not snap, because no pair of y lines is within 20 world pixels |
| (101, 2000, 377, 878) | (480, 0, 377, 878) | 1 | x snaps by +4 so the dragged visible right edge meets the candidate's visible left edge at 481; y does not snap |

---

### Requirement: Layout undo and redo

The inspector SHALL record every committed layout action of the complete flow (a drag, a group drag, a nudge action, a confirmed Reset Layout, a successful layout import and an applied auto layout) as one history entry holding the complete saved positions before and after, and for an auto layout also the feature names before and after, keeping at most 100 entries and discarding the oldest beyond that. Mod+Z SHALL restore the state from before the latest applied entry, and Shift+Mod+Z, or Ctrl+Y outside macOS, SHALL re-apply the most recently undone entry; on macOS Ctrl+Y SHALL propagate unchanged. Each undo and each redo SHALL be a committed layout action that the inspector persists exactly once, and SHALL NOT add a history entry. A new layout action after an undo SHALL discard the entries that could have been redone. The auto layout notice's Undo SHALL perform the same history undo, and a nudge, an undo or a redo SHALL end the notice's undo period. When an auto layout is arranged again because frames were measured larger, its history entry SHALL record the re-arranged positions as its after state. Camera and selection changes SHALL NOT be recorded. The history SHALL be kept in memory only and cleared when the UI Flow unmounts, another prototype opens or the saved layout's source (prototype, viewport or node set) changes; switching journeys SHALL NOT clear it. Undo and redo keys SHALL be consumed only when there is an entry to apply and no frame drag or marquee is active, and SHALL propagate unchanged otherwise.

#### Scenario: Reset can be undone

- **WHEN** the reviewer confirms Reset Layout and then presses Mod+Z
- **THEN** the positions from before the reset are restored and persisted once, and a redo removes the saved layout again with one storage write

#### Scenario: Auto layout undoes from the keyboard

- **WHEN** the reviewer applies an auto layout that shows feature names over a dragged layout and presses Mod+Z
- **THEN** the dragged positions return, no feature name is shown, the notice's Undo is gone, and Shift+Mod+Z brings the auto layout and its names back

##### Example: history sequence

| Step | Action | Frame A position | Redo available |
| ----- | ----- | ----- | ----- |
| 1 | drag A from (0, 0) to (200, 0) | (200, 0) | no |
| 2 | nudge A right once | (220, 0) | no |
| 3 | Mod+Z | (200, 0) | yes |
| 4 | Mod+Z | (0, 0) | yes |
| 5 | Shift+Mod+Z | (200, 0) | yes |
| 6 | drag A to (100, 100) | (100, 100) | no |

---

### Requirement: Canvas minimap

The canvas SHALL offer a minimap panel inside the canvas viewport at its bottom-left corner, to the right of the journey list when the list is shown, so the two panels never overlap; while the figma-export workspace is open (`html[data-sbfx-workspace-open="true"]`), the panel SHALL sit at the top-left corner below the zoom controls, clear of the layout controls the workspace moves to the bottom-left. Comment screenshots SHALL ignore the panel, and a primary-button press on it SHALL NOT start a marquee or a pan of the canvas. The minimap SHALL draw the visible rect of every route frame and flow-only node the canvas displays, selected frames in the selection color, and the current viewport as an outlined rectangle, scaled to fit the union of the content bounds and the viewport. Pressing outside the viewport rectangle SHALL center the camera on the corresponding world point, dragging the viewport rectangle SHALL pan the camera while keeping the grab offset, and wheel input over the minimap SHALL act on the canvas; camera moves requested by the minimap are programmatic camera moves under the fit tracking rule of the canvas navigation capability and SHALL end fit tracking when they do not fit all displayed frames. A Minimap toggle in the zoom menu SHALL show or hide the panel and persist the choice in localStorage under prototype-inspector:flow-minimap; without a stored choice the minimap SHALL be shown when the flow has at least 8 frames, counting route frames and flow-only nodes together. The viewport rectangle SHALL follow the camera at most once per animation frame during a gesture without committing React renders of the UI Flow tree, the frame rectangles SHALL be redrawn when positions or sizes change, and the minimap SHALL NOT render route previews.

#### Scenario: Clicking the minimap moves the camera

- **WHEN** the reviewer presses the minimap at a point outside the viewport rectangle that corresponds to world point (2400, 3000)
- **THEN** the camera centers on world point (2400, 3000) without changing the zoom

#### Scenario: Default visibility follows flow size

- **WHEN** a prototype with 5 route frames and no stored minimap choice opens
- **THEN** the minimap is hidden, and it is shown by default for a prototype with 30 route frames

#### Scenario: Route frames and flow-only nodes count together

- **WHEN** a prototype with 7 route frames, 1 flow-only node and no stored minimap choice opens
- **THEN** the minimap is shown

#### Scenario: Minimap beside the journey list

- **WHEN** the journey list is expanded with 24 entries and the minimap is shown
- **THEN** the minimap sits inside the canvas viewport at its bottom-left corner, to the right of the list, and the two panels do not overlap

---

### Requirement: Flow group sections

For every flowGroup value shared by at least two route frames, the canvas SHALL draw a section behind edges and frames, taking no pointer input, shaped as the union of its member boxes, each member box expanded by a padding of min(32, max(0, (g - 8) / 2)) world pixels, where g is the smallest distance from that member box to any frame box outside the group. Flow-only nodes with the same flowGroup SHALL join an existing section but SHALL NOT create one. Each section SHALL show its flowGroup name at a constant 12-pixel size just above the top-left corner of its top-most, then left-most, padded member box, raised further when needed so it stays above that member's frame label, unless an auto layout feature name for the same flowGroup is shown; SHALL be filled with the surface-raised token as an inline style, a solid fill that differs from the canvas background and that comment screenshots keep, without a border; and SHALL update while frames are dragged. Sections SHALL NOT be drawn in a journey focus view. A Sections toggle in the zoom menu SHALL show or hide sections and persist the choice in localStorage under prototype-inspector:flow-sections, defaulting to shown.

#### Scenario: Single-member groups draw no section

- **WHEN** a flow has a flowGroup used by one route and another used by four routes
- **THEN** only the four-route group draws a section

##### Example: member padding

| Smallest gap to a foreign frame g | Padding |
| ----- | ----- |
| 103 | 32 |
| 60 | 26 |
| 22 | 7 |
| 6 | 0 |

---

### Requirement: Frame navigation shortcuts

The keys this capability handles (Escape, Mod+A, the arrow keys, Mod+Z, Shift+Mod+Z, Ctrl+Y, Shift+2, N and Shift+N) SHALL follow the canvas keyboard rules of the canvas navigation capability: each SHALL be consumed with preventDefault and stopPropagation only in the contexts these requirements state and SHALL propagate unchanged otherwise. While the zoom menu or a dialog is open, Escape SHALL only close it and the other keys of this capability SHALL propagate unchanged. Shift+2 SHALL fit the camera to the selected frames using the canvas fit rule capped at zoom 1, and SHALL propagate unchanged when the selection is empty. In the complete flow, N SHALL select the route that follows the first selected route in the flow's route order, wrapping from the last route to the first, and Shift+N SHALL select the route that precedes it, wrapping from the first route to the last; with no route selected, N SHALL select the first route and Shift+N the last route. N and Shift+N SHALL fit the camera to the newly selected frame capped at zoom 1. Camera moves made by Shift+2, N and Shift+N are programmatic camera moves under the fit tracking rule of the canvas navigation capability and SHALL end fit tracking when they do not fit all displayed frames.

#### Scenario: Stepping through screens in flow order

- **WHEN** the reviewer selects the second route of a three-route flow and presses N twice
- **THEN** the third route and then the first route become selected, each fitted on screen at a zoom no higher than 1

#### Scenario: Navigation ends the opening fit

- **WHEN** the UI Flow has just opened with fit tracking active, the reviewer presses N, and the first route's measured size then changes from 375 x 812 to 375 x 1040
- **THEN** the camera keeps the zoom and translation that N produced and does not re-fit the whole flow

##### Example: key routing

| Key | Context | Canvas result | Reaches Storybook manager |
| ----- | ----- | ----- | ----- |
| Mod+A | complete flow | every displayed frame selected | no |
| ArrowRight | complete flow, frame A selected | A nudged 20 world pixels right | no |
| ArrowRight | nothing selected | none | yes |
| ArrowRight | journey focus view, a step instance selected | none | yes |
| ArrowDown | frame A selected, a journey list entry focused with Tab | none (the list handles the key) | yes |
| Mod+Z | complete flow, an entry to undo | undo | no |
| Mod+Z | no entry to undo | none | yes |
| Mod+Z | complete flow, an entry to undo, a group drag active | none | yes |
| Ctrl+Y | Windows or Linux, complete flow, an entry to redo | redo | no |
| Ctrl+Y | macOS, an entry to redo | none | yes |
| Cmd+ArrowRight | macOS, frame A selected | none | yes |
| Mod+Shift+ArrowUp | frame A selected | none | yes |
| Shift+2 | frame A selected | camera fitted to A | no |
| Shift+2 | nothing selected | none | yes |
| N | three-route flow, nothing selected | first route selected and fitted | no |
| Mod+A | Reset Layout dialog open | none | yes |

---

### Requirement: Editing tools in journey focus

While a journey focus view is shown, which the journey focus capability declares read-only, group drags, keyboard nudges, alignment snapping guides, layout undo and redo, and flow group sections SHALL be disabled, and the arrow keys and the undo and redo keys SHALL propagate unchanged. Frame selection, marquee selection, Mod+A, the minimap and Shift+2 SHALL operate on the step instances of the focus view, and the selection SHALL hold their step instance keys, so selecting one instance of a repeated step selects and outlines only that instance. N SHALL select the step instance whose step index follows the lowest selected step index, wrapping from the last step to the first, and Shift+N SHALL select the step instance whose step index precedes it, wrapping from the first step to the last; with no step instance selected, N SHALL select the first step and Shift+N the last step; both SHALL fit the camera to the newly selected instance capped at zoom 1. Entering a journey focus view, switching to another journey and returning to the complete flow SHALL clear the selection and SHALL leave the layout history unchanged.

#### Scenario: N follows the journey in focus view

- **WHEN** the journey intake, review, approval-decision, handoff is selected in the journey list and the reviewer selects review (instance key 1:review) and presses N
- **THEN** approval-decision (instance key 2:approval-decision) becomes selected and fitted on screen

#### Scenario: N wraps from a repeated step

- **WHEN** the journey intake, review, approval-decision, review is shown and the reviewer selects the second review instance (instance key 3:review), which alone shows the selection outline, and presses N
- **THEN** the intake instance (instance key 0:intake) becomes selected and fitted, and only that instance shows the selection outline

#### Scenario: Arrow keys do not move frames in focus view

- **WHEN** step instance 1:review is selected in a journey focus view and the reviewer presses ArrowRight
- **THEN** no frame moves, no layout action is recorded, and the key propagates to Storybook

#### Scenario: Switching journeys clears the selection

- **WHEN** a step instance is selected in a journey focus view and the reviewer selects another journey entry, including "全部"
- **THEN** the selection is empty in the newly shown view and the layout history is unchanged

##### Example: N and Shift+N on the journey intake, review, approval-decision, review

| Selected step instances | Key | Newly selected step instance |
| ----- | ----- | ----- |
| none | N | 0:intake |
| none | Shift+N | 3:review |
| 1:review | N | 2:approval-decision |
| 3:review | N | 0:intake |
| 0:intake | Shift+N | 3:review |
| 1:review and 3:review | N | 2:approval-decision |
