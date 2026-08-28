## ADDED Requirements

### Requirement: Per-platform targets on component metadata

The storybook-integration reference SHALL define an optional targets field on each meta.components entry, an object with optional web, ios, and android keys. A string value names the corresponding production component, view, or composable; an explicit null records that the platform needs a newly built counterpart; an absent key records that the platform is out of scope for that entry. Entries without a targets field SHALL remain valid.

#### Scenario: Cross-platform component entry

- **WHEN** a meta.components entry declares targets with web naming an existing shared component, ios set to null, and no android key
- **THEN** consumers read that the web counterpart exists, the iOS counterpart needs to be built, and Android is out of scope for that entry

##### Example: targets interpretations

| targets value | Meaning |
| ------------- | ------- |
| { "web": "SharedButton" } | web maps to SharedButton; ios and android out of scope |
| { "web": "SharedButton", "ios": null } | web exists; iOS counterpart must be built |
| absent | mapping unchanged from the single-target contract |

### Requirement: Per-target scope columns on the frontend map

The production-handoff reference and the PRODUCTION_HANDOFF template SHALL support two forms of the Prototype To Frontend Map scope column: a single Scope column for single-target deliveries, and separate Scope(web) and Scope(app) columns for multi-target deliveries, each cell holding one of A, B, C, or U with the existing semantics. validate_prototype.py SHALL accept both forms, validate every scope cell value in either form, and SHALL NOT require the multi-column form for single-target handoffs.

#### Scenario: Multi-target row with divergent scopes

- **WHEN** a map row records Scope(web) A and Scope(app) B for the same region
- **THEN** validation passes and the handoff communicates that the web surface already ships while the app surface must be built

#### Scenario: Single-target handoff unchanged

- **WHEN** a web-only handoff uses the single Scope column
- **THEN** validation passes without requiring per-target columns
