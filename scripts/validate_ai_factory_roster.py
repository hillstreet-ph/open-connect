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
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
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

# Every roster page must carry the injected base href, otherwise its relative
# `assets/`, `data/` and `images/` references resolve from the wrong directory.
BASE_HREF_MARKER = '<base href="/ai-factory/roster/">'


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


@dataclass
class CheckResult:
    """Outcome of one check, rendered as a row in the per-page table."""

    name: str
    url: str
    ok: bool
    detail: str = ""


@dataclass
class FetchOutcome:
    """A fetched response, or the reason no response was obtained."""

    status: int | None
    body: str
    error: str = ""
    transient: bool = False


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
            last = FetchOutcome(status=None, body="", error=str(reason), transient=True)
        else:
            if _is_transient_status(status):
                last = FetchOutcome(
                    status=status, body=body, error=f"HTTP {status}", transient=True
                )
            else:
                return FetchOutcome(status=status, body=body)

        if attempt < attempts:
            sleep(backoff * (2 ** (attempt - 1)))

    return last


def check_page(
    page: RosterPage,
    base_url: str,
    *,
    fetch: Callable[..., FetchOutcome] = fetch,
    **fetch_kwargs,
) -> CheckResult:
    """Assert one roster page returns 200 with its own HTML, not the SPA shell."""
    url = base_url.rstrip("/") + page.path
    outcome = fetch(url, **fetch_kwargs)

    if outcome.status is None:
        return CheckResult(page.slug, url, False, f"unreachable: {outcome.error}")
    if outcome.status != 200:
        return CheckResult(page.slug, url, False, f"HTTP {outcome.status}")

    body = outcome.body
    if not body.strip():
        return CheckResult(page.slug, url, False, "empty body")

    for shell_marker in SPA_SHELL_MARKERS:
        if shell_marker in body:
            return CheckResult(
                page.slug, url, False, "served the SPA shell, not the roster page"
            )

    if page.marker not in body:
        return CheckResult(
            page.slug, url, False, f"missing page marker {page.marker!r}"
        )

    if BASE_HREF_MARKER not in body:
        return CheckResult(page.slug, url, False, "missing injected base href")

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
        return CheckResult(asset, url, False, f"unreachable: {outcome.error}")
    if outcome.status != 200:
        return CheckResult(asset, url, False, f"HTTP {outcome.status}")
    if not outcome.body.strip():
        return CheckResult(asset, url, False, "empty body")

    if asset in JSON_ASSETS:
        try:
            json.loads(outcome.body)
        except json.JSONDecodeError as exc:
            return CheckResult(asset, url, False, f"invalid JSON: {exc}")

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
    url = base_url.rstrip("/") + ROSTER_PREFIX + f"{page.slug}.html"
    outcome = fetch(url, **fetch_kwargs)

    if outcome.status is None:
        return CheckResult(f"{page.slug}.html", url, False, f"unreachable: {outcome.error}")
    if outcome.status != 200:
        return CheckResult(f"{page.slug}.html", url, False, f"HTTP {outcome.status}")

    body = outcome.body
    for shell_marker in SPA_SHELL_MARKERS:
        if shell_marker in body:
            return CheckResult(
                f"{page.slug}.html", url, False, "served the SPA shell, not the roster page"
            )
    if page.marker not in body:
        return CheckResult(
            f"{page.slug}.html", url, False, f"missing page marker {page.marker!r}"
        )

    return CheckResult(f"{page.slug}.html", url, True, "200, own HTML")


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
    print(render_table(results, len(ROSTER_PAGES)))

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
