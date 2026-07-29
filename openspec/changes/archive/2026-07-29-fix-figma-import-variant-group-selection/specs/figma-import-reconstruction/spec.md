## ADDED Requirements

### Requirement: Variant group selection never replaces the payload root with a nested component

When the import payload declares artifact kind `component` and carries no root component reference, the plugin SHALL choose what to reconstruct using the payload `componentTitle` as the authoritative signal, and SHALL NOT allow a variant group nested below the payload root to become the imported root node unless that group's component identity matches `componentTitle`.

Name matching SHALL take precedence over any variant-count threshold: a variant group whose normalized component identity matches the normalized `componentTitle` SHALL be selected regardless of how many variants it contains. The variant-count threshold SHALL apply only when no group matches `componentTitle`, and SHALL then be restricted to groups located at the payload root level.

When no group qualifies under either rule, the plugin SHALL reconstruct the payload's actual node tree.

Variant group selection SHALL NOT throw. When no group qualifies, selection SHALL return a no-selection result so the caller reconstructs the tree.

#### Scenario: Composite component containing nested variants of another component

- **WHEN** a payload declares artifact kind `component`, carries no root component reference, has `componentTitle` naming the composite component, and its tree contains one variant reference matching `componentTitle` plus multiple variant references belonging to a different nested component
- **THEN** the plugin selects the group matching `componentTitle` and the imported result contains the payload's frames, text nodes, and vector nodes rather than the nested component's variant set

##### Example: Broker Import Menu containing three Icon variants

- **GIVEN** `componentTitle` is `Broker Import Menu`, the tree contains variant reference `Broker Import Menu/with-timestamp` and variant references `Icon/chevronDown-xs`, `Icon/refresh-xs`, `Icon/edit-xs`, and the payload root subtree contains 6 frames, 5 text nodes, and 3 vector nodes
- **WHEN** the payload is imported
- **THEN** the imported result contains 6 frames, 5 text nodes, and 3 vector nodes, and is not a component set named `Icon`

#### Scenario: Single-variant group matching the component title is selected

- **WHEN** a payload's tree contains exactly one variant group whose normalized identity matches the normalized `componentTitle`, and that group contains a single variant
- **THEN** the plugin selects that group instead of discarding it for failing a variant-count threshold

#### Scenario: All-variants story still produces a component set

- **WHEN** a payload declares artifact kind `component`, carries no root component reference, and its root-level variant group matching `componentTitle` contains two or more variants
- **THEN** the plugin produces a component set from that group, preserving the existing behavior for stories that present multiple variants of one component

#### Scenario: Nested group is rejected when no group matches the component title

- **WHEN** no variant group's normalized identity matches the normalized `componentTitle`, and every group containing two or more variants is nested below the payload root
- **THEN** the plugin selects no group and reconstructs the payload's actual node tree

#### Scenario: Selection outcome is reported in import statistics

- **WHEN** the plugin selects a variant group or declines to select one
- **THEN** the import statistics record the selected group identity, or record that no group was selected, together with the identities of the candidate groups that were skipped

### Requirement: Variant group selection is testable without the Figma runtime

The variant group selection rule SHALL be implemented as a pure function that accepts the candidate variant groups and the payload `componentTitle`, and returns the selected group or a no-selection result together with the skipped candidate identities. The function SHALL NOT call Figma runtime APIs.

#### Scenario: Selection rule exercised in pure function tests

- **WHEN** the plugin's pure function test suite runs
- **THEN** it exercises name-matched selection, single-variant matched selection, root-level threshold fallback, and nested-group rejection without loading the Figma plugin runtime
