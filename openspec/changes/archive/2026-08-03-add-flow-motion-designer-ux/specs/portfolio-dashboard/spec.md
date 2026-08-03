## MODIFIED Requirements

### Requirement: The overview presents projects inside an application shell

The rendered overview SHALL use an application-shell layout: a left sidebar listing every project entry with a status indicator derived from its attention tone or error state and an in-page anchor to that project's card, a top bar carrying the portfolio name, generation time, and the readable and failed counts, and a main panel area laid out as a card grid, styled as a fixed dark console theme on screen with a light print stylesheet. Card content and board links SHALL keep their existing semantics. In-page anchors MUST NOT count as board links: the number of links whose target is a board file SHALL equal the number of successfully aggregated projects, and an error card's own container SHALL contain no anchor element.

The page MUST NOT contain a script element, a button element, a keyframes rule, or a transition rule, and the existing self-containment scan patterns and sanitization allowlist SHALL remain unchanged.

Label semantics SHALL remain unchanged; user-facing copy SHALL use designer-plain language. Each card SHALL lead with what the designer should do or know, and error cards SHALL lead with a plain-language title mapped from the stable error code by the renderer, followed by the reason, with the stable error code itself demoted to secondary text but still present verbatim. Codes without a mapping SHALL fall back to showing the reason and the code.

#### Scenario: Sidebar lists every project with a status indicator

- **WHEN** a portfolio renders with both successful and failed project entries
- **THEN** the sidebar contains one entry per project with a status indicator
- **AND** each sidebar entry is an in-page anchor to that project's card section

#### Scenario: In-page anchors do not become board links

- **WHEN** the overview renders one successful project and one error project inside the application shell
- **THEN** exactly one link targets a board file
- **AND** the error card's container contains no anchor element

#### Scenario: Error cards lead with plain language

- **WHEN** a project fails aggregation because its root directory does not exist
- **THEN** the error card's most prominent text is a plain-language title a designer can act on
- **AND** the stable error code still appears verbatim as secondary text

#### Scenario: The shell adds no execution or animation surface

- **WHEN** the overview is rendered with the application-shell layout
- **THEN** the output contains no script element, no button element, no keyframes rule, and no transition rule
- **AND** the unchanged self-containment scan accepts the output
