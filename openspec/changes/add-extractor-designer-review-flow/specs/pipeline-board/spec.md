## MODIFIED Requirements

### Requirement: Pending decisions are read from a machine-readable review output

The design-system review generator SHALL provide a machine-readable output mode that emits its counts and the review items that await a designer, and that writes no file. The pending count the board reads SHALL equal the number of review items awaiting a designer, which is the number the review page itself shows, and SHALL equal the length of the emitted list of awaiting items. The board SHALL display each stage's pending decision count from that output rather than re-deriving it, so a single set of resolution rules governs both surfaces.

#### Scenario: The board and the review page show the same number

- **WHEN** the review page of a stage's package shows three items awaiting a designer
- **THEN** the machine-readable output reports a pending count of 3 with a list of 3 awaiting items, and the board displays 3 for that stage

#### Scenario: A stage shows how many decisions await the designer

- **WHEN** the machine-readable review output reports unresolved decisions for a stage
- **THEN** that stage displays the count of decisions awaiting the designer
