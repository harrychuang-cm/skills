# Storybook Component Queue

## Context

- Design-system package:
- Product repo:
- Framework:
- Storybook/catalog:
- Figma export addon:
- Package manager:
- Token import strategy:
- Current batch:

## Status Values

- `queued`: ready for a future batch
- `in-progress`: selected for the current batch
- `done`: implemented, documented, and verified
- `blocked`: cannot continue without a decision or missing source
- `deferred`: intentionally postponed
- `needs-extraction`: missing design-system evidence or component spec
- `needs-token`: missing token at the required layer
- `needs-api-decision`: shared component API needs a product decision
- `needs-existing-component-review`: similar product component needs review first
- `needs-addon-compatibility`: Storybook, React, or addon setup requirement is missing
- `out-of-scope`: not part of this Storybook rollout

## Component Queue

| Batch | Component | Category | Source spec | Dependencies | Product target | Story target | Decision | Status |
|---|---|---|---|---|---|---|---|---|
| `B01` |  |  |  |  |  |  |  | queued |

## Batch Plan

| Batch | Components | Shared dependencies | Validation | Exit criteria | Status |
|---|---|---|---|---|---|
| `B01` |  |  |  |  | queued |

## Decisions

| Date | Item | Decision | Reason | Follow-up |
|---|---|---|---|---|
|  |  |  |  |  |

## Figma Export Addon

| Requirement | Detected value | Status | Notes |
|---|---|---|---|
| Storybook `^10` |  |  |  |
| React |  |  |  |
| `@storybook/icons` |  |  |  |
| Addon package |  |  |  |
| `.storybook/main.*` registration |  |  |  |
| `.storybook/preview.*` decorator/globals |  |  |  |
| Token prefix/options |  |  |  |

## Verification Log

| Batch | Command or check | Result | Notes |
|---|---|---|---|
|  |  |  |  |
