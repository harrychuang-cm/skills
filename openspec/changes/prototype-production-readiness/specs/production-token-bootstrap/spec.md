## MODIFIED Requirements

### Requirement: Prototype token source discovery order

The token-bootstrap reference SHALL define a prioritized discovery order for prototype-side token sources and SHALL require the agent to record which source was selected together with its file-level evidence. The order SHALL be: (1) a docs/TOKENS.json W3C DTCG export produced by the prototype handoff when present, (2) token files in the prototype Storybook repo produced by design-system-to-storybook, (3) the design-system-extractor token architecture and component token spec documents, (4) Figma Variables exports. The reference SHALL forbid inventing token values that appear in no discovered source.

#### Scenario: DTCG export available

- **WHEN** the handoff folder contains docs/TOKENS.json alongside generated Storybook token files
- **THEN** the agent selects TOKENS.json as the source of truth and records the chosen source and its path in the implementation notes

#### Scenario: Multiple sources available without a DTCG export

- **WHEN** the prototype Storybook repo contains generated token files and an older design-system-extractor package also exists
- **THEN** the agent selects the Storybook token files as the source of truth and records the chosen source and its path in the implementation notes

#### Scenario: No source found

- **WHEN** none of the four source types can be located
- **THEN** the agent switches to the reverse-inventory fallback procedure instead of fabricating token values

### Requirement: Target styling technology adaptation

The token-bootstrap reference SHALL require selecting the token output format from repo evidence of the production styling stack, and SHALL define at minimum these mappings: CSS custom properties for plain CSS or CSS-in-JS stacks, Tailwind theme configuration for Tailwind repos, SCSS variables or maps for SCSS repos, a typed theme object for React Native or similar non-CSS JavaScript runtimes, SwiftUI Color and Font extensions or an asset-catalog-backed token enum for SwiftUI targets, and a Kotlin theme object or Compose MaterialTheme extension for Jetpack Compose targets. Token files SHALL be placed following the target framework's native conventions. When the styling stack is ambiguous or mixed, the agent SHALL stop and ask which format to use before writing token files.

#### Scenario: Tailwind repo detected

- **WHEN** the production root contains a Tailwind configuration consumed by the build
- **THEN** ported tokens are expressed as Tailwind theme extensions while preserving the layered token names

#### Scenario: SwiftUI target

- **WHEN** the production target is a SwiftUI app and a docs/TOKENS.json DTCG export exists
- **THEN** ported tokens are expressed as SwiftUI Color and Font extensions or an asset-catalog-backed token enum derived from the DTCG values, preserving the layered token names

#### Scenario: Compose target

- **WHEN** the production target is a Jetpack Compose app
- **THEN** ported tokens are expressed as a Kotlin theme object or MaterialTheme extension, preserving the layered token names

#### Scenario: Ambiguous styling stack

- **WHEN** the repo shows both SCSS variables and CSS custom properties with no dominant convention
- **THEN** the agent stops and asks the user to choose the token output format before writing files
