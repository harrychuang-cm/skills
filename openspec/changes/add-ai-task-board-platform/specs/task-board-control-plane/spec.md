## ADDED Requirements

### Requirement: Lifecycle board columns

The control plane SHALL present task cards in exactly five lifecycle columns: Claimable (待領取), Running (執行中), Needs Attention (需要處理), Awaiting Review (待確認), and Done (完成). Card placement SHALL be derived from recorded system events. The board SHALL NOT offer direct column editing except through the human intervention commands defined in this spec. The pipeline stage of the underlying project SHALL be displayed as progress metadata inside the card, never as a board column.

#### Scenario: Cards move on system events only

- **WHEN** a worker reports a run phase change for a card
- **THEN** the card moves to the column mapped to that event without any human action, and the transition is recorded in the card history with a timestamp

##### Example: event-to-column mapping

| Reported event | Resulting column |
| --- | --- |
| lease granted | Running |
| run completed, review gate pending | Awaiting Review |
| run completed, no review gate | Done |
| verification-failed | Needs Attention |
| exhausted (all runners failed) | Needs Attention |
| lease expired (missed heartbeats) | Needs Attention |

#### Scenario: Direct drag between automated columns is rejected

- **WHEN** a member attempts to drag a card between Claimable, Running, and Done
- **THEN** the board rejects the move and the card remains in its event-derived column

### Requirement: Card origins

The control plane SHALL support card creation by an authenticated member and by pipeline chaining. When a card's run reports completed and the project's task chain configuration declares a successor task, the control plane SHALL automatically create the successor card in Claimable with origin recorded as pipeline-chain.

#### Scenario: Manual creation

- **WHEN** an authenticated member creates a card specifying a project, a task id from that project's automation config, and an optional instruction note
- **THEN** the card appears in Claimable with the member recorded as creator

#### Scenario: Pipeline chaining creates the successor card

- **WHEN** a card reports completed and the project's task chain declares a successor task for it
- **THEN** a new card for the successor task is created in Claimable with origin pipeline-chain and auto-run enabled

### Requirement: Exclusive lease with attribution

The control plane SHALL expose a claim API that grants at most one active lease per card using an atomic compare-and-swap. A granted lease SHALL record the attribution triple: member, machine, and runner id. The board SHALL display the attribution triple on the card while it is Running. Cards whose auto-run flag is disabled SHALL NOT be offered to workers until a member approves them on the board; the approval SHALL be recorded with the approving member's identity.

#### Scenario: Concurrent claim resolves to one winner

- **WHEN** two workers attempt to claim the same Claimable card concurrently
- **THEN** exactly one worker receives the lease, the other receives a conflict response, and the card enters Running showing the winning attribution triple

#### Scenario: Unapproved card is not offered

- **WHEN** a worker polls for work while a card with auto-run disabled has no recorded approval
- **THEN** that card is excluded from the worker's poll response

### Requirement: Heartbeat expiry

Active leases SHALL require periodic worker heartbeats. When no heartbeat arrives within the configured expiry window, the control plane SHALL expire the lease and move the card to Needs Attention with the reason recorded as possibly-stopped, retaining the last known attribution. An expired card SHALL NOT be re-offered to workers until a member issues a rerun command.

#### Scenario: Laptop goes offline mid-run

- **WHEN** a Running card receives no heartbeat past the expiry window
- **THEN** the card moves to Needs Attention with the expiry reason and the last known attribution triple still visible

### Requirement: Human intervention as commands

Human actions on cards SHALL be interpreted as commands, not state edits, and SHALL be limited to two: rerun and approve. Rerun — dragging a card out of Needs Attention or Awaiting Review — SHALL create a new run directive for the card carrying the member's optional adjustment note, and the card SHALL re-enter Claimable; the directive SHALL be delivered to the executing worker as a resume request referencing the previous run id. Approve — accepting a card in Awaiting Review — SHALL move the card to Done. Every intervention SHALL be recorded with the acting member's identity and note.

#### Scenario: Approve rework with an adjustment note

- **WHEN** a member drags a card from Awaiting Review back into the workflow after entering the note "adopt option B spacing"
- **THEN** the card enters Claimable, and the next execution of that card carries the note and the previous run id as a resume request, and the card history records the member and note

#### Scenario: Approve closes the card

- **WHEN** a member approves a card in Awaiting Review
- **THEN** the card moves to Done and the card history records the approving member

### Requirement: Authenticated access

All board pages and control plane APIs SHALL require an authenticated session via Google OAuth restricted to a configured email allowlist. Worker API endpoints SHALL authenticate with worker tokens issued to a specific member. Every mutating action SHALL be attributed to the authenticated member or the member owning the worker token.

#### Scenario: Non-allowlisted account is denied

- **WHEN** a Google account not on the allowlist completes the OAuth flow
- **THEN** the control plane denies access and exposes no board data

### Requirement: Run log visibility

The card detail view SHALL display uploaded log chunks for the active and past runs in upload order without requiring a page reload, together with run history entries showing run id, phase, verification counts, and attribution. The control plane SHALL store only logs already masked by the worker and SHALL delete log chunks older than the configured retention period.

#### Scenario: Watching a run live

- **WHEN** a worker uploads successive log chunks during a run
- **THEN** a member viewing the card detail sees the chunks appended in order without reloading the page
