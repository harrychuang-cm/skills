# Experience Map

<!--
Written by uiux-director into the target project's product-design/ folder.
- Headings and table headers stay in English. When the Document Language in DECISION_LOG.md is not English, append the translation in full-width parentheses. Write narrative content in the document language.
- Every entry carries a Confirmation value: `confirmed` or `unconfirmed`. Every `unconfirmed` entry is also listed under Open Questions in DECISION_LOG.md.
- Step counting follows uiux-director/references/experience-review.md: one step is one navigation action (tap, click, menu open, list selection) from the entry screen until the screen where the task's primary action is available.
-->

## Navigation Model

| Item | Answer | Confirmation |
| --- | --- | --- |
| Entry screen | <the screen users land on> | |
| Pattern | <bottom tabs \| side navigation \| top tabs \| hub and spoke \| other> | |
| Top-level items | <list, in order> | |
| Top-level item limit | <5 on mobile, unless overridden below> | |

## Depth Thresholds

| Tier | Default maximum steps | This product | Reason for override | Confirmation |
| --- | --- | --- | --- | --- |
| core | 2 | <2> | <empty unless changed> | |
| secondary | 3 | <3> | | |
| occasional | no limit | no limit | | |

A core task reachable only through an overflow menu, a settings page, or a hover-only control fails regardless of its step count.

## Core Tasks

| # | Task | Entry point | Counted path from entry screen | Current steps | Target steps | Result | Confirmation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | <same wording as PRODUCT_BRIEF.md> | <control label> | <Home → tap X → tap Y (primary action visible)> | <n> | <threshold> | <pass \| fail \| fail: overflow-only \| fail: settings-only \| fail: hover-only entry \| not built yet> | |

## Feature Registry

Status is `active`, `parked` (kept for later, entry points hidden), or `removed`. A removed feature keeps its row.

| Feature | Tier | Status | Entry location | Depth | Added | Last change | Notes | Confirmation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <name> | <core \| secondary \| occasional> | <active> | <where its entry control lives> | <steps> | <YYYY-MM-DD> | <YYYY-MM-DD: what changed> | | |

## Screens And States

| Screen | Title (matches its entry label) | Way back or out | Empty state next step | Loading | Error state next step | Success next step | Confirmation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <screen> | <title> | <back control or close> | <what the user can do> | <skeleton \| spinner \| none needed> | <retry \| contact \| other> | <where the user goes next> | |
