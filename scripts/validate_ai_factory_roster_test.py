#!/usr/bin/env python3
"""Unit tests for the AI Factory roster smoke contract.

These run offline: `fetch` is injected as a stub so the assertions about page
markers, SPA-shell detection, retry policy and the report table are exercised
without touching production.
"""

from __future__ import annotations

import unittest

import validate_ai_factory_roster as module
from validate_ai_factory_roster import (
    BASE_HREF_MARKER,
    ROSTER_ASSETS,
    ROSTER_PAGES,
    FetchOutcome,
    RosterPage,
    check_asset,
    check_legacy_html,
    check_page,
    fetch,
    render_table,
    run_checks,
)

PAGE = RosterPage("teams", "/ai-factory/roster/teams", "103 Agents")


def page_html(marker: str = "103 Agents") -> str:
    return (
        "<!DOCTYPE html><html><head>"
        f"{BASE_HREF_MARKER}"
        f"<title>Agent Teams &amp; Roster \u2014 {marker}</title>"
        "</head><body><h1>Agent Teams</h1></body></html>"
    )


SPA_SHELL = (
    "<!DOCTYPE html><html><head>"
    '<link rel="stylesheet" href="/assets/styles-x.css" data-precedence="default"/>'
    "<title>Open-Connect \u2014 Unified AI agent integration platform</title>"
    '</head><body><div id="root"></div></body></html>'
)


def stub_fetch(outcome: FetchOutcome):
    """A fetch replacement that always yields `outcome`."""

    def _fetch(_url, **_kwargs):
        return outcome

    return _fetch


def healthy_fetch(_url, **_kwargs):
    """A fetch replacement that answers every roster URL correctly.

    Page URLs get the marker belonging to that page, so all nine can pass at
    once; assets get a plausible body.
    """
    for page in ROSTER_PAGES:
        if _url.endswith(page.path) or _url.endswith(f"{page.slug}.html"):
            return FetchOutcome(status=200, body=page_html(page.marker))
    if _url.endswith(".json"):
        return FetchOutcome(status=200, body='{"ok": true}')
    return FetchOutcome(status=200, body="body{color:#fff}")


class PageCheckTests(unittest.TestCase):
    def test_accepts_a_real_roster_page(self):
        result = check_page(
            PAGE, "https://example.test", fetch=stub_fetch(FetchOutcome(200, page_html()))
        )
        self.assertTrue(result.ok, result.detail)

    def test_rejects_the_spa_shell_even_at_200(self):
        # The regression that matters: the URL answers 200 but with the app shell.
        result = check_page(
            PAGE, "https://example.test", fetch=stub_fetch(FetchOutcome(200, SPA_SHELL))
        )
        self.assertFalse(result.ok)
        self.assertIn("SPA shell", result.detail)

    def test_rejects_a_page_missing_its_own_marker(self):
        result = check_page(
            PAGE,
            "https://example.test",
            fetch=stub_fetch(FetchOutcome(200, page_html(marker="Something Else"))),
        )
        self.assertFalse(result.ok)
        self.assertIn("missing page marker", result.detail)

    def test_rejects_a_page_missing_the_base_href(self):
        body = page_html().replace(BASE_HREF_MARKER, "")
        result = check_page(
            PAGE, "https://example.test", fetch=stub_fetch(FetchOutcome(200, body))
        )
        self.assertFalse(result.ok)
        self.assertIn("base href", result.detail)

    def test_rejects_a_non_200(self):
        result = check_page(
            PAGE, "https://example.test", fetch=stub_fetch(FetchOutcome(404, "not found"))
        )
        self.assertFalse(result.ok)
        self.assertIn("404", result.detail)

    def test_rejects_an_unreachable_page(self):
        result = check_page(
            PAGE,
            "https://example.test",
            fetch=stub_fetch(FetchOutcome(None, "", error="timed out")),
        )
        self.assertFalse(result.ok)
        self.assertIn("unreachable", result.detail)

    def test_rejects_an_empty_body(self):
        result = check_page(
            PAGE, "https://example.test", fetch=stub_fetch(FetchOutcome(200, "   "))
        )
        self.assertFalse(result.ok)
        self.assertIn("empty body", result.detail)


class AssetCheckTests(unittest.TestCase):
    def test_accepts_a_resolving_asset(self):
        result = check_asset(
            "assets/site.css",
            "https://example.test",
            fetch=stub_fetch(FetchOutcome(200, "body{color:#fff}")),
        )
        self.assertTrue(result.ok, result.detail)

    def test_rejects_a_missing_asset(self):
        result = check_asset(
            "assets/site.css", "https://example.test", fetch=stub_fetch(FetchOutcome(404, ""))
        )
        self.assertFalse(result.ok)

    def test_rejects_invalid_json_for_a_json_asset(self):
        result = check_asset(
            "data/catalog-v11.json",
            "https://example.test",
            fetch=stub_fetch(FetchOutcome(200, "<html>error</html>")),
        )
        self.assertFalse(result.ok)
        self.assertIn("invalid JSON", result.detail)

    def test_accepts_valid_json_for_a_json_asset(self):
        result = check_asset(
            "data/catalog-v11.json",
            "https://example.test",
            fetch=stub_fetch(FetchOutcome(200, '{"agents": []}')),
        )
        self.assertTrue(result.ok, result.detail)


class LegacyHtmlTests(unittest.TestCase):
    def test_accepts_the_html_form(self):
        result = check_legacy_html(
            PAGE, "https://example.test", fetch=stub_fetch(FetchOutcome(200, page_html()))
        )
        self.assertTrue(result.ok, result.detail)

    def test_rejects_the_html_form_serving_the_shell(self):
        result = check_legacy_html(
            PAGE, "https://example.test", fetch=stub_fetch(FetchOutcome(200, SPA_SHELL))
        )
        self.assertFalse(result.ok)


class RetryPolicyTests(unittest.TestCase):
    """Drive the real `fetch` against a stubbed urlopen to prove retry policy."""

    class _Response:
        def __init__(self, status: int, body: str):
            self.status = status
            self._body = body.encode()

        def read(self) -> bytes:
            return self._body

        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

    def _run(self, queue: list[FetchOutcome], attempts: int = 3) -> tuple[FetchOutcome, int]:
        original = module.urllib.request.urlopen
        calls = []

        def _urlopen(_request, timeout=None):  # noqa: ARG001
            calls.append(1)
            item = queue.pop(0)
            if item.status is None:
                raise module.urllib.error.URLError(item.error)
            if item.status >= 400:
                raise module.urllib.error.HTTPError("u", item.status, item.error, {}, None)
            return self._Response(item.status, item.body)

        module.urllib.request.urlopen = _urlopen
        try:
            result = fetch(
                "https://example.test/x",
                attempts=attempts,
                backoff=0,
                sleep=lambda _s: None,
            )
        finally:
            module.urllib.request.urlopen = original
        return result, len(calls)

    def test_retries_a_transient_5xx_then_succeeds(self):
        result, calls = self._run(
            [
                FetchOutcome(503, "", error="HTTP 503", transient=True),
                FetchOutcome(200, page_html()),
            ]
        )
        self.assertEqual(result.status, 200)
        self.assertIn("103 Agents", result.body)
        self.assertEqual(calls, 2)

    def test_retries_a_connection_error_then_succeeds(self):
        result, calls = self._run(
            [
                FetchOutcome(None, "", error="connection reset", transient=True),
                FetchOutcome(200, page_html()),
            ]
        )
        self.assertEqual(result.status, 200)
        self.assertEqual(calls, 2)

    def test_does_not_retry_a_404(self):
        result, calls = self._run([FetchOutcome(404, "", error="not found")], attempts=5)
        self.assertEqual(result.status, 404)
        self.assertEqual(calls, 1, "a 404 must not be retried")

    def test_gives_up_after_the_attempt_budget(self):
        result, calls = self._run(
            [FetchOutcome(503, "", error="HTTP 503", transient=True) for _ in range(3)],
            attempts=3,
        )
        self.assertEqual(result.status, 503)
        self.assertEqual(calls, 3)


class ReportTests(unittest.TestCase):
    def test_all_checks_pass_against_a_healthy_site(self):
        results = run_checks("https://example.test", fetch=healthy_fetch)
        self.assertEqual(len(results), len(ROSTER_PAGES) * 2 + len(ROSTER_ASSETS))
        self.assertTrue(all(r.ok for r in results), [r for r in results if not r.ok])
        table = render_table(results, len(ROSTER_PAGES))
        self.assertIn(f"Roster pages: {len(ROSTER_PAGES)}/{len(ROSTER_PAGES)} passed", table)

    def test_table_names_each_failing_page(self):
        results = run_checks("https://example.test", fetch=healthy_fetch)
        # Break exactly one page and confirm the table names it.
        target = next(r for r in results if r.name == "teams")
        target.ok = False
        target.detail = "HTTP 404"

        table = render_table(results, len(ROSTER_PAGES))

        self.assertIn("teams", table)
        self.assertIn("FAIL", table)
        self.assertIn("HTTP 404", table)
        self.assertIn(
            f"Roster pages: {len(ROSTER_PAGES) - 1}/{len(ROSTER_PAGES)} passed", table
        )

    def test_table_reports_every_page_row(self):
        results = run_checks("https://example.test", fetch=healthy_fetch)
        table = render_table(results, len(ROSTER_PAGES))
        for page in ROSTER_PAGES:
            self.assertIn(page.slug, table)


if __name__ == "__main__":
    unittest.main()
