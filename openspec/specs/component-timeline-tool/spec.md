# component-timeline-tool Specification

## Purpose

TBD - created by archiving change 'generalize-to-storybook-tools-install'. Update Purpose after archive.

## Requirements

### Requirement: Timeline data derived from catalog componentPath

The timeline build script SHALL read component identities from src/storybook/componentCatalog.ts using the catalog parsing contract (id is the first field of every entry; the string fields id, name, storyTitle, componentPath each occupy a single line), and for each entry SHALL derive the first git commit that added its componentPath (a directory or a single file) using git log with --diff-filter=A. The script SHALL write src/storybook/componentTimeline.ts exporting a ComponentTimelineEntry type and a componentTimelineEntries constant with the fields id, firstSeen (ISO date), commit (short hash), and subject. Entries SHALL be ordered newest date first, and alphabetically by id within the same date. Catalog entries whose componentPath has no git history SHALL be listed in a generated-file comment as untracked and SHALL NOT fail the build. WHEN the catalog file is missing or yields zero entries under the parsing contract, the script SHALL exit non-zero with a message describing the parsing contract.

#### Scenario: Ordering of generated entries

- **WHEN** the build script generates componentTimeline.ts
- **THEN** entries appear newest date first and alphabetically by id within the same date

##### Example: three components across two dates

- **GIVEN** catalog entries alpha-card (first commit 2026-08-20), beta-list (2026-08-26), zebra-chip (2026-08-20)
- **WHEN** the build script runs
- **THEN** the generated order is beta-list, alpha-card, zebra-chip

#### Scenario: Uncommitted component is noted, not fatal

- **WHEN** a catalog entry's componentPath exists on disk but has no commit in git history
- **THEN** the generated file omits that entry from componentTimelineEntries and names it in an untracked comment, and the script exits zero

#### Scenario: Unparseable catalog aborts generation

- **WHEN** src/storybook/componentCatalog.ts is missing or no entry can be extracted under the parsing contract
- **THEN** the build script exits non-zero and the error message describes the expected parsing contract instead of writing an empty timeline file


<!-- @trace
source: generalize-to-storybook-tools-install
updated: 2026-08-27
code:
  - docs/skills-guide.html
-->

---
### Requirement: Timeline drift check

The timeline check script SHALL regenerate the timeline content in memory and compare it byte-for-byte with the committed src/storybook/componentTimeline.ts, and SHALL exit non-zero when they differ or when the generated file is missing. The check SHALL also exit non-zero when any timeline entry id has no matching catalog entry. Every failure message SHALL name the build:component-timeline npm script as the fix.

#### Scenario: Stale timeline data fails the check

- **WHEN** a component was added to the catalog and committed without regenerating the timeline file
- **THEN** the check script exits non-zero and the message instructs running the build:component-timeline npm script

#### Scenario: Fresh timeline data passes

- **WHEN** the timeline file matches a fresh regeneration and every timeline id resolves to a catalog entry
- **THEN** the check script exits zero


<!-- @trace
source: generalize-to-storybook-tools-install
updated: 2026-08-27
code:
  - docs/skills-guide.html
-->

---
### Requirement: Timeline page rendering

The Component Timeline page SHALL appear in the Storybook sidebar under the Tools category, SHALL group timeline entries by firstSeen date with the newest date group first, and SHALL join each entry with its catalog entry at render time to display name, category, and a live story preview resolved from storyTitle. WHEN a timeline id has no catalog entry at render time, the page SHALL render a metadata-only card (id, date, commit, subject) instead of failing. The page SHALL paginate at 30 components per page so the number of concurrently mounted story iframes stays bounded.

#### Scenario: Date-grouped listing with live previews

- **WHEN** the page renders with timeline entries that all resolve to catalog entries
- **THEN** components appear grouped by creation date, newest group first, each card showing catalog name, category, commit subject, and a live story preview iframe

#### Scenario: Missing catalog entry degrades to metadata card

- **WHEN** a timeline entry's id is absent from the catalog at render time
- **THEN** that card renders the git-derived metadata only, without a story preview, and the rest of the page renders normally


<!-- @trace
source: generalize-to-storybook-tools-install
updated: 2026-08-27
code:
  - docs/skills-guide.html
-->

---
### Requirement: Self-contained page with a project extras slot

The ComponentTimeline page component SHALL be a verbatim template file whose only project-level imports are the component catalog, the generated timeline data, and the timeline extras registry. All user-facing copy SHALL be defined inside the template files. The adaptable timelineExtrasRegistry file SHALL export a single accessor that returns null by default; WHEN it returns null the page SHALL NOT render an extras section, and WHEN a project's adapted registry returns content the page SHALL render that content in the extras area above the timeline listing.

#### Scenario: Default install renders no extras section

- **WHEN** the page renders with the unmodified default registry
- **THEN** no extras section appears and the page shows only the timeline listing

#### Scenario: Project-adapted registry injects a panel

- **WHEN** a project replaces the registry implementation with one returning a custom statistics panel
- **THEN** the page renders that panel above the timeline listing without any change to the verbatim page component

<!-- @trace
source: generalize-to-storybook-tools-install
updated: 2026-08-27
code:
  - docs/skills-guide.html
-->