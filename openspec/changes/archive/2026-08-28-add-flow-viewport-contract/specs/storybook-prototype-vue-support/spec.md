## MODIFIED Requirements

### Requirement: Scaffold and validate smoke test

The skill SHALL provide a self-contained smoke test script runnable with python3 and no third-party dependencies. The script SHALL, for each of react and vue, scaffold a feature into a temporary directory with an explicit `--framework` value and immediately run the validator on the result, and SHALL extend the matrix with viewport rounds: --viewport desktop, --viewport tablet, and --viewport 1440x900 per framework. The script SHALL fail with a non-zero exit code when the scaffolded file set contains a file of the other framework's component format, when the validator's framework detection result is wrong, when missing-file errors occur, when the vue-round validator output is not equivalent to the react-round baseline for the same template state, when the no-flags round's output deviates from the phone-default baseline (flow viewport phone 375x812 defaults and the 720px shell wide cap), when a viewport round's generated flow does not declare the expected formFactor, width, and height, when a viewport round fails validation, or when the inspector runtime files (preview.js and prototype-inspector.css) differ between the skill asset copy and the storybook-template .storybook copy. On success it SHALL exit zero and print a per-round summary.

#### Scenario: Smoke test passes on both frameworks

- **WHEN** the smoke test script runs on a machine with python3 and the skill checked out
- **THEN** the react and vue rounds and every viewport round complete, and the script exits zero with a summary line per round

#### Scenario: Smoke test catches a broken overlay

- **WHEN** the vue overlay template set is missing one of its files
- **THEN** the smoke test exits non-zero and names the missing output file

#### Scenario: Viewport rounds verify declared values

- **WHEN** the --viewport 1440x900 round scaffolds a prototype
- **THEN** the smoke test asserts the generated flow declares formFactor desktop with width 1440 and height 900, and fails otherwise

#### Scenario: No-flags baseline guarded

- **WHEN** a template edit changes the no-flags scaffold output away from the phone-default baseline
- **THEN** the smoke test exits non-zero naming the deviating file
