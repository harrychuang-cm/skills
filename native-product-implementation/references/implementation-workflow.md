# Native Implementation Workflow

Use this reference after the handoff docs are read and the native target is identified.

Read `native-architecture.md` first. Architecture resolution precedes project changes, dependency changes, generation, and production edits.

## Contents

1. Repo Discovery
2. Design-System Governance Gate
3. Token Consumption
4. DataSource Pattern
5. Navigation Semantics Mapping
6. Existing App Mode
7. Greenfield Mode
8. Approved Component Porting
9. Documentation Updates

## Repo Discovery

Inspect before editing. iOS:

- project and build config: `*.xcodeproj`, `*.xcworkspace`, `project.pbxproj`, build settings, schemes, `Info.plist`
- package manifests: `Package.swift`, `Package.resolved`, `Podfile` and `Podfile.lock` when CocoaPods is in use
- app structure: `@main` entry, scene/app delegates, feature folders, view directories
- navigation: `NavigationStack`/`NavigationSplitView` usage, routers, coordinators, or UIKit navigation controllers
- design tokens and theme: asset catalogs (`*.xcassets`), `Color`/`Font` extensions, theme or design-system Swift files
- localization: `*.strings`, `*.stringsdict`, String Catalogs (`*.xcstrings`)
- data patterns: existing clients, repositories, services, mocks, preview fixtures
- tests: XCTest targets, swift-testing usage, snapshot test setup, UI test targets

Android:

- build config: `settings.gradle(.kts)`, module `build.gradle(.kts)`, version catalogs (`gradle/libs.versions.toml`), `AndroidManifest.xml`
- app structure: `Application` class, activities, feature packages, Compose screen files
- navigation: `NavHost` setup, navigation graphs, route constants, Fragment navigation when present
- design tokens and theme: `MaterialTheme` setup, theme objects, `Color.kt`/`Type.kt`, resource values
- localization: `res/values*/strings.xml`
- data patterns: existing Retrofit/Ktor clients, repositories, DI modules, fakes
- tests: JUnit, Compose UI tests, Robolectric, screenshot test setup

Record discoveries with file-level evidence in the working notes and the final report.

## Design-System Governance Gate

Before any UI implementation:

1. Apply `$design-system-governance` Phase 0 discovery against the native theme sources found above.
2. List existing tokens and shared UI components relevant to the handoff.
3. Attempt composition from existing shared components before creating new ones.
4. Stop and ask when a required token or shared component is missing.

Do not add hardcoded color, spacing, corner-radius, typography, or motion values, and do not put display text outside the platform's localization source.

## Token Consumption

`docs/TOKENS.json` (W3C DTCG) is the token source of truth when the handoff ships it. Never hand-transcribe values from prototype CSS while that export exists.

Output format by platform:

| Platform | Token output |
| --- | --- |
| SwiftUI | `Color`/`Font` extensions, or an asset-catalog-backed token enum when the app already keys colors through asset catalogs |
| Jetpack Compose | A Kotlin theme object or a `MaterialTheme` extension, following the module's existing theme structure |

Rules:

- Preserve the layered ref → sys → comp token names so governance discovery and later audits can match them across repos.
- Generate from the DTCG values — via Style Dictionary's native transforms or an equivalent codegen step — rather than retyping them.
- Port only the tokens the in-scope routes need, plus the ref tokens they resolve to; record excluded groups as deferred.
- When the app already has a token system, map handoff tokens onto it and record the naming translation; do not create a parallel second system.
- When no token source exists on either side, stop and ask before inventing values.

## DataSource Pattern

Real integration is never in scope for this skill. For every feature, create the named adapter seam:

- Entity, request, response, and error types generated from the `DATA_SPEC.md` JSON Schema blocks — `Codable` structs on iOS, `@Serializable` data classes on Android. Preserve the `default` / `loading` / `empty` / `error` state vocabulary and any documented disabled/permission branches.
- `<Feature>DataSource`: a Swift `protocol` or Kotlin `interface`, with one method per handoff fixture group.
- `Mock<Feature>DataSource`: the deterministic implementation, loading the handoff's `fixtures/<group>.json` — as a bundle resource on iOS, from `assets/` or test resources on Android. Copy the JSON files into the app's resources rather than duplicating their values in code.
- A clear replacement point: the injection site the data-integration owner swaps. Record the interface name, mock implementation path, and injection site in the implementation map's Data Adapter Seams table, and fill the handoff's `Adapter interface` column when updating handoff docs.

Do not invent endpoints. Do not add secrets, environment configuration, auth flows, or persistence; those belong to the named data-integration owner.

## Navigation Semantics Mapping

Implement each transition's `presentation` and `backBehavior` through the platform's native navigation:

| `presentation` | SwiftUI | Jetpack Compose |
| --- | --- | --- |
| `push` | `NavigationStack` path append | `navController.navigate(route)` |
| `modal` | Blocking modal presentation | Dialog destination or blocking modal route |
| `sheet` | `.sheet` | Bottom sheet (Material) or dialog destination |
| `fullscreen` | `.fullScreenCover` | Full-screen dialog destination |
| `replace` | Replace the path root | `navigate` with `popUpTo(...) { inclusive = true }` |

| `backBehavior` | SwiftUI | Jetpack Compose |
| --- | --- | --- |
| `pop` | Remove the last path element / `dismiss` in a pushed context | `navController.popBackStack()` |
| `popToRoot` | Clear the navigation path to the flow root | `popUpTo(startDestination)` |
| `dismiss` | Dismiss the sheet or cover | Dismiss the dialog or bottom sheet |
| `none` | No user-initiated back affordance | Intercept back; no user-initiated exit |

Rules:

- Register destinations by handoff route id so traceability survives into the code.
- Route `params` become destination arguments — associated values on a Swift route enum, typed nav arguments on Compose. `deepLink` patterns are registered where the platform supports them.
- A transition without `presentation` predates the field: implement `push` and record the assumption in the implementation map's divergence notes.
- `docs/flow.json` and the optional Swift/Kotlin skeletons from the prototype's `export_flow.py` are starting scaffolding, not finished code: adapt them to the app's existing router instead of introducing a second navigation system.

## Existing App Mode

1. Confirm the selected target has one consistent inherited architecture; ask only where evidence is ambiguous or conflicting.
2. Map handoff routes to existing screens, navigation destinations, tabs, or sheets using the platform column of the Production Navigation Map.
3. Reuse existing shared components and the module's established feature structure.
4. Add typed fixtures and mock DataSources next to the module's existing mock/fake pattern.
5. Add feature state using the app's established state and DI approach.
6. Add or update tests, previews/screenshot tests, and localization entries using the module's tools.
7. Run the narrowest meaningful verification first, then the broader build.

Avoid broad refactors unless the handoff cannot otherwise be satisfied.

## Greenfield Mode

1. Propose the complete native architecture decision record; confirm unresolved scaffold-affecting fields before creating anything.
2. Do not create a project, add dependencies, or generate app code before that confirmation.
3. Confirm the design-system source. When none exists, stop and ask; when tokens are approved, generate them from `docs/TOKENS.json`.
4. Set up theme, localization, navigation, component, fixture, and test structure before screens.
5. Build the first screen with typed contracts and mock DataSources.
6. Add documented branch states and transitions with their navigation semantics.
7. Build and run on simulator or emulator before reporting completion.

## Approved Component Porting

When the user approves creating a shared component that has a prototype counterpart:

1. Derive variants, props, and states from the reusable prototype source files listed in `PRODUCTION_HANDOFF.md` and from the prototype's stories args — not from free-text notes alone. Do not invent a variant that appears in no prototype source.
2. Implement only the variants and states the in-scope routes use; record the rest as deferred.
3. Rebuild the component with native conventions and bind it to native tokens. Do not translate web idioms — a CSS flex row becomes an `HStack` or `Row`, not a literal port; hover states have no native equivalent and become pressed/focused states or are dropped with a note.
4. Strip the Storybook-only boundaries the handoff lists; they must not ship.
5. Record the prototype-to-native component name mapping in the implementation map.

## Documentation Updates

When implementation changes or narrows the handoff:

- update the repo's implementation notes and the architecture record when an approved decision changes it
- record deferred handoff requirements and every platform divergence with its reason
- record new open decisions for product, design, data, API, auth, platform capability, or release ownership
- when route behavior, data shape, or branch states intentionally change, update the handoff docs and the Storybook regression story per the handoff's change rule
