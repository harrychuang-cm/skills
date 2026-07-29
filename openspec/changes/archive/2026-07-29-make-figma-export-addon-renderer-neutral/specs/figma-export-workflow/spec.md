## ADDED Requirements

### Requirement: Storybook environment detection and capability report

The installer SHALL detect the target Storybook renderer, builder, and major version from package dependencies and static framework or builder references in `.storybook/main.*`. It SHALL produce a capability report containing `renderer`, `builder`, `storybookMajor`, `confidence`, `signals`, and separate `coreExport`, `reviewWorkspace`, `visualComments`, and `persistence` capability states. Each capability state MUST be `supported`, `unsupported`, or `unverified`.

#### Scenario: Vue Vite environment is detected without a prompt

- **WHEN** a project has one consistent Vue 3 renderer signal, one Vite builder signal, and Storybook major 10
- **THEN** the installer resolves `renderer=vue3`, `builder=vite`, `storybookMajor=10`, and `confidence=exact` without requesting framework input

#### Scenario: Vue full capabilities are reported

- **WHEN** the detected environment is Vue 3 + Vite + Storybook 10 and the bundled addon contains the verified Vue parity implementation
- **THEN** `coreExport`, `reviewWorkspace`, `visualComments`, and `persistence` are all reported as `supported`

#### Scenario: Conflicting renderer signals fail before mutation

- **WHEN** package dependencies and Storybook main configuration identify different renderers and no override is supplied
- **THEN** the installer exits non-zero before changing a package, lockfile, vendored tarball, or Storybook configuration
- **THEN** the error lists the conflicting signals and the valid `--renderer` values

#### Scenario: Explicit renderer override resolves an ambiguous environment

- **WHEN** detection is ambiguous and the caller supplies `--renderer vue3`
- **THEN** the capability report uses `vue3` as the renderer, records the override in `signals`, and continues only if the builder and Storybook version satisfy the Vue support matrix

#### Scenario: Machine-readable report is stable

- **WHEN** the caller supplies `--json`
- **THEN** stdout contains one valid JSON capability report with the documented fields and stderr contains human-readable diagnostics

### Requirement: Renderer-neutral review workspace decorator

The `createFigmaExportReviewDecorator(options)` entry point SHALL preserve its existing import path and options shape. Its decorator SHALL return the renderer story result unchanged by strict identity while synchronizing the review workspace through a body-mounted DOM host. The preview and review runtime artifacts MUST NOT import React, React DOM, or `@storybook/icons`.

#### Scenario: Vue vnode is returned unchanged

- **WHEN** the review decorator invokes a Vue story function
- **THEN** the returned value is strictly equal to the Vue vnode returned by that story function

#### Scenario: React element is returned unchanged

- **WHEN** the review decorator invokes a React story function
- **THEN** the returned value is strictly equal to the React element returned by that story function

#### Scenario: Review workspace is independent from story markup

- **WHEN** Review is enabled in Story view
- **THEN** the workspace host is mounted under `document.body` outside the story root
- **THEN** the story root receives no addon wrapper element

#### Scenario: Preview artifacts contain no framework runtime import

- **WHEN** the addon distribution is built
- **THEN** the preview and review artifacts contain no import of `react`, `react-dom`, `react/jsx-runtime`, or `@storybook/icons`

#### Scenario: Story lifecycle cleans transient review state

- **WHEN** the active story, view mode, or hot module instance changes
- **THEN** stale capture listeners, pending composers, transient pins, and obsolete DOM hosts are removed without modifying the next story result

### Requirement: Complete Vue export and review workspace parity

Vue 3 + Vite + Storybook 10 SHALL expose the same supported Figma workspace behavior as React + Vite + Storybook 10 from the same addon package. The parity contract SHALL include export scope, payload synchronization, Figma source actions, workspace disclosure, Review controls, Visual Comments controls, capability status, and report access. The Vue product project MUST NOT declare React or React DOM to satisfy the addon preview runtime.

#### Scenario: Vue user completes the Figma workspace flow

- **WHEN** a Vue story is opened with the addon and review server configured
- **THEN** the user can export the configured scope, synchronize the payload, open source actions, enter Review, use Visual Comments, and open meeting reports through the same controls and state semantics as the React fixture

#### Scenario: Vue project has no React application dependency

- **WHEN** the Vue fixture installs and builds the addon
- **THEN** its package manifest declares neither `react` nor `react-dom`
- **THEN** the Storybook build and full browser parity suite succeed

#### Scenario: React configuration remains compatible

- **WHEN** an existing React + Vite + Storybook 10 project upgrades to the renderer-neutral addon
- **THEN** its existing addon registration, preview decorator call, options, payloads, review data, and reports continue to work without configuration migration

#### Scenario: One distribution serves both renderers

- **WHEN** React and Vue fixtures install the addon
- **THEN** both fixtures resolve the same package name, package version, public exports, and distribution artifacts

### Requirement: Shared real-Storybook renderer parity verification

The addon SHALL maintain real React and Vue 3 Storybook 10 + Vite fixtures and SHALL run one shared browser behavior contract against both. A renderer MUST NOT be documented as full-parity supported unless its fixture passes the complete contract.

#### Scenario: Shared suite validates both renderers

- **WHEN** the renderer parity test command runs
- **THEN** it builds and serves both real Storybook fixtures
- **THEN** it runs the same export, review, comment, persistence, report, source action, and failure-state scenarios against each fixture

#### Scenario: Renderer-specific regression blocks parity

- **WHEN** one required scenario passes in React and fails in Vue
- **THEN** the test command exits non-zero and the Vue capability matrix entry cannot be marked `supported`

#### Scenario: Existing lower-level tests remain required

- **WHEN** renderer parity tests pass
- **THEN** addon build, plugin-code, visual comment store, HTTP, report, and fixture tests are also required before the distribution is synchronized
