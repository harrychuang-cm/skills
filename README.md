# CM Skills

Reusable Cursor / Claude Code skills for UI implementation workflows.

Open the visual guide at [`docs/skills-guide.html`](docs/skills-guide.html) for a simple overview of each skill, when to use it, and common prompts.

For designers, [`docs/designer-guide-storybook-to-production.html`](docs/designer-guide-storybook-to-production.html)（「從 Storybook 到上線」, Traditional Chinese）is an interactive walkthrough of how a Storybook prototype or the component library becomes production code: a scenario wizard that picks the route and the exact prompt to say, a six-station user journey, and simulated approval-gate dialogues. It is also published online at <https://claude.ai/code/artifact/392505bf-6e24-4299-9d4a-1e536a329a4b> (private to the owner until shared from the artifact's share menu).

## Skills

`agent-automation-orchestrate` is the automation entry point. Every other skill describes work to be done; that skill is what schedules it, runs it, and proves it finished.

### `agent-automation-orchestrate`

Bootstrap, guide, validate, run, resume, and inspect reusable engineering automation across repositories, keeping repository-specific instructions, verification, artifacts, and domain decisions in a project contract instead of the shared runner:

1. Resolve exactly one mode per request: `bootstrap`, `guide`, `run`, `resume`, or `status`. Inspecting, explaining, or reporting status is read-only and never starts a paid agent process.
2. Resolve the target root with `scripts/inspect-project.mjs`, then create or refine `.agent-automation/config.json` — vendor-specific CLI command, argv, preflight, timeout, and environment names in `runners`; project-specific instruction, companion skill, verification commands, and required artifacts in `tasks`. Credential values never belong in the contract.
3. Or use `guide` mode to reach the same contract through a plain-language, scenario-based interview aimed at designers, driven by the templates in `assets/scenario-templates/`.
4. Execute one configured task with ordered runner fallback across Claude Code, Codex, Cursor, or any other headless CLI, stopping fallback after the first zero-exit runner.
5. Check the project's verification commands and required artifacts, then write a sanitized, auditable run summary that `resume` and `status` read back.

Use this when a project needs a portable multi-agent automation contract, when a designer describes a repeatable design-to-engineering automation in plain scenario language, when an existing `.agent-automation/config.json` task should run or resume, or when adapting one automation workflow to a repository with different build, test, artifact, or framework requirements. `design-automation-hub-install` installs its Figma cleanup task on top of this skill rather than replacing it.

### `design-system-extractor`

Extract a reusable design-system package from screenshots, Figma references, exports, existing app folders, or prototype code:

1. Build evidence-backed design principles and design elements.
2. Define `ref -> sys -> comp` token architecture and token files.
3. Inventory components and write component token specs.
4. Generate static HTML documentation and run source/token/component audits.

Use this before implementation when the design system needs to be documented and reviewed as a source of truth.

### `ui-compare-to-reference`

Compare an implemented UI against a reference, then apply the visual fixes. The reference can be a Figma frame, a design export or screenshot, or **another platform's source code** — a web implementation used as the truth for an app, or an app implementation used as the truth for web. Project-agnostic: it discovers the target repo's references, routes, components, Storybook stories, styling system, and design tokens before editing.

Supported target examples:

```text
reports/design-pixel-align/wallet/findings.json
https://www.figma.com/design/...?node-id=1-234 src/screens/WalletHome.tsx
apps/web/src/pages/Wallet.tsx apps/mobile/src/screens/WalletHome.tsx
screen-2.png http://localhost:3000/dashboard
screen-2.png src/pages/Dashboard.tsx
http://localhost:3000/dashboard
Dashboard.stories.tsx
```

Fixes are layered — token/theme, then shared primitive, then composition, then page-only — and classified before they are applied, so genuine platform adaptations (font substitution, touch-target minimums, safe areas, density across form factors) are not "fixed" into bugs. `references/apply-to-platform.md` covers how to express each correction idiomatically in web, React Native, Flutter, SwiftUI, and Compose.

Use this when an app or web UI does not match its design, when porting a screen between web and native, or when repairing layout and token drift.

### `ui-pixel-align-report`

Audit an implemented UI against a design or code reference and produce a screenshot-backed pixel alignment report. Same six comparison directions as `ui-compare-to-reference`; this skill produces evidence rather than edits, and its `findings.json` is the handoff into the fix skill.

Rather than eyeballing two surfaces, it extracts **both** sides into a platform-neutral UI Spec and diffs the specs:

```text
reference ──┐
            ├─► UI Spec ──► parity-aware diff ──► candidates ──► review ──► findings.json ──► HTML report
implement ──┘
```

1. Extract the reference — Figma MCP first for exact values and variable names, image measurement only as a fallback (recorded as `estimated` fidelity).
2. Extract the implementation, preferring a measured rendered surface over source reading.
3. Diff with `scripts/diff_spec.mjs`, which matches nodes, compares with unit-aware tolerances, and applies `assets/parity-policy.json` to classify each difference as drift, accepted adaptation, required adaptation, or ignored.
4. Review the candidates, add per-finding crops, and render with `scripts/generate_report.mjs`.

Expected report inputs include:

```text
https://www.figma.com/design/...?node-id=1-2 http://localhost:3000/dashboard
https://www.figma.com/design/...?node-id=1-2 src/screens/WalletHome.tsx
apps/web/src/pages/Wallet.tsx apps/mobile/src/screens/WalletHome.tsx
reference/dashboard.png Dashboard.stories.tsx
```

Use this when you need reviewable evidence, design QA documentation, cross-platform parity audits, or a handoff artifact before applying visual fixes.

### `ui-screenshot-to-storybook-product`

Turn a UI screenshot, mockup, or Figma export into a token-backed implementation workflow:

1. Parse the image into reusable UI building blocks.
2. Map blocks to existing design-system components and tokens.
3. Build or extend Storybook, or the project's equivalent component catalog, first.
4. Compose product screens from documented components.

Use this when implementing a new screen from an image and you want reusable components, documented examples, and token-backed styles to remain the source of truth.

### `design-system-to-storybook`

Build or update Storybook from an already extracted design-system package:

1. Read `design-system/` Markdown specs and `tokens/`.
2. Map token layers and component specs into the target product repo.
3. Install and configure the Figma export addon for compatible React Storybook 10 projects.
4. Plan large inventories into dependency-aware batches when there are many components.
5. Create or update Storybook foundations, shared components, and stories.
6. Verify each batch with Storybook, lint/typecheck, tests, or visual checks.

Use this after `design-system-extractor` when the extraction is complete and you want the design-system documentation to become a token-backed component catalog in a product project.

### `storybook-product-prototype`

Create PRD-led product prototypes and frontend handoff docs in Storybook:

1. Turn a product idea into PRD, Flow Spec, UI Spec, Data Spec, Production Handoff, and Acceptance Criteria.
2. Scaffold a prototype folder with typed route metadata, deterministic fixtures, and Storybook story files.
3. Attach `parameters.prototype` metadata for Story, Docs, Data, and UI Flow review.
4. Validate that docs, frontend handoff, flow routes, transition metadata, fixtures, and story wiring stay consistent.

Use this when a team wants a clickable Storybook prototype and frontend implementation handoff before production repo work.

### `frontend-product-implementation`

Implement frontend products and features from handoff docs:

1. Read PRD, Flow Spec, UI Spec, Data Spec, Production Handoff, Acceptance, and Implementation Guide docs.
2. Inspect the target repo to detect routes/screens, design tokens, shared components, Storybook, i18n, data patterns, and tests.
3. Follow `design-system-governance` (an external skill — see Notes): reuse tokens/components first, and stop for approval before creating missing tokens or shared components.
4. Build greenfield products or add features to existing products with deterministic fixtures and mock data adapters when real integration is out of scope.
5. Verify with the repo's typecheck, tests, build, Storybook, or app preview commands.

Use this after `storybook-product-prototype` or any equivalent handoff when you want the docs to become frontend product code while preserving design-system governance.

### `storybook-tools-install`

Install and bind a suite of generic Storybook「Tools」pages into any React + Vite Storybook project — currently the Component Coverage Analyzer and the Component Timeline:

1. Copy the bundled template verbatim, per tool (all tools by default, or a named subset): the Component Coverage Analyzer (tool UI, dev API vite plugin, check scripts, companion `component-coverage-analyze` / `component-coverage-implement` project skills) and the Component Timeline (git-derived component birth dates joined with the catalog, live story previews, build/check scripts).
2. Install both companion skills from one upstream source into shared `.agents/skills/` paths for Cursor/Codex and byte-identical `.claude/skills/` mirrors for Claude Code.
3. Generate a project-specific component catalog by reading the target project's components and stories (the AI binding step — see `references/catalog-authoring.md`).
4. Wire `.storybook/main.ts` (`viteFinal` plugin + `staticDirs`), create the `outputs/component-coverage/` data directory, and verify end to end (checks, skill hashes, typecheck, dev API, tool page, static build).
5. Update a previously installed copy via the `TEMPLATE_MANIFEST.json` version, overwriting only template-owned files and retiring obsolete managed skill mirrors safely — including upgrading legacy component-coverage-only installations to the multi-tool layout.

Use this to bring the Storybook tools suite — the UI-image/PRD → coverage report → developer review → implementation workflow, and the component timeline page — to a new Storybook project.

Developer-facing install & usage guide (zh-TW): `storybook-tools-install/README.md`.

### `design-automation-hub-install`

Install the project-neutral Design Automation Hub into an explicit target repository:

1. Preview a zero-write plan and validate the versioned template inventory.
2. Reuse the canonical `agent-automation-orchestrate` dependency from the same complete `cm-skills` checkout.
3. Install the Figma Plugin, portable standalone/compatible Coordinator, deterministic cleanup checker, and byte-identical `figma-design-automation` skill mirrors.
4. Add only the `figma-cleanup` task to an existing valid project automation config while preserving runners and unrelated tasks.
5. Update managed files with receipt-based collision protection and keep the Figma Desktop manifest import as an explicit manual handoff.

Use this when another project needs the same safe Figma cleanup → AI plan → human confirmation workflow without copying the product repository or embedding a second generic runner.

### `pipeline-board`

Render a designer-readable automation pipeline board as one self-contained HTML file, derived entirely from evidence already on disk:

1. Declare the pipeline order, candidate sources, and handoffs in a per-project sidecar definition (`.pipeline-board/pipeline.json`, seeded from `pipeline-board/assets/default-pipeline.json`).
2. Build a derived status object with `scripts/build-pipeline-status.mjs` — source presence, produced vs verified stages, satisfied / blocked / stale handoffs, pending designer decisions, and honest run progress from the orchestrator's durable summaries.
3. Render `scripts/render-pipeline-board.mjs` into a single HTML file that opens over `file://` with no server, port, install, or network, and never contains prompts, credentials, or environment values.

The board is read-only: it starts nothing, animates nothing, and shows "possibly stopped — please confirm" instead of fake progress when a run record goes quiet past its timeout.

Use this when a designer needs to see what an automation pipeline does, where it currently stands, and when it is their turn — without reading Markdown contracts, run summary JSON, or asking an engineer.

### `portfolio-dashboard`

Aggregate many projects' pipeline boards into one self-contained overview dashboard:

1. List the tracked projects in a portfolio definition file (`portfolio-dashboard/assets/default-portfolio.json` is the starting point; each entry is an id, a display name, and a project root).
2. Build with `scripts/build-portfolio-status.mjs` — it re-runs the existing `pipeline-board` commands per project and derives one attention item per card by fixed priority: possibly-stopped run → first unmet or stale handoff → pending designer decisions → healthy.
3. Render `scripts/render-portfolio-dashboard.mjs` into one HTML overview: one card per project with its current stage, why it is stuck, and a link to that project's own board, all inside a single shareable output directory.

A project whose root is missing or whose definition is invalid becomes an error card with a stable error code instead of aborting the batch. Like the per-project board, the overview is a read-only static snapshot: no server, no port, no run button, no polling.

Use this when a designer watches several automated projects and needs one page answering which project is where and who is blocked.

## Usage

Install or reference these folders as agent skills in Claude Code, Codex, or Cursor. Each skill lives in its own directory and exposes a `SKILL.md` with frontmatter metadata and workflow instructions.

Install all skills for your user account:

```sh
node scripts/install_agent_skills.mjs --agent all --scope user
```

Install all skills into a project repo:

```sh
node scripts/install_agent_skills.mjs --agent all --scope project --project-root <repo>
```

Install one skill:

```sh
node scripts/install_agent_skills.mjs --agent codex --scope user --skill design-system-extractor
```

Use `--dry-run` to preview destinations and `--force` to replace existing installed copies.

Default install locations:

| Agent | User scope | Project scope |
|---|---|---|
| Claude Code | `~/.claude/skills/<skill>/` | `<repo>/.claude/skills/<skill>/` |
| Codex | `~/.agents/skills/<skill>/` | `<repo>/.agents/skills/<skill>/` |
| Cursor | `~/.cursor/skills/<skill>/` | `<repo>/.cursor/skills/<skill>/` |

Cursor also discovers project skills from `<repo>/.agents/skills/<skill>/`. The component coverage workflow uses that shared project location for Cursor and Codex, avoiding an unnecessary third `.cursor/skills/` copy; its Claude Code compatibility mirror stays byte-identical and hash-checked.

### Running an automation

`agent-automation-orchestrate` drives the automation itself. Inspect the target repository, write or refine its contract, validate, then preview before executing:

```sh
node agent-automation-orchestrate/scripts/inspect-project.mjs --project-root <absolute-repo>
node agent-automation-orchestrate/scripts/validate-project-config.mjs --project-root <absolute-repo>
node agent-automation-orchestrate/scripts/run-task.mjs --project-root <absolute-repo> --task <task-id> --dry-run
node agent-automation-orchestrate/scripts/run-task.mjs --project-root <absolute-repo> --task <task-id> --request "<user-request>"
```

Start the contract from `agent-automation-orchestrate/assets/agent-automation.config.example.json`, or ask the skill for a plain-language guided setup based on the scenario templates in `agent-automation-orchestrate/assets/scenario-templates/`:

```text
Use agent-automation-orchestrate to set up automation for <repo>. I want ready-for-dev Figma components built into Storybook.
```

Read a run summary, or resume a non-terminal run:

```sh
node agent-automation-orchestrate/scripts/status.mjs --project-root <absolute-repo>
node agent-automation-orchestrate/scripts/status.mjs --project-root <absolute-repo> --run-id <run-id>
node agent-automation-orchestrate/scripts/run-task.mjs --project-root <absolute-repo> --task <task-id> --resume <run-id> --request "<remaining-work>"
```

Validation must pass before every run or resume. Config validation, agent completion, project verification, Git commit, and Git push stay separate claims.

### Viewing the pipeline board

Generate the designer-facing board for any project with a `.pipeline-board/pipeline.json` definition, then open the HTML directly in a browser:

```sh
node pipeline-board/scripts/build-pipeline-status.mjs --project-root <absolute-repo>
node pipeline-board/scripts/render-pipeline-board.mjs --status <absolute-repo>/.pipeline-board/status.json --out <absolute-repo>/.pipeline-board/board.html
```

### Running the team task board

`task-board/` is a team-shared Trello-style board for the automation above: a cloud
control plane (Next.js + PostgreSQL, deployable to Zeabur) plus a zero-dependency
worker daemon that runs on each designer's machine, polls for claimable cards, and
wraps `agent-automation-orchestrate/scripts/run-task.mjs` with that machine's own AI
accounts. Card columns are event-driven (claimable / running / needs attention /
awaiting review / done); humans intervene only via commands (rerun with a note,
approve). See `task-board/README.md` for local development, Zeabur deployment,
worker installation, and the end-to-end acceptance script.

### Viewing the portfolio dashboard

Aggregate every tracked project into one overview (all output lands in a `dashboard/` directory next to the portfolio definition), then open the overview HTML directly:

```sh
node portfolio-dashboard/scripts/build-portfolio-status.mjs --portfolio <path-to-portfolio.json>
node portfolio-dashboard/scripts/render-portfolio-dashboard.mjs --status <path-to-portfolio.json-dir>/dashboard/portfolio-status.json
```

### Per-skill installers

For `design-system-to-storybook`, use the bundled installer to install the full skill package into Claude Code, Codex, or Cursor:

```sh
node design-system-to-storybook/scripts/install_agent_skill.mjs --agent all --scope user
```

For a project-local install:

```sh
node design-system-to-storybook/scripts/install_agent_skill.mjs --agent all --scope project --project-root <repo>
```

Preview a Design Automation Hub installation:

```sh
node design-automation-hub-install/scripts/install-design-automation-hub.mjs \
  --project-root <absolute-repo> \
  --host-mode standalone \
  --dry-run \
  --json
```

After installation, validate the target and manually import the reported absolute manifest path in Figma Desktop under **Plugins → Development → Import plugin from manifest**.

When invoking the visual comparison skill, provide the most specific target pair available. For example, prefer:

```text
Use ui-compare-to-reference on reference/dashboard.png and http://localhost:3000/dashboard
```

or:

```text
Use ui-compare-to-reference on reference/dashboard.png and src/pages/Dashboard.tsx
```

If only a screenshot, URL, route, or file is available, the skill will attempt to infer the matching target.

When invoking the pixel alignment report skill, provide the original design source and implemented target when possible:

```text
Use ui-pixel-align-report on reference/dashboard.png and http://localhost:3000/dashboard
```

The generated report is a static HTML + CSS artifact, usually under `reports/design-pixel-align/<target>/`.

## Repository Structure

```text
.
├── agent-automation-orchestrate/
│   ├── SKILL.md
│   ├── agents/
│   ├── assets/
│   │   └── scenario-templates/
│   ├── references/
│   └── scripts/
├── storybook-tools-install/
│   ├── SKILL.md
│   ├── references/
│   └── template/
├── design-system-extractor/
│   ├── SKILL.md
│   ├── agents/
│   ├── assets/
│   ├── references/
│   └── scripts/
├── design-system-to-storybook/
│   ├── SKILL.md
│   ├── agents/
│   ├── assets/
│   ├── references/
│   └── scripts/
├── design-automation-hub-install/
│   ├── SKILL.md
│   ├── agents/
│   ├── references/
│   ├── scripts/
│   └── template/
├── frontend-product-implementation/
│   ├── SKILL.md
│   ├── agents/
│   └── references/
├── pipeline-board/
│   ├── SKILL.md
│   ├── agents/
│   ├── assets/
│   ├── references/
│   └── scripts/
├── portfolio-dashboard/
│   ├── SKILL.md
│   ├── agents/
│   ├── assets/
│   ├── references/
│   └── scripts/
├── storybook-product-prototype/
│   ├── SKILL.md
│   ├── agents/
│   ├── assets/
│   ├── references/
│   └── scripts/
├── task-board/
│   ├── README.md
│   ├── control-plane/
│   └── worker/
├── scripts/
│   └── install_agent_skills.mjs
├── ui-compare-to-reference/
│   └── SKILL.md
├── ui-pixel-align-report/
│   ├── SKILL.md
│   ├── agents/
│   ├── assets/
│   └── scripts/
└── ui-screenshot-to-storybook-product/
    └── SKILL.md
```

## Notes

- Keep skills generic unless a project-specific assumption is explicitly required.
- Prefer token-backed and component-first guidance for UI workflows.
- Update this README when adding or renaming skills.
- `design-system-governance` is referenced by the UI implementation skills and by the docs, but it does not live in this repository. Install it separately; `scripts/install_agent_skills.mjs` only installs the skill folders listed above. When an agent does not recognize `$design-system-governance`, point it at that skill's own installed path rather than a path under this repo.
