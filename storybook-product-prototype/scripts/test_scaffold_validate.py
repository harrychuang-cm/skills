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

    if failures:
        print("Scaffold/validate smoke test failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("react: scaffold + validate passed")
    print("vue: scaffold + validate passed (output equivalent to react baseline)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
