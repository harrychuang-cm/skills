# Review Report Template

Write the report in the user's language. Keep tell IDs, file paths, and code identifiers as they are. Use the short form when the user wants only the essentials: the verdict line, the findings table, and the open questions.

```markdown
# Anti-AI Style Review: <target>

Catalog version <x.y.z> · Mode: <review | fix> · Authority: <evidence | direction>

## Verdict

<One or two sentences. State whether the screen reads as generated, which cluster it matches if any, and the single change that would do the most.>

Sources used: <project rules file, Figma node, screenshots, stated direction, or "generic catalog only">
Seen as: <rendered at <viewport> / source only / screenshot supplied>

## Findings

Ordered by decision: genre, content, hierarchy, density, type, color, surface, decoration, motion.

| # | Tell | Where | What is there | Verdict | Replace with | Layer |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | fixtures/users.ts:12 | "John Doe", "Jane Smith" | default | Names from the member fixture; one long name | content |
| 2 | S3 | components/Card.tsx:8 | border + shadow-lg + rounded-2xl | default | Surface step only, as in the settings screens | shared component |

Layer is where the fix belongs: token, shared component, composition, page, or content.

## Kept

Patterns that match a catalog tell and stay.

| Tell | Where | Why it stays |
| --- | --- | --- |
| D1 | PromoBadge | Evidenced Exceptions row; Figma node 2114:8830 |

## Open Questions

Brand-level choices with no evidence either way. Not changed.

- <K1: primary color #5856d6 has no source in the supplied references. Is it the brand color?>

## Fix Plan

<Review mode: the proposed order of work. Fix mode: what was applied.>

1. <Content: ...>
2. <Shared component: ... (needs approval: changes Card's public look)>

## Verification

<Fix mode only.>

- Scanner before: <n strong, n check>. After: <n strong, n check>.
- Rendered and checked: <screens and viewports>
- Tests repeated: <reason, swap, removal, squint, edge content: result per screen>
- Not verified: <what could not be rendered or run, and why>

## Limits

<What this review did not look at: states not reachable, native builds not run, values hidden behind tokens the scanner cannot read.>
```

## Rules For Writing It

- Every finding has a location a person can open: `file:line`, a story ID, a Figma node, or a screenshot with the region described.
- "Replace with" is concrete and names its source. "Simplify the card" is not a replacement.
- A scanner candidate judged `evidenced` or `chosen` goes under Kept, not under Findings.
- Do not pad the list. Twenty hits of one tell in one shared component are one finding with a count.
- If three or more findings belong to one cluster, say so in the verdict and plan a rebuild from decisions; do not present it as twenty independent fixes.
- If no authority source existed, say the review used the generic catalog only and that verdicts on `check` tells are provisional.
- State plainly when the screen is fine. Not every screen has a problem.
