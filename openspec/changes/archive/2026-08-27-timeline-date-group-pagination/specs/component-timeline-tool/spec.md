## MODIFIED Requirements

### Requirement: Timeline page rendering

The Component Timeline page SHALL appear in the Storybook sidebar under the Tools category, SHALL group timeline entries by firstSeen date with the newest date group first, and SHALL join each entry with its catalog entry at render time to display name, category, and a live story preview resolved from storyTitle. WHEN a timeline id has no catalog entry at render time, the page SHALL render a metadata-only card (id, date, commit, subject) instead of failing. The page SHALL paginate by whole date groups: starting from the newest date, consecutive whole date groups are packed into the current page, and WHEN adding the next date group would push the page past 36 components, that group SHALL start a new page. A date group SHALL NOT be split across pages; a single date group larger than 36 components SHALL occupy a page of its own containing the entire group. Each date group's displayed count SHALL equal that date's total component count in the timeline data, and the number of concurrently mounted story iframes stays bounded by the larger of 36 and the largest single-date group.

#### Scenario: Date-grouped listing with live previews

- **WHEN** the page renders with timeline entries that all resolve to catalog entries
- **THEN** components appear grouped by creation date, newest group first, each card showing catalog name, category, commit subject, and a live story preview iframe

#### Scenario: Missing catalog entry degrades to metadata card

- **WHEN** a timeline entry's id is absent from the catalog at render time
- **THEN** that card renders the git-derived metadata only, without a story preview, and the rest of the page renders normally

#### Scenario: Date group never splits across pages

- **WHEN** the next date group does not fit within the current page's 36-component budget
- **THEN** the whole group moves to the next page and its header count shows the date's full total

##### Example: 30-component date stays whole

- **GIVEN** date groups 2026-08-26 (5 components), 2026-08-25 (2 components), 2026-08-24 (30 components)
- **WHEN** the page paginates
- **THEN** page 1 holds 2026-08-26 and 2026-08-25 (7 components), page 2 holds all of 2026-08-24 with its header showing a count of 30

#### Scenario: Oversized date group gets its own page

- **WHEN** a single date group contains more than 36 components
- **THEN** that group occupies one page containing the entire group, and its header count equals the group's full size
