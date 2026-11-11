#!/usr/bin/env python3
"""Validate the AI Factory portable exports against each target's real rules.

The generator (`scripts/generate-ai-factory-exports.mjs`) states the limits it
targets; this script is the independent check. It reads the generated tree and
asserts, per target, the things that actually decide whether an artifact works:

  ChatGPT  required fields present; name <= 50; description <= 300;
           instructions <= 8,000; <= 4 conversation starters
  Claude   project instructions non-empty; system prompt verbatim in the
           instructions; an http MCP server with the documented endpoint
  Hermes   config YAML parses; `mcp_servers` block has url + enabled + tools;
           SOUL.md carries the agent's instruction verbatim
  Prompt   front-matter parses; instruction present verbatim
  Neutral  all seven fields present and non-empty

It also checks the cross-cutting contract the site depends on: the index lists
every agent, every URL it advertises has a file behind it, and no export leaks
a credential-shaped string.

Usage:
    python3 scripts/validate_ai_factory_exports.py
    python3 scripts/validate_ai_factory_exports.py --json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - CI installs it
    yaml = None

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "public" / "ai-factory" / "roster"
EXPORTS = ROSTER / "data" / "exports"

# ChatGPT's own ceilings.
GPT_NAME_MAX = 50
GPT_DESC_MAX = 300
GPT_INSTR_MAX = 8000
GPT_STARTERS_MAX = 4

# Credential shapes that must never appear in a shipped export.
SECRET_PATTERNS = [
    re.compile(r"ghp_[A-Za-z0-9]{30,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{40,}"),
    re.compile(r"sk-[A-Za-z0-9]{32,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._-]{30,}"),
    re.compile(r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*[\"'][A-Za-z0-9_\-]{24,}[\"']"),
]

REQUIRED_NEUTRAL = (
    "slug",
    "name",
    "description",
    "instruction",
    "knowledge",
    "tools",
    "skills",
    "connectors",
)


class Result:
    __slots__ = ("target", "slug", "ok", "detail")

    def __init__(self, target: str, slug: str, ok: bool, detail: str):
        self.target = target
        self.slug = slug
        self.ok = ok
        self.detail = detail


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def check_neutral(slug: str, neutral: dict) -> list[Result]:
    out = []
    missing = [k for k in REQUIRED_NEUTRAL if k not in neutral]
    empty = [
        k
        for k in ("slug", "name", "description", "instruction")
        if isinstance(neutral.get(k), str) and not neutral[k].strip()
    ]
    problems = []
    if missing:
        problems.append(f"missing fields: {', '.join(missing)}")
    if empty:
        problems.append(f"empty fields: {', '.join(empty)}")
    if neutral.get("slug") != slug:
        problems.append("slug does not match filename")
    out.append(
        Result(
            "neutral",
            slug,
            not problems,
            "; ".join(problems) if problems else f"{len(neutral['connectors'])} connectors, {len(neutral['skills'])} skills",
        )
    )
    return out


def check_chatgpt(slug: str, gpt: dict, instructions_txt: str) -> list[Result]:
    problems = []
    for key in ("name", "description", "instructions", "conversation_starters"):
        if key not in gpt:
            problems.append(f"missing {key}")
    if problems:
        return [Result("chatgpt", slug, False, "; ".join(problems))]

    if len(gpt["name"]) > GPT_NAME_MAX:
        problems.append(f"name {len(gpt['name'])} > {GPT_NAME_MAX}")
    if len(gpt["description"]) > GPT_DESC_MAX:
        problems.append(f"description {len(gpt['description'])} > {GPT_DESC_MAX}")
    if len(instructions_txt) > GPT_INSTR_MAX:
        problems.append(f"instructions {len(instructions_txt)} > {GPT_INSTR_MAX}")
    if len(gpt["conversation_starters"]) > GPT_STARTERS_MAX:
        problems.append(
            f"{len(gpt['conversation_starters'])} starters > {GPT_STARTERS_MAX}"
        )
    if gpt["instructions"] != instructions_txt:
        problems.append("JSON instructions differ from .instructions.txt")
    if not gpt.get("actions") == []:
        problems.append("actions must be empty (no credentials ship)")

    return [
        Result(
            "chatgpt",
            slug,
            not problems,
            "; ".join(problems)
            if problems
            else f"name {len(gpt['name'])}/{GPT_NAME_MAX}, instr {len(instructions_txt)}/{GPT_INSTR_MAX}, "
            f"{len(gpt['conversation_starters'])} starters",
        )
    ]


def check_claude(slug: str, claude: dict, guidance: str, neutral: dict) -> list[Result]:
    problems = []
    if not claude.get("project_instructions", "").strip():
        problems.append("empty project_instructions")
    if neutral["instruction"] not in guidance:
        problems.append("agent instruction missing from Project instructions")
    servers = claude.get("mcp_servers") or []
    if not servers:
        problems.append("no mcp_servers")
    else:
        srv = servers[0]
        if not str(srv.get("url", "")).startswith("https://"):
            problems.append("mcp server url is not https")
        if not srv.get("transport"):
            problems.append("mcp server transport not documented")
        if not str(srv.get("url", "")).endswith("/ai-factory/mcp"):
            problems.append(f"unexpected mcp path: {srv.get('url')}")
    return [
        Result(
            "claude",
            slug,
            not problems,
            "; ".join(problems)
            if problems
            else f"instructions {len(claude['project_instructions'])} chars, mcp {servers[0]['url']} ({servers[0]['transport']})",
        )
    ]


def check_hermes(slug: str, conf: str, soul: str, neutral: dict) -> list[Result]:
    if yaml is None:
        return [Result("hermes", slug, False, "pyyaml not installed")]
    problems = []
    try:
        parsed = yaml.safe_load(conf)
    except Exception as exc:  # noqa: BLE001
        return [Result("hermes", slug, False, f"YAML does not parse: {exc}")]

    if not isinstance(parsed, dict):
        return [Result("hermes", slug, False, "YAML root is not a mapping")]
    servers = parsed.get("mcp_servers")
    if not isinstance(servers, dict) or not servers:
        problems.append("no mcp_servers block")
    else:
        srv = next(iter(servers.values()))
        if not str(srv.get("url", "")).startswith("https://"):
            problems.append("mcp_servers url missing or not https")
        if not srv.get("enabled"):
            problems.append("mcp_servers entry not enabled")
        tools = (srv.get("tools") or {}).get("include") or []
        if not tools:
            problems.append("no tools.include list")
    if neutral["instruction"] not in soul:
        problems.append("agent instruction missing from SOUL.md")

    return [
        Result(
            "hermes",
            slug,
            not problems,
            "; ".join(problems)
            if problems
            else f"YAML ok, mcp {servers and next(iter(servers.values())).get('url')}, soul {len(soul)} chars",
        )
    ]


def check_prompt(slug: str, text: str, neutral: dict) -> list[Result]:
    problems = []
    if not text.startswith("---\n"):
        problems.append("no front matter")
    else:
        end = text.find("\n---\n", 4)
        if end == -1:
            problems.append("front matter not closed")
        else:
            front = text[4:end]
            if yaml is not None:
                try:
                    meta = yaml.safe_load(front) or {}
                except Exception as exc:  # noqa: BLE001
                    problems.append(f"front matter does not parse: {exc}")
                    meta = {}
                if meta.get("slug") != slug:
                    problems.append("front matter slug mismatch")
                if not meta.get("name"):
                    problems.append("front matter missing name")
    if neutral["instruction"] not in text:
        problems.append("agent instruction missing from prompt")

    return [
        Result(
            "prompt",
            slug,
            not problems,
            "; ".join(problems) if problems else f"{len(text)} chars, instruction verbatim",
        )
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="emit a JSON report")
    args = ap.parse_args()

    if not EXPORTS.exists():
        print(f"[exports] missing {EXPORTS}; run node scripts/generate-ai-factory-exports.mjs")
        return 1

    index = read_json(EXPORTS / "index.json")
    slugs = [a["slug"] for a in index["agents"]]
    results: list[Result] = []
    missing_files: list[str] = []

    for slug in slugs:
        neutral = read_json(EXPORTS / "neutral" / f"{slug}.json")
        results += check_neutral(slug, neutral)

        gpt = read_json(EXPORTS / "chatgpt" / f"{slug}.json")
        txt_path = EXPORTS / "chatgpt" / f"{slug}.instructions.txt"
        txt = txt_path.read_text(encoding="utf-8") if txt_path.exists() else ""
        if not txt:
            missing_files.append(str(txt_path.relative_to(EXPORTS)))
        results += check_chatgpt(slug, gpt, txt)

        claude = read_json(EXPORTS / "claude" / f"{slug}.json")
        md_path = EXPORTS / "claude" / f"{slug}.instructions.md"
        md = md_path.read_text(encoding="utf-8") if md_path.exists() else ""
        if not md:
            missing_files.append(str(md_path.relative_to(EXPORTS)))
        results += check_claude(slug, claude, md, neutral)

        conf_path = EXPORTS / "hermes" / f"{slug}.config.yaml"
        soul_path = EXPORTS / "hermes" / f"{slug}.SOUL.md"
        conf = conf_path.read_text(encoding="utf-8") if conf_path.exists() else ""
        soul = soul_path.read_text(encoding="utf-8") if soul_path.exists() else ""
        if not conf or not soul:
            missing_files.append(f"hermes/{slug} (config or SOUL missing)")
        results += check_hermes(slug, conf, soul, neutral)

        pr_path = EXPORTS / "prompt" / f"{slug}.md"
        pr = pr_path.read_text(encoding="utf-8") if pr_path.exists() else ""
        if not pr:
            missing_files.append(str(pr_path.relative_to(EXPORTS)))
        results += check_prompt(slug, pr, neutral)

        # Every URL the index advertises must resolve to a file on disk.
        for key, url in index["agents"][slugs.index(slug)]["urls"].items():
            rel = url.split("/data/exports/", 1)[-1]
            if not (EXPORTS / rel).exists():
                missing_files.append(f"{slug}: {key} -> {rel}")

        # use-in payload must name every target and point at a real artifact.
        usein = read_json(EXPORTS / "use-in" / f"{slug}.json")
        ids = {t["id"] for t in usein["targets"]}
        if ids != {"chatgpt", "claude", "hermes", "generic"}:
            results.append(
                Result("use-in", slug, False, f"target ids are {sorted(ids)}")
            )
        else:
            bad = [
                t["artifact"]
                for t in usein["targets"]
                if not (EXPORTS / t["artifact"].split("/data/exports/", 1)[-1]).exists()
            ]
            results.append(
                Result(
                    "use-in",
                    slug,
                    not bad,
                    f"artifacts missing: {bad}" if bad else "4 targets, all artifacts present",
                )
            )

    # Cross-cutting: secret scan over every shipped text artifact.
    leaks: list[str] = []
    for path in EXPORTS.rglob("*"):
        if path.is_dir() or path.suffix not in {".json", ".md", ".txt", ".yaml"}:
            continue
        try:
            body = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for pat in SECRET_PATTERNS:
            if pat.search(body):
                leaks.append(str(path.relative_to(EXPORTS)))

    failed = [r for r in results if not r.ok]
    report = {
        "agents": len(slugs),
        "checks": len(results),
        "passed": len(results) - len(failed),
        "failed": len(failed),
        "missing_files": missing_files,
        "secret_leaks": sorted(set(leaks)),
        "failures": [
            {"target": r.target, "slug": r.slug, "detail": r.detail} for r in failed[:40]
        ],
    }

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for r in failed[:40]:
            print(f"FAIL {r.target}/{r.slug}: {r.detail}")
        for m in missing_files[:20]:
            print(f"MISSING {m}")
        # Never echo a matched value or the file it came from into a log: the
        # point of the scan is that a secret must not reach a log, and a path
        # next to a hit is enough for a reader to infer which artifact leaked.
        # The count is reported here; `--json` carries the paths for tooling.
        if report["secret_leaks"]:
            print(
                f"SECRET: {len(report['secret_leaks'])} artifact(s) matched a "
                "credential pattern; re-run with --json for the paths"
            )
        print(
            f"\n{report['passed']}/{report['checks']} checks passed across "
            f"{report['agents']} agents; {len(missing_files)} missing files, "
            f"{len(report['secret_leaks'])} secret hits"
        )

    if failed or missing_files or report["secret_leaks"]:
        print("AI Factory export validation FAILED", file=sys.stderr)
        return 1
    print("AI Factory export validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
