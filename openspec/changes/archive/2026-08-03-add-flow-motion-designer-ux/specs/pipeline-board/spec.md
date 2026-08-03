## MODIFIED Requirements

### Requirement: The board presents the pipeline as a horizontal flow inside an application shell

The rendered board SHALL use an application-shell layout: a left sidebar carrying section navigation and a state legend, a top bar carrying the project name and generation time, and a scrollable main panel area, styled as a fixed dark console theme on screen with a light print stylesheet. The main canvas SHALL present the pipeline as a horizontal flow: a source column followed by one column per stage in declaration order, with handoff edges drawn as inline SVG whose stroke color and line style distinguish the satisfied, blocked, and stale states, and with arrowheads drawn as explicit polygon geometry rather than SVG marker references. Each stage node SHALL show its title, its state, and its pending decision count when one exists, and SHALL be an in-page anchor to an always-rendered inspector panel below the flow that carries that stage's produced files, missing files, and run record, highlighted via the CSS :target selector.

The page MUST NOT contain a script element, a button element, or a transition rule. Keyframes rules are permitted solely to animate flow direction along edge lines: satisfied edges SHALL flow forward, stale edges SHALL flow forward slowly, blocked edges SHALL stay static, and no node, badge, or execution-state element may carry any animation. A prefers-reduced-motion media rule SHALL disable all animation and fall back to a static rendering in which the three edge states remain distinguishable by color and line style.

The existing self-containment scan patterns and sanitization allowlist SHALL remain unchanged. State label semantics SHALL remain unchanged; user-facing copy SHALL use designer-plain language, with technical identifiers such as error codes, command names, and file paths demoted to secondary text but still present.

#### Scenario: Broken handoffs are visually distinct in the flow

- **WHEN** a project renders with at least one satisfied edge and at least one blocked or stale edge
- **THEN** the flow canvas contains an inline svg element
- **AND** the edge geometry carries distinct per-state class names so satisfied, blocked, and stale edges are visually distinguishable

#### Scenario: A stage node leads to its inspector panel

- **WHEN** a reader follows a stage node anchor
- **THEN** an inspector panel for that stage exists in the same document with its produced files, missing files, and run record
- **AND** the panel gains a highlight through a :target CSS rule without any JavaScript

#### Scenario: Motion carries direction, never execution progress

- **WHEN** the board renders a satisfied edge, a stale edge, and a blocked edge
- **THEN** the animation declarations bind only to the satisfied and stale edge classes
- **AND** the blocked edge class and every node, badge, and execution-state element carry no animation

#### Scenario: Reduced motion falls back to static

- **WHEN** the reader's system requests reduced motion
- **THEN** a prefers-reduced-motion rule disables all animation
- **AND** the three edge states remain distinguishable by color and line style

#### Scenario: The shell adds no execution surface

- **WHEN** the board is rendered with the application-shell layout
- **THEN** the output contains no script element, no button element, and no transition rule
- **AND** the unchanged self-containment scan accepts the output
