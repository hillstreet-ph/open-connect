#!/usr/bin/env python3
"""Verify that production is actually serving `main` HEAD.

This is the gate that makes "merged" mean "live". It answers one question with
evidence: *is the commit running at open-connect.site the commit that is on
main right now?*

Why the existing checks were not enough
---------------------------------------
`ci.yml` already probes production after merge, but every one of those probes
asserts that *a* build answers. None of them asserts that the build is the one
that was just merged. So a merge whose Cloudflare Pages build never ran — or
ran and was superseded — passed every check while production served an older
commit. That is exactly how PR #941 shipped a dead `/ai-factory/mcp`.

What this checks
----------------
1. **Commit identity** — `/build-info.json` reports the same SHA as `main` HEAD.
   This is the load-bearing check; everything else is corroboration.
2. **Roster pages** — all 9 roster pages return their own real HTML, not the
   SPA shell (delegated to the existing `validate_ai_factory_roster.py`).
3. **Export URLs** — the per-agent export URLs resolve.
4. **MCP endpoint** — `/ai-factory/mcp` answers `initialize`, `tools/list`, and
   all three tools, with 103 agents in the roster.

When production does not match main, the gate can optionally name the build
that superseded it. If `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are
set, it asks the Cloudflare Pages API for the project's recent deployments and
reports the superseding build's commit, status, created time and URL. Without
them it says plainly that build-level detail is unavailable and behaves exactly
as it did before — the token is optional and its absence is never a failure.
See `scripts/cloudflare_pages.py` for the lookup and `docs/DEPLOY_VERIFY.md`
for the secret names and the minimum token scope.

Exit codes: 0 production matches main, 1 it does not, 2 bad usage.

Usage:
    python3 scripts/verify_production_deploy.py --expected-sha "$GITHUB_SHA"
    python3 scripts/verify_production_deploy.py --expected-sha auto
    python3 scripts/verify_production_deploy.py --expected-sha auto --wait 600
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import cloudflare_pages

DEFAULT_BASE_URL = "https://open-connect.site"
EXPECTED_AGENT_COUNT = 103
MCP_PATH = "/ai-factory/mcp"
BUILD_INFO_PATH = "/build-info.json"

# Transient conditions worth retrying: the deploy may still be propagating.
RETRYABLE_STATUS = {0, 408, 425, 429, 500, 502, 503, 504}


class Check:
    """One assertion, with the evidence needed to explain a failure."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.ok = False
        self.detail = ""

    def pass_(self, detail: str) -> "Check":
        self.ok = True
        self.detail = detail
        return self

    def fail(self, detail: str) -> "Check":
        self.ok = False
        self.detail = detail
        return self


def http_get(url: str, timeout: int = 25) -> tuple[int, bytes]:
    """GET a URL, returning (status, body). Status 0 means a transport error."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "open-connect-deploy-verify/1.0",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read() or b""
    except Exception:  # noqa: BLE001 - transport errors are all "status 0"
        return 0, b""


def http_post_json(url: str, payload: dict, timeout: int = 30) -> tuple[int, bytes]:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "User-Agent": "open-connect-deploy-verify/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read() or b""
    except Exception:  # noqa: BLE001
        return 0, b""


def resolve_expected_sha(value: str) -> str:
    """Resolve `auto` to main HEAD via the GitHub API, else pass the value through."""
    if value != "auto":
        return value.strip()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
    repo = os.environ.get("GITHUB_REPOSITORY") or "hillstreet-ph/open-connect"
    if not token:
        raise SystemExit(
            "verify: --expected-sha auto needs GITHUB_TOKEN (or GH_TOKEN) to read main HEAD"
        )

    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/git/ref/heads/main",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "open-connect-deploy-verify/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = json.loads(resp.read())
    return data["object"]["sha"]


def check_commit(
    base_url: str, expected: str, cf: "cloudflare_pages.CloudflarePages | None" = None
) -> Check:
    """The load-bearing check: does production report the commit we expect?

    On a mismatch, `cf` (when supplied) is asked to name the build that
    superseded production. That lookup is enrichment only: it can add a
    sentence to the failure detail, never change the verdict.
    """
    c = Check("commit identity")
    status, body = http_get(f"{base_url}{BUILD_INFO_PATH}")
    if status != 200:
        return c.fail(
            f"GET {BUILD_INFO_PATH} -> HTTP {status}. Production cannot state which "
            "commit it is serving, so a merge cannot be verified as live."
        )
    try:
        info = json.loads(body)
    except json.JSONDecodeError:
        return c.fail(f"{BUILD_INFO_PATH} is not valid JSON: {body[:200]!r}")

    served = str(info.get("commit", "")).strip()
    if not served or served == "unknown":
        return c.fail(
            f"{BUILD_INFO_PATH} reports commit={served!r}; the build did not record "
            "a SHA, so it cannot be matched to main."
        )
    if served != expected:
        detail = (
            f"production serves {served[:10]} but main HEAD is {expected[:10]} "
            f"(built_at={info.get('built_at')}, source={info.get('source')}). "
            "The merge did not reach production."
        )
        if cf is not None:
            try:
                build = cf.describe(expected, served)
                detail = f"{detail} {build.sentence()}"
            except Exception as exc:  # noqa: BLE001 - enrichment must never fail the gate
                detail = (
                    f"{detail} Build-level detail unavailable: lookup raised "
                    f"{type(exc).__name__}."
                )
        return c.fail(detail)
    return c.pass_(
        f"production serves {served[:10]} == main HEAD "
        f"(source={info.get('source')}, built_at={info.get('built_at')})"
    )


def check_roster(base_url: str, script: Path) -> Check:
    """All 9 roster pages must return their own HTML, not the SPA shell."""
    c = Check("roster pages (9)")
    if not script.exists():
        return c.fail(f"validator missing at {script}")
    proc = subprocess.run(
        [
            sys.executable,
            str(script),
            "--base-url",
            base_url,
            "--attempts",
            "3",
            "--timeout",
            "20",
            "--backoff",
            "2",
        ],
        capture_output=True,
        text=True,
    )
    tail = (proc.stdout or "").strip().splitlines()[-3:]
    summary = " | ".join(tail) if tail else (proc.stderr or "").strip()[:300]
    if proc.returncode != 0:
        return c.fail(f"roster validator exited {proc.returncode}: {summary}")
    return c.pass_(summary or "9/9 roster pages passed")


def check_exports(base_url: str) -> Check:
    """The per-agent export URLs must resolve to real content."""
    c = Check("export URLs")
    status, body = http_post_json(
        f"{base_url}{MCP_PATH}",
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "ai_factory_list_agents", "arguments": {}},
        },
    )
    if status != 200:
        return c.fail(f"list_agents -> HTTP {status}; cannot enumerate exports")
    try:
        payload = json.loads(body)
        text = payload["result"]["content"][0]["text"]
        agents = json.loads(text)["agents"]
    except Exception as exc:  # noqa: BLE001
        return c.fail(f"could not parse agent list: {exc}")

    if not agents:
        return c.fail("agent list is empty")

    # Sample across the roster rather than hammering all 103 on every merge.
    sample = [agents[0], agents[len(agents) // 2], agents[-1]]
    failures: list[str] = []
    checked = 0
    for agent in sample:
        slug = agent.get("slug")
        if not slug:
            continue
        for fmt in ("neutral", "chatgpt"):
            status, body = http_post_json(
                f"{base_url}{MCP_PATH}",
                {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {
                        "name": "ai_factory_get_export",
                        "arguments": {"slug": slug, "format": fmt},
                    },
                },
            )
            checked += 1
            if status != 200:
                failures.append(f"{slug}/{fmt} -> HTTP {status}")
                continue
            try:
                res = json.loads(body)["result"]
                if res.get("isError"):
                    failures.append(f"{slug}/{fmt} -> isError")
                elif not res.get("content"):
                    failures.append(f"{slug}/{fmt} -> empty content")
            except Exception:  # noqa: BLE001
                failures.append(f"{slug}/{fmt} -> unparseable")

    if failures:
        return c.fail(f"{len(failures)}/{checked} export fetches failed: {failures[:5]}")
    return c.pass_(f"{checked}/{checked} export fetches resolved across {len(sample)} agents")


def check_mcp(base_url: str) -> Check:
    """initialize + tools/list + all three tools, with 103 agents."""
    c = Check("MCP endpoint")
    url = f"{base_url}{MCP_PATH}"

    status, body = http_post_json(
        url,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "deploy-verify", "version": "1.0"},
            },
        },
    )
    if status != 200:
        return c.fail(f"initialize -> HTTP {status}: {body[:200]!r}")
    try:
        init = json.loads(body)["result"]
    except Exception:  # noqa: BLE001
        return c.fail(f"initialize returned no result: {body[:200]!r}")
    server = (init.get("serverInfo") or {}).get("name", "?")

    status, body = http_post_json(
        url, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
    )
    if status != 200:
        return c.fail(f"tools/list -> HTTP {status}")
    try:
        tools = [t["name"] for t in json.loads(body)["result"]["tools"]]
    except Exception:  # noqa: BLE001
        return c.fail(f"tools/list returned no tools: {body[:200]!r}")

    required = {"ai_factory_list_agents", "ai_factory_get_agent", "ai_factory_get_export"}
    missing = required - set(tools)
    if missing:
        return c.fail(f"tools/list missing {sorted(missing)}; got {tools}")

    # Every advertised tool must actually answer, not just be listed.
    for i, name in enumerate(sorted(required), start=10):
        args = {} if name == "ai_factory_list_agents" else {"slug": "product-designer"}
        if name == "ai_factory_get_export":
            args["format"] = "neutral"
        status, body = http_post_json(
            url,
            {
                "jsonrpc": "2.0",
                "id": i,
                "method": "tools/call",
                "params": {"name": name, "arguments": args},
            },
        )
        if status != 200:
            return c.fail(f"{name} -> HTTP {status}")
        try:
            res = json.loads(body)["result"]
        except Exception:  # noqa: BLE001
            return c.fail(f"{name} returned no result: {body[:200]!r}")
        if res.get("isError"):
            return c.fail(f"{name} returned isError: {res.get('content')}")

        if name == "ai_factory_list_agents":
            try:
                count = json.loads(res["content"][0]["text"])["count"]
            except Exception:  # noqa: BLE001
                return c.fail("list_agents payload has no count")
            if count != EXPECTED_AGENT_COUNT:
                return c.fail(
                    f"roster has {count} agents, expected {EXPECTED_AGENT_COUNT}"
                )

    return c.pass_(
        f"initialize ok (server={server}), 3/3 tools answer, "
        f"{EXPECTED_AGENT_COUNT} agents"
    )


def run_once(
    base_url: str,
    expected: str,
    script: Path,
    cf: "cloudflare_pages.CloudflarePages | None" = None,
) -> list[Check]:
    return [
        check_commit(base_url, expected, cf),
        check_roster(base_url, script),
        check_exports(base_url),
        check_mcp(base_url),
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--expected-sha",
        default="auto",
        help="Commit production must serve, or 'auto' to read main HEAD",
    )
    parser.add_argument(
        "--wait",
        type=int,
        default=0,
        help="Seconds to keep retrying while production has not caught up",
    )
    parser.add_argument("--interval", type=int, default=30)
    parser.add_argument(
        "--no-cloudflare",
        action="store_true",
        help="Skip the optional Cloudflare Pages build-detail lookup",
    )
    args = parser.parse_args(argv)

    expected = resolve_expected_sha(args.expected_sha)
    script = Path(__file__).resolve().parent / "validate_ai_factory_roster.py"

    # Optional enrichment. Constructed from the environment only; when the
    # token or account id is absent this object reports itself disabled and
    # makes no network call, so the gate behaves exactly as it did before.
    cf = None if args.no_cloudflare else cloudflare_pages.CloudflarePages.from_env()

    print(f"verify: base={args.base_url}")
    print(f"verify: expected commit={expected}")
    print(f"verify: wait budget={args.wait}s")
    if cf is None:
        print("verify: cloudflare build detail=disabled (--no-cloudflare)")
    elif cf.enabled:
        print(f"verify: cloudflare build detail=enabled (project={cf.project})")
    else:
        print(f"verify: cloudflare build detail=unavailable ({cf.disabled_reason})")
    print()

    deadline = time.time() + max(0, args.wait)
    attempt = 0
    checks: list[Check] = []

    while True:
        attempt += 1
        print(f"--- attempt {attempt} ---")
        checks = run_once(args.base_url, expected, script, cf)
        for c in checks:
            print(f"  [{'PASS' if c.ok else 'FAIL'}] {c.name}: {c.detail}")

        if all(c.ok for c in checks):
            break

        # Only the commit check is worth waiting on: a stale deploy may still be
        # propagating. A broken roster or MCP endpoint will not fix itself.
        commit_check = checks[0]
        if commit_check.ok or time.time() >= deadline:
            break
        print(f"  ... production not caught up; retrying in {args.interval}s")
        time.sleep(args.interval)
        print()

    print()
    failed = [c for c in checks if not c.ok]
    if not failed:
        print(f"PRODUCTION MATCHES MAIN ({expected[:10]}) — all checks passed")
        return 0

    print("=" * 72)
    print("PRODUCTION DOES NOT MATCH MAIN — DEPLOY VERIFICATION FAILED")
    print("=" * 72)
    for c in failed:
        print(f"  FAILED: {c.name}")
        print(f"          {c.detail}")
    print()
    print("A merge to main is NOT live. Investigate the Cloudflare Pages build")
    print("for this commit before treating the change as shipped.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
