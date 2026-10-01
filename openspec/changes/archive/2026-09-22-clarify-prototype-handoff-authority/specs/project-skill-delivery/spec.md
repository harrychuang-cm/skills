## ADDED Requirements

### Requirement: Project Skill Delivery

The installer SHALL support opt-in --record-usage only with project scope and an explicit skill list excluding all. Selected skills SHALL be recorded as declared used, required dependencies as dependencies with roles. Dependency closure SHALL include ds-governance for frontend and ds-governance plus frontend support for native, and SHALL NOT install next-stage skills merely because they are named receivers. Missing selections, missing dependencies, cycles, malformed managed markers and nonportable symlinks SHALL fail before writes. Without the flag existing installation behavior SHALL remain unchanged. Dry-run SHALL write nothing.

#### Scenario: Native delivery closure
- **WHEN** native-product-implementation is selected with record-usage
- **THEN** the delivery SHALL contain native, frontend support and ds-governance, and SHALL NOT add production-data-integration

#### Scenario: Invalid selection
- **WHEN** a selected skill is missing or record-usage uses user scope
- **THEN** the installer SHALL report an error without changing any destination files

### Requirement: Skill usage provenance

Successful recorded installation SHALL upsert docs/SKILL_USAGE.json with source identity, Git commit or null, dirty state, content hashes, roles and project-relative installation paths. Source and installed content hashes SHALL match before success is recorded. Subsequent runs SHALL preserve prior records and upgrade a dependency explicitly selected as used. CLAUDE.md and AGENTS.md SHALL use bounded managed blocks linking repo copies, preserve all other bytes, and avoid duplicate blocks on rerun. Identical runs SHALL be idempotent. Delivery SHALL NOT auto-commit or claim publication.

#### Scenario: Repeated delivery and new clone
- **WHEN** recorded skills are installed twice and the generated files are committed in an isolated test repo then cloned elsewhere
- **THEN** the second install SHALL leave identical content and all skill, support and managed-block relative links SHALL resolve in the clone

#### Scenario: Local source edits
- **WHEN** source bytes change without a new commit
- **THEN** the recorded content hash SHALL change and SHALL NOT present the Git commit as an exact description of the modified content
