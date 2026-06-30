# Implementation Workflow

Use this reference after handoff docs are read and the target repo is identified.

## Repo Discovery

Inspect before editing:

- package manager and scripts: `package.json`, lockfiles, workspace files
- app framework: Next, Vite, React Native, Expo, SwiftUI bridge, etc.
- route or screen structure: `app/`, `pages/`, `src/routes`, `src/screens`
- shared components: `src/components`, `packages/ui`, Storybook stories
- design tokens and styles: `tokens/`, `src/styles`, CSS variables, theme files
- i18n source: `locales/`, message catalogs, `i18n.*`
- data/API patterns: clients, hooks, services, mocks, fixtures
- tests and verification: unit, component, e2e, Storybook, build scripts

Record discoveries in working notes and final response.

## Design-System Governance Gate

Before any UI implementation:

1. Apply `$design-system-governance` Phase 0 discovery.
2. List existing tokens and shared components relevant to the handoff.
3. Attempt composition from existing shared components.
4. Stop and ask if a required token or shared component is missing.

Do not add fallback hardcoded color, spacing, radius, typography, motion, or display text values.

## Existing Product Mode

Use this when a repo already has app code.

1. Map handoff surfaces to existing route/screen ownership.
2. Reuse the closest existing feature folder structure.
3. Reuse existing components before adding feature-local components.
4. Add typed fixtures or mock adapters near the repo's existing mock/data pattern.
5. Add feature state using the repo's existing state style.
6. Add or update tests, stories, and i18n entries.
7. Run the narrowest meaningful verification first, then broader build checks.

Avoid broad refactors unless needed to satisfy the handoff.

## Greenfield Mode

Use this when the target has no product app yet.

1. Confirm target platform and framework if not obvious.
2. Confirm the design system source. If none exists, stop and ask whether to establish one first.
3. Set up token, i18n, routing, component, fixture, and test structure before pages.
4. Build the first route/screen with deterministic fixtures.
5. Add documented branch states and route transitions.
6. Add stories or visual regression surfaces when the stack supports them.
7. Run the generated app locally or build it before reporting completion.

Greenfield work should be minimal but production-like: clear folders, typed contracts, replaceable data adapters, and verification scripts.

## API/Data Adapter Pattern

When real integration is out of scope, create:

- `types` for request, response, error, and UI state
- fixtures for documented success, loading, empty, error, disabled, and permission states
- mock adapter or hook returning deterministic data
- clear replacement point for the receiving implementation

Do not invent real endpoints. Do not add secrets, environment variables, auth flows, or persistence without explicit scope.

## Documentation Updates

When implementation changes or narrows the handoff:

- update local implementation notes if the repo has them
- update Storybook docs/stories if used as regression surface
- record deferred handoff requirements
- record new open decisions for product, design, data, API, auth, platform, or release ownership
