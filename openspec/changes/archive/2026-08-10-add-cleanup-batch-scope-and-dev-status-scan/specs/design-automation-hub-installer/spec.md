## ADDED Requirements

### Requirement: Plugin captures a batch of cleanup scopes and rejects overlapping or oversized batches

The Plugin sandbox SHALL accept a capture request that resolves one or more cleanup scopes, sourced either from the current page selection or from an explicit list of node identifiers. Each resolved scope MUST be a Section, Frame, Component, or Component Set, and each scope MUST be snapshotted independently under the existing 500-node and 1MB limits, producing its own snapshot and its own SHA-256 input snapshot hash.

The capture SHALL fail as a whole, returning a single stable error code and no scopes, when the source resolves to zero nodes, when any resolved node is an ancestor or descendant of another resolved node, or when the resolved node count exceeds the batch limit of 10. The capture MUST NOT silently drop, deduplicate, or collapse overlapping nodes into an outermost node.

The capture SHALL fail per scope, returning the successful scopes together with a rejection list carrying node identifier, name, and stable error code, when an individual node has an unsupported type, exceeds the node or byte limit, or cannot be snapshotted. When every resolved node is rejected, the capture SHALL report overall failure using the first rejection's error code.

#### Scenario: Two disjoint sections are captured as two scopes

- **WHEN** the current page selection contains two Sections and neither contains the other
- **THEN** the capture succeeds and returns two scopes
- **AND** each scope carries its own node count, snapshot, and input snapshot hash
- **AND** the two input snapshot hashes differ

#### Scenario: Ancestor and descendant selected together rejects the whole batch

- **WHEN** the current page selection contains a Section and a Frame nested inside that Section
- **THEN** the capture reports overall failure with the overlapping-scope error code
- **AND** no scope is returned

#### Scenario: One unsupported node does not block the rest of the batch

- **WHEN** the selection contains one Section, one Component, and one text node
- **THEN** the capture succeeds and returns two scopes for the Section and the Component
- **AND** the rejection list contains one entry for the text node with the unsupported-scope error code

##### Example: Batch-level and scope-level outcomes

| Source nodes | Overall result | Scopes returned | Rejections |
| ------------ | -------------- | --------------- | ---------- |
| empty selection | failure, scope-required code | 0 | 0 |
| 2 disjoint Sections | success | 2 | 0 |
| Section + Frame inside it | failure, overlapping-scope code | 0 | 0 |
| 11 disjoint Sections | failure, batch-limit code | 0 | 0 |
| Section + text node | success | 1 | 1 |
| 2 text nodes | failure, unsupported-scope code | 0 | 2 |

### Requirement: Plugin scans the current page for Ready for dev cleanup candidates

The Plugin sandbox SHALL provide a scan that traverses only the current page and returns every outermost node whose type is Section, Frame, Component, or Component Set and whose Figma Dev Mode status is Ready for dev. Once a node is reported as a candidate the scan MUST NOT descend into its children, so the returned candidates are guaranteed to be mutually non-overlapping. The scan SHALL return at most 50 candidates and MUST report whether the result was truncated.

The scan SHALL read the Dev Mode status defensively and MUST treat a missing or non-object status property as not marked, rather than failing. A scan that finds no candidate SHALL return an empty candidate list with a successful result, and the Plugin UI MUST present this as an empty result rather than an error while keeping manual selection available.

The scan MUST NOT load, traverse, or report nodes on any page other than the current page.

#### Scenario: Outermost marked section suppresses its marked children

- **WHEN** a Section marked Ready for dev contains a Frame that is also marked Ready for dev
- **THEN** the scan returns exactly one candidate for the Section
- **AND** the nested Frame is not returned as a candidate

#### Scenario: No marked node yields an empty successful scan

- **WHEN** the current page contains no node marked Ready for dev
- **THEN** the scan succeeds with an empty candidate list
- **AND** the UI states that no Ready for dev scope exists on the current page
- **AND** manual selection remains available

#### Scenario: Missing Dev Mode status property does not fail the scan

- **WHEN** a traversed node exposes no Dev Mode status property
- **THEN** that node is treated as not marked
- **AND** the scan completes successfully for the remaining nodes

### Requirement: Batch capture creates one automation task per scope and preserves per-scope apply safety

The Plugin UI SHALL create exactly one `figma-cleanup` automation task per captured scope, sending one request per scope to the existing task creation endpoint with that scope's snapshot and input snapshot hash. The UI MUST NOT send more than one scope in a single task creation request and MUST NOT require any new Coordinator endpoint. The idempotency key of each request MUST remain unique per scope by continuing to incorporate that scope's input snapshot hash.

When one task creation request fails, the UI SHALL retain the already created tasks and present the failed scope as retryable, and MUST NOT cancel or roll back the tasks it already created.

The UI SHALL present a batch list showing each task's scope name and status, and SHALL open a single task's plan, selection, confirmation, and apply flow when that task is opened. When a batch contains exactly one task, the UI SHALL open that task's detail view directly. Applying a plan MUST remain a per-scope action that revalidates that scope's snapshot hash immediately before mutation and requires explicit human confirmation; the UI MUST NOT apply plans for multiple scopes from a single confirmation.

#### Scenario: Three captured scopes create three tasks

- **WHEN** analysis starts for a batch of three captured scopes
- **THEN** three separate task creation requests are sent
- **AND** each request carries exactly one scope and that scope's input snapshot hash
- **AND** the batch list shows three entries with their own statuses

#### Scenario: One failed creation preserves the others

- **WHEN** the second of three task creation requests fails
- **THEN** the first and third tasks remain present in the batch list
- **AND** the second scope is presented as retryable
- **AND** no already created task is cancelled

#### Scenario: Apply still requires confirmation for each scope

- **WHEN** a batch contains two tasks whose plans are both ready
- **THEN** applying the first task's plan confirms and mutates only that task's scope
- **AND** the second task's scope is not mutated until it is separately confirmed

#### Scenario: Single-scope batch keeps the existing single-task experience

- **WHEN** a batch contains exactly one task
- **THEN** the UI opens that task's detail view directly without an intermediate list step
