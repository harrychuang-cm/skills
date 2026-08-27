## ADDED Requirements

### Requirement: Scaffold framework selection

The scaffold script SHALL accept a `--framework` option with values `auto`, `react`, and `vue`, defaulting to `auto`. In `auto` mode the script SHALL walk upward from the resolved target root to the nearest package.json and classify the framework from its dependencies and devDependencies. The script SHALL print the selected framework and the basis for the selection to stdout. An explicit `--framework` value SHALL take precedence over auto detection.

#### Scenario: Auto detection classifies the target project

- **WHEN** the scaffold script runs with `--framework auto` and finds a package.json above the target root
- **THEN** it selects `vue` when the dependencies include `vue` or any package starting with `@storybook/vue3`, selects `react` when they include `react`, and prints the selected framework with the matched dependency

##### Example: detection outcomes

| package.json dependencies | Selected framework | Notes |
| ------------------------- | ------------------ | ----- |
| vue, @storybook/vue3-vite | vue | Vue renderer project |
| react, @storybook/react-vite | react | current default stack |
| vue, react | vue | Vue match is checked first |
| (no package.json found) | react | fallback with printed reason |

#### Scenario: Detection fallback does not abort

- **WHEN** auto detection finds no package.json or finds one matching neither framework
- **THEN** the scaffold script falls back to `react`, prints the fallback reason, and continues scaffolding

### Requirement: Vue template overlay scaffold output

When the selected framework is `vue`, the scaffold script SHALL produce the prototype folder from the framework-neutral templates in the existing template root combined with a Vue overlay template set, replacing the React-specific component, story, static flow export, static flow story, and index templates. The produced folder SHALL contain a `.vue` prototype component, a `.vue` static flow export, `.stories.ts` story files for both, an index.ts, and the same flow, data, meta, CSS, and docs files as the React output. The produced folder SHALL NOT contain any `.tsx` file.

#### Scenario: Vue scaffold file set

- **WHEN** the scaffold script runs with `--framework vue` for a feature named "Portfolio Alerts"
- **THEN** the prototype folder contains PortfolioAlertsPrototype.vue, PortfolioAlertsPrototype.stories.ts, PortfolioAlertsPrototypeFlowExport.vue, PortfolioAlertsPrototypeFlowExport.stories.ts, index.ts, the flow, data, and meta TypeScript files, the prototype CSS file, and the docs folder, with no `.tsx` file anywhere in the folder

#### Scenario: React scaffold output is unchanged

- **WHEN** the scaffold script runs with `--framework react` or resolves `react` from auto detection
- **THEN** the produced file set is identical to the file set produced before this change

### Requirement: Vue prototype contract parity

The Vue overlay templates SHALL satisfy the same review contract as the React templates: the story templates SHALL set fullscreen layout and attach the prototype meta object to `parameters.prototype`; the static flow story SHALL export a story named StaticFlow; the prototype component SHALL implement the `prototypeFlowPreview` and `prototypeRoute` query modes internally and expose the `data-prototype-root` and `data-prototype-route-preview` attributes; the static flow export SHALL import the shared prototypeFlowLayout helper, read saved inspector layout positions through the shared storage key, support the flow preview mode, and expose the `data-layout-source` and `data-figma-text-auto-width` attributes. Component references inside Vue SFC templates SHALL use PascalCase.

#### Scenario: Route preview modes work without the inspector

- **WHEN** a scaffolded Vue prototype story is opened with `?prototypeRoute=<entry-route>` or `?prototypeFlowPreview=true` in the story iframe URL
- **THEN** the prototype renders the requested route preview using its internal query handling, without requiring the Prototype Inspector addon

### Requirement: Validator framework detection

The validator SHALL accept a `--framework` option with values `auto`, `react`, and `vue`, defaulting to `auto`. In `auto` mode it SHALL classify the prototype folder as `vue` when a `*Prototype.vue` file exists and as `react` when a `*Prototype.tsx` file exists. When both exist, the validator SHALL report a mixed-framework error instructing the user to pass an explicit `--framework` value, and SHALL NOT guess. When neither exists, it SHALL report the missing component file using react wording.

#### Scenario: Vue folder is auto-classified

- **WHEN** the validator runs in auto mode on a folder containing PortfolioAlertsPrototype.vue and no `.tsx` prototype file
- **THEN** it validates the folder in vue mode and its messages reference `*Prototype.vue` wording

#### Scenario: Mixed frameworks are rejected

- **WHEN** the validator runs in auto mode on a folder containing both a `*Prototype.vue` and a `*Prototype.tsx` file
- **THEN** it reports a mixed-framework error naming both files and asking for an explicit `--framework` value, and performs no framework-specific checks

### Requirement: Validator coverage parity in vue mode

In vue mode the validator SHALL locate the component at `*Prototype.vue`, the story at `*Prototype.stories.ts`, the static flow export at `*PrototypeFlowExport.vue`, and the static flow story at `*PrototypeFlowExport.stories.ts`, while the flow, data, meta, CSS, index, and flow layout helper locations remain unchanged. All check groups available in react mode SHALL run in vue mode, including docs consistency, component map usage, token discipline, meta contract, static flow contract, and viewer compatibility. The import allowlist for design-system import classification SHALL exclude `vue` and packages starting with `@vue/` in vue mode instead of the React package set. The `--strict-style`, `--handoff-ready`, and `--storybook-index` options SHALL behave identically in both modes. A freshly scaffolded vue prototype folder SHALL produce zero missing-file errors.

#### Scenario: Freshly scaffolded Vue folder passes file checks

- **WHEN** the validator runs on a folder just produced by the scaffold script in vue mode
- **THEN** the validator reports zero missing-file errors and runs every check group that react mode runs

#### Scenario: Import allowlist follows the framework

- **WHEN** the validator classifies design-system imports in vue mode
- **THEN** imports of `vue` and `@vue/`-prefixed packages are not counted as design-system imports, and the react-specific exclusions no longer apply

### Requirement: React validation behavior is preserved

For react-mode folders, validator output SHALL remain identical to the output produced before this change, for the same folder content, whether react mode is selected explicitly or through auto detection.

#### Scenario: Existing React prototype revalidates identically

- **WHEN** the validator runs without `--framework` on an existing React prototype folder that validated cleanly before this change
- **THEN** the reported errors and warnings are identical to the pre-change output

### Requirement: Inspector installer React-only guard

The Prototype Inspector installer SHALL inspect the target project's Storybook main configuration before writing any file. When the configuration references a known non-React renderer package, the installer SHALL abort with a non-zero exit code and a stderr message stating that the Prototype Inspector supports only React Storybook, and SHALL NOT write or modify any file. When the main configuration cannot be found or classified, the installer SHALL proceed with the current installation behavior.

#### Scenario: Vue Storybook project is refused

- **WHEN** the installer runs against a project whose Storybook main configuration references `@storybook/vue3-vite`
- **THEN** the installer exits with a non-zero code, prints the React-only limitation to stderr, and leaves the project files untouched

#### Scenario: Unclassifiable project installs as before

- **WHEN** the installer runs against a project where no Storybook main configuration file is found
- **THEN** the installation proceeds exactly as it did before this change

### Requirement: Scaffold and validate smoke test

The skill SHALL provide a self-contained smoke test script runnable with python3 and no third-party dependencies. The script SHALL, for each of react and vue, scaffold a feature into a temporary directory with an explicit `--framework` value and immediately run the validator on the result. The script SHALL fail with a non-zero exit code when the scaffolded file set contains a file of the other framework's component format, when the validator's framework detection result is wrong, when missing-file errors occur, or when the vue-round validator output is not equivalent to the react-round baseline for the same template state. On success it SHALL exit zero and print a per-framework summary.

#### Scenario: Smoke test passes on both frameworks

- **WHEN** the smoke test script runs on a machine with python3 and the skill checked out
- **THEN** both the react round and the vue round complete, and the script exits zero with a summary line per framework

#### Scenario: Smoke test catches a broken overlay

- **WHEN** the vue overlay template set is missing one of its files
- **THEN** the smoke test exits non-zero and names the missing output file

### Requirement: Documentation states the Vue support scope

The skill documentation SHALL state that Vue Storybook projects are supported for scaffolding and validation, describe the `--framework` option on both scripts, and state that the Prototype Inspector is React-only, naming the StaticFlow story and direct docs reading as the flow review path for Vue projects. The Storybook integration reference SHALL document the Vue CSF story conventions used by the overlay templates.

#### Scenario: Vue user finds the support boundary

- **WHEN** a user reads the skill documentation before running the workflow in a Vue Storybook project
- **THEN** the documentation tells them scaffolding and validation work with `--framework vue` or auto detection, and that runtime UI Flow review through the Prototype Inspector is unavailable, with the StaticFlow story named as the review substitute
