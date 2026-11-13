## MODIFIED Requirements

### Requirement: First-run report language selection

The design-system-extractor skill SHALL resolve the report language before Input Discovery. When `design-system/SESSION_STATE.md` contains no recognizable Report Language record, the skill MUST ask the user to choose a report language exactly once, offering these options in this order: English as the default recommended option, Traditional Chinese, Japanese, and a custom language named by the user. When the skill runs where no user is available to answer, it SHALL use English and record it. The skill SHALL NOT ask again in later sessions for the same package while a recognizable record exists.

#### Scenario: First extraction on a fresh package

- **WHEN** the skill starts extraction and `design-system/SESSION_STATE.md` has no Report Language record
- **THEN** the skill asks the user for the report language before Input Discovery, with English as the default option and Traditional Chinese, Japanese and a custom language as the other options

#### Scenario: Subsequent session reuses the recorded language

- **WHEN** the skill starts on a package whose `SESSION_STATE.md` contains `Report Language: zh-Hant (繁體中文)`
- **THEN** the skill writes all new report content in that language without asking again

#### Scenario: Missing or unrecognizable record is re-asked

- **WHEN** `SESSION_STATE.md` exists but its Report Language line is absent or unrecognizable
- **THEN** the skill treats the package as first-run, asks the user once, and records the answer

#### Scenario: A run with no user to answer uses English

- **WHEN** the skill starts on a package without a Report Language record in a run where no user is available to answer
- **THEN** the skill writes the report in English and records `Report Language: en (English)`


### Requirement: HTML docs default UI locale follows the report language

The `generate_docs_html.mjs` and `generate_review_html.mjs` scripts SHALL each accept an optional `--locale <zh-Hant|en|ja>` flag. Each script SHALL choose its default UI locale in this order: a supported flag value; otherwise the Report Language record in `design-system/SESSION_STATE.md`, mapped as Traditional or Simplified Chinese to `zh-Hant`, Japanese to `ja`, and English and every other language to `en`; otherwise `en`. The chosen locale SHALL drive both the statically rendered chrome labels and the embedded client default locale. When the flag value is unsupported, the script SHALL print a warning to stderr, choose the locale from the record or `en`, and exit successfully without aborting.

#### Scenario: Locale flag drives the generated docs

- **WHEN** `node scripts/generate_docs_html.mjs <target-root> --locale en` is run
- **THEN** the generated `index.html` renders English chrome labels and defaults to the English UI on first load without stored preferences

#### Scenario: Flag absent follows the recorded report language

- **WHEN** either script is run without `--locale` on a package whose `SESSION_STATE.md` records `Report Language: zh-Hant (繁體中文)`
- **THEN** the generated page defaults to the `zh-Hant` UI

#### Scenario: Flag absent and no record defaults to English

- **WHEN** either script is run without `--locale` on a package that has no Report Language record
- **THEN** the generated page defaults to the `en` UI

#### Scenario: Unsupported flag value falls back safely

- **WHEN** a script is run with `--locale ko` on a package that records `Report Language: ja (日本語)`
- **THEN** the script prints a warning to stderr, generates the page with the `ja` default, and exits successfully

##### Example: locale chosen from flag and record

| `--locale` flag | Report Language record | Default UI locale |
| --- | --- | --- |
| `en` | zh-Hant (繁體中文) | en |
| (absent) | zh-Hant (繁體中文) | zh-Hant |
| (absent) | zh-Hans (简体中文) | zh-Hant |
| (absent) | ja (日本語) | ja |
| (absent) | en (English) | en |
| (absent) | ko (한국어) | en |
| (absent) | (no record) | en |
| `ko` | ja (日本語) | ja |
| `ko` | (no record) | en |

## ADDED Requirements

### Requirement: The review page offers the same three UI locales

The review page SHALL render its interface in `zh-Hant`, `en` or `ja`, starting in the default UI locale chosen for the package, and SHALL let the reader switch among the three. The reader's choice SHALL persist in the browser. Text the AI wrote during extraction, such as suggestion reasons, rationales and similarity reasons, SHALL be shown as recorded and SHALL NOT be translated. The three locales SHALL define the same set of interface strings.

#### Scenario: Switching the review page language

- **WHEN** a reader switches the review page from English to Traditional Chinese
- **THEN** every interface label is shown in Traditional Chinese, the recorded reasons are unchanged, and the choice is still in effect after the page is reloaded

#### Scenario: No interface string is missing in a locale

- **WHEN** the review page's string tables for the three locales are compared
- **THEN** each locale defines exactly the same string keys
