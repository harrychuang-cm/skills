# Design Evidence Map

Use this file to trace design decisions back to source evidence.

## Source Inventory

| Source ID | Type | Path / URL / Node | Source fingerprint | Screen or state | Notes | Confidence |
|---|---|---|---|---|---|---|

## Source Duplicate Review

Use this table when two screenshots, graphic/brand exports, Figma nodes, routes, or other exports are exact duplicates or visually/functionally very close. Record the decision before counting both as separate evidence.

| Candidate source | Duplicate of | Match type | Fingerprint / normalized key | Suggested action | Developer decision | Rationale |
|---|---|---|---|---|---|---|

## Vibe Project Scope Review

Use this table when the input is an AI-generated or vibe-coded project. Record whether project evidence is rendered, screenshot, storybook, token-used, component-used, demo-only, unused, dead-code, capture-blocked, auth-blocked, contradictory, or out-of-scope before it influences confidence.

| Source | Classification | Visible in rendered UI | Token/component used | Keep / ignore decision | Rationale |
|---|---|---|---|---|---|

## Route / State Manifest

Use this table when extracting from a project folder with runnable routes or Storybook stories.

| Route or story | Viewport | State | Render command | Screenshot path | Source files | Capture status | Keep / ignore | Notes |
|---|---|---|---|---|---|---|---|---|

## Rendered UI Capture Attempts

Record every browser capture attempt for runnable projects, including blocked captures.

| Capture ID | Route or story | Viewport | State | URL | Screenshot path | DOM/CSS inspected | Source files linked | Status | Confidence impact |
|---|---|---|---|---|---|---|---|---|---|

## Evidence

| Evidence ID | Source ID | Region | Observed pattern | Design decision | Affected output | Confidence |
|---|---|---|---|---|---|---|
