## ADDED Requirements

### Requirement: The skill provides a designer-facing guide mode

The `agent-automation-orchestrate` skill SHALL provide a fifth mode named guide that conducts a plain-language, scenario-based interview with the user and produces `.agent-automation/config.json` in exactly the schema defined by the project contract reference, with no additional fields. Guide mode MUST validate the produced contract with `agent-automation-orchestrate/scripts/validate-project-config.mjs` before reporting success, MUST NOT start a paid agent process, and MUST leave the behavior of the bootstrap, run, resume, and status modes unchanged for technical operators. Interview questions and designer-facing reports MUST NOT contain the internal terms runner, contract, verification, argv, or preflight, and the skill MUST NOT ask the designer to supply shell commands or file paths.

#### Scenario: Designer sets up automation through the interview

- **WHEN** a designer describes a desired automation in scenario language in a repository without `.agent-automation/config.json`
- **THEN** the skill enters guide mode, presents available scenario templates in plain language, and interviews the designer with concrete options per question
- **AND** the skill writes `.agent-automation/config.json`, runs the existing validation script, and reports in plain language what automation was created and how to trigger it later
- **AND** no paid agent process starts during the guided setup

#### Scenario: Validation errors are absorbed, not surfaced raw

- **WHEN** the validation script rejects the generated contract
- **THEN** the skill corrects the contract and revalidates without showing raw validator output to the designer
- **AND** if validation cannot be made to pass, the skill reports in plain language that setup could not be completed and why, and does not claim success

### Requirement: Scenario templates drive the guided interview

The skill SHALL ship scenario template assets under `agent-automation-orchestrate/assets/scenario-templates/`, with one JSON file per scenario and a README that is the authoritative definition of the required fields: `id`, `title`, `summary`, `interview` entries containing `question`, `options`, and `mapsTo`, `recommendedSkills`, `contractHints` containing `instructionTemplate`, `verificationHints`, and `requiredArtifactHints`, and `prerequisites` entries containing `description` and `evidence`. Every name in `recommendedSkills` MUST match a skill directory that exists in this repository. Guide mode MUST present the template list with a custom-scenario option and MUST fall back to a custom-scenario interview governed by the same interview rules when no template matches.

#### Scenario: Designer selects a shipped scenario

- **WHEN** the designer picks a listed scenario such as building Figma ready-for-dev components into Storybook
- **THEN** the interview asks only that template's questions plus any outcome-oriented follow-ups the template hints cannot resolve
- **AND** the resulting task contract references a companion skill from that template's `recommendedSkills`

##### Example: Shipped scenario templates

| Template ID | Designer-facing purpose |
| ----- | ----- |
| `figma-ready-to-storybook` | Build Figma components marked ready for dev into Storybook |
| `screenshot-to-component` | Turn a UI screenshot into reusable implemented components |
| `design-system-extraction` | Extract a design-system specification from design references |
| `visual-parity-audit` | Audit implemented UI against design references with evidence |

#### Scenario: No template matches the designer's situation

- **WHEN** the designer picks the custom-scenario option or describes a situation no template covers
- **THEN** the skill interviews the designer using the same plain-language rules without a template
- **AND** setup continues instead of being rejected

### Requirement: Interview answers translate to a valid contract without exposing internals

Guide mode SHALL derive each contract field in this order: repository evidence first, template hints second, and only when both fail, a question to the user phrased as outcome-oriented options. The skill MUST NOT invent verification commands and MUST NOT ask the designer to provide them; when no verification command can be derived, the task SHALL be written with an explicit empty verification array and the plain-language report MUST state that the automation has no automatic completion check and recommend an engineer add one. Before writing a companion skill name into the contract, the skill MUST confirm from repository evidence that the skill is available, and MUST use a lower-priority recommendation or an outcome-oriented question when it is not. When a template prerequisite is not satisfied by the repository, the skill MUST explain in plain language what is missing and stop setup without scaffolding on its own.

#### Scenario: Unresolved technical choice becomes an outcome question

- **WHEN** repository evidence and template hints cannot resolve a scaffold-affecting choice
- **THEN** the skill asks the designer one question phrased as observable outcomes with concrete options
- **AND** the question contains no internal terminology

#### Scenario: Missing prerequisite stops setup in plain language

- **WHEN** a template prerequisite such as an existing Storybook setup is not found in the repository
- **THEN** the skill explains in plain language what is missing and what it affects
- **AND** setup stops without creating scaffolding until the user decides

#### Scenario: No derivable completion check

- **WHEN** neither repository evidence nor template hints yield a verification command
- **THEN** the task is written with an explicit empty verification array
- **AND** the report states in plain language that no automatic completion check exists and recommends an engineer add one

### Requirement: Designer-facing status reporting uses the plain-language glossary

The skill SHALL define a plain-language glossary in `agent-automation-orchestrate/references/designer-guide.md` together with the interview rules and translation rules. When reporting status, run progress, or setup results to a designer audience, the skill MUST apply the glossary so internal terms are replaced by their plain-language equivalents.

#### Scenario: Designer asks how the automation went

- **WHEN** a designer asks about the progress or result of an automation run
- **THEN** the report describes the task, the AI tool that executed it, completion checks, and produced files using glossary language
- **AND** the report contains none of the internal terms the glossary translates
