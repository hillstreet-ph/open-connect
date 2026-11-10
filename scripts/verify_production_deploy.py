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
import re
import socket
import ssl
import subprocess
import sys
import tempfile
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
    except Exception as exc:  # noqa: BLE001
        # Record *which* transport failure this was. A status of 0 alone cannot
        # tell a DNS failure from a timeout from a refused connection, and those
        # are three different faults. The 2-tuple return is unchanged so every
        # existing caller and test keeps working.
        _record_transport_failure(exc)
        return 0, b""


# The transport failure behind the most recent status-0 response. Reset at the
# start of each MCP check so a stale note can never be attributed to a later
# stage. Diagnostic only: it never changes a verdict.
_last_transport: dict[str, str] = {"kind": "", "error": ""}


def _record_transport_failure(exc: BaseException) -> None:
    reason = getattr(exc, "reason", None)
    kind = "connection"
    for candidate in (exc, reason):
        if isinstance(candidate, (TimeoutError, socket.timeout)):
            kind = "timeout"
            break
        if isinstance(candidate, socket.gaierror):
            kind = "dns"
            break
        if isinstance(candidate, ssl.SSLError):
            kind = "tls"
            break
    _last_transport["kind"] = kind
    _last_transport["error"] = str(reason or exc)


def _reset_transport() -> None:
    _last_transport["kind"] = ""
    _last_transport["error"] = ""


def _transport_phrase(timeout: int | None = None) -> str:
    """Describe the last transport failure, and what it implies."""
    kind = _last_transport["kind"] or "connection"
    reason = _last_transport["error"] or "no response"
    if kind == "dns":
        return (
            f"DNS lookup failed ({reason}) \u2014 the hostname did not resolve, so "
            "production was never reached"
        )
    if kind == "timeout":
        budget = f" after {timeout:g}s" if timeout else ""
        return (
            f"request timed out{budget} ({reason}) \u2014 production did not answer "
            "in time"
        )
    if kind == "tls":
        return (
            f"TLS handshake failed ({reason}) \u2014 the connection was never "
            "established"
        )
    return (
        f"connection failed ({reason}) \u2014 production did not answer at all"
    )


def _jsonrpc_error(body: bytes) -> str | None:
    """Return a description when `body` is a JSON-RPC error object, else None.

    A JSON-RPC error is a well-formed 200 response that carries a failure in
    `error` instead of `result`. Reporting it as "no result" hides the server's
    own code and message, which is the most useful part.
    """
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    error = payload.get("error")
    if not isinstance(error, dict):
        return None
    code = error.get("code", "?")
    message = str(error.get("message") or "").strip() or "no message"
    return f"JSON-RPC error {code}: {redact(message)}"


def _not_json(body: bytes) -> str:
    """Describe a body that is not JSON at all, without dumping a whole page."""
    head = body[:120].decode("utf-8", errors="replace").replace("\n", " ")
    return f"response is not valid JSON (body starts {redact(head)!r})"


# Anything that looks like a credential, so a server's own error text can never
# carry one into a log, a job summary or an issue body. The gate never sends a
# token, but a response body is not under its control.
_SECRET_PATTERNS = (
    re.compile(r"gh[pousr]_[A-Za-z0-9]{16,}"),          # GitHub tokens
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{16,}"),                # OpenAI-style keys
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{12,}"),    # bearer credentials
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[=:]\s*\S{8,}"),
)


def redact(text: str) -> str:
    """Strip anything credential-shaped from a string before it is printed."""
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[redacted]", text)
    return text


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


def _summarise_roster_report(report: dict) -> str:
    """Turn the validator's JSON report into a sentence naming what broke.

    The validator already classifies each failure (a 404, a timeout, a 200
    serving the SPA shell, a placeholder page). This groups those by kind so the
    gate says *which* fault it is instead of only that the validator exited 1.
    """
    checks = report.get("checks") or []
    failures = [c for c in checks if not c.get("ok")]
    if not failures:
        return ""

    by_kind: dict[str, list[str]] = {}
    for failure in failures:
        by_kind.setdefault(failure.get("kind") or "unknown", []).append(
            str(failure.get("name"))
        )

    parts = []
    for kind, names in sorted(by_kind.items()):
        shown = ", ".join(names[:4]) + ("\u2026" if len(names) > 4 else "")
        parts.append(f"{kind} ({len(names)}: {shown})")
    return "; ".join(parts)


def check_roster(base_url: str, script: Path) -> Check:
    """All 9 roster pages must return their own HTML, not the SPA shell.

    The validator does the probing and classifies each failure. It is asked for
    a JSON report so this check can name the failure mode (a missing page, a
    page serving the wrong content, production not answering) rather than
    repeating a bare exit code. The verdict is still the validator's exit code.
    """
    c = Check("roster pages (9)")
    if not script.exists():
        return c.fail(f"validator missing at {script}")

    report_path = Path(tempfile.mkdtemp(prefix="roster-report-")) / "report.json"
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
            "--json-report",
            str(report_path),
        ],
        capture_output=True,
        text=True,
    )
    tail = (proc.stdout or "").strip().splitlines()[-3:]
    summary = " | ".join(tail) if tail else (proc.stderr or "").strip()[:300]

    if proc.returncode != 0:
        detail = f"roster validator exited {proc.returncode}: {summary}"
        try:
            report = json.loads(report_path.read_text())
        except (OSError, json.JSONDecodeError):
            report = None
        if report:
            breakdown = _summarise_roster_report(report)
            if breakdown:
                detail = (
                    f"roster validator exited {proc.returncode} \u2014 "
                    f"{breakdown}. {summary}"
                )
        return c.fail(detail)
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


def _mcp_stage_failure(
    stage: str, status: int, body: bytes, *, timeout: int = 30
) -> str:
    """Describe a failed MCP stage, naming what actually happened.

    Every stage of the MCP handshake can fail in several distinct ways, and they
    mean different things: the endpoint never answered, it answered with a
    non-200, it answered 200 with something that is not JSON, or it answered
    with a well-formed JSON-RPC error. Each is named, with the stage that broke.
    """
    if status == 0:
        return f"{stage} \u2014 endpoint unreachable: {_transport_phrase(timeout)}"
    if status != 200:
        return (
            f"{stage} \u2014 HTTP {status}: the endpoint answered but refused the "
            "request"
        )
    rpc_error = _jsonrpc_error(body)
    if rpc_error:
        return f"{stage} \u2014 {rpc_error}"
    return f"{stage} \u2014 {_not_json(body)}"


def check_mcp(base_url: str) -> Check:
    """initialize + tools/list + all three tools, with 103 agents.

    Each stage reports its own failure mode: unreachable, non-200, not JSON, a
    JSON-RPC error, a wrong tool set, a tool answering isError, a wrong agent
    count, or a timeout. The verdict and exit code are unchanged \u2014 only the
    diagnosis is.
    """
    c = Check("MCP endpoint")
    url = f"{base_url}{MCP_PATH}"
    _reset_transport()

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
        return c.fail(_mcp_stage_failure("initialize", status, body))
    rpc_error = _jsonrpc_error(body)
    if rpc_error:
        return c.fail(f"initialize \u2014 {rpc_error}")
    try:
        init = json.loads(body)["result"]
    except json.JSONDecodeError:
        return c.fail(f"initialize \u2014 {_not_json(body)}")
    except (KeyError, TypeError):
        return c.fail(
            "initialize \u2014 the response is JSON but carries no result, so the "
            "server never completed the handshake"
        )
    server = (init.get("serverInfo") or {}).get("name", "?")

    status, body = http_post_json(
        url, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
    )
    if status != 200:
        return c.fail(_mcp_stage_failure("tools/list", status, body))
    rpc_error = _jsonrpc_error(body)
    if rpc_error:
        return c.fail(f"tools/list \u2014 {rpc_error}")
    try:
        tools = [t["name"] for t in json.loads(body)["result"]["tools"]]
    except json.JSONDecodeError:
        return c.fail(f"tools/list \u2014 {_not_json(body)}")
    except (KeyError, TypeError):
        return c.fail(
            "tools/list \u2014 the response is JSON but carries no tool list, so the "
            "server did not advertise its tools"
        )

    required = {"ai_factory_list_agents", "ai_factory_get_agent", "ai_factory_get_export"}
    missing = required - set(tools)
    if missing:
        return c.fail(
            f"tools/list \u2014 wrong tool set: missing {sorted(missing)}; got {tools}"
        )

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
            return c.fail(_mcp_stage_failure(f"tools/call {name}", status, body))
        rpc_error = _jsonrpc_error(body)
        if rpc_error:
            return c.fail(f"tools/call {name} \u2014 {rpc_error}")
        try:
            res = json.loads(body)["result"]
        except (json.JSONDecodeError, KeyError, TypeError):
            return c.fail(
                f"tools/call {name} \u2014 the response is JSON but carries no "
                "result, so the tool did not answer"
            )
        if res.get("isError"):
            return c.fail(
                f"tools/call {name} \u2014 the tool answered isError true: "
                f"{res.get('content')}"
            )

        if name == "ai_factory_list_agents":
            try:
                count = json.loads(res["content"][0]["text"])["count"]
            except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                return c.fail(
                    "tools/call ai_factory_list_agents \u2014 the payload has no "
                    "count, so the roster size cannot be checked"
                )
            if count != EXPECTED_AGENT_COUNT:
                return c.fail(
                    f"tools/call ai_factory_list_agents \u2014 roster has {count} "
                    f"agents, expected {EXPECTED_AGENT_COUNT}"
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
            print(f"  [{'PASS' if c.ok else 'FAIL'}] {c.name}: {redact(c.detail)}")

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
        print(f"          {redact(c.detail)}")
    print()
    print("A merge to main is NOT live. Investigate the Cloudflare Pages build")
    print("for this commit before treating the change as shipped.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
