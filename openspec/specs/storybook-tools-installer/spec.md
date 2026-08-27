# storybook-tools-installer Specification

## Purpose

TBD - created by archiving change 'generalize-to-storybook-tools-install'. Update Purpose after archive.

## Requirements

### Requirement: Multi-tool installer identity

The installer skill SHALL be named storybook-tools-install and SHALL present itself as the installer for a suite of Storybook Tools pages rather than a single tool. The rename SHALL be complete within the cm-skills repository: outside openspec/changes/archive/, no file SHALL reference the former skill name component-coverage-install.

#### Scenario: Rename completeness check

- **WHEN** the repository is searched for the string component-coverage-install, excluding openspec/changes/archive/
- **THEN** the search returns no matches, and the skill directory storybook-tools-install/ contains the SKILL.md whose frontmatter name is storybook-tools-install


<!-- @trace
source: generalize-to-storybook-tools-install
updated: 2026-08-27
code:
  - docs/skills-guide.html
-->

---
### Requirement: Multi-tool template manifest structure

The template manifest (TEMPLATE_MANIFEST.json at the template root) SHALL declare name storybook-tools and version 0.10.0, and SHALL be structured as a sharedCore section plus a tools map. The sharedCore section SHALL cover the component catalog contract files and the catalog check script. Each entry in the tools map SHALL declare its own files (verbatim, adaptable, generated), installTargets, checks, and pathContracts. The component-coverage tool entry SHALL list exactly the same files as the 0.9.1 flat manifest listed (no additions, no omissions), and its skillContentSha256 values SHALL remain unchanged.

#### Scenario: Manifest parses with the two-layer structure

- **WHEN** TEMPLATE_MANIFEST.json is parsed as JSON
- **THEN** it exposes sharedCore and tools top-level sections, tools contains component-coverage and component-timeline entries, and every file path listed anywhere in the manifest exists inside the template directory

#### Scenario: Coverage tool file set is preserved

- **WHEN** the component-coverage tool entry's verbatim, adaptable, and generated lists are compared with the 0.9.1 flat manifest lists (after accounting for files moved to sharedCore)
- **THEN** the union of sharedCore and component-coverage lists equals the 0.9.1 file set exactly


<!-- @trace
source: generalize-to-storybook-tools-install
updated: 2026-08-27
code:
  - docs/skills-guide.html
-->

---
### Requirement: Tool selection during install

The install flow SHALL install every tool in the tools map by default. WHEN the user names a subset of tools, the install flow SHALL copy only the sharedCore files plus the named tools' files, and SHALL wire only the named tools' checks into the target project's check chain. The sharedCore SHALL be installed in every case.

#### Scenario: Default install includes all tools

- **WHEN** the user requests installation without naming specific tools
- **THEN** both the component-coverage and component-timeline tool files are copied and both tools' check scripts are wired into the target project

#### Scenario: Subset install copies only what was named

- **WHEN** the user requests installation of only the component-timeline tool
- **THEN** sharedCore files and component-timeline files are copied, component-coverage files (including the dev API vite plugin and companion skills) are not copied, and only timeline checks are wired


<!-- @trace
source: generalize-to-storybook-tools-install
updated: 2026-08-27
code:
  - docs/skills-guide.html
-->

---
### Requirement: Update flow recognizes legacy single-tool installations

The update flow SHALL look for the installed manifest copy at outputs/storybook-tools/TEMPLATE_MANIFEST.json first. WHEN that file is absent, the update flow SHALL fall back to outputs/component-coverage/TEMPLATE_MANIFEST.json; a 0.9.x flat manifest found there SHALL be interpreted as "component-coverage installed, component-timeline not installed". Upgrading a legacy installation SHALL write the new-format manifest copy to the new location and remove the legacy copy. WHEN neither location has a manifest copy, the flow SHALL treat the project as a fresh install rather than reporting an error. The update flow SHALL update only the tools recorded as installed and SHALL surface not-yet-installed tools as available additions.

#### Scenario: Legacy 0.9.x installation is upgraded

- **WHEN** the update flow runs in a project whose only manifest copy is a 0.9.1 flat manifest at outputs/component-coverage/TEMPLATE_MANIFEST.json
- **THEN** the flow updates the component-coverage tool files, offers component-timeline as an available addition, writes the 0.10.0 manifest copy (recording the installed tool set) to outputs/storybook-tools/TEMPLATE_MANIFEST.json, and removes the legacy manifest copy

#### Scenario: No manifest copy found

- **WHEN** the update flow finds no manifest copy at either location
- **THEN** the flow proceeds as a fresh installation without reporting an error


<!-- @trace
source: generalize-to-storybook-tools-install
updated: 2026-08-27
code:
  - docs/skills-guide.html
-->

---
### Requirement: Tool-specific install preconditions

The install flow SHALL verify tool-specific preconditions before copying files. For the component-timeline tool, the flow SHALL require a full (non-shallow) git history in the target project, verified via git rev-parse --is-shallow-repository, and SHALL refuse to install the timeline tool with an explanatory message when the repository is shallow.

#### Scenario: Shallow clone blocks timeline install

- **WHEN** the target project is a shallow git clone and the user requests the component-timeline tool
- **THEN** the install flow refuses to install the timeline tool and explains that first-seen dates require full git history, while other requested tools remain installable

<!-- @trace
source: generalize-to-storybook-tools-install
updated: 2026-08-27
code:
  - docs/skills-guide.html
-->