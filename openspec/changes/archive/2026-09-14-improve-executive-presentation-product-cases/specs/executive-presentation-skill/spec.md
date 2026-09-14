## MODIFIED Requirements

### Requirement: Conclusion-first four-slide presentation

The executive-presentation skill SHALL transform meeting notes, raw material, or a topic into four slides of Traditional Chinese Markdown content by default, from a UIUX product director perspective. It SHALL use plain words, short sentences, and conclusion-bearing titles that connect design choices to user problems and product value. Slide 1 SHALL open with the recommendation and two or three supported or explicitly expected benefits readable within 30 seconds. Slides 2, 3, and 4 SHALL explain the user problem and priority, the proposed approach with evidence and reference cases, and execution with validation respectively. BLUF and MECE SHALL remain internal organizing methods rather than required reader-facing labels. The skill SHALL NOT prepend a cover, agenda, or chronological recap. Explicit user requests for another language, length, or format SHALL override defaults while preserving conclusion-first communication.

#### Scenario: Meeting notes become a product brief

- **WHEN** a UIUX designer supplies chronological meeting notes about onboarding without specifying format
- **THEN** the four-slide output opens with a concrete improvement recommendation, explains whom it helps and why it matters, and uses plain titles rather than consulting framework names

### Requirement: MECE pillars and evidence mapping

The skill SHALL support the recommendation with two or three distinct reasons that cover the relevant decision scope without padding or duplicating benefits. Each reason SHALL explain a user or product impact rather than use an abstract label. Evidence or a specific evidence gap SHALL be associated with each key reason using readable prose; numeric pillar labels SHALL NOT be required in delivered slides. The proposed approach SHALL include relevant limitations or risks with a mitigation or validation action. Unsupported assumptions SHALL remain visibly unverified. Product value SHALL include suitable qualitative improvements or observable task outcomes without forcing every proposal into revenue or ROI.

#### Scenario: Overlapping reasons are consolidated

- **WHEN** the supplied reasons are lower labor cost, lower operating expense, and faster turnaround
- **THEN** the skill combines overlapping cost benefits, explains the separate delivery benefit, and does not add a third reason merely to fill the template

#### Scenario: A qualitative usability improvement is valuable

- **WHEN** the proposal aims to help users find a saved item and no financial estimate is supplied
- **THEN** the skill explains the expected improvement in finding the item and identifies an appropriate validation measure without inventing revenue or ROI

### Requirement: Traceable evidence and qualified ROI

The skill SHALL preserve source units, periods, and limitations; distinguish facts, calculations, assumptions, and missing data; and attach source labels to quantitative and case claims. It SHALL NOT invent metrics, cases, sources, confirmed owners, or approved dates. ROI SHALL be calculated only with sufficient inputs, matching periods and definitions, a nonzero cost denominator, and an explicit formula; net benefit SHALL NOT have cost deducted twice. Unquantifiable value SHALL be described qualitatively with missing inputs identified. Materially conflicting figures SHALL be surfaced rather than silently combined. Before delivery the skill SHALL check the recommendation, evidence support, case relevance, source accuracy, material gaps, and action completeness and correct unsupported claims. Source research SHALL follow the proactive research requirement and user restrictions.

#### Scenario: Calculable ROI uses the same period

- **WHEN** the user supplies annual gross benefit of TWD 1,200,000 and annual total cost of TWD 800,000
- **THEN** derived annual ROI is labeled as calculated, uses (1,200,000 - 800,000) / 800,000, and equals 50%

#### Scenario: Topic without evidence

- **WHEN** the user supplies only the topic of introducing an AI customer service pilot
- **THEN** the skill researches key evidence gaps with available permitted capabilities and drafts a conditional recommendation with qualitative potential benefits and validation actions, without fabricating local outcomes or approved staffing

#### Scenario: Input is absent

- **WHEN** the user invokes the skill without a topic or usable source content
- **THEN** the skill asks concisely for a topic or source material instead of inventing a business scenario or starting an unrelated search

### Requirement: Actionable next steps

Slide 4 SHALL specify two or three concrete actions, each with an owner or proposed responsible unit, timeframe, and observable deliverable or acceptance result. At least one action SHALL explain how to check the proposed user or product improvement. Owners and dates not supplied SHALL be marked as proposed and pending confirmation, with relative timing anchored to a stated event. Delivery of a design artifact alone SHALL NOT be presented as proof of improved product outcomes.

#### Scenario: Schedule is not provided

- **WHEN** source material contains a decision topic but no owner or dates
- **THEN** the final slide proposes labeled responsible units and timeframes relative to approval and includes an observable validation action without inventing commitments or target percentages

### Requirement: Portable packaging and honest delivery status

The skill SHALL contain a standard SKILL.md with a matching name and description and SHALL remain discoverable by the existing shared installer for Claude Code, Codex, and Cursor. Essential content drafting SHALL NOT require proprietary tools, other installed skills, or absolute local paths. Research and visual capture SHALL use available authorized capabilities; absent capabilities SHALL produce a specific limitation and useful draft rather than a false claim of verification. Codex metadata and README invocation examples SHALL describe the product-value and case-supported workflow. If the user requests a presentation file, the skill SHALL use available file-generation capabilities and report the actual artifact; if unavailable, it SHALL deliver content and state which file was not generated.

#### Scenario: Install the same skill for all three agents

- **WHEN** the shared installer selects executive-presentation with agent all
- **THEN** it resolves existing Claude Code, Codex, and Cursor destinations without changes to installer logic

#### Scenario: Requested file cannot be generated

- **WHEN** the user requests PowerPoint in an environment without file-generation capability
- **THEN** the skill supplies the presentation content and explicitly reports that no PowerPoint file was generated

## ADDED Requirements

### Requirement: Proactive bounded source research

The skill SHALL first inspect supplied material and identify missing support for the main recommendation. When key claims lack evidence, referenced documents are missing, cases are absent, or a case's current applicability is uncertain, it SHALL proactively search relevant accessible documents or public sources using available authorized capabilities without requiring a separate research request. It SHALL prefer supplied and relevant internal sources where accessible and original public product documentation, help pages, release notes, or research over unverified summaries. It SHALL open and inspect a source before citing it as verified; search snippets alone SHALL NOT constitute verified evidence. Queries SHALL be limited to the proposal's evidence gaps and public queries SHALL exclude nonpublic company details. By default it SHALL seek one or two relevant shareable cases and stop when the key gaps are covered or a focused search and targeted refinement yield no usable support, unless the user requests broader research. It SHALL state remaining gaps and limit claims accordingly. Explicit source or search restrictions SHALL take precedence. Missing tools, unreadable links, or absent permissions SHALL be reported accurately without unapproved installation or access attempts.

#### Scenario: Missing supporting document and available search

- **WHEN** notes refer to an unread onboarding study and accessible document search is available
- **THEN** the skill searches for the relevant study, reads matching material before citing it, and reports when no matching document is accessible

#### Scenario: User limits sources

- **WHEN** the user requests a rewrite using only the supplied material
- **THEN** the skill performs no external research, labels unsupported claims, and states which case or data would be useful to supply

#### Scenario: Search cannot establish support

- **WHEN** a focused search and targeted refinement find no relevant readable case or no search capability exists
- **THEN** the skill reports that limit and delivers a qualified draft without invented cases, links, or claims of completed verification

### Requirement: Shareable product cases and visual material

For each selected case the skill SHALL describe the product or team and context, the user problem, the observed approach, its relevance to the proposal, the evidence strength, and important differences or limitations. It SHALL attach the actual readable source and a date or version context when available without inventing missing metadata. It SHALL distinguish an observed design pattern from reported outcome evidence and from a hypothetical concept. A screenshot or product feature's existence SHALL NOT prove effectiveness; outcomes reported by another team SHALL be attributed to that team and SHALL NOT be presented as guaranteed local results. If reusable screenshots or links needed for the case are missing, it SHALL ask concisely whether the user has material that can be included, explaining the use, and continue independent drafting while waiting. It SHALL reuse already supplied material without repeated requests, respect refusals, and distinguish actually inspected or captured visuals from suggested visuals. Unresolved material gaps SHALL remain explicit in the delivered draft.

#### Scenario: Visual reference without outcome evidence

- **WHEN** a supplied screenshot shows a two-step registration flow but contains no conversion result
- **THEN** the case is presented as a flow reference, local effectiveness remains unverified, and the skill neither invents an uplift nor requests the same screenshot again

#### Scenario: Missing screenshot for a selected case

- **WHEN** a relevant readable case is available but no usable screenshot or capture capability is available
- **THEN** the skill asks whether the user has a screenshot or link suitable for the presentation, explains which design choice it would illustrate, and continues with the text and source while labeling the visual gap

#### Scenario: User declines additional material

- **WHEN** the user states there are no screenshots or further links
- **THEN** the skill stops asking for those materials and uses available readable sources, explains remaining uncertainty, and does not label a suggested mockup as a real product capture
