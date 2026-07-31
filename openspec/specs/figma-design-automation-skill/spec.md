# figma-design-automation-skill Specification

## Purpose

TBD - created by archiving change 'add-design-automation-hub-installer'. Update Purpose after archive.

## Requirements

### Requirement: Companion skill owns Figma analysis rules while generic orchestration owns runner control

The template SHALL provide a companion skill named `figma-design-automation` whose first supported mode is analysis for task type `figma-cleanup`. The companion skill SHALL define the Figma input, cleanup result, operation allowlist, scope, evidence, and zero-mutation completion rules. It MUST NOT select or launch provider CLIs, implement runner priority or fallback, set process timeouts, write generic run summaries, run project-wide verification, or mutate `.agent-automation/config.json`.

The project `figma-cleanup` task SHALL name this companion skill while the existing `agent-automation-orchestrate` runtime retains config validation, preflight, ordered fallback, process settlement, sanitized summary, configured verification, and status behavior.

#### Scenario: Cleanup task loads the domain skill through the generic runner

- **WHEN** `agent-automation-orchestrate` runs configured task `figma-cleanup`
- **THEN** its prompt requires the selected agent to load `figma-design-automation`
- **AND** runner attempts and fallback remain recorded only by the generic runtime
- **AND** Figma schema and forbidden-operation rules come only from the companion skill

#### Scenario: Companion skill cannot become a second orchestrator

- **WHEN** the companion skill source is checked
- **THEN** it contains no provider command, provider priority, fallback loop, generic run-summary writer, or project config mutation instruction

##### Example: Provider controls remain outside the companion

- **GIVEN** the canonical companion source and project task fragment
- **WHEN** the checker searches the companion for `codex exec`, `claude`, runner arrays, and summary writes
- **THEN** it finds zero provider-control matches in the companion and finds runner control only in the generic project contract


<!-- @trace
source: add-design-automation-hub-installer
updated: 2026-07-31
code:
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/contract.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
  - design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs
  - design-automation-hub-install/scripts/install-design-automation-hub.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/domExport.ts
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.js
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-automation-hub-install/agents/openai.yaml
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/scripts/lib/storybook_environment.mjs
  - design-system-to-storybook/scripts/lib/figma_export_wiring.mjs
  - design-system-to-storybook/scripts/install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/write-cleanup-result.mjs
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-DawOAq7P.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/VENDOR.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/agent-automation-task.fragment.json
  - design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/reviewController.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/check-cleanup-result.mjs
  - design-system-to-storybook/references/tooling-updates.md
  - design-automation-hub-install/template/skills/figma-design-automation/references/cleanup-contract.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/store.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domRuntime.ts
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/manifest.json
  - design-automation-hub-install/template/project-profile.example.json
  - design-automation-hub-install/template/scripts/design-automation-hub/host.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/README.md
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js
  - design-automation-hub-install/template/scripts/design-automation-hub/agent-runner.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-automation-hub-install/scripts/build-template-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js
  - design-system-to-storybook/assets/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - docs/skills-guide.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/compatible-host.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-automation-hub-install/template/gitignore.fragment
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/check-figma-design-automation.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/core.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-automation-hub-install/scripts/smoke-host-adapter.mjs
  - design-system-to-storybook/references/framework-adaptation.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/agents/openai.yaml
  - design-automation-hub-install/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-automation-hub-install/references/installation-contract.md
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/ui.html
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/server.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/types.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - docs/skills-usage.md
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/overlay-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-package-contract-test.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-bridge-helpers.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/src/ParityFixture.stories.ts
  - design-system-to-storybook/scripts/test_install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/src/ParityFixture.stories.tsx
  - design-system-to-storybook/assets/figma-export-addon/test/tokenless-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-automation-hub-install/test/fixtures/manual-two-project-acceptance.json
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-story-fidelity-fixture.mjs
  - design-automation-hub-install/test/fixtures/README.md
  - design-system-to-storybook/scripts/test_detect_storybook_environment.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-export-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-fixture-builds.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/story-fidelity-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-neutral-build-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/run-review-controller-test.mjs
-->

---
### Requirement: Invocation accepts exactly one contained task-scoped input and result path

A companion invocation SHALL identify one project-relative `input.json` and one project-relative `result.json` inside the same task-scoped runtime directory. Both resolved paths MUST remain inside the project root and runtime directory after symlink resolution. The input and output paths MUST differ. The process environment MUST provide non-empty `AGENT_AUTOMATION_RUN_ID`, `AGENT_AUTOMATION_TASK_ID`, and `AGENT_AUTOMATION_RUNNER_ID`, and the generic task id MUST equal `figma-cleanup`.

Missing input, unreadable input, absent run identity, unsupported generic task id, absolute result path, traversal, symlink escape, shared output path, or preexisting non-matching result SHALL fail before analysis. Such preflight failure MUST create no result and MUST modify no other path.

#### Scenario: Valid task-scoped paths enter analysis

- **WHEN** request paths are `.design-automation/runtime/task-42/input.json` and `.design-automation/runtime/task-42/result.json`, both resolve inside the project, the result does not exist, and generic task id is `figma-cleanup`
- **THEN** the companion reads exactly that input and reserves exactly that result path
- **AND** it reads no other automation task directory

#### Scenario: Escaping result path is rejected

- **WHEN** the requested result path resolves through a symlink to a file outside the project root
- **THEN** the process exits non-zero before analysis
- **AND** no result or other file is created

##### Example: Result symlink points to temporary storage

- **GIVEN** `.design-automation/runtime/task-42/result.json` is a symlink to `/tmp/escaped-result.json`
- **WHEN** companion preflight resolves the path
- **THEN** it returns `unsafe-cleanup-result-path` and `/tmp/escaped-result.json` does not exist

#### Scenario: Missing generic run identity is rejected

- **WHEN** `AGENT_AUTOMATION_RUN_ID` is absent
- **THEN** the process exits non-zero without writing a result
- **AND** it does not invent or infer a run id


<!-- @trace
source: add-design-automation-hub-installer
updated: 2026-07-31
code:
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/contract.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
  - design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs
  - design-automation-hub-install/scripts/install-design-automation-hub.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/domExport.ts
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.js
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-automation-hub-install/agents/openai.yaml
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/scripts/lib/storybook_environment.mjs
  - design-system-to-storybook/scripts/lib/figma_export_wiring.mjs
  - design-system-to-storybook/scripts/install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/write-cleanup-result.mjs
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-DawOAq7P.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/VENDOR.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/agent-automation-task.fragment.json
  - design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/reviewController.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/check-cleanup-result.mjs
  - design-system-to-storybook/references/tooling-updates.md
  - design-automation-hub-install/template/skills/figma-design-automation/references/cleanup-contract.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/store.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domRuntime.ts
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/manifest.json
  - design-automation-hub-install/template/project-profile.example.json
  - design-automation-hub-install/template/scripts/design-automation-hub/host.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/README.md
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js
  - design-automation-hub-install/template/scripts/design-automation-hub/agent-runner.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-automation-hub-install/scripts/build-template-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js
  - design-system-to-storybook/assets/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - docs/skills-guide.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/compatible-host.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-automation-hub-install/template/gitignore.fragment
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/check-figma-design-automation.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/core.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-automation-hub-install/scripts/smoke-host-adapter.mjs
  - design-system-to-storybook/references/framework-adaptation.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/agents/openai.yaml
  - design-automation-hub-install/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-automation-hub-install/references/installation-contract.md
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/ui.html
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/server.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/types.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - docs/skills-usage.md
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/overlay-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-package-contract-test.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-bridge-helpers.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/src/ParityFixture.stories.ts
  - design-system-to-storybook/scripts/test_install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/src/ParityFixture.stories.tsx
  - design-system-to-storybook/assets/figma-export-addon/test/tokenless-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-automation-hub-install/test/fixtures/manual-two-project-acceptance.json
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-story-fidelity-fixture.mjs
  - design-automation-hub-install/test/fixtures/README.md
  - design-system-to-storybook/scripts/test_detect_storybook_environment.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-export-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-fixture-builds.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/story-fidelity-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-neutral-build-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/run-review-controller-test.mjs
-->

---
### Requirement: Cleanup input is bounded, allowlisted, canonical, and scope-contained

Input schema version 1 SHALL contain exactly task type `figma-cleanup`, automation task id, project id, file key, one scope identity, `inputSnapshotHash`, and one snapshot. Scope type MUST be `SECTION`, `FRAME`, `COMPONENT`, or `COMPONENT_SET`. The serialized input MUST NOT exceed 1 MiB and the snapshot MUST NOT exceed 500 nodes.

Each snapshot node SHALL contain only id, type, name, parent id, sibling index, visible, locked, child ids, and absolute bounds. Every node and parent reference except the scope's own external parent MUST remain inside the declared scope. Stable JSON key order and stable child order SHALL produce the SHA-256 `inputSnapshotHash`; runtime timestamps, selection order, viewport, comments, plugin data, credentials, and other Figma properties MUST NOT affect it.

A schema-valid invocation with an invalid snapshot SHALL write a blocked result bound to the same task and run, with a stable failure code and zero operations. It MUST NOT guess missing fields, truncate an oversized snapshot, or expand scope.

#### Scenario: Equivalent snapshots keep one hash

- **WHEN** two inputs contain the same allowlisted nodes and child order but differ in object-key order, viewport, and runtime timestamp
- **THEN** canonicalization produces the same `inputSnapshotHash` for both

#### Scenario: Node limit is rejected without truncation

- **WHEN** a selected Section snapshot contains 501 nodes
- **THEN** the result status is `blocked` with `cleanup-scope-too-large`
- **AND** operations is empty
- **AND** the skill does not analyze the first 500 nodes as a partial scope

#### Scenario: Parent escape is rejected

- **WHEN** a non-scope node references a parent outside the declared scope
- **THEN** the result status is `blocked` with `invalid-cleanup-snapshot`
- **AND** operations is empty


<!-- @trace
source: add-design-automation-hub-installer
updated: 2026-07-31
code:
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/contract.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
  - design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs
  - design-automation-hub-install/scripts/install-design-automation-hub.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/domExport.ts
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.js
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-automation-hub-install/agents/openai.yaml
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/scripts/lib/storybook_environment.mjs
  - design-system-to-storybook/scripts/lib/figma_export_wiring.mjs
  - design-system-to-storybook/scripts/install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/write-cleanup-result.mjs
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-DawOAq7P.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/VENDOR.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/agent-automation-task.fragment.json
  - design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/reviewController.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/check-cleanup-result.mjs
  - design-system-to-storybook/references/tooling-updates.md
  - design-automation-hub-install/template/skills/figma-design-automation/references/cleanup-contract.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/store.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domRuntime.ts
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/manifest.json
  - design-automation-hub-install/template/project-profile.example.json
  - design-automation-hub-install/template/scripts/design-automation-hub/host.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/README.md
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js
  - design-automation-hub-install/template/scripts/design-automation-hub/agent-runner.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-automation-hub-install/scripts/build-template-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js
  - design-system-to-storybook/assets/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - docs/skills-guide.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/compatible-host.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-automation-hub-install/template/gitignore.fragment
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/check-figma-design-automation.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/core.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-automation-hub-install/scripts/smoke-host-adapter.mjs
  - design-system-to-storybook/references/framework-adaptation.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/agents/openai.yaml
  - design-automation-hub-install/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-automation-hub-install/references/installation-contract.md
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/ui.html
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/server.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/types.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - docs/skills-usage.md
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/overlay-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-package-contract-test.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-bridge-helpers.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/src/ParityFixture.stories.ts
  - design-system-to-storybook/scripts/test_install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/src/ParityFixture.stories.tsx
  - design-system-to-storybook/assets/figma-export-addon/test/tokenless-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-automation-hub-install/test/fixtures/manual-two-project-acceptance.json
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-story-fidelity-fixture.mjs
  - design-automation-hub-install/test/fixtures/README.md
  - design-system-to-storybook/scripts/test_detect_storybook_environment.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-export-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-fixture-builds.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/story-fidelity-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-neutral-build-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/run-review-controller-test.mjs
-->

---
### Requirement: Cleanup result binds task, snapshot, and generic run identities

A successful result SHALL use schema version 1 and SHALL contain exactly `taskType: "figma-cleanup"`, `status: "plan-ready"`, `automationTaskId`, `inputSnapshotHash`, `agentAutomationRunId`, a non-empty summary, and operations. `agentAutomationRunId` MUST equal `AGENT_AUTOMATION_RUN_ID`; task and snapshot identities MUST equal the input.

A blocked result SHALL use the same identity fields, `status: "blocked"`, an empty operations array, and failure containing a stable code and safe message. Result MUST NOT include the input snapshot, Figma access token, bearer or provider credential, raw prompt, raw model output, environment values, expanded runner argv, database path, or properties outside the result schema.

The deterministic result checker SHALL use `AGENT_AUTOMATION_RUN_ID` to find exactly one designated result for the current run. Missing result, duplicate run-bound results, identity mismatch, unsupported status, extra secret-bearing fields, or malformed schema MUST fail verification even when the agent process exits zero.

#### Scenario: Valid result matches all three identities

- **WHEN** task `automation-task-42` with hash `sha256-a` runs under generic run `run-a` and writes a plan-ready result with those exact values
- **THEN** deterministic result verification passes identity checks
- **AND** the Coordinator can continue to operation validation

#### Scenario: Result from another run is rejected

- **WHEN** the result names `agentAutomationRunId: "run-b"` while the verification environment contains `run-a`
- **THEN** verification fails with `cleanup-result-run-mismatch`
- **AND** no operation becomes applicable

#### Scenario: Two results claim one run

- **WHEN** two task directories each contain a result naming the current generic run id
- **THEN** verification fails with `duplicate-cleanup-run-result`
- **AND** it does not select the newer file


<!-- @trace
source: add-design-automation-hub-installer
updated: 2026-07-31
code:
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/contract.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
  - design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs
  - design-automation-hub-install/scripts/install-design-automation-hub.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/domExport.ts
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.js
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-automation-hub-install/agents/openai.yaml
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/scripts/lib/storybook_environment.mjs
  - design-system-to-storybook/scripts/lib/figma_export_wiring.mjs
  - design-system-to-storybook/scripts/install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/write-cleanup-result.mjs
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-DawOAq7P.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/VENDOR.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/agent-automation-task.fragment.json
  - design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/reviewController.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/check-cleanup-result.mjs
  - design-system-to-storybook/references/tooling-updates.md
  - design-automation-hub-install/template/skills/figma-design-automation/references/cleanup-contract.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/store.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domRuntime.ts
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/manifest.json
  - design-automation-hub-install/template/project-profile.example.json
  - design-automation-hub-install/template/scripts/design-automation-hub/host.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/README.md
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js
  - design-automation-hub-install/template/scripts/design-automation-hub/agent-runner.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-automation-hub-install/scripts/build-template-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js
  - design-system-to-storybook/assets/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - docs/skills-guide.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/compatible-host.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-automation-hub-install/template/gitignore.fragment
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/check-figma-design-automation.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/core.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-automation-hub-install/scripts/smoke-host-adapter.mjs
  - design-system-to-storybook/references/framework-adaptation.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/agents/openai.yaml
  - design-automation-hub-install/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-automation-hub-install/references/installation-contract.md
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/ui.html
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/server.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/types.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - docs/skills-usage.md
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/overlay-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-package-contract-test.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-bridge-helpers.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/src/ParityFixture.stories.ts
  - design-system-to-storybook/scripts/test_install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/src/ParityFixture.stories.tsx
  - design-system-to-storybook/assets/figma-export-addon/test/tokenless-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-automation-hub-install/test/fixtures/manual-two-project-acceptance.json
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-story-fidelity-fixture.mjs
  - design-automation-hub-install/test/fixtures/README.md
  - design-system-to-storybook/scripts/test_detect_storybook_environment.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-export-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-fixture-builds.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/story-fidelity-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-neutral-build-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/run-review-controller-test.mjs
-->

---
### Requirement: Cleanup plan is evidence-based, bounded, and strictly allowlisted

A plan-ready result SHALL contain no more than 100 operations. Every operation SHALL have a unique non-empty `operationId`, a non-empty reason tied to snapshot evidence, and exactly one of these shapes:

- `rename-node`: `nodeId`, `beforeName`, and `afterName`
- `reorder-node`: `nodeId`, `parentId`, `beforeIndex`, and `afterIndex`
- `move-node`: `nodeId`, `fromParentId`, `toParentId`, `beforeIndex`, `afterIndex`, and `beforeAbsoluteBounds`

Every target and container MUST exist in the snapshot and remain inside scope. Before values MUST equal snapshot values. A rename reason MUST identify hierarchy or sibling evidence and MUST NOT invent product semantics absent from the snapshot. A reorder or move reason MUST identify the structural inconsistency it addresses and MUST preserve the recorded absolute bounds contract for later Plugin preflight.

The result MUST NOT contain create, delete, detach, geometry, resize, layout, style, variable, prototype, text-content, visibility, lock, component-property, instance-override, or cross-file operations. One invalid, duplicate, unsupported, out-of-scope, or over-limit operation SHALL reject the entire plan and expose zero applicable operations.

#### Scenario: Four allowlisted operations validate

- **WHEN** a result contains two evidence-backed renames, one same-parent reorder, and one move to an existing in-scope container with exact before values
- **THEN** all four operations pass the companion checker
- **AND** their operation ids and reasons remain unchanged

##### Example: Concrete four-operation plan

| Operation ID | Type | Target | Expected |
| --- | --- | --- | --- |
| `rename-1` | `rename-node` | `12:1` | pass |
| `rename-2` | `rename-node` | `12:2` | pass |
| `reorder-1` | `reorder-node` | `12:3` | pass |
| `move-1` | `move-node` | `12:4` | pass |

#### Scenario: One delete invalidates the complete result

- **WHEN** a result contains two valid renames and one delete operation
- **THEN** verification fails with `invalid-cleanup-operation`
- **AND** zero operations become applicable

#### Scenario: Semantic rename without evidence is rejected

- **WHEN** a node named `Frame 17` is renamed to `Premium Portfolio Card` without any matching hierarchy or sibling evidence in the snapshot
- **THEN** the result is rejected as `unsupported-cleanup-inference`
- **AND** the original node name remains unchanged


<!-- @trace
source: add-design-automation-hub-installer
updated: 2026-07-31
code:
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/contract.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
  - design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs
  - design-automation-hub-install/scripts/install-design-automation-hub.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/domExport.ts
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.js
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-automation-hub-install/agents/openai.yaml
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/scripts/lib/storybook_environment.mjs
  - design-system-to-storybook/scripts/lib/figma_export_wiring.mjs
  - design-system-to-storybook/scripts/install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/write-cleanup-result.mjs
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-DawOAq7P.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/VENDOR.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/agent-automation-task.fragment.json
  - design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/reviewController.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/check-cleanup-result.mjs
  - design-system-to-storybook/references/tooling-updates.md
  - design-automation-hub-install/template/skills/figma-design-automation/references/cleanup-contract.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/store.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domRuntime.ts
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/manifest.json
  - design-automation-hub-install/template/project-profile.example.json
  - design-automation-hub-install/template/scripts/design-automation-hub/host.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/README.md
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js
  - design-automation-hub-install/template/scripts/design-automation-hub/agent-runner.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-automation-hub-install/scripts/build-template-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js
  - design-system-to-storybook/assets/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - docs/skills-guide.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/compatible-host.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-automation-hub-install/template/gitignore.fragment
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/check-figma-design-automation.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/core.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-automation-hub-install/scripts/smoke-host-adapter.mjs
  - design-system-to-storybook/references/framework-adaptation.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/agents/openai.yaml
  - design-automation-hub-install/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-automation-hub-install/references/installation-contract.md
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/ui.html
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/server.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/types.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - docs/skills-usage.md
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/overlay-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-package-contract-test.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-bridge-helpers.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/src/ParityFixture.stories.ts
  - design-system-to-storybook/scripts/test_install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/src/ParityFixture.stories.tsx
  - design-system-to-storybook/assets/figma-export-addon/test/tokenless-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-automation-hub-install/test/fixtures/manual-two-project-acceptance.json
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-story-fidelity-fixture.mjs
  - design-automation-hub-install/test/fixtures/README.md
  - design-system-to-storybook/scripts/test_detect_storybook_environment.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-export-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-fixture-builds.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/story-fidelity-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-neutral-build-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/run-review-controller-test.mjs
-->

---
### Requirement: Analysis writes only the designated result and never mutates product or Figma state

During a valid invocation, the companion skill SHALL treat input, product source, project profile, automation config, Coordinator database, generic run summaries, and Figma document as read-only. The only permitted write SHALL be one atomic replacement of the designated task-scoped result path. The skill MUST NOT call a Figma mutation API, apply an operation, submit completion proof, alter selection, or write plugin data.

Before and after evidence for tests SHALL prove that successful, blocked, and failed analysis preserve the Figma document, product source, database, project profile, input artifact, and `.agent-automation/config.json`. A plan is a proposal for later Plugin confirmation and MUST NOT count as applied work.

#### Scenario: Successful analysis changes one artifact only

- **WHEN** a valid snapshot produces a four-operation plan
- **THEN** exactly the designated result file is new or replaced
- **AND** product source, database, config, input, generic summaries, and Figma document hashes remain unchanged

##### Example: Before and after hash inventory

- **GIVEN** six protected surfaces have hash set `protected-hash-a` and no result exists
- **WHEN** analysis writes `.design-automation/runtime/task-42/result.json`
- **THEN** the result has a new hash and all six protected surfaces still have `protected-hash-a`

#### Scenario: Blocked analysis exposes no partial plan

- **WHEN** analysis detects one unsafe requested operation
- **THEN** the blocked result contains zero operations
- **AND** no document or repository mutation occurs

##### Example: Unsafe delete mixed with renames

- **GIVEN** candidate output contains `rename-1`, `delete-1`, and `rename-2`
- **WHEN** the complete candidate is validated
- **THEN** status is `blocked`, failure code is `invalid-cleanup-operation`, and operations is `[]`


<!-- @trace
source: add-design-automation-hub-installer
updated: 2026-07-31
code:
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/contract.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
  - design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs
  - design-automation-hub-install/scripts/install-design-automation-hub.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/domExport.ts
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.js
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-automation-hub-install/agents/openai.yaml
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/scripts/lib/storybook_environment.mjs
  - design-system-to-storybook/scripts/lib/figma_export_wiring.mjs
  - design-system-to-storybook/scripts/install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/write-cleanup-result.mjs
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-DawOAq7P.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/VENDOR.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/agent-automation-task.fragment.json
  - design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/reviewController.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/check-cleanup-result.mjs
  - design-system-to-storybook/references/tooling-updates.md
  - design-automation-hub-install/template/skills/figma-design-automation/references/cleanup-contract.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/store.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domRuntime.ts
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/manifest.json
  - design-automation-hub-install/template/project-profile.example.json
  - design-automation-hub-install/template/scripts/design-automation-hub/host.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/README.md
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js
  - design-automation-hub-install/template/scripts/design-automation-hub/agent-runner.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-automation-hub-install/scripts/build-template-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js
  - design-system-to-storybook/assets/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - docs/skills-guide.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/compatible-host.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-automation-hub-install/template/gitignore.fragment
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/check-figma-design-automation.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/core.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-automation-hub-install/scripts/smoke-host-adapter.mjs
  - design-system-to-storybook/references/framework-adaptation.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/agents/openai.yaml
  - design-automation-hub-install/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-automation-hub-install/references/installation-contract.md
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/ui.html
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/server.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/types.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - docs/skills-usage.md
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/overlay-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-package-contract-test.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-bridge-helpers.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/src/ParityFixture.stories.ts
  - design-system-to-storybook/scripts/test_install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/src/ParityFixture.stories.tsx
  - design-system-to-storybook/assets/figma-export-addon/test/tokenless-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-automation-hub-install/test/fixtures/manual-two-project-acceptance.json
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-story-fidelity-fixture.mjs
  - design-automation-hub-install/test/fixtures/README.md
  - design-system-to-storybook/scripts/test_detect_storybook_environment.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-export-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-fixture-builds.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/story-fidelity-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-neutral-build-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/run-review-controller-test.mjs
-->

---
### Requirement: Companion source and installed multi-agent mirrors remain reproducible

The template SHALL contain one canonical `figma-design-automation` skill source with `SKILL.md`, OpenAI metadata, input/result contract reference, and deterministic checker. Its folder name and frontmatter name MUST both equal `figma-design-automation`. The installer SHALL create byte-identical mirrors for Codex, Claude, and Cursor project skill surfaces.

The companion checker SHALL validate required files, trigger description, generic/domain responsibility boundary, exact schemas, forbidden mutations, no provider commands, and template-to-mirror hashes. Any behavioral drift in one mirror SHALL fail installed-project validation.

#### Scenario: Three identical mirrors pass

- **WHEN** all three installed skill directories have the same file inventory and bytes as the canonical template
- **THEN** companion mirror validation passes
- **AND** every supported AI surface discovers the same skill name

##### Example: Matching canonical digest

- **GIVEN** the canonical inventory digest is `sha256-skill-a`
- **WHEN** Codex, Claude, and Cursor inventories each produce `sha256-skill-a`
- **THEN** mirror count is 3 and validation returns `valid`

#### Scenario: One mirror adds a provider fallback instruction

- **WHEN** the Claude mirror differs by adding a direct provider command
- **THEN** validation fails with `skill-mirror-drift`
- **AND** it identifies the Claude relative path without printing the command or file contents

<!-- @trace
source: add-design-automation-hub-installer
updated: 2026-07-31
code:
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/contract.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
  - design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs
  - design-automation-hub-install/scripts/install-design-automation-hub.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/domExport.ts
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.js
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-automation-hub-install/agents/openai.yaml
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/scripts/lib/storybook_environment.mjs
  - design-system-to-storybook/scripts/lib/figma_export_wiring.mjs
  - design-system-to-storybook/scripts/install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/write-cleanup-result.mjs
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-DawOAq7P.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/VENDOR.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-automation-hub-install/template/agent-automation-task.fragment.json
  - design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/reviewController.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/check-cleanup-result.mjs
  - design-system-to-storybook/references/tooling-updates.md
  - design-automation-hub-install/template/skills/figma-design-automation/references/cleanup-contract.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/store.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/domRuntime.ts
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/manifest.json
  - design-automation-hub-install/template/project-profile.example.json
  - design-automation-hub-install/template/scripts/design-automation-hub/host.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/README.md
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js
  - design-automation-hub-install/template/scripts/design-automation-hub/agent-runner.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/domRuntime.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-automation-hub-install/scripts/build-template-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js
  - design-system-to-storybook/assets/figma-export-addon/src/tokenExport.ts
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/domExport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - docs/skills-guide.html
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/compatible-host.mjs
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/src/types.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-automation-hub-install/template/gitignore.fragment
  - design-automation-hub-install/template/skills/figma-design-automation/scripts/check-figma-design-automation.mjs
  - design-system-to-storybook/assets/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/core.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-automation-hub-install/scripts/smoke-host-adapter.mjs
  - design-system-to-storybook/references/framework-adaptation.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-automation-hub-install/template/skills/figma-design-automation/agents/openai.yaml
  - design-automation-hub-install/SKILL.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-automation-hub-install/references/installation-contract.md
  - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/ui.html
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-automation-hub-install/template/scripts/design-automation-hub/server.mjs
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/types.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/pluginCode.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - docs/skills-usage.md
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/overlay-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/main.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-package-contract-test.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-bridge-helpers.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/src/ParityFixture.stories.ts
  - design-system-to-storybook/scripts/test_install_figma_export_addon.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/src/ParityFixture.stories.tsx
  - design-system-to-storybook/assets/figma-export-addon/test/tokenless-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-manifest.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/vue/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-automation-hub-install/test/fixtures/manual-two-project-acceptance.json
  - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-story-fidelity-fixture.mjs
  - design-automation-hub-install/test/fixtures/README.md
  - design-system-to-storybook/scripts/test_detect_storybook_environment.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-export-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/.storybook/preview.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-fixture-builds.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/story-fidelity-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-neutral-build-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/fixtures/react/package.json
  - design-system-to-storybook/assets/figma-export-addon/test/run-review-controller-test.mjs
-->