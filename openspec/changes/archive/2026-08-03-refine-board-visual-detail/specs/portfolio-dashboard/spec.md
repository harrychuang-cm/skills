## ADDED Requirements

### Requirement: The overview and the project boards share one design token block byte-for-byte

The rendered overview SHALL declare the same design token block the per-project board declares, delimited by the same start and end marker comments, with identical token names and identical values. The checker SHALL extract the delimited block from one generated project board and from the overview produced in the same aggregation and SHALL assert the two extracted strings are equal, so a drift in either renderer fails the check rather than shipping two divergent themes. The token block SHALL introduce no keyframes rule, keeping the overview animation-free.

#### Scenario: Both renderers emit an identical token block

- **WHEN** one aggregation produces the overview and the project boards in the same output directory
- **THEN** the token block extracted from a project board and the token block extracted from the overview are equal strings

#### Scenario: The shared token block adds no animation to the overview

- **WHEN** the overview renders with the shared token block
- **THEN** the overview contains no keyframes rule

### Requirement: Link color is neutral and card content is ranked by visual weight

The overview SHALL use a neutral link color token for anchor text, distinct in value from every status tone token, so a link is never read as a healthy-status signal. Each project card SHALL rank its content by visual weight: the attention item SHALL be the heaviest element of the card, the project name SHALL sit above it as identification, and the current stage line, run lines, and board link SHALL render as progressively lighter secondary text. Attention counts SHALL render with tabular numerals. Every focusable element SHALL receive a visible focus indicator through a focus-visible rule. All existing attention labels, error titles, and error codes SHALL remain unchanged, and error cards SHALL continue to contain no anchor element.

#### Scenario: A link is not mistaken for a status

- **WHEN** the overview renders its anchors
- **THEN** the global anchor rule uses the neutral link token
- **AND** the global anchor rule does not use the healthy status tone token

#### Scenario: Card content is ranked

- **WHEN** a successful project card renders
- **THEN** the attention item carries the heaviest visual weight in the card
- **AND** the current stage line, run lines, and board link render as lighter secondary text

#### Scenario: Existing labels and error card structure are preserved

- **WHEN** the overview renders both successful and failed project entries
- **THEN** every existing attention label, error title, and error code string is unchanged
- **AND** the error card container contains no anchor element
