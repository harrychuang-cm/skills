## ADDED Requirements

### Requirement: Native skill scope and inheritance

A new skill folder, native-product-implementation, SHALL implement production features for SwiftUI (Xcode/SPM) and Jetpack Compose (Gradle) targets from the same handoff document set that frontend-product-implementation consumes. Its SKILL.md SHALL declare that it inherits the shared handoff contracts by naming frontend-product-implementation: the document reading order, the Review Status gate, verbatim Scope consumption with per-target columns, the Consumed Manifest record, and the IMPLEMENTATION_MAP.md section contract. frontend-product-implementation SHALL remain web-scoped and SHALL NOT be generalized by this change.

#### Scenario: Native target with a confirmed handoff

- **WHEN** a confirmed handoff names an iOS SwiftUI production target and the native-product-implementation skill is invoked
- **THEN** the skill ingests the same docs with the same gates as the web pass would, and implements against the iOS columns of the handoff instead of asking the prototype to be rewritten

#### Scenario: Pending review status

- **WHEN** the handoff's Review Status is pending
- **THEN** the native pass stops and asks whether the team demo confirmation happened, identically to the web pass

### Requirement: Native architecture decision record

The native-architecture reference SHALL define a decision record with native vocabulary: target root (Xcode project/workspace, SPM package, or Gradle module), platform with minimum OS/SDK version policy, UI framework and its mixing boundary (SwiftUI/UIKit, Compose/Views), navigation framework, language version policy, dependency management, state/DI pattern, test frameworks, decision source, and confidence. The reference SHALL carry the same evidence priority, ask-versus-infer, and migration approval gate semantics as frontend-product-implementation's runtime-architecture reference: a clear existing project is inherited without re-asking, and a feature request never authorizes a re-platform.

#### Scenario: Existing Compose app

- **WHEN** the selected Gradle module shows Compose dependencies, a version catalog, and consistent Kotlin conventions
- **THEN** the record inherits that stack with evidence paths and implementation proceeds without asking the user to choose the UI framework again

#### Scenario: Requested framework change

- **WHEN** the handoff or user request implies moving a UIKit app to SwiftUI
- **THEN** the skill stops at the migration approval gate and asks for explicit approval before any dependency or structure change

### Requirement: Native repo discovery

The native implementation-workflow reference SHALL define repo discovery that recognizes native project artifacts before editing: Xcode project and workspace files, Package.swift, Info.plist and asset catalogs for iOS; settings.gradle and build.gradle (including .kts variants), AndroidManifest.xml, and version catalogs for Android; plus each platform's existing navigation, theme/token, DI, test, and resource conventions.

#### Scenario: Discovery on an Android repo

- **WHEN** the target root contains settings.gradle.kts and module build files
- **THEN** discovery records the module structure, Compose usage, theme sources, and test setup with file-level evidence before any implementation

### Requirement: Native token consumption

The native workflow SHALL source design tokens from the handoff's docs/TOKENS.json DTCG export when it exists, generating SwiftUI Color/Font extensions or an asset-catalog-backed token enum for iOS and a Kotlin theme object or MaterialTheme extension for Android, preserving layered token names. Hand-transcribing token values from prototype CSS while a DTCG export exists SHALL NOT happen. When no token source exists, the skill SHALL stop and ask, mirroring the token-bootstrap gate.

#### Scenario: DTCG export present

- **WHEN** the handoff ships docs/TOKENS.json and the target is SwiftUI
- **THEN** tokens are generated from the DTCG values into Swift extensions or an asset catalog, and the implementation notes record the source path

### Requirement: Native data source pattern

The native workflow SHALL implement the adapter seam as a Swift protocol or Kotlin interface named after the feature with the DataSource suffix, plus a Mock implementation prefixed Mock that loads the handoff's fixtures/*.json (bundle resource on iOS, assets or test resources on Android), with one method per fixture group, entity types generated from the DATA_SPEC JSON Schema (Codable / kotlinx.serialization), and the default/loading/empty/error state vocabulary preserved. Real wiring stays out of scope and transfers to the data integration owner, identically to the web pass.

#### Scenario: Mock-backed assembly on iOS

- **WHEN** the native pass implements a feature whose handoff ships fixtures/alertsRoutes.json
- **THEN** an AlertsDataSource protocol and MockAlertsDataSource loading that JSON from the bundle exist, and no real API client is written

### Requirement: Navigation semantics mapping

The native workflow SHALL map flow transition semantics to platform navigation: presentation push to stack navigation, modal to a blocking overlay, sheet to a partial overlay, fullscreen to a full-screen cover, replace to a root swap; backBehavior pop to one-step back, popToRoot to clearing to the flow root, dismiss to closing the overlay, none to offering no user-initiated back. A transition without a presentation value SHALL be implemented as push and recorded as a divergence note.

#### Scenario: Sheet transition on both platforms

- **WHEN** a transition declares presentation sheet and backBehavior dismiss
- **THEN** iOS implements it with a sheet presentation dismissed by the standard gesture, and Android implements it as a bottom sheet or dialog dismissed on back, both recorded against the same transition trigger

##### Example: presentation mapping

| presentation | iOS (SwiftUI) | Android (Compose) |
| ------------ | ------------- | ----------------- |
| push | NavigationStack push | NavHost navigate |
| sheet | .sheet | bottom sheet / dialog |
| fullscreen | .fullScreenCover | full-screen dialog |
| replace | path root swap | popUpTo inclusive + navigate |

### Requirement: Native verification chain

The native verification-reporting reference SHALL define the verification order per platform — iOS: xcodebuild build, xcodebuild test or swift test, swiftlint when available, simulator smoke; Android: gradlew assembleDebug, gradlew test, gradlew lint, detekt when available, emulator smoke — with unavailable commands named instead of silently skipped. It SHALL require the same IMPLEMENTATION_MAP.md sections as the web pass, audited by running frontend-product-implementation's scripts/validate_implementation.py against the native repo root; when that sibling skill is not installed, the audit degrades to a manual checklist recorded in the final report.

#### Scenario: Android completion audit

- **WHEN** the native pass finishes a Compose feature and writes IMPLEMENTATION_MAP.md
- **THEN** gradle build and test results are reported, and validate_implementation.py runs with the Gradle module root as --repo, passing before completion is claimed
