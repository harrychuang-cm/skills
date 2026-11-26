## MODIFIED Requirements

### Requirement: Operations

The server SHALL accept three operations. `rebind-token` changes which token a token aliases: a component token to a system token, and — only when the binding marks the system tier writable — a system token to a reference token. `rebind-declaration` changes one `var()` reference of one declaration in a component stylesheet, addressed by rule ordinal together with selector, at-rule context and occurrence, the property, and the position of the reference in the value. `tokenize-literal` replaces one literal top-level component of one declaration in a component stylesheet with a `var()` reference to an existing token; it is addressed like a declaration re-bind by rule ordinal together with selector, at-rule context and occurrence, and the property, and in addition by the position of the component among the top-level components of the value and by the literal text of that component.

For every operation the new token SHALL exist in a tier file, SHALL be declared once, SHALL resolve, and SHALL respect the tier rule: component stylesheets reference system tokens or component tokens of their own component, never reference tokens. For the two re-bind operations the new token SHALL be of a kind compatible with the old one. For `tokenize-literal` the server SHALL itself determine which sides or sub-properties the addressed component sets, SHALL require that each of them is a property of the inspector's table, and SHALL require that the new token is of a kind every one of them accepts. For `tokenize-literal` the server SHALL also require that the declared value has no top-level comma or slash, that the addressed component contains no reference and is not a keyword, and that its text equals the stated literal.

A batch SHALL be applied completely or not at all, and the server SHALL compute every new value itself and reject a batch whose stated new value differs. The literal stated in a request SHALL be used only to compare with the file and SHALL NOT be written.

#### Scenario: Rejections change nothing

- **WHEN** a batch is rejected for any reason
- **THEN** no file is created, modified or renamed in the project, and the response names the reason with a stable code

##### Example: rejection codes

| Situation | Code |
| --- | --- |
| The target token is not in a tier file | `not-a-design-token` |
| The token's tier is not writable in this project | `tier-not-writable` |
| A component token is pointed at a reference token | `tier-rule` |
| A component stylesheet is pointed at another component's token | `foreign-comp-token` |
| A color token replaces a length token | `type-mismatch` |
| A literal is pointed at a token of a kind its property does not accept | `type-mismatch` |
| Old and new token are the same | `no-op` |
| The value is not a supported shape, is important, or is overridden inside its rule | `unsupported-value-shape` |
| The addressed component of a tokenization is a keyword, contains a reference, or sits in a value with a top-level comma or slash | `unsupported-value-shape` |
| The property of a tokenization is not in the inspector's table | `unsupported-value-shape` |
| The token is declared more than once | `duplicate-token-declaration` |
| Two operations address the same token, reference or component | `duplicate-target` |
| The file no longer contains the value the change was staged on | `stale-before` |
| The addressed component no longer holds the stated literal | `stale-before` |
| The stated new value is not what the server computes | `after-value-mismatch` |
| Ordinal and selector, at-rule context or occurrence disagree | `locator-mismatch` |
| A request submits the internal operation that restores a literal | `schema-invalid` |
| Source of truth and mirror differ | `mirror-drift` |
| A check command is missing or changed | `checks-unavailable` |
| The unmodified project already fails a check | `checks-baseline-failing` |
| A check fails on the candidate | `check-failed` |
| The tool is in read-only mode | `read-only` |

#### Scenario: A reference at a later position

- **WHEN** a batch re-binds position 1 of `border: var(--w) solid var(--c)` from `--c` to another color token
- **THEN** only the second reference changes and the width reference is untouched

#### Scenario: A literal component becomes a reference

- **WHEN** a batch tokenizes component 1 of `margin: 0 12px` with a spacing token
- **THEN** the declaration reads `margin: 0 var(<that token>)` and no other byte of the file changes

#### Scenario: The server checks the kind of a token for a literal

- **WHEN** a batch tokenizes the `0` of `margin: 0` with a token whose value is a unitless number
- **THEN** the batch is rejected with `type-mismatch` and no file changes

#### Scenario: A re-bind and a tokenization on one declaration

- **WHEN** one batch tokenizes component 0 of `margin: 0 var(--gap)` and re-binds `--gap` to another spacing token
- **THEN** both replacements are written in one transaction, and each is reported with its own old and new value

### Requirement: Byte-exact patching

A patch SHALL replace only the addressed bytes — the token name inside the addressed `var()` reference for a re-bind, the addressed literal component for a tokenization — and SHALL leave every other byte of the file — comments, whitespace, line endings, byte order mark — unchanged. The bytes written in place of a token name SHALL be the name of an indexed token. The bytes written in place of a literal component SHALL be `var(`, the name of an indexed token and `)`. A reverse apply of a tokenization SHALL write back exactly the literal text the server recorded in its journal when it applied that tokenization, and no other path SHALL write literal text into a stylesheet.

Before any write the server SHALL prove the patch on the raw bytes: the new content equals the old content with the known ranges replaced by the expected bytes, and re-parsing yields the same node sequence with every addressed declaration holding its expected value and every other declaration unchanged. A file that does not survive a strict UTF-8 decode and re-encode SHALL be read-only.

#### Scenario: Unusual formatting is preserved

- **WHEN** a token declaration has CRLF line endings, a trailing comment and non-ASCII text before it
- **THEN** after the patch the file differs from the original only in the token name bytes

#### Scenario: Reversing a patch restores the file

- **WHEN** a reference is re-bound from A to B and then from B to A
- **THEN** the file is byte-identical to the original

#### Scenario: A literal beside a comment

- **WHEN** component 0 of `padding: 8px /* tight */ 16px` is tokenized
- **THEN** only the bytes `8px` are replaced, and the comment and the whitespace around it are unchanged

#### Scenario: Tokenizing and reversing restores the file

- **WHEN** a literal is tokenized and that tokenization is then reversed
- **THEN** the file is byte-identical to the original

### Requirement: Undo

The server SHALL undo the most recent apply that has not been undone by writing back the backed-up bytes, through the same lock, preconditions and journal as an apply, when every file changed by that apply still has the hash recorded after it; the result SHALL have the hash recorded before it. When a file has been changed since, the undo SHALL write nothing and SHALL report the conflict with the file and its backup path, and SHALL offer two ways forward: skipping that entry, which keeps its backup and exposes the previous entry, and a reverse apply, which submits the inverse of the entry's operations as a new batch through the normal validation. The undo stack SHALL be rebuilt from the journal at start. The server SHALL NOT overwrite a file changed by another program with a whole-file backup.

The inverse of a re-bind SHALL be the re-bind back to the old token. The inverse of a tokenization SHALL restore the recorded literal at the same component, and SHALL be refused with `stale-before` when that component is no longer exactly one reference, without fallback, to the token the tokenization wrote. The inverse of a tokenization SHALL be built only by the server from its journal. The journal SHALL record, for every declaration operation, the position of the affected component, and a reverse apply SHALL locate its target by that position, so that it still finds its target when another operation of the same batch added a reference earlier in the same value.

#### Scenario: Exact undo

- **WHEN** an apply changed three files and nothing touched them since
- **THEN** undo restores all three to their exact previous bytes

#### Scenario: Reverse apply after an unrelated edit

- **WHEN** an apply changed line 60 of a stylesheet, a person later edited line 10 of the same file, and undo is requested
- **THEN** the exact undo is refused as a conflict, and the reverse apply changes line 60 back while keeping the person's edit on line 10

#### Scenario: Reverse apply of a tokenization

- **WHEN** an apply tokenized `70%` on line 12 of a stylesheet, a person later edited another line of the same file, and a reverse apply is requested
- **THEN** line 12 holds `70%` again and the person's edit is kept

#### Scenario: Reverse apply after a mixed batch on one declaration

- **WHEN** one apply tokenized component 0 of `margin: 0 var(--gap)` and re-bound `--gap`, a person later edited another line of the same file, and a reverse apply is requested
- **THEN** the declaration reads `margin: 0 var(--gap)` again

#### Scenario: A changed component is not restored

- **WHEN** an apply tokenized a literal and a person later changed that component to another token by hand
- **THEN** the reverse apply is refused with `stale-before` and no file changes

### Requirement: Post-apply verification

An apply SHALL be reported as verified only on evidence that does not depend on the previews that preceded it. Before the write the page SHALL record, for every change, the computed value of the affected element with all previews removed and with all previews applied. After the write it SHALL first wait until the text of the page's stylesheets contains what the server reports it wrote, and then, with the previews of the applied changes removed, compare the computed values with the previewed ones.

The outcome SHALL be exactly one of five: verified — the content arrived, the values match, and the previews had changed the values; verified with the look unchanged — the change is a tokenization, the content arrived, the affected element is on this page, and its computed value was the same with previews removed, with previews applied and after the write; written but not observable here — the content arrived but the affected element is not on this page, or the previews changed nothing for a change that is not a tokenization; mismatch — the content arrived and the values differ; timeout — the content did not arrive in time.

A pending verification SHALL survive a reload of the preview or the tab and complete afterwards. An undo SHALL be verified the same way against the values recorded with previews removed.

#### Scenario: A blocked hot update is never reported as verified

- **WHEN** the files are written but the page cannot fetch the updated stylesheets
- **THEN** the outcome is timeout, and reloading the preview and verifying again reports verified

#### Scenario: Applying from a story that does not show the element

- **WHEN** changes staged on one story are applied while another story is open
- **THEN** the outcome is written but not observable here, and verifying again on the first story reports verified

#### Scenario: Verification resumes after a reload

- **WHEN** the browser tab is reloaded while an apply is being verified
- **THEN** after the reload the report completes with the same outcome it would have had without the reload

#### Scenario: A literal replaced by a token of the same value

- **WHEN** the literal `8px` of a padding declaration is tokenized with a token that resolves to 8px, and the batch is applied on the story that shows the element
- **THEN** the outcome is verified with the look unchanged

#### Scenario: A literal replaced by a token of another value

- **WHEN** the literal `0` of a margin declaration is tokenized with a token that resolves to 8px, and the batch is applied on the story that shows the element
- **THEN** the outcome is verified, and the element's computed margin is 8px with every preview removed
