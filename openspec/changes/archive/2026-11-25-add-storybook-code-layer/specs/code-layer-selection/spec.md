## Purpose

Define how Code Layer is switched on inside a Storybook dev session and how a person points at, selects and navigates rendered elements. Selection follows the conventions of a design tool so there is little to relearn, and it never changes or triggers the story being inspected.

## ADDED Requirements

### Requirement: Development-only activation

Code Layer SHALL exist only while Storybook runs in development mode. Its preset SHALL contribute no manager entry, no preview annotation and no dev-server route in any other mode. A toolbar toggle SHALL switch the tool on and off through a Storybook global named `codeLayer`, so the state is reflected in the URL and restored on reload.

#### Scenario: A static build contains no Code Layer code

- **WHEN** the project is built with `storybook build`
- **THEN** no emitted script, stylesheet or HTML file contains Code Layer runtime code, its dev API path or its session header name

#### Scenario: The toggle is restored after a reload

- **WHEN** a person turns the toggle on and reloads the browser tab
- **THEN** the tool is on again for the same story without further action

### Requirement: Effective state

The preview SHALL compute one effective state — `off`, `active` or `suspended` with a reason — and the manager SHALL render only from that state. The state SHALL be `active` only when the `codeLayer` global is true, the preview is framed by a same-origin Storybook manager that is itself the top window, a story (not a docs page) is rendered and visible, and no other inspection tool of the project is engaged. While the state is not `active`, the tool SHALL remove its pointer shield, keyboard guards, outlines and every live preview, and SHALL keep staged changes and the remembered selection. A suspended tool SHALL show its reason on the toolbar toggle and in the panel.

#### Scenario: Suspended states name their reason

- **WHEN** the toggle is on and the state cannot be `active`
- **THEN** the toolbar toggle stays pressed, shows a warning, and the reason is readable on the toggle and in the panel

##### Example: reasons

| Situation | Effective state | Reason shown |
| --- | --- | --- |
| A docs page is open | suspended | not a story view |
| The project's Figma export mode is on | suspended | another tool is active |
| The prototype inspector shows a non-story mode | suspended | another tool is active |
| The preview is opened directly as `iframe.html` | off | (tool not started) |
| The manager is framed by a page from another origin | off | (tool not started) |

#### Scenario: Leaving and returning keeps the work

- **WHEN** the state goes from `active` to `suspended` and back to `active`
- **THEN** every staged change is previewed again and the remembered selection is selected again

### Requirement: Capability check

Before becoming `active` the preview SHALL verify that the browser provides the platform features the tool depends on (top-layer popover, constructable and adopted stylesheets, and SHA-256 digests through Web Crypto). When a feature is missing the state SHALL be `suspended` with a reason that names the missing feature, and no part of the tool SHALL run.

#### Scenario: A missing feature suspends the tool

- **WHEN** the toggle is turned on in a browser without adopted stylesheets
- **THEN** the state is `suspended`, the reason names adopted stylesheets, and no shield or outline is added to the page

### Requirement: Hover and selection overlay

While `active`, the tool SHALL outline the element under the pointer and the selected element in an overlay that is rendered in the browser top layer and is not a descendant of the story root. The overlay SHALL NOT add, remove or modify any node or attribute inside the story root. An outline SHALL follow the element's own two-dimensional transform, and SHALL follow the element when the page scrolls or resizes. The selection outline SHALL carry a label with the element's name and its width and height, and a control that copies the object reference.

#### Scenario: The story DOM is untouched

- **WHEN** the tool is switched on, an element is hovered and selected, and the tool is switched off
- **THEN** the serialized markup of the story root is identical before and after

#### Scenario: A rotated element gets a rotated outline

- **WHEN** the selected element has a rotation transform
- **THEN** the selection outline is drawn with the same rotation and the element's untransformed width and height

### Requirement: Selectable elements

An element SHALL be selectable when it is inside the story root, generates a box, and is not part of any tool's own chrome. Wrappers that generate no box SHALL be skipped as if their children belonged to their parent. Text nodes SHALL NOT be selectable. Every selectable element SHALL have a label: the component name and variant when it is a component root, the element part of its class name when it follows the project's class prefixes, and its tag name otherwise.

#### Scenario: Box-less wrappers are transparent to selection

- **WHEN** a story is wrapped by an element with `display: contents`
- **THEN** that wrapper is never hovered, selected or listed as a parent or child

### Requirement: Click selects at the current nesting level

A plain click SHALL select the outermost component root that contains the clicked element, or the clicked element itself when no component root contains it. When an element is already selected and the click lands inside that element's parent, the click SHALL instead select the child of that parent that contains the clicked element, so repeated clicks stay at the level the person navigated to. A click on empty space SHALL clear the selection. A click SHALL NOT activate the clicked control or follow a link.

#### Scenario: First click selects the component root

- **WHEN** nothing is selected and a person clicks text deep inside a component
- **THEN** the component root is selected

#### Scenario: Clicks stay at the navigated level

- **WHEN** a child of a component is selected and the person clicks another child of the same component
- **THEN** that other child is selected, not the component root

### Requirement: Drill-in and parent navigation

A double-click SHALL select the child of the current selection that contains the pointer, one level down. With an element selected, Enter SHALL select its first selectable child, Shift+Enter SHALL select its selectable parent, Tab SHALL select its next selectable sibling and Shift+Tab its previous one, wrapping at the ends. Escape SHALL clear the selection. A navigation that has no target SHALL leave the selection unchanged.

#### Scenario: Keyboard navigation through a component

- **WHEN** a component root with three child elements is selected and the person presses Enter, Tab, Tab, Tab, Shift+Enter
- **THEN** the selection moves to the first child, the second, the third, the first again, and back to the component root

#### Scenario: Shift+Enter stops at the story root

- **WHEN** the selected element has no selectable parent inside the story root
- **THEN** Shift+Enter leaves the selection unchanged

### Requirement: Deep select

A click with the platform's primary modifier key held (Command on macOS, Control elsewhere) SHALL select the deepest selectable element under the pointer, regardless of the current nesting level. Deep select SHALL be able to reach elements that do not receive pointer events.

#### Scenario: An element with pointer-events none is reachable

- **WHEN** a person holds the primary modifier and clicks on an SVG decoration whose `pointer-events` is `none`
- **THEN** that SVG element is selected

### Requirement: Story isolation while active

While `active`, key presses without Control, Meta or Alt SHALL NOT reach the story or Storybook's single-key shortcuts, except when the event starts inside the tool's own controls; key combinations with Control, Meta or Alt SHALL pass through unchanged. Pointer input over the story SHALL NOT put story elements into hover or active states and SHALL NOT trigger their handlers. Scrolling and zooming SHALL keep working. When the tool is not `active`, it SHALL hold no event listener on the page.

#### Scenario: Single keys do nothing to the story or to Storybook

- **WHEN** the tool is active and the person presses `M`, `1`, Space and Tab with the pointer over the story
- **THEN** Storybook's measure tool and panel focus do not change, no story button is activated, and focus does not move to a story control

#### Scenario: Modifier shortcuts still work

- **WHEN** the tool is active and the person presses Alt+S
- **THEN** Storybook toggles its sidebar as usual

### Requirement: Selection survives updates

The tool SHALL remember a selection as a descriptor made of the nearest component anchor (component name, variant and occurrence), the path from that anchor, and a signature of the element. After a hot update, a story re-render, an args change or a globals change the tool SHALL resolve the descriptor again and keep the element selected; when it cannot be resolved the tool SHALL report the selection as lost and clear it. The last selection of each story SHALL be restored after a browser reload in the same tab. Switching to another story SHALL clear the current selection without forgetting the per-story memory.

#### Scenario: A hot update keeps the selection

- **WHEN** an element is selected and its component stylesheet is hot-updated
- **THEN** the same element is still selected and its outline is drawn

#### Scenario: A reload restores the selection

- **WHEN** an element is selected and the browser tab is reloaded
- **THEN** the same element is selected again once the story has rendered
