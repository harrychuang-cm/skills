---
name: frontend-product-implementation
description: Implement frontend products and production features from PRD, UI Flow, UI Spec, Data Spec, Acceptance, Implementation Guide, and PRODUCTION_HANDOFF docs. Use when building a product from 0 to 1, adding a new interface or feature to an existing web/app frontend, translating Storybook prototype handoff docs into production repo code, creating route/screen/component/data-adapter work from API/data contracts, or continuing frontend implementation after storybook-product-prototype. Always follow design-system-governance: discover tokens, grid, motion, i18n, and shared components first; reuse existing components; stop for approval before creating missing tokens or shared components.
---

# Frontend Product Implementation

Use this skill to turn frontend handoff documents into working product code in a real repo. It supports two delivery modes:

- Greenfield: create a new frontend product from 0 to 1.
- Existing product: add a new interface, route, screen, or feature to an existing app.

This skill owns frontend implementation only. When real API clients, auth, persistence, storage, or environment wiring are not explicitly provided, create typed contracts, deterministic fixtures, and mock adapters instead of inventing production integrations.

## Required Companion Skill

Before implementing UI, load and follow `$design-system-governance`.

Apply its Phase 0 discovery and gates as mandatory:

- Discover token naming, token layers, grid/layout, motion tokens, shared components, Storybook, and i18n before writing UI.
- If the project has no token system, stop and ask whether to establish one first.
- If a required token is missing, ask: `找不到對應的 design token（sys/comp 層）。是否要先建立這組 token，再繼續元件開發？`
- If a required shared component is missing, ask: `目前既有元件無法完整組裝此組件。是否要先建立新的共用子元件，再繼續？`
- Do not add hardcoded visual values, one-off inline child components, or display text outside the project i18n source.

## Reference Loading

Read only the reference needed for the current step:

- Handoff docs and input contract: `references/handoff-ingestion.md`
- Greenfield and existing-product implementation flow: `references/implementation-workflow.md`
- Verification and final reporting: `references/verification-reporting.md`

## First Actions

1. Identify the target repo root and whether the request is greenfield or existing-product work.
2. Locate handoff docs, usually:
   - `PRD.md`
   - `FLOW_SPEC.md`
   - `UI_SPEC.md`
   - `DATA_SPEC.md`
   - `PRODUCTION_HANDOFF.md`
   - `ACCEPTANCE.md`
   - `IMPLEMENTATION_GUIDE.md`
3. Read `PRODUCTION_HANDOFF.md` first when present, then cross-check PRD, flow, UI, data, and acceptance docs.
4. Load and apply `$design-system-governance` before any UI implementation.
5. Inspect the existing repo before writing code: framework, routes/screens, design-system package, component library, tokens, i18n, data/API patterns, tests, Storybook, and build scripts.
6. Build an implementation map from handoff routes/states/data contracts to repo files and components.
7. Stop for user approval at design-system governance gates before creating missing tokens or shared components.

## Implementation Rules

- Use existing design-system components and tokens first.
- Add product surfaces by following the repo's existing routing, screen, state, i18n, and test conventions.
- Use deterministic fixtures and mock adapters when real data sources are not in scope.
- Preserve handoff route ids and transition triggers in implementation names, tests, comments, or metadata where useful for traceability.
- Implement loading, empty, error, disabled, permission, optimistic, retry, and async branch states when documented.
- Keep Storybook or regression stories when the repo has Storybook; add or update stories for changed shared components.
- Do not create new shared components, tokens, or visual semantics without approval.
- Do not wire real API clients, auth, storage, persistence, or environment-specific behavior unless the user explicitly asks and the repo provides the pattern.
- Update implementation notes or docs when the production code intentionally diverges from handoff docs.

## Greenfield Mode

For a new product from 0 to 1:

1. Determine whether a design system or component package is provided.
2. If no design system exists, stop and ask whether to establish one or use an existing package/template.
3. Create the smallest production-like app structure that can host the documented routes/screens.
4. Add token/i18n/component infrastructure before page implementation.
5. Implement routes/screens from the handoff docs using deterministic data adapters.
6. Add verification scripts and tests appropriate to the selected stack.

## Existing Product Mode

For a feature in an existing product:

1. Match handoff routes to existing app routes, screens, navigation stacks, sheets, modals, or component surfaces.
2. Reuse existing shared components and local feature patterns.
3. Add only the smallest new route/screen/state/data-adapter code needed for the feature.
4. Keep changes inside the repo's ownership boundaries.
5. Add tests, stories, fixtures, and docs using the repo's established conventions.

## Completion Criteria

Do not consider work complete until:

- Design-system governance discovery findings are recorded in the final response.
- Existing tokens/components reused are identified.
- Any new token/component approval decisions are reported.
- Handoff routes, states, and data contracts are implemented or explicitly marked as deferred/open.
- Typecheck, tests, build, Storybook build, or app preview commands have been run when available.
- Remaining open decisions are listed, especially real API/data/auth/persistence ownership.
