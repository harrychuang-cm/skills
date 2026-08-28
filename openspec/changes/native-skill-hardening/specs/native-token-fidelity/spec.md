## ADDED Requirements

### Requirement: Accurate token export structure

The token consumption section SHALL describe the DTCG export's actual structure in three layers: the key is a prototype role alias, the value is the prototype CSS fallback rather than the project's own token value, and the originating project token name and prefix live in the entry's extensions. When the handoff also carries a Token Binding record naming the project's tokens, that record SHALL take precedence and the export's value SHALL be used only as the fallback for a role the project does not define.

#### Scenario: Export and token binding both present

- **WHEN** the export declares an accent role with a neutral fallback while Token Binding names the project's own primary token
- **THEN** the native token is derived from the project token named in Token Binding, and the export's fallback is not treated as the project's value

### Requirement: Type scaling and unit rules

The token consumption section SHALL require deciding, for every dimension token, whether it carries a text size or a spacing or sizing value, because the export's dimension type does not distinguish them. Text sizes SHALL map to relative text styles on iOS and to scalable pixel units on Android so system font scaling applies; spacing and sizing SHALL map to fixed values and to density-independent units. The deciding evidence SHALL be the token's role name in the Token Binding record, and an undecidable token SHALL stop for a question.

#### Scenario: Font size token

- **WHEN** a dimension token's role names a font size
- **THEN** it is expressed as a relative text style on iOS and in scalable pixel units on Android, so it grows with the user's font-size setting

#### Scenario: Spacing token

- **WHEN** a dimension token's role names spacing or a radius
- **THEN** it is expressed in density-independent units and does not scale with the font-size setting

##### Example: unit selection

| Token role | iOS | Android |
| ---------- | --- | ------- |
| font-md-size | relative text style | sp |
| space-4 | fixed value | dp |
| radius-card | fixed value | dp |

### Requirement: Dark mode token requirement

The token consumption section SHALL state that the export carries a single value per token while native targets need light and dark values, and SHALL require carrying both through the platform's appearance mechanism — an asset catalog with light and dark appearances on iOS, light and dark color schemes on Android. When the handoff provides no dark value for a color token, the agent SHALL stop and ask rather than deriving one.

#### Scenario: Color token without a dark value

- **WHEN** the handoff provides one value for a surface color and the app supports dark mode
- **THEN** the agent asks for the dark value instead of computing a darkened variant

### Requirement: Token bootstrap delegation

The token consumption section SHALL cover the case where the handoff ships no DTCG export but a prototype token source exists, and SHALL delegate it by name to the frontend-product-implementation token-bootstrap reference, which already defines SwiftUI and Compose output formats and the prioritized source discovery order. The delegation SHALL note that when that sibling skill is absent, the agent follows the same procedure manually and records the substitution.

#### Scenario: No DTCG export but prototype tokens exist

- **WHEN** the handoff has no token export while the prototype repo holds generated token files
- **THEN** the agent follows the token-bootstrap discovery order and porting procedure instead of stopping as if no source existed
