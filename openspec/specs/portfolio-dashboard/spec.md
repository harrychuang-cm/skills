# portfolio-dashboard Specification

## Purpose

Define a read-only, designer-facing portfolio dashboard skill that aggregates many projects' pipeline-board status objects — by re-running the existing per-project build and render commands as subprocesses, never re-deriving their claims — into one self-contained HTML overview: one card per tracked project carrying a single attention item derived by fixed priority (possibly-stopped run, first unmet or stale handoff, pending designer decisions, healthy), with per-project failures isolated as error cards, all outputs collected in one shareable directory, and no server, port, execution trigger, or network dependency.

## Requirements

### Requirement: The dashboard is a self-discovered top-level skill

The `portfolio-dashboard` capability SHALL be packaged as a top-level skill directory whose SKILL.md name matches the directory name, so the existing installer discovers it without manual registration. The skill SHALL NOT be part of any managed template and SHALL NOT require a manifest, receipt hash, or manual import step.

#### Scenario: Installer lists the skill

- **WHEN** the agent-skill installer runs in dry-run mode at the repository root
- **THEN** portfolio-dashboard is listed as an installable skill


<!-- @trace
source: add-portfolio-dashboard
updated: 2026-08-03
code:
  - pipeline-board/scripts/build-pipeline-status.mjs
  - README.md
  - portfolio-dashboard/scripts/build-portfolio-status.mjs
  - portfolio-dashboard/SKILL.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
  - .spectra.yaml
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/assets/default-pipeline.json
  - portfolio-dashboard/assets/default-portfolio.json
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/references/portfolio-definition.md
  - pipeline-board/SKILL.md
  - pipeline-board/agents/openai.yaml
  - pipeline-board/scripts/check-pipeline-board.mjs
  - portfolio-dashboard/agents/openai.yaml
  - design-system-extractor/scripts/generate_review_html.mjs
-->

---
### Requirement: The portfolio definition file is validated before any aggregation

The build command SHALL accept a portfolio definition file path as a required argument. The definition file SHALL be schema version 1 JSON containing a project list where each entry has an identifier unique within the file, a designer-readable display name, and a project root path that is absolute or relative to the definition file directory. When the definition file is missing, unparsable, has a mismatched schema version, has an empty project list, or contains duplicate identifiers, the build command SHALL exit non-zero with a stable error code and SHALL NOT produce any output file.

#### Scenario: Invalid portfolio definition aborts the build

- **WHEN** the build command runs against a definition file with two projects sharing the same identifier
- **THEN** the command exits non-zero with a stable error code identifying the duplicate identifier and no output file is created

#### Scenario: Empty project list is rejected

- **WHEN** the build command runs against a schema version 1 definition file whose project list is empty
- **THEN** the command exits non-zero with a stable error code and no output file is created


<!-- @trace
source: add-portfolio-dashboard
updated: 2026-08-03
code:
  - pipeline-board/scripts/build-pipeline-status.mjs
  - README.md
  - portfolio-dashboard/scripts/build-portfolio-status.mjs
  - portfolio-dashboard/SKILL.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
  - .spectra.yaml
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/assets/default-pipeline.json
  - portfolio-dashboard/assets/default-portfolio.json
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/references/portfolio-definition.md
  - pipeline-board/SKILL.md
  - pipeline-board/agents/openai.yaml
  - pipeline-board/scripts/check-pipeline-board.mjs
  - portfolio-dashboard/agents/openai.yaml
  - design-system-extractor/scripts/generate_review_html.mjs
-->

---
### Requirement: Aggregation reuses the per-project pipeline commands

For each project in the portfolio definition, the build command SHALL obtain the project status object by invoking the existing pipeline-board build command as a subprocess against that project root, and SHALL produce that project's board HTML by invoking the existing pipeline-board render command. The aggregation SHALL NOT reimplement status derivation and SHALL NOT import pipeline-board internal functions. The pipeline-board script locations SHALL be resolved relative to the aggregation script's own location.

#### Scenario: Project status comes from the existing build command

- **WHEN** the build command aggregates a project whose root contains automation evidence
- **THEN** the portfolio status object embeds the status object produced by the pipeline-board build command for that project root unchanged

#### Scenario: Schema version of embedded status is checked

- **WHEN** a per-project status object reports a schema version the aggregator does not support
- **THEN** that project is recorded as an error entry with a stable error code instead of an interpreted status


<!-- @trace
source: add-portfolio-dashboard
updated: 2026-08-03
code:
  - pipeline-board/scripts/build-pipeline-status.mjs
  - README.md
  - portfolio-dashboard/scripts/build-portfolio-status.mjs
  - portfolio-dashboard/SKILL.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
  - .spectra.yaml
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/assets/default-pipeline.json
  - portfolio-dashboard/assets/default-portfolio.json
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/references/portfolio-definition.md
  - pipeline-board/SKILL.md
  - pipeline-board/agents/openai.yaml
  - pipeline-board/scripts/check-pipeline-board.mjs
  - portfolio-dashboard/agents/openai.yaml
  - design-system-extractor/scripts/generate_review_html.mjs
-->

---
### Requirement: Per-project failures become error cards without aborting the build

When an individual project fails — the project root does not exist, its pipeline definition is invalid, the per-project build subprocess exits non-zero, or its status object schema version is unsupported — the build command SHALL record an error entry for that project containing a stable error code and reason, SHALL continue aggregating the remaining projects, and SHALL exit zero.

#### Scenario: Missing project root does not abort aggregation

- **WHEN** the build command runs against a portfolio of two projects where one root directory does not exist
- **THEN** the command exits zero and the portfolio status object contains one successful entry and one error entry whose code identifies the missing root


<!-- @trace
source: add-portfolio-dashboard
updated: 2026-08-03
code:
  - pipeline-board/scripts/build-pipeline-status.mjs
  - README.md
  - portfolio-dashboard/scripts/build-portfolio-status.mjs
  - portfolio-dashboard/SKILL.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
  - .spectra.yaml
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/assets/default-pipeline.json
  - portfolio-dashboard/assets/default-portfolio.json
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/references/portfolio-definition.md
  - pipeline-board/SKILL.md
  - pipeline-board/agents/openai.yaml
  - pipeline-board/scripts/check-pipeline-board.mjs
  - portfolio-dashboard/agents/openai.yaml
  - design-system-extractor/scripts/generate_review_html.mjs
-->

---
### Requirement: Each project card derives one attention item by fixed priority

For each successfully aggregated project, the build command SHALL derive exactly one attention item using this priority order, taking the first that holds: (1) the run block is flagged possibly-stalled, then the attention item is human-confirmation-needed; (2) following the pipeline definition stage order, the first edge whose status is unmet or stale, then the attention item names that edge and its reason; (3) the pending decision count is greater than zero, then the attention item is the pending count; (4) otherwise the attention item is healthy, distinguishing all-verified from produced-but-unverified. The renderer SHALL NOT reorder or recompute this derivation.

#### Scenario: Possibly-stalled run outranks a blocked edge

- **WHEN** a project has a run block flagged possibly-stalled and also has an unmet edge
- **THEN** the attention item is human-confirmation-needed

##### Example: priority selection

| Project state | Attention item |
| --- | --- |
| run possibly-stalled, first edge unmet, 3 pending | human-confirmation-needed |
| run recorded normal, second edge stale, 3 pending | stale edge with its reason |
| all edges hold, 3 pending decisions | 3 pending decisions |
| all edges hold, 0 pending, all audits passed | healthy, all verified |
| all edges hold, 0 pending, no audit results | healthy, produced but unverified |


<!-- @trace
source: add-portfolio-dashboard
updated: 2026-08-03
code:
  - pipeline-board/scripts/build-pipeline-status.mjs
  - README.md
  - portfolio-dashboard/scripts/build-portfolio-status.mjs
  - portfolio-dashboard/SKILL.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
  - .spectra.yaml
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/assets/default-pipeline.json
  - portfolio-dashboard/assets/default-portfolio.json
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/references/portfolio-definition.md
  - pipeline-board/SKILL.md
  - pipeline-board/agents/openai.yaml
  - pipeline-board/scripts/check-pipeline-board.mjs
  - portfolio-dashboard/agents/openai.yaml
  - design-system-extractor/scripts/generate_review_html.mjs
-->

---
### Requirement: One aggregation produces the overview and all project boards in one output directory

The build and render commands SHALL write all outputs into a single output directory, defaulting to a dashboard subdirectory next to the portfolio definition file and overridable by argument. The output directory SHALL contain the overview HTML and one board HTML per successfully aggregated project named by project identifier. Card links SHALL be directory-relative paths pointing only at files produced by the same aggregation run. Error cards SHALL NOT contain links. The portfolio commands SHALL NOT write into any tracked project root themselves; the only in-project write of an aggregation is the per-project pipeline-board build command refreshing that project's own pipeline status file, which is that command's documented behavior.

#### Scenario: Links resolve within the output directory

- **WHEN** the build and render commands complete for a portfolio with one healthy project and one project whose root is missing
- **THEN** the overview HTML contains one card linking to an existing board file in the output directory and one error card without a link


<!-- @trace
source: add-portfolio-dashboard
updated: 2026-08-03
code:
  - pipeline-board/scripts/build-pipeline-status.mjs
  - README.md
  - portfolio-dashboard/scripts/build-portfolio-status.mjs
  - portfolio-dashboard/SKILL.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
  - .spectra.yaml
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/assets/default-pipeline.json
  - portfolio-dashboard/assets/default-portfolio.json
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/references/portfolio-definition.md
  - pipeline-board/SKILL.md
  - pipeline-board/agents/openai.yaml
  - pipeline-board/scripts/check-pipeline-board.mjs
  - portfolio-dashboard/agents/openai.yaml
  - design-system-extractor/scripts/generate_review_html.mjs
-->

---
### Requirement: The overview HTML is self-contained and honest about being a snapshot

The render command SHALL consume the portfolio status object and produce a single HTML file that contains no external resource references, no access codes, no credentials, no expanded execution parameters, no raw prompts, and no environment values. The page SHALL display the generation timestamp and the command names required to regenerate it, and SHALL NOT contain any dynamic progress element, polling logic, or execution trigger.

#### Scenario: Overview opens offline

- **WHEN** the rendered overview HTML is opened in a browser without network access
- **THEN** all cards, attention items, and styling render completely


<!-- @trace
source: add-portfolio-dashboard
updated: 2026-08-03
code:
  - pipeline-board/scripts/build-pipeline-status.mjs
  - README.md
  - portfolio-dashboard/scripts/build-portfolio-status.mjs
  - portfolio-dashboard/SKILL.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
  - .spectra.yaml
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/assets/default-pipeline.json
  - portfolio-dashboard/assets/default-portfolio.json
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/references/portfolio-definition.md
  - pipeline-board/SKILL.md
  - pipeline-board/agents/openai.yaml
  - pipeline-board/scripts/check-pipeline-board.mjs
  - portfolio-dashboard/agents/openai.yaml
  - design-system-extractor/scripts/generate_review_html.mjs
-->

---
### Requirement: The checker validates the dashboard with deterministic fixtures

The checker SHALL build temporary portfolio and project fixtures covering: a healthy project, a project with an unmet edge, a project with a stale edge, a project with an overdue run block, a missing project root, an invalid portfolio definition including the empty list and duplicate identifier cases, and an unsupported status object schema version. The checker SHALL exercise the real build and render scripts using filesystem operations only, SHALL NOT invoke any AI runner or network, and SHALL exit zero with each named check reported when all checks pass.

#### Scenario: Checker passes with all scenarios named

- **WHEN** the checker runs at the repository root
- **THEN** it exits zero and its output names the healthy, unmet-edge, stale-edge, overdue-run, missing-root, invalid-definition, and schema-mismatch checks

<!-- @trace
source: add-portfolio-dashboard
updated: 2026-08-03
code:
  - pipeline-board/scripts/build-pipeline-status.mjs
  - README.md
  - portfolio-dashboard/scripts/build-portfolio-status.mjs
  - portfolio-dashboard/SKILL.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
  - .spectra.yaml
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/assets/default-pipeline.json
  - portfolio-dashboard/assets/default-portfolio.json
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/references/portfolio-definition.md
  - pipeline-board/SKILL.md
  - pipeline-board/agents/openai.yaml
  - pipeline-board/scripts/check-pipeline-board.mjs
  - portfolio-dashboard/agents/openai.yaml
  - design-system-extractor/scripts/generate_review_html.mjs
-->

---
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

<!-- @trace
source: add-flow-motion-designer-ux
updated: 2026-08-03
code:
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/check-pipeline-board.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
  - .spectra.yaml
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
-->

---
### Requirement: The overview and the project boards share one design token block byte-for-byte

The rendered overview SHALL declare the same design token block the per-project board declares, delimited by the same start and end marker comments, with identical token names and identical values. The checker SHALL extract the delimited block from one generated project board and from the overview produced in the same aggregation and SHALL assert the two extracted strings are equal, so a drift in either renderer fails the check rather than shipping two divergent themes. The token block SHALL introduce no keyframes rule, keeping the overview animation-free.

#### Scenario: Both renderers emit an identical token block

- **WHEN** one aggregation produces the overview and the project boards in the same output directory
- **THEN** the token block extracted from a project board and the token block extracted from the overview are equal strings

#### Scenario: The shared token block adds no animation to the overview

- **WHEN** the overview renders with the shared token block
- **THEN** the overview contains no keyframes rule


<!-- @trace
source: refine-board-visual-detail
updated: 2026-08-03
code:
  - pipeline-board/scripts/check-pipeline-board.mjs
  - pipeline-board/scripts/render-pipeline-board.mjs
  - .spectra.yaml
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
-->

---
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

<!-- @trace
source: refine-board-visual-detail
updated: 2026-08-03
code:
  - pipeline-board/scripts/check-pipeline-board.mjs
  - pipeline-board/scripts/render-pipeline-board.mjs
  - .spectra.yaml
  - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
-->