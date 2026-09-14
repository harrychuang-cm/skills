---
name: ds-governance
description: "Apply a project's design-system rules when implementing or reviewing UI, tokens, shared components, or screen composition. Discover and reuse the target's tokens, themes, components, motion and localization; resolve missing-token and shared-component decisions before affected changes. Supports web and native apps without prescribing a framework or visual style."
---

# Design System Governance

Keep UI changes consistent with the selected project's design system. This skill governs the requested work; the calling implementation skill still owns delivery. For a review-only request, report findings without changing files.

## Loading And Scope

- The maintained source is `ds-governance/` in the cm-skills repository. Use the explicitly selected checkout when the user supplies one; otherwise resolve `ds-governance` through the host's skill catalog or a sibling skill folder. Record the resolved source when multiple copies exist.
- In any agent, reading this `SKILL.md` directly is sufficient. Resolve [principles.md](principles.md) relative to this file, not the product working directory. Read that reference only when a visual decision needs rationale.
- The workflow uses ordinary repository reads, edits, checks, and user communication. No vendor-specific question tool, MCP connection, browser integration, Storybook installation, or other skill is a prerequisite. Use tools the host actually exposes; report unavailable checks.
- Follow the user's task scope and existing project conventions. Carry forward explicit authorization for the same token/component changes; ask only about unresolved choices. A general feature request alone does not authorize a new shared API, token system, or design-system migration.

## Phase 0: Discover Project Conventions (Always First)

Before UI implementation, identify the exact target package/module and inspect its dependencies so a shared library outside the app folder is included. Reuse current discovery evidence already gathered by the calling skill; refresh only when the target or relevant source changed.

| Convention | Evidence to inspect | Record |
| --- | --- | --- |
| Tokens and themes | Token files, theme providers/config, CSS/SCSS, typed theme objects, native resources and packages | Naming, actual layers, aliases, modes, source files, and how components consume them |
| Shared components | Package exports, workspace/Gradle/SPM dependencies, UI modules, component catalogs and previews | Existing components, APIs, variants/states, and evidence paths |
| Layout and type | App shell, layout primitives, grid utilities, typography and adaptive-layout conventions | Applicable sizing units, responsive behavior, text scaling and content constraints |
| Motion | Theme/animation definitions and their call sites | Duration/curve sources, feedback patterns and reduce-motion behavior |
| Localization | Locale modules, string catalogs, resource bundles and existing text lookup APIs | Source and formatting convention, or a documented absence |
| Design and verification | Supplied design/spec, project design guidance, stories/previews, snapshots, tests and runtime tooling | Reference authority, required states and checks that can actually run |

Keep findings concise with file-level evidence in the calling skill's implementation map or existing notes. Do not create a second competing report. Mark a convention absent, unknown, or not applicable instead of inventing it. If conflicting sources would change the UI or shared design contract, present the conflict and resolve it before the affected edit.

## Mandatory Workflow

1. Map the requested UI to existing tokens and component APIs before writing it. Search beyond a matching name: check behavior, variants, states and accessibility.
2. Prefer direct reuse, then composition. Feature-local layout, state wiring, and helpers that compose existing primitives are allowed; they do not by themselves create a new shared component. Do not duplicate a shared primitive under a local name to bypass its contract.
3. Resolve the Token Gate and Composition Gate below for missing design-system capabilities. Record whether a change is reused, composed, extended, created, or deferred when the calling workflow requires a Component Reuse Map.
4. Implement the approved scope using the target's native conventions. Preserve source token relationships and map roles to the existing theme rather than creating a parallel token system.
5. Verify the affected states with the project's available stories, native previews, tests, or runtime. Record actual results and any unverified behavior; writing a preview or test does not prove it ran.

## Blocking Decision Gates

A gate blocks only the affected mutation. Continue independent reads, mapping and verification when useful. First check the current request and earlier session decisions for authorization covering the exact change. Record and use that decision instead of requesting it again; unrelated or broader changes still need their own scope decision.

### Token Gate

Trigger when a required visual role has no suitable token/theme value under the project's actual layering, or when the target has no token system. An absent component layer is not itself a failure in a two-layer theme.

- Identify the missing role and the evidence searched. Present the smallest proposed addition, an existing alternative with its tradeoff, or an explicit deferral.
- If establishing tokens is authorized, use supplied token/design evidence and the calling workflow's bootstrap procedure when available. Keep literal values in token definitions; do not invent values inside UI components.
- If establishing tokens is declined, record the decision and the affected scope. Use an existing approved source or defer that surface unless the user explicitly authorizes a documented exception. Do not silently substitute arbitrary styling.

### Composition Gate

Trigger when existing shared components and composition cannot meet the required behavior, or a shared component needs a new public variant/API.

- Show the unmet requirement, reuse attempts, and proposed shared addition or extension before asking for unresolved approval.
- Reuse approval from the current task, including an approved component work list, only for the named components and changes. Do not rebuild the library or expand its API as a side effect.
- A small feature-local composition of existing components does not need separate approval merely because it is extracted into a function, view, or composable.

### Ask Templates

These Traditional Chinese prompts are examples for unresolved decisions, not tool commands or machine triggers. Use the user's language and the actual layer names; include the concrete missing role/component and proposal. Do not ask again when the decision is already authorized.

- Missing token: `找不到對應的 design token（sys/comp 層）。是否要先建立這組 token，再繼續元件開發？`
- Missing component: `目前既有元件無法完整組裝此組件。是否要先建立新的共用子元件，再繼續？`

## Token Layer Rules

Discover the existing dependency graph before applying these roles. Preserve the project's prefixes and output format. A system with primitive → semantic layers, native theme roles, or a documented alternative does not need a migration to use this skill. When an approved new system needs a layering proposal, ref → sys → comp is an available model; establish only the layers the scope needs.

| Role | Meaning | Naming and references when this layer exists |
| --- | --- | --- |
| ref / primitive | Raw palette, scale and reusable base values | Name the value or scale; do not hide component or screen semantics in primitives |
| sys / semantic | Shared roles such as text, surfaces, spacing or actions | Name reusable roles; resolve through the source primitives according to the existing graph |
| comp / component | Slots for a specific component or region | Component names belong here; in a ref → sys → comp system, reference sys rather than bypassing it to ref |

- Reuse equivalent roles through their public theme/token API. Do not create aliases solely to impose this skill's vocabulary.
- Preserve the dependency closure when porting a subset and document source-to-target name translations. Resolve every referenced alias and required theme mode; flag missing values instead of guessing them.
- Reuse governed values for color, typography, spacing, radius, elevation and motion. Literal values belong in approved token definitions or documented exceptions. Structural values and platform constants follow the project's conventions; do not manufacture tokens for every `0`, `100%`, layout weight or enum.
- Pair foreground and background roles using the project's naming (`on-*` is one convention) and verify the actual pairing in applicable modes. A correctly named token alone does not prove contrast.

## Platform And Verification Adaptation

Apply the discovered runtime's conventions; these are examples for routing, not requirements to replace an existing framework.

| Concern | Web examples | Native examples |
| --- | --- | --- |
| Components and tokens | Package exports, CSS variables, utility themes, CSS-in-JS, Vue/Svelte/Angular/React components | Swift packages, asset catalogs, SwiftUI styles, Compose theme extensions and Gradle UI modules |
| Layout | Existing grid/flex/layout components and container/viewport rules | Safe areas/window insets, size classes, window size classes and native layout primitives |
| Motion | Existing CSS or animation-library tokens | SwiftUI Animation and Compose AnimationSpec from the theme |
| Text | Existing i18n lookup and formatting helpers | strings/xcstrings/resource bundles or Android string resources |
| State evidence | Existing Storybook stories, component tests, snapshots or browser walkthroughs | SwiftUI #Preview / Compose @Preview, snapshot/UI tests and simulator/emulator/device walkthroughs |

- Cover relevant default, loading, error, empty, selected, disabled and interaction states from the contract. Hover applies only to pointer-capable targets; touch uses pressed feedback, and focus follows keyboard/assistive-input support. Do not demand an unsupported state.
- Preserve semantic roles, accessible names, focus/navigation order, text scaling and reduce-motion behavior. Validate foreground/background contrast against the project's accessibility target in actual themes; report gaps rather than treating source review as runtime proof.
- Use existing motion only where it communicates behavior. Do not add stagger, floating, pulsing or forced delays to satisfy this skill. Use the project's curves and timing when motion is in scope.
- Follow the established localization source for new display text. If none exists, reuse an existing decision or ask whether to establish one; if declined, follow the calling workflow's documented exception/defer policy. With no such policy, record explicitly authorized in-place text as a divergence. Do not introduce a catalog migration during a copy change.
- Update existing stories/previews for changed shared components and composition states. If no catalog exists, use the project's other verification surfaces; installing Storybook, a simulator or an addon is a separate scope decision.

## Output Contract

In the existing task report or implementation map, record:

- Discovery sources and reused tokens/components with evidence paths.
- Additions/extensions, their necessity and the decision that authorized them.
- Applicable states and themes checked, commands/results, and checks that could not run.
- Intentional platform adaptations, approved exceptions, deferred surfaces and unresolved decisions.

Keep the report proportional to the change. For review-only work, provide the findings and proposed decisions without claiming fixes.
