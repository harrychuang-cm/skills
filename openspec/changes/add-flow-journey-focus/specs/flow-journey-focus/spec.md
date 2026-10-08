## Purpose

Lets reviewers look at one feature journey of a complex prototype at a time. Flows can declare journeys that mirror the PRD's Core Journeys, and the inspector derives one short journey per branch edge for the branches that no declared journey covers. Selecting a journey switches the UI Flow canvas to a simplified, read-only view that lays the journey's steps out in a line with one connector between consecutive steps.

## ADDED Requirements

### Requirement: Declared flow journeys

The flow template SHALL declare an optional journeys array, exported alongside routes, nodes and transitions and included in the flow object as journeys, where each journey has an id in lowercase kebab-case, a title, an optional description, and steps listing route ids or flow node ids in order, and journeys SHALL allow the same step id to appear more than once. The template's journeys export SHALL be the literal empty array [], with its usage example in the documentation comment of the journey type, so that no comment appears between the array brackets. The prototype validator SHALL read journeys from the flow source after removing comments. It SHALL report an error when a journey step is not the id of an entry in the flow's routes or nodes metadata (flow.routes[].id or flow.nodes[].id, the frames the inspector renders), when a journey id is not lowercase kebab-case, when two journeys share an id, or when a journey has fewer than two steps, and SHALL report a warning when two consecutive steps have no transition from the first to the second. A flow without journeys SHALL pass validation unchanged. When a flow that did not pass validation is opened, the inspector SHALL skip journey steps that are not rendered frames with a console warning, omit a journey left with fewer than two steps, and keep only the first of several journeys that share an id, with a console warning.

#### Scenario: Valid journey passes

- **WHEN** a flow declares a journey with steps intake, review and handoff and transitions exist from intake to review and from review to handoff
- **THEN** the validator reports no journey errors or warnings

##### Example: validator results

| Journey declaration | Result |
| ----- | ----- |
| steps intake, review | valid |
| steps intake, unknown-screen | error: unknown step unknown-screen |
| steps intake, nav-only, where nav-only is listed in the route id array but not in the routes metadata | error: unknown step nav-only |
| steps intake | error: fewer than two steps |
| two journeys with id main-path | error: duplicate journey id main-path |
| journey id MainPath | error: journey id MainPath is not lowercase kebab-case |
| steps intake, handoff with no intake-to-handoff transition | warning: no transition from intake to handoff |
| no journeys array | valid |

#### Scenario: Comments inside the journeys array are ignored

- **WHEN** a journeys array holds a commented-out journey object with steps intake and review, then a comment containing the words "the journey's steps", then a journey with steps intake and unknown-screen
- **THEN** the validator parses exactly one journey and reports the unknown step unknown-screen

---

### Requirement: Derived branch journeys

The inspector SHALL derive branch journeys from a graph whose nodes are the flow's routes in flow.routes order followed by its flow nodes in flow.nodes order, and whose qualifying edges are the transitions between two of those nodes that have flowLine key or reference and a kind other than return and global. A branch node is a node whose qualifying edges lead to at least two different nodes, and a merge node is a node that qualifying edges reach from at least two different nodes. The entries are the first route followed by every other node without qualifying incoming edges, in node order, each used once. For each branch node in node order, and for each different node that its qualifying edges lead to, in the order of the first such transition in the transitions array, the inspector SHALL derive exactly one journey, so that parallel transitions between the same two nodes yield one journey. The journey's steps SHALL be built in three parts:

- Context: the nodes immediately before the branch node, at most two and in path order, on the path found by a breadth-first search over qualifying edges that starts from all entries in entry order, follows each node's qualifying edges in transition order and records for each node the node from which it was first reached. A branch node that is an entry, or that no entry reaches, has no context steps.
- Branch: the branch node itself.
- Walk: the edge's target, then, while the qualifying edges of the last step lead to exactly one node, that node. The walk SHALL stop after adding a branch node, a merge node other than the edge's target, or a node without qualifying outgoing edges, and SHALL stop before adding a node that already appears in the steps, recording that node as the journey's loop target.

A journey SHALL be named by the distinct labels of the branch node's qualifying transitions to its target, in transition order, joined by " / ", followed by " · ", then "↩ " when the target is the loop target, then the target's title; when two journeys of one branch node would share a name, each SHALL append " (<target id>)". A derived journey SHALL be identified by the key derived:<branch node id>:<target id>. Derived journeys with fewer than two steps SHALL be discarded, and derived journeys whose steps, followed by their loop target when present, equal a declared journey's steps SHALL be omitted. The first 24 remaining derived journeys in derivation order SHALL be kept, and the number of further remaining journeys SHALL be reported as the truncated count, computed from the derived journeys without enumerating paths through the flow.

#### Scenario: Six branches become six journeys

- **WHEN** the first route has a key transition to a decision node, and the decision node has six transitions of kind condition, each with flowLine key or reference, to six different routes that have no qualifying outgoing transitions
- **THEN** the inspector derives six journeys grouped under the decision node, each with the steps first route, decision node and one target route, and each named by its branch label and target title

##### Example: derivation on the storybook-template example prototype

- **GIVEN** transitions intake→review "Submit intake" (key, primary), review→approval-decision "Request approval" (key, primary), approval-decision→handoff "Approved" (key, condition), approval-decision→review "Needs changes" (reference, condition), review→intake "Edit intake" (reference, return) and handoff→intake "Start another request" (reference, return), no declared journeys, and approval-decision titled "Ready for handoff?"
- **WHEN** the inspector derives branch journeys
- **THEN** it returns, under branch node approval-decision, "Approved · Implementation Handoff" keyed derived:approval-decision:handoff with steps intake, review, approval-decision, handoff, and "Needs changes · ↩ Review Request" keyed derived:approval-decision:review with steps intake, review, approval-decision and loop target review

#### Scenario: Declared journeys cover the example's branches

- **WHEN** the storybook-template example prototype declares approve-request with steps intake, review, approval-decision, handoff and request-changes with steps intake, review, approval-decision, review
- **THEN** both derived journeys of approval-decision are omitted, because the steps of "Needs changes · ↩ Review Request" followed by its loop target review equal the steps of request-changes, and no derived journey remains

#### Scenario: Rejoining branches stay one journey per branch edge

- **WHEN** three decision nodes are chained so that the two branches of each decision rejoin at one route that leads to the next decision
- **THEN** the inspector derives six journeys, one per branch edge, instead of the eight complete paths through the flow

##### Example: three chained decisions

- **GIVEN** routes a, b1, b2, m1, c1, c2, m2, e1 and e2 titled by their ids in capitals, decision nodes d1, d2 and d3, and key transitions a→d1, d1→b1 "Left", d1→b2 "Right", b1→m1, b2→m1, m1→d2, d2→c1 "Left", d2→c2 "Right", c1→m2, c2→m2, m2→d3, d3→e1 "Left" and d3→e2 "Right"
- **WHEN** the inspector derives branch journeys
- **THEN** it returns the journeys of this table in this order

| Branch node | Journey | Steps |
| ----- | ----- | ----- |
| d1 | Left · B1 | a, d1, b1, m1 |
| d1 | Right · B2 | a, d1, b2, m1 |
| d2 | Left · C1 | b1, m1, d2, c1, m2 |
| d2 | Right · C2 | b1, m1, d2, c2, m2 |
| d3 | Left · E1 | c1, m2, d3, e1 |
| d3 | Right · E2 | c1, m2, d3, e2 |

#### Scenario: Parallel and loop-back edges keep distinct identities

- **WHEN** a flow has routes s, r1, r2 and x in this order, titled S, R1, R2 and X, a decision node d, key transitions s→r1, r1→r2 and r2→d, and then, in this order, key transitions d→r1 "Back to first", d→r2 "Back to second", d→x "Retry" and d→x "Try again"
- **THEN** the inspector derives "Back to first · ↩ R1" keyed derived:d:r1 and "Back to second · ↩ R2" keyed derived:d:r2, both with steps r1, r2, d and with loop targets r1 and r2 respectively, and one journey "Retry / Try again · X" keyed derived:d:x with steps r1, r2, d, x

#### Scenario: Isolated screens produce no journey

- **WHEN** a route's only transitions have kind return or global, flowLine hidden or no flowLine
- **THEN** that route appears in no derived journey

##### Example: a route linked only by excluded transitions

- **GIVEN** routes a, b, c and lonely in this order, titled A, B, C and L, key transitions a→b "x" and a→c "y", a reference transition lonely→a of kind return, a key transition a→lonely of kind global, a transition lonely→b with flowLine hidden and a transition c→lonely without flowLine
- **WHEN** the inspector derives branch journeys
- **THEN** it returns "x · B" with steps a, b and "y · C" with steps a, c, and lonely appears in neither

#### Scenario: Converging entry routes do not multiply journeys

- **WHEN** a flow without declared journeys has four entry routes that converge on one chain and seven branch nodes whose qualifying edges lead to 2, 2, 2, 2, 2, 3 and 4 different nodes
- **THEN** the inspector derives seventeen journeys in seven branch groups and reports a truncated count of 0

#### Scenario: A long fan is capped at 24 journeys

- **WHEN** one decision node has key transitions to 30 different routes and no journeys are declared
- **THEN** the first 24 journeys in transition order are kept and the truncated count is 6

---

### Requirement: Journey list panel

The UI Flow tab SHALL show a collapsible journey list in a column at its left edge, laid out beside the canvas viewport rather than over it, so that the canvas viewport, and with it fitting, culling, the minimap and the canvas controls, starts at the list's right edge; expanding or collapsing the list SHALL resize the canvas viewport like any other canvas resize. The list SHALL be rendered only when it has more than one entry. Its entries SHALL be, in order, "全部" for the complete flow, the declared journeys, and a section titled "自動分支" listing the kept derived journeys grouped under the title of their branch node, shown only when at least one derived journey is kept. Each journey entry SHALL show its title and step count, and the entry of the selected journey SHALL list its step titles in order with the label text of each journey edge between them, ending with the loop marker text when the journey has one. When the truncated count is greater than 0, the section SHALL state that number of journeys as not listed and suggest declaring journeys in the flow.

The list SHALL be a region named "UI Flow journeys", 240 CSS pixels wide when expanded and 40 CSS pixels wide when collapsed, and expanded when the UI Flow mounts. Each entry SHALL be a button with aria-pressed true on the selected entry, and a long title SHALL be truncated with an ellipsis while the full title stays the entry's accessible name, except that the "全部" entry SHALL be named "All". The collapse toggle SHALL be a button named "Collapse journey list" or "Expand journey list" with aria-expanded. List text SHALL be at least 12 CSS pixels and styled only with existing --pi-* tokens. Visible copy SHALL be Traditional Chinese, while accessible names SHALL be English like the other UI Flow controls. The list SHALL sit outside the wheel-capturing canvas viewport, so that wheel input without Ctrl, Meta or Alt over the list scrolls the list and never moves the camera, while such a modified wheel input over the list zooms the canvas as it does anywhere in the UI Flow root.

Selecting an entry SHALL switch the canvas to that view, first cancelling an active frame drag as Escape does, and changing the selected entry SHALL clear any frame selection. The selected entry SHALL be stored per prototype in sessionStorage under prototype-inspector:flow-journey:<prototypeId> as "all", "declared:<journey id>" or the derived journey's key, and SHALL be restored when the UI Flow remounts in the same tab session, falling back to "全部" when the stored entry no longer exists. While the list is rendered, the keys [ and ] pressed without a modifier key SHALL select the previous and next entry, wrapping at the ends, and SHALL be consumed by the canvas under the canvas keyboard rules of flow-canvas-navigation; with a modifier key, or while the list is not rendered, they SHALL propagate unchanged. While the list is rendered, the zoom menu's gesture and shortcut help SHALL list [ and ] for switching journeys.

#### Scenario: Declared and derived journeys are listed in order

- **WHEN** a flow declares two journeys and its only branch node has qualifying edges to three different nodes, one of whose derived journeys equals a declared journey
- **THEN** the list shows "全部", the two declared journeys with their step counts, and a "自動分支" section with the two remaining derived journeys under the branch node's title

#### Scenario: Covered branches leave no derived section

- **WHEN** the storybook-template example prototype declares approve-request and request-changes
- **THEN** the list shows "全部" and the two declared journeys with 4 steps each, and no "自動分支" section

#### Scenario: A flow without journeys or branches shows no list

- **WHEN** a flow declares no journeys and has no branch node
- **THEN** no journey list is rendered, the canvas viewport spans the whole UI Flow tab, and the keys [ and ] reach Storybook unchanged

##### Example: a linear flow

- **GIVEN** a flow with routes home, detail and done, key transitions home→detail and detail→done, and no journeys array
- **WHEN** the UI Flow opens and the reviewer presses ] on the canvas
- **THEN** no region named "UI Flow journeys" exists, the keydown is not cancelled, and the Storybook manager receives it

#### Scenario: Selection survives a mode switch

- **WHEN** the reviewer selects a journey, switches to Components mode and returns to UI Flow in the same tab
- **THEN** the same journey is selected and its simplified view is shown

##### Example: restoring request-changes

- **GIVEN** the storybook-template example prototype with request-changes selected
- **WHEN** the reviewer switches to Components mode and back to UI Flow
- **THEN** sessionStorage holds "declared:request-changes" under prototype-inspector:flow-journey:example-prototype, and the canvas shows the four step instances of request-changes

---

### Requirement: Journey focus layout

While a journey is selected, the canvas SHALL render only that journey's steps, one frame instance per step occurrence. Each step instance SHALL be identified by the instance key "<stepIndex>:<nodeId>", where stepIndex is the 0-based index of the step in the journey's steps, and in the complete flow a frame's instance key SHALL equal its node id. Every per-frame state of the canvas, including level-of-detail tiers, hover, promoted and pinned frames, selection, frame navigation and hit-testing, SHALL be keyed by instance key, while the frame size cache and snapshots SHALL stay keyed by route id, so that two instances of one route share one size and one snapshot.

Steps SHALL be placed left to right in rows of at most 8 steps, using each frame's cached size, with 160 world pixels between neighbouring frame boxes and every row starting at x 0. Each step's visible rect, as flow-canvas-navigation defines it, SHALL be vertically centred on its row's centre line, which lies below the row's top by the largest distance in that row from a frame box's top edge to the vertical centre of its visible rect. The first row's top SHALL be y 0, and each later row's top SHALL be 240 world pixels below the lowest frame box bottom of the row before it.

Edges SHALL connect only consecutive steps and SHALL be anchored on their visible rects: a straight horizontal line inside a row, from the right side of the earlier step to the left side of the later step, and an orthogonal connector from the right side of a row's last step through the gap between the two rows to the left side of the next row's first step. An edge backed by transitions from the earlier step to the later step, of any flowLine and kind, SHALL use the full-flow dash pattern and animation rules in the primary flow edge color and SHALL be labelled with the text the full flow uses: 條件 when any of those transitions has kind condition and 點擊 otherwise, followed by their distinct labels joined by " / ". An edge without such a transition SHALL be drawn as a static dotted line in the outline color, without animation and without a label. A derived journey with a loop target SHALL end with a loop marker reading "↩ " followed by the loop target's title, whose left edge is anchored 160 world pixels to the right of the last step's frame box on that row's centre line, connected to the last step by an edge labelled like an edge from the last step to the loop target; the marker SHALL NOT count as a step for row wrapping.

Journey edge labels and the loop marker SHALL render in the screen-space layer at the canvas's constant 12-pixel label size, and the 150-pixel edge-label hiding rule of flow-canvas-navigation SHALL NOT apply in a journey focus view. A label inside a row, including the label of the connector to the loop marker, SHALL be centred in the gap after the earlier frame box and truncated with an ellipsis to that gap's on-screen width, so that it never overlaps a frame box; a label of a connector between rows SHALL be centred on the connector's horizontal segment in the gap between the rows and truncated to that segment's on-screen length. A label SHALL be hidden only while its available width is narrower than 24 CSS pixels, and SHALL show its full text while the pointer hovers its connector or label.

Fitting a journey SHALL fit the bounding box of its frame boxes and of its loop marker, the marker counting as a horizontal segment 160 world pixels long that starts at its anchor. Selecting a journey, and remounting the UI Flow while a journey is selected, SHALL fit the journey and keep fitting it as the camera does after the first open, until the first camera change that this fit tracking did not produce; while a journey is selected, Fit canvas and Shift+1 SHALL fit the journey. The camera of a journey focus view SHALL NOT be written to prototype-inspector:flow-camera:<prototypeId>. Returning to "全部" SHALL restore the complete-flow camera from memory, or from prototype-inspector:flow-camera:<prototypeId> when a remount discarded the in-memory copy, and SHALL fit the complete flow when neither exists.

#### Scenario: Branch lines no longer overlap

- **WHEN** the reviewer selects one of six derived branch journeys
- **THEN** only that branch's frames are shown in one row with one connector between each pair of consecutive steps, and the other five branches are not drawn

##### Example: layout of three steps

- **GIVEN** a journey with steps intake (frame box 377 x 878, visible rect starting 65 pixels below the box top and 812 pixels tall), approval-decision (frame box 220 x 220, visible rect equal to the box) and handoff (frame box 377 x 878)
- **WHEN** the journey is selected
- **THEN** the row's centre line is at y 471, intake is placed at (0, 0), approval-decision at (537, 361) and handoff at (917, 0)

##### Example: row wrapping

| Steps in journey | Steps per row |
| ----- | ----- |
| 3 | 3 |
| 8 | 8 |
| 10 | 8, 2 |
| 17 | 8, 8, 1 |

#### Scenario: Repeated steps are separate instances

- **WHEN** request-changes (intake, review, approval-decision, review) is shown at zoom 0.5 and the reviewer hovers the second review instance for 200 milliseconds
- **THEN** the canvas renders four step instances keyed 0:intake, 1:review, 2:approval-decision and 3:review, the instance 3:review becomes live, and the instance 1:review stays in the snapshot tier

#### Scenario: Labels stay readable at a journey's fitted zoom

- **WHEN** a journey of phone steps with 377 x 878 frame boxes is fitted in the canvas viewport
- **THEN** every connector label is visible without hovering, truncated to the gap between its frame boxes, and no label overlaps a frame box

##### Example: fitted journeys

| Steps | Canvas viewport | Fit zoom | Frame width on screen | Gap on screen |
| ----- | ----- | ----- | ----- | ----- |
| 6 | 1190 x 800 | 0.336 | 127 | 54 |
| 8 | 1200 x 900 | 0.247 | 93 | 39 |

#### Scenario: Full-flow camera survives a journey visit across a mode switch

- **WHEN** the reviewer zooms the complete flow to 200%, selects a journey, switches to Components mode, returns to UI Flow and chooses "全部"
- **THEN** the journey is shown fitted after the return, and choosing "全部" restores the 200% camera with the same translation

---

### Requirement: Journey focus comment anchors

In a journey focus view, only the first instance of a route or flow node in step order SHALL carry its comment anchor attributes, and a journey edge backed by transitions SHALL carry the path anchor edge:<from>-><to> of the canvas comments contract only at its first occurrence in step order; dotted edges and the hover areas of edges SHALL carry no anchor. The canvas viewport SHALL keep declaring the comment canvas while the world layer declares no canvas world, as the canvas comments contract defines for views laid out from computed positions. A reveal-anchor request in a journey focus view SHALL bring the first instance of an element anchor into view, or both ends of the first journey edge of a path anchor, and SHALL be handled; a request for a canvas anchor or for an anchor that the view does not show SHALL be left unhandled, without calling preventDefault.

#### Scenario: Repeated steps carry one anchor

- **WHEN** the storybook-template example prototype shows request-changes (intake, review, approval-decision, review)
- **THEN** exactly one element carries data-sbfx-anchor="route:review", it belongs to the instance 1:review, the viewport carries data-sbfx-canvas, and no element carries data-sbfx-canvas-world

#### Scenario: A reveal request for a hidden anchor is left alone

- **WHEN** request-changes is shown and the figma-export review asks to reveal a comment anchored to route:handoff, which request-changes does not include
- **THEN** the camera does not move and the request event is not marked handled

---

### Requirement: Journey focus keeps the saved layout

The journey focus view SHALL be a read-only view as flow-canvas-navigation defines it. Journey focus positions SHALL be computed on demand and SHALL NOT be written to the flow layout payload or to any other storage; apart from the level-of-detail size and snapshot records, which follow their own rules, the only value the journey focus feature stores is the selected-entry key. While a journey is selected, pressing and moving on a frame SHALL NOT start a frame drag, Reset Layout and Import Layout SHALL be disabled, and the canvas SHALL show the notice "簡化檢視：位置不會儲存". Export Layout SHALL keep exporting the saved complete-flow positions. Step instances SHALL follow the same level-of-detail tiers, snapshots and live iframe budget as frames of the complete flow, keyed by instance key as the requirement "Journey focus layout" defines.

#### Scenario: Saved layout is untouched

- **WHEN** the reviewer selects a journey, tries to drag a frame, and returns to "全部"
- **THEN** no frame moves, no layout write occurs, and the full flow shows the previously saved positions
