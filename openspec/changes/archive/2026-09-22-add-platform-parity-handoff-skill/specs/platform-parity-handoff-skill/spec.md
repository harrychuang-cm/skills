## Purpose

Defines the reusable platform parity handoff skill in cm-skills: how a project profile parameterizes it, how it exports a diff-derived handoff pack and audits the second platform, how its inventory scripts stay read-only, and how it is packaged for Cursor, Codex and Claude Code.

## ADDED Requirements

### Requirement: Project profile parameterization

The skill SHALL keep every project-specific value in a JSON project profile (lead and follower repositories, integration branch, handoff output and media locations, string accessor pattern, generated strings file, strings directories and locales, mapping files and id fields, remote config and event search patterns, extra classification rules). `SKILL.md`, `references/` and `templates/` SHALL NOT contain project-specific paths or links; the only project values SHALL live in `assets/profile.example.json` and the field documentation. Every inventory script SHALL accept `--profile <json>`; when it is absent the script SHALL load the bundled example profile and print a notice on stderr, and the output JSON SHALL name the profile used.

#### Scenario: Profile given

- **WHEN** a script runs with `--profile my-project.json` whose `ios.stringAccessorPattern` matches `L10n\.([A-Za-z0-9_]+)`
- **THEN** string key detection uses that pattern and the output `profile.project` names that project

#### Scenario: Profile absent

- **WHEN** a script runs without `--profile`
- **THEN** it loads `assets/profile.example.json`, prints a notice on stderr that the bundled example profile is in use, and still completes

#### Scenario: Example profile reproduces the original project

- **WHEN** the five scripts run with the bundled example profile against the ToastEnglish iOS merge commit `212356d0e` and the Android repository
- **THEN** their inventories match the inventories produced by the ToastEnglish project skill, ignoring timestamps, absolute repository paths and the profile field

### Requirement: Diff-derived handoff pack and single audit report

Export mode SHALL take the merged diff of the feature on the lead platform's integration branch and write a handoff pack whose manifest has nine chapters (freeze point, change inventory, screen-by-state matrix, visual values, string inventory, behavior contract, API and remote config and events, shared component impact, declared platform differences), each chapter stating whether it came from the diff, from source code, or was filled in manually, with a media index carrying a SHA-256 for every referenced media file kept outside the repository. Audit mode SHALL run on the follower platform in a pre-implementation or post-implementation phase and write one report classifying each item as `一致`, `差異`, `允許差異`, `未驗` or `待決`, ending with one list of decisions for the project's requirement or design system. Neither mode SHALL edit product code, translation resources or task tracking.

#### Scenario: State without capture

- **WHEN** a screen state has no screenshot from the frozen build
- **THEN** the matrix cell reads `未拍` and does not reference another state or build

#### Scenario: Audit item without evidence

- **WHEN** a post-implementation audit item has no test, screenshot or symbol evidence
- **THEN** it is classified `未驗`, not `一致`

### Requirement: Read-only inventory scripts

The scripts SHALL read only Git history and working trees of the repositories named by the caller or the profile, SHALL write only to stdout or the caller's `--out` directory, SHALL refuse an `--out` directory inside any input repository, and SHALL NOT access the network or run builds.

#### Scenario: Output directory inside a repository

- **WHEN** `--out` resolves inside the lead repository
- **THEN** the script exits with code 2 and creates nothing

### Requirement: Packaged for three agents

The skill folder SHALL be named `platform-parity-handoff` with a `SKILL.md` whose frontmatter `name` equals the folder name and whose description states when to use it; it SHALL provide `agents/openai.yaml`, a README section with install commands, and support entries for `ui-pixel-align-report` and `ui-compare-to-reference` in `scripts/skill-dependencies.json`. The shared installer SHALL list Claude Code, Codex and Cursor destinations for it in dry-run mode without changes to the installer.

#### Scenario: Installer dry-run

- **WHEN** `node scripts/install_agent_skills.mjs --agent all --scope user --skill platform-parity-handoff --dry-run` runs from the repository root
- **THEN** it prints three destinations and copies nothing
