# design-automation-hub-installer Specification

## Purpose

TBD - created by archiving change 'add-design-automation-hub-installer'. Update Purpose after archive.

## Requirements

### Requirement: Installer preflight resolves an exact safe target and dry-run performs zero writes

The installer SHALL require an absolute project root and an explicit host mode. It MUST reject the filesystem root, the current user's home directory, a missing directory, a non-directory, a symlink-resolved target outside the supplied project root, unknown flags, and incompatible option combinations before creating any file or directory. The installer SHALL inspect the target's applicable instruction files and existing automation configuration before building a complete install plan.

A `--dry-run --json` invocation SHALL return the same planned installed, updated, merged, unchanged, conflict, manifest, and manual-action entries that a real invocation would evaluate. Dry-run MUST NOT create staging directories, backups, receipts, config files, runtime files, or any other filesystem change.

#### Scenario: Dry-run plans a clean standalone install

- **WHEN** the installer receives an absolute empty temporary project root, `--host-mode standalone`, `--dry-run`, and `--json`
- **THEN** it exits zero with result `planned`
- **AND** it lists the Plugin manifest, portable Coordinator, companion skill mirrors, generic dependency mirrors, config merge, and manual Figma import action
- **AND** the target filesystem remains byte-for-byte unchanged

#### Scenario: Home directory is rejected

- **WHEN** the supplied project root resolves to the current user's home directory
- **THEN** the installer exits non-zero with `unsafe-project-root`
- **AND** it performs zero writes

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
### Requirement: Versioned manifest defines a complete and contained template inventory

The installer package SHALL contain `TEMPLATE_MANIFEST.json` with schema version 1, a semantic `templateVersion`, a `minimumAgentAutomationVersion`, a `files` array, and a `manualActions` array. Every file entry SHALL contain one template-relative source, one project-relative target, a lowercase SHA-256 digest, and exactly one ownership value from `managed`, `merge`, or `generated`. The Figma import handoff SHALL be represented as a `manual` action rather than a managed file.

The template checker MUST reject duplicate source or target entries, absolute paths, empty paths, `..` traversal, symlink escape, unknown ownership, malformed digest, listed-but-missing files, unlisted template files, hash mismatch, and an unsupported manifest schema. A rejected manifest MUST prevent installation.

#### Scenario: Traversing target path is rejected

- **WHEN** a manifest entry targets `../outside/main.js`
- **THEN** template validation fails with `unsafe-template-target`
- **AND** no target project is modified

#### Scenario: Complete version 1 inventory validates

- **WHEN** every regular template file is listed exactly once with its actual digest and a contained target
- **THEN** template validation returns `valid`
- **AND** it reports the manifest template version and file count

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
### Requirement: Generic orchestrator dependency comes from the existing canonical sibling source

The installer SHALL treat top-level `agent-automation-orchestrate` in the same complete `cm-skills` checkout as the only canonical generic runtime source. It SHALL resolve that checkout from one unambiguous ancestor containing both skill roots or from explicit absolute `--skills-source-root`. It SHALL install byte-identical project-local mirrors under `.agents/skills`, `.claude/skills`, and `.cursor/skills`. The Design Automation Hub template MUST NOT contain a vendored or renamed copy of the generic skill and MUST NOT create a skill named `figma-automation-orchestrate`.

Before target writes, the installer SHALL verify the sibling source's `SKILL.md`, runtime scripts, and self-check contract. Missing or invalid canonical source SHALL fail with `missing-agent-automation-source` or `invalid-agent-automation-source` and SHALL provide a remediation that uses a complete `cm-skills` checkout.

#### Scenario: Complete source installs three mirrors

- **WHEN** installation runs from a complete `cm-skills` checkout whose generic skill self-check passes
- **THEN** all three target skill surfaces contain byte-identical `agent-automation-orchestrate` files
- **AND** the installed Coordinator runtime points to the project-local `.agents` runtime script

#### Scenario: Isolated installer copy has no sibling source

- **WHEN** the installer package is copied without the top-level canonical generic skill
- **THEN** preflight fails with `missing-agent-automation-source`
- **AND** no template or config file is written to the target

#### Scenario: Explicit source root resolves an isolated installer

- **WHEN** an isolated installer is given an absolute `--skills-source-root` containing one valid canonical generic skill
- **THEN** dependency preflight uses that source and reports its resolved root
- **AND** it does not search the network or another checkout

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
### Requirement: Managed installation and update preserve local work and remain recoverable

A clean install SHALL write only manifest-listed managed or generated targets plus approved merge changes and SHALL create `.design-automation/install.json` only after every validation and write succeeds. The receipt SHALL record template version, installed managed hashes, and every managed merge fragment's id, target, and normalized hash without secrets. Reinstalling the same version over unchanged files SHALL be idempotent and SHALL report those files and fragments as `unchanged`.

An update SHALL overwrite a managed target only when its current digest equals the digest recorded by the prior receipt or when the operator explicitly supplies `--force-managed`. A locally modified managed file SHALL produce `locally-modified-managed-file` by default. `--force-managed` MUST affect only manifest-listed managed targets and MUST NOT replace merge-owned unknown content.

The installer SHALL stage all planned files inside the project root. If commit fails after any target changes, it MUST restore every preexisting touched file, remove every file newly created by that failed attempt, leave the previous receipt unchanged, and return a recoverable failure record.

#### Scenario: Identical reinstall is idempotent

- **WHEN** the same template version is installed twice without target edits
- **THEN** the second run reports no installed, updated, or merged changes
- **AND** every managed target and receipt remains byte-identical

##### Example: Reinstall version 1.0.0

- **GIVEN** receipt version `1.0.0` records managed digest `sha256-managed-a` and fragment digest `sha256-fragment-a`
- **WHEN** version `1.0.0` with the same two digests is installed again
- **THEN** installed, updated, and merged are empty and unchanged contains both managed and fragment entries

#### Scenario: Local managed edit blocks update

- **WHEN** a developer edits the installed Plugin UI after version 1.0.0 and then runs update to 1.1.0 without `--force-managed`
- **THEN** update exits non-zero with `locally-modified-managed-file`
- **AND** neither that UI file nor any other planned target is changed

#### Scenario: Mid-commit failure rolls back the attempt

- **WHEN** a fixture injects a write failure after two managed files were committed
- **THEN** both touched files return to their exact pre-run bytes
- **AND** new files from the failed attempt are absent
- **AND** the prior receipt remains unchanged

##### Example: Failure on third managed file

- **GIVEN** `main.js` contains bytes A, `ui.html` contains bytes B, and receipt version is `1.0.0`
- **WHEN** update writes two replacements and the third managed write raises `EIO`
- **THEN** `main.js` is A, `ui.html` is B, and the receipt still reports `1.0.0`

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
### Requirement: Agent automation task merge is additive, validated, and bootstrap-aware

The installer SHALL merge exactly one `figma-cleanup` task into a schema version 1 `.agent-automation/config.json`. It MUST preserve the existing state directory, runner objects and order, unrelated tasks, and unknown non-conflicting content accepted by the existing validator. The merged task SHALL set `skill` to `figma-design-automation`, SHALL use the installed deterministic cleanup-result checker as verification, and SHALL keep `requiredArtifacts` as an empty array because the result path is task-scoped.

If the config is absent, the installer SHALL return `needs-agent-automation-bootstrap` without claiming completion. The installer skill SHALL then use the existing generic bootstrap or guide workflow to create a valid runner contract from repository evidence before repeating the merge. An existing `figma-cleanup` task SHALL be unchanged only when its normalized value equals the current template fragment or the prior receipt fragment hash; every other value SHALL fail with `conflicting-figma-cleanup-task` and MUST NOT be overwritten by `--force-managed`. Every merged config MUST pass the existing `validate-project-config.mjs` before commit.

#### Scenario: Existing runners and tasks survive merge

- **WHEN** a valid project contract contains ordered runners `claude` then `codex` and task `implement`
- **THEN** installation preserves both runners in the same order and preserves `implement`
- **AND** it adds one valid `figma-cleanup` task naming `figma-design-automation`

##### Example: Additive task keys

| Before tasks | After tasks | Runner order |
| --- | --- | --- |
| `implement` | `implement`, `figma-cleanup` | `claude`, `codex` |

#### Scenario: Missing config requests bootstrap

- **WHEN** the target has no `.agent-automation/config.json`
- **THEN** the script returns result `needs-bootstrap` with code `needs-agent-automation-bootstrap`
- **AND** it does not invent runner commands or credentials
- **AND** the installer skill routes the next step through the generic bootstrap or guide contract

#### Scenario: Conflicting cleanup task is preserved

- **WHEN** the target contains a `figma-cleanup` task with a different skill or verification command
- **THEN** installation fails with `conflicting-figma-cleanup-task`
- **AND** the existing config remains byte-identical

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
### Requirement: Project identity is explicit, non-secret, and never inferred from repository names

Initial installation SHALL require either explicit `--project-id`, `--project-name`, and at least one `--figma-file-key`, or one project-relative `--project-profile` file containing the equivalent schema version 1 values. The installer MUST NOT infer project identity or Figma file keys from a directory name, Git remote, package name, Figma file name, node name, or Plugin data. Missing values SHALL return result `needs-profile` with `needs-project-profile` before any write.

Project profile validation MUST reject empty identity, duplicate file keys, one file key mapped to multiple project ids, unknown schema, path escape, and credential-like keys or values. It SHALL preserve unknown non-conflicting safe fields during update.

#### Scenario: Explicit profile values generate one project binding

- **WHEN** install receives project id `aurora`, project name `Project Aurora`, and file keys `file-a` and `file-b`
- **THEN** the generated profile contains exactly that identity and both keys
- **AND** no value is derived from the target folder or Git remote

#### Scenario: Missing file key requests profile setup

- **WHEN** initial install has project id and name but no Figma file key or profile file
- **THEN** it returns `needs-project-profile` with result `needs-profile`
- **AND** the target remains unchanged

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
### Requirement: Portable Coordinator exposes only features supported by its host mode

The installed runtime SHALL provide one Coordinator core for authenticated plugin context, durable cleanup tasks, generic-agent delegation, plan validation, workflow status, and session authentication. In `standalone` mode, cleanup and workflow status SHALL be enabled and review MUST be false; the runtime MUST NOT create, imitate, or report an extraction queue.

In `compatible` mode, the supplied project-relative host module SHALL export `designAutomationHubHostAdapter` with `contractVersion: 1`, `resolveProject(context)`, and `resolveMember(context)`. Review SHALL be enabled only when its `review` object provides `listPendingReviews(context)`, `submitReviewDecision(context, decision)`, and `getWorkflowOverview(context)`, and a no-write fixture smoke check passes. An absent review object SHALL force review false. A partial review method group, failed smoke check, unsupported host contract version, or missing required base method SHALL fail preflight with zero writes.

#### Scenario: Standalone project receives two real features

- **WHEN** a project installs with `--host-mode standalone`
- **THEN** authenticated plugin context enables cleanup and workflow status
- **AND** review is false
- **AND** no extraction queue endpoint or state is created

#### Scenario: Complete compatible review adapter enables review

- **WHEN** a version-compatible host implements project resolution, member resolution, pending review, decision submission, and workflow overview
- **THEN** installed context can enable all three Plugin entries according to member permission
- **AND** the portable core uses the host's durable review truth rather than copying it

##### Example: Contract version 1 review descriptor

- **GIVEN** `contractVersion: 1`, base methods `resolveProject` and `resolveMember`, and review methods `listPendingReviews`, `submitReviewDecision`, and `getWorkflowOverview`
- **WHEN** the no-write adapter smoke check succeeds for project `aurora`
- **THEN** authenticated context can return `review: true` and no review record is copied into portable storage

#### Scenario: Partial review adapter cannot expose review

- **WHEN** the host implements pending review but omits decision submission
- **THEN** compatible-mode preflight fails with `incomplete-review-adapter`
- **AND** the target remains unchanged

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
### Requirement: Installer output is sanitized and preserves manual Figma import as an explicit handoff

With `--json`, installer and checker commands SHALL emit one JSON object containing schema version, mode, result, absolute project root, template version, host mode, installed, updated, merged, unchanged and conflict summaries, stable issues, absolute Plugin manifest path, manual actions, and next actions. Every non-success or setup-required result SHALL include at least one stable issue code. The output MUST NOT include session codes, bearer or provider credentials, expanded runner arguments, raw prompts, raw AI output, or environment values.

A successful filesystem install SHALL include manual action `import-figma-manifest` with `completed: false`. The installer MUST NOT claim that Figma Desktop imported the Plugin and MUST NOT automate the Figma GUI. Fixed Plugin identity and copy SHALL use `Design Automation Hub` and MUST NOT contain a project name; authenticated Coordinator context SHALL provide the project display name.

#### Scenario: Successful install reports one honest manual action

- **WHEN** all standalone filesystem installation checks pass
- **THEN** result is `installed` and `manifestPath` is an absolute existing file
- **AND** manual actions contain `import-figma-manifest` with `completed: false`
- **AND** no field claims that the Plugin is installed in Figma Desktop

#### Scenario: Output contains no runtime secrets

- **WHEN** process environment contains session and provider credentials during install
- **THEN** serialized JSON contains none of their names' values, raw commands, prompts, or AI output

##### Example: Literal secret values are absent

- **GIVEN** environment values `session-secret-42` and `provider-secret-99`
- **WHEN** install emits its JSON result
- **THEN** neither literal value occurs in the serialized output

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
### Requirement: Template, installed-project, source-sync, and smoke checks prove distribution health

The package SHALL provide one deterministic checker with template-only, installed-project, and optional source-sync modes. Template-only mode SHALL validate inventory, hashes, ownership, project-neutral copy, Figma ES2018 main-thread compatibility, skill metadata, and absence of a duplicated generic source. Installed-project mode SHALL validate receipt parity, managed hashes, config merge, project profile, three skill mirrors, runtime containment, host-mode capability projection, and the absolute manifest handoff. Source-sync mode SHALL compare only a declared portable inventory against the product source and MUST NOT require the product repo for normal installation.

A standalone smoke fixture SHALL use fake generic runners to prove unavailable-runner fallback, task-scoped result verification, durable `plan-ready`, and zero Figma mutation before Plugin confirmation. Checker failure SHALL use a non-zero exit and stable issue codes.

#### Scenario: Installed-project check detects mirror drift

- **WHEN** one byte in the Cursor `figma-design-automation` mirror differs from the template and other mirrors
- **THEN** installed-project check fails with `skill-mirror-drift`
- **AND** it identifies the relative target without printing file contents

#### Scenario: Source-sync compares declared portable files only

- **WHEN** the product repo contains unrelated Storybook and report artifacts in addition to the declared Hub sources
- **THEN** source-sync ignores the unrelated artifacts
- **AND** it fails only when a declared portable source contract or digest differs

##### Example: Three declared and two unrelated files

- **GIVEN** the portable inventory declares Plugin main, Plugin UI, and Coordinator core while the product repo also contains `storybook-static/index.html` and `design-system/report.json`
- **WHEN** all three declared digests match
- **THEN** compared file count is 3, ignored unrelated count is 2, and source-sync passes

#### Scenario: Fake runner fallback reaches a validated plan

- **WHEN** the first fake runner is unavailable and the second writes a valid task-scoped cleanup result
- **THEN** the generic run reaches `completed`
- **AND** the durable automation task reaches `plan-ready`
- **AND** the Figma document mutation count remains zero

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
### Requirement: Plugin captures a batch of cleanup scopes and rejects overlapping or oversized batches

The Plugin sandbox SHALL accept a capture request that resolves one or more cleanup scopes, sourced either from the current page selection or from an explicit list of node identifiers. Each resolved scope MUST be a Section, Frame, Component, or Component Set, and each scope MUST be snapshotted independently under the existing 500-node and 1MB limits, producing its own snapshot and its own SHA-256 input snapshot hash.

The capture SHALL fail as a whole, returning a single stable error code and no scopes, when the source resolves to zero nodes, when any resolved node is an ancestor or descendant of another resolved node, or when the resolved node count exceeds the batch limit of 10. The capture MUST NOT silently drop, deduplicate, or collapse overlapping nodes into an outermost node.

The capture SHALL fail per scope, returning the successful scopes together with a rejection list carrying node identifier, name, and stable error code, when an individual node has an unsupported type, exceeds the node or byte limit, or cannot be snapshotted. When every resolved node is rejected, the capture SHALL report overall failure using the first rejection's error code.

#### Scenario: Two disjoint sections are captured as two scopes

- **WHEN** the current page selection contains two Sections and neither contains the other
- **THEN** the capture succeeds and returns two scopes
- **AND** each scope carries its own node count, snapshot, and input snapshot hash
- **AND** the two input snapshot hashes differ

#### Scenario: Ancestor and descendant selected together rejects the whole batch

- **WHEN** the current page selection contains a Section and a Frame nested inside that Section
- **THEN** the capture reports overall failure with the overlapping-scope error code
- **AND** no scope is returned

#### Scenario: One unsupported node does not block the rest of the batch

- **WHEN** the selection contains one Section, one Component, and one text node
- **THEN** the capture succeeds and returns two scopes for the Section and the Component
- **AND** the rejection list contains one entry for the text node with the unsupported-scope error code

##### Example: Batch-level and scope-level outcomes

| Source nodes | Overall result | Scopes returned | Rejections |
| ------------ | -------------- | --------------- | ---------- |
| empty selection | failure, scope-required code | 0 | 0 |
| 2 disjoint Sections | success | 2 | 0 |
| Section + Frame inside it | failure, overlapping-scope code | 0 | 0 |
| 11 disjoint Sections | failure, batch-limit code | 0 | 0 |
| Section + text node | success | 1 | 1 |
| 2 text nodes | failure, unsupported-scope code | 0 | 2 |

<!-- @trace
source: add-cleanup-batch-scope-and-dev-status-scan
updated: 2026-08-10
code:
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
-->

---
### Requirement: Plugin scans the current page for Ready for dev cleanup candidates

The Plugin sandbox SHALL provide a scan that traverses only the current page and returns every outermost node whose type is Section, Frame, Component, or Component Set and whose Figma Dev Mode status is Ready for dev. Once a node is reported as a candidate the scan MUST NOT descend into its children, so the returned candidates are guaranteed to be mutually non-overlapping. The scan SHALL return at most 50 candidates and MUST report whether the result was truncated.

The scan SHALL read the Dev Mode status defensively and MUST treat a missing or non-object status property as not marked, rather than failing. A scan that finds no candidate SHALL return an empty candidate list with a successful result, and the Plugin UI MUST present this as an empty result rather than an error while keeping manual selection available.

The scan MUST NOT load, traverse, or report nodes on any page other than the current page.

#### Scenario: Outermost marked section suppresses its marked children

- **WHEN** a Section marked Ready for dev contains a Frame that is also marked Ready for dev
- **THEN** the scan returns exactly one candidate for the Section
- **AND** the nested Frame is not returned as a candidate

#### Scenario: No marked node yields an empty successful scan

- **WHEN** the current page contains no node marked Ready for dev
- **THEN** the scan succeeds with an empty candidate list
- **AND** the UI states that no Ready for dev scope exists on the current page
- **AND** manual selection remains available

#### Scenario: Missing Dev Mode status property does not fail the scan

- **WHEN** a traversed node exposes no Dev Mode status property
- **THEN** that node is treated as not marked
- **AND** the scan completes successfully for the remaining nodes

<!-- @trace
source: add-cleanup-batch-scope-and-dev-status-scan
updated: 2026-08-10
code:
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
-->

---
### Requirement: Batch capture creates one automation task per scope and preserves per-scope apply safety

The Plugin UI SHALL create exactly one `figma-cleanup` automation task per captured scope, sending one request per scope to the existing task creation endpoint with that scope's snapshot and input snapshot hash. The UI MUST NOT send more than one scope in a single task creation request and MUST NOT require any new Coordinator endpoint. The idempotency key of each request MUST remain unique per scope by continuing to incorporate that scope's input snapshot hash.

When one task creation request fails, the UI SHALL retain the already created tasks and present the failed scope as retryable, and MUST NOT cancel or roll back the tasks it already created.

The UI SHALL present a batch list showing each task's scope name and status, and SHALL open a single task's plan, selection, confirmation, and apply flow when that task is opened. When a batch contains exactly one task, the UI SHALL open that task's detail view directly. Applying a plan MUST remain a per-scope action that revalidates that scope's snapshot hash immediately before mutation and requires explicit human confirmation; the UI MUST NOT apply plans for multiple scopes from a single confirmation.

#### Scenario: Three captured scopes create three tasks

- **WHEN** analysis starts for a batch of three captured scopes
- **THEN** three separate task creation requests are sent
- **AND** each request carries exactly one scope and that scope's input snapshot hash
- **AND** the batch list shows three entries with their own statuses

#### Scenario: One failed creation preserves the others

- **WHEN** the second of three task creation requests fails
- **THEN** the first and third tasks remain present in the batch list
- **AND** the second scope is presented as retryable
- **AND** no already created task is cancelled

#### Scenario: Apply still requires confirmation for each scope

- **WHEN** a batch contains two tasks whose plans are both ready
- **THEN** applying the first task's plan confirms and mutates only that task's scope
- **AND** the second task's scope is not mutated until it is separately confirmed

#### Scenario: Single-scope batch keeps the existing single-task experience

- **WHEN** a batch contains exactly one task
- **THEN** the UI opens that task's detail view directly without an intermediate list step

<!-- @trace
source: add-cleanup-batch-scope-and-dev-status-scan
updated: 2026-08-10
code:
  - design-automation-hub-install/template/figma/design-automation-hub/ui.html
  - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - design-automation-hub-install/template/figma/design-automation-hub/main.js
  - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
-->

---
### Requirement: Dispatch binding is local, untracked, and never distributed

The installed distribution SHALL support an optional task board dispatch binding that lives outside the project profile: environment variables, or an untracked binding file below the project's design automation directory. The installer's gitignore merge fragment SHALL cover that binding file so an accidentally created binding is never committed.

The installer SHALL NOT create, request, or infer the binding, SHALL NOT record it in the installation receipt, and SHALL NOT include the control plane URL or token in any command output. Installed-project validation SHALL pass whether or not a binding exists, and SHALL NOT require network access to the control plane.

#### Scenario: Binding file is ignored by version control

- **WHEN** a project is installed or updated
- **THEN** the merged gitignore covers the dispatch binding file path

#### Scenario: Installer never records the binding

- **WHEN** an installed project has a complete dispatch binding and the installer runs an update
- **THEN** the installation receipt and the command output contain neither the control plane URL nor the token

#### Scenario: Installed-project check does not depend on the binding

- **WHEN** the installed-project checker runs against a project with no dispatch binding
- **THEN** the check passes exactly as it does for a bound project

---
### Requirement: Dispatch mode never becomes an extraction queue

In `standalone` mode the runtime SHALL continue to expose only cleanup and workflow status with review false, and MUST NOT create, imitate, or report an extraction queue in either the unbound or the bound configuration. The health endpoint SHALL keep reporting the extraction queue as false in both configurations and SHALL additionally report a boolean dispatch flag stating whether a complete binding is active.

Dispatch mode SHALL accept no scan request, SHALL maintain no set of pending extraction work, and SHALL create work only from a cleanup task that the Plugin explicitly submitted.

#### Scenario: Health endpoint is honest in both configurations

- **WHEN** the health endpoint is queried on an unbound project and on a bound project
- **THEN** both responses report status ok, schema version 1, and the extraction queue as false
- **AND** the dispatch flag is false for the unbound project and true for the bound project

#### Scenario: No extraction surface is added

- **WHEN** a project runs with a complete dispatch binding
- **THEN** the Coordinator exposes no extraction queue endpoint and stores no extraction queue state

#### Scenario: Standalone review stays disabled when bound

- **WHEN** authenticated Plugin context is requested on a bound standalone project
- **THEN** cleanup and workflow status are enabled and review is false

---
### Requirement: Optional template modules partition the manifest inventory

`TEMPLATE_MANIFEST.json` SHALL support an optional per-file `module` field defaulting to `core`, and a top-level `modules` declaration that marks non-core modules as optional. The task-board dispatch module SHALL comprise exactly three template files: the dispatch orchestration module, the task-board binding loader, and the task-board client. The manifest generator SHALL assign module membership deterministically from a source-path mapping so that regeneration never silently reclassifies a file. Template validation MUST reject a file entry that references a module absent from the `modules` declaration, and a rejected manifest MUST prevent installation.

#### Scenario: Undeclared module reference is rejected

- **WHEN** a manifest file entry declares a `module` value that the top-level `modules` declaration does not contain
- **THEN** template validation fails with a stable issue code identifying the entry
- **AND** no installation proceeds from the rejected manifest

#### Scenario: Entries without a module field are core

- **WHEN** a manifest file entry omits the `module` field
- **THEN** the entry is treated as belonging to `core` and is installed in every installation

---
### Requirement: Default installation excludes the task-board dispatch module

A fresh installation invoked without module flags SHALL NOT copy any file belonging to the optional task-board dispatch module into the target project. The installer SHALL accept a `--with-task-board-dispatch` flag; when supplied, the module's files SHALL be installed, hashed, and verified exactly like every other managed entry, and the resulting dispatch behavior SHALL be identical to the pre-modularization installation.

#### Scenario: Default install omits dispatch files and passes check

- **WHEN** a project is installed without `--with-task-board-dispatch`
- **THEN** the installed Coordinator scripts directory contains no dispatch orchestration module, no task-board binding loader, and no task-board client
- **AND** an installed-project check run immediately after reports zero findings

#### Scenario: Flagged install carries the module in full

- **WHEN** a project is installed with `--with-task-board-dispatch`
- **THEN** all three module files are present with digests recorded in the receipt
- **AND** the installed-project check verifies them as managed entries

---
### Requirement: Receipt records the module selection and verification honors it

The install receipt SHALL record the set of modules installed. Installed-project verification SHALL derive the expected managed inventory from the module selection recorded in the receipt, and a module absent from that selection SHALL NOT produce drift or inventory findings. A receipt that predates module recording SHALL be treated as selecting all modules, so existing installations verify and update exactly as before. An update SHALL reuse the receipt's recorded selection: it SHALL NOT install files of an excluded module and SHALL NOT remove files of a module the receipt records as installed.

#### Scenario: Legacy receipt verifies as a full selection

- **WHEN** an installed-project check runs against a receipt without a module record in a project containing every managed file
- **THEN** the check passes with the same result as before module support existed

#### Scenario: Update preserves the exclusion

- **WHEN** an update runs in a project whose receipt records only the core module
- **THEN** no task-board dispatch file is created by the update
- **AND** a subsequent installed-project check reports zero findings

#### Scenario: Missing file of a selected module is still drift

- **WHEN** the receipt records the task-board dispatch module as installed and one of its files is deleted from the project
- **THEN** the installed-project check reports `managed-file-drift` for that file

##### Example: Selection-driven expected inventory

| Receipt module record | Dispatch files on disk | Check result |
|-----------------------|------------------------|--------------|
| absent (legacy receipt) | all present | pass |
| `core` only | none present | pass |
| `core` only | none present, update was run | pass, update added nothing |
| `core` + `task-board-dispatch` | one file deleted | `managed-file-drift` |
