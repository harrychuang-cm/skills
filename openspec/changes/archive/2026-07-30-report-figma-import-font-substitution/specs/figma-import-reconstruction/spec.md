## ADDED Requirements

### Requirement: Font substitution is recorded and surfaced

When the plugin loads a font family or style other than the one the payload requested, it SHALL record that substitution in the import statistics as a structured entry. Each entry SHALL identify the text node path, the requested family, the requested weight, the family and style actually loaded, and every style name attempted for that node.

The attempted style names SHALL include the styles tried during available-style resolution, not only the candidate style names computed before that resolution. The resolution path SHALL return the attempted style names to its caller rather than having the reporting layer reconstruct them.

When no substitution occurs, the substitution list SHALL be empty and the plugin UI summary SHALL NOT display substitution text. When one or more substitutions occur, the plugin UI summary SHALL display the substitution count alongside the node and variable counts.

Recording a substitution SHALL NOT throw and SHALL NOT abort the import. A missing field SHALL be recorded as empty and the import SHALL continue.

#### Scenario: Requested family loads and nothing is recorded

- **WHEN** every text node in a payload resolves to the family and style the payload requested
- **THEN** the import statistics substitution list is empty and the UI summary contains no substitution text

#### Scenario: Substituted node is recorded with what was requested and what was loaded

- **WHEN** a text node requests a family that cannot be loaded and the plugin falls back to a later family in the CSS stack
- **THEN** the substitution list contains one entry for that node identifying the requested family, the requested weight, the loaded family, and the loaded style

##### Example: Japanese link text substituted to a hosted fallback

- **GIVEN** a text node at path `md-text-link-demo-body/text-link/inline` requests family `Hiragino Kaku Gothic ProN` at weight 700, and that family cannot be loaded
- **WHEN** the plugin resolves the font and loads `Noto Sans JP` style `Bold`
- **THEN** the substitution list contains an entry naming requested family `Hiragino Kaku Gothic ProN`, requested weight 700, loaded family `Noto Sans JP`, and loaded style `Bold`

#### Scenario: Attempted styles include available-style resolution attempts

- **WHEN** a font family provides W-number style names, the candidate style names all fail, and available-style resolution attempts a W-number style that also fails
- **THEN** the recorded attempted style names for that node include the attempted W-number style, not only the candidate style names

#### Scenario: Substitution count appears in the UI summary

- **WHEN** an import substitutes fonts on four text nodes
- **THEN** the plugin UI summary displays the substitution count together with the created node and variable counts

### Requirement: Widespread font load failure is reported as an environment fault

When two or more distinct font families each fail to load every style during one import run, the plugin SHALL report that local fonts cannot be loaded at all, and SHALL state that the local font service may be unavailable and that restarting Figma or checking font access permissions is the corrective action. When only one family fails, the plugin SHALL NOT make that determination and SHALL report the individual family as unavailable.

The determination SHALL be a pure function of the recorded substitutions for the run, taking the substitution entries and returning whether the run is an environment fault together with the distinct family names involved. It SHALL NOT call Figma runtime APIs and SHALL NOT probe network endpoints.

#### Scenario: Two failing families are reported as an environment fault

- **WHEN** one import run substitutes fonts for text nodes requesting `Hiragino Kaku Gothic ProN` and for text nodes requesting `Hiragino Mincho ProN`, and every style of both families failed to load
- **THEN** the report states that local fonts cannot be loaded, names both families, and recommends restarting Figma or checking font access permissions

#### Scenario: A single missing family is not an environment fault

- **WHEN** one import run substitutes fonts only for text nodes requesting a single family that is not installed
- **THEN** the report names that family as unavailable and does not claim that local fonts cannot be loaded

#### Scenario: Determination is testable without the Figma runtime

- **WHEN** the plugin's pure function test suite runs
- **THEN** it exercises the zero-substitution, single-family, and multi-family cases without loading the Figma plugin runtime
