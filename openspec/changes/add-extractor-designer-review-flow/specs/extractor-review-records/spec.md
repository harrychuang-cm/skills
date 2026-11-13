## Purpose

Define how design-system-extractor records review decisions, keeping an AI suggestion distinct from a designer-confirmed decision, and how every tool decides whether a near-token pair is resolved. One set of rules governs the token audit, the review page, and the status surfaces that read them, so a decision is never counted as made when it was not.

## ADDED Requirements

### Requirement: One resolution implementation for near-token decisions

The token audit and the review generator SHALL decide whether a near reference-token pair is resolved through the same resolution implementation. For any package, the number of unresolved near pairs the token audit reports SHALL equal the number the review generator reports in its machine-readable output.

#### Scenario: Audit and review generator agree on every package

- **WHEN** the token audit and the review generator's machine-readable mode run against the same package
- **THEN** the audit's count of token review candidates equals the review output's count of unresolved near pairs

#### Scenario: An accessibility remap pair is resolved on both surfaces

- **WHEN** two near reference colors are documented only by an `a11y-remap` comment on one of the two tokens
- **THEN** the token audit counts the pair as documented and the review generator reports the pair as confirmed

##### Example: remap pair

- **GIVEN** `--md-ref-color-green-45: #13895f` carrying the comment `a11y-remap: authored #13895f fails AA as text` and `--md-ref-color-green-44: #12845b`, with no row in the Near Token Decisions table
- **WHEN** both tools run
- **THEN** the audit reports 0 token review candidates and the review output reports 0 unresolved near pairs


### Requirement: Token names match exactly

A decision record SHALL apply to a token only when the token's complete name appears in the record. A token name that is a leading part of a longer token name SHALL NOT match that longer name.

#### Scenario: A decision about longer names leaves the shorter names undecided

- **WHEN** the only decision record names `--md-ref-size-18` and `--md-ref-size-20`, and `--md-ref-size-1` and `--md-ref-size-2` are also a near pair
- **THEN** the pair `--md-ref-size-18` / `--md-ref-size-20` is resolved and the pair `--md-ref-size-1` / `--md-ref-size-2` is unresolved

##### Example: four sizes, one decision

- **GIVEN** reference tokens `--md-ref-size-1: 1px`, `--md-ref-size-2: 2px`, `--md-ref-size-18: 18px`, `--md-ref-size-20: 20px` and one table row whose candidates are `--md-ref-size-18` and `--md-ref-size-20` with decision `keep distinct`
- **WHEN** the token audit runs
- **THEN** it reports 1 token review candidate and 1 documented review decision


### Requirement: Decisions are read from the decision column and pending markers are not decisions

For a row of a table that has a decision column, resolution SHALL be read from that column only. A decision cell that is empty or holds a pending marker SHALL be unresolved, whatever the other cells of the row contain. Pending markers SHALL be evaluated before decision keywords.

#### Scenario: A suggestion in another column does not resolve the row

- **WHEN** a row has `merge` in its Suggested action cell and an empty Decision cell
- **THEN** every near pair that row covers is unresolved

#### Scenario: A pending marker written in the report language is unresolved

- **WHEN** a row's Decision cell holds `待確認`
- **THEN** every near pair that row covers is unresolved

##### Example: decision cell values

| Decision cell | Resolved |
| --- | --- |
| `keep distinct` | yes |
| `merge into --md-ref-size-16` | yes |
| `keep distinct（保留區分）` | yes |
| (empty) | no |
| `pending` | no |
| `n/a` | no |
| `待確認` | no |
| `needs review` | no |


### Requirement: An AI suggestion stays pending until a designer confirms it

In a Near Token Decisions table that has both a Suggested action column and a Confirmed by column, a row SHALL count as resolved only when its Decision cell holds a decision and its Confirmed by cell names a confirmer. A Confirmed by cell that is empty, or that holds a pending marker, names no confirmer. A near pair covered only by a suggested action SHALL be reported as awaiting designer confirmation. In strict mode the token audit SHALL exit with a failure status while any near pair is unresolved or awaiting confirmation, and its output SHALL state how many pairs are awaiting confirmation.

#### Scenario: A suggested pair fails the strict audit

- **WHEN** a package's only near pair has a row with Suggested action `keep distinct`, an empty Decision cell and an empty Confirmed by cell, and the token audit runs in strict mode
- **THEN** the audit exits with a failure status and reports 1 pair awaiting designer confirmation

#### Scenario: A decision without a confirmer is not resolved

- **WHEN** a row in a table that has both a Suggested action column and a Confirmed by column holds Decision `keep distinct` and an empty Confirmed by cell
- **THEN** the near pairs that row covers are unresolved

#### Scenario: A confirmer cell that says the confirmation is pending names no confirmer

- **WHEN** a row in a table that has both a Suggested action column and a Confirmed by column holds Decision `keep distinct` and Confirmed by `pending designer review`
- **THEN** the near pairs that row covers are unresolved

#### Scenario: A confirmed row resolves its pairs

- **WHEN** a row holds Decision `keep distinct` and Confirmed by `designer via review.html 2026-11-13`
- **THEN** every near pair among that row's candidates is resolved


### Requirement: Near values are not merged before confirmation

When an extraction finds near reference values, the skill SHALL keep each value as its own reference token, record a suggested action with provenance and rationale, and leave the Decision and Confirmed by cells unfilled. The skill SHALL NOT merge, round, or remove any near value until a designer confirms a merge, either through the prompt exported by the review page or through an explicit answer in the conversation. A confirmation given in the conversation SHALL be recorded with the same Decision and Confirmed by cells.

#### Scenario: Extraction records a suggestion and keeps both tokens

- **WHEN** an extraction finds reference sizes `15px` and `16px` in the same family
- **THEN** both reference tokens exist in the reference token file, a Near Token Decisions row lists both with a suggested action, and the row's Decision and Confirmed by cells are empty

#### Scenario: An answer in the conversation counts as confirmation

- **WHEN** the user answers in the conversation that the two sizes stay separate
- **THEN** the skill records Decision `keep distinct` and a Confirmed by value naming the conversation and the date


### Requirement: Near Token Decisions rows carry one action and keep merged values

A row of a Near Token Decisions table that has both a Suggested action column and a Confirmed by column SHALL list two or more candidates as backtick-quoted entries, each a reference token name or, for a value that is not a token, the raw value. The Suggested action and Decision cells SHALL each hold exactly one action: `keep distinct`, or `merge into` followed by one backtick-quoted surviving token. A group whose members have different outcomes SHALL be recorded as one row per outcome. When a row's action is a merge, each candidate token SHALL be followed by its value in parentheses, so the merged value remains recorded after its token is removed.

#### Scenario: A merged value survives the removal of its token

- **WHEN** a confirmed row records `--md-ref-size-15` (15px) merged into `--md-ref-size-16` (16px) and the merge has been applied
- **THEN** the review output still lists `15px` as a value merged into `--md-ref-size-16`

#### Scenario: A raw value equal to the surviving token's value is not a merged value

- **WHEN** a recorded row names the raw values `6px` and `8px` as merged into `--sl-ref-radius-8`, and that token's value is `8px`
- **THEN** the review output lists `6px` as the only value merged into `--sl-ref-radius-8`

#### Scenario: A group with mixed outcomes uses one row per outcome

- **WHEN** a group of four near values has one value merged into another and two values kept
- **THEN** the merge is recorded in one row and the kept values in a separate `keep distinct` row


### Requirement: Existing packages stay compatible

A Near Token Decisions table that lacks the Suggested action column or the Confirmed by column SHALL resolve from its decision column alone, whatever a Confirmed by cell in it holds. A Suggested action cell in such a table SHALL still be read as a suggestion, so a row with a suggestion and no decision is awaiting designer confirmation. A line outside any table, and a row of a table that has no decision column, SHALL resolve a pair when it names both tokens exactly, contains a decision keyword, and contains no pending marker. `token-review:` CSS comments and `a11y-remap` records SHALL resolve pairs as they did before this capability existed.

#### Scenario: A legacy table row resolves without a confirmer

- **WHEN** a table with the columns Candidate tokens, Family, Decision and Rationale holds a row naming two near tokens with Decision `keep distinct`
- **THEN** the pair is resolved

#### Scenario: A table with a confirmer column and no suggestion column resolves from its decision column

- **WHEN** a table with the columns Candidate A, Candidate B, Difference, Decision, Rationale and Confirmed by holds a row naming two near tokens with Decision `keep distinct` and an empty Confirmed by cell
- **THEN** the pair is resolved

#### Scenario: A table with a suggestion column and no confirmer column resolves from its decision column

- **WHEN** a table with the columns Candidate A, Candidate B, Match type, Suggested action, Developer decision and Rationale holds a row naming two near tokens with Developer decision `keep distinct`
- **THEN** the pair is resolved

#### Scenario: A suggestion without a decision waits in a table that has no confirmer column

- **WHEN** a table with the columns Candidate A, Candidate B, Match type, Suggested action, Developer decision and Rationale holds a row naming two near tokens with Suggested action `merge into` followed by one of the two tokens and an empty Developer decision cell
- **THEN** the pair is awaiting designer confirmation

#### Scenario: A legacy prose line resolves a pair

- **WHEN** a bullet line outside any table names both tokens of a near pair exactly and contains `keep distinct`
- **THEN** the pair is resolved

#### Scenario: A legacy line that says the decision is pending does not resolve

- **WHEN** a line outside any table names both tokens of a near pair and contains both `merge` and `待確認`
- **THEN** the pair is unresolved

#### Scenario: A token-review comment still resolves

- **WHEN** one token of a near pair carries the CSS comment `token-review: keep-distinct; 13px is the disclaimer floor`
- **THEN** the pair is resolved


### Requirement: Similar-component rows record a screenshot and region for both sides

The Visual reference cell of a Component Similarity Review row SHALL accept two images: the first for the new candidate and the second for the similar existing component. Each image reference SHALL be allowed to carry the compared region as a media-fragment `xywh` value, in percent of the image or in pixels. A reference whose fragment cannot be parsed SHALL be treated as having no region. The skill SHALL record the full screenshot with a region in preference to a pre-cropped image whenever the full capture exists. A row that lacks the second image or lacks a region SHALL produce a component-audit warning and SHALL NOT change the strict audit result.

#### Scenario: Regions are read from image references

- **WHEN** a Visual reference cell holds two images with `xywh` fragments
- **THEN** the review output reports the first image with its region as the candidate side and the second image with its region as the existing side

##### Example: fragment forms

| Image reference | Region read |
| --- | --- |
| `assets/component-review/route-stock-1440.png#xywh=percent:9.2,20.5,30.4,4.4` | x 9.2%, y 20.5%, width 30.4%, height 4.4% |
| `assets/component-review/route-stock-1440.png#xywh=132,246,438,53` | 132px, 246px, 438px, 53px |
| `assets/component-review/route-stock-1440.png#xywh=pixel:132,246,438,53` | 132px, 246px, 438px, 53px |
| `assets/component-review/route-stock-1440.png#xywh=percent:wide` | no region |
| `assets/component-review/route-stock-1440.png` | no region |

#### Scenario: A row with one image keeps passing the strict audit

- **WHEN** a similarity row holds a decision and a single image without a region, and the component audit runs in strict mode
- **THEN** the audit passes and prints a warning that the existing side has no screenshot and the candidate side has no region


### Requirement: Review decisions are applied through an apply pass

When the user supplies the prompt exported by the review page, or answers review decisions explicitly in the conversation, the skill SHALL apply every decision it can: for a merge, repoint every system-token reference from the merged token to the surviving token and then remove the merged reference token; for a restore, re-create the value as its own reference token and correct the system and component mappings that use it. The skill SHALL then record the decision and its confirmer in the matching review table, re-run the three strict audits, regenerate both HTML documents, and report every decision it did not apply together with the reason.

#### Scenario: A confirmed merge is applied and recorded

- **WHEN** the prompt confirms merging `--md-ref-size-15` into `--md-ref-size-16`
- **THEN** no system token references `--md-ref-size-15`, the reference token file no longer declares it, the Near Token Decisions row holds the merge in its Decision cell with a non-empty Confirmed by cell and the value `15px`, and the three strict audits have been re-run

#### Scenario: A decision about a token that no longer exists is reported

- **WHEN** the prompt names a reference token that is absent from the reference token file
- **THEN** the skill reports that decision as not applied, states the reason, and applies the remaining decisions
