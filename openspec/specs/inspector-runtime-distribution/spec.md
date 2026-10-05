# inspector-runtime-distribution Specification

## Purpose

Keeps the Prototype Inspector runtime loadable everywhere it is distributed: the storybook-product-prototype skill asset, the design-system-to-storybook storybook-template copy, and projects installed through install_prototype_inspector.mjs. It guards byte parity between mirrored copies and verifies that every module the runtime imports is shipped and exports what the runtime expects.

## Requirements

### Requirement: Inspector runtime mirror parity

The smoke test storybook-product-prototype/scripts/test_scaffold_validate.py SHALL compare the complete file inventory and the bytes of every file under storybook-product-prototype/assets/prototype-inspector/ against design-system-to-storybook/storybook-template/.storybook/prototype-inspector/, deriving the inventory by walking both directories instead of reading a hard-coded file list and ignoring operating-system metadata files named .DS_Store. The smoke test SHALL additionally compare storybook-product-prototype/assets/prototype-flow-layout/prototypeFlowLayout.ts with design-system-to-storybook/storybook-template/src/pages/prototypes/prototypeFlowLayout.ts, and storybook-product-prototype/assets/prototype-review/fingerprint.mjs with design-system-to-storybook/storybook-template/scripts/prototype-review/fingerprint.mjs. The smoke test SHALL exit non-zero and name every file whose bytes differ, every file present in only one copy, and every missing member of a pair. When the storybook-template tree is absent, the check SHALL be skipped with a printed notice.

#### Scenario: One differing byte fails the smoke test

- **WHEN** the template copy of preview.js differs from the skill asset copy by a single byte
- **THEN** the smoke test exits non-zero and its output names preview.js as divergent

##### Example: one extra byte in the template preview.js

- **GIVEN** the template copy of preview.js ends with one extra newline byte
- **WHEN** `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` runs
- **THEN** it exits non-zero and prints a line containing "inspector mirror: preview.js differs"

#### Scenario: File present in only one copy fails the smoke test

- **WHEN** a new module file exists under storybook-product-prototype/assets/prototype-inspector/ but not under the template's .storybook/prototype-inspector/
- **THEN** the smoke test exits non-zero and its output names that file as missing from the template copy

##### Example: module added only to the skill asset

- **GIVEN** storybook-product-prototype/assets/prototype-inspector/new-module.js exists and the template folder has no new-module.js
- **WHEN** the smoke test runs
- **THEN** it exits non-zero and prints a line containing "inspector mirror: new-module.js only in skill asset"

#### Scenario: Stale template helper fails the smoke test

- **WHEN** the template's src/pages/prototypes/prototypeFlowLayout.ts differs from the skill asset helper
- **THEN** the smoke test exits non-zero and its output names prototypeFlowLayout.ts

##### Example: version-1 template helper

- **GIVEN** the template helper declares prototypeFlowLayoutSchemaVersion = 1 and the skill asset helper declares prototypeFlowLayoutSchemaVersion = 2
- **WHEN** the smoke test runs
- **THEN** it exits non-zero and prints a line that contains "inspector mirror:", "prototypeFlowLayout.ts" and "differs"


<!-- @trace
source: fix-inspector-runtime-drift
updated: 2026-10-05
code:
  - storybook-product-prototype/scripts/install_prototype_inspector.mjs
  - storybook-product-prototype/references/storybook-integration.md
  - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
  - storybook-product-prototype/SKILL.md
  - storybook-product-prototype/assets/prototype-inspector/preview.js
  - design-system-to-storybook/storybook-template/src/pages/prototypes/prototypeFlowLayout.ts
  - README.md
tests:
  - storybook-product-prototype/scripts/test_scaffold_validate.py
  - storybook-product-prototype/scripts/test_install_prototype_inspector.mjs
-->

---
### Requirement: Inspector import surface check

The smoke test SHALL read the static import declarations of every JavaScript module under storybook-product-prototype/assets/prototype-inspector/. Only static import declarations at statement start (import ... from "x" and import "x") SHALL be checked; import.meta expressions and dynamic import() calls SHALL be ignored. Every relative specifier SHALL resolve, from the installed location <project>/.storybook/prototype-inspector/, either to a file inside that folder or to one of the files the installer places in the project: src/pages/prototypes/prototypeFlowLayout.ts and scripts/prototype-review/fingerprint.mjs. Every name imported from the flow layout helper SHALL be exported by both helper copies; when the storybook-template tree is absent, imported names SHALL be checked against the skill asset helper alone and the smoke test SHALL print a notice that the template copy was skipped. Bare specifiers SHALL be limited to react, packages under storybook/ and packages under @storybook/, so the runtime adds no package dependency; preset.js, which Storybook loads in Node, SHALL be allowed to import Node built-in modules through node: specifiers, and a node: specifier in any other module SHALL be a violation. A violation SHALL make the smoke test exit non-zero and name the importing file, the specifier, and the unresolved file, the missing exported name, or the disallowed package.

#### Scenario: Helper copy lacks an imported name

- **WHEN** preview.js imports getPrototypeFlowLayoutViewportSignature and one helper copy does not export it
- **THEN** the smoke test exits non-zero and names preview.js, the helper path and getPrototypeFlowLayoutViewportSignature

##### Example: name removed from the template helper

- **GIVEN** design-system-to-storybook/storybook-template/src/pages/prototypes/prototypeFlowLayout.ts no longer exports getPrototypeFlowLayoutViewportSignature
- **WHEN** the smoke test runs
- **THEN** it exits non-zero and prints a failure line containing "inspector imports: preview.js imports ../../src/pages/prototypes/prototypeFlowLayout" that names that helper path and getPrototypeFlowLayoutViewportSignature

#### Scenario: Node-side preset passes unchanged

- **WHEN** the smoke test checks the unmodified preset.js, which imports node:path and node:url and reads import.meta.url
- **THEN** preset.js produces no import surface violation, because node: specifiers are allowed in preset.js and import.meta.url is not an import declaration

##### Example: current preset.js

- **GIVEN** preset.js starts with import { dirname, join } from "node:path"; and import { fileURLToPath } from "node:url"; and computes dirname(fileURLToPath(import.meta.url))
- **WHEN** `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` runs
- **THEN** it prints no failure line containing "inspector imports: preset.js"

#### Scenario: Node built-in in a browser module fails

- **WHEN** preview.js contains the declaration import "node:fs"
- **THEN** the smoke test exits non-zero and names preview.js and node:fs

#### Scenario: Relative import of an unshipped file

- **WHEN** an inspector module imports a relative path that resolves outside the inspector folder and is not one of the installer-placed files
- **THEN** the smoke test exits non-zero and names the importing module and the specifier

##### Example: specifier classification

| Module: specifier | Result | Notes |
| ----- | ----- | ----- |
| preview.js: ./prototype-inspector.css | allowed | file inside the inspector folder |
| preview.js: ../../src/pages/prototypes/prototypeFlowLayout | allowed | installer-placed helper |
| preview.js: ../../scripts/prototype-review/fingerprint.mjs | allowed | installer-placed fingerprint |
| preview.js: ../../src/utils/format | violation | not shipped by the installer |
| preview.js: storybook/preview-api | allowed | storybook package |
| preview.js: html-to-image | violation | new package dependency |
| preset.js: node:path | allowed | Node-side Storybook preset, node: built-in |
| preview.js: node:fs | violation | Node built-in in a browser module |


<!-- @trace
source: fix-inspector-runtime-drift
updated: 2026-10-05
code:
  - storybook-product-prototype/scripts/install_prototype_inspector.mjs
  - storybook-product-prototype/references/storybook-integration.md
  - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
  - storybook-product-prototype/SKILL.md
  - storybook-product-prototype/assets/prototype-inspector/preview.js
  - design-system-to-storybook/storybook-template/src/pages/prototypes/prototypeFlowLayout.ts
  - README.md
tests:
  - storybook-product-prototype/scripts/test_scaffold_validate.py
  - storybook-product-prototype/scripts/test_install_prototype_inspector.mjs
-->

---
### Requirement: Installer ships every inspector import

install_prototype_inspector.mjs SHALL install storybook-product-prototype/assets/prototype-review/fingerprint.mjs to <project>/scripts/prototype-review/fingerprint.mjs, in addition to the inspector folder and the flow layout helper. When the target fingerprint file already exists and --force is absent, the installer SHALL keep it and print a line starting with "Reused fingerprint"; otherwise it SHALL copy it and print a line starting with "Installed fingerprint". After a successful install, every relative import in the installed .storybook/prototype-inspector/ modules SHALL resolve to an existing project file.

#### Scenario: Fresh install includes the fingerprint module

- **WHEN** the installer runs with no flags against a React Storybook project that has no .storybook/prototype-inspector/, no flow layout helper and no scripts/prototype-review/
- **THEN** it exits zero, prints an "Installed fingerprint" line, and every relative import specifier in the installed inspector modules resolves to an existing project file

#### Scenario: Existing fingerprint module is kept

- **WHEN** the installer runs without --force against a project that already has scripts/prototype-review/fingerprint.mjs and no other installed inspector files
- **THEN** the existing fingerprint file is left byte-identical and the installer prints a "Reused fingerprint" line


<!-- @trace
source: fix-inspector-runtime-drift
updated: 2026-10-05
code:
  - storybook-product-prototype/scripts/install_prototype_inspector.mjs
  - storybook-product-prototype/references/storybook-integration.md
  - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
  - storybook-product-prototype/SKILL.md
  - storybook-product-prototype/assets/prototype-inspector/preview.js
  - design-system-to-storybook/storybook-template/src/pages/prototypes/prototypeFlowLayout.ts
  - README.md
tests:
  - storybook-product-prototype/scripts/test_scaffold_validate.py
  - storybook-product-prototype/scripts/test_install_prototype_inspector.mjs
-->

---
### Requirement: Installer refuses an incompatible flow layout helper

Before writing any file, after the existing React-only renderer guard and before the existing guard that stops when .storybook/prototype-inspector/ already exists and --force is absent, the installer SHALL read the project's src/pages/prototypes/prototypeFlowLayout.ts when it exists and --force is absent, and SHALL compare its exported names with the names the bundled inspector modules import from the helper. When any imported name is missing, the installer SHALL exit non-zero, print every missing name together with an instruction to rerun with --force, and SHALL NOT write or modify any project file. An existing helper that exports every imported name SHALL be reused. With --force, the installer SHALL replace the helper with the bundled copy.

#### Scenario: Version-1 helper is refused without --force

- **WHEN** the installer runs without --force against a project whose helper does not export getPrototypeFlowLayoutViewportSignature, whether or not .storybook/prototype-inspector/ already exists
- **THEN** it exits non-zero, prints getPrototypeFlowLayoutViewportSignature and the --force instruction, and every project file is unchanged

##### Example: refusal output for the 2026-06-22 helper

- **GIVEN** a project whose src/pages/prototypes/prototypeFlowLayout.ts exports the five other names preview.js imports but not getPrototypeFlowLayoutViewportSignature
- **WHEN** `node install_prototype_inspector.mjs --project-root <project>` runs
- **THEN** stderr contains "Existing flow layout helper <project>/src/pages/prototypes/prototypeFlowLayout.ts is missing exports required by the Prototype Inspector: getPrototypeFlowLayoutViewportSignature. Rerun with --force to replace it with the bundled helper." and the exit code is non-zero

#### Scenario: Version-1 helper is upgraded with --force

- **WHEN** the installer runs with --force against the same project
- **THEN** it exits zero and the project helper becomes byte-identical to storybook-product-prototype/assets/prototype-flow-layout/prototypeFlowLayout.ts

##### Example: forced upgrade output

- **GIVEN** the project from the refusal example
- **WHEN** `node install_prototype_inspector.mjs --project-root <project> --force` runs
- **THEN** it exits zero, prints "Installed flow layout helper: <project>/src/pages/prototypes/prototypeFlowLayout.ts", and the SHA-256 of that file equals the SHA-256 of storybook-product-prototype/assets/prototype-flow-layout/prototypeFlowLayout.ts

<!-- @trace
source: fix-inspector-runtime-drift
updated: 2026-10-05
code:
  - storybook-product-prototype/scripts/install_prototype_inspector.mjs
  - storybook-product-prototype/references/storybook-integration.md
  - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
  - storybook-product-prototype/SKILL.md
  - storybook-product-prototype/assets/prototype-inspector/preview.js
  - design-system-to-storybook/storybook-template/src/pages/prototypes/prototypeFlowLayout.ts
  - README.md
tests:
  - storybook-product-prototype/scripts/test_scaffold_validate.py
  - storybook-product-prototype/scripts/test_install_prototype_inspector.mjs
-->