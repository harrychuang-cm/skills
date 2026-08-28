#!/usr/bin/env python3
"""Machine audit for a frontend-product-implementation IMPLEMENTATION_MAP.md.

Checks the durable implementation record against the consumed handoff:

1. Every route id in the handoff's HANDOFF_MANIFEST.json (or, absent a
   manifest, every row the map itself lists) has a terminal outcome —
   ``implemented``, ``existing-verified``, or ``deferred``.
2. Every ``existing-verified`` row's evidence path exists under the
   production repo root.
3. Every AC-P criterion tagged ``(assembly)`` in the handoff's ACCEPTANCE.md
   appears in the map's Acceptance Traceability section with a result other
   than ``deferred``.
4. The consumed ``docsDigest`` recorded in the map equals the current
   manifest's ``docsDigest``.
5. The ``Component Map`` section exists, and — unless it records
   ``- source: none`` with no table rows — every row's ``Resolution`` is one
   of ``reused``, ``composed``, ``extended``, ``created``, or ``deferred``;
   every comma-separated ``Evidence`` path on ``reused``, ``composed``,
   ``extended``, and ``created`` rows exists under the production repo root;
   and ``created`` and ``deferred`` rows carry a non-empty ``Notes`` cell.

Every failed check is listed with its subject; any failure exits non-zero.
Standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REQUIRED_SECTIONS = [
    "Consumed Manifest",
    "Route Outcomes",
    "Acceptance Traceability",
    "Data Adapter Seams",
    "Component Map",
]

OUTCOME_VALUES = {"implemented", "existing-verified", "deferred"}

RESOLUTION_VALUES = {"reused", "composed", "extended", "created", "deferred"}

RESOLUTIONS_NEEDING_EVIDENCE = {"reused", "composed", "extended", "created"}

RESOLUTIONS_NEEDING_NOTES = {"created", "deferred"}

SOURCE_NONE_PATTERN = re.compile(
    r"^\s*[-*]\s+source\s*:\s*`?none`?\s*$", re.MULTILINE
)

AC_P_ASSEMBLY_PATTERN = re.compile(
    r"^\s*[-*]\s+(AC-P-\d{3})\s*\((assembly|integration)\)", re.MULTILINE
)


def read(path: Path) -> str:
    return path.read_text(errors="replace")


def extract_section(text: str, heading: str) -> str:
    opener = re.search(rf"^(#+)\s+{re.escape(heading)}\s*$", text, re.MULTILINE)
    if not opener:
        return ""
    level = len(opener.group(1))
    closer = re.search(rf"^#{{1,{level}}}\s", text[opener.end():], re.MULTILINE)
    end = opener.end() + closer.start() if closer else len(text)
    return text[opener.end():end]


def table_rows(section: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in section.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", cell) for cell in cells if cell):
            continue
        rows.append(cells)
    return rows


def clean_cell(cell: str) -> str:
    return cell.replace("`", "").replace("*", "").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--handoff",
        type=Path,
        required=True,
        help="Handoff docs directory (holds HANDOFF_MANIFEST.json and ACCEPTANCE.md).",
    )
    parser.add_argument(
        "--map",
        dest="map_path",
        type=Path,
        required=True,
        help="Path to the IMPLEMENTATION_MAP.md produced by the implementation pass.",
    )
    parser.add_argument(
        "--repo",
        type=Path,
        required=True,
        help="Production repo root used to resolve existing-verified evidence paths.",
    )
    args = parser.parse_args()

    failures: list[str] = []
    notes: list[str] = []

    if not args.map_path.is_file():
        print(f"implementation map not found: {args.map_path}")
        return 1
    map_text = read(args.map_path)

    for heading in REQUIRED_SECTIONS:
        if not extract_section(map_text, heading):
            failures.append(f"IMPLEMENTATION_MAP.md is missing the '{heading}' section")

    # --- Route Outcomes -------------------------------------------------
    outcome_section = extract_section(map_text, "Route Outcomes")
    outcomes: dict[str, tuple[str, str]] = {}
    rows = table_rows(outcome_section)
    for row in rows[1:] if rows else []:
        if not row:
            continue
        route_id = clean_cell(row[0])
        outcome = clean_cell(row[1]).lower() if len(row) > 1 else ""
        evidence = clean_cell(row[2]) if len(row) > 2 else ""
        if not route_id:
            continue
        outcomes[route_id] = (outcome, evidence)
        if outcome not in OUTCOME_VALUES:
            failures.append(
                f"route '{route_id}' has outcome '{outcome or '(empty)'}'; expected "
                "implemented, existing-verified, or deferred"
            )

    manifest_path = args.handoff / "HANDOFF_MANIFEST.json"
    manifest: dict | None = None
    if manifest_path.is_file():
        try:
            loaded = json.loads(read(manifest_path))
            manifest = loaded if isinstance(loaded, dict) else None
        except json.JSONDecodeError as exc:
            failures.append(f"HANDOFF_MANIFEST.json is not valid JSON: {exc}")
    else:
        notes.append(
            "no HANDOFF_MANIFEST.json in the handoff dir; route coverage was "
            "audited against the map's own rows and the digest check was skipped"
        )

    if manifest is not None:
        flow = manifest.get("flow") or {}
        manifest_routes = [
            value for value in (flow.get("routeIds") or []) if isinstance(value, str)
        ]
        for route_id in manifest_routes:
            if route_id not in outcomes:
                failures.append(
                    f"manifest route '{route_id}' has no terminal outcome in "
                    "Route Outcomes"
                )

    for route_id, (outcome, evidence) in sorted(outcomes.items()):
        if outcome != "existing-verified":
            continue
        if not evidence:
            failures.append(
                f"route '{route_id}' is existing-verified but has no evidence path"
            )
            continue
        if not (args.repo / evidence).exists():
            failures.append(
                f"route '{route_id}' evidence path '{evidence}' does not exist "
                f"under {args.repo}"
            )

    # --- Acceptance Traceability ---------------------------------------
    traceability = extract_section(map_text, "Acceptance Traceability")
    results: dict[str, str] = {}
    rows = table_rows(traceability)
    for row in rows[1:] if rows else []:
        if not row:
            continue
        ac_id = clean_cell(row[0])
        result = clean_cell(row[2]).split()[0].lower() if len(row) > 2 and clean_cell(row[2]) else ""
        if ac_id:
            results[ac_id] = result

    acceptance_path = args.handoff / "ACCEPTANCE.md"
    if acceptance_path.is_file():
        for ac_id, tag in AC_P_ASSEMBLY_PATTERN.findall(read(acceptance_path)):
            if tag != "assembly":
                continue
            result = results.get(ac_id)
            if result is None:
                failures.append(
                    f"{ac_id} (assembly) is missing from Acceptance Traceability"
                )
            elif result == "deferred":
                failures.append(
                    f"{ac_id} (assembly) is recorded as deferred; assembly criteria "
                    "must be settled in mock mode, not deferred"
                )
    else:
        notes.append("no ACCEPTANCE.md in the handoff dir; AC-P coverage was skipped")

    # --- Component Map --------------------------------------------------
    component_section = extract_section(map_text, "Component Map")
    if component_section:
        component_rows = table_rows(component_section)
        component_body = component_rows[1:] if component_rows else []
        if SOURCE_NONE_PATTERN.search(component_section) and not component_body:
            notes.append(
                "Component Map records source: none; the handoff has no "
                "component inventory and row-level checks were skipped"
            )
        for row in component_body:
            if not row:
                continue
            component = clean_cell(row[0])
            if not component:
                continue
            resolution = clean_cell(row[1]).lower() if len(row) > 1 else ""
            evidence = clean_cell(row[3]) if len(row) > 3 else ""
            notes_cell = clean_cell(row[4]) if len(row) > 4 else ""
            if resolution not in RESOLUTION_VALUES:
                failures.append(
                    f"component '{component}' has resolution "
                    f"'{resolution or '(empty)'}'; expected reused, composed, "
                    "extended, created, or deferred"
                )
                continue
            if resolution in RESOLUTIONS_NEEDING_EVIDENCE:
                paths = [p.strip() for p in evidence.split(",") if p.strip()]
                if not paths:
                    failures.append(
                        f"component '{component}' is {resolution} but has no "
                        "evidence path"
                    )
                for path in paths:
                    if not (args.repo / path).exists():
                        failures.append(
                            f"component '{component}' evidence path '{path}' "
                            f"does not exist under {args.repo}"
                        )
            if resolution in RESOLUTIONS_NEEDING_NOTES and not notes_cell:
                failures.append(
                    f"component '{component}' is {resolution} but has an "
                    "empty Notes cell"
                )

    # --- Consumed digest ------------------------------------------------
    consumed_section = extract_section(map_text, "Consumed Manifest")
    digest_match = re.search(
        r"docsDigest\s*:\s*`?([A-Za-z0-9]+)`?", consumed_section
    )
    consumed_digest = digest_match.group(1) if digest_match else None
    if manifest is not None:
        current_digest = manifest.get("docsDigest")
        if consumed_digest is None:
            failures.append(
                "Consumed Manifest records no docsDigest although the handoff "
                "has a manifest"
            )
        elif consumed_digest == "unversioned":
            failures.append(
                "Consumed Manifest says unversioned but the handoff has a "
                "manifest; re-ingest and record its docsDigest"
            )
        elif current_digest and consumed_digest != current_digest:
            versions = manifest.get("changelog") or []
            current_version = versions[-1].get("version") if versions else "?"
            failures.append(
                "handoff drift: the consumed docsDigest no longer matches the "
                f"current manifest (current changelog version {current_version}); "
                "re-read the changed docs, merge, and update the map"
            )

    for note in notes:
        print(f"note: {note}")
    if failures:
        print("Implementation map audit failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Implementation map audit passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
