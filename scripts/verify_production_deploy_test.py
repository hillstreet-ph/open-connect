#!/usr/bin/env python3
"""Unit tests for the post-merge production deploy gate.

These run offline. `http_get` / `http_post_json` are monkeypatched so the
assertions about commit matching, roster delegation, export sampling and the
MCP contract are exercised without touching production — the same approach
`validate_ai_factory_roster_test.py` uses, so this can sit in the required
"Build & validate" check without ever making it flaky.

The behaviour worth pinning is the *failure* path: the gate must go red when
production serves a different commit than main, because a gate that only ever
passes is the bug this whole change exists to fix.
"""

from __future__ import annotations

import json
import unittest
from unittest import mock

import verify_production_deploy as gate

MAIN_SHA = "73a38b178e52453831cb75d067ab0990799da6c5"
OLD_SHA = "bc6ed48181aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


def build_info(commit: str, source: str = "cloudflare-pages") -> bytes:
    return json.dumps(
        {
            "commit": commit,
            "short": commit[:10],
            "branch": "main",
            "source": source,
            "built_at": "2026-11-10T20:00:00.000Z",
        }
    ).encode()


def agents_payload(count: int = 103) -> bytes:
    agents = [
        {"slug": f"agent-{i}", "name": f"Agent {i}"} for i in range(count)
    ]
    return json.dumps(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "content": [{"type": "text", "text": json.dumps({"count": count, "agents": agents})}]
            },
        }
    ).encode()


class CommitIdentityTests(unittest.TestCase):
    def test_passes_when_production_serves_main_head(self):
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(MAIN_SHA))):
            c = gate.check_commit("https://x", MAIN_SHA)
        self.assertTrue(c.ok, c.detail)
        self.assertIn(MAIN_SHA[:10], c.detail)

    def test_fails_when_production_serves_an_older_commit(self):
        # The exact regression: a merge that never deployed.
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(OLD_SHA))):
            c = gate.check_commit("https://x", MAIN_SHA)
        self.assertFalse(c.ok)
        self.assertIn(OLD_SHA[:10], c.detail)
        self.assertIn(MAIN_SHA[:10], c.detail)
        self.assertIn("did not reach production", c.detail)

    def test_fails_when_build_info_is_missing(self):
        with mock.patch.object(gate, "http_get", return_value=(404, b"")):
            c = gate.check_commit("https://x", MAIN_SHA)
        self.assertFalse(c.ok)
        self.assertIn("404", c.detail)

    def test_fails_when_commit_is_unknown(self):
        with mock.patch.object(gate, "http_get", return_value=(200, build_info("unknown"))):
            c = gate.check_commit("https://x", MAIN_SHA)
        self.assertFalse(c.ok)
        self.assertIn("cannot be matched", c.detail)

    def test_fails_on_malformed_json(self):
        with mock.patch.object(gate, "http_get", return_value=(200, b"<html>nope")):
            c = gate.check_commit("https://x", MAIN_SHA)
        self.assertFalse(c.ok)
        self.assertIn("not valid JSON", c.detail)


class CommitIdentityOutcomeTests(unittest.TestCase):
    """Each failure mode must be named as itself, not as a flat mismatch.

    The point of these tests is diagnosis, not verdict: every case here must
    still FAIL the gate (a 404 is never "unknown, therefore fine"), but the
    message has to tell "production serves an old build" apart from
    "production cannot say what it serves at all".
    """

    def _check(self, response):
        with mock.patch.object(gate, "http_get", return_value=response):
            return gate.check_commit("https://x", MAIN_SHA)

    # --- 404: file not deployed at all -------------------------------------

    def test_404_still_fails_the_gate(self):
        c = self._check((404, b""))
        self.assertFalse(c.ok, "a 404 must never be treated as unknown-and-ok")

    def test_404_says_the_file_is_not_deployed(self):
        c = self._check((404, b""))
        self.assertIn("404", c.detail)
        self.assertIn("not deployed", c.detail)
        self.assertIn("write-build-info.mjs", c.detail)

    def test_404_does_not_claim_the_build_is_stale(self):
        c = self._check((404, b""))
        self.assertIn("NOT evidence of a stale build", c.detail)
        # It must not assert staleness as fact.
        self.assertNotIn("serving an older commit", c.detail)
        self.assertNotIn("did not reach production", c.detail)

    # --- other non-200 -----------------------------------------------------

    def test_500_names_the_status_and_implication(self):
        c = self._check((500, b"boom"))
        self.assertFalse(c.ok)
        self.assertIn("500", c.detail)
        self.assertIn("serving/access fault", c.detail)
        self.assertIn("not a stale build", c.detail)

    def test_403_names_access_control(self):
        c = self._check((403, b"denied"))
        self.assertFalse(c.ok)
        self.assertIn("403", c.detail)
        self.assertIn("access control", c.detail)

    # --- transport ---------------------------------------------------------

    def test_transport_failure_says_production_did_not_answer(self):
        c = self._check((0, b""))
        self.assertFalse(c.ok)
        self.assertIn("no HTTP response", c.detail)
        self.assertIn("did not answer", c.detail)
        self.assertIn("NOT evidence of a stale build", c.detail)

    # --- 200 but corrupt ---------------------------------------------------

    def test_200_non_json_says_corrupt(self):
        c = self._check((200, b"<html>nope"))
        self.assertFalse(c.ok)
        self.assertIn("not valid JSON", c.detail)
        self.assertIn("corrupt", c.detail)
        self.assertIn("NOT evidence of a stale build", c.detail)

    def test_200_json_wrong_type_does_not_raise(self):
        # A JSON array/string is valid JSON but not a build record. This used
        # to raise AttributeError and crash the gate instead of failing it.
        for body in (b"[]", b'"hello"', b"42", b"null"):
            with self.subTest(body=body):
                c = self._check((200, body))
                self.assertFalse(c.ok)
                self.assertIn("does not identify a build", c.detail)

    # --- 200 but no commit -------------------------------------------------

    def test_200_missing_commit_says_no_build_identified(self):
        c = self._check((200, json.dumps({"built_at": "x"}).encode()))
        self.assertFalse(c.ok)
        self.assertIn("does not identify a build", c.detail)
        self.assertIn("NOT evidence of a stale build", c.detail)

    def test_200_null_commit_says_no_build_identified(self):
        # Previously printed "production serves None but main HEAD is ..." and
        # claimed the merge did not reach production.
        c = self._check((200, json.dumps({"commit": None}).encode()))
        self.assertFalse(c.ok)
        self.assertIn("does not identify a build", c.detail)
        self.assertNotIn("serves None", c.detail)
        self.assertNotIn("did not reach production", c.detail)

    def test_200_empty_commit_says_no_build_identified(self):
        c = self._check((200, json.dumps({"commit": "   "}).encode()))
        self.assertFalse(c.ok)
        self.assertIn("does not identify a build", c.detail)

    # --- genuine stale build ----------------------------------------------

    def test_stale_build_names_both_shas(self):
        c = self._check((200, build_info(OLD_SHA)))
        self.assertFalse(c.ok)
        self.assertIn(OLD_SHA, c.detail)
        self.assertIn(MAIN_SHA, c.detail)
        self.assertIn("serving an older commit", c.detail)

    def test_stale_build_is_distinguishable_from_404(self):
        stale = self._check((200, build_info(OLD_SHA)))
        missing = self._check((404, b""))
        self.assertNotEqual(stale.detail, missing.detail)
        self.assertIn("serving an older commit", stale.detail)
        self.assertNotIn("serving an older commit", missing.detail)

    # --- pass path unchanged ----------------------------------------------

    def test_match_still_passes(self):
        c = self._check((200, build_info(MAIN_SHA)))
        self.assertTrue(c.ok)
        self.assertIn(MAIN_SHA[:10], c.detail)

    # --- no secret leaks ---------------------------------------------------

    def test_no_token_appears_in_any_failure_message(self):
        token = "ghp_" + "A" * 36
        for response in (
            (404, b""),
            (500, b""),
            (0, b""),
            (200, b"<html>nope"),
            (200, json.dumps({"commit": None}).encode()),
            (200, build_info(OLD_SHA)),
        ):
            with self.subTest(response=response[0]):
                c = self._check(response)
                self.assertNotIn(token, c.detail)
                self.assertNotIn("ghp_", c.detail)


class RosterDelegationTests(unittest.TestCase):
    def test_passes_when_validator_exits_zero(self):
        proc = mock.Mock(returncode=0, stdout="Roster pages: 9/9 passed\n", stderr="")
        with mock.patch.object(gate.subprocess, "run", return_value=proc):
            c = gate.check_roster("https://x", gate.Path(__file__))
        self.assertTrue(c.ok, c.detail)

    def test_fails_when_validator_exits_nonzero(self):
        proc = mock.Mock(returncode=1, stdout="Roster pages: 8/9 passed\n", stderr="")
        with mock.patch.object(gate.subprocess, "run", return_value=proc):
            c = gate.check_roster("https://x", gate.Path(__file__))
        self.assertFalse(c.ok)
        self.assertIn("exited 1", c.detail)

    def test_asks_the_validator_for_a_json_report(self):
        # The gate can only name a failure mode if the validator is asked for
        # the machine-readable report; without it the detail is a bare exit code.
        proc = mock.Mock(returncode=0, stdout="ok\n", stderr="")
        with mock.patch.object(gate.subprocess, "run", return_value=proc) as run:
            gate.check_roster("https://x", gate.Path(__file__))
        argv = run.call_args[0][0]
        self.assertIn("--json-report", argv)

    def test_names_the_failure_mode_from_the_report(self):
        # A 404 and a 200-serving-the-SPA-shell are different faults; the gate
        # must say which, not just that the validator exited 1.
        report = {
            "checks": [
                {"name": "teams", "ok": False, "kind": "http_status", "detail": "HTTP 404"},
                {"name": "hub", "ok": False, "kind": "wrong_content", "detail": "SPA shell"},
                {"name": "index", "ok": True, "kind": "", "detail": "200, own HTML"},
            ]
        }

        def fake_run(argv, **kwargs):
            path = argv[argv.index("--json-report") + 1]
            gate.Path(path).write_text(json.dumps(report))
            return mock.Mock(returncode=1, stdout="Roster pages: 1/3 passed\n", stderr="")

        with mock.patch.object(gate.subprocess, "run", side_effect=fake_run):
            c = gate.check_roster("https://x", gate.Path(__file__))
        self.assertFalse(c.ok)
        self.assertIn("http_status", c.detail)
        self.assertIn("wrong_content", c.detail)
        self.assertIn("teams", c.detail)
        self.assertIn("hub", c.detail)

    def test_still_fails_when_the_report_is_unreadable(self):
        # A missing or corrupt report must not turn a failure into a pass.
        proc = mock.Mock(returncode=1, stdout="Roster pages: 8/9 passed\n", stderr="")
        with mock.patch.object(gate.subprocess, "run", return_value=proc):
            c = gate.check_roster("https://x", gate.Path(__file__))
        self.assertFalse(c.ok)
        self.assertIn("exited 1", c.detail)


class ExportTests(unittest.TestCase):
    def test_passes_when_all_sampled_exports_resolve(self):
        def fake_post(url, payload, timeout=30):
            if payload["params"]["name"] == "ai_factory_list_agents":
                return 200, agents_payload()
            return 200, json.dumps(
                {"jsonrpc": "2.0", "id": 2, "result": {"content": [{"type": "text", "text": "{}"}]}}
            ).encode()

        with mock.patch.object(gate, "http_post_json", side_effect=fake_post):
            c = gate.check_exports("https://x")
        self.assertTrue(c.ok, c.detail)
        self.assertIn("6/6", c.detail)

    def test_fails_when_an_export_errors(self):
        def fake_post(url, payload, timeout=30):
            if payload["params"]["name"] == "ai_factory_list_agents":
                return 200, agents_payload()
            return 200, json.dumps(
                {"jsonrpc": "2.0", "id": 2, "result": {"isError": True, "content": []}}
            ).encode()

        with mock.patch.object(gate, "http_post_json", side_effect=fake_post):
            c = gate.check_exports("https://x")
        self.assertFalse(c.ok)
        self.assertIn("isError", c.detail)


class McpTests(unittest.TestCase):
    def _router(self, count: int = 103, tools: list[str] | None = None):
        tools = tools or [
            "ai_factory_list_agents",
            "ai_factory_get_agent",
            "ai_factory_get_export",
        ]

        def fake_post(url, payload, timeout=30):
            method = payload.get("method")
            if method == "initialize":
                return 200, json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "result": {
                            "protocolVersion": "2025-06-18",
                            "serverInfo": {"name": "open-connect-ai-factory"},
                        },
                    }
                ).encode()
            if method == "tools/list":
                return 200, json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "result": {"tools": [{"name": t} for t in tools]},
                    }
                ).encode()
            name = payload["params"]["name"]
            if name == "ai_factory_list_agents":
                return 200, agents_payload(count)
            return 200, json.dumps(
                {"jsonrpc": "2.0", "id": 3, "result": {"content": [{"type": "text", "text": "{}"}]}}
            ).encode()

        return fake_post

    def test_passes_with_three_tools_and_103_agents(self):
        with mock.patch.object(gate, "http_post_json", side_effect=self._router()):
            c = gate.check_mcp("https://x")
        self.assertTrue(c.ok, c.detail)
        self.assertIn("103 agents", c.detail)

    def test_fails_when_agent_count_is_wrong(self):
        with mock.patch.object(gate, "http_post_json", side_effect=self._router(count=102)):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("102 agents", c.detail)

    def test_fails_when_a_tool_is_missing(self):
        with mock.patch.object(
            gate, "http_post_json", side_effect=self._router(tools=["ai_factory_list_agents"])
        ):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("missing", c.detail)

    def test_fails_when_initialize_is_not_200(self):
        with mock.patch.object(gate, "http_post_json", return_value=(500, b"")):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("initialize", c.detail)


class McpOutcomeTests(unittest.TestCase):
    """Every MCP failure mode must be named, and must still be a failure.

    These pin the diagnosis, not just the verdict: a reader has to be able to
    tell an unreachable endpoint from a 500 from a non-JSON body from a
    JSON-RPC error from a tool answering isError true.
    """

    def _router(self, **overrides):
        """A healthy MCP router with individual stages overridden."""

        def fake_post(url, payload, timeout=30):
            method = payload.get("method")
            if method == "initialize":
                return overrides.get("initialize", (200, json.dumps({
                    "jsonrpc": "2.0", "id": 1,
                    "result": {"serverInfo": {"name": "open-connect-ai-factory"}},
                }).encode()))
            if method == "tools/list":
                return overrides.get("tools_list", (200, json.dumps({
                    "jsonrpc": "2.0", "id": 2,
                    "result": {"tools": [
                        {"name": "ai_factory_list_agents"},
                        {"name": "ai_factory_get_agent"},
                        {"name": "ai_factory_get_export"},
                    ]},
                }).encode()))
            name = payload["params"]["name"]
            if name in overrides:
                return overrides[name]
            if name == "ai_factory_list_agents":
                return 200, agents_payload()
            return 200, json.dumps(
                {"jsonrpc": "2.0", "id": 3, "result": {"content": [{"type": "text", "text": "{}"}]}}
            ).encode()

        return fake_post

    def test_endpoint_unreachable_is_named(self):
        with mock.patch.object(gate, "http_post_json", return_value=(0, b"")):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("unreachable", c.detail)
        self.assertIn("initialize", c.detail)

    def test_timeout_is_named_as_a_timeout(self):
        # A timeout is a status-0 response; the transport note must say so
        # rather than reporting a generic connection failure.
        def fake_post(url, payload, timeout=30):
            gate._record_transport_failure(TimeoutError("timed out"))
            return 0, b""

        with mock.patch.object(gate, "http_post_json", side_effect=fake_post):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("timed out", c.detail)

    def test_dns_failure_is_named(self):
        def fake_post(url, payload, timeout=30):
            gate._record_transport_failure(
                gate.urllib.error.URLError(gate.socket.gaierror("Name or service not known"))
            )
            return 0, b""

        with mock.patch.object(gate, "http_post_json", side_effect=fake_post):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("DNS", c.detail)

    def test_non_200_names_the_status_and_stage(self):
        with mock.patch.object(gate, "http_post_json", return_value=(503, b"")):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("initialize", c.detail)
        self.assertIn("503", c.detail)

    def test_non_json_body_is_named(self):
        with mock.patch.object(
            gate, "http_post_json", return_value=(200, b"<html>gateway</html>")
        ):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("not valid JSON", c.detail)

    def test_jsonrpc_error_object_is_named(self):
        body = json.dumps(
            {"jsonrpc": "2.0", "id": 1, "error": {"code": -32603, "message": "Static asset binding is unavailable"}}
        ).encode()
        with mock.patch.object(gate, "http_post_json", return_value=(200, body)):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("JSON-RPC error", c.detail)
        self.assertIn("-32603", c.detail)
        self.assertIn("Static asset binding", c.detail)

    def test_initialize_without_result_is_named(self):
        body = json.dumps({"jsonrpc": "2.0", "id": 1}).encode()
        with mock.patch.object(gate, "http_post_json", return_value=(200, body)):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("initialize", c.detail)
        self.assertIn("no result", c.detail)

    def test_tools_list_wrong_tool_set_is_named(self):
        with mock.patch.object(
            gate, "http_post_json", side_effect=self._router(
                tools_list=(200, json.dumps({
                    "jsonrpc": "2.0", "id": 2,
                    "result": {"tools": [{"name": "ai_factory_list_agents"}]},
                }).encode())
            )
        ):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("tools/list", c.detail)
        self.assertIn("wrong tool set", c.detail)

    def test_tool_returning_iserror_true_is_still_a_failure(self):
        # The contract that must not soften: a tool that answers isError true
        # is a failure, however well-formed the envelope is.
        with mock.patch.object(
            gate, "http_post_json", side_effect=self._router(
                ai_factory_get_agent=(200, json.dumps({
                    "jsonrpc": "2.0", "id": 3,
                    "result": {"isError": True, "content": [{"type": "text", "text": "agent not found"}]},
                }).encode())
            )
        ):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("isError true", c.detail)
        self.assertIn("ai_factory_get_agent", c.detail)

    def test_wrong_agent_count_is_named(self):
        with mock.patch.object(
            gate, "http_post_json", side_effect=self._router(
                ai_factory_list_agents=(200, agents_payload(102))
            )
        ):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("102", c.detail)
        self.assertIn("expected 103", c.detail)

    def test_tool_call_non_200_names_the_tool(self):
        with mock.patch.object(
            gate, "http_post_json", side_effect=self._router(
                ai_factory_get_export=(500, b"")
            )
        ):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertIn("ai_factory_get_export", c.detail)
        self.assertIn("500", c.detail)

    def test_healthy_endpoint_still_passes(self):
        with mock.patch.object(gate, "http_post_json", side_effect=self._router()):
            c = gate.check_mcp("https://x")
        self.assertTrue(c.ok, c.detail)

    def test_no_token_is_ever_printed(self):
        # A failure detail must never echo a credential, whatever the body says.
        # The value is synthetic: it only has to look like a token to the
        # redactor, and must never be a real one.
        secret = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"
        body = json.dumps(
            {"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": f"bad auth {secret}"}}
        ).encode()
        with mock.patch.object(gate, "http_post_json", return_value=(200, body)):
            c = gate.check_mcp("https://x")
        self.assertFalse(c.ok)
        self.assertNotIn(secret, c.detail)


class ExitCodeTests(unittest.TestCase):
    def test_main_returns_one_when_commit_mismatches(self):
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(OLD_SHA))), \
             mock.patch.object(gate, "check_roster", return_value=gate.Check("r").pass_("ok")), \
             mock.patch.object(gate, "check_exports", return_value=gate.Check("e").pass_("ok")), \
             mock.patch.object(gate, "check_mcp", return_value=gate.Check("m").pass_("ok")):
            code = gate.main(["--expected-sha", MAIN_SHA, "--wait", "0"])
        self.assertEqual(code, 1)

    def test_main_returns_zero_when_everything_matches(self):
        with mock.patch.object(gate, "http_get", return_value=(200, build_info(MAIN_SHA))), \
             mock.patch.object(gate, "check_roster", return_value=gate.Check("r").pass_("ok")), \
             mock.patch.object(gate, "check_exports", return_value=gate.Check("e").pass_("ok")), \
             mock.patch.object(gate, "check_mcp", return_value=gate.Check("m").pass_("ok")):
            code = gate.main(["--expected-sha", MAIN_SHA, "--wait", "0"])
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
