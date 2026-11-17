#!/usr/bin/env python3
"""Offline-safe end-to-end verifier for the shadow-mirror + watcher stack.

By default this performs only local checks (files on disk, YAML structure,
registry / project-map counts, git tracking). No live Supabase or Databricks
API is contacted unless ``--live`` is passed, and even then only when the
relevant credentials are present in the environment.

A compact PASS/FAIL(/SKIP) table is printed and a non-zero exit status is
returned if any check FAILs. If TELEGRAM_PROJECT_BOT_TOKEN and
TELEGRAM_CHAT_ID are both set, a short summary is sent to Telegram; secret
values are never printed or logged.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / "config" / "supabase" / "table_registry.json"
PROJECT_MAP_PATH = Path("/data/home/workspace/supabase-export/project_map.json")

EXPECTED_REFS = {"huadtiuuoiriqrjpjxhr", "hoseohvgoiarxluxqwqv"}
EXPECTED_TOTAL = 135

# The four data scripts that make up the pipeline.
SCRIPTS = [
    "scripts/databricks_shadow_mirror.py",
    "scripts/supabase_realtime_watcher.py",
    "scripts/supabase_databricks_sync.py",
    "scripts/supabase_backup_janitor.py",
]
# The four workflows (two new ones plus the two existing scheduled ones).
WORKFLOWS = [
    ".github/workflows/databricks-shadow-mirror.yml",
    ".github/workflows/supabase-watcher-health.yml",
    ".github/workflows/supabase-databricks-sync.yml",
    ".github/workflows/supabase-backup-janitor.yml",
]
NEW_WORKFLOWS = WORKFLOWS[:2]


@dataclass
class Result:
    name: str
    status: str  # PASS | FAIL | SKIP
    detail: str = ""


class Results:
    def __init__(self) -> None:
        self.rows: list[Result] = []

    def add(self, name: str, ok: bool, detail: str = "") -> None:
        self.rows.append(Result(name, "PASS" if ok else "FAIL", detail))

    def skip(self, name: str, detail: str) -> None:
        self.rows.append(Result(name, "SKIP", detail))

    @property
    def failed(self) -> bool:
        return any(r.status == "FAIL" for r in self.rows)

    def print_table(self) -> None:
        name_w = max([len("CHECK")] + [len(r.name) for r in self.rows])
        status_w = 6
        print(f"{'CHECK':<{name_w}}  {'RESULT':<{status_w}}  DETAIL")
        print(f"{'-' * name_w}  {'-' * status_w}  {'-' * 40}")
        for r in self.rows:
            print(f"{r.name:<{name_w}}  {r.status:<{status_w}}  {r.detail}")


def _scrub(text: str) -> str:
    """Replace any secret-looking env value with '***' before printing."""
    for key, value in os.environ.items():
        if value and any(t in key.upper() for t in ("TOKEN", "SECRET", "PAT", "KEY", "PASSWORD")):
            text = text.replace(value, "***")
    return text


def check_files_exist(results: Results) -> None:
    for rel in SCRIPTS + WORKFLOWS:
        path = REPO_ROOT / rel
        results.add(f"exists: {rel}", path.is_file(), "" if path.is_file() else "missing")


def _simple_yaml_parse(text: str) -> bool:
    """Fallback structural check when PyYAML is not installed."""
    has_on = any(line.rstrip().startswith("on:") for line in text.splitlines())
    has_jobs = any(line.rstrip().startswith("jobs:") for line in text.splitlines())
    return has_on and has_jobs


def check_workflow_yaml(results: Results) -> None:
    try:
        import yaml  # type: ignore

        use_yaml = True
    except ImportError:
        use_yaml = False

    expectations = {
        "databricks-shadow-mirror.yml": ("*/30 * * * *", ("--once", "--verify")),
        "supabase-watcher-health.yml": ("*/5 * * * *", ("--once",)),
    }
    for rel in NEW_WORKFLOWS:
        path = REPO_ROOT / rel
        if not path.is_file():
            results.add(f"yaml: {rel}", False, "file missing")
            continue
        text = path.read_text(encoding="utf-8")
        try:
            parsed = yaml.safe_load(text) if use_yaml else None
            # PyYAML (YAML 1.1) reads the GitHub Actions `on:` key as boolean
            # True, while GitHub uses YAML 1.2 where it is the string "on".
            if use_yaml:
                has_on = isinstance(parsed, dict) and ("on" in parsed or True in parsed)
                ok = has_on and "jobs" in parsed
            else:
                ok = _simple_yaml_parse(text)
            detail = "parsed" if use_yaml else "simple parse"
        except Exception as exc:  # noqa: BLE001 - surface any parse error
            ok, detail = False, f"parse error: {type(exc).__name__}: {exc}"
        if ok:
            cron, flags = expectations.get(Path(rel).name, (None, ()))
            missing = []
            if cron and cron not in text:
                missing.append(f"cron {cron}")
            for flag in flags:
                if flag not in text:
                    missing.append(flag)
            if missing:
                ok, detail = False, "missing " + ", ".join(missing)
        results.add(f"yaml: {rel}", ok, detail)


def check_registry(results: Results) -> None:
    if not REGISTRY_PATH.is_file():
        results.add("registry: 135 entries / 2 refs", False, "registry file missing")
        return
    try:
        data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        results.add("registry: 135 entries / 2 refs", False, f"bad JSON: {exc}")
        return
    tables = data.get("tables") if isinstance(data, dict) else None
    if not isinstance(tables, dict):
        results.add("registry: 135 entries / 2 refs", False, "missing 'tables' object")
        return
    refs = set(tables)
    total = sum(len(v) for v in tables.values() if hasattr(v, "__len__"))
    detail = f"{total} entries across {len(refs)} refs ({', '.join(sorted(refs))})"
    ok = total == EXPECTED_TOTAL and refs == EXPECTED_REFS
    results.add("registry: 135 entries / 2 refs", ok, detail)


def check_project_map(results: Results) -> None:
    if not PROJECT_MAP_PATH.is_file():
        results.add("project_map: 135 entries / no dupes", False, str(PROJECT_MAP_PATH) + " missing")
        return
    try:
        data = json.loads(PROJECT_MAP_PATH.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        results.add("project_map: 135 entries / no dupes", False, f"bad JSON: {exc}")
        return
    if not isinstance(data, list):
        results.add("project_map: 135 entries / no dupes", False, "not a JSON list")
        return

    def duplicates(values: Iterable) -> int:
        seen: set = set()
        dupes: set = set()
        for v in values:
            if v in seen:
                dupes.add(v)
            seen.add(v)
        return len(dupes)

    dt_dupes = duplicates(row.get("databricks_table") for row in data if isinstance(row, dict))
    triple_dupes = duplicates(
        (row.get("supabase_ref"), row.get("source_schema"), row.get("source_table"))
        for row in data
        if isinstance(row, dict)
    )
    ok = len(data) == EXPECTED_TOTAL and dt_dupes == 0 and triple_dupes == 0
    detail = f"{len(data)} entries, {dt_dupes} dup tables, {triple_dupes} dup (ref,schema,table)"
    results.add("project_map: 135 entries / no dupes", ok, detail)


def _test_candidates(rel: str) -> list[str]:
    p = Path(rel)
    stem = p.stem
    parent = p.parent.as_posix()
    return [
        f"{parent}/{stem}_test.py",
        f"{parent}/test_{stem}.py",
        f"{parent}/{stem}.test.py",
        f"tests/{stem}_test.py",
        f"tests/test_{stem}.py",
    ]


def check_tests(results: Results) -> None:
    for rel in SCRIPTS:
        candidates = _test_candidates(rel)
        found = next((c for c in candidates if (REPO_ROOT / c).is_file()), None)
        results.add(
            f"test for {Path(rel).name}",
            found is not None,
            found or "no test file found",
        )


def check_git_tracked(results: Results) -> None:
    expected = set(SCRIPTS + WORKFLOWS + [str(REGISTRY_PATH.relative_to(REPO_ROOT)), "scripts/verify_e2e_sync.py"])
    try:
        out = subprocess.check_output(
            ["git", "-C", str(REPO_ROOT), "ls-files"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        tracked = set(out.splitlines())
    except Exception as exc:  # noqa: BLE001
        results.add("git tracked files", False, f"git error: {exc}")
        return
    missing = sorted(expected - tracked)
    ok = not missing
    detail = "all tracked" if ok else "untracked: " + ", ".join(missing)
    results.add("git tracked files", ok, detail)


def check_live(results: Results) -> None:
    """Optional live checks; run only with --live and only with credentials."""
    token = os.environ.get("DATABRICKS_TOKEN")
    host = os.environ.get("DATABRICKS_HOST")
    pat = os.environ.get("SUPABASE_PAT")
    env = os.environ.copy()

    if token and host:
        cmd = [sys.executable, "scripts/databricks_shadow_mirror.py", "--verify"]
        try:
            proc = subprocess.run(cmd, cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=600)
            ok = proc.returncode == 0
            results.add("live: mirror --verify", ok, f"exit {proc.returncode}")
        except Exception as exc:  # noqa: BLE001
            results.add("live: mirror --verify", False, f"{type(exc).__name__}: {exc}")
    else:
        results.skip("live: mirror --verify", "no DATABRICKS_TOKEN/HOST")

    if pat and token and host:
        cmd = [sys.executable, "scripts/supabase_realtime_watcher.py", "--once"]
        try:
            proc = subprocess.run(cmd, cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=600)
            ok = proc.returncode == 0
            results.add("live: watcher --once", ok, f"exit {proc.returncode}")
        except Exception as exc:  # noqa: BLE001
            results.add("live: watcher --once", False, f"{type(exc).__name__}: {exc}")
    else:
        results.skip("live: watcher --once", "no SUPABASE_PAT/DATABRICKS creds")


def notify(results: Results) -> None:
    """Send a compact Telegram summary if both secret env vars are present."""
    token = os.environ.get("TELEGRAM_PROJECT_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not (token and chat):
        return
    counts = {s: sum(1 for r in results.rows if r.status == s) for s in ("PASS", "FAIL", "SKIP")}
    text = (
        "E2E sync verifier: "
        f"{counts['PASS']} PASS, {counts['FAIL']} FAIL, {counts['SKIP']} SKIP\n"
        + "\n".join(f"{r.status} {r.name}" for r in results.rows if r.status == "FAIL")
    )
    payload = json.dumps({"chat_id": chat, "text": text}).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
    except Exception as exc:  # noqa: BLE001 - never leak token/chat id
        print(f"[notify] Telegram delivery failed: {type(exc).__name__}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="also run live API checks when credentials are present")
    args = parser.parse_args()

    results = Results()
    check_files_exist(results)
    check_workflow_yaml(results)
    check_registry(results)
    check_project_map(results)
    check_tests(results)
    check_git_tracked(results)
    if args.live:
        check_live(results)

    print("=" * 72)
    print("E2E sync verification" + (" (live)" if args.live else " (offline)"))
    print("=" * 72)
    results.print_table()
    print()
    counts = {s: sum(1 for r in results.rows if r.status == s) for s in ("PASS", "FAIL", "SKIP")}
    print(f"SUMMARY: {counts['PASS']} PASS, {counts['FAIL']} FAIL, {counts['SKIP']} SKIP")
    notify(results)
    return 1 if results.failed else 0


if __name__ == "__main__":
    sys.exit(main())
