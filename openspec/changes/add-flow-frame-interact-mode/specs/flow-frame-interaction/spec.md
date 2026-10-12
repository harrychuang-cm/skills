## Purpose

Lets reviewers operate one route frame directly inside the Prototype Inspector UI Flow canvas, scrolling, clicking and navigating as in Story mode, without leaving the flow overview. It defines the inspector side of interact mode, its behaviour in journey focus views, and the opt-in query contract that prototypes implement so in-frame navigation can leave the previewed route.

## ADDED Requirements

### Requirement: Frame interact mode

Double-clicking a route frame, or pressing Enter without Shift, without Mod and without auto-repeat while exactly one route frame and nothing else is selected, SHALL enter interact mode for that frame; flow-only nodes SHALL NOT enter interact mode. Interact mode SHALL NOT be entered in the flow export story (Static Flow), whose route iframes load the whole flow export, nor while the html element carries data-sbfx-capture-mode="true", as the flow-canvas-comments capability requires. Enter SHALL NOT enter interact mode when its composed-path target is a control that the canvas keyboard rules of flow-canvas-navigation leave the key to, such as a keyboard-focused canvas control, a journey list entry, a zoom menu item or a button in the Reset Layout dialog. Entering SHALL select the frame alone, end the opening fit tracking even when the camera does not move, pin it live through the level-of-detail pinned slot, which keeps it live regardless of its on-screen width, visible fraction or culling, reload its iframe with the route preview URL plus prototypeFlowInteractive=true, and, when the frame is narrower than 300 pixels on screen or not fully inside the viewport, fit the camera to the frame with zoom capped at 1. The reload that enters or exits interact mode SHALL take the route-iframe loading slot of flow-canvas-level-of-detail as soon as it is free, ahead of queued live-frame loads. The interacting frame SHALL show an interaction outline and a chip reading "互動中 · Esc 結束" with an English accessible name; the outline and the chip SHALL take no pointer input, SHALL be ignored by comment screenshots and SHALL follow the frame while it is dragged. At most one frame SHALL be in interact mode. Interact mode SHALL end on Escape as ordered below, when a primary-button press that starts no pan lands inside the canvas viewport on empty canvas or on another frame, when the journey list selection changes, when another frame enters interact mode, when another prototype is shown, when the interacting instance is no longer displayed, or when the inspector leaves UI Flow mode. Space or middle-button pans, presses on canvas controls (the zoom group, the zoom menu, the layout group, the minimap) and presses on the journey list that do not change its selected entry SHALL NOT end interact mode. Each Escape press handled by the canvas SHALL perform only the first applicable action in this order: close an open zoom menu or dialog, cancel a frame drag, cancel a marquee, end interact mode, clear the selection; Escape handled by the interacting frame's own window SHALL only end interact mode. On exit, when keyboard focus is inside the interacting frame, the inspector SHALL move it to the canvas viewport, which carries tabindex -1 and stays outside the tab order, before making the frame inert again; focus elsewhere SHALL stay where it is. The inspector SHALL then unpin the frame. A frame that is still live after being unpinned SHALL reload its plain route preview URL, so it shows its own route again and keeps no scroll position or state from the interaction; a frame demoted when it is unpinned SHALL drop its iframe instead. A frame whose iframe was loaded with prototypeFlowInteractive=true SHALL count as interacted for the snapshot refresh rule of flow-canvas-level-of-detail until it reloads its plain route preview URL. A comment placed on the interacting frame after it navigated in-frame SHALL keep the anchor of the frame's own route while its screenshot shows the page the frame displays, and the inspector documentation SHALL state this.

#### Scenario: Double-click enters and Escape leaves

- **WHEN** the reviewer double-clicks a route frame shown as a 120-pixel-wide snapshot, clicks a button inside it, and presses Escape
- **THEN** the frame becomes live with the interaction chip and the camera fits it, the click reaches the prototype, and after Escape the frame, still selected and live, reloads its plain route preview URL showing its own route and the canvas viewport has keyboard focus

#### Scenario: Panning keeps interact mode

- **WHEN** a frame is in interact mode and the reviewer drags on empty canvas while holding Space
- **THEN** the canvas pans and interact mode continues

#### Scenario: Comments after in-frame navigation keep the frame's route

- **WHEN** the interacting frame for route intake has navigated in-frame to review and the reviewer arms a comment capture and places a pin on the frame
- **THEN** the pin is anchored to route:intake and the comment screenshot shows the review page

#### Scenario: Only one frame interacts at a time

- **WHEN** frame A is in interact mode and the reviewer double-clicks frame B
- **THEN** frame A leaves interact mode and frame B enters it

#### Scenario: Zooming out keeps the interacting frame live

- **WHEN** a frame is in interact mode and the reviewer pinches to zoom out to 0.3 and then pans the frame out of the viewport with two-finger scrolling over the canvas
- **THEN** the frame's iframe is neither removed nor reloaded and interact mode continues

#### Scenario: Interacting frame keeps the camera

- **WHEN** the reviewer double-clicks a frame shown as a 120-pixel-wide snapshot while the opening fit is active, and the measured size of another route then changes from 375 x 812 to 375 x 1040
- **THEN** the camera stays fitted on the interacting frame and does not re-fit the whole flow

#### Scenario: Enter on a focused dialog button keeps its action

- **WHEN** one route frame is selected, the Reset Layout dialog is open with its confirm button focused, and the reviewer presses Enter
- **THEN** the reset is confirmed and interact mode does not start

##### Example: Enter routing on the canvas

| Selection | Keyboard focus | Enter result |
| ----- | ----- | ----- |
| one route frame | canvas viewport | that frame enters interact mode |
| one route frame | Reset Layout confirm button | reset confirmed, interact mode does not start |
| one route frame | journey list entry | entry selected, interact mode does not start |
| one flow-only node | canvas viewport | none |
| two route frames | canvas viewport | none |
| one route frame, IME composition active | canvas viewport | none |
| one route frame, Shift held | canvas viewport | none |
| one route frame, auto-repeated keydown | canvas viewport | none |

#### Scenario: Canvas controls do not end interact mode

- **WHEN** a frame is in interact mode and the reviewer presses Zoom in with the pointer
- **THEN** the zoom increases one step and interact mode continues

#### Scenario: Escape ends interact mode before clearing the selection

- **WHEN** an interacting frame is selected and the reviewer presses Escape while the canvas has keyboard focus
- **THEN** interact mode ends and the frame stays selected

##### Example: Escape handled by the canvas

| Zoom menu or dialog open | Frame drag | Marquee | Interacting frame | Selection | Escape result |
| ----- | ----- | ----- | ----- | ----- | ----- |
| yes | no | no | yes | 1 frame | menu or dialog closes, interact mode continues |
| no | yes | no | no | 1 frame | drag cancelled |
| no | no | yes | no | 1 frame | marquee cancelled, previous selection restored |
| no | no | no | yes | 1 frame | interact mode ends, frame stays selected |
| no | no | no | no | 1 frame | selection cleared |
| no | no | no | no | empty | not handled, key propagates |

#### Scenario: Escape returns focus to the canvas

- **WHEN** Escape pressed inside the interacting frame ends interact mode
- **THEN** document.activeElement is the canvas viewport and pressing Shift+1 fits the canvas without any click

---

### Requirement: Input routing while interacting

While a frame is in interact mode, its iframe SHALL accept pointer input and keyboard focus, losing the inert attribute, tabindex -1, aria-hidden and pointer-events none that other frames keep. Plain wheel input over the frame SHALL scroll the frame's content. The inspector SHALL register, on the frame's own window, a capture-phase keydown listener that ends interact mode on Escape, and wheel and Safari gesture listeners registered with capture true and passive false that turn ctrlKey, metaKey or altKey wheel input and pinch gestures over the frame into canvas zoom. Forwarded zoom input SHALL be anchored at the canvas point under the pointer, computed from the frame element's bounding rectangle and the frame-window client coordinates scaled by the ratio between the frame's rendered width and its layout width. The frame-window listener SHALL ignore keydown events whose isComposing is true or whose keyCode is 229, and such events SHALL NOT enter or end interact mode through the canvas shortcuts either. While keyboard focus is inside the interacting frame, keys other than Escape SHALL reach the prototype unchanged and SHALL NOT trigger canvas shortcuts. While interacting, the inspector SHALL set overscroll-behavior: contain on the frame document's root element and SHALL restore the previous value when interact mode ends. Pointer and wheel input on the canvas outside the frame SHALL keep panning and zooming the canvas. From entering interact mode until the frame has rendered its plain route preview URL again or its iframe has been removed, the inspector SHALL suspend size measurement for that frame through the measurement suspension of flow-canvas-level-of-detail, so its measurements update neither the frame size cache nor any persisted size or snapshot record; during that time the frame SHALL keep its pre-interaction box and route content taller than that box SHALL scroll inside the frame. All listeners and observers registered on the frame's window or document SHALL be removed when interact mode ends.

#### Scenario: Pinching over an interacting frame zooms the canvas

- **WHEN** the reviewer pinches on a trackpad while the pointer is over an interacting frame
- **THEN** the canvas zoom changes around the pointer and the prototype page inside the frame does not zoom

#### Scenario: Scrolling inside the frame scrolls the prototype

- **WHEN** the reviewer scrolls with two fingers over an interacting frame whose route content scrolls internally
- **THEN** the route content scrolls and the canvas camera does not move

#### Scenario: In-frame navigation keeps the frame box

- **WHEN** an interacting frame whose cached size is 375 x 812 navigates in-frame to a route whose content is 1040 pixels tall
- **THEN** the frame box, its edges and the persisted size record stay unchanged until interact mode ends

#### Scenario: IME cancel keeps interact mode

- **WHEN** the reviewer presses Escape to cancel an IME composition in an input inside an interacting frame
- **THEN** interact mode continues and the input keeps its text

---

### Requirement: Interactive route preview contract

The React and Vue scaffold prototype components and the storybook-template example prototype SHALL treat the query parameter prototypeFlowInteractive=true, combined with prototypeRoute=<route-id>, as an interactive preview: they SHALL render prototypeRoute first, SHALL let in-preview navigation change the rendered route, SHALL keep the prototype chrome hidden whenever prototypeFlowPreview=true is also present, and SHALL expose data-route with the currently rendered flow route id and data-prototype-interactive="true" on the [data-prototype-root] element. Without prototypeFlowInteractive=true, prototypeRoute previews SHALL keep the rendered route pinned. The prototype validator SHALL emit a warning (which, like every validator warning, becomes an error only under --strict-style) when a prototype component does not reference prototypeFlowInteractive, stating that UI Flow interact mode will stay on the pinned route for that prototype.

#### Scenario: Interactive preview navigates

- **WHEN** the storybook-template example prototype story is opened with prototypeFlowPreview=true, prototypeRoute=intake and prototypeFlowInteractive=true and the reviewer activates Submit intake
- **THEN** route review renders without prototype chrome and the [data-prototype-root] element's data-route equals review

#### Scenario: Pinned preview stays pinned

- **WHEN** the same story is opened with prototypeFlowPreview=true and prototypeRoute=intake but without prototypeFlowInteractive
- **THEN** activating Submit intake leaves intake rendered

#### Scenario: Scaffolds carry the contract

- **WHEN** the React and Vue scaffolds are generated
- **THEN** each prototype component references prototypeFlowInteractive and data-prototype-interactive and the validator reports no interact-mode warning for them

#### Scenario: Older prototypes only get a warning

- **WHEN** the validator checks a prototype component that does not reference prototypeFlowInteractive
- **THEN** the validator reports a warning about pinned interact mode and, without --strict-style, the exit code is unaffected by it

---

### Requirement: Current route indicator

While a frame is in interact mode, the inspector SHALL observe the data-route attribute of the [data-prototype-root] element in the frame's document, including an element mounted again after the observation started. When its value is the id of a route in the flow and differs from the frame's own route id, the interaction chip SHALL also show that route's title; values that are not route ids of the flow, including flow-only node ids, SHALL be ignored. The observer SHALL be disconnected when interact mode ends.

#### Scenario: Chip follows in-frame navigation

- **WHEN** an interacting frame for route intake navigates in-frame to route review
- **THEN** the chip shows the title of route review alongside "互動中 · Esc 結束"

#### Scenario: Unknown route values are ignored

- **WHEN** a prototype's data-route holds a value that is not a route id in its flow, such as a flow-only node id
- **THEN** the chip shows only "互動中 · Esc 結束"

---

### Requirement: Interact mode in journey focus

While a journey focus view is shown, double-clicking a route step instance, or pressing Enter while exactly one route step instance and nothing else is selected, SHALL enter interact mode for that instance only: the instance SHALL be identified by its step instance key "<stepIndex>:<nodeId>" defined by flow-journey-focus and pinned live by that key through the level-of-detail pinned slot, and other instances of the same route SHALL stay inert. Selecting another journey list entry, including "全部", with the pointer or with [ or ], SHALL first end interact mode with the exit behavior of Frame interact mode and only then switch the canvas to the selected view; an interacting instance whose instance key is not part of the selected view SHALL count as demoted when it is unpinned, so it drops its iframe without reloading it and without refreshing its route's snapshot.

#### Scenario: Only the double-clicked step instance interacts

- **WHEN** a journey focus view with steps intake, review, approval-decision and review is shown and the reviewer double-clicks the second review instance
- **THEN** the instance with key 3:review enters interact mode and is pinned, and the instance with key 1:review stays inert

#### Scenario: Switching journeys ends interact mode first

- **WHEN** a step instance is interacting in a journey focus view and the reviewer selects "全部" in the journey list with the pointer
- **THEN** interact mode ends and the listeners on the frame's window are removed before the canvas switches to the complete flow, and the instance drops its iframe without reloading it

#### Scenario: Bracket key ends interact mode first

- **WHEN** a step instance is interacting, keyboard focus is in the inspector document outside the frame, and the reviewer presses ]
- **THEN** interact mode ends before the next journey is shown
