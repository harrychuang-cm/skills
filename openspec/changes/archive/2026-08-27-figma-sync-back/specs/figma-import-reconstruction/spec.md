## ADDED Requirements

### Requirement: Shared story identity on import

The importer SHALL write shared plugin data under the "storybook" namespace on the identity node of every successful import: key "storyId" carrying the payload storyId, and key "generatedAt" carrying the payload generatedAt string. For component artifacts the identity node is the managed component section (the same node that carries the private storybookStoryId plugin data); for page artifacts the identity node is the imported root node. The shared identity SHALL be written on both newly created and reused identity nodes, so re-importing a story into a file created by an older plugin version backfills the shared identity without a separate migration. Existing private plugin data behavior MUST remain unchanged.

#### Scenario: component import exposes shared identity

- **WHEN** a component payload with storyId "components-button--primary" and generatedAt "2026-08-27T10:00:00.000Z" is imported
- **THEN** the managed component section carries shared plugin data storybook/storyId "components-button--primary" and storybook/generatedAt "2026-08-27T10:00:00.000Z" readable through the Figma shared plugin data API

#### Scenario: page import exposes shared identity

- **WHEN** a page payload (storyTitle beginning with "Pages/") is imported
- **THEN** the imported root node carries shared plugin data storybook/storyId and storybook/generatedAt matching the payload values

#### Scenario: re-import backfills legacy sections

- **WHEN** a story is re-imported into a file whose existing managed section carries only the private storybookStoryId plugin data and no shared identity
- **THEN** after the import completes the reused section carries the shared storybook/storyId and storybook/generatedAt values, and the private plugin data keys are still present

#### Scenario: generatedAt tracks the latest import

- **WHEN** the same story is imported twice from payloads with different generatedAt values
- **THEN** the identity node's shared storybook/generatedAt equals the generatedAt of the most recent import
