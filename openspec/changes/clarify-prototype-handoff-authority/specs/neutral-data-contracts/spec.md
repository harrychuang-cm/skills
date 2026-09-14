## MODIFIED Requirements

### Requirement: JSON Schema sections in DATA_SPEC

The DATA_SPEC.md template SHALL contain a Data Schemas (JSON Schema) section holding one fenced JSON code block per fixture group, describing the UI entity and state enumeration or the source-backed transport shape identified by Data Authority. The data-contract reference SHALL require authoring schema blocks whenever fixture groups change. UI schemas SHALL generate UI and mock types only; request, response and error DTOs SHALL require confirmed transport evidence. Fake sample values SHALL NOT determine a backend schema.

#### Scenario: Fixture group with schema block
- **WHEN** a prototype defines a fixture group for route content
- **THEN** DATA_SPEC SHALL contain a parseable JSON schema for that group with its state enumeration and Data Authority classification

#### Scenario: Fake values under confirmed transport schema
- **WHEN** fixture values are fake and their transport schema has confirmed source evidence
- **THEN** receivers SHALL use the confirmed schema for transport types while retaining fake classification for the fixture values
