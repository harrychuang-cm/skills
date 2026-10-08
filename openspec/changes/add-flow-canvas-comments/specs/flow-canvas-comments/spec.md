## Purpose

Connects the Prototype Inspector UI Flow canvas to the figma-export addon's visual comments through DOM attributes and DOM events only, so comments can be pinned to route frames, flow-only nodes, key transition lines and canvas positions, stay in place while the camera moves or frames are dragged, and stay separate from comments made on the Story. The Inspector imports nothing from the addon.

## ADDED Requirements

### Requirement: Comment surface declarations per Inspector mode

The UI Flow root element (`.prototype-inspector--flow`) SHALL carry `data-sbfx-view="ui-flow"` and `data-sbfx-export="unavailable"`. When the prototype declares a Static Flow export story, the root SHALL also carry `data-sbfx-export-label="Open Static Flow to export this flow."` and `data-sbfx-export-href` set to the same URL the Open Static Flow control opens; otherwise it SHALL carry `data-sbfx-export-label="Figma export is not available in UI Flow."` and no href. The root elements of the Docs, Components and Data modes SHALL carry `data-sbfx-export="unavailable"` and `data-sbfx-comments="unavailable"`. Story mode SHALL render the story without adding any of these attributes.

#### Scenario: UI Flow points Figma export to the Static Flow story

- **WHEN** a prototype with `figmaExport.flowStoryId` `pages-prototypes-example-prototype--static-flow` opens in UI Flow
- **THEN** the UI Flow root carries `data-sbfx-view="ui-flow"`, `data-sbfx-export="unavailable"`, the Static Flow label, and a `data-sbfx-export-href` whose `path` parameter is `/story/pages-prototypes-example-prototype--static-flow`

#### Scenario: Documentation modes decline comments and export

- **WHEN** the prototype opens in Docs, Components or Data mode
- **THEN** that mode's root element carries `data-sbfx-export="unavailable"` and `data-sbfx-comments="unavailable"`

---

### Requirement: Canvas comment anchors

In every UI Flow view, the element that represents a route frame's visible rect (the preview area) SHALL carry `data-sbfx-anchor="route:<routeId>"`, `data-sbfx-anchor-label` set to the route title and `data-sbfx-anchor-route` set to the route id. Each flow-only node's box SHALL carry `data-sbfx-anchor="node:<nodeId>"` and `data-sbfx-anchor-label` set to the node title. Each drawn key transition line SHALL carry `data-sbfx-anchor="edge:<from>-><to>"`, `data-sbfx-anchor-kind="path"` and `data-sbfx-anchor-label` set to the source title, a space, `→`, a space and the target title, on the SVG geometry element that draws the line. The element carrying a frame's anchor SHALL stay in the document for as long as the frame is in the canvas, whatever content (a live page, a snapshot or an empty placeholder) another UI Flow canvas capability shows in it. When a view shows the same route or node more than once, only its first instance in that view's order SHALL carry the anchor attributes.

#### Scenario: Frames, nodes and lines carry anchors

- **WHEN** a flow with routes `intake` (title "Intake") and `review` (title "Review"), the flow-only node `decision` (title "Approve?") and a key transition from `intake` to `review` opens in UI Flow
- **THEN** the intake preview area carries `data-sbfx-anchor="route:intake"` with label "Intake", the node carries `data-sbfx-anchor="node:decision"` with label "Approve?", and the line carries `data-sbfx-anchor="edge:intake->review"`, `data-sbfx-anchor-kind="path"` and label "Intake → Review"

---

### Requirement: Canvas coordinate declaration

While the canvas shows the complete flow, the viewport element SHALL carry `data-sbfx-canvas` and the transformed world layer SHALL carry `data-sbfx-canvas-world`, keeping transform-origin 0 0 and a transform made only of a translation and a uniform scale, so that a point in the world layer's coordinate space equals the same point in layout coordinates. While the canvas shows a view that another UI Flow canvas capability lays out from computed positions, the viewport element SHALL keep `data-sbfx-canvas`, so that the comment screenshots and pin clipping still use the canvas, and the world layer SHALL NOT carry `data-sbfx-canvas-world`, so that no blank-canvas point is mapped to layout coordinates that the view does not show; a comment placed on blank canvas in such a view therefore has no canvas anchor.

#### Scenario: A blank-canvas comment maps to layout coordinates

- **WHEN** the complete flow is shown with the camera at translation (40, 20) and zoom 0.5, and a comment is placed on blank canvas at the viewport point (340, 170)
- **THEN** the comment's canvas anchor records world (600, 300), the layout coordinates under that point

#### Scenario: A derived-layout view keeps the canvas but no world layer

- **WHEN** another UI Flow canvas capability shows a view whose frame positions are computed instead of read from the saved layout
- **THEN** the viewport element carries `data-sbfx-canvas` and no element of the UI Flow root carries `data-sbfx-canvas-world`

---

### Requirement: Anchor movement notifications

The UI Flow canvas SHALL dispatch a bubbling `sbfx:anchors-moved` CustomEvent from its root element within the same requestAnimationFrame callback that writes a new world-layer transform, writes or restores dragged frame transforms, or writes moved edge geometry; after every committed render of the UI Flow tree; and whenever the viewport element changes size. Dispatching these events SHALL NOT add React commits: during pan, zoom and drag gestures the canvas SHALL keep committing no React render of the UI Flow tree for camera changes.

#### Scenario: A pin follows its frame during a pan

- **WHEN** a comment is pinned to `route:review`, the reviewer pans the canvas by 300 pixels in one gesture, and the addon repositions pins inside its `sbfx:anchors-moved` listener
- **THEN** in every rendered animation frame the pin keeps the same screen offset from the review frame's visible rect as before the pan

#### Scenario: Gestures stay outside React rendering

- **WHEN** the bench flow receives 30 ctrlKey wheel events while the figma-export review is active
- **THEN** no pi:flow:commit mark is recorded until 120 milliseconds after the last event, as before this change

---

### Requirement: Anchor location requests

The UI Flow canvas SHALL listen for `sbfx:reveal-anchor` on the document while it is mounted and SHALL handle a request whose `detail.view` is `ui-flow` as follows, calling `preventDefault()` on the event when it handles it. For an element anchor whose id is present on a frame in the current view, it SHALL move the camera so that frame's visible rect is fitted with the canvas fit inset at a zoom of at most 1. For a path anchor whose line is present, it SHALL fit the visible rects of the line's two end frames. For a canvas anchor while the canvas shows the complete flow, it SHALL center the anchor's world point in the viewport at the current zoom. These camera moves SHALL be programmatic camera moves that end fit tracking. The canvas SHALL leave every other request, including any request for another view, unhandled.

#### Scenario: Showing an off-screen frame comment

- **WHEN** the camera shows the left part of the flow and the addon dispatches `sbfx:reveal-anchor` for the element anchor `route:review` with view `ui-flow`
- **THEN** the camera fits the review frame's visible rect, Fit canvas reports aria-pressed false, and the event's default action is prevented

#### Scenario: A Story comment request is ignored

- **WHEN** the addon dispatches `sbfx:reveal-anchor` with view `story`
- **THEN** the camera does not move and the event's default action is not prevented

---

### Requirement: Keys handled by other listeners

The canvas keyboard dispatcher SHALL ignore a keydown or keyup event whose `defaultPrevented` is already true when it reaches the document in the bubble phase, so a key handled by the comment composer, a comment dialog or another listener performs no canvas command.

#### Scenario: Escape closes the comment composer without cancelling a drag

- **WHEN** the comment composer's Escape handler calls `preventDefault()` on an Escape keydown while a frame drag is active
- **THEN** the drag continues and the frame keeps its dragged position

---

### Requirement: Comment capture takes precedence over frame interaction

While the html element carries `data-sbfx-capture-mode="true"`, no frame iframe in the UI Flow canvas SHALL receive pointer events, so a press on any frame reaches the comment capture, and the canvas SHALL NOT enter a frame interaction mode that another UI Flow canvas capability defines. A frame that is in such an interaction mode when capture starts SHALL stop receiving pointer events until capture ends, and SHALL resume afterwards.

#### Scenario: Commenting on a frame that is being interacted with

- **WHEN** a frame's iframe receives pointer events because another canvas capability put the frame in an interaction mode, and the participant arms a comment capture and presses on that frame
- **THEN** the comment capture receives the press and places a pin anchored to that frame's route
