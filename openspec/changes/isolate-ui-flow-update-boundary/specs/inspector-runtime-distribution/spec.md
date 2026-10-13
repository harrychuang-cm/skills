## ADDED Requirements

### Requirement: UI Flow module set

The inspector runtime folder storybook-product-prototype/assets/prototype-inspector/ SHALL keep the UI Flow canvas in a module set that a project can replace without changing its other inspector files: flow-canvas.js, flow-canvas-geometry.js, flow-canvas-hmr.js, flow-snapshot.js, flow-snapshot-cache.js and flow-canvas.css. A style rule targets the UI Flow when every selector in its selector list contains the `.prototype-inspector--flow` class or a `.prototype-inspector__flow-*` class (a whole class name, not part of a longer one) outside parentheses, brackets and strings, escaped characters not counting as either; an at-rule targets the UI Flow when every rule inside it does or when its prelude names the identifier `prototype-inspector-flow` or one that starts with `prototype-inspector-flow-`, such as `@keyframes prototype-inspector-flow-dash`; a style rule whose selector list mixes UI Flow selectors with other selectors, or that names a UI Flow class only inside parentheses, brackets or strings (for example in `:not()` or an attribute value), is a mixed rule. flow-canvas.css SHALL hold every rule that targets the UI Flow and SHALL reference design tokens only through `--pi-*` custom properties, the module's own `--prototype-flow-*` properties and the figma-export addon's `--sbfx-*` properties used with fallbacks; it SHALL NOT contain `var(--sbt-`. prototype-inspector.css SHALL keep the `--pi-*` token layer and every rule that does not target the UI Flow, and SHALL NOT contain a rule that targets the UI Flow. Neither bundled stylesheet SHALL contain a mixed rule. flow-canvas.js SHALL import `./prototype-inspector.css` before `./flow-canvas.css`, so the UI Flow rules cascade after the shared rules whatever the order of a project's own imports. flow-canvas.js SHALL export getMeasuredFramePreviewSize, routePreviewMeasurementSelector and flowCanvasVersion, a string of the form `flow-canvas-YYYY-MM-DD` that changes in the same edit as any file of the module set, and the UI Flow root element SHALL carry `data-flow-canvas-version` with that value. The computed styles of the UI Flow SHALL NOT change because of the split.

#### Scenario: UI Flow rules live only in the module stylesheet

- **WHEN** the rule parser reads both stylesheets of the bundled runtime folder
- **THEN** prototype-inspector.css contains no rule that targets the UI Flow, every rule in flow-canvas.css targets the UI Flow, neither stylesheet contains a mixed rule, and flow-canvas.css contains no `var(--sbt-`

#### Scenario: The canvas shows its module version

- **WHEN** the UI Flow renders
- **THEN** its root element carries `data-flow-canvas-version` equal to the flowCanvasVersion export of flow-canvas.js

#### Scenario: Other modes import the shared measurement helpers

- **WHEN** preview.js or a project module imports getMeasuredFramePreviewSize and routePreviewMeasurementSelector from `./flow-canvas.js`
- **THEN** both names resolve to exports of the bundled flow-canvas.js and the inspector import surface check passes

#### Scenario: Splitting the stylesheet keeps the computed styles

- **WHEN** the same UI Flow story is opened in Chrome with the stylesheet before and after the split
- **THEN** the computed values of a fixed list of properties match for every probed UI Flow element

##### Example: rule classification

| Rule | Stylesheet |
| ----- | ----- |
| `.prototype-inspector--flow { … }` | flow-canvas.css |
| `.prototype-inspector__flow-controls .prototype-inspector__flow-zoom-menu-item { … }` | flow-canvas.css |
| `@media (prefers-reduced-motion: reduce) { .prototype-inspector__flow-line { … } }` | flow-canvas.css |
| `html[data-sbfx-capture-mode="true"] .prototype-inspector--flow .prototype-inspector__flow-frame-preview iframe { … }` | flow-canvas.css |
| `@keyframes prototype-inspector-flow-dash { … }` | flow-canvas.css |
| `.prototype-inspector__flow-world:is([data-camera-moving], [data-dragging]) .prototype-inspector__flow-line { … }` | flow-canvas.css |
| `.prototype-inspector__visually-hidden { … }` | prototype-inspector.css |
| `.prototype-inspector__markdown h2 { … }` | prototype-inspector.css |
| `:root { --pi-sys-color-primary: … }` | prototype-inspector.css |
| `.prototype-inspector__markdown h3, .prototype-inspector__flow-summary h3 { … }` | mixed rule: not allowed in either bundled stylesheet |
| `:is(.prototype-inspector__markdown, .prototype-inspector__flow-summary) h3 { … }` | mixed rule |
| `.prototype-inspector:not(.prototype-inspector--flow) .prototype-inspector__panel { … }` | mixed rule |
| `.prototype-inspector__panel[data-label="prototype-inspector__flow-x"] { … }` | prototype-inspector.css |
| `.acme-prototype-inspector__flow-badge { … }` | prototype-inspector.css |
| `@keyframes prototype-inspector-flowchart-pulse { … }` | prototype-inspector.css |

---

### Requirement: UI Flow-only installer update

`install_prototype_inspector.mjs --ui-flow-only` SHALL update only the UI Flow module set of an existing installation and leave the project's other inspector files as they are. It SHALL run these checks, in this order, before writing any file, and SHALL stop with exit code 1 and write nothing when one fails:

1. The existing React-only renderer guard.
2. `.storybook/prototype-inspector/` exists; otherwise the message tells the user to run the installer without `--ui-flow-only`.
3. The project's `.storybook/prototype-inspector/preview.js` has a static import declaration that imports `PrototypeFlow` from `./flow-canvas.js`; otherwise the message states that preview.js still embeds an older UI Flow and needs the one-time extraction described in references/storybook-integration.md.
4. Every name that a JavaScript module of the project's inspector folder outside the module set (preview.js and any other project file there) imports or re-exports from a JavaScript file of the module set, counting named imports and `default` for a default import and leaving out type-only imports, is exported by the bundled file of that name; otherwise the message lists each missing name with its module, followed by the importing file when that file is not preview.js. Import declarations are those outside comments, strings, template literals and regular expression literals at the top level of the module; an import statement that cannot be read stops the update with its file and line.
5. The project's prototype-inspector.css, when present, can be parsed: its braces balance and its comments and strings are closed; otherwise the message names the problem and its line.
6. When the project's flow layout helper is older than the runtime (it lacks an export the bundled runtime imports, or its `prototypeFlowLayoutSchemaVersion` is missing or lower than the bundled helper's), it is a helper version the skill has shipped, byte for byte apart from line endings, a byte order mark and blank lines at the end of the file; otherwise the message says the helper has been edited and asks for a manual merge starting from the bundled helper, since replacing it would lose the project's code.

When the checks pass, it SHALL copy the six files of the module set over the project's copies, replace the flow layout helper only when it is older than the runtime (check 6), install the fingerprint module only when it is missing, and then report: the project's flowCanvasVersion before (or `none`) and after; every `--pi-*` custom property that flow-canvas.css or the module set's scripts reference and neither the project's prototype-inspector.css nor flow-canvas.css defines, without writing them; every class the module set's scripts render whose rule the bundled prototype-inspector.css holds and flow-canvas.css does not (a shared rule), when the project's prototype-inspector.css has no rule for that class, without writing it; the number of rules left in the project's prototype-inspector.css that target the UI Flow with the selectors and lines of the first 10, which it SHALL remove only when `--strip-flow-css` is given, each together with the comments directly above it, the blank lines before it and the rest of its last line, keeping comments that a blank line separates from a removed rule and every other rule, and never joining two kept lines; and every mixed rule in that file with its line, which it SHALL list in full and never remove. When the project has no prototype-inspector.css, it SHALL say so, report every `--pi-*` custom property the module set references and every shared rule as missing and report 0 rules, and SHALL NOT create the file. It SHALL NOT modify preview.js, manager.js, preset.js or `.storybook/main.*`, and SHALL NOT modify prototype-inspector.css except for that removal. With `--dry-run` it SHALL run every check and print the planned writes and the report without writing. `--ui-flow-only` combined with `--force` or `--token-prefix`, and `--dry-run` or `--strip-flow-css` without `--ui-flow-only`, SHALL be rejected with exit code 1 before any check, as SHALL `--project-root` or `--token-prefix` given without a value or with an empty one.

#### Scenario: Customized inspector files stay untouched

- **WHEN** a project whose preview.js and prototype-inspector.css carry project-specific Components code, whose preview.js imports PrototypeFlow from `./flow-canvas.js`, runs `--ui-flow-only`
- **THEN** the six module files equal the bundled files, and preview.js, prototype-inspector.css, manager.js, preset.js and `.storybook/main.ts` are byte-identical to before

#### Scenario: An embedded older UI Flow stops the update

- **WHEN** the project's preview.js defines its own UI Flow and does not import PrototypeFlow from `./flow-canvas.js`
- **THEN** the installer exits 1, writes nothing, and names the one-time extraction

#### Scenario: A name the project imports no longer exists

- **WHEN** the project's preview.js imports `oldHelper` from `./flow-canvas-geometry.js` and the bundled module does not export it
- **THEN** the installer exits 1, writes nothing, and lists `oldHelper (flow-canvas-geometry.js)`

#### Scenario: An edited older helper stops the update

- **WHEN** the project's flow layout helper lacks `getPrototypeFlowLayoutViewportSignature` and also exports `getAcmeLayoutPreset`, which project code loads through `import("@/pages/prototypes/prototypeFlowLayout")`
- **THEN** the installer exits 1, writes nothing, and says the helper is older than the runtime and has been edited, asking for a manual merge

#### Scenario: An edited helper with every export name but an older schema stops the update

- **WHEN** the project's flow layout helper is the version-1 helper with `getPrototypeFlowLayoutViewportSignature` copied in, so every export name is present but `prototypeFlowLayoutSchemaVersion` is 1
- **THEN** the installer exits 1, writes nothing, and names the schema version the runtime needs

#### Scenario: A shipped older helper is replaced despite type imports

- **WHEN** the project's flow layout helper is the version-1 helper the skill shipped, byte for byte, and a Static Flow export imports `type PrototypeFlowLayoutPositions` from it
- **THEN** the installer replaces the helper with the bundled one and exits 0

#### Scenario: A stylesheet that cannot be parsed stops the update

- **WHEN** the project's prototype-inspector.css has a rule whose brace never closes
- **THEN** the installer exits 1, writes nothing, and names the unbalanced brace and its line

#### Scenario: Missing tokens are reported, not written

- **WHEN** the project's token layer does not define `--pi-sys-color-annotation-touch-target` and the update otherwise succeeds
- **THEN** the output lists `--pi-sys-color-annotation-touch-target`, the exit code is 0 and prototype-inspector.css is unchanged

#### Scenario: Missing shared rules are reported, not written

- **WHEN** the project's prototype-inspector.css has no rule for `.prototype-inspector__components-count`, which the UI Flow frame labels render, and the update otherwise succeeds
- **THEN** the output lists `.prototype-inspector__components-count` as a missing shared rule, the exit code is 0 and prototype-inspector.css is unchanged

#### Scenario: Stale UI Flow rules are removed only on request

- **WHEN** the project's prototype-inspector.css still contains `.prototype-inspector__flow-viewport { … }` and Components rules
- **THEN** a run without `--strip-flow-css` lists the stale rule and leaves the file unchanged, and a run with `--strip-flow-css` removes that rule and keeps every Components rule byte-identical

#### Scenario: Mixed rules are listed, never removed

- **WHEN** the project's prototype-inspector.css contains `.prototype-inspector__markdown h3, .prototype-inspector__flow-summary h3 { … }` and a run passes `--strip-flow-css`
- **THEN** the output lists that rule as a mixed rule and the rule is still in the file afterwards

#### Scenario: A missing shared stylesheet is reported

- **WHEN** the project's inspector folder has no prototype-inspector.css and the other checks pass
- **THEN** the installer exits 0 after writing the module set, says the file is missing, lists every `--pi-*` custom property the module set references and every shared rule as missing, and does not create the file

#### Scenario: A dry run writes nothing

- **WHEN** `--ui-flow-only --dry-run` runs on a project that passes every check
- **THEN** the output lists the six files it would write and the report, and no file under the project changes

##### Example: flag combinations

| Arguments | Result |
| ----- | ----- |
| `--ui-flow-only` | update the module set |
| `--ui-flow-only --dry-run` | checks and report, no writes |
| `--ui-flow-only --strip-flow-css` | update and remove stale UI Flow rules |
| `--ui-flow-only --force` | rejected, exit 1 |
| `--ui-flow-only --token-prefix acme` | rejected, exit 1 |
| `--dry-run` | rejected, exit 1 |
| `--strip-flow-css` | rejected, exit 1 |
| `--ui-flow-only --dry-run --token-prefix` (no value) | rejected, exit 1 |
