#!/usr/bin/env python3
"""Smoke test: scaffold a prototype per framework and validate the result.

Runs scaffold_prototype.py with an explicit --framework value for react and
vue, then runs validate_prototype.py on each produced folder. Fails when a
round produces files of the other framework's component format, when expected
output files are missing, when the validator misclassifies a folder, when
missing-file errors occur, or when the vue round's validator output is not
equivalent to the react round's baseline.
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


def main() -> int:
    failures: list[str] = []
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

    failures.extend(check_flow_parsing())
    failures.extend(check_handoff_contracts())
    failures.extend(check_flow_export())

    if failures:
        print("Scaffold/validate smoke test failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("react: scaffold + validate passed")
    print("vue: scaffold + validate passed (output equivalent to react baseline)")
    print("flow parsing: nested objects and both id layers resolve")
    print("handoff contracts: manifest roundtrip, drift, acceptance ids, dual scope")
    print("flow export: layout fields stripped, Swift enum and Kotlin sealed class generated")
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
            '    presentation: "sheet", sourceAnchor: { x: 0.9, y: 0.4 }, to: "alert-detail",\n'
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
            for key, expected in (("presentation", "sheet"), ("backBehavior", "dismiss")):
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
        if "sealed class AlertsRoute" not in kotlin:
            failures.append("Kotlin output has no AlertsRoute sealed class declaration")
        if "AlertDetail(val alertId: String)" not in kotlin:
            failures.append("Kotlin output does not type the alertId param as String")

    return failures


def check_handoff_contracts() -> list[str]:
    """Regression guard for the handoff-versioning and traceability contracts.

    Exercises the pieces --handoff-ready composes, without needing a fully
    placeholder-free prototype: manifest write/verify roundtrip and drift
    detection, acceptance-id validation, dual-form scope columns, and the
    fixture .ts↔.json structural cross-check.
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
