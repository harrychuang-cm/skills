## ADDED Requirements

### Requirement: The board presents the pipeline as a horizontal flow inside an application shell

The rendered board SHALL use an application-shell layout: a left sidebar carrying section navigation and a state legend, a top bar carrying the project name and generation time, and a scrollable main panel area, styled as a fixed dark console theme on screen with a light print stylesheet. The main canvas SHALL present the pipeline as a horizontal flow: a source column followed by one column per stage in declaration order, with handoff edges drawn as inline SVG whose stroke color and line style distinguish the satisfied, blocked, and stale states, and with arrowheads drawn as explicit polygon geometry rather than SVG marker references. Each stage node SHALL show its title, its state, and its pending decision count when one exists, and SHALL be an in-page anchor to an always-rendered inspector panel below the flow that carries that stage's produced files, missing files, and run record, highlighted via the CSS :target selector. The page MUST NOT contain a script element, a button element, a keyframes rule, or a transition rule, and the existing self-containment scan patterns, sanitization allowlist, and state label strings SHALL remain unchanged.

#### Scenario: Broken handoffs are visually distinct in the flow

- **WHEN** a project renders with at least one satisfied edge and at least one blocked or stale edge
- **THEN** the flow canvas contains an inline svg element
- **AND** the edge geometry carries distinct per-state class names so satisfied, blocked, and stale edges are visually distinguishable

#### Scenario: A stage node leads to its inspector panel

- **WHEN** a reader follows a stage node anchor
- **THEN** an inspector panel for that stage exists in the same document with its produced files, missing files, and run record
- **AND** the panel gains a highlight through a :target CSS rule without any JavaScript

#### Scenario: The shell adds no execution or animation surface

- **WHEN** the board is rendered with the application-shell layout
- **THEN** the output contains no script element, no button element, no keyframes rule, and no transition rule
- **AND** the unchanged self-containment scan accepts the output
