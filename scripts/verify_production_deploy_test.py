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
