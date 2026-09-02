## ADDED Requirements

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
