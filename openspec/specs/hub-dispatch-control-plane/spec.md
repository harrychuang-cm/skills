# hub-dispatch-control-plane Specification

## Purpose

TBD - created by archiving change 'bridge-hub-cleanup-to-task-board'. Update Purpose after archive.

## Requirements

### Requirement: Hub origin cards are created unapproved and review gated

The control plane SHALL accept card creation from the Design Automation Hub over a token authenticated endpoint and SHALL record the card with a dedicated Design Automation Hub origin. Such a card SHALL be created in Claimable with auto-run disabled and with the review gate enabled regardless of the project's task chain configuration, and SHALL record the automation task id supplied by the Hub. The card SHALL NOT be offered to workers until a member approves it, and the approval SHALL be recorded with the approving member's identity.

The control plane SHALL store no Figma file key, no cleanup snapshot content, and no access code from the Hub. The only Hub-supplied free text stored on the card SHALL be the runner request note.

#### Scenario: Hub card waits for approval

- **WHEN** the Hub creates a card for a cleanup task
- **THEN** the card appears in Claimable with auto-run disabled and the review gate enabled
- **AND** a polling worker is not offered that card

#### Scenario: Approved Hub card becomes claimable

- **WHEN** a member approves a Hub card on the board
- **THEN** the card becomes eligible for claiming and the approving member is recorded

#### Scenario: Review gate cannot be disabled by chain configuration

- **WHEN** the project's task chain declares that the cleanup task requires no review
- **THEN** a Hub card for that task is still created with the review gate enabled

---
### Requirement: Hub card creation is idempotent per automation task

The control plane SHALL treat the pair of project and Hub automation task id as the idempotency key for Hub card creation. A repeated creation request carrying an automation task id that already has a card in that project SHALL return the existing card and SHALL NOT create a second card.

#### Scenario: Resend creates no second card

- **WHEN** the Hub sends the same creation request twice for one automation task id
- **THEN** both responses name the same card id and the project has exactly one card for that automation task id

##### Example: repeated creation outcomes

| Request sequence | Cards in project | Response |
| --- | --- | --- |
| first create for automation task A | 1 | card A, created true |
| second create for automation task A | 1 | card A, created false |
| create for automation task B | 2 | card B, created true |

---
### Requirement: Hub cards are offered only to machines advertising their input

The claim API SHALL accept an optional list of Hub automation task ids that the requesting machine can read locally. A card carrying no Hub automation task id SHALL remain eligible regardless of that list. A card carrying a Hub automation task id SHALL be excluded from the candidate set unless that id appears in the list supplied by the requesting machine. An absent or empty list SHALL exclude every Hub card.

#### Scenario: Machine without the input is not offered the card

- **WHEN** an approved Hub card exists and a worker polls without advertising that card's automation task id
- **THEN** the card is excluded from that worker's candidates and remains in Claimable

#### Scenario: Machine with the input can claim

- **WHEN** an approved Hub card exists and a worker polls advertising that card's automation task id
- **THEN** the card is a claim candidate for that worker

#### Scenario: Member and chain cards are unaffected

- **WHEN** a worker polls without advertising any Hub automation task id
- **THEN** claimable member-created and pipeline-chain cards are still offered

##### Example: candidate eligibility

| Card origin | Card automation task id | Advertised ids | Offered |
| --- | --- | --- | --- |
| member | none | empty | yes |
| pipeline chain | none | contains other-id | yes |
| Design Automation Hub | task-1 | empty | no |
| Design Automation Hub | task-1 | contains task-1 | yes |
| Design Automation Hub | task-1 | contains task-2 | no |

---
### Requirement: Hub apply outcome moves only awaiting review cards

The control plane SHALL expose a token authenticated endpoint that records the Hub's Plugin apply outcome for one card. When the card is Awaiting Review, an applied outcome SHALL move the card to Done and a failed outcome SHALL move it to Needs Attention with the attention reason recorded as a Hub apply failure. When the card is in any other column, the endpoint SHALL record the outcome in the card history without moving the card and SHALL report that the outcome was not applied.

These two outcome events SHALL be added to the closed card event table; no other transition SHALL be introduced.

#### Scenario: Applied outcome closes the card

- **WHEN** the Hub reports an applied outcome for a card in Awaiting Review
- **THEN** the card moves to Done and the card history records the Hub outcome

#### Scenario: Failed outcome returns the card to the human inbox

- **WHEN** the Hub reports a failed outcome for a card in Awaiting Review
- **THEN** the card moves to Needs Attention with a Hub apply failure reason

#### Scenario: Outcome on an already closed card records history only

- **WHEN** a member has already approved the card to Done and the Hub then reports an outcome
- **THEN** the card stays in Done, the card history records the outcome, and the response reports that the outcome was not applied

---
### Requirement: Attention reasons come from a closed set

The worker result report SHALL accept an optional attention reason. The control plane SHALL apply that reason only when the reported phase places the card in Needs Attention, and SHALL reject any value outside the closed set of possibly-stopped, verification-failed, exhausted, hub-input-missing, and hub-apply-failed. When no reason is supplied, the control plane SHALL keep deriving the reason from the reported phase as it does today.

#### Scenario: Worker supplied reason is recorded

- **WHEN** a worker reports a terminal failure for a Hub card together with the hub-input-missing reason
- **THEN** the card moves to Needs Attention and its attention reason is hub-input-missing

#### Scenario: Unknown reason is rejected

- **WHEN** a report supplies an attention reason outside the closed set
- **THEN** the control plane rejects the request and the card does not move

---
### Requirement: Hub cards direct review to the Figma Plugin

The board SHALL present a Hub origin card in Awaiting Review with copy stating that the cleanup plan is confirmed in the Figma Plugin. Until the Hub reports an applied outcome, the board MUST NOT describe a Hub card as an engineering task that is finished. The board approve action SHALL remain available for Hub cards and SHALL be accompanied by that Plugin-directed copy.

#### Scenario: Awaiting review copy points to the Plugin

- **WHEN** a member views a Hub card in Awaiting Review
- **THEN** the card states that the cleanup plan is confirmed in the Figma Plugin

#### Scenario: Plan ready is not shown as completed work

- **WHEN** a Hub card is in Awaiting Review and no applied outcome has been reported
- **THEN** the board does not describe the card as a completed engineering task
