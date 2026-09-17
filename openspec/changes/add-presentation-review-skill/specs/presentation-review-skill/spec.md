## ADDED Requirements

### Requirement: Rule-driven slide-by-slide review

The presentation-review skill SHALL read its rule set from `references/rules.md` at the start of every review and SHALL evaluate each slide against the current rules. For every slide it SHALL judge whether the title states one conclusion composed of a viewpoint (the presenter's judgment) and an action, whether the subtitle supplies the reasons for that conclusion, and whether the slide carries one to three pieces of evidence that support the title's conclusion. Each judgment SHALL be one of pass, needs change, or missing, and SHALL quote or paraphrase the slide text it is based on so the user can verify it. A title without a viewpoint or without an action, and a slide with zero evidence, SHALL be reported as must-fix. A slide with more than three evidence items SHALL be reported as a suggestion to trim or split. Output SHALL be Traditional Chinese unless the user specifies another language.

#### Scenario: Topic-style title is flagged

- **WHEN** a slide title reads「新手引導優化策略」with a subtitle listing the slide's sections
- **THEN** the review marks the title as must-fix because it names a topic without a viewpoint or an action, marks the subtitle as needs change because it does not explain why, and proposes a rewritten viewpoint-plus-action title with a placeholder for any number it cannot verify

#### Scenario: Compliant slide passes

- **WHEN** a slide title states a recommendation with an action, the subtitle gives the reason, and the body contains two evidence items each naming a product, what it did, the reported result, and a source
- **THEN** the review marks title, subtitle, and evidence count as pass and lists the two evidence items with their strength labels

#### Scenario: Evidence overflow

- **WHEN** a slide contains five evidence items under one title
- **THEN** the review reports a suggestion to keep the strongest one to three items or split the slide, and identifies which items support the conclusion most directly

### Requirement: Evidence quality assessment

For each evidence item the skill SHALL check four elements: the subject (which product, team, or internal data), the approach (what feature or change was made), the outcome (growth or result with number and period when available), and the source. It SHALL judge whether the item directly supports that slide's conclusion rather than merely relating to the topic. It SHALL label each item's strength as verified outcome, approach reference without confirmed outcome, or expected and unverified. Missing elements SHALL be listed explicitly. A screenshot or the existence of a feature SHALL NOT be treated as outcome evidence. Outcomes reported by another team SHALL be attributed to that team and SHALL NOT be presented as the presenter's guaranteed result. The same evidence item reused to support different conclusions on different slides SHALL be flagged.

#### Scenario: Evidence lacks outcome and source

- **WHEN** an evidence item reads「Duolingo 也有連續天數提醒」with no result or link
- **THEN** the review labels it as an approach reference without confirmed outcome, lists outcome and source as missing, and does not infer any uplift

#### Scenario: Evidence does not support the conclusion

- **WHEN** the title recommends shortening onboarding to one task and the evidence describes a competitor's pricing page redesign
- **THEN** the review marks the evidence as not supporting the conclusion and records that the slide still lacks supporting evidence

### Requirement: Structured review report with severity and non-fabricated rewrites

The skill SHALL deliver a report following `references/review-report-template.md`: an overall verdict, a reading of the title-only storyline across slides, a per-slide table of judgments, a prioritized must-fix list, rewrite suggestions, a list of evidence still to be supplied, and the items or limits it did not check. Severity SHALL be one of must-fix, suggestion, or optional as defined in the rule set. Rewrite suggestions for titles and subtitles SHALL be written as proposed text; missing evidence SHALL be expressed as a labeled placeholder describing what is needed and SHALL NOT be filled with invented numbers, products, or sources. When the user asks the skill to find evidence, it SHALL use available authorized search capabilities, open a source before citing it, and report gaps it cannot close. By default the skill SHALL deliver the report rather than a rewritten deck; it SHALL produce a full rewritten deck or draft new slides only when the user asks.

#### Scenario: Rewrite without inventing data

- **WHEN** the review proposes a new title that would benefit from a conversion figure the source material does not contain
- **THEN** the rewritten title or subtitle carries a placeholder such as「【待補：首次任務完成率】」instead of an invented percentage

#### Scenario: User asks for a rewritten deck

- **WHEN** the user says「直接幫我改成符合規則的版本」after a review
- **THEN** the skill outputs every slide with rewritten title, subtitle, and evidence lines, keeps placeholders for missing evidence, and appends the unresolved evidence list

### Requirement: Versioned iterable rule set

The rule set SHALL live in one file, `references/rules.md`, with a version number, a change log, stable rule IDs grouped by title, subtitle, evidence, and whole-deck checks, and for each rule its origin (user rule or derived rule), pass condition, common failures, and severity. When the user states a new rule or changes an existing one, the skill SHALL update that file by adding a new ID or amending the rule text, bump the version, record the change in the log, and restate the rule to the user for confirmation. Rule IDs SHALL NOT be renumbered; a retired rule SHALL be marked as retired rather than deleted. Changing rules SHALL NOT require changes to the workflow in SKILL.md unless the workflow itself changes.

#### Scenario: User adds a rule

- **WHEN** the user says「以後每頁最後要有一句『所以我們要做什麼』」
- **THEN** the skill adds a new rule with the next free ID in the appropriate group, marks it as a user rule, bumps the version, logs the change, restates the rule text, and applies it in subsequent reviews without editing the review workflow

#### Scenario: User retires a rule

- **WHEN** the user says a derived rule is not wanted
- **THEN** the rule is marked retired with the date and reason, its ID stays reserved, and later reviews skip it

### Requirement: Input handling and honest limits

The skill SHALL accept Markdown, plain-text outlines, and pasted per-slide text. For presentation files, images, or links it SHALL extract text with capabilities available in the host environment; when it cannot read the input it SHALL say so and ask for a text export instead of guessing content. When slide boundaries are ambiguous it SHALL state the segmentation it assumed. It SHALL NOT review visual layout, color, or typography, and SHALL NOT claim to have generated a presentation file. The skill SHALL be discoverable by the shared installer for Claude Code, Codex, and Cursor, carry Codex metadata, and be documented in the repository README.

#### Scenario: Unreadable presentation file

- **WHEN** the user supplies a Keynote file in an environment with no way to extract its text
- **THEN** the skill reports that it could not read the file and asks for the slide text or a Markdown export rather than reviewing assumed content

#### Scenario: Install for all three agents

- **WHEN** the shared installer selects presentation-review with agent all in dry-run mode
- **THEN** it resolves the Claude Code, Codex, and Cursor destinations without changes to installer logic
