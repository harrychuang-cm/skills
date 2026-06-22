#!/usr/bin/env python3
"""Validate the folder contract for a Storybook product prototype."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


REQUIRED_DOCS = [
    "PRD.md",
    "FLOW_SPEC.md",
    "UI_SPEC.md",
    "DATA_SPEC.md",
    "ACCEPTANCE.md",
    "IMPLEMENTATION_GUIDE.md",
]

REQUIRED_DOC_HEADINGS = {
    "PRD.md": ["Product Summary", "Problem", "Users", "Goals", "Non-Goals", "Core Journeys"],
    "FLOW_SPEC.md": ["Source Of Truth", "Route Map", "Transitions"],
    "UI_SPEC.md": ["Design Principle", "Interaction", "Accessibility"],
    "DATA_SPEC.md": ["Source Of Truth", "Fixture Inventory", "API Replacement Points"],
    "ACCEPTANCE.md": ["Storybook", "Interaction", "Engineering"],
    "IMPLEMENTATION_GUIDE.md": ["Implementation Order", "Required Verification"],
}


def find_one(folder: Path, pattern: str) -> Path | None:
    matches = sorted(folder.glob(pattern))
    return matches[0] if matches else None


def check(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def read(path: Path) -> str:
    return path.read_text(errors="replace")


def unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def quoted_strings(value: str) -> list[str]:
    return [match[0] or match[1] for match in re.findall(r'"([^"]+)"|\'([^\']+)\'', value)]


def extract_const_string_array(text: str, suffix: str) -> list[str]:
    match = re.search(
        rf"export\s+const\s+\w+{re.escape(suffix)}\s*=\s*\[(.*?)\]\s*as\s+const",
        text,
        re.DOTALL,
    )
    return quoted_strings(match.group(1)) if match else []


def extract_transition_objects(text: str) -> list[str]:
    match = re.search(
        r"export\s+const\s+\w+Transitions\s*=\s*\[(.*?)\]\s*satisfies",
        text,
        re.DOTALL,
    )
    if not match:
        return []
    return re.findall(r"\{(.*?)\}", match.group(1), re.DOTALL)


def extract_string_property(object_text: str, key: str) -> str | None:
    match = re.search(rf"\b{re.escape(key)}\s*:\s*(['\"])(.*?)\1", object_text)
    return match.group(2) if match else None


def validate_docs(folder: Path, errors: list[str]) -> None:
    docs_dir = folder / "docs"
    check(docs_dir.is_dir(), "missing docs/ directory", errors)
    if not docs_dir.is_dir():
        return

    for doc_name in REQUIRED_DOCS:
        doc_path = docs_dir / doc_name
        check(doc_path.is_file(), f"missing docs/{doc_name}", errors)
        if not doc_path.is_file():
            continue
        text = read(doc_path)
        for heading in REQUIRED_DOC_HEADINGS.get(doc_name, []):
            check(
                re.search(rf"^#+\s+{re.escape(heading)}\s*$", text, re.MULTILINE)
                is not None,
                f"docs/{doc_name} missing heading '{heading}'",
                errors,
            )


def validate_files(folder: Path, errors: list[str]) -> dict[str, Path | None]:
    files = {
        "component": find_one(folder, "*Prototype.tsx"),
        "story": find_one(folder, "*Prototype.stories.tsx"),
        "static flow export": find_one(folder, "*PrototypeFlowExport.tsx"),
        "static flow story": find_one(folder, "*PrototypeFlowExport.stories.tsx"),
        "flow": find_one(folder, "*PrototypeFlow.ts"),
        "data": find_one(folder, "*PrototypeData.ts"),
        "meta": find_one(folder, "*PrototypeMeta.ts"),
        "css": find_one(folder, "*-prototype.css"),
        "flow layout helper": folder.parent / "prototypeFlowLayout.ts",
        "index": folder / "index.ts",
    }

    for label, path in files.items():
        check(path is not None and path.is_file(), f"missing {label} file", errors)

    return files


def validate_story(path: Path | None, errors: list[str]) -> None:
    if path is None or not path.is_file():
        return
    text = read(path)
    check("parameters" in text, "story missing parameters", errors)
    check("prototype:" in text, "story missing parameters.prototype", errors)
    check('layout: "fullscreen"' in text or "layout: 'fullscreen'" in text, "story should use fullscreen layout", errors)


def validate_static_flow_story(path: Path | None, errors: list[str]) -> None:
    if path is None or not path.is_file():
        return
    text = read(path)
    check("StaticFlow" in text, "static flow story should export StaticFlow", errors)
    check("parameters" in text, "static flow story missing parameters", errors)
    check("prototype:" in text, "static flow story missing parameters.prototype", errors)
    check(
        'layout: "fullscreen"' in text or "layout: 'fullscreen'" in text,
        "static flow story should use fullscreen layout",
        errors,
    )


def validate_static_flow_export(path: Path | None, errors: list[str]) -> None:
    if path is None or not path.is_file():
        return
    text = read(path)
    check("../prototypeFlowLayout" in text, "static flow export should import shared prototypeFlowLayout helper", errors)
    check("readPrototypeFlowLayoutPositions" in text, "static flow export should read saved inspector layout positions", errors)
    check("getPrototypeFlowLayoutStorageKey" in text, "static flow export should use the shared layout storage key", errors)
    check("isFlowPreview" in text, "static flow export should render route previews in flow preview mode", errors)
    check("data-layout-source" in text, "static flow export should expose data-layout-source", errors)
    check("data-figma-text-auto-width" in text, "static flow export should mark edge labels for Figma text auto-width", errors)


def validate_viewer_compatibility(files: dict[str, Path | None], errors: list[str]) -> None:
    component_path = files.get("component")
    story_path = files.get("story")
    text = ""
    if component_path is not None and component_path.is_file():
        text += read(component_path)
    if story_path is not None and story_path.is_file():
        text += "\n" + read(story_path)

    check(
        "prototypeFlowPreview" in text,
        "prototype should support prototypeFlowPreview query mode for iframe previews",
        errors,
    )
    check(
        "prototypeRoute" in text,
        "prototype should support prototypeRoute query mode for route-specific iframe previews",
        errors,
    )
    check(
        "data-prototype-root" in text,
        "prototype root should keep data-prototype-root for backward-compatible UI Flow preview measurement",
        errors,
    )
    check(
        "data-prototype-route-preview" in text,
        "prototype route shell should expose data-prototype-route-preview for template-compatible preview measurement",
        errors,
    )


def validate_meta(path: Path | None, errors: list[str]) -> None:
    if path is None or not path.is_file():
        return
    text = read(path)
    for doc_name in ["ACCEPTANCE", "DATA_SPEC", "FLOW_SPEC", "IMPLEMENTATION_GUIDE", "PRD", "UI_SPEC"]:
        check(doc_name in text, f"meta missing raw import for docs/{doc_name}.md", errors)
    check("flow:" in text, "meta missing flow field", errors)
    check("data:" in text, "meta missing data field", errors)
    check("docs:" in text, "meta missing docs field", errors)
    check("figmaExport" in text, "meta missing figmaExport field", errors)
    check("flowStoryId" in text, "meta missing figmaExport.flowStoryId", errors)


def validate_flow(path: Path | None, errors: list[str]) -> None:
    if path is None or not path.is_file():
        return
    text = read(path)
    check("RouteIds" in text, "flow file missing route id array", errors)
    check("Routes" in text, "flow file missing routes metadata", errors)
    check("Transitions" in text, "flow file missing transitions metadata", errors)
    check("sourceAnchor" in text, "flow transition type should include optional sourceAnchor for export layout tuning", errors)
    route_ids = extract_const_string_array(text, "RouteIds")
    flow_node_ids = extract_const_string_array(text, "FlowNodeIds")
    all_ids = route_ids + flow_node_ids
    duplicate_ids = sorted({value for value in all_ids if all_ids.count(value) > 1})

    check(bool(route_ids), "flow file should include at least one stable route id string", errors)
    check(not duplicate_ids, f"flow ids must be unique: {', '.join(duplicate_ids)}", errors)

    for route_id in route_ids:
        check(
            re.fullmatch(r"[a-z0-9][a-z0-9-]*", route_id) is not None,
            f"route id '{route_id}' should be lowercase kebab-case",
            errors,
        )

    for node_id in flow_node_ids:
        check(
            re.fullmatch(r"[a-z0-9][a-z0-9-]*", node_id) is not None,
            f"flow node id '{node_id}' should be lowercase kebab-case",
            errors,
        )

    transitions = extract_transition_objects(text)
    valid_targets = set(all_ids)

    check(
        len(all_ids) <= 1 or bool(transitions),
        "flow with multiple routes or nodes should include transition metadata",
        errors,
    )

    has_key_flow_line = False
    for index, transition in enumerate(transitions, start=1):
        from_id = extract_string_property(transition, "from")
        to_id = extract_string_property(transition, "to")
        trigger = extract_string_property(transition, "trigger")
        label = extract_string_property(transition, "label")
        flow_line = extract_string_property(transition, "flowLine")
        transition_label = trigger or label or f"#{index}"

        check(bool(from_id), f"transition {transition_label} missing from", errors)
        check(bool(to_id), f"transition {transition_label} missing to", errors)
        check(bool(trigger), f"transition {transition_label} missing trigger", errors)
        check(bool(label), f"transition {transition_label} missing label", errors)

        if from_id:
            check(
                from_id in valid_targets,
                f"transition {transition_label} has unknown from target '{from_id}'",
                errors,
            )
        if to_id:
            check(
                to_id in valid_targets,
                f"transition {transition_label} has unknown to target '{to_id}'",
                errors,
            )
        if flow_line:
            check(
                flow_line in {"key", "reference", "hidden"},
                f"transition {transition_label} has invalid flowLine '{flow_line}'",
                errors,
            )
            has_key_flow_line = has_key_flow_line or flow_line == "key"

    check(
        not transitions or has_key_flow_line,
        'flow with transitions should mark at least one transition as flowLine: "key"',
        errors,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prototype_folder", help="Path to a generated prototype folder.")
    args = parser.parse_args()

    folder = Path(args.prototype_folder).resolve()
    errors: list[str] = []

    check(folder.is_dir(), f"{folder} is not a directory", errors)
    if folder.is_dir():
        validate_docs(folder, errors)
        files = validate_files(folder, errors)
        validate_story(files["story"], errors)
        validate_static_flow_story(files["static flow story"], errors)
        validate_static_flow_export(files["static flow export"], errors)
        validate_viewer_compatibility(files, errors)
        validate_meta(files["meta"], errors)
        validate_flow(files["flow"], errors)

    if errors:
        print("Prototype validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Prototype validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
