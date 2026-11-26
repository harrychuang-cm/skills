## MODIFIED Requirements

### Requirement: Value shapes and verdicts

The tracer SHALL classify the authored value of the winning declaration and derive the verdict from the shape. A value that is exactly one `var()` reference without fallback SHALL be re-bindable. A space-separated shorthand in which every top-level component is either exactly one `var()` reference without fallback or a value containing no reference SHALL be re-bindable per reference, each reference addressed by its position among the references of the value.

A top-level component that contains no reference SHALL be a tokenizable literal — editable by replacing that component with a reference to an existing token — when all of the following hold: the value has no top-level comma or slash; the component is a color, a length, a percentage, a number, zero or a single font family, and is not a keyword; that kind is one the property of the row accepts; and at least one token the declaration is allowed to reference has a kind the property of the row accepts. A tokenizable literal SHALL be addressed by the position of its component among the top-level components of the value. A literal component that fails one of these conditions SHALL be read-only with a reason that names the failed condition: a keyword, a function or unrecognised value, a value with a top-level comma or slash, or no token of an accepted kind.

Every other shape — a reference inside a function, a reference with a fallback, a comma-separated list of references, a slash-separated radius — SHALL be read-only with a reason, and SHALL still show the chain of the first reference when it has one.

#### Scenario: Shapes

- **WHEN** a winning declaration is classified
- **THEN** the verdict follows the table below

##### Example: shape to verdict

| Authored value | Verdict |
| --- | --- |
| `var(--md-comp-x-color)` | re-bindable |
| `var(--a) var(--b)` on `padding` | block sides re-bindable at reference 0, inline sides at reference 1 |
| `var(--w) solid var(--c)` on `border` | width re-bindable at reference 0, color at reference 1, style read-only keyword |
| `0 0 var(--gap)` on `margin` | block-start side tokenizable at component 0, inline sides tokenizable at component 1, block-end side re-bindable at reference 0 |
| `12px` on `padding`, in a project that has length tokens | tokenizable at component 0, all four sides |
| `1px solid #000` on `border`, in a project that has length and color tokens | width tokenizable at component 0, color tokenizable at component 2, style read-only keyword |
| `70%` on `max-inline-size`, in a project that has length tokens and no percentage token | tokenizable at component 0 |
| `0.5` on `opacity`, in a project with no number and no percentage token | read-only: no token of a kind this property accepts |
| `calc(100% - 16px)` on `inline-size` | read-only: literal expression |
| `"Noto Sans", sans-serif` on `font-family` | read-only: literal list |
| `calc(var(--a) * 3)` | read-only: expression (chain of `--a` shown) |
| `var(--a, 4px)` | read-only: reference with fallback |
| `var(--a), var(--b), sans-serif` on `font-family` | read-only: list of references |
| `fit-content` | read-only: keyword |

#### Scenario: Ambiguity inside a rule blocks editing

- **WHEN** the rule of the winning declaration declares the same property twice, or a later declaration in the rule overrides the same side
- **THEN** the row is read-only and names the duplicate, whether its value is a reference or a literal

#### Scenario: A tokenized literal becomes an ordinary reference

- **WHEN** the literal of a row has been replaced by a token and the change has been applied
- **THEN** the next trace reports the row as re-bindable at that reference, with the token chain and the scopes of any other reference

### Requirement: Edit scopes

For every re-bindable row the tracer SHALL list the scopes at which the change can be made, each with the file and line it writes and the number of declarations and components it affects: the declaration itself, the component token it references, and the system token on its chain. The default scope SHALL be the component token when the declaration references a writable component token that is a single alias, and the declaration otherwise. The system-token scope SHALL be offered only when the binding marks the system tier writable. A scope whose target is shadowed, duplicated, not a single alias or in a file that cannot be written SHALL be listed as unavailable with its reason, and the tracer SHALL NOT silently fall back from it to another scope.

A row whose value is a tokenizable literal has no token chain, so the tracer SHALL list exactly one scope for it — the declaration — with the stylesheet and line it writes and an impact of one declaration in one component. That scope SHALL be the row's default, and SHALL be listed as unavailable with its reason when the stylesheet cannot be written.

#### Scenario: Scopes of a component-token-backed fill

- **WHEN** a fill row references a writable component token that aliases a system token, and the system tier is writable
- **THEN** the row lists three scopes — declaration, component token (default) and system token — each with its file, line and impact counts

#### Scenario: A broken default scope is not replaced silently

- **WHEN** the referenced component token is declared twice in its file
- **THEN** the component-token scope is listed as unavailable with the duplicate as the reason, and the row has no default scope

#### Scenario: A literal row has one scope

- **WHEN** a margin row is set by the literal `0` of `margin: 0` in a writable component stylesheet
- **THEN** the row lists one scope, the declaration, as its default, naming that stylesheet and the line of the declaration
