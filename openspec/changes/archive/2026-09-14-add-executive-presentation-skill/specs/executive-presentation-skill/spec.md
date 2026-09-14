## ADDED Requirements

### Requirement: Conclusion-first four-slide presentation

The executive-presentation skill SHALL transform meeting notes, raw material, or a topic into a four-slide Markdown presentation by default, using Traditional Chinese unless the user specifies another language. Slide 1 SHALL begin with a one-sentence core conclusion or proposed decision and two or three supported impact points readable within 30 seconds. Slides 2, 3, and 4 SHALL contain supporting pillars, evidence and risk mitigation, and next steps respectively. The skill SHALL use concise executive-facing bullets and SHALL NOT add a cover, agenda, chronological recap, or background slide before the conclusion. Explicit user requests for a different length or format SHALL take precedence while preserving conclusion-first communication.

#### Scenario: Meeting notes become a decision brief

- **WHEN** the user supplies chronological meeting notes and requests a presentation without specifying length or format
- **THEN** the output contains four slide sections in the required order and opens with the recommendation instead of the meeting history

### Requirement: MECE pillars and evidence mapping

The skill SHALL organize support into two or three independent dimensions that collectively cover the decision scope. Each pillar SHALL include a reason and explanation. Slide 3 SHALL identify which pillars each data point or case supports and include a relevant risk with mitigation. If three pillars are used, the third SHALL also have evidence or an explicit evidence gap; unsupported assumptions SHALL NOT be presented as validated pillars.

#### Scenario: Overlapping reasons are consolidated

- **WHEN** the supplied reasons are lower labor cost, lower operating expense, and faster turnaround
- **THEN** the skill consolidates the two cost reasons under one financial dimension and uses delivery speed as a separate dimension, rather than padding the slide to three overlapping reasons

### Requirement: Traceable evidence and qualified ROI

The skill SHALL preserve source units, periods, and limitations; distinguish facts, calculations, assumptions, and missing data; and attach source labels to quantitative or case claims. It SHALL NOT invent metrics, cases, sources, confirmed owners, or approved dates. ROI calculations SHALL state their formula, inputs, and matching period. Unquantifiable value SHALL be described qualitatively with the missing inputs identified. Materially conflicting figures SHALL be surfaced rather than silently combined.

#### Scenario: Calculable ROI uses the same period

- **WHEN** the user supplies annual gross benefit of TWD 1,200,000 and annual total cost of TWD 800,000
- **THEN** a derived annual ROI is labeled as calculated, uses (1,200,000 - 800,000) / 800,000, and equals 50%, rather than treating gross benefit divided by cost as net ROI

#### Scenario: Topic without evidence

- **WHEN** the user supplies only the topic of introducing an AI customer service pilot
- **THEN** the skill drafts a conditional recommendation, qualitative potential benefits, explicitly unverified pillars and data gaps, and proposed validation actions without fabricated ROI, customer cases, or approved staffing

#### Scenario: Input is absent

- **WHEN** the user invokes the skill without any topic or usable source content
- **THEN** the skill asks concisely for a topic or source material instead of inventing a business scenario

### Requirement: Actionable next steps

Slide 4 SHALL specify two or three concrete actions, each with an owner or proposed responsible unit, timeframe, and observable deliverable or acceptance result. Owners and dates that are not supplied SHALL be marked as proposed and pending confirmation, with relative timing anchored to a stated event.

#### Scenario: Schedule is not provided

- **WHEN** source material contains a decision topic but no owner or dates
- **THEN** the final slide proposes labeled responsible units and timeframes relative to approval, without presenting them as existing commitments

### Requirement: Portable packaging and honest delivery status

The skill SHALL contain a standard SKILL.md with a matching name and description and SHALL be discoverable by the existing shared installer for Claude Code, Codex, and Cursor. Essential behavior SHALL NOT depend on proprietary tools, other installed skills, or absolute local paths. Codex interface metadata SHALL be additive. README documentation SHALL describe invocation and scoped installation. If the user requests a presentation file, the skill SHALL use available file-generation capabilities and report the actual artifact; if those capabilities are unavailable, it SHALL explain the limitation and deliver the content without claiming a file was created.

#### Scenario: Install the same skill for all three agents

- **WHEN** the shared installer selects executive-presentation with agent all
- **THEN** the installer resolves the existing Claude Code, Codex, and Cursor skill destinations and copies the same skill content to each without requiring changes to installer logic

#### Scenario: Requested file cannot be generated

- **WHEN** the user requests a PowerPoint file in an environment without file-generation capability
- **THEN** the response supplies the presentation content and explicitly reports that no PowerPoint file was generated
