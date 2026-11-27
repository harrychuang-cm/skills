## Purpose

Define a portable skill for Claude Code, Codex, and Cursor that acts as a UI/UX design director for product managers. It clarifies the target audience and product purpose, records a design direction, a Material Design 3 token plan, and an experience map as durable project documents that later AI sessions follow, and reviews or repairs vibe-coded products so users do not get lost and core features are not buried.

## ADDED Requirements

### Requirement: Installable skill identity

The skill SHALL live in the `uiux-director/` folder with SKILL.md frontmatter `name: uiux-director`, matching the folder name. Its description SHALL be written in English and SHALL include Traditional Chinese trigger phrases that product managers use, including 設計方向, UX 健檢, TA, 使用者會迷路, and 功能藏太深. The repository installer SHALL enumerate the skill without error.

#### Scenario: Installer enumerates the skill

- **WHEN** `node scripts/install_agent_skills.mjs --agent claude --scope user --skill uiux-director --dry-run` runs from the repository root
- **THEN** the command prints the planned destination for `uiux-director` and does not report a name or description mismatch

#### Scenario: Unrelated installs are no longer blocked

- **WHEN** `node scripts/install_agent_skills.mjs --agent claude --scope user --skill anti-ai-style --dry-run` runs from the repository root
- **THEN** the command prints the planned destination for `anti-ai-style` instead of failing on the `uiux-director` folder

---
### Requirement: Mode resolution

The skill SHALL operate in exactly one of five modes per request: `discover`, `build`, `review`, `fix`, and `feature-change`. An explicit mode named by the user SHALL take precedence. When no mode is named, the skill SHALL resolve the mode from the request and the target project state as shown in the example table, and SHALL state the resolved mode in its first reply.

#### Scenario: Mode resolved from request and project state

- **WHEN** a request names no mode
- **THEN** the skill selects the mode from the request intent and the presence of `product-design/` documents and existing UI, and announces it

##### Example: default mode selection

| Request intent | `product-design/PRODUCT_BRIEF.md` | Existing UI in target | Resolved mode |
| --- | --- | --- | --- |
| Start or shape a product idea | absent | absent | `discover` |
| Look at or improve the current product | absent or present | present | `review` |
| Apply selected review findings | present | present | `fix` |
| Add, remove, or move a feature | absent or present | absent or present | `feature-change` |
| Make or change a screen | present with a confirmed direction | absent or present | `build` |
| Make or change a screen | absent | absent or present | `discover` before `build` |

---
### Requirement: Durable product-design documents

The skill SHALL record its decisions in the target project's `product-design/` folder as four documents created from the skill's templates: `PRODUCT_BRIEF.md` (target audience, context of use, device, expertise, product purpose, success measures, non-goals, research summary with sources), `DESIGN_DIRECTION.md` (the eight design decisions, the density profile, the Material Design 3 token plan, and the not-doing list), `EXPERIENCE_MAP.md` (core tasks, feature registry, navigation model, depth thresholds), and `DECISION_LOG.md` (dated entries recording what changed, why, and who confirmed it). Before UI work in any mode, the skill SHALL read the existing documents and treat confirmed entries as the authority for the product. The skill SHALL NOT keep decisions only in conversation memory.

#### Scenario: Later session continues from the documents

- **WHEN** a new AI session runs `build` in a project whose `product-design/` folder holds a confirmed brief, direction, and experience map
- **THEN** the session reads the four documents before generating UI and does not re-ask questions those documents already answer

#### Scenario: Unconfirmed content is labeled

- **WHEN** the skill writes an inferred or assumed answer the product manager has not confirmed
- **THEN** the entry is marked as unconfirmed in the document and is listed as an open question in `DECISION_LOG.md`

---
### Requirement: Agent instruction pointer

After it first creates `product-design/`, the skill SHALL add a managed block delimited by `<!-- uiux-director:START -->` and `<!-- uiux-director:END -->` to each existing `AGENTS.md` and `CLAUDE.md` at the target project root, instructing agents to read the `product-design/` documents before UI work. Re-running SHALL replace the managed block rather than duplicate it, and SHALL NOT modify content outside the markers. When neither file exists, the skill SHALL ask the user which file to create before writing one.

#### Scenario: Pointer added idempotently

- **WHEN** the skill runs twice in a project whose `AGENTS.md` already contains unrelated instructions
- **THEN** `AGENTS.md` contains exactly one uiux-director managed block and the unrelated instructions are unchanged

#### Scenario: No instruction file exists

- **WHEN** the target project root has neither `AGENTS.md` nor `CLAUDE.md`
- **THEN** the skill asks the user which file to create and writes no instruction file before the answer

---
### Requirement: Document language selection

Before writing the first `product-design/` document, the skill SHALL ask the user once to choose the document language, offering 繁體中文 as the first, recommended default and English as the second option, plus a custom-language option. It SHALL record the answer in `DECISION_LOG.md` as `Document Language: <language-tag> (<human-readable name>)` and SHALL NOT ask again while a recognizable record exists. A missing or unrecognizable record SHALL be treated as first use. An explicit user request to switch SHALL update the record, add a dated log entry, and apply the new language to subsequently written sections without rewriting untouched sections. Section headings and table headers SHALL keep an English canonical form; for a non-English document language, a full-width parenthesized annotation in that language SHALL follow the English text, and narrative content SHALL be written in the document language.

#### Scenario: First use asks with Chinese as the default

- **WHEN** the skill is about to create `product-design/` in a project without `DECISION_LOG.md`
- **THEN** the skill asks for the document language with 繁體中文 offered first as the recommended default, and records `Document Language: zh-Hant (繁體中文)` when the user accepts the default

#### Scenario: Recorded language is reused

- **WHEN** `DECISION_LOG.md` contains `Document Language: en (English)`
- **THEN** the skill writes new document content in English without asking

##### Example: heading form by language

| Document Language | Heading written |
| --- | --- |
| zh-Hant (繁體中文) | `## Target Users（目標使用者）` |
| en (English) | `## Target Users` |

---
### Requirement: Discovery interview and product research

In `discover` mode the skill SHALL ask one focused question at a time until it has the primary target audience (who they are, context of use, primary device, domain expertise), the product purpose, up to three core tasks, and how success is observed, and it SHALL ask once about brand materials and liked references as defined in the PM reference materials requirement. It SHALL then research comparable and analogous products and domain conventions, citing a source link for every reference product and every convention claim, and SHALL distinguish sourced facts from its own inferences. It SHALL NOT invent products, metrics, or sources; when research tools are unavailable it SHALL say so and mark affected entries as unverified. Interview answers and research SHALL be written to `PRODUCT_BRIEF.md` only after the product manager confirms the summary.

#### Scenario: Interview asks one question at a time

- **WHEN** a product manager starts `discover` with only a one-line product idea
- **THEN** the skill asks a single question about the primary target audience and waits for the answer before asking the next question

#### Scenario: Research without web access

- **WHEN** the host exposes no web search or fetch tool during `discover`
- **THEN** the skill states that research could not be performed, lists only references the product manager supplied, and marks the research section as unverified

---
### Requirement: Design direction comparison with references and demo

Before a design direction is confirmed, the skill SHALL present two or three candidate directions in a self-contained HTML comparison page written to `product-design/direction-comparison.html`, built from the skill's `assets/direction-comparison.template.html`. Each candidate SHALL show: a one-line summary tied to the target audience, its density profile values, its key colors and main Material Design 3 system choices (color roles, typescale roles, shape scale, density scale), at least two real reference products each with a source URL, what to borrow and what not to borrow from each reference, and a demo of the same product screen rendered in that direction. The demo SHALL use the product manager's own screen when one exists, and otherwise a core-task screen drafted from the brief with realistic domain content. Reference cards SHALL link to sources and SHALL NOT embed copied third-party images unless the product manager supplied them. Each candidate's demo SHALL be styled only through that candidate's `--md-sys-*` values and the `--md-comp-*` slots that alias them, with no hex values and no `--md-ref-*` references in the demo markup or its styles, so the same demo markup renders every candidate. The page SHALL render without network access, SHALL lay the candidates side by side on wide screens and stacked on narrow screens, and SHALL itself avoid the generic AI-style patterns the skill forbids. The product manager's choice, including any mix of candidates, SHALL be recorded in `DESIGN_DIRECTION.md` and `DECISION_LOG.md`.

#### Scenario: Product manager compares directions visually

- **WHEN** `discover` reaches the design direction step for a stock-watchlist product with an existing watchlist screen
- **THEN** `product-design/direction-comparison.html` shows two or three candidates, each rendering the same watchlist screen and listing at least two reference products with source links

#### Scenario: Mixed choice is recorded

- **WHEN** the product manager picks the density of candidate A with the color roles of candidate B
- **THEN** `DESIGN_DIRECTION.md` records the combined direction and `DECISION_LOG.md` records the choice with the date and the confirmer

---
### Requirement: Density profile derived from the audience

`DESIGN_DIRECTION.md` SHALL express breathing room as a density level (compact, regular, or spacious) plus concrete values for the spacing scale, gap between related elements, gap between sections, body text size and line height, maximum content width, and the number of primary items visible in the first viewport. Each value SHALL state the audience or task reason it serves. Each density level SHALL also be expressed in Material Design 3 terms: the M3 density scale value for component heights, the spacing-ladder labels used for related-element and section gaps, the typescale role used for body text, and layout margins per window size class (16px for compact windows narrower than 600px and 24px for medium and wider windows, unless the direction records a reason to differ). A density choice justified only by appearance words such as premium, modern, or clean SHALL be rejected and re-derived from the audience and task.

#### Scenario: Density follows the audience

- **WHEN** the brief describes the primary audience as professional traders scanning many quotes during market hours
- **THEN** the direction records a compact density level with values and reasons that keep more rows visible in the first viewport

##### Example: two audiences, two density profiles

| Field | Professional traders (compact) | Retired investors checking weekly (spacious) |
| --- | --- | --- |
| Reason | Scan many quotes quickly during market hours | Read calmly; larger targets and text reduce errors |
| M3 density scale | −2 | 0 |
| Gap between related elements | `gap-stack-2xs` to `gap-stack-xs` (4–8px) | `gap-stack-sm` to `gap-stack-md` (12–16px) |
| Gap between sections | `md` (16px) | `2xl` to `3xl` (32–40px) |
| Body text role | `body-medium` (14/20) | `body-large` raised to a custom step `body-large-plus` (18/28) for older readers |
| Primary items visible in first viewport | 15 or more quote rows | 5–6 holdings |

#### Scenario: Appearance-only justification is rejected

- **WHEN** a candidate density is justified only as "more whitespace feels premium"
- **THEN** the skill replaces the justification with an audience or task reason, or changes the value

---
### Requirement: Experience map with depth thresholds

`EXPERIENCE_MAP.md` SHALL list up to three core tasks, each with its entry point, current step count, and target step count, and a feature registry where every feature has a tier (core, secondary, occasional), a status (active, parked, removed), its entry location, and its depth. A step SHALL count one user navigation action (tap, click, menu open, or list selection) taken from the product's entry screen until the screen where the task's primary action is available. Default thresholds SHALL be at most two steps for core tasks and at most three for secondary features; a product SHALL be able to override a threshold in `EXPERIENCE_MAP.md` with a recorded reason. A core task reachable only through an overflow menu, a settings page, or a hover-only control SHALL fail regardless of step count.

#### Scenario: Depth is checked against thresholds

- **WHEN** the skill evaluates the core tasks recorded in `EXPERIENCE_MAP.md`
- **THEN** each task is marked pass or fail against its threshold, and failures are reported with the path that was counted

##### Example: step counting

| Task | Tier | Counted path from entry screen | Steps | Threshold | Result |
| --- | --- | --- | --- | --- | --- |
| Place a buy order | core | Home → tap Watchlist tab → tap stock row (Buy button visible) | 2 | 2 | pass |
| Set a price alert | core | Home → open ⋯ menu → Settings → Alerts → Add | 4 | 2 | fail |
| Export history | secondary | Home → Account → History (Export visible) | 2 | 3 | pass |
| Compare two stocks | core | Home → hover row → Compare (hover-only) | 2 | 2 | fail: hover-only entry |

---
### Requirement: Review mode experience health check

In `review` mode the skill SHALL NOT modify UI source. When `PRODUCT_BRIEF.md` is absent it SHALL infer the target audience, product purpose, and core tasks from the code and rendered screens, and confirm them with the product manager using at most three questions before judging. It SHALL build the current experience map from routes, navigation structure, and rendered screens, and SHALL check wayfinding: each page title matches the label of the control that opened it, navigation indicates the current location, every page offers a visible way back or out, success, empty, and error states offer a next step, one concept uses one name across the product, dialogs are not stacked, flows longer than three steps show progress, and mobile top-level navigation has at most five items. It SHALL check core-task depth against the experience map thresholds. It SHALL report literal color, spacing, radius, and type values in UI code and direct use of reference-tier (`--md-ref-*`) tokens in UI code as findings. Visual AI-style findings SHALL come from the `anti-ai-style` review mode and design-system findings from `ds-governance` when those skills are available. The report SHALL be written in the document language to `product-design/reviews/<YYYY-MM-DD>-review.md`, rank findings as P0 (users get lost, stuck, or cannot reach a core task), P1 (unclear hierarchy or extra effort), or P2 (polish), and state for each finding the problem, the impact on users, the recommendation, and whether the fix is UI-only or needs engineering confirmation. When handing the report back, the skill SHALL ask whether the product manager has reference websites, apps, or screenshots to use before `fix` changes visuals; this question SHALL NOT count toward the three confirmation questions and SHALL NOT delay the report.

#### Scenario: Review of a half-built vibe-coded product without a brief

- **WHEN** a product manager asks for a UX review of a project that has UI routes but no `product-design/` folder
- **THEN** the skill asks at most three confirmation questions about audience, purpose, and core tasks, then writes a dated review report and changes no UI source files

#### Scenario: References are requested at hand-back

- **WHEN** the skill hands back a review report after asking two confirmation questions
- **THEN** the hand-back message asks whether the product manager has reference websites, apps, or screenshots for the visual fixes, and the review asked no more than three confirmation questions before the report

#### Scenario: Buried core feature is a P0 finding

- **WHEN** the review finds a confirmed core task reachable only through the settings page
- **THEN** the report lists it as P0 with the counted path, the user impact, and a recommended entry point

---
### Requirement: Fix mode logic lock

In `fix` mode the skill SHALL apply only the findings the product manager selected. It SHALL change only UI structure, layout, styling, copy, and state presentation, and SHALL NOT change data structures, state management, API calls, or event-handler logic. A selected finding that requires such a change SHALL be marked as needing engineering confirmation and left unapplied. Changes SHALL proceed in layers (tokens and theme, then shared components, then page composition, then missing states) and follow `ds-governance` approval gates when available. After applying, the skill SHALL re-check the affected findings and end with a short summary of what was fixed, what was deferred, and what was verified by rendering versus by reading source.

#### Scenario: Logic change is deferred

- **WHEN** a selected finding requires moving a core feature to a new route that changes the router's data loading
- **THEN** the skill applies no change for that finding and marks it as needing engineering confirmation in the summary

---
### Requirement: Non-blocking build mode guardrails

In `build` mode the skill SHALL complete the requested screen change following the recorded direction and SHALL NOT block the change on guardrail findings. When the result has more than one primary action in a single region, a dialog with more than six input fields, a narrow table with more than six columns, or a core task that the change pushes beyond its depth threshold, the skill SHALL append at most two sentences of director advice after the result. Before generating UI it SHALL apply `anti-ai-style` prevent mode when available, using `DESIGN_DIRECTION.md` as the recorded direction.

#### Scenario: Guardrail advice does not block

- **WHEN** a product manager asks for a modal containing nine input fields during `build`
- **THEN** the skill builds the modal as requested and appends one or two sentences recommending a drawer or a separate page

---
### Requirement: Feature change impact check

In `feature-change` mode, before implementing an added feature the skill SHALL state its proposed tier, entry location, and resulting depth, and whether the addition pushes any core task beyond its threshold or the top-level navigation beyond its item limit; when it does, the skill SHALL present the trade-off and wait for the product manager's choice. When removing a feature it SHALL remove its entry points, navigation items, and links to it, mark the feature as removed in the feature registry rather than deleting the row, and record the change in `DECISION_LOG.md`.

#### Scenario: Addition would bury a core task

- **WHEN** the product manager adds a sixth top-level tab to a mobile product whose navigation already has five items
- **THEN** the skill reports the navigation limit, proposes alternatives, and waits for a choice before changing navigation

#### Scenario: Removed feature leaves no dead links

- **WHEN** the product manager removes the "community" feature
- **THEN** its navigation item and links are removed, the registry row shows status removed, and `DECISION_LOG.md` has a dated entry

---
### Requirement: Delegation to companion skills with fallback

The skill SHALL delegate generic AI-style judgment to `anti-ai-style`, token and shared-component decisions to `ds-governance`, and Storybook prototype and handoff documents to `storybook-product-prototype`, passing the `product-design/` documents as input. `scripts/skill-dependencies.json` SHALL list `anti-ai-style` and `ds-governance` as `support` dependencies of `uiux-director`. When a companion skill is unavailable, the skill SHALL use its own compact baseline rules and state that the baseline was used. For Figma Variables work the skill SHALL hand the Material Design 3 token plan to `figma-m3-variables` when that skill is available; because `figma-m3-variables` is not maintained in this repository, it SHALL NOT be listed in `scripts/skill-dependencies.json`. The skill SHALL NOT contain a hardcoded token or component list for any specific product.

#### Scenario: Companion skill absent

- **WHEN** `review` runs where `anti-ai-style` is not installed
- **THEN** the report applies the skill's baseline visual rules and states that the `anti-ai-style` catalog was not used

#### Scenario: Dependency registry resolves

- **WHEN** `node --test scripts/test_install_agent_skills.mjs` runs after the registry update
- **THEN** all tests pass

---
### Requirement: Material Design 3 token method

The skill SHALL record token decisions in `DESIGN_DIRECTION.md` with Material Design 3's three tiers: reference tokens hold raw values, system tokens hold shared roles that alias reference tokens, and component tokens hold component slots that alias system tokens. Code names SHALL follow `--md-ref-*`, `--md-sys-*`, and `--md-comp-*`, matching `design-system-extractor`; Figma names SHALL follow `ref/`, `sys/`, and `comp/`, matching `figma-m3-variables`. Color SHALL start from key colors chosen from product or brand evidence or a stated audience reason, expanded into tonal palettes and mapped to M3 system color roles; domain meanings that M3 roles do not cover (for example rise and fall colors in a stock market) SHALL use named extension roles instead of reusing `error`. Type SHALL use M3 typescale roles, corner radii the M3 shape scale, layering the surface-container roles and elevation levels, and interaction feedback the M3 state-layer opacities. Material Design 3 SHALL be applied as a method, not a look: the skill SHALL NOT keep the M3 baseline primary color `#6750A4` or the Roboto typeface unless evidence or the product manager's explicit choice supports it, and the source SHALL be recorded. UI produced in `build` and `fix` SHALL consume system- or component-tier tokens only, never reference-tier tokens or literal values. When the target already has a token system that does not follow M3, the skill SHALL map M3 roles onto the existing tokens in `DESIGN_DIRECTION.md` and SHALL NOT create a parallel token system. When the target has no token system, the skill SHALL propose a minimal M3 starter token set through the `ds-governance` Token Gate and SHALL create no token file before approval.

#### Scenario: Direction records M3 roles with sources

- **WHEN** the product manager confirms a direction for a Taiwan stock-watchlist product whose brand guide supplies a navy key color
- **THEN** `DESIGN_DIRECTION.md` records the navy key color with its source, the tonal palette source, the system color role mapping including extension roles for price rise and fall, the typescale roles in use, the shape scale steps in use, and the density scale value

##### Example: role mapping excerpt

| Tier | Token | Value or alias | Source |
| --- | --- | --- | --- |
| ref | `--md-ref-palette-primary-30` | tonal palette tone 30 of the navy key color | brand guide |
| sys | `--md-sys-color-primary` | `var(--md-ref-palette-primary-30)` | brand guide |
| sys | `--md-sys-color-price-rise` | tone from a dedicated red palette, separate from `error` | Taiwan market convention: red means rise |
| sys | `--md-sys-color-price-fall` | tone from a dedicated green palette | Taiwan market convention: green means fall |

#### Scenario: Baseline look is not kept by default

- **WHEN** a candidate direction has no brand color evidence and the product manager has not chosen a color
- **THEN** the candidate's key color comes from a stated audience or domain reason and is not `#6750A4`, and its typeface is not Roboto unless a recorded reason supports it

#### Scenario: Existing non-M3 tokens are mapped, not replaced

- **WHEN** the target project already defines `--brand-blue-500` and `--text-primary` and no `--md-sys-*` tokens
- **THEN** `DESIGN_DIRECTION.md` maps `primary` to `--brand-blue-500` and `on-surface` to `--text-primary`, and the skill creates no `--md-sys-*` token file

#### Scenario: Missing token system goes through the Token Gate

- **WHEN** `build` needs tokens in a target project with no token system
- **THEN** the skill lists the proposed M3 starter system tokens with values from `DESIGN_DIRECTION.md` and waits for approval before writing any token file

#### Scenario: Generated UI uses system or component tokens

- **WHEN** `build` adds a primary button to a project with M3 tokens
- **THEN** the button's colors and corner radius reference `--md-comp-*` or `--md-sys-*` custom properties and contain no hex values and no `--md-ref-*` references

---
### Requirement: PM reference materials

The skill SHALL ask for two kinds of reference separately. The product's own brand materials (brand colors, logo, brand guidelines, an existing product, Figma) SHALL be recorded as design evidence. Websites, apps, or screenshots the product manager likes SHALL be recorded as direction references, and for each one the skill SHALL ask what the product manager likes about it. Each direction reference SHALL be recorded in the PM References section of `PRODUCT_BRIEF.md` with its source (URL or file path), what the product manager likes, what to avoid, the design decisions it informs, and its Confirmation, and SHALL be translated into what to borrow and what not to borrow. The skill SHALL NOT copy another brand's logo, signature colors, or other identity elements from a direction reference. The skill SHALL ask in the `discover` interview, again when presenting the direction comparison page, and SHALL treat any reference the product manager supplies at any time, in any mode, as a direction reference; when a reference would change a confirmed entry, the skill SHALL ask before changing it and record the answer in `DECISION_LOG.md`. Screenshots the product manager supplies SHALL be saved under `product-design/references/`, and the comparison page SHALL be allowed to show them. When the product manager has no references, the skill SHALL continue with the references found in research without blocking.

#### Scenario: Liked reference gets a follow-up question

- **WHEN** the product manager says they like a banking app's home screen
- **THEN** the skill asks what they like about it before using it, and records the answer as borrow and not-borrow entries tied to specific design decisions

##### Example: a liked reference translated into decisions

| Source | What the PM likes | Borrow | Not borrow | Decisions informed |
| --- | --- | --- | --- | --- |
| A banking app home screen (screenshot `product-design/references/bank-home.png`) | Large balance number, few items on the first screen | One large lead number; at most four items in the first viewport | Its brand red and logo | Hierarchy, Density |

#### Scenario: Supplied screenshot is kept

- **WHEN** the product manager pastes a screenshot during the `discover` interview
- **THEN** the screenshot is saved under `product-design/references/` and a PM References row points to it

#### Scenario: Brand evidence and liked references play different roles

- **WHEN** the product manager supplies both a brand guide with a navy brand color and a liked app whose signature color is orange
- **THEN** the key color comes from the brand guide, and the liked app informs only the decisions the product manager said they like, with its orange recorded under not borrow

#### Scenario: A mid-build reference conflicts with the confirmed direction

- **WHEN** during `build` the product manager supplies a screenshot whose density is far more compact than the confirmed direction
- **THEN** the skill asks whether to update the direction before changing any density value, and records the answer in `DECISION_LOG.md`

#### Scenario: No references does not block

- **WHEN** the product manager answers that they have no brand materials and no liked references
- **THEN** `discover` continues, the entries are recorded as none, and the candidate directions cite references found in research
