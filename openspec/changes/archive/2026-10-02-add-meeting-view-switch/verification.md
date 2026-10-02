# Verification: add-meeting-view-switch

Executed on 2026-10-02 in design-system-to-storybook/assets/figma-export-addon unless noted, after tasks 6.1 and 6.2 and the review fixes below. Addon version 0.13.0, Node v26.8.2, headless Chrome from /Applications/Google Chrome.app.

## Test suites

| Command | Result |
| --- | --- |
| `npm run test:visual-comments` | exit 0 — store, HTTP, and report checks passed; visual-comment fixture 212 assertions passed at wide, narrow, and desktop widths; evidence reload checks passed (7 requests, 0 reloads) |
| `npm run test:renderer-parity` | exit 0 — React 24 cases passed, Vue 24 cases passed |
| `npm run test:package` | exit 0 — package contract checks passed (0.13.0, 33 files) |
| `npm run test:renderer-neutral` | exit 0 — renderer-neutral build checks passed; fixture 212 assertions passed at three widths |
| `npm run test:review-controller` | exit 0 |
| `node design-system-to-storybook/scripts/test_install_figma_export_addon.mjs` | passed |
| `node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs` | canonical and both template mirrors match (64 files, sha256 2c4e10c5b9c02d776a3872da0d32c5ee9d1475def9dff99755872e11af0668f5) |

test/run-visual-comment-report-test.mjs has no diff in this change; its existing assertions passed unchanged.

## Verify findings addressed

- W1 (returning to a Story restored its viewed meeting): the `[storyId]` effect in src/review.ts now clears the viewed meeting. The fixture assertion "returning to a Story in the same panel starts with no meeting viewed" was confirmed to fail with the fix removed (switch reported `aria-checked="true"`) and to pass with it.
- W2: test/run-visual-comment-store-test.mjs asserts that every `meetings` row of a Story overview has `projectRelativeSessionPath` null when the comments directory is outside the project.
- S1: the panel applies only the most recently requested overview, so a poll that resolves after a save's refresh cannot clear the newly viewed meeting.
- S5: the fixture asserts that no browser storage key or value names a viewed meeting.
- S2, S3, S4: label keys placed alphabetically; the pin card width comment corrected and cross-referenced with review.css; proposal Impact no longer lists the unchanged evidence reload test.

## Second verify findings addressed (tasks 6.1 and 6.2)

- Warning (pin card covered its pin below about 600 px): placement moved to the pure function `getSavedPinCardPlacement` in src/visualComment.ts; when neither side fits, the card goes below the pin, or above it near the bottom edge, and is at most the viewport width minus 24 px wide. The fixture calls the function with the spec's 375 by 812 example rows and asserts no overlap with the pin.
- Suggestion (a save's view cleared by stale data): the panel records the last applied overview request and clears the viewed meeting only when no newer request is in flight. This fix is reviewed by reading the code; the race depends on the 5-second poll timing and has no deterministic test.

## Review findings addressed

- Warning (a parsed meeting file missing fields failed every overview): `readAllMeetings` keeps only files with a `session` holding string `id` and `startedAt`, an object `captures`, and an array `comments`. The store test writes `{}` and a file without `captures` and asserts both are skipped by the overview and by `listMeetings`.
- Suggestion (the hovered pin outlived its pin): turning a meeting's View on or off, collapsing the panel, toggling Pins, and changing the kind filter forget the hovered pin, and a Story change forgets both the hovered and the focused pin; the card prefers a displayed hovered pin, then a displayed focused pin. The fixture hides the hovered pin with the View switch, shows it again, and asserts no card returns on its own and keyboard focus on another pin shows that pin's card.

## Task 1.1 manual measurement

`getOverview(storyId)` on a synthetic store of 100 closed meetings with 10 comments each (comments on 5 Stories), measured 10 times after one warm-up call: median 2.4 ms, maximum 2.7 ms. The overview returned 200 comments and 100 meeting rows. No cache is needed.

## Task 5.2 reproduction with project data

The meeting `20260729-77db03bf` (meeting.json and assets) from cm-chipK/ds-lab/project was copied into a temporary comments directory with `activeSessionId` null; the source project was only read. `getOverview("prototypes-inventory-prototype--default")` returned:

- comments: `下單埋點` (tracking, Open, ordinal 3) and `設定埋點` (tracking, Open, ordinal 4), both with sessionId `20260729-77db03bf`
- meetings: one row, `Design review 7/29/2026, 10:40:02 AM`, active false, commentCount 4, storyCommentCount 2, tracking open 2 / total 2
