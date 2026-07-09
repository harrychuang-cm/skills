# CM Skills

Reusable Cursor / Claude Code skills for UI implementation workflows.

Open the visual guide at [`docs/skills-guide.html`](docs/skills-guide.html) for a simple overview of each skill, when to use it, and common prompts.

## Skills

### `design-system-extractor`

Extract a reusable design-system package from screenshots, Figma references, exports, existing app folders, or prototype code:

1. Build evidence-backed design principles and design elements.
2. Define `ref -> sys -> comp` token architecture and token files.
3. Inventory components and write component token specs.
4. Generate static HTML documentation and run source/token/component audits.

Use this before implementation when the design system needs to be documented and reviewed as a source of truth.

### `ui-compare-to-reference`

Compare an implemented UI against one or more reference screenshots, then apply focused visual fixes. This skill is project-agnostic: it discovers the target repo's screenshots, routes, components, Storybook stories, styling system, and design tokens before editing.

Supported target examples:

```text
screen-2.png
screen-2.png http://localhost:3000/dashboard
screen-2.png /dashboard
screen-2.png src/pages/Dashboard.tsx
http://localhost:3000/dashboard
src/pages/Dashboard.tsx
Dashboard.stories.tsx
```

Use this when you need visual parity checks, layout drift fixes, token alignment, or screenshot-to-implementation comparison.

### `ui-pixel-align-report`

Generate a design pixel alignment audit between an original design reference and an implemented UI. The skill captures or organizes full screenshots, per-issue crops, measured visual drift, ownership classification, and recommended fixes into a static HTML + CSS report.

Expected report inputs include:

```text
reference/dashboard.png http://localhost:3000/dashboard
https://www.figma.com/design/...node-id=1-2 http://localhost:3000/dashboard
figma-frame.png Dashboard.stories.tsx
```

Use this when you need reviewable evidence, design QA documentation, screenshot-backed incorrect style findings, or a handoff artifact before applying visual fixes.

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
3. Follow `design-system-governance`: reuse tokens/components first, and stop for approval before creating missing tokens or shared components.
4. Build greenfield products or add features to existing products with deterministic fixtures and mock data adapters when real integration is out of scope.
5. Verify with the repo's typecheck, tests, build, Storybook, or app preview commands.

Use this after `storybook-product-prototype` or any equivalent handoff when you want the docs to become frontend product code while preserving design-system governance.

### `component-coverage-install`

Install and bind the Storybook「Component Coverage Analyzer」tool into any React + Vite Storybook project:

1. Copy the bundled template verbatim: tool UI (Storybook Tools page), dev API vite plugin, check scripts, and the companion `component-coverage-analyze` / `component-coverage-implement` project skills.
2. Generate a project-specific component catalog by reading the target project's components and stories (the AI binding step — see `references/catalog-authoring.md`).
3. Wire `.storybook/main.ts` (`viteFinal` plugin + `staticDirs`), create the `outputs/component-coverage/` data directory, and verify end to end (checks, typecheck, dev API, tool page, static build).
4. Update a previously installed copy via the `TEMPLATE_MANIFEST.json` version, overwriting only template-owned files.

Use this to bring the UI-image/PRD → coverage report → developer review → implementation workflow to a new Storybook project.

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

For `design-system-to-storybook`, use the bundled installer to install the full skill package into Claude Code, Codex, or Cursor:

```sh
node design-system-to-storybook/scripts/install_agent_skill.mjs --agent all --scope user
```

For a project-local install:

```sh
node design-system-to-storybook/scripts/install_agent_skill.mjs --agent all --scope project --project-root <repo>
```

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
├── component-coverage-install/
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
├── frontend-product-implementation/
│   ├── SKILL.md
│   ├── agents/
│   └── references/
├── storybook-product-prototype/
│   ├── SKILL.md
│   ├── agents/
│   ├── assets/
│   ├── references/
│   └── scripts/
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
