# Token Architecture

Document the token layers, prefixes, naming model, and audit rules for this package.

## Prefixes

| Layer | Prefix | Responsibility |
|---|---|---|
| Reference | `--md-ref-*` | Raw values only |
| System | `--md-sys-*` | Shared semantic roles |
| Component | `--md-comp-*` | Component and region slots |

## Inheritance

```txt
component token -> system token -> reference value
```

## Reference Color Scale

Use numeric palette steps from light to dark:

```txt
100 -> 0
```

- `100` is the lightest visible step in a palette family.
- `0` is the darkest visible step in a palette family.
- Higher numbers must be visually lighter than lower numbers in the same family.
- Semantic color names belong in `sys`, not `ref`.

## Layer Rules

| Layer | Allowed | Forbidden |
|---|---|---|
| Reference | raw color steps, sizes, weights, radius, opacity | semantic roles, component names |
| System | shared roles, foreground/background pairs, spacing roles | component anatomy |
| Component | component slots and states | raw values, direct reference values |

## Near Token Decisions

Use this table when candidate reference tokens are visually or numerically close. Stop and confirm with the developer before finalizing unresolved rows.

| Candidate A | Candidate B | Difference | Decision (`merge` / `keep distinct`) | Rationale | Confirmed by |
|---|---|---|---|---|---|

## Native Unit And Source Mapping

Use this table for native iOS/Android projects when source values use platform units or platform token/resource files.

| Canonical token | Native source token/resource | Platform/unit | Source file | Evidence screen/capture | Mapping or conversion note |
|---|---|---|---|---|---|

## Required Audit

- No component token references a reference token directly.
- No system token name includes component anatomy.
- No reference token name includes semantic roles.
- Reference color steps follow `100` lightest to `0` darkest.
- Near reference colors and numbers have a documented merge or keep-distinct decision.
- Every background-like system color has a matching foreground pair.
- For vibe-coded projects, values found only in unused CSS, demo-only components, dead code, or blocked captures are not promoted to tokens unless a keep decision is recorded in `DESIGN_EVIDENCE_MAP.md`.
- For native app projects, values found only in source-only views, unused previews, blocked captures, or unverified resources are not promoted to tokens unless a keep decision is recorded in `DESIGN_EVIDENCE_MAP.md`.
