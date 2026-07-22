## MODIFIED Requirements

### Requirement: The skill separates reusable orchestration from project-specific contracts

The repository SHALL provide an `agent-automation-orchestrate` skill whose core workflow covers bootstrap, guide, run, resume, and status modes. The skill MUST keep vendor-neutral runner control, validation, fallback, and durable summaries reusable while requiring project-specific instructions, verification commands, artifacts, and optional companion skills to live in a project contract. The guide mode MUST produce the same project contract schema as bootstrap and MUST NOT alter the behavior of the other four modes.

#### Scenario: Bootstrap a previously unsupported project

- **WHEN** an operator invokes the skill in a repository without `.agent-automation/config.json`
- **THEN** the skill inspects the repository before proposing a project contract
- **AND** the proposed contract contains project-specific tasks and verification instead of framework assumptions
- **AND** no paid agent process starts during bootstrap

#### Scenario: Use a project-specific companion skill

- **WHEN** a task contract names a project skill such as `component-coverage-implement`
- **THEN** the orchestration prompt instructs the selected runner to load that skill
- **AND** the generic orchestration scripts do not duplicate the companion skill's domain rules

#### Scenario: A designer request routes to guide mode

- **WHEN** a user describes a desired automation in scenario language without naming a technical mode
- **THEN** the skill resolves the request to guide mode instead of bootstrap
- **AND** the produced contract validates with the same validation script bootstrap output uses
- **AND** an operator request naming bootstrap, run, resume, or status still resolves to that mode unchanged
