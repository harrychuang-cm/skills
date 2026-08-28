## MODIFIED Requirements

### Requirement: Implementation map contract

The frontend-product-implementation verification-reporting reference SHALL require the implementation pass to write an IMPLEMENTATION_MAP.md with five fixed sections: Consumed Manifest, recording the consumed manifest docs hash and changelog version or the literal text unversioned; Route Outcomes, a table mapping every handoff route id to one of implemented, existing-verified with an evidence path, or deferred with a reason; Acceptance Traceability, the table defined by the acceptance-traceability capability; Data Adapter Seams, a table mapping every fixture group to its interface name and mock implementation path; and Component Map, holding an optional lead-in bullet `- source: <description or none>` followed by a table with columns Handoff component, Resolution, Production component, Evidence, and Notes — one row per in-scope handoff component per the component-reuse-map capability, Resolution being one of reused, composed, extended, created, or deferred, and Evidence holding repo-relative paths separated by commas, no path containing a comma.

#### Scenario: Map produced at completion

- **WHEN** the frontend-product-implementation pass finishes a feature
- **THEN** IMPLEMENTATION_MAP.md exists with all five sections filled from the actual implementation

#### Scenario: Component map without inventory source

- **WHEN** the handoff provides no component inventory
- **THEN** the Component Map section contains `- source: none` and no table rows, and the map still satisfies the contract

---
### Requirement: Machine audit of the implementation map

A stdlib-only script, frontend-product-implementation/scripts/validate_implementation.py, SHALL accept a handoff docs directory, an IMPLEMENTATION_MAP.md path, and a production repo root, and SHALL check: that every route id in the handoff manifest (or, absent a manifest, in the map itself) has a terminal outcome; that every existing-verified row's evidence path exists under the production repo root; that every AC-P criterion tagged assembly appears in the traceability section with a result other than deferred; that the consumed manifest hash equals the current manifest hash; that the Component Map section exists; and, unless that section records `- source: none` with no table rows, that every Component Map row's Resolution is one of reused, composed, extended, created, or deferred, that every comma-separated Evidence path on reused, composed, extended, and created rows exists under the production repo root, and that created and deferred rows carry a non-empty Notes cell. Every failed check SHALL be listed with its subject, and any failure SHALL produce a non-zero exit code; a clean run SHALL exit 0.

#### Scenario: Missing route outcome

- **WHEN** the manifest lists route ids entry, detail, and settings but the Route Outcomes table covers only entry and detail
- **THEN** the script lists settings as lacking a terminal outcome and exits non-zero

#### Scenario: Stale consumed manifest

- **WHEN** the handoff documents changed after ingestion so the current manifest hash differs from the Consumed Manifest hash
- **THEN** the script reports handoff drift, lists the current changelog version against the consumed version, and exits non-zero

#### Scenario: Clean implementation map

- **WHEN** every route id has an outcome, every evidence path resolves, every assembly-tagged AC-P criterion is non-deferred, the manifest hashes match, and every Component Map row passes its checks
- **THEN** the script exits 0

#### Scenario: Component map violations reported

- **WHEN** a Component Map row carries the Resolution value ported, or a reused row's Evidence path does not exist under the production root, or a created row has an empty Notes cell
- **THEN** the script lists each violating row with its Handoff component subject and exits non-zero

##### Example: audit verdicts

| Condition | Verdict |
| --------- | ------- |
| Route id without outcome row | error |
| existing-verified evidence path absent from repo | error |
| AC-P (assembly) recorded as deferred | error |
| AC-P (integration) recorded as deferred with owner | pass |
| Consumed hash differs from current manifest | error |
| Component Map section missing | error |
| Component Map row with Resolution outside the five values | error |
| reused row Evidence path absent from repo | error |
| created row with empty Notes | error |
| `- source: none` with no rows | pass |
