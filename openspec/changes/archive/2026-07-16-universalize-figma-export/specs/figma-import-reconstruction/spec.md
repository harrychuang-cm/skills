## ADDED Requirements

### Requirement: Local Storybook bridge import

The plugin UI SHALL offer a "Load from Storybook" flow: a URL field defaulting to http://localhost:6006, a fetch action that lists stored payload summaries from the bridge's list endpoint, multi-select of entries, and an import action that fetches each selected payload and feeds it through the existing import-json message so the main-thread import pipeline stays unchanged. The plugin manifest SHALL declare networkAccess with devAllowedDomains covering http://localhost:* and http://127.0.0.1:*. Fetch or CORS failures SHALL surface an error message in the UI while the paste and file flows remain available.

#### Scenario: batch import from local bridge

- **WHEN** the user fetches the list from a running Storybook bridge, selects two entries, and triggers import
- **THEN** the plugin imports both payloads sequentially through the same pipeline as pasted JSON

#### Scenario: bridge unreachable

- **WHEN** the fetch action runs while no bridge is listening on the given URL
- **THEN** the UI shows a connection error and pasting JSON still imports normally
