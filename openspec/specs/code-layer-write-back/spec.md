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

The server SHALL accept two operations. `rebind-token` changes which token a token aliases: a component token to a system token, and — only when the binding marks the system tier writable — a system token to a reference token. `rebind-declaration` changes one `var()` reference of one declaration in a component stylesheet, addressed by rule ordinal together with selector, at-rule context and occurrence, the property, and the position of the reference in the value. The new token SHALL exist in a tier file, SHALL be declared once, SHALL resolve, SHALL be of a kind compatible with the old one, and SHALL respect the tier rule: component stylesheets reference system tokens or component tokens of their own component, never reference tokens. A batch SHALL be applied completely or not at all, and the server SHALL compute every new value itself and reject a batch whose stated new value differs.

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
| Old and new token are the same | `no-op` |
| The value is not a supported shape, is important, or is overridden inside its rule | `unsupported-value-shape` |
| The token is declared more than once | `duplicate-token-declaration` |
| Two operations address the same token or reference | `duplicate-target` |
| The file no longer contains the value the change was staged on | `stale-before` |
| The stated new value is not what the server computes | `after-value-mismatch` |
| Ordinal and selector, at-rule context or occurrence disagree | `locator-mismatch` |
| Source of truth and mirror differ | `mirror-drift` |
| A check command is missing or changed | `checks-unavailable` |
| The unmodified project already fails a check | `checks-baseline-failing` |
| A check fails on the candidate | `check-failed` |
| The tool is in read-only mode | `read-only` |

#### Scenario: A reference at a later position

- **WHEN** a batch re-binds position 1 of `border: var(--w) solid var(--c)` from `--c` to another color token
- **THEN** only the second reference changes and the width reference is untouched


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Byte-exact patching

A patch SHALL replace only the bytes of the token name inside the addressed `var()` reference and SHALL leave every other byte of the file — comments, whitespace, line endings, byte order mark — unchanged. Before any write the server SHALL prove this on the raw bytes: the new content equals the old content with the known ranges replaced by the expected bytes, and re-parsing yields the same node sequence. A file that does not survive a strict UTF-8 decode and re-encode SHALL be read-only.

#### Scenario: Unusual formatting is preserved

- **WHEN** a token declaration has CRLF line endings, a trailing comment and non-ASCII text before it
- **THEN** after the patch the file differs from the original only in the token name bytes

#### Scenario: Reversing a patch restores the file

- **WHEN** a reference is re-bound from A to B and then from B to A
- **THEN** the file is byte-identical to the original


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
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

#### Scenario: Exact undo

- **WHEN** an apply changed three files and nothing touched them since
- **THEN** undo restores all three to their exact previous bytes

#### Scenario: Reverse apply after an unrelated edit

- **WHEN** an apply changed line 60 of a stylesheet, a person later edited line 10 of the same file, and undo is requested
- **THEN** the exact undo is refused as a conflict, and the reverse apply changes line 60 back while keeping the person's edit on line 10


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
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

An apply SHALL be reported as verified only on evidence that does not depend on the previews that preceded it. Before the write the page SHALL record, for every change, the computed value of the affected element with all previews removed and with all previews applied. After the write it SHALL first wait until the text of the page's stylesheets contains what the server reports it wrote, and then, with the previews of the applied changes removed, compare the computed values with the previewed ones. The outcome SHALL be exactly one of four: verified — the content arrived, the values match, and the previews had changed the values; written but not observable here — the content arrived but the affected element is not on this page or the previews changed nothing; mismatch — the content arrived and the values differ; timeout — the content did not arrive in time. A pending verification SHALL survive a reload of the preview or the tab and complete afterwards. An undo SHALL be verified the same way against the values recorded with previews removed.

#### Scenario: A blocked hot update is never reported as verified

- **WHEN** the files are written but the page cannot fetch the updated stylesheets
- **THEN** the outcome is timeout, and reloading the preview and verifying again reports verified

#### Scenario: Applying from a story that does not show the element

- **WHEN** changes staged on one story are applied while another story is open
- **THEN** the outcome is written but not observable here, and verifying again on the first story reports verified

#### Scenario: Verification resumes after a reload

- **WHEN** the browser tab is reloaded while an apply is being verified
- **THEN** after the reload the report completes with the same outcome it would have had without the reload


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
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