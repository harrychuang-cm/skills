# Feature Change

The PM can add, remove, park, or move features at any time. This keeps every change from quietly burying a core task or leaving dead ends behind. Depth is counted as in [experience-review.md](experience-review.md).

## Adding A Feature

Before implementing, answer four questions in plain words:

1. **Tier.** Is it core, secondary, or occasional? Ask when it is not clear. A product has at most three core tasks: adding a fourth means asking which one moves to secondary.
2. **Entry location.** Where does its entry control go: which screen, which region?
3. **Depth.** What is its counted path from the entry screen, and is that within its tier's threshold?
4. **Impact.** Does the addition
   - push an existing core task beyond its threshold (an extra level, a tab moved into an overflow menu)?
   - take the top-level navigation beyond its item limit (five on mobile unless overridden)?
   - push the core task's entry out of the entry screen's first viewport or out of the lead position?

When all answers are within limits, implement it under the `build` rules, add a Feature Registry row (`active`, the date added), and append a `DECISION_LOG.md` entry.

When any limit is crossed, stop before changing navigation. Present the trade-off as two or three options, each with its consequence for depth and navigation, and wait for the PM's choice.

### Example: a sixth bottom tab

The product has five bottom tabs and the PM adds 「社群」 as a sixth.

| Option | What changes | Consequence |
| --- | --- | --- |
| Replace a tab | 「社群」 takes the place of 「通知」, which moves into 「我的」 | Navigation stays at five; 通知 goes from 1 step to 2 |
| Section in an existing tab | 「社群」 becomes a section inside 「市場」 | Navigation unchanged; 社群 is 2 steps away |
| Entry on the home screen | A 「社群」 entry card on the home screen | Navigation unchanged; 社群 is 1 step, but the home screen gains one more element competing with the core task |

## Removing A Feature

1. **Find every entry point**: navigation items, buttons, links, cards, onboarding and empty-state suggestions, settings toggles, notifications, and deep links.
2. **Remove the entry points and links** in the UI. Deleting routes, data, or API calls is engineering logic: list it as needing engineering confirmation instead of deleting it.
3. **Check for dead ends.** Search the code for remaining links to the feature's routes and re-walk the screens that pointed to it. No control may lead to a missing screen.
4. **Recount** the core tasks whose paths passed through the changed screens.
5. **Keep the record.** Set the Feature Registry row's status to `removed` and update Last change; do not delete the row. Append a `DECISION_LOG.md` entry.

## Parking A Feature

Parking hides a feature without deleting it: remove or hide its entry points, keep its code, set the status to `parked`, and log it. Restoring it is an addition: run the four questions again, because the product may have changed since.

## Moving A Feature

Treat a move as a removal from the old location and an addition at the new one: answer the four questions for the new location, check the old location for dead ends, recount, and record one log entry for the move.
