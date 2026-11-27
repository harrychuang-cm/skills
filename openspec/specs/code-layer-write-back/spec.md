# code-layer-write-back Specification

## Purpose

Define how Code Layer turns staged changes into edits of real source files: which operations exist, how the dev server validates, patches, checks, journals and writes them, how a write is undone, and how the page proves that the files and the rendered result agree. A project without version control must be able to rely on this path alone for safety.

## Requirements

### Requirement: Closed writable set

At start the dev server SHALL enumerate the files it is allowed to write from the project binding: the writable token tier files with their mirrors, and the stylesheets under the component roots. It SHALL record the real path of each and SHALL refuse to write a file that is a symbolic link, has more than one hard link, is not a regular file, or whose real path has changed since start. A client request SHALL NOT supply a file system path: a token operation carries no path, and a declaration operation names a stylesheet only as a key into the enumerated set. A stylesheet created after start SHALL be read-only until the dev server restarts.

#### Scenario: A path-like key is not a path

- **WHEN** a declaration operation names `../outside.css`
- **THEN** the request is rejected as malformed and no file is opened

#### Scenario: A symbolic link is never written

- **WHEN** a component stylesheet in the writable set is replaced by a symbolic link after start
- **THEN** any batch that targets it is rejected and no file changes


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Operations

The server SHALL accept five operations. `rebind-token` changes which token a token aliases: a component token to a system token, and — only when the binding marks the system tier writable — a system token to a reference token. `rebind-declaration` changes one `var()` reference of one declaration in a component stylesheet, addressed by rule ordinal together with selector, at-rule context and occurrence, the property, and the position of the reference in the value. `set-keyword` replaces the keyword of one top-level component of one layout declaration in a component stylesheet — `flex-direction`, `flex-wrap`, `align-items`, `justify-content`, or the direction or wrapping component of `flex-flow` — with another keyword; it is addressed by the same rule locator and the property, and in addition by the position of the component among the top-level components of the value and by the keyword that component holds now. `add-declaration` appends one declaration of `flex-direction`, `flex-wrap`, `align-items` or `justify-content` to a rule of a component stylesheet, addressed by the rule locator and the property. `tokenize-literal` replaces one literal top-level component of one declaration in a component stylesheet with a `var()` reference to an existing token; it is addressed by the same rule locator and the property, and in addition by the position of the component among the top-level components of the value and by the literal text of that component.

For the two re-bind operations and for `tokenize-literal` the new token SHALL exist in a tier file, SHALL be declared once, SHALL resolve, and SHALL respect the tier rule: component stylesheets reference system tokens or component tokens of their own component, never reference tokens. For the two re-bind operations the new token SHALL be of a kind compatible with the old one.

For the two layout operations the new keyword SHALL be one of the fixed list of the property the component or declaration sets, and the server SHALL itself determine that property. For `set-keyword` the addressed component SHALL be a single keyword equal to the stated one, and the declaration SHALL NOT be important, declared twice in its rule or overridden later in its rule. For `add-declaration` the addressed rule SHALL itself declare `display` as `flex` or `inline-flex` without `!important`, SHALL NOT already declare the property or a shorthand that sets it, and SHALL be marked by the index as able to take a new declaration.

For `tokenize-literal` the server SHALL itself determine which sides or sub-properties the addressed component sets, SHALL require that each of them is a property of the inspector's table, and SHALL require that the new token is of a kind every one of them accepts. It SHALL also require that the declared value has no top-level comma or slash, that the addressed component contains no reference and is not a keyword, that its text equals the stated literal, and that the declaration is not important, declared twice in its rule or overridden later in its rule.

A batch SHALL be applied completely or not at all, and the server SHALL compute every new value itself and reject a batch whose stated new value differs. A request SHALL NOT be able to supply text to write other than by naming an indexed token, or a property and a keyword of the fixed lists. The literal stated in a tokenization SHALL be used only to compare with the file and SHALL NOT be written.

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
| Old and new token are the same, or old and new keyword are the same | `no-op` |
| The value is not a supported shape, is important, or is overridden inside its rule | `unsupported-value-shape` |
| The property of a layout operation is not a layout property, or the addressed component is not a single keyword | `unsupported-value-shape` |
| The addressed component of a tokenization is a keyword, contains a reference, or sits in a value with a top-level comma or slash | `unsupported-value-shape` |
| The property of a tokenization is not in the inspector's table | `unsupported-value-shape` |
| The new keyword is not in the fixed list of the property | `keyword-not-allowed` |
| The rule of an added declaration does not declare a flex display, already sets the property, or cannot take a new declaration | `rule-not-eligible` |
| The token is declared more than once | `duplicate-token-declaration` |
| Two operations address the same token, reference or component, or add the same property to the same rule | `duplicate-target` |
| The file no longer contains the value the change was staged on | `stale-before` |
| The addressed component no longer holds the stated literal | `stale-before` |
| The stated new value is not what the server computes | `after-value-mismatch` |
| Ordinal and selector, at-rule context or occurrence disagree | `locator-mismatch` |
| A request submits an internal operation: the one that removes a declaration or the one that restores a literal | `schema-invalid` |
| Source of truth and mirror differ | `mirror-drift` |
| A check command is missing or changed | `checks-unavailable` |
| The unmodified project already fails a check | `checks-baseline-failing` |
| A check fails on the candidate | `check-failed` |
| The tool is in read-only mode | `read-only` |

#### Scenario: A reference at a later position

- **WHEN** a batch re-binds position 1 of `border: var(--w) solid var(--c)` from `--c` to another color token
- **THEN** only the second reference changes and the width reference is untouched

#### Scenario: A keyword is replaced

- **WHEN** a batch sets component 0 of `justify-content: center` to `space-between`
- **THEN** the declaration reads `justify-content: space-between` and no other byte of the file changes

#### Scenario: One component of a shorthand is replaced

- **WHEN** a batch sets component 1 of `flex-flow: column wrap` to `nowrap`
- **THEN** the declaration reads `flex-flow: column nowrap`

#### Scenario: A declaration is added to a flex rule

- **WHEN** a batch adds `flex-wrap: wrap` to a rule whose declarations are `display: flex;` and `gap: 4px;`, each on its own line indented by two spaces
- **THEN** the rule gains a third line `  flex-wrap: wrap;` after the `gap` line and nothing else in the file changes

#### Scenario: A layout declaration cannot be added to a rule that is not flex

- **WHEN** a batch adds `justify-content: center` to a rule that does not declare `display`
- **THEN** the batch is rejected with `rule-not-eligible` and no file changes

#### Scenario: A keyword outside the list is refused

- **WHEN** a batch sets `align-items: center` to `safe center`, or to `red`
- **THEN** the batch is rejected with `keyword-not-allowed` and no file changes

#### Scenario: A literal component becomes a reference

- **WHEN** a batch tokenizes component 1 of `margin: 0 12px` with a spacing token
- **THEN** the declaration reads `margin: 0 var(<that token>)` and no other byte of the file changes

#### Scenario: The server checks the kind of a token for a literal

- **WHEN** a batch tokenizes the `0` of `margin: 0` with a token whose value is a unitless number
- **THEN** the batch is rejected with `type-mismatch` and no file changes

#### Scenario: A re-bind and a tokenization on one declaration

- **WHEN** one batch tokenizes component 0 of `margin: 0 var(--gap)` and re-binds `--gap` to another spacing token
- **THEN** both replacements are written in one transaction, and each is reported with its own old and new value


<!-- @trace
source: add-code-layer-tokenize-literals
updated: 2026-11-27
code:
  - storybook-code-layer/template/code-layer/runtime/tracer.ts
  - storybook-code-layer/README.md
  - storybook-code-layer/template/code-layer/shared/literals.d.mts
  - storybook-code-layer/template/code-layer/server/operations.mjs
  - storybook-code-layer/SKILL.md
  - storybook-code-layer/template/code-layer/server/patcher.mjs
  - storybook-code-layer/template/code-layer/shared/api-contract.mjs
  - storybook-code-layer/template/code-layer/server/transaction.mjs
  - storybook-code-layer/template/code-layer/shared/properties.ts
  - storybook-code-layer/template/code-layer/runtime/verify.ts
  - storybook-code-layer/template/code-layer/shared/messages.en.ts
  - storybook-code-layer/template/code-layer/manager/components/Report.tsx
  - storybook-code-layer/template/TEMPLATE_MANIFEST.json
  - storybook-code-layer/template/code-layer/manager/components/ChangesBar.tsx
  - storybook-code-layer/template/code-layer/shared/labels.ts
  - storybook-code-layer/template/code-layer/shared/property-table.mjs
  - storybook-code-layer/template/code-layer/manager/components/RowPopover.tsx
  - storybook-code-layer/template/code-layer/shared/protocol.ts
  - storybook-code-layer/template/code-layer/manager/drafts.ts
  - storybook-code-layer/template/KNOWN_MANIFESTS.json
  - storybook-code-layer/template/code-layer/shared/property-table.d.mts
  - storybook-code-layer/template/code-layer/shared/messages.zh-Hant.ts
  - storybook-code-layer/template/code-layer/server/pending-docs.mjs
  - storybook-code-layer/template/code-layer/manager/apply.ts
  - storybook-code-layer/template/code-layer/runtime/livePreview.ts
  - storybook-code-layer/template/code-layer/manager/components/Field.tsx
  - storybook-code-layer/template/code-layer/shared/reference.ts
  - storybook-code-layer/template/code-layer/shared/literals.mjs
  - docs/skills-usage.md
  - docs/code-layer-guide.html
  - storybook-code-layer/template/code-layer/package.json
tests:
  - storybook-code-layer/test/test_write_routes.test.mjs
  - storybook-code-layer/test/run_core_loop_browser.mjs
  - storybook-code-layer/test/run_live_api.mjs
  - storybook-code-layer/test/test_installer_update.test.mjs
  - storybook-code-layer/test/test_governance.test.mjs
  - storybook-code-layer/test/test_patcher.test.mjs
  - storybook-code-layer/test/test_literals.test.mjs
  - storybook-code-layer/test/test_transaction.test.mjs
-->

---
### Requirement: Byte-exact patching

A patch SHALL change only the addressed bytes and SHALL leave every other byte of the file — comments, whitespace, line endings, byte order mark — unchanged. For a re-bind the addressed bytes are the token name inside the addressed `var()` reference, and the bytes written SHALL be the name of an indexed token. For `set-keyword` they are the addressed component, and the bytes written SHALL be a keyword of the fixed list. For `tokenize-literal` they are the addressed literal component, and the bytes written SHALL be `var(`, the name of an indexed token and `)`. For `add-declaration` nothing is replaced: the bytes SHALL be inserted directly after the last node of the rule, and SHALL be the whitespace that precedes the rule's last declaration, the property name, a colon and a space, the keyword and a semicolon; when that whitespace contains a comment, a line break in the file's own style followed by the indentation of the last declaration SHALL be used instead.

A reverse apply SHALL be the only path that writes a keyword outside the fixed lists, writes literal text into a stylesheet, or removes a declaration: it SHALL write back exactly the keyword or the literal text the server recorded in its journal, and SHALL remove exactly the bytes the server recorded as inserted.

Before any write the server SHALL prove the patch on the raw bytes: the new content equals the old content with the known ranges replaced by the expected bytes. It SHALL then prove it by re-parsing: apart from exactly the declarations the batch adds or removes, the node sequence is the same, every addressed declaration holds its expected value, every other declaration is unchanged, and an added declaration is the last declaration of its rule. A file that does not survive a strict UTF-8 decode and re-encode SHALL be read-only.

#### Scenario: Unusual formatting is preserved

- **WHEN** a token declaration has CRLF line endings, a trailing comment and non-ASCII text before it
- **THEN** after the patch the file differs from the original only in the token name bytes

#### Scenario: Reversing a patch restores the file

- **WHEN** a reference is re-bound from A to B and then from B to A
- **THEN** the file is byte-identical to the original

#### Scenario: A keyword beside a comment

- **WHEN** component 0 of `flex-flow: column /* stacked */ wrap` is set to `row`
- **THEN** only the bytes `column` are replaced, and the comment and the whitespace around it are unchanged

#### Scenario: An added declaration follows the file's formatting

- **WHEN** a declaration is added to a rule in a file with CRLF line endings whose declarations are indented by a tab
- **THEN** the inserted bytes are a CRLF, a tab, the declaration and a semicolon, placed after the last declaration of the rule

#### Scenario: Adding and removing restores the file

- **WHEN** a declaration is added and that addition is then reversed
- **THEN** the file is byte-identical to the original

#### Scenario: A literal beside a comment

- **WHEN** component 0 of `padding: 8px /* tight */ 16px` is tokenized
- **THEN** only the bytes `8px` are replaced, and the comment and the whitespace around it are unchanged

#### Scenario: Tokenizing and reversing restores the file

- **WHEN** a literal is tokenized and that tokenization is then reversed
- **THEN** the file is byte-identical to the original


<!-- @trace
source: add-code-layer-tokenize-literals
updated: 2026-11-27
code:
  - storybook-code-layer/template/code-layer/runtime/tracer.ts
  - storybook-code-layer/README.md
  - storybook-code-layer/template/code-layer/shared/literals.d.mts
  - storybook-code-layer/template/code-layer/server/operations.mjs
  - storybook-code-layer/SKILL.md
  - storybook-code-layer/template/code-layer/server/patcher.mjs
  - storybook-code-layer/template/code-layer/shared/api-contract.mjs
  - storybook-code-layer/template/code-layer/server/transaction.mjs
  - storybook-code-layer/template/code-layer/shared/properties.ts
  - storybook-code-layer/template/code-layer/runtime/verify.ts
  - storybook-code-layer/template/code-layer/shared/messages.en.ts
  - storybook-code-layer/template/code-layer/manager/components/Report.tsx
  - storybook-code-layer/template/TEMPLATE_MANIFEST.json
  - storybook-code-layer/template/code-layer/manager/components/ChangesBar.tsx
  - storybook-code-layer/template/code-layer/shared/labels.ts
  - storybook-code-layer/template/code-layer/shared/property-table.mjs
  - storybook-code-layer/template/code-layer/manager/components/RowPopover.tsx
  - storybook-code-layer/template/code-layer/shared/protocol.ts
  - storybook-code-layer/template/code-layer/manager/drafts.ts
  - storybook-code-layer/template/KNOWN_MANIFESTS.json
  - storybook-code-layer/template/code-layer/shared/property-table.d.mts
  - storybook-code-layer/template/code-layer/shared/messages.zh-Hant.ts
  - storybook-code-layer/template/code-layer/server/pending-docs.mjs
  - storybook-code-layer/template/code-layer/manager/apply.ts
  - storybook-code-layer/template/code-layer/runtime/livePreview.ts
  - storybook-code-layer/template/code-layer/manager/components/Field.tsx
  - storybook-code-layer/template/code-layer/shared/reference.ts
  - storybook-code-layer/template/code-layer/shared/literals.mjs
  - docs/skills-usage.md
  - docs/code-layer-guide.html
  - storybook-code-layer/template/code-layer/package.json
tests:
  - storybook-code-layer/test/test_write_routes.test.mjs
  - storybook-code-layer/test/run_core_loop_browser.mjs
  - storybook-code-layer/test/run_live_api.mjs
  - storybook-code-layer/test/test_installer_update.test.mjs
  - storybook-code-layer/test/test_governance.test.mjs
  - storybook-code-layer/test/test_patcher.test.mjs
  - storybook-code-layer/test/test_literals.test.mjs
  - storybook-code-layer/test/test_transaction.test.mjs
-->

---
### Requirement: Checks run on a candidate tree before any write

For a batch that changes token files the server SHALL build a candidate copy of the token files outside the project, with the new content, and SHALL run every check command of the binding against that copy before touching any project file. Check commands SHALL be executed without a shell, with the dev server's own Node executable in place of `node`, and with a time limit. At start and whenever the index revision changes, the server SHALL run the checks against the unmodified source of truth as a baseline. When a check command is missing or its recorded hash differs, or the baseline fails, token operations SHALL be refused with the check's output; batches that change component stylesheets only SHALL NOT run token checks.

#### Scenario: A failing check writes nothing

- **WHEN** a check fails on the candidate tree
- **THEN** the batch is rejected with the check's output, and no project file's content, modification time or inode has changed

#### Scenario: A project that already fails is not blamed on the user

- **WHEN** the unmodified project fails a check at start
- **THEN** token operations are refused as baseline-failing and declaration-only batches still apply


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Transaction, journal and crash recovery

Before the first write of a batch the server SHALL save a backup of every file it will change and append a pending record — per file: path, hash before, hash after, backup path — to an append-only journal, flushed to disk. Each file SHALL be written by creating a temporary file in the state directory, giving it the target's permissions, flushing it and renaming it over the target, after re-checking the target's hash. The source of truth SHALL be written before its mirror. A committed record SHALL follow the last write. On start, and before each batch, the server SHALL resolve any pending record by comparing each file's current hash: equal to the hash before — leave it; equal to the hash after — restore the backup; anything else — leave the file untouched, enter read-only mode and list the file with its backup path. Only one process SHALL hold the write lock of a state directory; a second one SHALL run read-only and say so.

#### Scenario: A crash between two writes is rolled back

- **WHEN** the process is killed after writing the source of truth and before writing the mirror, and the dev server starts again
- **THEN** every file has its hash from before the batch and the tool accepts new batches

#### Scenario: A file edited after a crash is not overwritten

- **WHEN** a batch is interrupted and a person edits one of its files before the dev server starts again
- **THEN** that file is left as the person saved it, the tool is read-only, and the file and its backup path are reported


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Source of truth and mirror stay identical

When the binding declares mirrors, every token file and its mirror SHALL be byte-identical as a precondition of any batch, and SHALL be byte-identical after it. When they differ, every batch SHALL be refused as `mirror-drift` with, per file, the number of differing lines and both modification times. Synchronization SHALL copy the source of truth over the mirror only, never the reverse, after running the checks on the source of truth, backing up the mirror and journaling the copy. Synchronization SHALL be available from the panel and from the command line, and SHALL NOT happen without an explicit request.

#### Scenario: Synchronizing clears the drift

- **WHEN** a mirror is one line behind its source of truth and synchronization is requested
- **THEN** the mirror equals the source of truth, the previous mirror content is in a backup, and batches are accepted again


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Undo

The server SHALL undo the most recent apply that has not been undone by writing back the backed-up bytes, through the same lock, preconditions and journal as an apply, when every file changed by that apply still has the hash recorded after it; the result SHALL have the hash recorded before it. When a file has been changed since, the undo SHALL write nothing and SHALL report the conflict with the file and its backup path, and SHALL offer two ways forward: skipping that entry, which keeps its backup and exposes the previous entry, and a reverse apply, which submits the inverse of the entry's operations as a new batch through the normal validation. The undo stack SHALL be rebuilt from the journal at start. The server SHALL NOT overwrite a file changed by another program with a whole-file backup.

The inverse of a re-bind SHALL be the re-bind back to the old token. The inverse of `set-keyword` SHALL set the same component back to the keyword it held, as recorded in the journal, and SHALL be refused with `stale-before` when that component no longer holds the keyword the operation wrote. The inverse of `add-declaration` SHALL remove the declaration it added, and SHALL be refused with `stale-before` when the rule no longer holds that property with the keyword the operation wrote, or when the bytes around it are no longer the bytes the server recorded as inserted. The inverse of `tokenize-literal` SHALL restore the recorded literal at the same component, and SHALL be refused with `stale-before` when that component is no longer exactly one reference, without fallback, to the token the tokenization wrote. The inverses of the layout operations and of a tokenization SHALL be built only by the server from its journal. The journal SHALL record, for every declaration operation, the position of the affected component, and a reverse apply SHALL locate its target by that position, so that it still finds its target when another operation of the same batch added a reference earlier in the same value.

#### Scenario: Exact undo

- **WHEN** an apply changed three files and nothing touched them since
- **THEN** undo restores all three to their exact previous bytes

#### Scenario: Reverse apply after an unrelated edit

- **WHEN** an apply changed line 60 of a stylesheet, a person later edited line 10 of the same file, and undo is requested
- **THEN** the exact undo is refused as a conflict, and the reverse apply changes line 60 back while keeping the person's edit on line 10

#### Scenario: Reverse apply of a keyword that was outside the list

- **WHEN** an apply set `align-items: start` to `center`, a person later edited another line of the same file, and a reverse apply is requested
- **THEN** the declaration reads `align-items: start` again and the person's edit is kept

#### Scenario: Reverse apply of an added declaration

- **WHEN** an apply added `flex-wrap: wrap` to a rule, a person later edited another line of the same file, and a reverse apply is requested
- **THEN** the added line is gone, the rule is byte-identical to what it was before the apply, and the person's edit is kept

#### Scenario: A changed addition is not removed

- **WHEN** an apply added `flex-wrap: wrap` and a person later changed that declaration to `flex-wrap: nowrap` by hand
- **THEN** the reverse apply is refused with `stale-before` and no file changes

#### Scenario: Reverse apply of a tokenization

- **WHEN** an apply tokenized `70%` on line 12 of a stylesheet, a person later edited another line of the same file, and a reverse apply is requested
- **THEN** line 12 holds `70%` again and the person's edit is kept

#### Scenario: Reverse apply after a mixed batch on one declaration

- **WHEN** one apply tokenized component 0 of `margin: 0 var(--gap)` and re-bound `--gap`, a person later edited another line of the same file, and a reverse apply is requested
- **THEN** the declaration reads `margin: 0 var(--gap)` again

#### Scenario: A changed component is not restored

- **WHEN** an apply tokenized a literal and a person later changed that component to another token by hand
- **THEN** the reverse apply is refused with `stale-before` and no file changes


<!-- @trace
source: add-code-layer-tokenize-literals
updated: 2026-11-27
code:
  - storybook-code-layer/template/code-layer/runtime/tracer.ts
  - storybook-code-layer/README.md
  - storybook-code-layer/template/code-layer/shared/literals.d.mts
  - storybook-code-layer/template/code-layer/server/operations.mjs
  - storybook-code-layer/SKILL.md
  - storybook-code-layer/template/code-layer/server/patcher.mjs
  - storybook-code-layer/template/code-layer/shared/api-contract.mjs
  - storybook-code-layer/template/code-layer/server/transaction.mjs
  - storybook-code-layer/template/code-layer/shared/properties.ts
  - storybook-code-layer/template/code-layer/runtime/verify.ts
  - storybook-code-layer/template/code-layer/shared/messages.en.ts
  - storybook-code-layer/template/code-layer/manager/components/Report.tsx
  - storybook-code-layer/template/TEMPLATE_MANIFEST.json
  - storybook-code-layer/template/code-layer/manager/components/ChangesBar.tsx
  - storybook-code-layer/template/code-layer/shared/labels.ts
  - storybook-code-layer/template/code-layer/shared/property-table.mjs
  - storybook-code-layer/template/code-layer/manager/components/RowPopover.tsx
  - storybook-code-layer/template/code-layer/shared/protocol.ts
  - storybook-code-layer/template/code-layer/manager/drafts.ts
  - storybook-code-layer/template/KNOWN_MANIFESTS.json
  - storybook-code-layer/template/code-layer/shared/property-table.d.mts
  - storybook-code-layer/template/code-layer/shared/messages.zh-Hant.ts
  - storybook-code-layer/template/code-layer/server/pending-docs.mjs
  - storybook-code-layer/template/code-layer/manager/apply.ts
  - storybook-code-layer/template/code-layer/runtime/livePreview.ts
  - storybook-code-layer/template/code-layer/manager/components/Field.tsx
  - storybook-code-layer/template/code-layer/shared/reference.ts
  - storybook-code-layer/template/code-layer/shared/literals.mjs
  - docs/skills-usage.md
  - docs/code-layer-guide.html
  - storybook-code-layer/template/code-layer/package.json
tests:
  - storybook-code-layer/test/test_write_routes.test.mjs
  - storybook-code-layer/test/run_core_loop_browser.mjs
  - storybook-code-layer/test/run_live_api.mjs
  - storybook-code-layer/test/test_installer_update.test.mjs
  - storybook-code-layer/test/test_governance.test.mjs
  - storybook-code-layer/test/test_patcher.test.mjs
  - storybook-code-layer/test/test_literals.test.mjs
  - storybook-code-layer/test/test_transaction.test.mjs
-->

---
### Requirement: Hot update delivery

After committing or rolling back a batch the server SHALL notify the dev server's watcher once for every written file it watches, after the writes have settled, so the final content reaches the page even when rapid successive writes were coalesced.

#### Scenario: An apply followed immediately by an undo

- **WHEN** an apply and its undo are written within a few milliseconds of each other
- **THEN** the page ends up with the stylesheet text of the undone state


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Request guard

Every route of the dev API SHALL accept a request only when the connection comes from a loopback address, carries no forwarding header, names `localhost`, `127.0.0.1` or `[::1]` as host, and — when the headers are present — has an origin equal to the request's own scheme and host and a same-origin fetch site. Writing routes SHALL additionally require the POST method, an origin header, the `application/json` content type, a per-start random session header, and a body within the configured size limits; the body SHALL NOT be read before these checks pass. Every response SHALL be completed by the tool itself with no cross-origin access headers and with caching disabled.

#### Scenario: Requests that are turned away

- **WHEN** a request fails a guard condition
- **THEN** it is answered with the status in the table and no file is read or written on its behalf

##### Example: guard outcomes

| Request | Status |
| --- | --- |
| Origin of another localhost port | 403 |
| Host header with a LAN address | 403 |
| `X-Forwarded-For` present | 403 |
| Navigation from the address bar (fetch site `none`) | 403 |
| POST without the session header | 401 |
| POST with `text/plain` | 415 |
| POST body above the limit | 413 |


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
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


<!-- @trace
source: add-code-layer-tokenize-literals
updated: 2026-11-27
code:
  - storybook-code-layer/template/code-layer/runtime/tracer.ts
  - storybook-code-layer/README.md
  - storybook-code-layer/template/code-layer/shared/literals.d.mts
  - storybook-code-layer/template/code-layer/server/operations.mjs
  - storybook-code-layer/SKILL.md
  - storybook-code-layer/template/code-layer/server/patcher.mjs
  - storybook-code-layer/template/code-layer/shared/api-contract.mjs
  - storybook-code-layer/template/code-layer/server/transaction.mjs
  - storybook-code-layer/template/code-layer/shared/properties.ts
  - storybook-code-layer/template/code-layer/runtime/verify.ts
  - storybook-code-layer/template/code-layer/shared/messages.en.ts
  - storybook-code-layer/template/code-layer/manager/components/Report.tsx
  - storybook-code-layer/template/TEMPLATE_MANIFEST.json
  - storybook-code-layer/template/code-layer/manager/components/ChangesBar.tsx
  - storybook-code-layer/template/code-layer/shared/labels.ts
  - storybook-code-layer/template/code-layer/shared/property-table.mjs
  - storybook-code-layer/template/code-layer/manager/components/RowPopover.tsx
  - storybook-code-layer/template/code-layer/shared/protocol.ts
  - storybook-code-layer/template/code-layer/manager/drafts.ts
  - storybook-code-layer/template/KNOWN_MANIFESTS.json
  - storybook-code-layer/template/code-layer/shared/property-table.d.mts
  - storybook-code-layer/template/code-layer/shared/messages.zh-Hant.ts
  - storybook-code-layer/template/code-layer/server/pending-docs.mjs
  - storybook-code-layer/template/code-layer/manager/apply.ts
  - storybook-code-layer/template/code-layer/runtime/livePreview.ts
  - storybook-code-layer/template/code-layer/manager/components/Field.tsx
  - storybook-code-layer/template/code-layer/shared/reference.ts
  - storybook-code-layer/template/code-layer/shared/literals.mjs
  - docs/skills-usage.md
  - docs/code-layer-guide.html
  - storybook-code-layer/template/code-layer/package.json
tests:
  - storybook-code-layer/test/test_write_routes.test.mjs
  - storybook-code-layer/test/run_core_loop_browser.mjs
  - storybook-code-layer/test/run_live_api.mjs
  - storybook-code-layer/test/test_installer_update.test.mjs
  - storybook-code-layer/test/test_governance.test.mjs
  - storybook-code-layer/test/test_patcher.test.mjs
  - storybook-code-layer/test/test_literals.test.mjs
  - storybook-code-layer/test/test_transaction.test.mjs
-->

---
### Requirement: Command-line access

The tool SHALL provide a command-line interface that works without Storybook running: printing the index summary and the state, synchronizing mirrors as a dry run or for real, undoing the most recent apply, and running crash recovery. Commands that write SHALL take the same lock as the dev server and SHALL refuse to run while another process holds it.

#### Scenario: The command line refuses to race the dev server

- **WHEN** the dev server is running and a person runs the undo command
- **THEN** the command writes nothing and explains that the dev server holds the lock

<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->