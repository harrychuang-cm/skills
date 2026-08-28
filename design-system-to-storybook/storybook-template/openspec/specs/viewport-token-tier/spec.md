# viewport-token-tier Specification

## Purpose

TBD - created by archiving change 'complete-viewport-token-tier'. Update Purpose after archive.

## Requirements

### Requirement: Complete three-tier viewport token pairs

The system token layer SHALL define a complete width and height pair for each of the three viewport tiers: --sbt-sys-size-viewport-compact-width/height resolving to 375px/812px (phone), --sbt-sys-size-viewport-medium-width/height resolving to 768px/1024px (tablet), and --sbt-sys-size-viewport-wide-width/height resolving to 1280px/800px (desktop). Each system token SHALL reference a ref token; the ref layer SHALL therefore define --sbt-ref-size-800: 800px and --sbt-ref-size-1024: 1024px alongside the existing 375, 768, 812, and 1280 entries. The compact tier's values and semantics SHALL remain unchanged.

#### Scenario: Medium and wide tiers resolve full dimensions

- **WHEN** a stylesheet consumer reads the six viewport tokens from a rendered page using this token set
- **THEN** compact resolves 375px/812px, medium resolves 768px/1024px, and wide resolves 1280px/800px, each through a ref token indirection

##### Example: tier value table

| Tier    | Width token resolves to | Height token resolves to | Form factor |
| ------- | ----------------------- | ------------------------ | ----------- |
| compact | 375px                   | 812px                    | phone       |
| medium  | 768px                   | 1024px                   | tablet      |
| wide    | 1280px                  | 800px                    | desktop     |

---
### Requirement: Governance copy names the form-factor tiers

The size-token governance copy in the shared stories copy module SHALL describe the viewport tokens as three form-factor reference shells (compact = phone, medium = tablet, wide = desktop) consumed per prototype through the flow viewport declaration, SHALL keep the rule that viewport tokens are not responsive breakpoint tokens, and the Viewport And Regions documentation table SHALL list the width and height tokens of all three tiers.

#### Scenario: Docs page lists all six viewport tokens

- **WHEN** the size-token documentation story renders
- **THEN** the Viewport And Regions section lists compact, medium, and wide width and height rows with their form-factor labels, and states that the tiers are reference shells rather than breakpoints

---
### Requirement: Inspector runtime copies stay in sync with the skill asset

The .storybook prototype-inspector runtime files (preview.js and prototype-inspector.css) SHALL be byte-identical to the storybook-product-prototype skill asset copies after the upstream viewport-resolution change lands, and every future edit to either side SHALL be mirrored in the same commit. The template side SHALL NOT introduce behavior of its own into these files.

#### Scenario: Copies match after the sync

- **WHEN** the upstream skill asset inspector files are updated and this change syncs them
- **THEN** a byte comparison between each .storybook file and its skill asset counterpart reports no difference

#### Scenario: Divergence is caught upstream

- **WHEN** one side is edited without mirroring the other
- **THEN** the storybook-product-prototype smoke test's byte-diff assertion fails naming the divergent file
