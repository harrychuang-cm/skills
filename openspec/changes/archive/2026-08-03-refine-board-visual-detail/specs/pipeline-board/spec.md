## ADDED Requirements

### Requirement: The board's visual system derives from a named token block

The rendered board SHALL declare a design token block delimited by a start marker comment and an end marker comment inside its root custom-property scope, covering a spacing scale, a corner-radius scale, three elevation levels, a focus color, a link color, and a low-alpha border variant for each of the four status tones. Every spacing and corner-radius value used by the board's container styling SHALL reference a token from that block instead of an inline literal. Container styling SHALL express three distinct elevation levels — primary panels, secondary cards, and embedded blocks — using background color and box-shadow only, and the print stylesheet SHALL reset every elevation to no shadow. The token block SHALL NOT introduce any external resource, data URI, or font reference, so the unchanged self-containment scan continues to accept the output.

#### Scenario: The token block is present and drives container styling

- **WHEN** the board renders
- **THEN** the output contains the delimited token block declaring the spacing scale, the radius scale, the three elevation levels, the focus color, the link color, and the four per-tone border variants
- **AND** the primary panel, secondary card, and embedded block styles reference tokens from that block

#### Scenario: Elevation never survives into print

- **WHEN** the board is rendered and its print stylesheet applies
- **THEN** every elevation is reset to no shadow
- **AND** the light print theme and the hidden sidebar remain unchanged

#### Scenario: The token block carries no external reference

- **WHEN** the board renders with the token block in place
- **THEN** the unchanged self-containment scan accepts the output
- **AND** the output contains no url reference, data URI, or external font declaration

### Requirement: Flow nodes carry their own state signal

Each node in the flow canvas SHALL carry a per-tone class derived from the tone its badge already uses, introducing no new state derivation. That class SHALL render a status-color edge marker on the node so a reader locates a problem stage without reading its label text. Node geometry and the flow canvas coordinate constants SHALL remain unchanged. The base flow-node rule SHALL remain a standalone rule carrying no animation, and the number of animation declarations bound to the flow animation SHALL remain exactly two.

#### Scenario: A problem stage is identifiable without reading text

- **WHEN** a project renders with stages in differing states
- **THEN** each flow node carries a per-tone class matching the tone of its own badge
- **AND** the node styling renders a status-color edge marker for that tone

##### Example: tone class follows badge tone

| Stage condition | Badge tone | Node class suffix |
| --------------- | ---------- | ----------------- |
| verified | ok | ok |
| produced but not verified | warn | warn |
| run awaiting human confirmation | stop | stop |
| not started | idle | idle |

#### Scenario: Nodes stay motionless

- **WHEN** the board renders with animated flow edges
- **THEN** the base flow-node rule exists as a standalone rule containing no animation
- **AND** the number of animation declarations bound to the flow animation is exactly two

### Requirement: Keyboard focus, numerals, and label typography are explicitly styled

Every focusable element in the board SHALL receive a visible focus indicator through a focus-visible rule using the focus token. Numeric text — snapshot times, pending decision counts, and run timestamps — SHALL render with tabular numerals so values do not shift horizontally between states. Labels written in Chinese SHALL NOT apply a Latin small-caps convention: their styling SHALL carry no text-transform and no widened letter spacing, and SHALL establish hierarchy through size, weight, and color instead. Scrollable regions SHALL use a thin scrollbar matching the dark theme, and the document SHALL define its own text selection colors. All existing state label strings SHALL remain unchanged.

#### Scenario: Keyboard navigation is visible

- **WHEN** a reader moves focus with the keyboard through the sidebar links, the flow nodes, and the in-page anchors
- **THEN** each focused element renders a visible focus indicator derived from the focus token

#### Scenario: Numbers do not shift between states

- **WHEN** the board renders snapshot times, pending decision counts, and run timestamps
- **THEN** those values render with tabular numerals

#### Scenario: Chinese labels use Chinese typographic convention

- **WHEN** the board renders its sidebar labels, panel headings, and field labels
- **THEN** those rules carry no text-transform and no widened letter spacing
- **AND** every existing state label string is unchanged
