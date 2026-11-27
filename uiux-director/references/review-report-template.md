# Review Report Template

`review` writes one report per run to `product-design/reviews/<YYYY-MM-DD>-review.md` (add `-2`, `-3` for a second run on the same day). Write it in the document language from `DECISION_LOG.md`: headings and table headers keep this English form, with the translation appended in full-width parentheses when the language is not English; narrative and table cells are in the document language. Severity labels, finding IDs, file paths, and token names stay as they are.

Write for the PM: lead each finding with what the user experiences, not with the code.

```markdown
# UX Review: <product or scope>

| Item | Answer |
| --- | --- |
| Date | <YYYY-MM-DD> |
| Scope | <screens, routes, or flows reviewed> |
| Seen as | <rendered at <viewport> / source only / screenshots supplied> |
| Brief | <confirmed / inferred and confirmed with <n> questions / inferred, unconfirmed> |
| Companion checks | <anti-ai-style review / ds-governance / baseline rules only, because ...> |

## Summary

<Two or three plain sentences: the biggest problem users hit, and the one change that would help most.>

| P0 | P1 | P2 |
| --- | --- | --- |
| <n> | <n> | <n> |

## Core Task Depth

| Task | Tier | Counted path from entry screen | Steps | Threshold | Result |
| --- | --- | --- | --- | --- | --- |
| <task> | core | <Home → tap X → tap Y (primary action visible)> | <n> | <n> | <pass / fail / fail: overflow-only / fail: settings-only / fail: hover-only entry> |

## Findings

### P0: Users Get Lost, Get Stuck, Or Cannot Reach A Core Task

| ID | Problem | Impact on users | Recommendation | Change scope | Where |
| --- | --- | --- | --- | --- | --- |
| P0-1 | <what is wrong, in user terms; for depth, include the counted path> | <what users experience: get lost, give up, make an error> | <the change, concretely: where the entry goes, what the state offers> | <UI-only / needs engineering confirmation: why> | <route, screen, file, screenshot> |

### P1: Unclear Hierarchy Or Extra Effort

| ID | Problem | Impact on users | Recommendation | Change scope | Where |
| --- | --- | --- | --- | --- | --- |
| P1-1 | | | | | |

### P2: Polish

| ID | Problem | Impact on users | Recommendation | Change scope | Where |
| --- | --- | --- | --- | --- | --- |
| P2-1 | | | | | |

## Visual And Token Findings

From `anti-ai-style` (tell IDs kept), `ds-governance`, and the token checks in md3-token-method.md › Review Checks. Each row also carries a severity.

| ID | Problem | Impact on users | Recommendation | Change scope | Where | Source |
| --- | --- | --- | --- | --- | --- | --- |
| P1-<n> | <e.g. 23 hex colors written directly in screens> | <colors drift between screens; dark mode cannot work> | <replace with --md-sys-* roles from the Token Plan> | UI-only | <files> | token check |

## Open Questions

- <Questions the PM must answer before some findings can be fixed, each naming the finding IDs it blocks.>

## Next Step

Reply with the IDs to fix, for example 「修 P0-1、P0-2、P1-3」. `fix` applies only the selected IDs; findings marked "needs engineering confirmation" are listed for engineering and not applied.

## Limits

<What was not checked: states that could not be reached, screens not rendered, platforms not run, flows behind sign-in.>
```

## Change Scope

| Value | Use when |
| --- | --- |
| UI-only | The fix changes only structure, layout, styling, copy, tokens, or state presentation |
| needs engineering confirmation | The fix needs a change to data structures, state management, API calls, event-handler logic, or routing that loads data; name which |
