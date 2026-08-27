#!/usr/bin/env python3
"""Export platform-neutral contracts from a Storybook prototype folder.

Writes docs/TOKENS.json (W3C Design Tokens / DTCG format) from the prototype
CSS ``--proto-*`` alias block, and normalizes fixtures/*.json formatting so
the language-neutral fixture carrier stays diff-friendly.

The alias block is the fixed form enforced by references/visual-quality.md:

    --proto-accent: var(--sbt-sys-color-primary, #2563eb);
    --proto-space-1: 4px;

var()-bound aliases export the raw fallback as ``$value`` and record the
bound project token in ``$extensions``; direct-value aliases export the raw
value. Native platforms (SwiftUI, Compose) and Style Dictionary consume the
DTCG file instead of the CSS carrier.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PROTO_DECL_PATTERN = re.compile(r"--proto-([A-Za-z0-9-]+)\s*:\s*([^;]+);")
VAR_BINDING_PATTERN = re.compile(r"^var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*(.*))?\)$", re.DOTALL)

COLOR_VALUE_PATTERN = re.compile(
    r"^(#[0-9a-fA-F]{3,8}|rgba?\([^()]*\)|hsla?\([^()]*\))$"
)
DIMENSION_VALUE_PATTERN = re.compile(r"^-?\d+(?:\.\d+)?(?:px|rem|em)$")
NUMBER_VALUE_PATTERN = re.compile(r"^-?\d+(?:\.\d+)?$")

EXTENSION_KEY = "works.cm.storybook-product-prototype"


def infer_type(value: str) -> str:
    """DTCG $type from the raw value form; inference failure degrades to string."""
    if COLOR_VALUE_PATTERN.match(value):
        return "color"
    if DIMENSION_VALUE_PATTERN.match(value):
        return "dimension"
    if NUMBER_VALUE_PATTERN.match(value):
        return "number"
    return "string"


def strip_comments(css_text: str) -> str:
    return re.sub(r"/\*.*?\*/", " ", css_text, flags=re.DOTALL)


def extract_tokens(css_text: str) -> dict[str, dict]:
    """DTCG token objects keyed by alias role, in declaration order (last wins)."""
    tokens: dict[str, dict] = {}
    for role, raw_value in PROTO_DECL_PATTERN.findall(strip_comments(css_text)):
        value = raw_value.strip()
        source_token: str | None = None
        binding = VAR_BINDING_PATTERN.match(value)
        if binding:
            source_token = binding.group(1)
            fallback = (binding.group(2) or "").strip()
            value = fallback if fallback else value
        token_type = infer_type(value)
        token: dict = {"$type": token_type, "$value": value}
        if token_type == "string":
            token["$description"] = f"raw value preserved verbatim: {value}"
        if source_token:
            prefix_match = re.match(r"--([A-Za-z0-9]+)-", source_token)
            token["$extensions"] = {
                EXTENSION_KEY: {
                    "sourceToken": source_token,
                    "tokenPrefix": prefix_match.group(1) if prefix_match else None,
                }
            }
        tokens[role] = token
    return tokens


def find_prototype_css(folder: Path) -> Path | None:
    matches = sorted(folder.glob("*-prototype.css")) or sorted(folder.glob("*.css"))
    return matches[0] if matches else None


def normalize_fixtures(folder: Path) -> list[Path]:
    """Rewrite fixtures/*.json with stable formatting; invalid JSON is fatal."""
    fixtures_dir = folder / "fixtures"
    normalized: list[Path] = []
    if not fixtures_dir.is_dir():
        return normalized
    for path in sorted(fixtures_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(errors="replace"))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"fixtures/{path.name} is not valid JSON: {exc}")
        path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
        )
        normalized.append(path)
    return normalized


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prototype_folder", help="Path to a prototype folder.")
    parser.add_argument(
        "--css",
        type=Path,
        default=None,
        help="Prototype CSS file. Defaults to the folder's *-prototype.css.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output path for the DTCG file. Defaults to <folder>/docs/TOKENS.json.",
    )
    parser.add_argument(
        "--no-fixtures",
        action="store_true",
        help="Skip normalizing fixtures/*.json formatting.",
    )
    args = parser.parse_args()

    folder = Path(args.prototype_folder).resolve()
    if not folder.is_dir():
        print(f"{folder} is not a directory")
        return 1

    css_path = args.css or find_prototype_css(folder)
    if css_path is None or not css_path.is_file():
        print(
            f"No prototype CSS found in {folder} (expected *-prototype.css with a "
            "--proto-* alias block); pass --css <path> to name it explicitly."
        )
        return 1

    tokens = extract_tokens(css_path.read_text(errors="replace"))
    if not tokens:
        print(
            f"{css_path.name} has no parseable --proto-* alias block; expected "
            "declarations such as `--proto-accent: var(--sbt-sys-color-primary, "
            "#2563eb);` per references/visual-quality.md."
        )
        return 1

    out_path = args.out or (folder / "docs" / "TOKENS.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    document = {
        "$description": (
            f"Design tokens exported from {css_path.name} --proto-* alias block "
            "by storybook-product-prototype/scripts/export_prototype_contracts.py. "
            "W3C Design Tokens (DTCG) format; feed to Style Dictionary or "
            "platform codegen instead of consuming the CSS carrier."
        ),
        "proto": tokens,
    }
    out_path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {out_path} ({len(tokens)} tokens).")

    if not args.no_fixtures:
        for path in normalize_fixtures(folder):
            print(f"Normalized fixtures/{path.name}.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
