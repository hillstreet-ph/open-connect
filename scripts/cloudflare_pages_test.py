#!/usr/bin/env python3
"""Offline contract tests for the optional Cloudflare Pages build-detail lookup.

Four behaviours are pinned, because they are the four states the gate can be in:

1. **Token present, a superseding build exists** — the gate names that build:
   its commit, status, created time and deployment URL.
2. **Token present, no superseding build** — the gate says the build for main
   HEAD never started, and names the newest production deployment instead.
   This is a different fault from "it built and lost the race" and must not be
   reported as one.
3. **Token absent** — the gate keeps working exactly as before and says plainly
   that build-level detail is unavailable. It must not fail, and it must not
   make a network call.
4. **API error responses** — 401/403/500, `success: false`, a malformed body and
   a transport error all degrade to "unavailable" with a reason. None of them
   may raise, and none may turn a passing gate red.

Plus the security property: the token must never appear in any string the gate
can print, including error paths.

Everything here is mocked. No test touches the Cloudflare API or production.
"""

from __future__ import annotations

import json
import os
import unittest
from unittest import mock

import cloudflare_pages as cf
import verify_production_deploy as gate

MAIN_SHA = "73376d6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f"
OLD_SHA = "bc6ed48181aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
TOKEN = "cf-test-token-DO-NOT-LEAK-0123456789"
ACCOUNT = "0123456789abcdef0123456789abcdef"


def build_info(commit: str) -> bytes:
    return json.dumps(
        {
            "commit": commit,
            "short": commit[:10],
            "branch": "main",
            "source": "cloudflare-pages",
            "built_at": "2026-11-10T20:00:00.000Z",
        }
    ).encode()


def deployment(
    commit: str,
    status: str = "success",
    environment: str = "production",
    created: str = "2026-11-10T20:00:00.000Z",
    url: str = "https://abc123.open-connect-app.pages.dev",
) -> dict:
    return {
        "id": f"dep-{commit[:8]}",
        "short_id": commit[:8],
        "url": url,
        "created_on": created,
        "environment": environment,
        "latest_stage": {"name": "deploy", "status": status},
        "deployment_trigger": {
            "type": "ad_hoc",
            "metadata": {"commit_hash": commit, "branch": "main"},
        },
    }


def api_ok(deployments: list[dict]) -> tuple[int, dict, str]:
    return 200, {"success": True, "errors": [], "result": deployments}, ""


def make_client() -> cf.CloudflarePages:
    return cf.CloudflarePages(token=TOKEN, account=ACCOUNT, project="open-connect-app")


class TokenPresentSupersedingBuildTests(unittest.TestCase):
    """State 1: a build for main HEAD exists and is what should be live."""

    def test_names_the_superseding_build(self):
        deployments = [
            deployment(MAIN_SHA, status="success", created="2026-11-10T21:00:00Z"),
            deployment(OLD_SHA, status="success", created="2026-11-10T19:00:00Z"),
        ]
        with mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            detail = make_client().describe(MAIN_SHA, OLD_SHA)

        self.assertTrue(detail.available)
        self.assertIsNotNone(detail.superseding)
        self.assertEqual(detail.superseding["commit"], MAIN_SHA)
        self.assertEqual(detail.superseding["status"], "succeeded")
        self.assertEqual(detail.superseding["created"], "2026-11-10T21:00:00Z")
        self.assertIn("pages.dev", detail.superseding["url"])

    def test_sentence_carries_all_four_fields(self):
        deployments = [deployment(MAIN_SHA, status="active", created="2026-11-10T21:00:00Z")]
        with mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            sentence = make_client().describe(MAIN_SHA, OLD_SHA).sentence()

        self.assertIn(MAIN_SHA[:10], sentence)          # commit
        self.assertIn("still building", sentence)        # status, in words
        self.assertIn("2026-11-10T21:00:00Z", sentence)  # created
        self.assertIn("pages.dev", sentence)             # deployment URL

    def test_failed_superseding_build_is_reported_as_failed(self):
        deployments = [deployment(MAIN_SHA, status="failure")]
        with mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            detail = make_client().describe(MAIN_SHA, OLD_SHA)
        self.assertEqual(detail.superseding["status"], "failed")
        self.assertIn("failed", detail.sentence())

    def test_gate_failure_detail_includes_the_superseding_build(self):
        deployments = [deployment(MAIN_SHA, status="success")]
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(OLD_SHA))), \
             mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            c = gate.check_commit("https://x", MAIN_SHA, make_client())

        self.assertFalse(c.ok)
        self.assertIn("did not reach production", c.detail)
        self.assertIn("Superseding build", c.detail)
        self.assertIn(MAIN_SHA[:10], c.detail)


class TokenPresentNoSupersedingBuildTests(unittest.TestCase):
    """State 2: no deployment exists for main HEAD — the build never started."""

    def test_reports_that_the_build_never_started(self):
        deployments = [deployment(OLD_SHA, created="2026-11-10T19:00:00Z")]
        with mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            detail = make_client().describe(MAIN_SHA, OLD_SHA)

        self.assertTrue(detail.available)
        self.assertIsNone(detail.superseding)
        self.assertIn("never started", detail.sentence())
        self.assertIn(OLD_SHA[:10], detail.sentence())

    def test_does_not_claim_a_superseding_build_that_does_not_exist(self):
        deployments = [deployment(OLD_SHA)]
        with mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            sentence = make_client().describe(MAIN_SHA, OLD_SHA).sentence()
        self.assertNotIn("Superseding build", sentence)

    def test_empty_deployment_list_is_unavailable_not_a_guess(self):
        with mock.patch.object(cf, "_api_get", return_value=api_ok([])):
            detail = make_client().describe(MAIN_SHA, OLD_SHA)
        self.assertFalse(detail.available)
        self.assertIn("no deployments", detail.reason.lower())

    def test_deployments_without_commit_hashes_are_ignored(self):
        junk = [{"id": "x", "url": "https://y", "deployment_trigger": {"metadata": {}}}]
        with mock.patch.object(cf, "_api_get", return_value=api_ok(junk)):
            detail = make_client().describe(MAIN_SHA, OLD_SHA)
        self.assertFalse(detail.available)


class TokenAbsentTests(unittest.TestCase):
    """State 3: the default path. Must be unchanged and must not call out."""

    def test_disabled_without_token_or_account(self):
        client = cf.CloudflarePages(token="", account="")
        self.assertFalse(client.enabled)
        self.assertIn("no Cloudflare API token", client.disabled_reason)

    def test_disabled_with_token_but_no_account(self):
        client = cf.CloudflarePages(token=TOKEN, account="")
        self.assertFalse(client.enabled)
        self.assertIn(cf.ACCOUNT_ENV, client.disabled_reason)

    def test_disabled_with_account_but_no_token(self):
        client = cf.CloudflarePages(token="", account=ACCOUNT)
        self.assertFalse(client.enabled)
        self.assertIn(cf.TOKEN_ENV, client.disabled_reason)

    def test_no_network_call_when_disabled(self):
        with mock.patch.object(cf, "_api_get") as api:
            detail = cf.CloudflarePages(token="", account="").describe(MAIN_SHA, OLD_SHA)
        api.assert_not_called()
        self.assertFalse(detail.available)

    def test_says_plainly_that_detail_is_unavailable(self):
        detail = cf.CloudflarePages(token="", account="").describe(MAIN_SHA, OLD_SHA)
        self.assertIn("Build-level detail unavailable", detail.sentence())
        self.assertIn("CLOUDFLARE_API_TOKEN", detail.sentence())

    def test_gate_still_fails_on_mismatch_without_a_token(self):
        # The verdict must be identical to the pre-change behaviour.
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(OLD_SHA))):
            c = gate.check_commit("https://x", MAIN_SHA, cf.CloudflarePages(token="", account=""))
        self.assertFalse(c.ok)
        self.assertIn("did not reach production", c.detail)
        self.assertIn("Build-level detail unavailable", c.detail)

    def test_gate_passes_unchanged_without_a_token(self):
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(MAIN_SHA))):
            c = gate.check_commit("https://x", MAIN_SHA, cf.CloudflarePages(token="", account=""))
        self.assertTrue(c.ok)
        self.assertNotIn("Build-level detail", c.detail)

    def test_gate_works_when_no_client_is_supplied_at_all(self):
        # Backwards compatibility: the old two-argument call still works.
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(OLD_SHA))):
            c = gate.check_commit("https://x", MAIN_SHA)
        self.assertFalse(c.ok)
        self.assertNotIn("Build-level detail", c.detail)

    def test_from_env_reads_the_documented_names(self):
        env = {
            cf.TOKEN_ENV: TOKEN,
            cf.ACCOUNT_ENV: ACCOUNT,
            cf.PROJECT_ENV: "custom-project",
        }
        with mock.patch.dict(os.environ, env, clear=False):
            client = cf.CloudflarePages.from_env()
        self.assertTrue(client.enabled)
        self.assertEqual(client.project, "custom-project")

    def test_from_env_defaults_the_project_name(self):
        with mock.patch.dict(os.environ, {cf.TOKEN_ENV: TOKEN, cf.ACCOUNT_ENV: ACCOUNT}, clear=False):
            os.environ.pop(cf.PROJECT_ENV, None)
            client = cf.CloudflarePages.from_env()
        self.assertEqual(client.project, cf.DEFAULT_PROJECT)


class ApiErrorTests(unittest.TestCase):
    """State 4: every API failure degrades to unavailable. None may raise."""

    def _describe_with(self, response):
        with mock.patch.object(cf, "_api_get", return_value=response):
            return make_client().describe(MAIN_SHA, OLD_SHA)

    def test_401_is_unavailable(self):
        detail = self._describe_with((401, None, "HTTP 401 (Authentication error)"))
        self.assertFalse(detail.available)
        self.assertIn("401", detail.reason)

    def test_403_is_unavailable(self):
        detail = self._describe_with((403, None, "HTTP 403 (Unauthorized to access requested resource)"))
        self.assertFalse(detail.available)
        self.assertIn("403", detail.reason)

    def test_500_is_unavailable(self):
        detail = self._describe_with((500, None, "HTTP 500"))
        self.assertFalse(detail.available)
        self.assertIn("500", detail.reason)

    def test_transport_error_is_unavailable(self):
        detail = self._describe_with((0, None, "transport error (URLError)"))
        self.assertFalse(detail.available)
        self.assertIn("transport error", detail.reason)

    def test_success_false_is_unavailable(self):
        detail = self._describe_with((200, {"success": False, "errors": [], "result": None}, ""))
        self.assertFalse(detail.available)
        self.assertIn("success=false", detail.reason)

    def test_malformed_payload_is_unavailable(self):
        detail = self._describe_with((200, {"success": True, "result": "not-a-list"}, ""))
        self.assertFalse(detail.available)
        self.assertIn("unexpected payload", detail.reason)

    def test_none_payload_is_unavailable(self):
        detail = self._describe_with((200, None, ""))
        self.assertFalse(detail.available)

    def test_gate_does_not_raise_when_the_lookup_raises(self):
        # Belt and braces: even an unexpected exception inside describe() must
        # not escape into the gate's verdict.
        client = make_client()
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(OLD_SHA))), \
             mock.patch.object(client, "describe", side_effect=RuntimeError("boom")):
            c = gate.check_commit("https://x", MAIN_SHA, client)
        self.assertFalse(c.ok)
        self.assertIn("did not reach production", c.detail)
        self.assertIn("lookup raised RuntimeError", c.detail)

    def test_api_error_does_not_change_a_passing_verdict(self):
        # A broken Cloudflare API must never turn a green gate red.
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(MAIN_SHA))), \
             mock.patch.object(cf, "_api_get", return_value=(500, None, "HTTP 500")):
            c = gate.check_commit("https://x", MAIN_SHA, make_client())
        self.assertTrue(c.ok)


class TokenNeverLeaksTests(unittest.TestCase):
    """The token must not appear in anything the gate can print."""

    def test_redact_removes_the_secret(self):
        self.assertEqual(cf.redact(f"token={TOKEN}", TOKEN), "token=[redacted]")

    def test_redact_is_a_noop_without_a_secret(self):
        self.assertEqual(cf.redact("plain", ""), "plain")

    def test_error_reason_never_contains_the_token(self):
        # A hostile error body that echoes the token back must not survive.
        # Mocked: this suite must never make a real Cloudflare call.
        hostile = (401, None, f"HTTP 401 (invalid token {TOKEN})")
        with mock.patch.object(cf, "_api_get", return_value=hostile):
            detail = make_client().describe(MAIN_SHA, OLD_SHA)
        self.assertFalse(detail.available)
        self.assertNotIn(TOKEN, detail.reason)
        self.assertIn("[redacted]", detail.reason)

    def test_gate_detail_never_contains_the_token(self):
        deployments = [deployment(MAIN_SHA)]
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(OLD_SHA))), \
             mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            c = gate.check_commit("https://x", MAIN_SHA, make_client())
        self.assertNotIn(TOKEN, c.detail)

    def test_disabled_reason_never_contains_the_token(self):
        client = cf.CloudflarePages(token=TOKEN, account="")
        self.assertNotIn(TOKEN, client.disabled_reason)

    def test_authorization_header_is_the_only_place_the_token_goes(self):
        captured = {}

        def fake_urlopen(req, timeout=20):
            captured["headers"] = dict(req.headers)
            captured["url"] = req.full_url
            raise RuntimeError("stop here")

        with mock.patch.object(cf.urllib.request, "urlopen", side_effect=fake_urlopen):
            status, payload, error = cf._api_get("/accounts/x/pages/projects/y/deployments", TOKEN)

        self.assertEqual(status, 0)
        self.assertIn("Authorization", captured["headers"])
        self.assertEqual(captured["headers"]["Authorization"], f"Bearer {TOKEN}")
        # The token must not be smuggled into the URL, where it would land in logs.
        self.assertNotIn(TOKEN, captured["url"])
        self.assertNotIn(TOKEN, error)


class FailedBuildTests(unittest.TestCase):
    """A FAILED build is the case that matters most, and the one that was missed.

    A failed build means the deploy broke. A succeeded build that is not live
    means it lost a race. Those need different words, because they need
    different actions: one is "fix the build", the other is "wait for the next
    deploy". Before this class existed, every "superseding build" case was
    exercised with a build that had succeeded, so the failed path was never
    pinned \u2014 and it was wrong in two ways:

    1. `sentence()` printed "Superseding build: commit X is failed", which reads
       as a race, not a break.
    2. `describe()` took the *first* deployment matching main HEAD in whatever
       order the API returned. With an older success and a newer failure for the
       same commit, it reported the older success \u2014 claiming a build succeeded
       when the newest build for that commit had failed.
    """

    def _describe(self, deployments: list[dict]) -> cf.BuildDetail:
        with mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            return make_client().describe(MAIN_SHA, OLD_SHA)

    def test_failure_status_names_the_build_as_failed(self):
        detail = self._describe([deployment(MAIN_SHA, status="failure")])
        sentence = detail.sentence()

        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_FAILED)
        self.assertIn("FAILED", sentence)
        self.assertIn(MAIN_SHA[:10], sentence)                       # commit
        self.assertIn("status failed", sentence)                     # status
        self.assertIn("2026-11-10T20:00:00.000Z", sentence)          # created
        self.assertIn("pages.dev", sentence)                         # URL

    def test_failure_says_the_deploy_broke_not_that_it_was_superseded(self):
        sentence = self._describe([deployment(MAIN_SHA, status="failure")]).sentence()

        self.assertIn("deploy broke", sentence)
        self.assertIn("not a build that lost a race", sentence)
        # The old wording implied a race. It must be gone for a failed build.
        self.assertNotIn("Superseding build", sentence)

    def test_failure_never_claims_success(self):
        sentence = self._describe([deployment(MAIN_SHA, status="failure")]).sentence()
        self.assertNotIn("succeeded", sentence)
        self.assertNotIn("is failed", sentence)  # the old, race-flavoured phrasing

    def test_failed_status_spelling_is_also_recognised(self):
        # Cloudflare has used both "failure" and "failed"; neither may fall
        # through to the unrecognised-status branch.
        detail = self._describe([deployment(MAIN_SHA, status="failed")])
        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_FAILED)
        self.assertIn("FAILED", detail.sentence())

    def test_newest_canceled_wins_over_an_older_failure(self):
        # Two builds for main HEAD: the newest was cancelled, an earlier one
        # failed. The gate must report the newest, and may mention the earlier
        # failure as context \u2014 but must not report the failure as current.
        deployments = [
            deployment(MAIN_SHA, status="canceled", created="2026-11-10T22:00:00Z"),
            deployment(MAIN_SHA, status="failure", created="2026-11-10T21:00:00Z"),
        ]
        detail = self._describe(deployments)
        sentence = detail.sentence()

        self.assertEqual(detail.superseding["created"], "2026-11-10T22:00:00Z")
        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_CANCELLED)
        self.assertIn("cancelled", sentence)
        self.assertIn("2026-11-10T22:00:00Z", sentence)
        # The earlier failure is context, clearly marked as earlier.
        self.assertIn("earlier build for the same commit also failed", sentence)
        self.assertIn("2026-11-10T21:00:00Z", sentence)

    def test_newest_failure_wins_over_an_older_canceled(self):
        deployments = [
            deployment(MAIN_SHA, status="failure", created="2026-11-10T22:00:00Z"),
            deployment(MAIN_SHA, status="canceled", created="2026-11-10T21:00:00Z"),
        ]
        detail = self._describe(deployments)
        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_FAILED)
        self.assertIn("FAILED", detail.sentence())

    def test_failed_head_is_not_reported_as_an_older_success(self):
        # The regression that motivated this class: a failed build for main HEAD
        # alongside a succeeded build for an older commit. The older success
        # must not be presented as if it were current.
        deployments = [
            deployment(MAIN_SHA, status="failure", created="2026-11-10T21:00:00Z"),
            deployment(OLD_SHA, status="success", created="2026-11-10T19:00:00Z"),
        ]
        detail = self._describe(deployments)
        sentence = detail.sentence()

        self.assertEqual(detail.superseding["commit"], MAIN_SHA)
        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_FAILED)
        self.assertIn("FAILED", sentence)
        self.assertIn(MAIN_SHA[:10], sentence)
        # The older commit's success must not be offered as the current state.
        self.assertNotIn(OLD_SHA[:10], sentence)
        self.assertNotIn("succeeded", sentence)

    def test_older_success_for_same_commit_does_not_mask_a_newer_failure(self):
        # Same commit, two attempts, API order NOT newest-first. The newest
        # attempt is the failure and must be the one reported.
        deployments = [
            deployment(MAIN_SHA, status="success", created="2026-11-10T19:00:00Z"),
            deployment(MAIN_SHA, status="failure", created="2026-11-10T21:00:00Z"),
        ]
        detail = self._describe(deployments)
        sentence = detail.sentence()

        self.assertEqual(detail.superseding["created"], "2026-11-10T21:00:00Z")
        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_FAILED)
        self.assertIn("FAILED", sentence)
        self.assertNotIn("succeeded", sentence)

    def test_failed_build_with_null_url_does_not_crash_or_print_none(self):
        deployments = [deployment(MAIN_SHA, status="failure", url=None)]
        detail = self._describe(deployments)
        sentence = detail.sentence()

        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_FAILED)
        self.assertIn("FAILED", sentence)
        self.assertIn("(no deployment URL)", sentence)
        self.assertNotIn("None", sentence)

    def test_failed_build_with_absent_url_key_does_not_crash(self):
        raw = deployment(MAIN_SHA, status="failure")
        del raw["url"]
        detail = self._describe([raw])
        sentence = detail.sentence()

        self.assertIn("FAILED", sentence)
        self.assertNotIn("None", sentence)

    def test_unrecognised_status_does_not_crash_or_claim_success(self):
        detail = self._describe([deployment(MAIN_SHA, status="errored")])
        sentence = detail.sentence()

        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_UNKNOWN)
        self.assertIn("unrecognised status", sentence)
        self.assertIn("errored", sentence)
        self.assertIn("does not claim that it did", sentence)
        self.assertNotIn("succeeded", sentence)
        self.assertNotIn("Superseding build", sentence)

    def test_missing_latest_stage_is_unknown_not_success(self):
        raw = deployment(MAIN_SHA)
        del raw["latest_stage"]
        detail = self._describe([raw])

        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_UNKNOWN)
        self.assertNotIn("succeeded", detail.sentence())

    def test_skipped_build_is_reported_as_not_completed(self):
        detail = self._describe([deployment(MAIN_SHA, status="skipped")])
        sentence = detail.sentence()

        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_CANCELLED)
        self.assertIn("skipped", sentence)
        self.assertIn("never completed", sentence)
        self.assertNotIn("succeeded", sentence)

    def test_in_progress_build_is_not_reported_as_failed_or_succeeded(self):
        detail = self._describe([deployment(MAIN_SHA, status="active")])
        sentence = detail.sentence()

        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_IN_PROGRESS)
        self.assertIn("still building", sentence)
        self.assertIn("not finished yet", sentence)
        self.assertNotIn("succeeded", sentence)
        self.assertNotIn("FAILED", sentence)

    def test_succeeded_build_still_reads_as_a_race(self):
        # The pre-existing behaviour, unchanged: a build that succeeded but is
        # not live lost a race, and the wording must still say so.
        detail = self._describe([deployment(MAIN_SHA, status="success")])
        sentence = detail.sentence()

        self.assertEqual(detail.superseding["outcome"], cf.OUTCOME_SUCCEEDED)
        self.assertIn("Superseding build", sentence)
        self.assertIn("succeeded but is not live", sentence)
        self.assertNotIn("FAILED", sentence)

    def test_gate_detail_names_a_failed_build_end_to_end(self):
        # Through the real gate entry point, not just the lookup.
        deployments = [deployment(MAIN_SHA, status="failure")]
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(OLD_SHA))), \
             mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            c = gate.check_commit("https://x", MAIN_SHA, make_client())

        self.assertFalse(c.ok)
        self.assertIn("did not reach production", c.detail)
        self.assertIn("FAILED", c.detail)
        self.assertIn(MAIN_SHA[:10], c.detail)
        self.assertIn("pages.dev", c.detail)
        self.assertNotIn("Superseding build", c.detail)

    def test_failed_build_does_not_turn_a_passing_gate_red(self):
        # Enrichment is only consulted on a mismatch. A failed build in the
        # queue must not affect a gate whose commit already matches.
        deployments = [deployment(MAIN_SHA, status="failure")]
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(MAIN_SHA))), \
             mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            c = gate.check_commit("https://x", MAIN_SHA, make_client())

        self.assertTrue(c.ok)
        self.assertNotIn("FAILED", c.detail)

    def test_failed_build_detail_never_contains_the_token(self):
        deployments = [deployment(MAIN_SHA, status="failure")]
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(OLD_SHA))), \
             mock.patch.object(cf, "_api_get", return_value=api_ok(deployments)):
            c = gate.check_commit("https://x", MAIN_SHA, make_client())
        self.assertNotIn(TOKEN, c.detail)


class MainWiringTests(unittest.TestCase):
    """main() must construct the client from the environment and stay optional."""

    def _run_main(self, env: dict, argv: list[str]) -> int:
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(gate, "http_get", return_value=(200, build_info(MAIN_SHA))), \
             mock.patch.object(gate, "check_roster", return_value=gate.Check("r").pass_("ok")), \
             mock.patch.object(gate, "check_exports", return_value=gate.Check("e").pass_("ok")), \
             mock.patch.object(gate, "check_use_in", return_value=gate.Check("u").pass_("ok")), \
             mock.patch.object(gate, "check_mcp", return_value=gate.Check("m").pass_("ok")):
            return gate.main(argv)

    def test_main_passes_with_no_cloudflare_env(self):
        env = {cf.TOKEN_ENV: "", cf.ACCOUNT_ENV: ""}
        self.assertEqual(self._run_main(env, ["--expected-sha", MAIN_SHA, "--wait", "0"]), 0)

    def test_main_passes_with_cloudflare_env_but_no_network(self):
        # Token present but the API is unreachable: still green, because the
        # commit matched and enrichment is not load-bearing.
        env = {cf.TOKEN_ENV: TOKEN, cf.ACCOUNT_ENV: ACCOUNT}
        with mock.patch.object(cf, "_api_get", return_value=(0, None, "transport error (URLError)")):
            self.assertEqual(self._run_main(env, ["--expected-sha", MAIN_SHA, "--wait", "0"]), 0)

    def test_no_cloudflare_flag_disables_the_lookup(self):
        env = {cf.TOKEN_ENV: TOKEN, cf.ACCOUNT_ENV: ACCOUNT}
        with mock.patch.object(cf, "_api_get") as api:
            code = self._run_main(
                env, ["--expected-sha", MAIN_SHA, "--wait", "0", "--no-cloudflare"]
            )
        api.assert_not_called()
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
