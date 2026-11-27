# Experience Review

The checks that keep users oriented and keep core tasks close. `review` applies all of them; `build` and `feature-change` apply the depth rules to the screens they touch. Results go into `EXPERIENCE_MAP.md` and the review report.

## Walk The Product

1. Prefer the rendered product: run it (dev server, Storybook, simulator, or a deployed preview), start from the entry screen, and walk each core task, taking a screenshot per step.
2. When nothing can be rendered, read the routes, navigation components, and the screens' entry controls. Say in the report that the paths were derived from source, not walked.
3. Build the current experience map: routes → screen titles → the control that opens each screen → the depth of each feature. Fill the Feature Registry and the Core Tasks table of `EXPERIENCE_MAP.md`; mark inferred rows `unconfirmed`.

## Step Counting

**One step is one navigation action taken from the product's entry screen until the screen where the task's primary action is available.**

- **Start** at the entry screen recorded in `EXPERIENCE_MAP.md`: the screen users land on after launch or sign-in.
- **Count** each tap, click, menu open, and list selection. A hover that reveals a control that is otherwise invisible also counts as a step.
- **Stop** at the screen where the task's primary action is available, for example the screen showing the Buy button. The primary action itself is not counted.
- **Do not count** scrolling within a screen, typing into fields, sign-in, and system permission dialogs.
- **Count the path a first-time user can find** from visible controls. Search and deep links are recorded as alternative paths; they do not lower the count.
- **Write the counted path** in the report and in `EXPERIENCE_MAP.md`, for example `Home → tap Watchlist tab → tap stock row (Buy button visible)`, so anyone can recount it.

## Depth Thresholds

| Tier | Default maximum steps |
| --- | --- |
| core | 2 |
| secondary | 3 |
| occasional | no limit |

- The defaults are product heuristics, not measurements. A product overrides a threshold in `EXPERIENCE_MAP.md` › Depth Thresholds with a recorded reason, for example usability-test evidence or a regulatory confirmation step.
- **A core task fails regardless of its step count** when its only entry is an overflow menu (⋯, 更多), a settings page, or a hover-only control.

### Examples

| Task | Tier | Counted path from entry screen | Steps | Threshold | Result |
| --- | --- | --- | --- | --- | --- |
| Place a buy order | core | Home → tap Watchlist tab → tap stock row (Buy button visible) | 2 | 2 | pass |
| Set a price alert | core | Home → open ⋯ menu → Settings → Alerts → Add | 4 | 2 | fail |
| Export history | secondary | Home → Account → History (Export visible) | 2 | 3 | pass |
| Compare two stocks | core | Home → hover row → Compare (hover-only) | 2 | 2 | fail: hover-only entry |

- Set a price alert: Add opens the alert form, where the primary action (Save) appears, so the count stops there. It would also fail as settings-only.
- Compare two stocks: the hover counts because Compare is invisible until the row is hovered; the task fails on the hover-only rule even though 2 is within the threshold.

## Wayfinding Checks

| # | Check | Passes when | Typical failure | Default severity |
| --- | --- | --- | --- | --- |
| 1 | Title matches entry label | A screen's title uses the same words as the control that opened it | Tapping 「我的資產」 opens a screen titled 「Portfolio Overview」 | P1 |
| 2 | Current location shown | The active navigation item is marked; a nested screen shows where it belongs (back label, breadcrumb on the web from depth 3) | Nothing in the navigation is selected on a detail screen | P1 |
| 3 | Way back or out | Every screen has a visible back or close control; dialogs and sheets can be dismissed; the browser Back button works on the web | A full-screen flow with no close button | P0 |
| 4 | Next step from end states | Success, empty, and error states each offer a next action | An empty watchlist that only says 「無資料」 | P0 on a core task, otherwise P1 |
| 5 | One concept, one name | The same thing uses the same word in navigation, titles, buttons, and messages | 「自選股」, 「關注清單」, and 「我的最愛」 for one list | P1 |
| 6 | No stacked dialogs | A dialog never opens another dialog | A confirm dialog opened from inside an edit dialog | P1 |
| 7 | Progress in long flows | A flow longer than three steps shows where the user is (step 2 of 4) | A five-step account opening with no progress | P1 |
| 8 | Top-level navigation limit | Mobile top-level navigation has at most five items, unless overridden with a reason | Six bottom tabs, with labels shrinking to fit | P1 |
| 9 | Core task leads | On the entry screen, the core task's entry is visible in the first viewport and is the element the eye lands on first | The core action sits below a promotional banner | P1 |
| 10 | States covered | Lists and data areas have empty, loading, and error states; long text truncates or wraps without breaking the layout | A long fund name pushes the price off screen | P1 |

## Severity

| Severity | Meaning |
| --- | --- |
| P0 | Users get lost, get stuck, or cannot reach a core task: a depth failure on a core task, no way back, a dead-end state on a core task |
| P1 | Unclear hierarchy or extra effort: users get there, but slower or less sure |
| P2 | Polish: inconsistencies users barely notice |

A finding's severity can be raised when the affected screen sits on a core task path, and lowered when it sits only on an occasional one. Say why when it changes.
