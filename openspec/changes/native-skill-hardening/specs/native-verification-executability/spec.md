## ADDED Requirements

### Requirement: Runnable walkthrough procedure

The verification reference SHALL give an executable procedure for the simulator and emulator walkthrough on each platform, covering device selection, building for that destination, installing, and launching. The completion bar SHALL be stated so that it is satisfiable in an environment without a simulator or emulator: the walkthrough is complete when it has been run, or when a recorded degraded substitute covers the same items and the uncovered gaps are listed. This SHALL remove the contradiction with the reference's own rule that unavailable commands are reported rather than silently skipped.

#### Scenario: Environment with a simulator

- **WHEN** a simulator is available
- **THEN** the agent follows the named procedure and reports the walkthrough result

#### Scenario: Environment without a simulator

- **WHEN** no simulator or emulator can run in this environment
- **THEN** the agent covers the walkthrough items with previews or tests, reports the substitution and the uncovered items, and the completion bar is not falsely claimed as satisfied

### Requirement: Precise verification commands

The verification order SHALL name commands precisely enough to run in a multi-module project: Android tasks SHALL be module-qualified and variant-specific rather than the bare aggregate task names, and iOS build and test invocations SHALL name the scheme and destination they require. Commands unavailable in the environment SHALL be named as such along with the closest check that did run.

#### Scenario: Multi-module Android project

- **WHEN** the repo contains several Gradle modules and only one is in scope
- **THEN** the verification runs the in-scope module's variant-qualified tasks rather than an aggregate task that builds or tests everything

### Requirement: Version and generator discovery

The repo discovery lists SHALL include where the minimum OS and SDK versions are declared and whether the project is produced by a project generator. The implementation SHALL gate API usage on the declared minimum version, choosing an available API or an availability-guarded path rather than an API newer than the floor.

#### Scenario: API newer than the deployment floor

- **WHEN** an implementation would use an API introduced after the project's minimum version
- **THEN** it selects an available alternative or guards the call, instead of raising the project's floor without approval

### Requirement: Full parity sweep on native

The verification reference SHALL restore the full parity sweep contract: comparison covers every surface scoped as new, uses the prototype's isolated route rendering mode to view the matching prototype route, excludes surfaces scoped as already shipping and as prototype-only, and requires saying which surfaces went unverified when the prototype cannot be run rather than reporting parity as passed.

#### Scenario: Prototype Storybook unavailable

- **WHEN** the prototype cannot be run from the native environment
- **THEN** the report names the new surfaces that went unverified instead of claiming parity passed
