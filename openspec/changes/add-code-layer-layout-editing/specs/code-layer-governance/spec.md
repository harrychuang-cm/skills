## MODIFIED Requirements

### Requirement: Documents pending sync

After every apply the server SHALL record what the write has left out of date and cannot rewrite deterministically, as pending entries bound to that apply. An entry SHALL name a file and line and a reason. The server SHALL produce an entry for: a re-bound token whose specification row was not eligible; every `rebind-declaration`, every `set-keyword` and every `add-declaration`, because component stylesheet declarations are not tabulated; a comment on the same line as a rewritten declaration; and, for a re-bind, every line in the component's specification, stylesheet, source and stories that mentions the short name of the old token outside the rewritten cell. A layout operation has no token name, and the server SHALL NOT search any document for its keywords. The entry of a layout operation SHALL carry the property, the old keyword when there was one, and the new keyword. Pending entries SHALL be listed by the state route, shown in the panel beside the change that caused them, removed when their apply is undone, and removable one by one when a person marks them done. The tool SHALL offer the pending entries of an apply as a plain-text brief that an AI assistant can act on.

#### Scenario: Prose that still names the old role

- **WHEN** a container token is re-bound away from a role and the component's specification describes the variant with that role's name in a sentence
- **THEN** a pending entry points at that sentence's file and line

#### Scenario: Undo clears what it caused

- **WHEN** an apply with three pending entries is undone
- **THEN** none of the three entries is listed afterwards

#### Scenario: A layout change leaves one entry

- **WHEN** `justify-content: center` is set to `space-between`, the declaration has no comment on its line, and the component's specification contains the word `center` on several lines
- **THEN** exactly one pending entry is recorded for that operation, pointing at the declaration's file and line with `center` as the old value and `space-between` as the new one
