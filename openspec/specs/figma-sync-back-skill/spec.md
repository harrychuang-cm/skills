# figma-sync-back-skill Specification

## Purpose

Defines the figma-sync-back skill: detecting which Storybook stories need updating from Figma-side edits via a deterministic three-way comparison (synced baseline payload, current Storybook export, current Figma state), four-quadrant classification with known-limitation suppression, and a routed report that sends token differences to the design-system-extractor Late-Arriving Authoritative Source Pass, visual differences to ui-compare-to-reference, and structural differences to manual handling — without ever modifying product code.

## Requirements

### Requirement: Story-to-node mapping discovery

The figma-sync-back skill SHALL build a story-to-Figma-node mapping table before any comparison, resolving each story through this ordered fallback: (1) the figmaNodeUrl recorded in component-review-status.json, (2) a scan of the Figma file's shared plugin data under the "storybook" namespace when the file can be queried, (3) a name match of "componentTitle / storyName" against section and node names, which MUST be recorded as low confidence. Every mapping row SHALL record its provenance tier. When one storyId resolves to more than one Figma node, the skill MUST stop and ask the user to adjudicate instead of choosing silently. Stories with no resolvable node SHALL be reported as unmapped rather than dropped.

#### Scenario: provenance is recorded per mapping

- **WHEN** the mapping table is built for a project where one story has a review-status URL, one is found only via shared plugin data, and one matches only by name
- **THEN** the table records each story with its node reference and provenance tier, and the name-matched row is marked low confidence

#### Scenario: ambiguous mapping stops the run

- **WHEN** two Figma nodes carry the same shared storybook/storyId value
- **THEN** the skill stops and asks the user which node is authoritative before comparing that story

---
### Requirement: Deterministic three-way payload comparison

The skill SHALL ship a Node script, compare_payload_baseline.mjs, that performs the comparison without network access. It SHALL accept --base (the synced baseline payload), --ours (the current export payload), and optionally --theirs (a figma-facts JSON describing the current Figma state in the documented schema). The script SHALL normalize payloads to a semantic subset — token names with resolved values, node name paths, layout mode, gap and padding, dimensions, corner radius, effect kinds, text content, and fills — and diff within that subset only. Given identical inputs the script MUST produce identical output. When --theirs is absent the script SHALL still report base-versus-ours differences and mark the classification as partial.

#### Scenario: identical inputs produce identical reports

- **WHEN** the script is run twice with the same three input files
- **THEN** both runs emit byte-identical JSON reports

#### Scenario: missing theirs degrades to partial

- **WHEN** the script is run with --base and --ours only
- **THEN** the report classification is "partial" and contains only base-versus-ours differences

---
### Requirement: Four-quadrant sync classification

The comparison report SHALL classify each story by combining two booleans — whether base-versus-ours has semantic differences and whether base-versus-theirs has semantic differences — into exactly one of: synced (neither changed), figma-only (only theirs changed), code-only (only ours changed), or conflict (both changed). Each reported difference SHALL name the node path, the field, the differing values, and which side changed.

#### Scenario: figma-only change is a sync-back candidate

- **WHEN** base equals ours in the semantic subset and theirs differs from base on a corner radius value
- **THEN** the story is classified figma-only and the radius difference names the node path, field, base value, and theirs value

##### Example: classification matrix

| base vs ours | base vs theirs | classification |
| ------------ | -------------- | -------------- |
| equal | equal | synced |
| equal | different | figma-only |
| different | equal | code-only |
| different | different | conflict |

---
### Requirement: Known-limitation suppression filter

The comparison script SHALL apply a suppression rule set for differences explained by documented exporter fidelity limitations, at minimum: text height or wrap differences within the font-metrics threshold, color deltas within the sRGB clamp epsilon, raster dimension differences caused by the 2048px embed cap, the locked Browser Reference layer, and Figma-side section or viewport position values. Suppressed differences MUST be listed in a separate suppressed section of the report with the rule id and reason, never silently discarded, and MUST NOT contribute to the four-quadrant classification. Thresholds SHALL be defined as named constants in the script.

#### Scenario: suppressed difference does not flip classification

- **WHEN** the only base-versus-theirs difference is a text block height delta within the font-metrics threshold
- **THEN** the story is classified synced and the height delta appears in the suppressed section with its rule id

---
### Requirement: Routing report without code modification

The skill SHALL write a human-readable report to design-system/figma-sync-report.md and a machine-readable JSON alongside it. Every figma-only or conflict difference SHALL carry a category — token (variable value or binding change) routed to the design-system-extractor Late-Arriving Authoritative Source Pass, visual (style value change) routed to ui-compare-to-reference, or structural (node addition, removal, or hierarchy change) marked for manual handling. The skill MUST NOT modify product component code, token CSS files, or component spec documents; its only writes are the report files and, with explicit user consent, backfilling figmaNodeUrl entries in component-review-status.json.

#### Scenario: differences are routed by category

- **WHEN** a figma-only story has one token value change and one node addition
- **THEN** the report routes the token change to the Late-Arriving Authoritative Source Pass and marks the node addition for manual handling, and no product source file is modified

#### Scenario: consent gates the only non-report write

- **WHEN** the mapping pass discovers a node URL missing from component-review-status.json
- **THEN** the skill asks the user before writing the backfilled entry and writes nothing to that file without consent

---
### Requirement: Baseline promotion guidance

The skill SHALL NOT promote baselines automatically. After the user confirms that sync-back changes were applied and the story re-exported, the skill SHALL instruct the promote call for each affected storyId. When a mapped story's Figma shared generatedAt differs from the baseline generatedAt, the report header MUST flag the baseline as stale for that story before presenting its classification.

#### Scenario: stale baseline is flagged

- **WHEN** a mapped node's shared storybook/generatedAt does not equal the baseline payload's generatedAt
- **THEN** the report flags that story's baseline as stale in the header and still presents the classification

#### Scenario: no automatic promotion

- **WHEN** a sync-back run completes with figma-only findings
- **THEN** the synced baseline files are unchanged and the report ends with the promote instructions for the user
