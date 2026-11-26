---
name: storybook-code-layer
description: >-
  Install, check, update and remove Code Layer in a Vite-based Storybook
  project: a Figma-like design mode inside Storybook where a person selects a
  rendered element, re-binds its design tokens or sets the layout of a flex
  container (direction, alignment, distribution, wrapping) in an inspector
  floating over the canvas with a live preview, and applies the change to the
  real token files, component stylesheets and component specification tables,
  with verification and undo. Optionally (off until a person enables it), a
  dialog beside the inspector asks a local AI command line tool to make a
  change the inspector cannot; each request is approved outside the browser,
  runs on a copy of the workspace, passes a scope gate and is imported as one
  undoable apply.
  Use when a Storybook project should get this design inspector, when an existing
  Code Layer installation must be checked, upgraded to the current template or
  removed, when its project binding (token tiers, component roots, checks,
  governance) has to be derived or reviewed, or when AI requests must be
  enabled, checked or disabled for a project. Requires a three-tier
  ref → sys → comp token system referenced through CSS custom properties.
---

# Storybook Code Layer

Code Layer is a local Storybook addon. This skill carries its template and the
scripts that put it into a project, keep it current and take it out again. The
skill does not edit design tokens itself: people do that in the running
Storybook, through the inspector.

What the inspector can write is narrow on purpose, and worth saying when a
person asks what they are installing:

- Values, colors and type: only swapping the token a `var(--…)` references for
  another existing token of the same kind. It never invents a number or a
  color and never creates a token.
- Layout (since 1.2.0): on a flex container, the direction, alignment,
  distribution and wrapping can be set to one of a fixed list of CSS keywords.
  These are not tokens, so they are written straight into the component
  stylesheet: an existing keyword is replaced, or one declaration is appended
  to the rule that declares the element's `display`. `display` itself, grid
  layout and resizing are not editable.

- AI requests (since 1.3.0, off until enabled, see section 6): the person
  describes a change in a dialog beside the inspector; a local agent command
  line tool makes it on a copy of the workspace. Only modifications of
  existing files in an allowed set are imported, as one apply that undo puts
  back byte for byte.

Anything else (adding a token, creating files, restructuring markup) is for a
person or an AI assistant to do in the source; the inspector's "copy object
reference" produces the text to hand over.

Paths below are relative to this skill's folder (`<skill-root>`). The scripts
read the template that sits next to them, so they work from the repository and
from any installed copy of the skill.

## What an installed project looks like

```
<storybook root>/
  .storybook/
    main.ts                      one added element at the end of `addons`
    code-layer/                  the addon (managed template files)
      preset.js, annotations.ts, manager.tsx, manager/, runtime/, server/, shared/
      code-layer.config.json     the project binding — the project's file
      INSTALL_RECEIPT.json       what the installer did
  tsconfig.json                  ".storybook/code-layer/**" in `exclude` (only when its include list covers the addon)
<workspace root>/.code-layer/    journal, backups, pending documents (location set by the binding; outside the Storybook root);
                                 with AI requests also agent-runners.json (this machine's runners) and agent/<runId>/ (the last 20 runs)
```

In `storybook dev` a toolbar toggle named "Code Layer" turns on a selection
mode and an inspector that floats over the canvas (draggable, collapsible;
Storybook's own addon panel is neither moved nor switched). `storybook build`
output contains nothing of it.

## Who owns which file

| File | Owner | The installer… |
| --- | --- | --- |
| template files in `.storybook/code-layer/` | this skill (managed) | installs, updates and deletes them, tracked by the receipt |
| `code-layer.config.json` | the project | never overwrites it; creates it only from a binding the person confirmed |
| `INSTALL_RECEIPT.json` | the installer | writes it last on install and update, deletes it last on uninstall |
| the `addons` element, the `resolve` import, the tsconfig entry | the project's files | adds them; removes only what the receipt says it added |
| the state directory | Code Layer at run time | never touches it |
| `<stateDir>/agent-runners.json` | the person, through `enable_agent.mjs` | never touches it; `--check` reads it |

## Safety boundary

- Treat the target project as the user's. Read its `AGENTS.md`, `CLAUDE.md` and editor rules first and follow them.
- Run every writing mode with `--dry-run` first and show the plan before running it for real.
- Stop the project's Storybook dev server before `--update` or `--uninstall`. The installer refuses while Code Layer's write lock is held or its journal has an unfinished write; do not delete the lock to get past that.
- Never edit files in `.storybook/code-layer/` by hand, and never pass `--force-managed` unless the person has seen which files it would overwrite and agreed.
- Never write or rewrite `code-layer.config.json` except through `derive_binding.mjs --write` with a binding the person confirmed, or by adding its `agent` key when the person asked for AI requests and agreed to what section 6 says.
- Do not commit, push or open a pull request unless asked.
- None of the scripts starts an AI agent process or makes a network request: `enable_agent.mjs` runs the command line tools with `--version` and their help only. An agent process starts only when a person submits a request in the running Storybook and approves it outside the browser. Never submit or approve a request yourself, and never add an agent to a check or post-apply command.
- A conflict or a failed prerequisite means zero writes. Report it; do not work around it by editing the project.

## Prerequisites

- Storybook 10 with a Vite-based framework (`@storybook/*-vite`), not using CSF factories (`defineMain` / `definePreview`).
- Design tokens as CSS custom properties in three tiers, `--<prefix>-ref-*`, `--<prefix>-sys-*`, `--<prefix>-comp-*`, one file per tier, imported in that order by one entry stylesheet that the Storybook preview loads.
- Component stylesheets that reference tokens with `var(--…)`, and component markup that marks its root with `data-component`.
- A Chromium-based browser for the people who use the inspector. Other browsers are decided by a capability check at run time: when a required platform feature is missing the tool stays suspended and says which one.
- Node.js 20.19 or newer for the scripts (verified with 24).

The installer checks the first of these and the binding; it reports what fails and writes nothing.

## 1. Derive the binding

Skip this when `.storybook/code-layer/code-layer.config.json` already exists.

```sh
node <skill-root>/scripts/derive_binding.mjs --project-root <storybook root> --json
```

The output has `binding` (a draft that already validates), `evidence` (where each value comes from), `needsConfirmation` (what the evidence does not settle), `candidates` (check and post-apply commands found in the project, listed only) and `notes`.

Go through **every** item of `needsConfirmation` with the person, in plain language, one at a time, showing the proposed value and the facts:

- `tokens.sourceOfTruth` — when token files exist in two directories: which one people edit and which one is the served copy. A wrong direction makes the copy the truth on every apply. Never decide this yourself.
- `workspaceRoot`, `stateDir` — the state directory must be outside the Storybook root and on the same volume as the files Code Layer writes; suggest adding it to `.gitignore`.
- `checks` — which candidate should gate token changes. A check runs inside a copy of the workspace that holds the proposed token files, before anything is written, so it must read the token files relative to its working directory. With no check, token changes are written without an audit: say so. If the project uses `design-system-extractor`, its `scripts/audit_tokens.mjs <candidateRoot> --strict` is the usual choice; record the script's absolute path and `sha256`.
- `postApply` — commands that regenerate derived documents after each apply. Each needs an `id`, `writes` (paths outside the Storybook root) and a `cwd`. They run after the write; a failure does not undo it.
- `components.roots`, `components.classPrefixes`, `tokens.prefix` — when listed.

Optional keys the person may want: `locale` (`"zh-Hant"` or `"en"`; default follows the browser), `tokens.tiers[sys].writable: true` (allows system-token edits, which affect every component using the role), `governance.pairing`, `governance.proseScan`.

Save the confirmed binding to a file outside the project and write it:

```sh
node <skill-root>/scripts/derive_binding.mjs --project-root <storybook root> --write <confirmed-binding.json>
```

`--write` validates the binding and refuses when the project already has one.

## 2. Install

```sh
node <skill-root>/scripts/install_code_layer.mjs --project-root <storybook root> --dry-run
node <skill-root>/scripts/install_code_layer.mjs --project-root <storybook root>
```

Install copies the template, adds the preset as the last element of `addons`, adds the tsconfig exclude entry when needed, and writes the receipt. A second run writes nothing. `--config <file>` may supply a confirmed binding instead of step 1's `--write`; an existing binding is always kept.

If `tsconfig-manual` is reported, the project's `tsconfig.json` has no `exclude` array: show the person the entry to add (`.storybook/code-layer/**`) and let them decide, because a new `exclude` list replaces TypeScript's defaults.

Then start (or restart) Storybook: the preset, the dev server part and the manager are not hot-updated.

## 3. Check

```sh
node <skill-root>/scripts/install_code_layer.mjs --project-root <storybook root> --check
```

Read-only. `complete` means every template file equals the manifest, the receipt describes the installation, the binding is valid with existing paths, and the wiring is in place. Editing the binding does not make the check fail as long as it stays valid.

## 4. Update

```sh
node <skill-root>/scripts/install_code_layer.mjs --project-root <storybook root> --update --dry-run
node <skill-root>/scripts/install_code_layer.mjs --project-root <storybook root> --update
```

Each managed file is decided from three hashes — the new template, the receipt, the file as it is:

| File now | vs receipt | vs new template | Action |
| --- | --- | --- | --- |
| missing | — | — | install |
| present | any | identical | unchanged |
| present | identical | different | update |
| present | different | different | conflict `locally-modified-managed-file` |
| present | no entry | different | conflict `managed-target-collision` |
| present, no longer in the template | identical | — | delete |
| present, no longer in the template | different | — | conflict |
| present, never in any manifest | — | — | kept, with a warning |

One conflict stops the whole update with zero writes. Show the conflicting files; `--force-managed` discards the person's changes to them and is theirs to choose. An installation without a receipt whose files equal a released template version (for example one made during the 0.1.0 proof phase) is adopted and updated. The binding is validated against the new template and never written; when it is no longer valid the update stops and says which key to change. A newer installation is never downgraded.

After a successful update, restart Storybook.

## 5. Uninstall

```sh
node <skill-root>/scripts/install_code_layer.mjs --project-root <storybook root> --uninstall --dry-run
node <skill-root>/scripts/install_code_layer.mjs --project-root <storybook root> --uninstall
```

Removes the preset element, the import and the tsconfig entry only when the receipt records that the installer added them, the managed files that are unchanged, and the receipt last. It keeps the binding and the state directory (journal and backups). With a receipt written by 0.1.0 only the preset element is removed, and the output says what is left to review.

## 6. AI requests (optional)

Off unless both are true: the project binding has `"agent": { "enabled": true }` (the project's policy) and this machine has a runner file written by `enable_agent.mjs` (`<stateDir>/agent-runners.json`, the machine's decision). Requires the `agent-automation-orchestrate` skill and at least one command line tool: Claude Code (default) or Codex. The runner file holds this machine's absolute paths, so check that the state directory is in `.gitignore` before enabling; otherwise it would be shared with the project.

Before enabling, tell the person in plain language and wait for their agreement. Never enable it on their behalf:

- The dialog in their browser will be able to start a paid command line tool that edits this project. Each request uses their own account and takes a while.
- Every request waits for their approval outside the browser: a macOS dialog whose default button is "deny" and that shows the request, the element, the tool and the files the agent may change; or, where no dialog can be shown, a six-digit code printed in the terminal that runs Storybook. Unanswered requests are denied (60 s for the dialog, 180 s for a code).
- The agent works on a copy of the workspace. Claude Code is started with file tools only (no shell, no MCP servers: their claude.ai connectors such as Gmail or Drive are not loaded); Codex keeps a shell inside its sandbox, and it also starts the MCP servers listed in the person's own Codex configuration (`~/.codex/config.toml`), which run outside that sandbox. That is why Codex is not used unless they ask for it; when their configuration lists MCP servers, name them and say that those servers would be available to the agent.
- Only modifications of existing files in the allowed set reach the project: the writable token sources, files under the component roots and the component specifications, narrowed by `agent.allowedGlobs` when set. New or deleted files, added or removed tokens, edits to token mirrors and CSS that does not parse make the whole result refused, and the project is not changed.
- An accepted result is one apply: the inspector lists each changed file with its line counts, and undo puts every byte back.
- To stop: `enable_agent.mjs --disable`, or `"enabled": false` in the binding.

Then run, showing the dry run first:

```sh
node <skill-root>/scripts/enable_agent.mjs --project-root <storybook root> --dry-run
node <skill-root>/scripts/enable_agent.mjs --project-root <storybook root>
```

It finds node, `agent-automation-orchestrate` (its `scripts/run-task.mjs`, looked up in this order: `--orchestrator-root <dir>`, `.agents/skills` in the Storybook root and in the workspace root, the user's `~/.agents`, `~/.claude` and `~/.codex` skill folders, then next to this skill) and the tool, checks the tool with `--version` and its help, and writes the runner file (mode 0600). `--runners claude,codex --codex-model <id>` adds Codex after Claude Code; `--claude <path>` and `--codex <path>` pick a binary; `--timeout-ms <n>` sets each runner's limit (default 300000). The runner file is read on every request, so running the script again needs no restart. When a tool updates itself to a new version, AI requests stop being ready until the script runs again.

The binding key (the person adds it, or you add only this key after their agreement and show the result):

```json
"agent": { "enabled": true }
```

Optional: `confirm` (`"native-dialog"`, the default on macOS; `"terminal-code"`, the default elsewhere; `"off"` only when the person asks for it and accepts that requests then run without approval: the inspector says so on every request), `allowedGlobs`, `workcopy.exclude`, `workcopy.maxFiles` (20000), `workcopy.maxBytes` (500 MB), `timeoutMs`. Restart Storybook after changing the binding.

Readiness: `--check` prints an "AI requests" line (from files only; never a reason for `incomplete`); the Storybook log says `[code-layer] AI runs ready (…)` or names what is missing; in the inspector, the header's AI button is disabled with the reason as its tooltip.

## Output and result codes

Add `--json` for one object: `ok`, `result`, `actions[]` (`action`, `path`), `issues[]` (`severity`, `code`, `message`), `written[]`, `restartRequired`; `--check` adds `agent` (`enabled`, `ready`, `runners`, `confirm`, `problems[]`). The text output carries the same information. The exit status is 0 only when `ok` is true; 2 is a usage error.

| `result` | Meaning |
| --- | --- |
| `installed`, `updated`, `uninstalled` | done; restart Storybook when `restartRequired` |
| `current` | nothing to do |
| `planned` | dry run; nothing written |
| `complete` / `incomplete` | `--check` |
| `refused` | a prerequisite or a conflict; nothing written |
| `failed` | a write failed; every file was put back |

Frequent issue codes: `binding-missing`, `binding-invalid`, `binding-path-missing`, `state-dir-inside-project`, `not-vite-builder`, `csf-factories`, `update-required` (use `--update`), `locally-modified-managed-file`, `managed-target-collision`, `newer-installation`, `write-lock-held`, `journal-needs-recovery`, `receipt-missing`, `manifest-stale`, `install-dir-symlink`, `tsconfig-manual`, `unmanaged-file`.

## Verify after installing or updating

1. `--check` reports `complete`.
2. Start Storybook; its log shows `[code-layer] ready at /__code-layer`. A line saying writes are disabled names the reason (for example a check script that does not exist): fix the binding.
3. Open a component story, turn on "Code Layer" in the toolbar, click the component: the inspector over the canvas lists its properties, each as an icon, a value and a token; clicking a value opens the token picker beside it. On a flex container the Layout section also lists direction, alignment, distribution and wrapping; clicking one opens its options.
4. Do not apply a change to the user's files as a test unless they ask; if they do, undo it from the report and confirm the files are back.
5. With AI requests enabled: the log says `AI runs ready` and the inspector header's AI button is enabled once an element is selected. Do not send a request as a test: it costs the person money and needs them at the machine to approve it.

`README.md` (Traditional Chinese) explains the inspector for the people who use it. The interactive guide for users is `docs/code-layer-guide.html` at the root of the skills repository (a working simulator, user journeys, every control explained, FAQ, changelog); when a feature or an interface text of the tool changes, update that same file in the same change instead of writing a new document.

## Report back

State, without embellishment: the result code of each command you ran; which files were written (from `written`); every warning and what it means for the person; what they still have to decide or do (restart Storybook, a manual tsconfig entry, a conflict, a check to add); and that nothing was committed.

## Rules

- One Storybook instance per project while Code Layer is in use: two share a cache and fight over the write lock.
- Do not open a tunnel (ngrok, port forwarding) to a Storybook that has Code Layer on: its write endpoint trusts the local machine.
- A system tier is closed unless the binding opens it. Do not open it to make a single edit possible; explain the scope (every component using the role) and let the person decide.
- When the installer and this document disagree, the installer's output is the fact. Report the difference.

## Companion skill

`design-system-extractor` (support): the binding may point its checks at that skill's `scripts/audit_tokens.mjs` and its post-apply commands at `generate_docs_html.mjs` / `generate_review_html.mjs`. Without it the check list may be empty; token changes are then written without an audit, and the person should know.

`agent-automation-orchestrate` (support, AI requests only): each request runs through its `scripts/run-task.mjs`, unmodified, with a contract written inside the copy of the workspace; the real project never gets an `.agent-automation` folder. Without it AI requests stay off and everything else works.
