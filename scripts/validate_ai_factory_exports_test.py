#!/usr/bin/env python3
"""Contract tests for the AI Factory portable exports and MCP endpoint.

These run offline against the *built* roster output, so they prove the
generator produced a complete, honest export set without touching production:

  * every agent has all five formats
  * the neutral export carries the seven fields plus team/niche/slug/avatar
  * no export invents callable tools (the connector honesty rule)
  * index.json agrees with the files on disk
  * the MCP manifest and OpenAPI document parse and describe the real tools

Usage:
    python3 scripts/validate_ai_factory_exports_test.py
    python3 scripts/validate_ai_factory_exports_test.py --root .output/public

Exit codes: 0 all checks passed, 1 a check failed, 2 bad usage.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

EXPORT_REL = Path("ai-factory/roster/data/exports")
FORMATS = ("neutral", "chatgpt", "claude", "hermes", "prompt")
SEVEN_FIELDS = (
    "name",
    "description",
    "instruction",
    "knowledge",
    "tools",
    "skills",
    "connectors",
)
PORTABILITY_FIELDS = ("slug", "team", "niche", "avatar")


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks = 0

    def check(self, ok: bool, message: str) -> None:
        self.checks += 1
        if not ok:
            self.failures.append(message)


def load(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        default=".output/public",
        help="built output root containing ai-factory/roster (default: .output/public)",
    )
    args = parser.parse_args(argv)

    exports = Path(args.root) / EXPORT_REL
    if not exports.is_dir():
        print(f"export directory not found: {exports}", file=sys.stderr)
        print("Run `bun run build` (or `node scripts/generate-ai-factory-exports.mjs`) first.", file=sys.stderr)
        return 2

    report = Report()

    index = load(exports / "index.json")
    agents = index.get("agents") or []
    report.check(bool(agents), "index.json lists no agents")
    report.check(
        index.get("count") == len(agents),
        f"index count {index.get('count')} != {len(agents)} agents",
    )

    slugs = [a["slug"] for a in agents if isinstance(a, dict) and a.get("slug")]
    report.check(len(slugs) == len(set(slugs)), "index.json contains duplicate slugs")

    for fmt in FORMATS:
        directory = exports / fmt
        report.check(directory.is_dir(), f"missing format directory: {fmt}")
        if not directory.is_dir():
            continue
        on_disk = {p.stem for p in directory.iterdir() if p.is_file()}
        missing = set(slugs) - on_disk
        report.check(not missing, f"{fmt}: {len(missing)} agents missing (e.g. {sorted(missing)[:3]})")

    for slug in slugs:
        neutral_path = exports / "neutral" / f"{slug}.json"
        if not neutral_path.is_file():
            continue
        neutral = load(neutral_path)
        for field in SEVEN_FIELDS:
            report.check(field in neutral, f"{slug}: neutral export missing field {field!r}")
        for field in PORTABILITY_FIELDS:
            report.check(field in neutral, f"{slug}: neutral export missing {field!r}")
        report.check(neutral.get("slug") == slug, f"{slug}: neutral slug mismatch")

        # The honesty rule: a runtime export must not claim callable tools.
        for fmt in ("chatgpt", "claude", "hermes"):
            path = exports / fmt / f"{slug}.json"
            if not path.is_file():
                continue
            document = load(path)
            report.check(
                not document.get("tools"),
                f"{slug}: {fmt} export declares tools the agent does not have",
            )
            report.check(
                document.get("slug") == slug,
                f"{slug}: {fmt} export slug mismatch",
            )

        prompt_path = exports / "prompt" / f"{slug}.md"
        if prompt_path.is_file():
            text = prompt_path.read_text(encoding="utf-8")
            report.check(bool(text.strip()), f"{slug}: prompt export is empty")
            report.check(
                neutral.get("instruction", "")[:60] in text,
                f"{slug}: prompt export does not carry the instruction",
            )

    manifest = load(exports / "mcp" / "manifest.json")
    tool_names = {t["name"] for t in manifest.get("tools", [])}
    report.check(
        tool_names == {"ai_factory_list_agents", "ai_factory_get_agent", "ai_factory_get_export"},
        f"MCP manifest tools unexpected: {sorted(tool_names)}",
    )
    report.check(
        manifest.get("transport", {}).get("url", "").endswith("/ai-factory/mcp"),
        "MCP manifest transport URL is not /ai-factory/mcp",
    )

    openapi = load(exports / "openapi.json")
    report.check(openapi.get("openapi", "").startswith("3."), "openapi.json is not OpenAPI 3.x")
    report.check(
        "/ai-factory/mcp" in openapi.get("paths", {}),
        "openapi.json does not document the MCP endpoint",
    )

    print(f"AI Factory export contract: {report.checks} checks, {len(report.failures)} failed")
    if report.failures:
        for failure in report.failures[:40]:
            print(f"FAILED: {failure}", file=sys.stderr)
        if len(report.failures) > 40:
            print(f"... and {len(report.failures) - 40} more", file=sys.stderr)
        return 1
    print(f"All {len(slugs)} agents x {len(FORMATS)} formats verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
