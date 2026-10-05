#!/usr/bin/env python3
"""Smoke test: scaffold a prototype per framework and validate the result.

Runs scaffold_prototype.py with an explicit --framework value for react and
vue, then runs validate_prototype.py on each produced folder, and repeats the
matrix with viewport rounds (--viewport desktop, --viewport tablet,
--viewport 1440x900). Fails when a round produces files of the other
framework's component format, when expected output files are missing, when
the validator misclassifies a folder, when missing-file errors occur, when
the vue round's validator output is not equivalent to the react round's
baseline, when the no-flags round deviates from the phone-default baseline
(flow viewport phone 375x812, meta surface web, 720px shell wide cap), when a
viewport round's generated flow does not declare the expected formFactor and
dimensions or fails validation, when the half-converted fixture does not trip
its warning, when flow.json viewport emission is wrong (present for a
declaring flow, absent for a legacy one), when the inspector runtime mirror
drifts: a file under assets/prototype-inspector/ (walked, .DS_Store
ignored), the flow layout helper or the review fingerprint differs from its
design-system-to-storybook storybook-template copy or exists on one side
only, or when an inspector module imports something an installed project
cannot load.

The import surface check reads the static import declarations of every
JavaScript module under assets/prototype-inspector/: `import ... from "x"`
(brace lists may span lines) and `import "x"`, at the start of a line or
right after ";". import.meta and dynamic import() are not declarations; any
other import statement the pattern cannot read fails instead of being
skipped. Relative specifiers must resolve, from the installed
.storybook/prototype-inspector/, to a file in that folder or to the flow
layout helper (src/pages/prototypes/prototypeFlowLayout.ts) or the review
fingerprint (scripts/prototype-review/fingerprint.mjs) the installer
places. Each name imported from those two must be exported, as
`export function|const|let|type|interface <name>` or `export default`, by
the skill asset copy and the storybook-template copy, or by the asset copy
alone with a printed notice when the template tree is absent. Bare
specifiers are limited to react, storybook/* and @storybook/*, so the
runtime adds no dependency; node: built-ins are allowed only in preset.js,
which Storybook loads in Node. Re-exports (`export ... from "x"`) are not
supported: one in an inspector module is not read as an import, and a
helper name exported only through an export list or a re-export reads as
missing. The scan is lexical, so an import keyword at statement start
inside a block comment, a string or a template literal reads as a
declaration.

Self-tests on temporary trees then prove that the mirror comparison names
each kind of drift and the import check names each kind of violation.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
FEATURE_NAME = "Portfolio Alerts"
PROTOTYPE_DIR_NAME = "portfolio-alerts-prototype"

EXPECTED_SHARED_FILES = [
    "docs/ACCEPTANCE.md",
    "docs/DATA_SPEC.md",
    "docs/FLOW_SPEC.md",
    "docs/IMPLEMENTATION_GUIDE.md",
    "docs/PRD.md",
    "docs/PRODUCTION_HANDOFF.md",
    "docs/UI_SPEC.md",
    "fixtures/portfolioAlertsPrototypeRoutes.json",
    "index.ts",
    "portfolio-alerts-prototype.css",
    "portfolioAlertsPrototypeData.ts",
    "portfolioAlertsPrototypeFlow.ts",
    "portfolioAlertsPrototypeMeta.ts",
]

EXPECTED_FRAMEWORK_FILES = {
    "react": [
        "PortfolioAlertsPrototype.tsx",
        "PortfolioAlertsPrototype.stories.tsx",
        "PortfolioAlertsPrototypeFlowExport.tsx",
        "PortfolioAlertsPrototypeFlowExport.stories.tsx",
    ],
    "vue": [
        "PortfolioAlertsPrototype.vue",
        "PortfolioAlertsPrototype.stories.ts",
        "PortfolioAlertsPrototypeFlowExport.vue",
        "PortfolioAlertsPrototypeFlowExport.stories.ts",
    ],
}

FORBIDDEN_COMPONENT_SUFFIX = {"react": ".vue", "vue": ".tsx"}
FRAMEWORK_WORDING = {"react": "*Prototype.tsx", "vue": "*Prototype.vue"}

FLOW_FILE_NAME = "portfolioAlertsPrototypeFlow.ts"
META_FILE_NAME = "portfolioAlertsPrototypeMeta.ts"
CSS_FILE_NAME = "portfolio-alerts-prototype.css"

# (round key, extra scaffold args, expected formFactor/width/height)
VIEWPORT_ROUNDS = [
    ("desktop", ["--viewport", "desktop"], ("desktop", 1280, 800)),
    ("tablet", ["--viewport", "tablet"], ("tablet", 768, 1024)),
    ("custom-1440x900", ["--viewport", "1440x900"], ("desktop", 1440, 900)),
]

# Inspector runtime mirror. Both inspector folders are walked, so a new
# Inspector module needs no update here; the flow layout helper and the
# review fingerprint live outside the folder and are compared as pairs of
# (skill-root relative, storybook-template-root relative) paths.
STORYBOOK_TEMPLATE_ROOT = (
    SCRIPTS_DIR.parent.parent / "design-system-to-storybook" / "storybook-template"
)
INSPECTOR_ASSET_DIR = Path("assets/prototype-inspector")
INSPECTOR_TEMPLATE_DIR = Path(".storybook/prototype-inspector")
INSPECTOR_PAIRED_COPIES = (
    (
        Path("assets/prototype-flow-layout/prototypeFlowLayout.ts"),
        Path("src/pages/prototypes/prototypeFlowLayout.ts"),
    ),
    (
        Path("assets/prototype-review/fingerprint.mjs"),
        Path("scripts/prototype-review/fingerprint.mjs"),
    ),
)

# Inspector import surface. Specifiers resolve as installed under
# <project>/.storybook/prototype-inspector/ (INSPECTOR_TEMPLATE_DIR). The
# storybook-template is itself such a project, so the template side of each
# INSPECTOR_PAIRED_COPIES pair is also where install_prototype_inspector.mjs
# places that file. Bare specifiers stay within packages every React
# Storybook project already has; preset.js, which Storybook loads in Node,
# may also import node: built-ins.
INSPECTOR_MODULE_SUFFIXES = (".js", ".mjs", ".cjs", ".jsx")
INSPECTOR_ALLOWED_PACKAGES = ("react", "storybook/*", "@storybook/*")
INSPECTOR_NODE_MODULE = "preset.js"
# Tried for a relative specifier: the exact path, then Vite's default
# resolve.extensions.
INSPECTOR_RESOLVE_SUFFIXES = ("", ".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json")


def run_round(framework: str, base_dir: Path) -> tuple[list[str], int, str]:
    failures: list[str] = []
    target_root = base_dir / framework / "src" / "pages" / "prototypes"
    target_root.mkdir(parents=True)

    scaffold = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "scaffold_prototype.py"),
            FEATURE_NAME,
            "--target-root",
            str(target_root),
            "--framework",
            framework,
        ],
        capture_output=True,
        text=True,
    )
    if scaffold.returncode != 0:
        failures.append(
            f"{framework}: scaffold failed with exit {scaffold.returncode}: "
            f"{scaffold.stderr.strip() or scaffold.stdout.strip()}"
        )
        return failures, -1, ""
    if f"framework: {framework}" not in scaffold.stdout:
        failures.append(
            f"{framework}: scaffold did not report 'framework: {framework}' on stdout"
        )

    prototype_dir = target_root / PROTOTYPE_DIR_NAME
    for relative in EXPECTED_SHARED_FILES + EXPECTED_FRAMEWORK_FILES[framework]:
        if not (prototype_dir / relative).is_file():
            failures.append(f"{framework}: missing expected output file {relative}")
    forbidden = sorted(
        path.name
        for path in prototype_dir.rglob(f"*{FORBIDDEN_COMPONENT_SUFFIX[framework]}")
    )
    if forbidden:
        failures.append(
            f"{framework}: found other-framework files in output: {', '.join(forbidden)}"
        )

    validate = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "validate_prototype.py"),
            str(prototype_dir),
        ],
        capture_output=True,
        text=True,
    )
    output = validate.stdout + validate.stderr

    other_framework = "vue" if framework == "react" else "react"
    if FRAMEWORK_WORDING[other_framework] in output:
        failures.append(
            f"{framework}: validator output uses {other_framework} wording — "
            "framework detection is wrong"
        )
    for line in output.splitlines():
        if line.startswith("- missing ") and line.endswith(" file"):
            failures.append(f"{framework}: validator reported: {line[2:]}")

    export = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "export_prototype_contracts.py"),
            str(prototype_dir),
        ],
        capture_output=True,
        text=True,
    )
    if export.returncode != 0:
        failures.append(
            f"{framework}: export_prototype_contracts.py failed with exit "
            f"{export.returncode}: {export.stderr.strip() or export.stdout.strip()}"
        )
    elif not (prototype_dir / "docs" / "TOKENS.json").is_file():
        failures.append(f"{framework}: export did not write docs/TOKENS.json")

    return failures, validate.returncode, output


def check_phone_baseline(prototype_dir: Path, round_label: str) -> list[str]:
    """The no-flags round must keep the phone-default template state."""
    failures: list[str] = []
    flow_text = (prototype_dir / FLOW_FILE_NAME).read_text()
    for needle in ('formFactor: "phone"', "width: 375", "height: 812"):
        if needle not in flow_text:
            failures.append(
                f"{round_label}: no-flags flow deviates from the phone baseline "
                f"— missing {needle!r} in {FLOW_FILE_NAME}"
            )
    meta_text = (prototype_dir / META_FILE_NAME).read_text()
    if 'target: "web"' not in meta_text:
        failures.append(
            f"{round_label}: no-flags meta does not declare surface target web "
            f"in {META_FILE_NAME}"
        )
    css_text = (prototype_dir / CSS_FILE_NAME).read_text()
    for needle in ("375px", "812px", "min(100%, 720px)"):
        if needle not in css_text:
            failures.append(
                f"{round_label}: no-flags stylesheet deviates from the phone "
                f"baseline — missing {needle!r} in {CSS_FILE_NAME}"
            )
    return failures


def run_viewport_round(
    framework: str,
    base_dir: Path,
    round_key: str,
    extra_args: list[str],
    expected: tuple[str, int, int],
) -> list[str]:
    """Scaffold with a viewport flag, assert declared values, validate clean."""
    failures: list[str] = []
    label = f"{framework}/{round_key}"
    form_factor, width, height = expected
    target_root = base_dir / framework / round_key / "src" / "pages" / "prototypes"
    target_root.mkdir(parents=True)

    scaffold = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "scaffold_prototype.py"),
            FEATURE_NAME,
            "--target-root",
            str(target_root),
            "--framework",
            framework,
            *extra_args,
        ],
        capture_output=True,
        text=True,
    )
    if scaffold.returncode != 0:
        failures.append(
            f"{label}: scaffold failed with exit {scaffold.returncode}: "
            f"{scaffold.stderr.strip() or scaffold.stdout.strip()}"
        )
        return failures
    if f"viewport: {form_factor} {width}x{height}" not in scaffold.stdout:
        failures.append(
            f"{label}: scaffold summary did not report "
            f"'viewport: {form_factor} {width}x{height}'"
        )

    prototype_dir = target_root / PROTOTYPE_DIR_NAME
    flow_text = (prototype_dir / FLOW_FILE_NAME).read_text()
    for needle in (
        f'formFactor: "{form_factor}"',
        f"width: {width}",
        f"height: {height}",
    ):
        if needle not in flow_text:
            failures.append(
                f"{label}: generated flow does not declare {needle!r}"
            )

    validate = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "validate_prototype.py"),
            str(prototype_dir),
        ],
        capture_output=True,
        text=True,
    )
    if validate.returncode != 0:
        failures.append(
            f"{label}: validator failed with exit {validate.returncode}: "
            f"{validate.stdout.strip()}"
        )
    return failures


def check_viewport_contracts() -> list[str]:
    """flow.json viewport emission and the half-converted warning."""
    import json
    import re

    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="viewport-contract-") as temp_dir:
        base = Path(temp_dir)
        target_root = base / "src" / "pages" / "prototypes"
        target_root.mkdir(parents=True)
        scaffold = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS_DIR / "scaffold_prototype.py"),
                FEATURE_NAME,
                "--target-root",
                str(target_root),
                "--framework",
                "react",
                "--viewport",
                "desktop",
            ],
            capture_output=True,
            text=True,
        )
        if scaffold.returncode != 0:
            failures.append(
                f"viewport contracts: desktop scaffold failed: "
                f"{scaffold.stderr.strip() or scaffold.stdout.strip()}"
            )
            return failures
        prototype_dir = target_root / PROTOTYPE_DIR_NAME

        export = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS_DIR / "export_flow.py"),
                str(prototype_dir),
            ],
            capture_output=True,
            text=True,
        )
        if export.returncode != 0:
            failures.append("viewport contracts: export_flow.py failed on desktop scaffold")
            return failures
        document = json.loads((prototype_dir / "docs" / "flow.json").read_text())
        if document.get("viewport") != {
            "formFactor": "desktop",
            "width": 1280,
            "height": 800,
        }:
            failures.append(
                "viewport contracts: desktop flow.json viewport is "
                f"{document.get('viewport')!r}, expected desktop 1280x800"
            )
        if document.get("flowSchemaVersion") != 1:
            failures.append("viewport contracts: flowSchemaVersion changed from 1")

        # Half-converted: the flow declares a viewport but the Static Flow
        # export never reads Flow.viewport → warning names the state.
        export_file = prototype_dir / "PortfolioAlertsPrototypeFlowExport.tsx"
        original_export = export_file.read_text()
        export_file.write_text(
            re.sub(r"\w+Flow\.viewport", "({}).legacyRead", original_export)
        )
        validate = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS_DIR / "validate_prototype.py"),
                str(prototype_dir),
            ],
            capture_output=True,
            text=True,
        )
        if "never reads Flow.viewport" not in validate.stdout:
            failures.append(
                "viewport contracts: half-converted fixture did not trip the "
                "'never reads Flow.viewport' warning"
            )
        export_file.write_text(original_export)

        # Legacy flow (no viewport declaration) → flow.json omits the key at
        # every level.
        flow_file = prototype_dir / FLOW_FILE_NAME
        flow_text = flow_file.read_text()
        flow_text = re.sub(
            r"export const \w+Viewport = \{[^}]*\} satisfies \w+Viewport;\n\n",
            "",
            flow_text,
        )
        flow_text = re.sub(r"\n  viewport: \w+Viewport,", "", flow_text)
        flow_file.write_text(flow_text)
        export = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS_DIR / "export_flow.py"),
                str(prototype_dir),
            ],
            capture_output=True,
            text=True,
        )
        if export.returncode != 0:
            failures.append("viewport contracts: export_flow.py failed on legacy fixture")
        else:
            raw = (prototype_dir / "docs" / "flow.json").read_text()
            if "viewport" in raw:
                failures.append(
                    "viewport contracts: legacy flow.json still contains a "
                    "viewport key"
                )
    return failures


def list_inspector_files(folder: Path) -> dict[str, Path]:
    """Every file under folder, keyed by its POSIX path relative to folder.

    .DS_Store is Finder metadata rather than runtime, so it never counts as
    drift.
    """
    if not folder.is_dir():
        return {}
    return {
        path.relative_to(folder).as_posix(): path
        for path in folder.rglob("*")
        if path.is_file() and path.name != ".DS_Store"
    }


def compare_inspector_mirror(skill_root: Path, template_root: Path) -> list[str]:
    """Name every inspector runtime file that differs or exists on one side.

    Folder files are named by their path inside the inspector folder; paired
    copies by their file name, followed by both locations.
    """
    asset_files = list_inspector_files(skill_root / INSPECTOR_ASSET_DIR)
    template_files = list_inspector_files(template_root / INSPECTOR_TEMPLATE_DIR)
    copies = [
        (name, asset_files.get(name), template_files.get(name), "")
        for name in sorted(asset_files.keys() | template_files.keys())
    ]
    for asset_relative, template_relative in INSPECTOR_PAIRED_COPIES:
        asset_path = skill_root / asset_relative
        template_path = template_root / template_relative
        copies.append(
            (
                asset_relative.name,
                asset_path if asset_path.is_file() else None,
                template_path if template_path.is_file() else None,
                f" ({asset_relative.as_posix()} vs "
                f"storybook-template/{template_relative.as_posix()})",
            )
        )

    failures: list[str] = []
    for name, asset_path, template_path, locations in copies:
        if asset_path is None and template_path is None:
            status = "missing from both copies"
        elif template_path is None:
            status = "only in skill asset"
        elif asset_path is None:
            status = "only in storybook-template"
        elif asset_path.read_bytes() != template_path.read_bytes():
            status = "differs"
        else:
            continue
        failures.append(f"inspector mirror: {name} {status}{locations}")
    return failures


def check_inspector_mirror_self_test() -> list[str]:
    """The mirror comparison has to name each kind of drift it guards against.

    Breaks temporary copies one way at a time and restores them. The skill
    side is written from the fixture below and the template side is copied
    from it, so nothing in the real trees (a missing or empty file, drift, a
    module that happens to share a planted name) can crash or skew this test.
    """
    import shutil

    (helper_asset, helper_template), (fingerprint_asset, fingerprint_template) = (
        INSPECTOR_PAIRED_COPIES
    )
    # The real regression: the template helper stayed at schema version 1
    # after the skill asset helper moved to version 2.
    current_helper = b"export const prototypeFlowLayoutSchemaVersion = 2;\n"
    stale_helper = b"export const prototypeFlowLayoutSchemaVersion = 1;\n"
    skill_fixture = {
        INSPECTOR_ASSET_DIR / "preview.js": b'import "./prototype-inspector.css";\n',
        INSPECTOR_ASSET_DIR / "prototype-inspector.css": b".prototype-inspector {}\n",
        INSPECTOR_ASSET_DIR / "panels" / "flow.js": b"export const flowPanel = {};\n",
        helper_asset: current_helper,
        fingerprint_asset: b"export function fingerprint() {}\n",
    }

    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="inspector-mirror-") as temp_dir:
        skill_root = Path(temp_dir) / "skill"
        template_root = Path(temp_dir) / "storybook-template"
        asset_dir = skill_root / INSPECTOR_ASSET_DIR
        template_dir = template_root / INSPECTOR_TEMPLATE_DIR
        for relative, content in skill_fixture.items():
            (skill_root / relative).parent.mkdir(parents=True, exist_ok=True)
            (skill_root / relative).write_bytes(content)
        shutil.copytree(asset_dir, template_dir)
        for asset_relative, template_relative in INSPECTOR_PAIRED_COPIES:
            template_copy = template_root / template_relative
            template_copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(skill_root / asset_relative, template_copy)

        def expect(label: str, *needles: str) -> None:
            reported = compare_inspector_mirror(skill_root, template_root)
            if needles:
                caught = len(reported) == 1 and all(
                    needle in reported[0] for needle in needles
                )
            else:
                caught = not reported
            if not caught:
                wanted = " + ".join(repr(needle) for needle in needles) or "no drift"
                failures.append(
                    f"inspector mirror self-test ({label}): expected {wanted}, "
                    f"got {reported}"
                )

        expect("identical copies")

        metadata = (template_dir / ".DS_Store", asset_dir / "panels" / ".DS_Store")
        for path in metadata:
            path.write_bytes(b"\x00\x00\x00\x01Bud1")
        expect(".DS_Store in one copy, top level and nested")
        for path in metadata:
            path.unlink()

        preview = template_dir / "preview.js"
        original = preview.read_bytes()
        preview.write_bytes(original + b"\n")
        expect("extra newline byte", "inspector mirror: preview.js differs")
        preview.write_bytes(original)

        stylesheet = template_dir / "prototype-inspector.css"
        original = stylesheet.read_bytes()
        stylesheet.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
        expect("one changed byte", "inspector mirror: prototype-inspector.css differs")
        stylesheet.write_bytes(original)

        new_module = asset_dir / "new-module.js"
        new_module.write_text("export {};\n")
        expect(
            "module only in the skill asset",
            "inspector mirror: new-module.js only in skill asset",
        )
        new_module.unlink()

        nested = template_dir / "panels" / "extra.js"
        nested.write_text("export {};\n")
        expect(
            "nested file only in the template",
            "inspector mirror: panels/extra.js only in storybook-template",
        )
        nested.unlink()

        helper = template_root / helper_template
        helper.write_bytes(stale_helper)
        expect(
            "version-1 template helper",
            "inspector mirror:",
            "prototypeFlowLayout.ts",
            "differs",
        )
        helper.write_bytes(current_helper)

        asset_helper = skill_root / helper_asset
        asset_helper.unlink()
        expect(
            "helper missing from the skill asset",
            "inspector mirror: prototypeFlowLayout.ts only in storybook-template",
        )
        asset_helper.write_bytes(current_helper)

        fingerprint = template_root / fingerprint_template
        asset_fingerprint = skill_root / fingerprint_asset
        original = fingerprint.read_bytes()
        fingerprint.unlink()
        expect(
            "fingerprint missing from the template",
            "inspector mirror: fingerprint.mjs only in skill asset",
        )
        asset_fingerprint.unlink()
        expect(
            "fingerprint missing from both copies",
            "inspector mirror: fingerprint.mjs missing from both copies",
        )
        asset_fingerprint.write_bytes(original)
        fingerprint.write_bytes(original)
    return failures


def check_inspector_copies() -> list[str]:
    """Inspector runtime mirror parity between the skill asset and the template.

    The real comparison runs first, then the self-test proves on temporary
    copies that the comparison still names each kind of drift, so a checker
    that stops seeing drift fails here instead of passing silently. A crash
    in the self-test becomes a failure line rather than aborting the smoke
    test and hiding the real comparison's lines.
    """
    failures: list[str] = []
    template_present = STORYBOOK_TEMPLATE_ROOT.is_dir()
    if template_present:
        failures.extend(
            compare_inspector_mirror(SCRIPTS_DIR.parent, STORYBOOK_TEMPLATE_ROOT)
        )
    else:
        # Standalone skill installs do not carry the storybook-template tree;
        # the parity check is only meaningful in the monorepo.
        print(
            "inspector mirror: storybook-template tree not present — skipping "
            "the mirror comparison"
        )
    try:
        failures.extend(check_inspector_mirror_self_test())
    except Exception as error:
        # Any crash: main() still has to print the comparison lines above.
        failures.append(
            f"inspector mirror self-test: crashed: {type(error).__name__}: {error}"
        )
    if template_present and not failures:
        runtime_files = list_inspector_files(SCRIPTS_DIR.parent / INSPECTOR_ASSET_DIR)
        print(
            f"inspector mirror: {len(runtime_files)} runtime files plus the flow "
            "layout helper and fingerprint are byte-identical between the skill "
            "asset and storybook-template (drift self-test passed)"
        )
    return failures


def parse_static_imports(
    source: str,
) -> tuple[list[tuple[str, list[str]]], list[tuple[int, str]]]:
    """Static import declarations of a JavaScript module.

    Returns (declarations, unreadable). Each declaration is (specifier,
    imported names): a default binding reads as the name "default", a
    namespace import carries no names, and a brace list may span lines and
    hold comments. Only the import keyword at statement start (the start of a
    line or right after ";") counts; import.meta, dynamic import() and an
    object key named import are not declarations. unreadable holds (line,
    text) for every other import keyword the pattern cannot read, so the
    caller fails it instead of skipping it.
    """
    import re

    identifier = r"[A-Za-z_$][\w$]*"
    keyword = re.compile(r"(?:^|;)[ \t]*(import)\b(?!\s*[.(:])", re.MULTILINE)
    declaration = re.compile(
        rf"""import\s*
        (?:
            (?:(?P<default>{identifier})\s*,\s*)?
            (?:\*\s*as\s+{identifier}\s+|\{{(?P<names>[^{{}}]*)\}}\s*)
            from\s*
          | (?P<default_only>{identifier})\s+from\s*
        )?
        (?P<quote>["'])(?P<specifier>[^"'\r\n]+)(?P=quote)""",
        re.VERBOSE,
    )
    named_item = re.compile(
        rf"""(?:(?P<name>{identifier})|(?P<quote>["'])(?P<text>[^"'\r\n]*)(?P=quote))"""
        rf"(?:\s+as\s+{identifier})?"
    )

    declarations: list[tuple[str, list[str]]] = []
    unreadable: list[tuple[int, str]] = []
    for keyword_match in keyword.finditer(source):
        start = keyword_match.start(1)
        found = declaration.match(source, start)
        names: list[str] = []
        if found and found.group("names") is not None:
            listed = re.sub(
                r"//[^\n]*|/\*.*?\*/", "", found.group("names"), flags=re.DOTALL
            )
            for item in filter(None, (part.strip() for part in listed.split(","))):
                item_match = named_item.fullmatch(item)
                if item_match is None:
                    found = None
                    break
                names.append(item_match.group("name") or item_match.group("text"))
        if found is None:
            line = source.count("\n", 0, start) + 1
            text = source[start : start + 120].split("\n", 1)[0].strip()
            unreadable.append((line, text))
            continue
        if found.group("default") or found.group("default_only"):
            names.insert(0, "default")
        declarations.append((found.group("specifier"), names))
    return declarations, unreadable


def read_export_names(source: str) -> set[str]:
    """Names a module exports, as the import surface check reads them.

    Recognises `export function|const|let|type|interface <name>` (async and
    generator functions included) and `export default` at the start of a
    line. Export lists and re-exports are not read, and an export inside a
    /* ... */ block comment does not count.
    """
    import re

    # Blank out block comments but keep their line breaks, so a commented-out
    # export does not count and every real export keeps its line start.
    source = re.sub(
        r"/\*.*?\*/",
        lambda comment: "\n" * comment.group(0).count("\n"),
        source,
        flags=re.DOTALL,
    )
    pattern = re.compile(
        r"^[ \t]*export\s+(?:(?P<default>default)\b|"
        r"(?:(?:async\s+)?function(?:\s*\*\s*|\s+)|(?:const|let|type|interface)\s+)"
        r"(?P<name>[A-Za-z_$][\w$]*))",
        re.MULTILINE,
    )
    return {
        "default" if match.group("default") else match.group("name")
        for match in pattern.finditer(source)
    }


def find_inspector_import_violations(
    skill_root: Path, template_root: Path | None
) -> list[str]:
    """Name every static import an installed Inspector could not load.

    Reads the modules in the skill asset folder and resolves their relative
    specifiers as installed under <project>/.storybook/prototype-inspector/.
    Names imported from the helper or the fingerprint are checked against the
    skill asset copy and, unless template_root is None (no storybook-template
    tree), the template copy. Names imported from files inside the folder
    are not checked.
    """
    import fnmatch
    import posixpath

    asset_files = list_inspector_files(skill_root / INSPECTOR_ASSET_DIR)
    modules = sorted(
        name for name in asset_files if name.endswith(INSPECTOR_MODULE_SUFFIXES)
    )
    if not modules:
        return [
            "inspector imports: no JavaScript modules found under "
            f"{INSPECTOR_ASSET_DIR.as_posix()}/"
        ]
    install_dir = INSPECTOR_TEMPLATE_DIR.as_posix()
    placed_copies = {
        template_relative.as_posix(): (asset_relative, template_relative)
        for asset_relative, template_relative in INSPECTOR_PAIRED_COPIES
    }
    export_names: dict[Path, set[str]] = {}

    def problems(module: str, specifier: str, names: list[str]) -> list[str]:
        if specifier.startswith("node:"):
            if module == INSPECTOR_NODE_MODULE:
                return []
            return [
                f"node: built-ins are allowed only in {INSPECTOR_NODE_MODULE}, "
                "which Storybook loads in Node"
            ]
        if not (specifier in (".", "..") or specifier.startswith(("./", "../"))):
            if any(
                fnmatch.fnmatchcase(specifier, pattern)
                for pattern in INSPECTOR_ALLOWED_PACKAGES
            ):
                return []
            parts = specifier.split("/")
            package = "/".join(parts[:2] if specifier.startswith("@") else parts[:1])
            return [
                f"package {package or specifier} is not allowed; bare imports are "
                f"limited to {', '.join(INSPECTOR_ALLOWED_PACKAGES)} so the "
                "Inspector adds no dependency"
            ]

        target = posixpath.normpath(
            posixpath.join(posixpath.dirname(f"{install_dir}/{module}"), specifier)
        )
        if target == ".." or target.startswith("../"):
            return [f"resolves to {target}, outside the project"]
        candidates = [target + suffix for suffix in INSPECTOR_RESOLVE_SUFFIXES]
        folder = f"{install_dir}/"
        if any(
            candidate.startswith(folder) and candidate[len(folder) :] in asset_files
            for candidate in candidates
        ):
            return []
        placed = next(
            (
                placed_copies[candidate]
                for candidate in candidates
                if candidate in placed_copies
            ),
            None,
        )
        if placed is None:
            return [
                f"resolves to {target}, which install_prototype_inspector.mjs "
                "does not ship"
            ]

        asset_relative, template_relative = placed
        copies = [(asset_relative.as_posix(), skill_root / asset_relative)]
        if template_root is not None:
            copies.append(
                (
                    f"storybook-template/{template_relative.as_posix()}",
                    template_root / template_relative,
                )
            )
        found: list[str] = []
        for label, path in copies:
            if not path.is_file():
                found.append(f"{label} does not exist")
                continue
            if path not in export_names:
                export_names[path] = read_export_names(
                    path.read_text(encoding="utf-8-sig")
                )
            missing = [name for name in names if name not in export_names[path]]
            if missing:
                found.append(f"{label} does not export {', '.join(missing)}")
        return found

    failures: list[str] = []
    for module in modules:
        declarations, unreadable = parse_static_imports(
            asset_files[module].read_text(encoding="utf-8-sig")
        )
        for line, text in unreadable:
            failures.append(
                f"inspector imports: {module} line {line} — import statement "
                f"the check cannot parse: {text}"
            )
        for specifier, names in declarations:
            failures.extend(
                f"inspector imports: {module} imports {specifier} — {reason}"
                for reason in problems(module, specifier, names)
            )
    return failures


def check_inspector_imports_self_test() -> list[str]:
    """The import surface check has to name each kind of violation.

    Each case writes a fresh tree from the fixture below plus one edit, so
    nothing in the real trees (a missing file, drift, a real violation) can
    crash or skew this test. The fixture repeats the real runtime's import
    shapes: multi-line brace lists, the helper and fingerprint imports, a
    stylesheet import, preset.js's node: imports and import.meta.url, plus a
    nested module.
    """
    (helper_asset, helper_template), (fingerprint_asset, fingerprint_template) = (
        INSPECTOR_PAIRED_COPIES
    )
    helper_specifier = "../../src/pages/prototypes/prototypeFlowLayout"
    fingerprint_specifier = "../../scripts/prototype-review/fingerprint.mjs"
    asset_dir = Path("skill") / INSPECTOR_ASSET_DIR
    preview = asset_dir / "preview.js"
    template_helper = Path("storybook-template") / helper_template
    template_fingerprint = Path("storybook-template") / fingerprint_template
    # The real regression: a helper copy that predates
    # getPrototypeFlowLayoutViewportSignature, which preview.js imports.
    stale_helper = (
        "export type PrototypeFlowLayoutViewport = { width: number; height: number };\n"
        'export const prototypeFlowLayoutStoragePrefix = "flow-layout:";\n'
        "export function getPrototypeFlowLayoutStorageKey(id: string) {\n"
        "  return `${prototypeFlowLayoutStoragePrefix}${id}`;\n"
        "}\n"
        "export function readPrototypeFlowLayoutPositions() {\n"
        "  return {};\n"
        "}\n"
    )
    helper = stale_helper + (
        "export function getPrototypeFlowLayoutViewportSignature(\n"
        "  viewport?: PrototypeFlowLayoutViewport,\n"
        ") {\n"
        "  return viewport ? `${viewport.width}x${viewport.height}` : null;\n"
        "}\n"
    )
    fingerprint = (
        "export function computeFingerprint(metaLike) {\n"
        "  return JSON.stringify(metaLike);\n"
        "}\n"
    )
    fixture = {
        preview: (
            "import {\n"
            "  createElement,\n"
            "  useState,\n"
            '} from "react";\n'
            "\n"
            'import { UPDATE_GLOBALS } from "storybook/internal/core-events";\n'
            'import { addons } from "storybook/preview-api";\n'
            "\n"
            "import {\n"
            "  getPrototypeFlowLayoutStorageKey,\n"
            "  getPrototypeFlowLayoutViewportSignature,\n"
            "  readPrototypeFlowLayoutPositions,\n"
            f'}} from "{helper_specifier}";\n'
            f'import {{ computeFingerprint }} from "{fingerprint_specifier}";\n'
            "\n"
            'import "./prototype-inspector.css";\n'
            "\n"
            "// Each of these starts a statement without being a declaration.\n"
            "import.meta.hot?.accept();\n"
            'import("./panels/flow.js").then((panel) => panel.flowPanel);\n'
            "const importInputRef = { current: null };\n"
        ),
        asset_dir / "preset.js": (
            'import { dirname, join } from "node:path";\n'
            'import { fileURLToPath } from "node:url";\n'
            "\n"
            "const packageDir = dirname(fileURLToPath(import.meta.url));\n"
            "\n"
            "export default {\n"
            '  previewAnnotations: [join(packageDir, "preview.js")],\n'
            "};\n"
        ),
        asset_dir / "manager.js": (
            'import { DocumentIcon } from "@storybook/icons";\n'
            "import {\n"
            "  addons,\n"
            "  types,\n"
            '} from "storybook/manager-api";\n'
        ),
        asset_dir / "panels" / "flow.js": (
            "import {\n"
            "  prototypeFlowLayoutStoragePrefix, // export const\n"
            "  readPrototypeFlowLayoutPositions,\n"
            f'}} from "../{helper_specifier}";\n'
            'import "../prototype-inspector.css";\n'
        ),
        asset_dir / "prototype-inspector.css": ".prototype-inspector {}\n",
        Path("skill") / helper_asset: helper,
        template_helper: helper,
        Path("skill") / fingerprint_asset: fingerprint,
        template_fingerprint: fingerprint,
    }

    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="inspector-imports-") as temp_dir:

        def expect(
            label: str,
            edits: dict[Path, str],
            prefix: str = "",
            *needles: str,
            template_present: bool = True,
        ) -> None:
            case_root = Path(tempfile.mkdtemp(dir=temp_dir))
            for relative, content in {**fixture, **edits}.items():
                (case_root / relative).parent.mkdir(parents=True, exist_ok=True)
                (case_root / relative).write_text(content, encoding="utf-8")
            reported = find_inspector_import_violations(
                case_root / "skill",
                case_root / "storybook-template" if template_present else None,
            )
            if prefix:
                caught = (
                    len(reported) == 1
                    and reported[0].startswith(prefix)
                    and all(needle in reported[0] for needle in needles)
                )
            else:
                caught = not reported
            if not caught:
                wanted = (
                    " + ".join(repr(text) for text in (prefix, *needles) if text)
                    or "no violation"
                )
                failures.append(
                    f"inspector imports self-test ({label}): expected {wanted}, "
                    f"got {reported}"
                )

        expect("unmodified fixture, preset.js node: imports and import.meta.url", {})

        # The spec's classification table, one side-effect import appended to
        # the module per row: None passes, otherwise the single line names the
        # module and specifier and its reason contains the given text.
        for module, specifier, reason in (
            ("preview.js", "./prototype-inspector.css", None),
            ("preview.js", helper_specifier, None),
            ("preview.js", fingerprint_specifier, None),
            ("preview.js", "../../src/utils/format", "resolves to src/utils/format"),
            ("preview.js", "storybook/preview-api", None),
            ("preview.js", "html-to-image", "package html-to-image"),
            ("preview.js", "react-dom", "package react-dom"),
            ("preset.js", "node:path", None),
            ("preview.js", "node:fs", "only in preset.js"),
            # Beyond the table: an unshipped file inside the folder, and a
            # nested module whose path climbs out of the project.
            (
                "preview.js",
                "./missing-panel.js",
                "resolves to .storybook/prototype-inspector/missing-panel.js",
            ),
            ("panels/flow.js", "../../../../outside.js", "outside the project"),
        ):
            module_path = asset_dir / module
            edit = {module_path: fixture[module_path] + f'import "{specifier}";\n'}
            if reason is None:
                expect(f"{module}: {specifier} allowed", edit)
            else:
                expect(
                    f"{module}: {specifier} violation",
                    edit,
                    f"inspector imports: {module} imports {specifier} — ",
                    reason,
                )

        helper_line = f"inspector imports: preview.js imports {helper_specifier} — "
        expect(
            "template helper lacks an imported name",
            {template_helper: stale_helper},
            helper_line,
            f"storybook-template/{helper_template.as_posix()}",
            "getPrototypeFlowLayoutViewportSignature",
        )
        expect(
            "no template tree: the skill asset helper is still checked",
            {Path("skill") / helper_asset: stale_helper},
            helper_line,
            helper_asset.as_posix(),
            "getPrototypeFlowLayoutViewportSignature",
            template_present=False,
        )
        expect(
            "no template tree: the template helper is not read",
            {template_helper: stale_helper},
            template_present=False,
        )
        expect(
            "template fingerprint lacks an imported name",
            {template_fingerprint: "export function canonicalJson(value) {}\n"},
            f"inspector imports: preview.js imports {fingerprint_specifier} — ",
            f"storybook-template/{fingerprint_template.as_posix()} does not export "
            "computeFingerprint",
        )

        same_line = (
            'import "./prototype-inspector.css"; '
            'import { toPng } from "html-to-image";\n'
        )
        expect(
            "second import after a semicolon on the same line",
            {preview: fixture[preview] + same_line},
            "inspector imports: preview.js imports html-to-image — ",
        )
        unreadable = 'import * from "./prototype-inspector.css";\n'
        appended_line = fixture[preview].count("\n") + 1
        expect(
            "import statement the pattern cannot read",
            {preview: fixture[preview] + unreadable},
            f"inspector imports: preview.js line {appended_line} — ",
            unreadable.strip(),
        )
        unreadable_item = 'import { a b } from "./prototype-inspector.css";\n'
        expect(
            "brace-list item the pattern cannot read",
            {preview: fixture[preview] + unreadable_item},
            f"inspector imports: preview.js line {appended_line} — ",
            unreadable_item.strip(),
        )

        commented_out = (
            "/*\n"
            "export function getPrototypeFlowLayoutViewportSignature() {}\n"
            "*/\n"
        )
        expect(
            "helper export inside a block comment does not count",
            {template_helper: stale_helper + commented_out},
            helper_line,
            f"storybook-template/{helper_template.as_posix()}",
            "getPrototypeFlowLayoutViewportSignature",
        )
        let_helper = stale_helper + (
            "export let getPrototypeFlowLayoutViewportSignature = () => null;\n"
        )
        expect(
            "helper name exported through export let",
            {Path("skill") / helper_asset: let_helper, template_helper: let_helper},
        )
        default_import = f'import flowLayout from "{helper_specifier}";\n'
        expect(
            "default import from a helper without a default export",
            {preview: fixture[preview] + default_import},
            helper_line,
            f"{helper_asset.as_posix()} does not export default",
            template_present=False,
        )
    return failures


def check_inspector_imports() -> list[str]:
    """Inspector import surface: every static import loads once installed.

    The real check runs first, then the self-test proves on synthetic trees
    that the check still names each kind of violation, so a check that stops
    seeing violations fails here instead of passing silently. A crash in
    either becomes a failure line rather than aborting the smoke test, and a
    self-test crash cannot hide the real check's lines.
    """
    template_root = (
        STORYBOOK_TEMPLATE_ROOT if STORYBOOK_TEMPLATE_ROOT.is_dir() else None
    )
    if template_root is None:
        # Standalone skill installs do not carry the storybook-template tree.
        print(
            "inspector imports: storybook-template tree not present — checking "
            "imported names against the skill asset helper and fingerprint "
            "only (template copies skipped)"
        )
    failures: list[str] = []
    try:
        failures.extend(
            find_inspector_import_violations(SCRIPTS_DIR.parent, template_root)
        )
    except Exception as error:
        failures.append(
            f"inspector imports: crashed: {type(error).__name__}: {error}"
        )
    try:
        failures.extend(check_inspector_imports_self_test())
    except Exception as error:
        failures.append(
            f"inspector imports self-test: crashed: {type(error).__name__}: {error}"
        )
    return failures


def main() -> int:
    failures: list[str] = []
    round_summaries: list[str] = []
    with tempfile.TemporaryDirectory(prefix="prototype-smoke-") as temp_dir:
        base_dir = Path(temp_dir)
        react_failures, react_exit, react_output = run_round("react", base_dir)
        vue_failures, vue_exit, vue_output = run_round("vue", base_dir)
        failures.extend(react_failures)
        failures.extend(vue_failures)

        if react_exit >= 0 and vue_exit >= 0:
            if vue_exit != react_exit:
                failures.append(
                    f"validator exit codes differ: react={react_exit} vue={vue_exit}"
                )
            normalized_vue = vue_output.replace(
                FRAMEWORK_WORDING["vue"], FRAMEWORK_WORDING["react"]
            )
            if normalized_vue != react_output:
                failures.append(
                    "vue validator output is not equivalent to the react baseline "
                    "after framework-wording normalization"
                )

        for framework in ("react", "vue"):
            prototype_dir = (
                base_dir / framework / "src" / "pages" / "prototypes" / PROTOTYPE_DIR_NAME
            )
            if prototype_dir.is_dir():
                failures.extend(
                    check_phone_baseline(prototype_dir, f"{framework}/no-flags")
                )
            for round_key, extra_args, expected in VIEWPORT_ROUNDS:
                round_failures = run_viewport_round(
                    framework, base_dir, round_key, extra_args, expected
                )
                failures.extend(round_failures)
                if not round_failures:
                    form_factor, width, height = expected
                    round_summaries.append(
                        f"{framework}/{round_key}: scaffold + validate passed "
                        f"({form_factor} {width}x{height})"
                    )

    failures.extend(check_flow_parsing())
    failures.extend(check_handoff_contracts())
    failures.extend(check_authority_and_motion())
    failures.extend(check_flow_export())
    failures.extend(check_viewport_contracts())
    failures.extend(check_inspector_copies())
    failures.extend(check_inspector_imports())
    failures.extend(check_handoff_template_contract())

    if failures:
        print("Scaffold/validate smoke test failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("react: scaffold + validate passed (phone baseline held)")
    print("vue: scaffold + validate passed (output equivalent to react baseline)")
    for summary in round_summaries:
        print(summary)
    print("flow parsing: nested objects and both id layers resolve")
    print(
        "handoff contracts: manifest roundtrip, drift, acceptance ids, dual scope, "
        "blocking decisions, flow carrier"
    )
    print("flow export: layout fields stripped, Swift enum and Kotlin sealed class generated")
    print("viewport contracts: flow.json emission, legacy omission, half-converted warning")
    print(
        "inspector imports: relative imports resolve to shipped files, helper and "
        "fingerprint names are exported, packages stay within react and storybook "
        "(self-test passed)"
    )
    print(
        "handoff template: blocking list and decision register coexist, "
        "receiver contract and required sections documented"
    )
    return 0


def check_flow_export() -> list[str]:
    """Structural guard for export_flow.py's three outputs.

    Compilation is out of scope — this machine has no Swift or Kotlin toolchain
    — so the assertions cover what the export controls: that layout-only fields
    never reach the platform-neutral document, and that each generated file
    carries the declaration a native implementation starts from.
    """
    import json

    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="flow-export-") as temp_dir:
        base = Path(temp_dir)
        prototype_dir = base / "alerts-prototype"
        prototype_dir.mkdir()
        # A flow with both id layers, a params/deepLink route, and a transition
        # carrying every layout field the export must drop.
        (prototype_dir / "alertsPrototypeFlow.ts").write_text(
            'export const alertsPrototypeRouteIds = ["alerts", "alert-detail"] as const;\n'
            "export const alertsPrototypeRoutes = [\n"
            '  { flowPosition: { x: 0, y: 0 }, id: "alerts", navigationId: "alerts", title: "Alerts" },\n'
            '  { deepLink: "/alerts/:alertId", flowPosition: { x: 320, y: 0 }, id: "alert-detail",\n'
            '    navigationId: "alert-detail", params: [{ name: "alertId", type: "string" }],\n'
            '    title: "Alert Detail" },\n'
            "] satisfies AlertsPrototypeRoute[];\n"
            "export const alertsPrototypeTransitions: AlertsPrototypeTransition[] = [\n"
            '  { backBehavior: "dismiss", flowLine: "key", from: "alerts", label: "Open",\n'
            '    presentation: "sheet", motion: "custom", motionRef: "FLOW_SPEC.md#detail-motion", sourceAnchor: { x: 0.9, y: 0.4 }, to: "alert-detail",\n'
            '    trigger: "alertRow.click" },\n'
            "] satisfies AlertsPrototypeTransition[];\n"
        )
        swift_path = base / "Route.swift"
        kotlin_path = base / "Route.kt"

        export = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS_DIR / "export_flow.py"),
                str(prototype_dir),
                "--swift",
                str(swift_path),
                "--kotlin",
                str(kotlin_path),
            ],
            capture_output=True,
            text=True,
        )
        if export.returncode != 0:
            failures.append(
                f"export_flow.py failed with exit {export.returncode}: "
                f"{export.stderr.strip() or export.stdout.strip()}"
            )
            return failures

        flow_json_path = prototype_dir / "docs" / "flow.json"
        if not flow_json_path.is_file():
            failures.append("export_flow.py did not write docs/flow.json")
            return failures

        raw = flow_json_path.read_text()
        for field in ("flowPosition", "sourceAnchor", "flowLine"):
            if field in raw:
                failures.append(f"docs/flow.json still contains the layout field {field}")

        document = json.loads(raw)
        route_ids = [route["id"] for route in document["routes"]]
        if route_ids != ["alerts", "alert-detail"]:
            failures.append(f"flow.json routes parsed as {route_ids}")
        if len(document["transitions"]) != 1:
            failures.append(
                "flow.json lost the annotated transitions array "
                f"(parsed {len(document['transitions'])} transitions); "
                "a `: T[] =` declaration must not hide navigation metadata"
            )
        else:
            transition = document["transitions"][0]
            for key, expected in (("presentation", "sheet"), ("backBehavior", "dismiss"), ("motion", "custom"), ("motionRef", "FLOW_SPEC.md#detail-motion")):
                if transition.get(key) != expected:
                    failures.append(
                        f"flow.json transition {key} is {transition.get(key)!r}, expected {expected!r}"
                    )

        swift = swift_path.read_text()
        if "enum AlertsRoute: Hashable {" not in swift:
            failures.append("Swift output has no AlertsRoute enum declaration")
        if "case alerts" not in swift:
            failures.append("Swift output has no case for the alerts route")
        if "case alertDetail(alertId: String)" not in swift:
            failures.append("Swift output does not type the alertId param as String")

        kotlin = kotlin_path.read_text()
        for label, output in (("Swift", swift), ("Kotlin", kotlin)):
            if "motion: custom" not in output or "motionRef: FLOW_SPEC.md#detail-motion" not in output:
                failures.append(f"{label} navigation skeleton lost motion intent")
        if "sealed class AlertsRoute" not in kotlin:
            failures.append("Kotlin output has no AlertsRoute sealed class declaration")
        if "AlertDetail(val alertId: String)" not in kotlin:
            failures.append("Kotlin output does not type the alertId param as String")

    return failures


def check_handoff_contracts() -> list[str]:
    """Regression guard for the handoff-versioning and traceability contracts.

    Exercises the pieces --handoff-ready composes, without needing a fully
    placeholder-free prototype: manifest write/verify roundtrip and drift
    detection, acceptance-id validation, dual-form scope columns, the
    fixture .ts↔.json structural cross-check, the blocking-decision gate, and
    the docs/flow.json freshness check.
    """
    import json
    sys.path.insert(0, str(SCRIPTS_DIR))
    import validate_prototype as vp

    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="handoff-contract-") as temp_dir:
        folder = Path(temp_dir)
        docs = folder / "docs"
        docs.mkdir()
        for name in vp.REQUIRED_DOCS:
            (docs / name).write_text(f"# {name}\n\ncontent\n")
        flow = folder / "smokePrototypeFlow.ts"
        flow.write_text(
            'export const smokeRouteIds = ["entry"] as const;\n'
            'export const smokeFlowNodeIds = [] as const;\n'
        )
        data = folder / "smokePrototypeData.ts"
        data.write_text('export const smokeRoutes = [{ id: "entry", title: "E" }];\n')
        files = {"flow": flow, "data": data}

        vp.write_handoff_manifest(folder, files, None)
        vp.write_handoff_manifest(folder, files, "second pass")
        manifest = json.loads((docs / vp.MANIFEST_NAME).read_text())
        versions = [entry["version"] for entry in manifest["changelog"]]
        if versions != [1, 2]:
            failures.append(f"manifest changelog versions {versions}, expected [1, 2]")
        if manifest["changelog"][-1]["summary"] != "second pass":
            failures.append("manifest changelog summary did not come from --changelog")
        if vp.run_verify_manifest(folder) != 0:
            failures.append("verify-manifest reported drift on unchanged docs")
        (docs / "PRD.md").write_text("# PRD\n\nedited\n")
        if vp.run_verify_manifest(folder) != 1:
            failures.append("verify-manifest missed drift after a doc edit")

        errors: list[str] = []
        warnings: list[str] = []
        vp.validate_acceptance_ids(
            "- AC-S-001: a\n- AC-S-001: b\n", errors, warnings, True
        )
        if not any("duplicated" in message for message in errors):
            failures.append("duplicate acceptance id was not reported")

        warnings = []
        vp.validate_handoff_scope(
            "## Prototype To Frontend Map\n\n"
            "| Part | Scope(web) | Scope(app) |\n| --- | --- | --- |\n"
            "| `entry` | A | B |\n",
            warnings,
        )
        if warnings:
            failures.append(f"dual scope columns raised warnings: {warnings}")

        (folder / "fixtures").mkdir()
        errors = []
        warnings = []
        vp.validate_fixture_json_consistency(folder, files, errors, warnings)
        if not any("smokeRoutes" in message for message in errors):
            failures.append("missing fixtures/<group>.json was not reported")

        # The blocking-decision gate must be wired into the document pass, not
        # only exist as a function: a handoff-ready run fails on open blocking
        # decisions, a draft run stays silent about them.
        (docs / "PRODUCTION_HANDOFF.md").write_text(
            "# Handoff\n\n## Open Product Decisions\n\n### 🚧 擋開工\n\n"
            "1. 縮放機制\n2. 合成語意\n\n### 不擋開工\n\n3. 文案\n"
        )
        errors = []
        warnings = []
        vp.validate_docs(folder, errors, warnings, True)
        if not any("擋開工" in message and "1, 2" in message for message in errors):
            failures.append(
                "--handoff-ready did not fail on unresolved blocking decisions"
            )
        errors = []
        warnings = []
        vp.validate_docs(folder, errors, warnings, False)
        if any("擋開工" in message for message in errors + warnings):
            failures.append(
                "a draft run reported blocking decisions; only --handoff-ready may"
            )

    failures.extend(check_blocking_decisions(vp))
    failures.extend(check_flow_carrier(vp))
    return failures


# (label, handoff text, expected (numbers, declares_none, unparsable)). The same
# table backs the receiving lint and the repo-level handoff check; a case that
# changes here has to change in all three.
BLOCKING_DECISION_CASES = [
    (
        "numbered list with a non-blocking sibling",
        "## Open Product Decisions\n\n### 🚧 擋開工\n\n1. a\n2. b\n3. c\n\n"
        "### 不擋開工\n\n4. d\n",
        ([1, 2, 3], False, False),
    ),
    (
        "explicit none",
        "## Open Product Decisions\n\n### 🚧 擋開工\n\n無\n\n### 不擋開工\n\n4. d\n",
        ([], True, False),
    ),
    (
        "explicit none after a block quote",
        "## Open Product Decisions\n\n### 🚧 擋開工\n\n> 2026-10-01 全數定案。\n\n無\n",
        ([], True, False),
    ),
    (
        "prose mention without a heading",
        "## Open Product Decisions\n\n- **交付範圍未查證（擋開工）**：十二列全為 U。\n",
        ([], False, True),
    ),
    (
        "never mentioned",
        "## Open Product Decisions\n\n- 文案 owner 未指派。\n",
        ([], False, False),
    ),
    (
        "nested negated sub-heading is dropped",
        "## Open Product Decisions\n\n### 🚧 擋開工\n\n1. a\n\n"
        "#### 不會擋開工的備註\n\n9. z\n",
        ([1], False, False),
    ),
    (
        "heading inside a code fence is ignored",
        "## Open Product Decisions\n\n```md\n### 擋開工\n1. a\n```\n",
        ([], False, False),
    ),
    (
        "numbered sub-heading",
        "## Open Product Decisions\n\n### 🚧 擋開工\n\n#### 1. 縮放機制\n\n說明。\n",
        ([1], False, False),
    ),
]


def check_blocking_decisions(vp) -> list[str]:
    """Regression guard for the blocking (擋開工) decision gate.

    The parser has to agree with the receiving lint case by case, and the gate
    has to fail a handoff-ready run without touching drafts.
    """
    failures: list[str] = []
    for label, text, expected in BLOCKING_DECISION_CASES:
        actual = vp.extract_blocking_decisions(text)
        if actual != expected:
            failures.append(
                f"blocking decisions ({label}): parsed {actual}, expected {expected}"
            )

    def run(text: str, handoff_ready: bool) -> tuple[list[str], list[str]]:
        errors: list[str] = []
        warnings: list[str] = []
        vp.validate_blocking_decisions(text, errors, warnings, handoff_ready)
        return errors, warnings

    numbered = BLOCKING_DECISION_CASES[0][1]
    errors, warnings = run(numbered, True)
    if len(errors) != 1 or "1, 2, 3" not in errors[0]:
        failures.append(f"numbered blocking decisions should yield one error: {errors}")
    errors, warnings = run(numbered, False)
    if errors or warnings:
        failures.append("blocking decisions were reported without --handoff-ready")

    errors, warnings = run(BLOCKING_DECISION_CASES[1][1], True)
    if errors or warnings:
        failures.append(f"an explicit 無 still raised: {errors + warnings}")

    errors, warnings = run(BLOCKING_DECISION_CASES[3][1], True)
    if len(errors) != 1 or "numbered list" not in errors[0]:
        failures.append(f"a prose-only mention should yield one error: {errors}")

    errors, warnings = run(BLOCKING_DECISION_CASES[4][1], True)
    if errors or len(warnings) != 1:
        failures.append(
            "a handoff without a blocking sub-section should warn, not fail: "
            f"errors={errors} warnings={warnings}"
        )

    return failures


def check_flow_carrier(vp) -> list[str]:
    """docs/flow.json may not drift from the flow source it was exported from.

    A stale carrier passes every other check and still sends a native
    implementation building screens the flow dropped, so a handoff-ready run
    has to compare the two.
    """
    import json

    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="flow-carrier-") as temp_dir:
        folder = Path(temp_dir) / "alerts-prototype"
        folder.mkdir()
        flow = folder / "alertsPrototypeFlow.ts"
        flow.write_text(
            'export const alertsPrototypeRouteIds = ["alerts", "alert-detail"] as const;\n'
            "export const alertsPrototypeRoutes = [\n"
            '  { id: "alerts", title: "Alerts" },\n'
            '  { id: "alert-detail", title: "Alert Detail" },\n'
            "] satisfies AlertsPrototypeRoute[];\n"
            "export const alertsPrototypeTransitions = [\n"
            '  { from: "alerts", label: "Open", presentation: "push", to: "alert-detail",\n'
            '    trigger: "alertRow.click" },\n'
            "] satisfies AlertsPrototypeTransition[];\n"
        )
        files = {"flow": flow}

        errors: list[str] = []
        vp.validate_flow_carrier(folder, files, errors)
        if errors:
            failures.append(f"a prototype without docs/flow.json raised: {errors}")

        export = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "export_flow.py"), str(folder)],
            capture_output=True,
            text=True,
        )
        if export.returncode != 0:
            failures.append(
                f"export_flow.py failed with exit {export.returncode}: "
                f"{export.stderr.strip() or export.stdout.strip()}"
            )
            return failures

        errors = []
        vp.validate_flow_carrier(folder, files, errors)
        if errors:
            failures.append(f"a freshly exported docs/flow.json raised: {errors}")

        flow_json = folder / "docs" / "flow.json"
        document = json.loads(flow_json.read_text())
        document["routes"][0]["id"] = "alerts-introduction"
        flow_json.write_text(json.dumps(document, indent=2) + "\n")
        errors = []
        vp.validate_flow_carrier(folder, files, errors)
        if len(errors) != 1 or "docs/flow.json is out of date" not in errors[0]:
            failures.append(f"a stale docs/flow.json should yield one error: {errors}")

        # The check has to run as part of --handoff-ready, not only exist.
        handoff_ready = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS_DIR / "validate_prototype.py"),
                str(folder),
                "--handoff-ready",
            ],
            capture_output=True,
            text=True,
        )
        if "docs/flow.json is out of date" not in handoff_ready.stdout:
            failures.append("--handoff-ready did not report the stale docs/flow.json")
        draft = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "validate_prototype.py"), str(folder)],
            capture_output=True,
            text=True,
        )
        if "docs/flow.json" in draft.stdout:
            failures.append("a draft run reported docs/flow.json freshness")

        flow_json.write_text("{ not json")
        errors = []
        vp.validate_flow_carrier(folder, files, errors)
        if len(errors) != 1 or "not valid JSON" not in errors[0]:
            failures.append(f"an unreadable docs/flow.json should yield one error: {errors}")

    return failures


def check_authority_and_motion() -> list[str]:
    """Regressions from the handoff review: no silent authority or navigation defaults."""
    import copy
    import contextlib
    import importlib.util
    import io
    import json
    sys.path.insert(0, str(SCRIPTS_DIR))
    import validate_prototype as vp

    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="handoff-authority-") as temp:
        folder = Path(temp)
        docs = folder / "docs"
        docs.mkdir()
        for name in vp.REQUIRED_DOCS:
            (docs / name).write_text(f"# {name}\ncontent\n")
        (folder / "fixtures").mkdir()
        fixture = folder / "fixtures" / "alertsRoutes.json"
        fixture.write_text('[{"id":"entry","title":"Fake title"}]')
        data = folder / "alertsPrototypeData.ts"
        data.write_text('export const alertsRoutes = [{id: "entry", title: "Fake title"}];')
        flow = folder / "alertsPrototypeFlow.ts"
        meta = folder / "alertsPrototypeMeta.ts"
        meta.write_text('export const meta = { surface: { target: "web" } };')
        files = {"flow": flow, "data": data, "meta": meta}
        data_doc = docs / "DATA_SPEC.md"
        base = {"schemaVersion": 1, "fixtures": [{
            "group": "alertsRoutes", "values": "fake", "schemaScope": "ui-model",
            "status": "proposed", "source": None, "owner": "Product team",
        }], "contracts": []}
        source = {"reference": "approved-api.yaml", "revision": "r1", "confirmedBy": "RD team", "confirmedOn": "2026-09-14"}

        def put_registry(registry: object) -> None:
            data_doc.write_text("# Data Spec\n## Fake Data\nTest only.\n## Real Data Contract\nNot provided; RD owns integration.\n## Data Authority\n```json\n" + json.dumps(registry) + "\n```\n")

        def audit_authority(expected_error: bool, label: str, ready: bool = True) -> None:
            errors, warnings = [], []
            vp.validate_data_authority(folder, files, errors, warnings, ready)
            if bool(errors) != expected_error:
                failures.append(f"authority {label}: errors={errors}, warnings={warnings}")

        put_registry(base)
        audit_authority(False, "Fake-only proposed")
        for scope in ("ui-model", "transport"):
            confirmed = copy.deepcopy(base)
            confirmed["fixtures"][0].update(status="confirmed", schemaScope=scope, source=source)
            put_registry(confirmed)
            audit_authority(False, f"fake values with confirmed {scope}")
            confirmed["fixtures"][0]["source"] = None
            put_registry(confirmed)
            audit_authority(True, f"confirmed {scope} without source")
        for label, update in (
            ("real fixture values", {"values": "real"}),
            ("invalid scope type", {"schemaScope": {"value": "transport"}}),
            ("invalid status type", {"status": []}),
            ("empty owner", {"owner": ""}),
            ("missing source", {"status": "confirmed", "source": {"reference": "api.yaml"}}),
            ("unknown contract", {"contractId": "missing"}),
            ("superseded fixture", {"status": "superseded"}),
        ):
            invalid = copy.deepcopy(base)
            invalid["fixtures"][0].update(update)
            put_registry(invalid)
            audit_authority(True, label)
        for label, registry in (
            ("duplicate group", {**base, "fixtures": base["fixtures"] * 2}),
            ("uncovered group", {**base, "fixtures": []}),
            ("unsupported version", {**base, "schemaVersion": 2}),
            ("boolean version", {**base, "schemaVersion": True}),
            ("null registry", None),
        ):
            put_registry(registry)
            audit_authority(True, label)
        linked = copy.deepcopy(base)
        linked["fixtures"][0]["contractId"] = "region-toggle"
        linked["contracts"] = [{"id": "region-toggle", "kind": "remote-config", "status": "open", "source": None, "owner": "RD team"}]
        put_registry(linked)
        audit_authority(False, "text-only Remote Config")
        linked["contracts"][0]["status"] = "superseded"
        put_registry(linked)
        audit_authority(True, "superseded referenced contract")
        linked["contracts"] *= 2
        put_registry(linked)
        audit_authority(True, "duplicate contract id")
        tracking = copy.deepcopy(base)
        tracking["contracts"] = [{"id": "analytics-order-submit-click", "kind": "analytics", "status": "proposed", "source": None, "owner": "Growth data team"}]
        put_registry(tracking)
        audit_authority(False, "proposed analytics contract from a tracking comment")
        tracking["contracts"][0]["status"] = "confirmed"
        put_registry(tracking)
        audit_authority(True, "analytics contract confirmed without source evidence")
        linked = copy.deepcopy(base)
        linked["fixtures"][0]["contractId"] = "alerts-api"
        linked["contracts"] = [{"id": "alerts-api", "kind": "api", "status": "confirmed", "source": source, "owner": "RD team"}]
        put_registry(linked)
        audit_authority(False, "independent confirmed API with proposed UI schema")
        data_doc.write_text('## Data Authority\n```json\n{"schemaVersion": 1, "schemaVersion": 1}\n```\n')
        audit_authority(True, "duplicate JSON key")
        data_doc.write_text('## Data Authority\n```json\n{broken}\n```\n')
        audit_authority(True, "malformed JSON")
        data_doc.write_text("# Legacy Data Spec\n")
        audit_authority(False, "legacy draft", ready=False)
        audit_authority(True, "legacy handoff")
        errors, warnings = [], []
        vp.validate_data_authority(folder, files, errors, warnings, False)
        if not warnings:
            failures.append("legacy data did not report unverified authority")

        review = ("## Review Status\n- Status: confirmed\n- Confirmed by: Product team\n"
                  "- Confirmed on: 2026-09-14\n- Reviewed demo: alerts--prototype\n- Scope: UI behavior only; API not confirmed.\n"
                  "## Semantic Review\n- Reviewed by: Reviewer\n- Reviewed on: 2026-09-14\n"
                  "- Scope: Active docs, flow and fixtures\n- Result: passed\n"
                  "- Related updates: No superseded endpoints or promoted suggestions remain.\n")
        errors, warnings = [], []
        vp.validate_review_status(review, errors, warnings)
        if errors:
            failures.append(f"complete review failed: {errors}")
        for invalid in (
            "", "## Review Status\n- Status: confirmed\n",
            review.replace("Reviewer", "[Reviewer]"),
            review.replace("2026-09-14", "yesterday"),
            review.replace("2026-09-14", "20260914"),
            review.replace("- Reviewed demo: alerts--prototype\n", ""),
            review.replace("Confirmed by: Product team", "Confirmed by:"),
            review.replace("Reviewed demo: alerts--prototype", "Reviewed demo:"),
        ):
            errors, warnings = [], []
            vp.validate_review_status(invalid, errors, warnings)
            if not errors:
                failures.append("incomplete review evidence passed")
        (docs / "PRODUCTION_HANDOFF.md").write_text(review)
        put_registry(base)
        audit_authority(False, "demo confirmation does not require transport confirmation")
        if json.loads(vp.extract_doc_section(data_doc.read_text(), "Data Authority").split("```json\n")[1].split("```")[0])["fixtures"][0]["status"] != "proposed":
            failures.append("demo confirmation mutated fixture authority")

        (docs / "FLOW_SPEC.md").write_text('# Flow\n<a id="detail-motion"></a>\nEnter right; return left; use motion tokens; reduce motion uses none.\n')
        def set_transition(fields: dict) -> None:
            transition = {"from": "entry", "to": "detail", "trigger": "open.click", "label": "Open", **fields}
            object_source = "{ " + ", ".join(f"{key}: {json.dumps(value)}" for key, value in transition.items()) + " }"
            flow.write_text('export const alertsRouteIds = ["entry", "detail"] as const;\nexport const alertsFlowNodeIds = ["branch"] as const;\nexport const alertsTransitions = [' + object_source + '];\n')
        for label, fields, expect_error in (
            ("none", {"presentation": "push", "motion": "none"}, False),
            ("platform-default", {"presentation": "sheet", "motion": "platform-default"}, False),
            ("custom", {"presentation": "push", "motion": "custom", "motionRef": "FLOW_SPEC.md#detail-motion"}, False),
            ("missing custom reference", {"presentation": "push", "motion": "custom"}, True),
            ("unknown custom anchor", {"presentation": "push", "motion": "custom", "motionRef": "FLOW_SPEC.md#unknown"}, True),
            ("missing motion", {"presentation": "push"}, True),
            ("missing presentation", {"motion": "none"}, True),
            ("return dismiss", {"kind": "return", "backBehavior": "dismiss", "motion": "none"}, False),
            ("return without back", {"kind": "return", "motion": "none"}, True),
            ("branch only", {"to": "branch"}, False),
        ):
            set_transition(fields)
            errors = []
            vp.validate_transition_presentation(folder, files, errors)
            if bool(errors) != expect_error:
                failures.append(f"motion {label}: {errors}")
        set_transition({"presentation": "push", "motion": "none"})

        for code_example in ('`<a id="example-only"></a>`', '```html\n<a id="example-only"></a>\n```'):
            (docs / "FLOW_SPEC.md").write_text("# Flow\n" + code_example + "\n")
            set_transition({"presentation": "push", "motion": "custom", "motionRef": "FLOW_SPEC.md#example-only"})
            errors = []
            vp.validate_transition_presentation(folder, files, errors)
            if not errors:
                failures.append("custom motion resolved to a code example rather than an actual anchor")
        set_transition({"presentation": "push", "motion": "none"})

        # Check producer and portable receiving audit on the same published bytes.
        module_spec = importlib.util.spec_from_file_location("implementation_audit", SCRIPTS_DIR.parent.parent / "frontend-product-implementation/scripts/validate_implementation.py")
        consumer = importlib.util.module_from_spec(module_spec)
        module_spec.loader.exec_module(consumer)
        def verify(expected: int, label: str) -> None:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                result = vp.run_verify_manifest(folder)
            if result != expected:
                failures.append(f"manifest {label}: {output.getvalue()}")
            manifest = json.loads((docs / vp.MANIFEST_NAME).read_text())
            if manifest.get("manifestSchemaVersion") == 2:
                errors = []
                consumer.verify_artifact_snapshot(docs, manifest, errors)
                if bool(errors) != bool(expected):
                    failures.append(f"receiving carrier integrity {label}: {errors}")

        vp.write_handoff_manifest(folder, files, "authority regression")
        verify(0, "unchanged")
        for label, path in (("fixture value", fixture), ("flow destination", flow), ("metadata", meta), ("doc", docs / "PRD.md")):
            original = path.read_bytes()
            path.write_bytes(original + b"\nchanged")
            verify(1, label)
            path.write_bytes(original)
        fixture_original = fixture.read_bytes()
        fixture.unlink()
        verify(1, "removed fixture")
        fixture.write_bytes(fixture_original)
        extra = folder / "fixtures" / "new.json"
        extra.write_text("[]")
        verify(1, "added fixture")
        extra.unlink()
        exported = docs / "flow.json"
        exported.write_text("{}")
        verify(1, "added flow export")
        exported.unlink()
        verify(0, "restored")
        manifest_path = docs / vp.MANIFEST_NAME
        manifest = json.loads(manifest_path.read_text())
        manifest["manifestSchemaVersion"] = 1
        manifest_path.write_text(json.dumps(manifest))
        verify(1, "legacy snapshot")
        quoted_owner = 'Product "Review" \\ fixtures'
        scaffold = subprocess.run([
            sys.executable, str(SCRIPTS_DIR / "scaffold_prototype.py"), "Quoted Owner",
            "--target-root", str(folder / "quoted"), "--framework", "react", "--owner", quoted_owner,
        ], capture_output=True, text=True)
        if scaffold.returncode:
            failures.append(f"quoted-owner scaffold failed: {scaffold.stderr}")
        else:
            quoted_folder = folder / "quoted" / "quoted-owner-prototype"
            quoted_doc = (quoted_folder / "docs" / "DATA_SPEC.md").read_text()
            block = vp.extract_doc_section(quoted_doc, "Data Authority").split("```json\n")[1].split("```")[0]
            if json.loads(block)["fixtures"][0]["owner"] != quoted_owner:
                failures.append("scaffold did not preserve quoted owner in Data Authority JSON")
    return failures


def check_handoff_template_contract() -> list[str]:
    """The scaffolded handoff has to carry the shapes the receiver reads.

    The blocking (擋開工) list and the decision register live side by side:
    the gate reads only the list, so the register table under 不擋開工 must
    never be counted as a blocking decision.
    """
    import re
    sys.path.insert(0, str(SCRIPTS_DIR))
    import validate_prototype as vp

    failures: list[str] = []
    template_headings: list[str] = []
    with tempfile.TemporaryDirectory(prefix="handoff-template-") as temp_dir:
        target_root = Path(temp_dir)
        scaffold = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS_DIR / "scaffold_prototype.py"),
                "Handoff Template",
                "--target-root",
                str(target_root),
                "--framework",
                "react",
            ],
            capture_output=True,
            text=True,
        )
        if scaffold.returncode != 0:
            failures.append(
                f"handoff template: scaffold failed with exit {scaffold.returncode}: "
                f"{scaffold.stderr.strip() or scaffold.stdout.strip()}"
            )
            return failures
        docs = target_root / "handoff-template-prototype" / "docs"
        handoff = (docs / "PRODUCTION_HANDOFF.md").read_text()
        template_headings = re.findall(
            r"^## (.+)$", vp.mask_code_fences(handoff), re.MULTILINE
        )
        prd = (docs / "PRD.md").read_text()
        for heading in ("Existing Surfaces", "New Surfaces"):
            if not re.search(rf"^## {heading}$", prd, re.MULTILINE):
                failures.append(
                    f"handoff template: scaffolded PRD.md has no '{heading}' section"
                )

        decisions = vp.extract_doc_section(handoff, "Open Product Decisions")
        blocking_at = decisions.find("### 🚧 擋開工")
        non_blocking_at = decisions.find("### 不擋開工")
        register_at = decisions.find("| Decision | Status |")
        if not 0 <= blocking_at < non_blocking_at:
            failures.append(
                "handoff template: Open Product Decisions must hold '### 🚧 擋開工' "
                "followed by '### 不擋開工'"
            )
        elif register_at < non_blocking_at:
            failures.append(
                "handoff template: the decision register table must sit under "
                "'### 不擋開工'"
            )

        parsed = vp.extract_blocking_decisions(handoff)
        if parsed != ([1], False, False):
            failures.append(
                "handoff template: the scaffolded placeholder should read as "
                f"blocking decision 1, parsed {parsed}"
            )
        cleared, replaced = re.subn(r"(?m)^1\. \[[^\n]*\]$", "無", handoff, count=1)
        if replaced != 1:
            failures.append(
                "handoff template: no numbered placeholder found under the "
                "blocking heading"
            )
        elif vp.extract_blocking_decisions(cleared) != ([], True, False):
            failures.append(
                "handoff template: with 無 in place the register table was still "
                f"counted, parsed {vp.extract_blocking_decisions(cleared)}"
            )

    # The reference is what an author reads while filling the template, so the
    # two rules a parser cannot enforce on its own have to be written there.
    reference = (SCRIPTS_DIR.parent / "references" / "production-handoff.md").read_text()
    decisions_reference = vp.extract_doc_section(reference, "Open Product Decisions")
    for needle, rule in (
        (
            "status `confirmed` and its source",
            "an answered blocking decision moves into the register",
        ),
        (
            "No other heading in the handoff may contain",
            "no other heading may contain 擋開工",
        ),
    ):
        if needle not in decisions_reference:
            failures.append(
                f"handoff reference: Open Product Decisions does not state that {rule}"
            )

    required = re.search(
        r"^## Required Sections\n.*?```markdown\n(.*?)```", reference, re.DOTALL | re.MULTILINE
    )
    listed = set(re.findall(r"^## (.+)$", required.group(1), re.MULTILINE)) if required else set()
    unlisted = [heading for heading in template_headings if heading not in listed]
    if not template_headings or unlisted:
        failures.append(
            "handoff reference: Required Sections does not list these template "
            f"headings: {unlisted or 'none parsed'}"
        )

    contract = vp.extract_doc_section(reference, "Receiver Consumption Contract")
    lint_part, marker, reader_part = contract.partition(
        "Read by the author of the receiving PRD"
    )
    if "Parsed by the receiver's lint" not in lint_part or not marker:
        failures.append(
            "handoff reference: Receiver Consumption Contract must separate what "
            "the receiver's lint parses from what the receiving PRD author reads"
        )
    for needle in ("Review Status", "擋開工"):
        if needle not in lint_part:
            failures.append(
                f"handoff reference: the contract does not list {needle} as lint-parsed"
            )
    for needle in ("Existing Surfaces", "Core Journeys", "Component Map", "AC-S-NNN"):
        if needle not in reader_part:
            failures.append(
                f"handoff reference: the contract does not list {needle} as reader-consumed"
            )

    return failures


def check_flow_parsing() -> list[str]:
    """Regression guard for the flow-metadata parsers.

    Both defects these cover were silent: a non-greedy `{(.*?)}` stopped at the
    nested `sourceAnchor` brace and reported `to`/`trigger` missing on
    transitions that plainly had them, and reading only the `*RouteIds` string
    array rejected every transition between the finer board screens declared in
    `*Routes`. Neither showed up as a crash — just wrong findings that made a
    healthy prototype look broken and a broken one look clean.
    """
    sys.path.insert(0, str(SCRIPTS_DIR))
    import validate_prototype as vp

    flow_source = """
export const featurePrototypeRouteIds = ["quotes", "settings"] as const;

export const featurePrototypeRoutes = [
  { id: "quotes-introduction", title: "Quotes" },
  { id: "settings", title: "Settings" },
] satisfies FeaturePrototypeRoute[];

export const featurePrototypeTransitions = [
  {
    from: "quotes-introduction",
    sourceAnchor: { side: "right", xRatio: 0.95, yRatio: 0.43 },
    to: "settings",
    trigger: "topAppBar.more",
    label: "More [ ] { }",
  },
] satisfies FeaturePrototypeTransition[];
"""

    failures: list[str] = []

    transitions = vp.extract_transition_objects(flow_source)
    if len(transitions) != 1:
        failures.append(
            f"expected 1 transition object, parsed {len(transitions)}"
        )
    else:
        for key, expected in (
            ("from", "quotes-introduction"),
            ("to", "settings"),
            ("trigger", "topAppBar.more"),
        ):
            actual = vp.extract_string_property(transitions[0], key)
            if actual != expected:
                failures.append(
                    f"transition {key} parsed as {actual!r} after a nested "
                    f"sourceAnchor object; expected {expected!r}"
                )

    screen_ids = vp.extract_flow_screen_ids(flow_source)
    for expected_id in ("quotes", "settings", "quotes-introduction"):
        if expected_id not in screen_ids:
            failures.append(
                f"flow screen id {expected_id!r} missing from {screen_ids}"
            )

    return failures


if __name__ == "__main__":
    sys.exit(main())
