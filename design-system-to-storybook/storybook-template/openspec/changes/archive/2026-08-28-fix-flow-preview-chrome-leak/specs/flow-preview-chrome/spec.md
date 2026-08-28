## ADDED Requirements

### Requirement: Flow preview mode is entered by prop or query parameter

The example prototype SHALL treat flow preview mode as active when the `isFlowPreview` prop is true, or when the `prototypeFlowPreview=true` query parameter is present in the page URL. Both signals SHALL resolve to the same rendering behavior.

#### Scenario: Iframe preview enters flow preview via query parameter

- **WHEN** the example prototype story is loaded with `?prototypeFlowPreview=true&prototypeRoute=<route-id>`
- **THEN** the component renders in flow preview mode exactly as it does when mounted with `isFlowPreview` set to true

### Requirement: Flow preview hides example prototype chrome

In flow preview mode the example prototype SHALL NOT render its own chrome — the topbar (request id, route title, status badge) and the route tab button row. Outside flow preview mode the topbar and tabs SHALL render unchanged, and route switching via the tabs SHALL keep working. Route body content SHALL render in both modes.

#### Scenario: Static Flow card renders without chrome

- **WHEN** the Static Flow export mounts the example prototype with `isFlowPreview` set to true
- **THEN** the rendered route card contains no topbar and no route tab buttons, only the route body content

#### Scenario: Standalone story keeps chrome

- **WHEN** the example prototype story is rendered without the `isFlowPreview` prop and without the `prototypeFlowPreview` query parameter
- **THEN** the topbar and route tabs render as before and clicking a tab switches the visible route

### Requirement: Defensive CSS chrome hiding

The example prototype stylesheet SHALL contain rules scoped under the flow-preview root modifier class that hide the topbar and tabs class names, so chrome markup that still renders inside a flow-preview root is hidden by the stylesheet alone.

#### Scenario: Chrome markup inside a flow-preview root is hidden by CSS

- **WHEN** topbar or tabs elements carrying their scaffolded class names render inside a root element carrying the flow-preview modifier class
- **THEN** those elements are hidden by the stylesheet without any component code change

### Requirement: Prototype authoring guide declares the chrome rule

The prototypes README SHALL state that flow preview mode (the `isFlowPreview` prop or the `prototypeFlowPreview=true` query parameter) hides the prototype's own chrome — its header/topbar and route navigation — so flow cards and iframe previews show only real page content.

#### Scenario: Authoring guide carries the chrome rule

- **WHEN** a reader consults the prototypes README authoring rules
- **THEN** the rules contain an item requiring prototypes to hide their own chrome in flow preview mode
