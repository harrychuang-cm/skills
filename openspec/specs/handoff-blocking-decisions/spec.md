# handoff-blocking-decisions Specification

## Purpose

Handoff blocking decisions define how a prototype handoff declares the decisions that must be answered before any implementation starts, how that list coexists with the decision register, and how handoff-ready validation refuses a handoff that still carries one. The capability exists so that the receiving team never has to answer a blocking decision on the author's behalf.

## Requirements

### Requirement: Blocking decisions gate handoff readiness

validate_prototype.py SHALL treat unresolved blocking decisions in `docs/PRODUCTION_HANDOFF.md` as a handoff-ready failure. The blocking sub-section is the deepest heading whose text contains 「擋開工」 without a preceding negation (不, 不會, 沒有, 無). Nested sub-sections whose heading negates 「擋開工」 SHALL be excluded from it, and content inside fenced code blocks SHALL be ignored. Blocking decisions are the lines that start with a number followed by a period and the headings that start with such a number. A sub-section whose only content line outside block quotes is 「無」, `N/A`, or `None` declares that no decision blocks.

With `--handoff-ready`, validation SHALL fail when the blocking sub-section lists one or more decisions and SHALL name their numbers in a single error. It SHALL fail when the `Open Product Decisions` section mentions 「擋開工」 while neither a numbered list nor a none declaration can be read. It SHALL report a warning, not an error, when the document never mentions 「擋開工」. Without `--handoff-ready`, validation SHALL NOT report blocking decisions.

#### Scenario: Numbered blocking decisions fail handoff-ready validation

- **WHEN** `validate_prototype.py --handoff-ready` runs against a prototype whose blocking sub-section lists decisions 1, 2, and 3
- **THEN** validation exits non-zero
- **THEN** one error names `docs/PRODUCTION_HANDOFF.md` and the numbers 1, 2, 3

#### Scenario: Explicit none declaration passes

- **WHEN** `validate_prototype.py --handoff-ready` runs against a prototype whose blocking sub-section body is the single line 「無」
- **THEN** no blocking-decision error or warning is reported

#### Scenario: Prose mention without a parsable list is rejected

- **WHEN** `validate_prototype.py --handoff-ready` runs against a prototype whose `Open Product Decisions` section mentions 「擋開工」 only inside a bullet and has no heading that contains it
- **THEN** validation exits non-zero
- **THEN** the error tells the author to use a numbered list under a heading that contains 「擋開工」, or to write 「無」

#### Scenario: Handoff without a blocking sub-section only warns

- **WHEN** `validate_prototype.py --handoff-ready` runs against a prototype whose handoff never mentions 「擋開工」
- **THEN** no blocking-decision error is reported
- **THEN** one warning asks the author to add the blocking sub-section and write 「無」

#### Scenario: Drafts are not blocked

- **WHEN** `validate_prototype.py` runs without `--handoff-ready` against a prototype whose blocking sub-section lists decisions
- **THEN** no error or warning about blocking decisions is reported

#### Scenario: Parsing matches the receiving lint

- **WHEN** the blocking-decision parser reads a handoff document
- **THEN** the numbers, the none declaration, and the unparsable verdict equal the values in the example table for that input

##### Example: blocking-decision parse cases

| Input | Numbers | Declares none | Unparsable |
| ----- | ------- | ------------- | ---------- |
| `### 🚧 擋開工` with lines `1.` `2.` `3.`, then `### 不擋開工` with line `4.` | 1, 2, 3 | no | no |
| `### 🚧 擋開工` with the single line 「無」 | none | yes | no |
| `### 🚧 擋開工` with a block quote and then the line 「無」 | none | yes | no |
| A bullet `- **交付範圍未查證（擋開工）**：…` and no heading that contains 「擋開工」 | none | no | yes |
| A document that never mentions 「擋開工」 | none | no | no |
| `### 🚧 擋開工` with line `1.` and a nested `#### 不會擋開工的備註` that contains line `9.` | 1 | no | no |
| A fenced code block that contains `### 擋開工` and line `1.`, with no such heading outside the fence | none | no | no |
| `### 🚧 擋開工` with the sub-heading `#### 1. 縮放機制` | 1 | no | no |


<!-- @trace
source: gate-handoff-blocking-decisions
updated: 2026-10-01
code:
  - storybook-product-prototype/assets/prototype-template/docs/PRODUCTION_HANDOFF.md
  - storybook-product-prototype/scripts/validate_prototype.py
  - storybook-product-prototype/references/production-handoff.md
  - storybook-product-prototype/assets/prototype-template/docs/PRD.md
  - storybook-product-prototype/references/prototype-standard.md
  - storybook-product-prototype/references/handoff-authority.md
  - storybook-product-prototype/SKILL.md
  - storybook-product-prototype/references/prd-workshop.md
  - README.md
  - docs/skills-usage.md
  - storybook-product-prototype/references/pipeline-stations.md
tests:
  - storybook-product-prototype/scripts/test_scaffold_validate.py
-->

---
### Requirement: Blocking list coexists with the decision register

The PRODUCTION_HANDOFF template SHALL split `Open Product Decisions` into a blocking sub-section headed 「🚧 擋開工」 followed by a non-blocking sub-section headed 「不擋開工」. The blocking sub-section SHALL hold a numbered list of the decisions that prevent any implementation from starting, each naming its owner and the work that waits, or the single line 「無」. The non-blocking sub-section SHALL hold the decision register table with status, scope and affected behavior, source, owner, and replacement. A decision that limits only part of the implementation SHALL stay in the register so that unrelated confirmed work continues.

The production handoff reference SHALL state that an answered blocking decision is recorded in the register with status `confirmed` and its source, that the blocking list reads 「無」 before Review Status is set to `confirmed`, and that no heading other than the two sub-section headings contains 「擋開工」.

#### Scenario: Scaffolded handoff carries both sub-sections

- **WHEN** a prototype is scaffolded from the template
- **THEN** `docs/PRODUCTION_HANDOFF.md` contains the heading 「🚧 擋開工」 followed by the heading 「不擋開工」 under `Open Product Decisions`
- **THEN** the decision register table sits under the 「不擋開工」 heading

#### Scenario: Scaffolded placeholder counts as an open blocking decision

- **WHEN** the blocking-decision parser reads a freshly scaffolded handoff
- **THEN** it reports blocking decision 1

#### Scenario: Register rows are not counted as blocking decisions

- **WHEN** the placeholder list of a scaffolded handoff is replaced by the single line 「無」 and the decision register table is left in place
- **THEN** the blocking-decision parser reports no blocking decision and an explicit none declaration

#### Scenario: Reference documents the resolution path

- **WHEN** reading the `Open Product Decisions` section of `references/production-handoff.md`
- **THEN** it states that an answered blocking decision moves into the register with status `confirmed` and its source
- **THEN** it states that no other heading contains 「擋開工」


<!-- @trace
source: gate-handoff-blocking-decisions
updated: 2026-10-01
code:
  - storybook-product-prototype/assets/prototype-template/docs/PRODUCTION_HANDOFF.md
  - storybook-product-prototype/scripts/validate_prototype.py
  - storybook-product-prototype/references/production-handoff.md
  - storybook-product-prototype/assets/prototype-template/docs/PRD.md
  - storybook-product-prototype/references/prototype-standard.md
  - storybook-product-prototype/references/handoff-authority.md
  - storybook-product-prototype/SKILL.md
  - storybook-product-prototype/references/prd-workshop.md
  - README.md
  - docs/skills-usage.md
  - storybook-product-prototype/references/pipeline-stations.md
tests:
  - storybook-product-prototype/scripts/test_scaffold_validate.py
-->

---
### Requirement: Receiver consumption contract is documented

The production handoff reference SHALL contain a `Receiver Consumption Contract` section that lists every handoff item the receiving engineering repository reads, where the item lives, the exact shape it is written in, and whether the receiver's lint parses it or the author of the receiving PRD reads it. The contract SHALL list the Review Status record and the blocking-decision list as lint-parsed items, and the existing and new surface classification, the core journeys, the component map, and the Storybook acceptance criteria as reader-consumed items.

The reference's `Required Sections` list SHALL include every level-2 heading of the PRODUCTION_HANDOFF template, including `Scope Classification` and `Do Not Rebuild`. The PRD structure in the PRD workshop reference and the PRD template SHALL include `Existing Surfaces` and `New Surfaces` sections. SKILL.md SHALL direct authors to the contract when preparing the handoff.

#### Scenario: Contract separates lint-parsed and reader-consumed items

- **WHEN** reading the `Receiver Consumption Contract` section of `references/production-handoff.md`
- **THEN** the Review Status record and the blocking-decision list are marked as parsed by the receiver's lint
- **THEN** the surface classification, core journeys, component map, and Storybook acceptance criteria are marked as read by the author of the receiving PRD

#### Scenario: Required sections cover the template

- **WHEN** comparing the `Required Sections` list in `references/production-handoff.md` with the level-2 headings of the PRODUCTION_HANDOFF template
- **THEN** every template heading appears in the list

#### Scenario: Scaffolded PRD carries the surface sections

- **WHEN** a prototype is scaffolded from the template
- **THEN** `docs/PRD.md` contains the headings `Existing Surfaces` and `New Surfaces`

<!-- @trace
source: gate-handoff-blocking-decisions
updated: 2026-10-01
code:
  - storybook-product-prototype/assets/prototype-template/docs/PRODUCTION_HANDOFF.md
  - storybook-product-prototype/scripts/validate_prototype.py
  - storybook-product-prototype/references/production-handoff.md
  - storybook-product-prototype/assets/prototype-template/docs/PRD.md
  - storybook-product-prototype/references/prototype-standard.md
  - storybook-product-prototype/references/handoff-authority.md
  - storybook-product-prototype/SKILL.md
  - storybook-product-prototype/references/prd-workshop.md
  - README.md
  - docs/skills-usage.md
  - storybook-product-prototype/references/pipeline-stations.md
tests:
  - storybook-product-prototype/scripts/test_scaffold_validate.py
-->