## Purpose

Defines how reviewers navigate the Prototype Inspector UI Flow canvas: a camera-based infinite canvas with design-tool gestures and shortcuts, frame dragging that stays responsive on large flows, and labels that stay readable at every zoom level. The geometry stays compatible with saved layouts and the Static Flow export. It also defines the extension points that later UI Flow canvas capabilities build on without modifying these requirements: read-only views, group drag, additional shortcuts, programmatic camera moves, the visible rect, the screen-space layer and per-view edge label visibility.

## ADDED Requirements

### Requirement: Camera transform canvas

The UI Flow tab SHALL render route frames, flow-only nodes and edges inside a single world layer positioned by one CSS transform of the form translate(<x>px, <y>px) scale(<z>) with transform-origin 0 0. World coordinates SHALL equal layout coordinates: a node's saved or authored position is the top-left of its frame box, and negative coordinates SHALL render without clamping or offsetting. The canvas SHALL NOT use native scrolling, and moving a node past any edge of the current content SHALL NOT shift other nodes or the camera. A route frame box SHALL keep its current geometry at 100% zoom, preview width + 2 by preview height + 64 + 2 CSS pixels with the preview drawn below a 64-pixel label band, so positions saved by the UI Flow place frames identically in the Static Flow export. A route frame's visible rect SHALL be its preview rect, which starts 65 pixels below the top of the frame box and is inset 1 pixel from its left, right and bottom sides; a flow-only node's visible rect SHALL be its whole box. The frame box SHALL remain the persisted and exported geometry, while frame hit-testing (together with the drawn frame label) and edge anchors, and the marquee intersection, alignment snapping lines, minimap rectangles, selection and interaction outlines and journey vertical centring that other UI Flow canvas capabilities define, SHALL use the visible rect. Controls, dialogs and screen-space labels SHALL render outside the transformed layer.

#### Scenario: Negative positions render in place

- **WHEN** a flow declares a route at (0, 0) and a flow-only node at (0, -260) and the UI Flow opens
- **THEN** the node renders 260 world pixels above the route's top edge, and dragging the node to (-500, -500) moves only that node

#### Scenario: Static Flow reads the same geometry

- **WHEN** a route frame is dragged to (960, 1960) in the UI Flow and the sibling Static Flow story is reloaded
- **THEN** the Static Flow reads (960, 1960) for that route from prototype-inspector:flow-layout:<id>, and in the Static Flow DOM the offset between that route's item box and every other item box equals the offset between the same frames in UI Flow world coordinates, as before this change

#### Scenario: Edges and presses use the visible rect

- **WHEN** a route frame box at (480, 980) holds a 375 x 812 preview
- **THEN** its visible rect spans from (481, 1045) to (856, 1857), the edges connected to it end on the sides of that rect, and a press inside the frame box above y = 1045 that is outside the drawn frame label does not start a drag of that frame

#### Scenario: Controls stay on screen while panning

- **WHEN** the reviewer pans the canvas by 500 pixels
- **THEN** the zoom group and layout group keep their screen positions

---

### Requirement: Zoom range and zoom steps

The camera zoom SHALL stay within 0.05 and 4. Continuous zoom input SHALL multiply the zoom by exp(-Δ/100), where Δ is the wheel deltaY converted to pixels (deltaMode 1 multiplied by 16, deltaMode 2 multiplied by the canvas height) and clamped to the range -30 to 30 per event, and SHALL keep the world point under the pointer fixed on screen. Discrete zoom-in actions SHALL move to the smallest entry of the step table 0.05, 0.1, 0.25, 0.5, 1, 2, 4 that is greater than 1.05 times the current zoom, and discrete zoom-out actions SHALL move to the largest entry smaller than the current zoom divided by 1.05, both anchored at the canvas center and staying at the current zoom when no entry qualifies. Zooming to 100% SHALL keep the world point at the canvas center fixed.

#### Scenario: Wheel zoom keeps the pointed world point fixed

- **WHEN** the zoom is 0.5 with camera translation (100, 50) and a ctrlKey wheel event with deltaY -20 arrives with the pointer at canvas position (600, 400)
- **THEN** the zoom becomes 0.5 × exp(0.2) and the world point (1000, 700) is still drawn at canvas position (600, 400)

##### Example: discrete steps

| Current zoom | Action | Resulting zoom |
| ----- | ----- | ----- |
| 1 | zoom in | 2 |
| 1 | zoom out | 0.5 |
| 0.3 | zoom in | 0.5 |
| 0.48 | zoom in | 1 |
| 0.52 | zoom out | 0.25 |
| 4 | zoom in | 4 |
| 0.05 | zoom out | 0.05 |

##### Example: continuous zoom clamping

| Zoom before | deltaY | deltaMode | Zoom after |
| ----- | ----- | ----- | ----- |
| 1 | -8 | 0 | 1 × exp(0.08) |
| 1 | 100 | 0 | 1 × exp(-0.3) |
| 1 | -3 | 1 | 1 × exp(0.3) |
| 3.9 | -30 | 0 | 4 |
| 0.06 | 30 | 0 | 0.05 |

---

### Requirement: Fit on open and camera memory

When the UI Flow tab mounts without a stored camera that applies, including the first open of a prototype's UI Flow within a browser tab session and every mount that shows a view other than the complete flow, the camera SHALL fit the frames the canvas currently displays (all route frames and flow-only nodes of the complete flow, or the frames of a view that another UI Flow canvas capability shows) by centering their world bounding box at zoom min(1, (W - 2i) / bw, (H - 2i) / bh) clamped to the zoom range, where W and H are the canvas size, bw and bh are the bounding box size, and i is min(96, 10% of the smaller of W and H) CSS pixels. Every fit, whether on open, through Fit canvas, Zoom to fit or Shift+1, or requested by another UI Flow canvas capability that changed which frames are displayed, SHALL fit the displayed frames in this way and SHALL start fit tracking. While fit tracking is active, the camera SHALL re-fit when the canvas resizes or the measured sizes of displayed frames change. Fit tracking SHALL end at the first camera change not produced by fit tracking itself, namely a wheel or pinch zoom, a pan, a zoom shortcut or zoom control that is not a fit, or a programmatic camera move requested by another UI Flow canvas capability that does not fit all displayed frames (for example zoom to selection, frame navigation, minimap navigation or entering interact mode), and at the first frame drag that moves a frame. Fit canvas SHALL report aria-pressed true while fit tracking is active and false otherwise. While the canvas shows the complete flow, the camera SHALL be stored per prototype in sessionStorage under prototype-inspector:flow-camera:<prototypeId> each time it becomes idle, and SHALL be restored instead of fitting when the UI Flow remounts showing the complete flow in the same tab session; the camera of any other view SHALL NOT be written to that key. A stored value that is missing, malformed or unreadable SHALL be ignored in favour of a fit. The camera SHALL NOT be written into the flow layout payload.

#### Scenario: Fit keeps tracking until the reviewer moves the camera

- **WHEN** the UI Flow opens on a 1190 x 800 canvas and the measured preview height of one route changes from 812 to 1040 pixels after the first fit
- **THEN** the camera re-fits to the new bounding box, and after the reviewer pans once by 100 pixels, later measurements no longer change the camera and Fit canvas reports aria-pressed false

#### Scenario: Programmatic camera moves end fit tracking

- **WHEN** the opening fit is active, another UI Flow canvas capability moves the camera to a single frame, and that frame's measured preview height then changes from 812 to 1040 pixels
- **THEN** the camera stays where that capability placed it and does not re-fit the whole flow

#### Scenario: Clicking a frame keeps the fit

- **WHEN** the reviewer presses on a route frame and releases after the pointer moved 2 CSS pixels on screen
- **THEN** the fit stays active, Fit canvas still reports aria-pressed true, and no layout write occurs

#### Scenario: Camera survives a mode switch

- **WHEN** the reviewer zooms to 200%, switches to Components mode and returns to UI Flow in the same tab
- **THEN** the canvas shows the same zoom and translation, and the stored flow layout payload is unchanged

#### Scenario: Camera memory covers only the complete flow

- **WHEN** the complete-flow camera was stored at zoom 2, another UI Flow canvas capability then shows a different view, and the camera becomes idle at zoom 0.5 in that view
- **THEN** prototype-inspector:flow-camera:<prototypeId> still holds the zoom-2 complete-flow camera

##### Example: fit computation

| Canvas W x H | Bounding box bw x bh | Inset i | Fit zoom |
| ----- | ----- | ----- | ----- |
| 1190 x 800 | 3929 x 4990 | 80 | 0.1283 |
| 1600 x 1000 | 1200 x 878 | 96 | 0.9203 |
| 1600 x 1000 | 377 x 500 | 96 | 1 |

---

### Requirement: Pointer and wheel navigation

The inspector SHALL register non-passive wheel listeners and, in Safari, non-passive gesturestart, gesturechange and gestureend listeners on the UI Flow root element, which contains the canvas viewport, the controls, dialogs and side panels. Every cancelable wheel event with ctrlKey, metaKey or altKey and every gesture event anywhere in the root SHALL be cancelled; such wheel events SHALL zoom the canvas around the pointer unless a Safari gesture is active, in which case they SHALL be ignored, and trackpad pinch arrives as a ctrlKey wheel event. Any other wheel event over the canvas viewport SHALL be cancelled and SHALL pan the camera by its deltas, with Shift converting vertical deltas to horizontal on platforms other than macOS, so browser page zoom, page scrolling and history swipes never start from the canvas. Other wheel events over a scrollable side panel or menu inside the root SHALL keep their default scrolling, and the remaining wheel events in the root SHALL be cancelled. In Safari, gesturestart, gesturechange and gestureend SHALL zoom to the zoom at gesture start multiplied by the event scale around the gesture point. Dragging with the primary button while Space is held, or dragging with the middle button, SHALL pan, and the middle-button press SHALL be cancelled to suppress autoscroll and paste. Holding Cmd or Meta SHALL NOT enter pan mode. Pointer positions SHALL be converted to world coordinates from the canvas element's bounding rectangle, including the ratio between its rendered and layout width, so a Storybook toolbar zoom applied to the preview body does not distort hit-testing. Window blur and the preview body becoming inert SHALL end any active pan and Space pan mode.

#### Scenario: Pinch zooms the canvas instead of the page

- **WHEN** the reviewer pinches on a trackpad over the canvas in Chrome
- **THEN** the canvas zoom changes around the pinch point and the Storybook page zoom level stays at 100%

#### Scenario: Pinch over the controls zooms the canvas

- **WHEN** the reviewer pinches on a trackpad in Chrome with the pointer over the zoom group
- **THEN** the canvas zoom changes and the Storybook page zoom level stays at 100%

#### Scenario: Cmd-drag no longer pans

- **WHEN** the reviewer holds Cmd and drags 200 pixels on empty canvas
- **THEN** the camera does not move

##### Example: wheel and pointer classification

| Input | Platform | Result |
| ----- | ----- | ----- |
| wheel deltaY 40, no modifier | any | pan vertically by 40 pixels |
| wheel deltaX 25, deltaY 10, no modifier (trackpad) | macOS | pan by (25, 10) |
| wheel deltaY -8, ctrlKey (pinch) | any | zoom in by exp(0.08) around the pointer |
| wheel deltaY 100, metaKey | macOS | zoom out by exp(-0.3) around the pointer |
| wheel deltaY 100, altKey | any | zoom out by exp(-0.3) around the pointer |
| wheel deltaY 100, shiftKey | Windows | pan horizontally by 100 pixels |
| pointerdown with button 1 | any | pan, default action cancelled |
| primary drag on empty canvas with Space held | any | pan |

---

### Requirement: Canvas keyboard shortcuts

While the UI Flow tab is mounted, the canvas SHALL listen for keydown and keyup on the preview document in the bubble phase. Keys whose composed-path target is a text-entry element (an input of a text-like type, textarea, select, an element with contenteditable, or an element with role textbox) SHALL be ignored. Space, Enter and the arrow keys SHALL NOT be handled by the canvas when the composed-path target is a control (a button, a link, a summary element, a list or list item, or an element with role button, link, menu, menuitem, menuitemcheckbox, menuitemradio, listbox, option, tab, checkbox or switch) or lies inside a dialog, such as a keyboard-focused canvas control, a zoom menu item, a journey list entry or a button of the Reset dialog; those keys SHALL reach that element unchanged with its native keyboard behaviour. While the zoom menu or a canvas dialog is open, the canvas SHALL handle only Escape, which SHALL close that menu or dialog before any other Escape action. Matching physical keys through KeyboardEvent.code and treating Cmd as the modifier on macOS and Ctrl elsewhere, the canvas SHALL handle: Shift+1 to fit, Shift+0 to zoom to 100%, Mod+0 to zoom to 100%, = or + with or without Shift and the keypad plus to zoom in one step, - and the keypad minus to zoom out one step, Mod+= and Mod+- to zoom one step, Space held to enter pan mode until released, and Escape to close an open zoom menu or canvas dialog or, when none is open, to cancel an active frame drag. For every key it handles, the canvas SHALL call preventDefault and stopPropagation so Storybook does not forward the key to the manager; keys it does not handle SHALL propagate unchanged. Keys that other UI Flow canvas capabilities define as handled SHALL follow the same rules: they SHALL be consumed with preventDefault and stopPropagation only in the contexts in which those capabilities handle them and SHALL propagate unchanged otherwise. The canvas SHALL NOT handle unmodified 1, 2, 3, M or C, or any combination containing Alt. Pressing a canvas control with a pointer SHALL NOT move keyboard focus to that control.

#### Scenario: Handled shortcut does not reach Storybook

- **WHEN** the reviewer presses Shift+1 while the UI Flow is focused
- **THEN** the camera fits and the Storybook manager receives no forwarded keydown for that press

#### Scenario: Space pans after clicking a control

- **WHEN** the zoom is 1 and the reviewer clicks the Zoom in button with the mouse and then holds Space and drags 200 pixels on the canvas
- **THEN** the canvas pans by 200 pixels, the zoom stays 2, and the Zoom in button is not activated again

#### Scenario: Keyboard-focused control keeps Space

- **WHEN** the zoom is 1 and the reviewer moves focus to Zoom in with Tab and presses Space
- **THEN** the zoom becomes 2 and pan mode does not start

#### Scenario: Open dialog takes only Escape

- **WHEN** the Reset Layout dialog is open at zoom 0.5 and the reviewer presses Shift+1 and then Escape
- **THEN** the zoom stays 0.5, and the Escape press closes the dialog without reaching the Storybook manager

##### Example: key routing

| Key | Context | Canvas result | Propagates to Storybook |
| ----- | ----- | ----- | ----- |
| Shift+1 | canvas | fit | no |
| = | canvas | zoom in one step | no |
| Cmd+0 (macOS) | canvas | zoom to 100% | no |
| 1 | canvas | none | yes |
| M | canvas | none | yes |
| Alt+ArrowRight | canvas | none | yes |
| Space | Zoom in focused with Tab | none (button activates) | yes |
| Escape | Reset dialog open | dialog closed | no |
| Escape | frame drag active | drag cancelled | no |
| Escape | no drag, no marquee, empty selection, no open menu or dialog, not interacting | none | yes |
| Shift+0 | typing in an input | none | yes |

---

### Requirement: Frame drag without full re-render

Pressing the primary button on a route frame or flow-only node SHALL start a drag only after the pointer has moved at least 3 CSS pixels on screen, and SHALL NOT start a drag while the canvas shows a view that another UI Flow canvas capability declares read-only, such as the journey focus view. During a drag, the inspector SHALL move only the dragged frames (the pressed frame, or every selected frame where a canvas capability defines group drag) through CSS transforms and SHALL recompute only the edges connected to them, without re-rendering the other frames. From the first pointer move past the drag threshold until release or Escape, the inspector SHALL NOT commit React renders of the UI Flow tree; hiding the connected edge labels and setting the dragging state SHALL be done imperatively. Releasing the pointer SHALL commit the new positions, rounded to integer world coordinates, in one React commit and as one layout action that is persisted once. Pressing Escape during a drag SHALL restore the original positions, SHALL persist nothing and SHALL commit React renders at most once. A press and release that never reaches the threshold SHALL change neither positions nor the fit state. Hovering a frame SHALL emphasize its connected edges and mute the others.

#### Scenario: Drag commits once at the release point

- **WHEN** a route frame at (480, 980), with no alignment candidate within the snapping threshold, is dragged at zoom 0.5 by 100 screen pixels right and 50 screen pixels down and released
- **THEN** its committed position is (680, 1080) and the layout is persisted exactly once

#### Scenario: Escape cancels a drag

- **WHEN** the reviewer drags a frame at (480, 980) by 120 screen pixels and presses Escape before releasing
- **THEN** the frame returns to (480, 980) and nothing is persisted

#### Scenario: A drag commits React only on release

- **WHEN** a frame is dragged with 20 pointer moves and released
- **THEN** no pi:flow:commit mark is recorded between the first move past the threshold and the release, and exactly one is recorded within 100 milliseconds after the release, not counting commits caused by route frame loads or preview size measurements

---

### Requirement: Frame labels outside frames

Each route frame SHALL show its title, the viewport badge when a viewport is declared, and the components button when the route has components, in a label drawn above the frame's preview in a screen-space layer that does not scale with the camera, at a font size of at least 12 CSS pixels. The label SHALL be truncated with an ellipsis to the frame's on-screen width, SHALL be hidden while the frame is narrower than 48 CSS pixels on screen unless the frame is hovered, and SHALL reveal the route id together with the frame's group name (flowGroup, falling back to navigationId, and omitted when neither is declared) while the frame is hovered. The components button SHALL switch the inspector to Components mode and SHALL NOT start a drag. Route frames SHALL render without a border, a shadow or an in-frame header.

#### Scenario: Labels keep their size across zoom levels

- **WHEN** the reviewer zooms from 25% to 200%
- **THEN** frame labels keep the same font size on screen while the frames scale

#### Scenario: Small frames hide their labels until hovered

- **WHEN** the zoom is 0.1 so a 377-pixel-wide phone frame is 37.7 pixels wide on screen
- **THEN** its label is hidden, and hovering the frame shows the label with the route id

#### Scenario: Hover reveals the route id and group name

- **WHEN** the zoom is 0.5 and the reviewer hovers a route frame titled "Fund detail" with id fund-detail and flowGroup "Fund"
- **THEN** its label shows "Fund detail" together with fund-detail and "Fund"

---

### Requirement: Edge labels off the gesture path

Edge label placement SHALL run only while the camera is idle, and only when the zoom bucket round(2 × log2(zoom)) differs from the bucket used by the last placement or when positions, measured frame sizes or transitions have changed; it SHALL NOT run during a pan, zoom or drag gesture. Placement SHALL use label sizes measured from the rendered label text. Edge labels SHALL render at a constant screen size of at least 12 CSS pixels. An edge's label SHALL be hidden while both of its endpoints (route frames or flow-only nodes) are narrower than 150 CSS pixels on screen and neither endpoint is hovered; this rule SHALL apply to every view of the canvas except a view for which another UI Flow canvas capability defines its own edge label visibility. Edge strokes SHALL keep an on-screen stroke width between 1 and 3 CSS pixels at every zoom. Arrowheads SHALL be sized for the representative zoom 2^(b/2) of the idle camera's zoom bucket b, so that while the camera is idle their on-screen length is between 11 and 17 CSS pixels and equals 14 CSS pixels at the representative zoom. The dashed-line animation SHALL pause while the camera moves, while a drag is active and while the zoom is below 0.4, and SHALL NOT run when the reviewer prefers reduced motion.

#### Scenario: Zooming within one bucket does not re-place labels

- **WHEN** the camera settles at zoom 1.1 after the last placement ran at zoom 1.0
- **THEN** no placement runs, because both zoom levels fall in bucket 0

#### Scenario: Arrowheads keep their size

- **WHEN** the camera settles at zoom 0.25
- **THEN** arrowheads are 14 CSS pixels long and edge strokes are 2 CSS pixels wide on screen

#### Scenario: Labels between small frames stay hidden until hovered

- **WHEN** the zoom is 0.3 so two connected 377-pixel-wide route frames are about 113 pixels wide on screen and neither is hovered
- **THEN** the label of the edge between them is hidden, and hovering either frame shows it

##### Example: zoom buckets

| Zoom | round(2 × log2(zoom)) |
| ----- | ----- |
| 2 | 2 |
| 1 | 0 |
| 0.75 | -1 |
| 0.5 | -2 |
| 0.35 | -3 |
| 0.1 | -7 |

---

### Requirement: Gesture work outside React rendering

During pan, zoom and drag gestures, the inspector SHALL update the world-layer transform, the screen-space label positions and the dragged frames' transforms imperatively inside requestAnimationFrame callbacks, and SHALL NOT commit React renders of the UI Flow tree for camera changes. Every element of the screen-space layer, including elements that other UI Flow canvas capabilities add to it, SHALL either be positioned from the camera CSS custom properties set on that layer or be updated in the same requestAnimationFrame callback that writes the world-layer transform. Camera state SHALL be committed to React once, 120 milliseconds after the last camera change. The inspector SHALL call performance.mark with the name pi:flow:commit after each committed render of the UI Flow tree and with the name pi:flow:label-placement for each edge label placement run. The world layer SHALL carry will-change: transform only while the camera moves.

#### Scenario: A pinch gesture commits React once

- **WHEN** 30 ctrlKey wheel events arrive within one second and the camera then stays still
- **THEN** no pi:flow:commit or pi:flow:label-placement mark is recorded until 120 milliseconds after the last event, and exactly one pi:flow:commit mark is recorded within the following 100 milliseconds, not counting commits caused by route frame loads or preview size measurements

#### Scenario: Screen-space elements move with the world layer

- **WHEN** the reviewer pans the canvas by 300 pixels in one gesture
- **THEN** in every rendered animation frame each frame label keeps the same screen offset from its frame's visible rect as before the pan

---

### Requirement: Canvas controls and zoom menu

The canvas SHALL show a zoom group containing Zoom out, the current zoom percentage, Zoom in and Fit canvas, where pressing the percentage opens a zoom menu offering Zoom to fit, 50%, 100% and 200% with their shortcuts and listing the canvas gestures and shortcuts. The zoom percentage SHALL be a button with aria-haspopup="menu" and aria-expanded whose visible text is the current percentage and whose accessible name is 'Zoom menu' followed by that percentage, and it SHALL update while the camera moves. The layout group SHALL keep Reset Layout (disabled without a custom layout or while a read-only view, meaning a view that another UI Flow canvas capability declares read-only, is shown, and confirmed through its dialog), Import Layout (disabled while a read-only view is shown), Export Layout and Open Static Flow. The controls SHALL keep the accessible names 'Zoom in', 'Zoom out', 'Fit canvas', 'Reset UI Flow layout', 'Import UI Flow layout', 'Export UI Flow layout' and 'Open Static Flow story for Figma export'. The Reset confirmation button text SHALL have a contrast ratio of at least 4.5:1 against its background in the fallback light and dark themes. The canvas background SHALL be a solid token color.

#### Scenario: Zoom menu jumps to a preset

- **WHEN** the reviewer opens the zoom menu and chooses 200%
- **THEN** the zoom becomes 2 around the canvas center, the percentage reads 200%, and the percentage button's accessible name is 'Zoom menu 200%'

#### Scenario: Layout actions keep working

- **WHEN** the reviewer exports the layout of a prototype whose id is "Growth_Fund 2", resets it through the confirmation dialog and imports the exported file
- **THEN** the downloaded file is named growth-fund-2-ui-flow-layout.json (the prototype id lowercased, with runs of other characters replaced by -), as today, and the imported positions are restored and persisted once
