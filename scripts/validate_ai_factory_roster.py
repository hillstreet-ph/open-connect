#!/usr/bin/env python3
"""Smoke-test the AI Factory roster's nine static pages in production.

The roster is a self-contained static site served from `/ai-factory/roster/`.
It is NOT an SPA route, and it has broken twice in production:

  1. Exact-path asset serving 404'd every extensionless page URL.
  2. Cloudflare's `.html` canonicalization produced a 308/307 loop that landed
     on a path with no file.

Both failures were silent in the sense that mattered: the URL still answered,
but with the app's SPA shell instead of the page. A status-code-only check
would have passed. So every page is asserted on its own real HTML — a
page-specific marker must be present AND the SPA shell must be absent.

Usage:
    python3 scripts/validate_ai_factory_roster.py
    python3 scripts/validate_ai_factory_roster.py --base-url https://open-connect.site
    python3 scripts/validate_ai_factory_roster.py --attempts 5 --timeout 20

Exit codes: 0 all checks passed, 1 a check failed, 2 bad usage.
"""

from __future__ import annotations

import argparse
import json
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

DEFAULT_BASE_URL = "https://open-connect.site"
ROSTER_PREFIX = "/ai-factory/roster/"

# The app's React SSR shell. If a roster URL answers with this, the static page
# did not resolve and the request fell through to the SPA — the exact regression
# this test exists to catch.
SPA_SHELL_MARKERS = (
    "Open-Connect \u2014 Unified AI agent integration platform",
    "data-precedence",
)

# A 200 that is really an edge/proxy error or a hosting placeholder. These are
# HTML, so a status-code check passes them; they are not roster content.
PLACEHOLDER_MARKERS = (
    "Error 520", "Error 521", "Error 522", "Error 523", "Error 524",
    "Web server is down", "Origin is unreachable", "Connection timed out",
    "There isn't a GitHub Pages site here", "Site not found",
    "This page could not be found", "404 Not Found",
)

# Every roster page must carry the injected base href, otherwise its relative
# `assets/`, `data/` and `images/` references resolve from the wrong directory.
BASE_HREF_MARKER = '<base href="/ai-factory/roster/">'

# How a failure should be *read*, which is not the same as how it is spelled.
# A 404 means the page is missing; a 200 with the SPA shell means the page
# exists but is serving the wrong content; a status 0 means production never
# answered. Those are different faults and the report must not blur them.
KIND_DNS = "dns"
KIND_TIMEOUT = "timeout"
KIND_TLS = "tls"
KIND_CONNECTION = "connection"
KIND_HTTP_STATUS = "http_status"
KIND_REDIRECT = "redirect"
KIND_EMPTY = "empty"
KIND_NOT_HTML = "not_html"
KIND_PLACEHOLDER = "placeholder"
KIND_WRONG_CONTENT = "wrong_content"
KIND_MISSING_MARKER = "missing_marker"
KIND_MISSING_BASE_HREF = "missing_base_href"
KIND_INVALID_JSON = "invalid_json"

# What each kind implies, in the words an operator needs to act on it.
KIND_IMPLICATION = {
    KIND_DNS: "the hostname did not resolve, so production was never reached",
    KIND_TIMEOUT: "the request timed out, so production did not answer in time",
    KIND_TLS: "the TLS handshake failed, so the connection was never established",
    KIND_CONNECTION: "the connection failed, so production did not answer at all",
    KIND_HTTP_STATUS: "the page is missing or the server refused it",
    KIND_REDIRECT: "the page redirected somewhere unexpected",
    KIND_EMPTY: "the page exists but served no content",
    KIND_NOT_HTML: "the page exists but is not serving HTML",
    KIND_PLACEHOLDER: "the page exists but is serving an error or placeholder page",
    KIND_WRONG_CONTENT: "the page exists but is serving the wrong content",
    KIND_MISSING_MARKER: "the page exists but is serving the wrong content",
    KIND_MISSING_BASE_HREF: "the page exists but its assets resolve from the wrong path",
    KIND_INVALID_JSON: "the asset exists but is not valid JSON",
}


def _classify_transport_error(exc: BaseException) -> str:
    """Name a transport failure the way an operator would describe it."""
    reason = getattr(exc, "reason", None)
    for candidate in (exc, reason):
        if isinstance(candidate, (TimeoutError, socket.timeout)):
            return KIND_TIMEOUT
        if isinstance(candidate, socket.gaierror):
            return KIND_DNS
        if isinstance(candidate, ssl.SSLError):
            return KIND_TLS
    return KIND_CONNECTION


def _canonical_key(url: str) -> str:
    """Reduce a URL to the path identity used to judge a redirect.

    Cloudflare canonicalizes `/x.html` to `/x` and `/x/index.html` to `/x/`.
    Those are the same page and must not be reported as an unexpected redirect.
    """
    key = url.split("?", 1)[0].split("#", 1)[0].rstrip("/")
    if key.endswith("/index.html"):
        key = key[: -len("/index.html")]
    elif key.endswith(".html"):
        key = key[: -len(".html")]
    return key


def _looks_like_html(body: str) -> bool:
    head = body.lstrip()[:512].lower()
    return head.startswith("<!doctype html") or "<html" in head


def _status_meaning(status: int) -> str:
    if status == 404:
        return "the page is missing"
    if status in (401, 403):
        return "the page exists but access was refused"
    if status in (301, 302, 307, 308):
        return "the page redirected instead of answering"
    if status == 429:
        return "the server rate-limited the request"
    if 500 <= status < 600:
        return "the server failed to serve the page"
    return "the server refused the request"


@dataclass(frozen=True)
class RosterPage:
    """One roster page: its clean URL slug and a marker unique to its own HTML."""

    slug: str
    path: str
    marker: str


# `index` is served at the directory root; the other eight at their clean URL.
ROSTER_PAGES: tuple[RosterPage, ...] = (
    RosterPage("index", ROSTER_PREFIX, "AI Factory \u2014 Agents, Teams"),
    RosterPage("teams", f"{ROSTER_PREFIX}teams", "103 Agents"),
    RosterPage("niches", f"{ROSTER_PREFIX}niches", "22 Markets, Bot vs Human"),
    RosterPage("playbooks", f"{ROSTER_PREFIX}playbooks", "Briefings"),
    RosterPage("hub", f"{ROSTER_PREFIX}hub", "Agency Hub"),
    RosterPage("studio", f"{ROSTER_PREFIX}studio", "Studio Builder"),
    RosterPage("connectors", f"{ROSTER_PREFIX}connectors", "Live Status"),
    RosterPage("command-center", f"{ROSTER_PREFIX}command-center", "All Deliverables"),
    RosterPage("registry", f"{ROSTER_PREFIX}registry", "Import Package"),
)

# Shared assets that must resolve from the roster base path. A page can render
# while its stylesheet, nav script or data file 404s, so these are checked
# separately from the pages themselves.
ROSTER_ASSETS: tuple[str, ...] = (
    "assets/site.css",
    "assets/nav.js",
    "assets/studio.js",
    "data/agents-v10.json",
    "data/catalog-v11.json",
    "images/agents/account-manager.webp",
)

# JSON assets are additionally parsed, so a truncated or HTML-error body fails.
JSON_ASSETS = frozenset({"data/agents-v10.json", "data/catalog-v11.json"})

# Portable exports, generated at build time by
# `scripts/generate-ai-factory-exports.mjs`. Every agent must be takeable into
# another runtime, so each of these must resolve for all 103 agents.
EXPORT_PREFIX = f"{ROSTER_PREFIX}data/exports/"
EXPORT_FORMATS: tuple[str, ...] = ("neutral", "chatgpt", "claude", "hermes", "prompt")

# The two manifest documents that describe the export set itself.
EXPORT_MANIFESTS: tuple[str, ...] = ("index.json", "openapi.json")


@dataclass
class CheckResult:
    """Outcome of one check, rendered as a row in the per-page table.

    `kind` names *which* failure this is (a 404, a timeout, a 200 serving the
    SPA shell) so a reader can tell "the page is missing" from "the page exists
    but is serving the wrong content" from "production did not answer at all".
    It is diagnostic only: `ok` alone decides pass/fail and the exit code.
    """

    name: str
    url: str
    ok: bool
    detail: str = ""
    kind: str = ""


@dataclass
class FetchOutcome:
    """A fetched response, or the reason no response was obtained."""

    status: int | None
    body: str
    error: str = ""
    transient: bool = False
    # Which transport failure this was (dns / timeout / tls / connection), so a
    # status-0 result can be described instead of printed as a bare "unreachable".
    kind: str = ""
    # Where the request actually landed, when it was redirected.
    final_url: str = ""


def _is_transient_status(status: int) -> bool:
    """5xx and 429 are worth retrying; 4xx (a real 404) is not."""
    return status >= 500 or status == 429


def fetch(
    url: str,
    *,
    timeout: float = 20.0,
    attempts: int = 4,
    backoff: float = 2.0,
    sleep: Callable[[float], None] = time.sleep,
) -> FetchOutcome:
    """GET `url`, retrying only transient failures.

    A production deploy can be mid-propagation when this runs, so connection
    errors, timeouts, 5xx and 429 are retried with exponential backoff. A 404 or
    any other 4xx is returned immediately — retrying it would only delay a real
    failure, and could mask it behind a later success.
    """
    last = FetchOutcome(status=None, body="", error="no attempt made", transient=True)

    for attempt in range(1, max(1, attempts) + 1):
        request = urllib.request.Request(
            url,
            headers={
                "user-agent": "open-connect-roster-smoke/1.0",
                "accept": "text/html,application/json,*/*",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read().decode("utf-8", errors="replace")
                status = response.status
                final_url = getattr(response, "geturl", lambda: url)() or url
        except urllib.error.HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001 - body is best-effort on errors
                pass
            status = exc.code
            if not _is_transient_status(status):
                return FetchOutcome(status=status, body=body)
            last = FetchOutcome(
                status=status, body=body, error=f"HTTP {status}", transient=True
            )
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            reason = getattr(exc, "reason", exc)
            last = FetchOutcome(
                status=None,
                body="",
                error=str(reason),
                transient=True,
                kind=_classify_transport_error(exc),
            )
        else:
            if _is_transient_status(status):
                last = FetchOutcome(
                    status=status, body=body, error=f"HTTP {status}", transient=True
                )
            else:
                return FetchOutcome(status=status, body=body, final_url=final_url)

        if attempt < attempts:
            sleep(backoff * (2 ** (attempt - 1)))

    return last


def _describe_transport_failure(outcome: FetchOutcome, timeout: float | None) -> str:
    """Say which transport failure happened, and what it implies.

    A status of None used to print one flat "unreachable: <reason>". A DNS
    failure, a timeout and a refused connection are three different faults with
    three different fixes, so each is named.
    """
    kind = outcome.kind or KIND_CONNECTION
    reason = outcome.error or "no response"
    if kind == KIND_DNS:
        what = f"DNS lookup failed ({reason})"
    elif kind == KIND_TIMEOUT:
        budget = f" after {timeout:g}s" if timeout else ""
        what = f"request timed out{budget} ({reason})"
    elif kind == KIND_TLS:
        what = f"TLS handshake failed ({reason})"
    else:
        what = f"connection failed ({reason})"
    return f"unreachable: {what} — {KIND_IMPLICATION[kind]}"


def _describe_status(status: int) -> str:
    """Name a non-200 status and what it implies about the page."""
    return f"HTTP {status} — {_status_meaning(status)}"


def _describe_body_problem(body: str) -> tuple[str, str] | None:
    """Classify a 200 body that is not the page we asked for.

    Returns (kind, message) or None when the body is plausible HTML. This is the
    case a status-code check cannot see: the URL answers 200 and the content is
    an edge error page, a hosting placeholder, or something that is not HTML.
    """
    if not body.strip():
        return KIND_EMPTY, f"empty body — {KIND_IMPLICATION[KIND_EMPTY]}"

    if not _looks_like_html(body):
        head = body.lstrip()[:60].replace("\n", " ")
        return (
            KIND_NOT_HTML,
            f"not HTML (body starts {head!r}) — {KIND_IMPLICATION[KIND_NOT_HTML]}",
        )

    for marker in PLACEHOLDER_MARKERS:
        if marker in body:
            return (
                KIND_PLACEHOLDER,
                f"placeholder/error page (matched {marker!r}) — "
                f"{KIND_IMPLICATION[KIND_PLACEHOLDER]}",
            )
    return None


def check_page(
    page: RosterPage,
    base_url: str,
    *,
    fetch: Callable[..., FetchOutcome] = fetch,
    **fetch_kwargs,
) -> CheckResult:
    """Assert one roster page returns 200 with its own HTML, not the SPA shell.

    Every failure mode is named separately, because they mean different things:
    a 404 is a missing page, a 200 carrying the SPA shell is a page that exists
    but serves the wrong content, and a status of None is production not
    answering at all. The verdict is unchanged — only the diagnosis is.
    """
    url = base_url.rstrip("/") + page.path
    outcome = fetch(url, **fetch_kwargs)

    if outcome.status is None:
        return CheckResult(
            page.slug,
            url,
            False,
            _describe_transport_failure(outcome, fetch_kwargs.get("timeout")),
            kind=outcome.kind or KIND_CONNECTION,
        )
    if outcome.status != 200:
        return CheckResult(
            page.slug, url, False, _describe_status(outcome.status), kind=KIND_HTTP_STATUS
        )

    # A redirect that lands on a different page is not the page we asked for,
    # even when the final response is a 200. Cloudflare's `.html`/trailing-slash
    # canonicalization is the same page and is not reported.
    if outcome.final_url and _canonical_key(outcome.final_url) != _canonical_key(url):
        return CheckResult(
            page.slug,
            url,
            False,
            f"redirected to {outcome.final_url} — {KIND_IMPLICATION[KIND_REDIRECT]}",
            kind=KIND_REDIRECT,
        )

    body = outcome.body
    problem = _describe_body_problem(body)
    if problem is not None:
        kind, message = problem
        return CheckResult(page.slug, url, False, message, kind=kind)

    for shell_marker in SPA_SHELL_MARKERS:
        if shell_marker in body:
            return CheckResult(
                page.slug,
                url,
                False,
                "served the SPA shell, not the roster page — "
                f"{KIND_IMPLICATION[KIND_WRONG_CONTENT]}",
                kind=KIND_WRONG_CONTENT,
            )

    if page.marker not in body:
        return CheckResult(
            page.slug,
            url,
            False,
            f"missing page marker {page.marker!r} — "
            f"{KIND_IMPLICATION[KIND_MISSING_MARKER]}",
            kind=KIND_MISSING_MARKER,
        )

    if BASE_HREF_MARKER not in body:
        return CheckResult(
            page.slug,
            url,
            False,
            f"missing injected base href — {KIND_IMPLICATION[KIND_MISSING_BASE_HREF]}",
            kind=KIND_MISSING_BASE_HREF,
        )

    return CheckResult(page.slug, url, True, "200, own HTML")


def check_asset(
    asset: str,
    base_url: str,
    *,
    fetch: Callable[..., FetchOutcome] = fetch,
    **fetch_kwargs,
) -> CheckResult:
    """Assert a shared roster asset resolves from the roster base path."""
    url = base_url.rstrip("/") + ROSTER_PREFIX + asset
    outcome = fetch(url, **fetch_kwargs)

    if outcome.status is None:
        return CheckResult(
            asset,
            url,
            False,
            _describe_transport_failure(outcome, fetch_kwargs.get("timeout")),
            kind=outcome.kind or KIND_CONNECTION,
        )
    if outcome.status != 200:
        return CheckResult(
            asset, url, False, _describe_status(outcome.status), kind=KIND_HTTP_STATUS
        )
    if not outcome.body.strip():
        return CheckResult(
            asset, url, False, f"empty body — {KIND_IMPLICATION[KIND_EMPTY]}", kind=KIND_EMPTY
        )

    if asset in JSON_ASSETS:
        try:
            json.loads(outcome.body)
        except json.JSONDecodeError as exc:
            return CheckResult(
                asset,
                url,
                False,
                f"invalid JSON: {exc} — {KIND_IMPLICATION[KIND_INVALID_JSON]}",
                kind=KIND_INVALID_JSON,
            )

    return CheckResult(asset, url, True, "200")


def check_legacy_html(
    page: RosterPage,
    base_url: str,
    *,
    fetch: Callable[..., FetchOutcome] = fetch,
    **fetch_kwargs,
) -> CheckResult:
    """Assert the pre-clean-URL `.html` form still serves the same real page.

    `index.html` legitimately canonicalizes to the directory root, so only the
    final status and body are asserted — not the URL.
    """
    label = f"{page.slug}.html"
    url = base_url.rstrip("/") + ROSTER_PREFIX + f"{page.slug}.html"
    outcome = fetch(url, **fetch_kwargs)

    if outcome.status is None:
        return CheckResult(
            label,
            url,
            False,
            _describe_transport_failure(outcome, fetch_kwargs.get("timeout")),
            kind=outcome.kind or KIND_CONNECTION,
        )
    if outcome.status != 200:
        return CheckResult(
            label, url, False, _describe_status(outcome.status), kind=KIND_HTTP_STATUS
        )

    body = outcome.body
    problem = _describe_body_problem(body)
    if problem is not None:
        kind, message = problem
        return CheckResult(label, url, False, message, kind=kind)

    for shell_marker in SPA_SHELL_MARKERS:
        if shell_marker in body:
            return CheckResult(
                label,
                url,
                False,
                "served the SPA shell, not the roster page — "
                f"{KIND_IMPLICATION[KIND_WRONG_CONTENT]}",
                kind=KIND_WRONG_CONTENT,
            )
    if page.marker not in body:
        return CheckResult(
            label,
            url,
            False,
            f"missing page marker {page.marker!r} — "
            f"{KIND_IMPLICATION[KIND_MISSING_MARKER]}",
            kind=KIND_MISSING_MARKER,
        )

    return CheckResult(label, url, True, "200, own HTML")


def run_checks(
    base_url: str = DEFAULT_BASE_URL,
    *,
    pages: Iterable[RosterPage] = ROSTER_PAGES,
    assets: Iterable[str] = ROSTER_ASSETS,
    fetch: Callable[..., FetchOutcome] = fetch,
    **fetch_kwargs,
) -> list[CheckResult]:
    """Run every roster check and return the results in report order."""
    results: list[CheckResult] = []
    for page in pages:
        results.append(check_page(page, base_url, fetch=fetch, **fetch_kwargs))
    for asset in assets:
        results.append(check_asset(asset, base_url, fetch=fetch, **fetch_kwargs))
    for page in pages:
        results.append(check_legacy_html(page, base_url, fetch=fetch, **fetch_kwargs))
    return results


def check_export_manifest(
    name: str,
    base_url: str,
    *,
    fetch: Callable[..., FetchOutcome] = fetch,
    **fetch_kwargs,
) -> CheckResult:
    """Assert an export manifest document resolves and parses as JSON."""
    url = base_url.rstrip("/") + EXPORT_PREFIX + name
    outcome = fetch(url, **fetch_kwargs)

    if outcome.status is None:
        return CheckResult(name, url, False, f"unreachable: {outcome.error}")
    if outcome.status != 200:
        return CheckResult(name, url, False, f"HTTP {outcome.status}")
    try:
        document = json.loads(outcome.body)
    except json.JSONDecodeError as exc:
        return CheckResult(name, url, False, f"invalid JSON: {exc}")

    if name == "index.json":
        count = document.get("count")
        agents = document.get("agents") or []
        if count != len(agents):
            return CheckResult(
                name, url, False, f"count {count} != {len(agents)} indexed agents"
            )
        if not agents:
            return CheckResult(name, url, False, "index lists no agents")
        return CheckResult(name, url, True, f"200, {len(agents)} agents indexed")

    return CheckResult(name, url, True, "200, valid JSON")


def check_export(
    slug: str,
    fmt: str,
    base_url: str,
    *,
    fetch: Callable[..., FetchOutcome] = fetch,
    **fetch_kwargs,
) -> CheckResult:
    """Assert one agent's export in one format resolves with parseable content.

    A `.md` export is only required to be non-empty text; the JSON formats are
    parsed, so a truncated or HTML-error body fails rather than passing on a 200.
    """
    ext = "md" if fmt == "prompt" else "json"
    label = f"{fmt}/{slug}"
    url = base_url.rstrip("/") + EXPORT_PREFIX + f"{fmt}/{slug}.{ext}"
    outcome = fetch(url, **fetch_kwargs)

    if outcome.status is None:
        return CheckResult(label, url, False, f"unreachable: {outcome.error}")
    if outcome.status != 200:
        return CheckResult(label, url, False, f"HTTP {outcome.status}")
    if not outcome.body.strip():
        return CheckResult(label, url, False, "empty body")

    if ext == "json":
        try:
            document = json.loads(outcome.body)
        except json.JSONDecodeError as exc:
            return CheckResult(label, url, False, f"invalid JSON: {exc}")
        if not isinstance(document, dict):
            return CheckResult(label, url, False, "export is not a JSON object")
        if document.get("slug") != slug:
            return CheckResult(
                label, url, False, f"slug mismatch: {document.get('slug')!r} != {slug!r}"
            )
        # The honesty rule: an export must never claim callable tools it lacks.
        if fmt in ("chatgpt", "claude", "hermes"):
            if document.get("tools"):
                return CheckResult(
                    label, url, False, "export declares tools the agent does not have"
                )
        return CheckResult(label, url, True, "200, valid JSON")

    return CheckResult(label, url, True, "200, non-empty text")


def run_export_checks(
    base_url: str = DEFAULT_BASE_URL,
    *,
    slugs: Iterable[str],
    formats: Iterable[str] = EXPORT_FORMATS,
    manifests: Iterable[str] = EXPORT_MANIFESTS,
    fetch: Callable[..., FetchOutcome] = fetch,
    **fetch_kwargs,
) -> list[CheckResult]:
    """Run the export checks for `slugs` across every format plus the manifests."""
    results: list[CheckResult] = []
    for name in manifests:
        results.append(check_export_manifest(name, base_url, fetch=fetch, **fetch_kwargs))
    for fmt in formats:
        for slug in slugs:
            results.append(
                check_export(slug, fmt, base_url, fetch=fetch, **fetch_kwargs)
            )
    return results


def _truncate(text: str, width: int) -> str:
    return text if len(text) <= width else text[: width - 1] + "\u2026"


def render_table(results: list[CheckResult], page_count: int) -> str:
    """Render a per-check table so a regression names the exact page that broke."""
    name_width = max([len("CHECK")] + [len(r.name) for r in results])
    detail_width = max([len("DETAIL")] + [len(r.detail) for r in results])

    lines = [
        f"{'CHECK'.ljust(name_width)}  {'RESULT'.ljust(6)}  {'DETAIL'.ljust(detail_width)}",
        f"{'-' * name_width}  {'-' * 6}  {'-' * detail_width}",
    ]
    for result in results:
        lines.append(
            f"{result.name.ljust(name_width)}  "
            f"{('PASS' if result.ok else 'FAIL').ljust(6)}  "
            f"{_truncate(result.detail, detail_width).ljust(detail_width)}"
        )

    passed = sum(1 for r in results if r.ok)
    page_results = results[:page_count]
    pages_passed = sum(1 for r in page_results if r.ok)
    lines.append("")
    lines.append(f"Roster pages: {pages_passed}/{page_count} passed")
    lines.append(f"All checks:   {passed}/{len(results)} passed")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Smoke-test the AI Factory roster's nine static pages."
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--attempts",
        type=int,
        default=4,
        help="attempts per URL for transient failures (default: 4)",
    )
    parser.add_argument(
        "--timeout", type=float, default=20.0, help="per-request timeout in seconds"
    )
    parser.add_argument(
        "--backoff", type=float, default=2.0, help="initial retry backoff in seconds"
    )
    parser.add_argument(
        "--skip-exports",
        action="store_true",
        help="check only the pages and assets, not the portable export URLs",
    )
    parser.add_argument(
        "--export-slugs",
        default="",
        help="comma-separated slugs to check instead of every agent in index.json",
    )
    parser.add_argument(
        "--json-report",
        default="",
        help=(
            "write a machine-readable report of every check to this path, so a "
            "caller (the deploy gate) can name the exact failure mode instead of "
            "parsing the table"
        ),
    )
    args = parser.parse_args(argv)

    if args.attempts < 1:
        print("--attempts must be at least 1", file=sys.stderr)
        return 2

    print(f"AI Factory roster smoke test against {args.base_url}")
    print()

    results = run_checks(
        args.base_url,
        attempts=args.attempts,
        timeout=args.timeout,
        backoff=args.backoff,
    )

    if not args.skip_exports:
        # The export set describes itself: `index.json` lists every agent, so the
        # smoke test needs no hard-coded slug list and cannot drift from the data.
        index_outcome = fetch(
            args.base_url.rstrip("/") + EXPORT_PREFIX + "index.json",
            attempts=args.attempts,
            timeout=args.timeout,
            backoff=args.backoff,
        )
        slugs: list[str] = []
        if index_outcome.status == 200:
            try:
                slugs = [
                    entry["slug"]
                    for entry in json.loads(index_outcome.body).get("agents", [])
                    if isinstance(entry, dict) and entry.get("slug")
                ]
            except (json.JSONDecodeError, AttributeError):
                slugs = []

        if args.export_slugs:
            slugs = [s for s in args.export_slugs.split(",") if s]

        results.extend(
            run_export_checks(
                args.base_url,
                slugs=slugs,
                attempts=args.attempts,
                timeout=args.timeout,
                backoff=args.backoff,
            )
        )

        if not slugs:
            results.append(
                CheckResult(
                    "exports",
                    args.base_url.rstrip("/") + EXPORT_PREFIX + "index.json",
                    False,
                    "index.json did not yield any agent slugs to verify",
                )
            )

    print(render_table(results, len(ROSTER_PAGES)))

    if args.json_report:
        # Diagnostic detail for a caller. Written before the exit code so a
        # failing run still leaves the reason behind.
        report = {
            "base_url": args.base_url,
            "page_count": len(ROSTER_PAGES),
            "passed": sum(1 for r in results if r.ok),
            "total": len(results),
            "checks": [
                {
                    "name": r.name,
                    "url": r.url,
                    "ok": r.ok,
                    "kind": r.kind,
                    "detail": r.detail,
                }
                for r in results
            ],
        }
        try:
            Path(args.json_report).write_text(json.dumps(report, indent=2) + "\n")
        except OSError as exc:
            print(f"could not write --json-report: {exc}", file=sys.stderr)

    failures = [r for r in results if not r.ok]
    if failures:
        print()
        for failure in failures:
            print(f"FAILED: {failure.name} ({failure.url}) \u2014 {failure.detail}", file=sys.stderr)
        return 1

    print()
    print("AI Factory roster smoke test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())