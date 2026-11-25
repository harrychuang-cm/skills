## Purpose

Define how a Code Layer write keeps the surrounding design-system package consistent: the component specification that documents a re-bound token changes in the same write, everything the tool cannot rewrite safely is recorded as pending for a person or an agent, paired content tokens are checked, and the project's own regeneration commands run afterwards. The project's audits do not detect a specification that disagrees with the token files, so the tool owns this consistency.

## ADDED Requirements

### Requirement: Token contract rows follow re-bound component tokens

When the binding names a component specification directory, a `rebind-token` operation on a component token SHALL also rewrite the row that documents it. The specification file SHALL be the one whose base name is the component identifier in the token name. The row SHALL be the single table row, under the file's single `Token Contract` heading, whose first cell equals the component token exactly; the edit SHALL replace the second cell only, and only when that cell equals the old system token exactly. The rest of the row, the line count of the file and every other byte SHALL be unchanged. When any of these conditions does not hold, the specification SHALL NOT be edited and the operation SHALL produce a pending entry that states which condition failed. A cell SHALL never be matched by substring.

#### Scenario: The documented alias changes with the token

- **WHEN** a component token is re-bound from one system token to another and its specification has exactly one matching row whose second cell is the old system token
- **THEN** after the apply the second cell is the new system token and the file differs from before in that cell only

#### Scenario: Rows that must not be edited

- **WHEN** the row for a token cannot be identified exactly
- **THEN** the specification file is left untouched and a pending entry records the reason

##### Example: matching is exact

| Row in the specification | Token being re-bound | Result |
| --- | --- | --- |
| `\| --md-comp-seal-hanko-container-color \| --md-sys-color-primary \| fill \| hanko \|` | `--md-comp-seal-hanko-container-color` from `--md-sys-color-primary` | second cell rewritten |
| `\| --md-comp-title-glyph-color-1..5 \| --md-sys-color-festival-1..5 \| glyphs \| festival \|` | `--md-comp-title-glyph-color-1` | not edited: no row with that exact first cell |
| `\| --md-comp-seal-hanko-container-color \| --md-sys-color-primary-warm \| fill \| hanko \|` | same token, from `--md-sys-color-primary` | not edited: second cell is not the old token |
| two rows with the same first cell | that token | not edited: row is not unique |

### Requirement: Specification edits belong to the same transaction

A specification file edited for a batch SHALL be part of that batch's transaction: it SHALL be enumerated in the closed writable set at start, backed up and journaled like the token files, written before any file whose change triggers a hot update, restored by an exact undo, and rewritten back by a reverse apply. A batch SHALL NOT leave a token file changed and its specification row unchanged when the row was eligible, or the reverse.

#### Scenario: Undo restores the specification

- **WHEN** an apply rewrote a token file, its mirror and a specification row, and the apply is undone
- **THEN** all three files have their exact previous bytes

#### Scenario: A failed batch leaves the specification alone

- **WHEN** a batch is rejected by a check after the specification edit was computed
- **THEN** the specification file is unchanged

### Requirement: Documents pending sync

After every apply the server SHALL record what the write has left out of date and cannot rewrite deterministically, as pending entries bound to that apply. An entry SHALL name a file and line and a reason. The server SHALL produce an entry for: a re-bound token whose specification row was not eligible; every `rebind-declaration`, because component stylesheet declarations are not tabulated; a comment on the same line as a rewritten declaration; and every line in the component's specification, stylesheet, source and stories that mentions the short name of the old token outside the rewritten cell. Pending entries SHALL be listed by the state route, shown in the panel beside the change that caused them, removed when their apply is undone, and removable one by one when a person marks them done. The tool SHALL offer the pending entries of an apply as a plain-text brief that an AI assistant can act on.

#### Scenario: Prose that still names the old role

- **WHEN** a container token is re-bound away from a role and the component's specification describes the variant with that role's name in a sentence
- **THEN** a pending entry points at that sentence's file and line

#### Scenario: Undo clears what it caused

- **WHEN** an apply with three pending entries is undone
- **THEN** none of the three entries is listed afterwards

### Requirement: Contract drift report

At start and after every write, when a component specification directory is bound, the server SHALL compare every documented row with the alias in the token file and SHALL report the number of rows that disagree and of component tokens without a row through the state route. Drift that existed before a batch SHALL NOT block the batch.

#### Scenario: Existing drift is reported, not blocking

- **WHEN** a specification row already names a different system token than the token file
- **THEN** the state reports one drifting row, and batches that do not touch that token still apply

### Requirement: Paired content tokens are checked

When a component token whose name ends in the container suffix is re-bound from a system role that has an `on-` partner, the tool SHALL look for the component token that carries the content color of the same part — the token with the same stem and the content suffix — and, when that token aliases the `on-` partner of the old role, SHALL warn that the content color still follows the old role. The warning SHALL state whether the old and new `on-` colors resolve to the same value, SHALL show the contrast ratio of the resolved container and content colors, and SHALL offer to stage a second change that re-binds the content token to the new role's `on-` partner when one exists. The warning SHALL NOT block the apply.

#### Scenario: Container re-bound, content left behind

- **WHEN** a container token is re-bound from primary to a highlight role and the sibling content token aliases on-primary
- **THEN** the panel warns that the content color still follows primary, shows the contrast ratio of the new pair, and offers to re-bind the content token to on-highlight

##### Example: when the check speaks

| Old role | New role | Content token aliases | Outcome |
| --- | --- | --- | --- |
| primary | secondary | on-primary | warning, same resolved `on-` color, offers on-secondary |
| primary | highlight | on-primary | warning, different resolved `on-` color, offers on-highlight |
| primary | ink-strong (no `on-` partner) | on-primary | warning, no partner to offer |
| ink-strong (no `on-` partner) | highlight | knockout | no warning from the pairing rule; contrast ratio still shown |
| primary | secondary | (no sibling content token) | no warning |

### Requirement: Post-apply commands

The binding SHALL be able to list commands that regenerate derived artifacts. After a batch or an undo has committed, the server SHALL run them once, in order, without a shell, with its own Node executable in place of `node` and a time limit, and SHALL report each command's exit status in the apply report. A failing post-apply command SHALL NOT roll back the write; the report SHALL say that the derived artifacts are out of date. Every command SHALL declare the paths it writes, and the server SHALL refuse at start a command that declares a path inside the Storybook project root, because writing there reloads the page.

#### Scenario: Documentation is regenerated after an apply

- **WHEN** the binding lists a documentation generator and an apply commits
- **THEN** the generator runs once and the report shows that it succeeded

#### Scenario: A failing generator does not undo the write

- **WHEN** a post-apply command exits with a failure status
- **THEN** the written files stay as applied and the report states that derived artifacts are out of date
