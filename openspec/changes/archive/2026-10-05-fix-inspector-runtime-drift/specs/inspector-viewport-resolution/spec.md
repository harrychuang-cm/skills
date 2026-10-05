## MODIFIED Requirements

### Requirement: Layout signature honored by the inspector

The inspector SHALL pass the resolved prototype viewport as the expected viewport when reading saved flow layout positions, so a saved layout whose signature does not match is ignored with a console.info notice and the fallback layout is used, while version-1 payloads keep applying when the resolved viewport is phone 375x812. Ignoring SHALL leave the stored payload untouched: opening or re-rendering the UI Flow SHALL NOT write, prune or delete the saved layout, and the inspector SHALL persist positions only in response to an explicit layout action (releasing a dragged node that moved, confirming Reset Layout, importing a layout file, or another committed layout action defined by a UI Flow canvas capability, for example a keyboard nudge, an undo or a redo) and SHALL persist each such action exactly once. A signature mismatch SHALL produce exactly one console.info notice per UI Flow mount. The inspector's automatic grid fallback pitch SHALL derive from the resolved card size instead of fixed constants.

#### Scenario: Widened prototype falls back cleanly

- **WHEN** a prototype that has a phone-era saved layout is opened after its flow declares desktop
- **THEN** the inspector ignores the saved positions, lays cards out with the derived-pitch fallback, logs one console.info notice, and the phone-era payload stays in localStorage unchanged

##### Example: unsigned payload under a desktop flow

- **GIVEN** the layout key holds {"version":1,"positions":{"intake":{"x":40,"y":80}}} and the flow declares viewport { formFactor: "desktop", width: 1280, height: 800 }
- **WHEN** the UI Flow mounts
- **THEN** one console.info names phone:375x812 as the saved signature and desktop:1280x800 as the declared one, intake is placed exactly as if no layout were saved, and the stored string is unchanged

#### Scenario: Opening the canvas never mutates storage

- **WHEN** the UI Flow opens for a prototype whose saved layout contains positions for node ids that no longer exist in the flow
- **THEN** the stored payload, including the entries for the unknown ids, is byte-identical after the canvas has rendered

##### Example: unknown node id survives opening

- **GIVEN** the layout key holds {"version":2,"viewport":null,"positions":{"intake":{"x":40,"y":80},"retired-step":{"x":900,"y":80}}} and the flow has no node retired-step
- **WHEN** the UI Flow opens and renders
- **THEN** localStorage.setItem and localStorage.removeItem are not called and the stored string still contains "retired-step"

#### Scenario: One write per completed drag

- **WHEN** the user presses on a route card, moves it, and releases the pointer
- **THEN** localStorage.setItem is called exactly once for the layout key, after the release, and a press and release without movement writes nothing

##### Example: storage calls per pointer sequence

| Pointer sequence on route card intake | setItem calls for the layout key | removeItem calls |
| ----- | ----- | ----- |
| pointerdown, 12 pointermove events, pointerup 120 px to the right | 1, after pointerup | 0 |
| pointerdown, pointerup at the same position | 0 | 0 |

## REMOVED Requirements

### Requirement: Inspector asset copies stay byte-identical

**Reason**: Moved to the inspector-runtime-distribution capability and widened from two named files (preview.js and prototype-inspector.css) to the whole inspector runtime folder plus the flow layout helper and fingerprint copies.

**Migration**: The smoke test now enforces the Inspector runtime mirror parity requirement of inspector-runtime-distribution. Projects need no action.
