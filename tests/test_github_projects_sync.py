import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import github_projects_sync as mod
from supabase_databricks_sync import SyncError


def test_normalise_maps_github_fields():
    row = mod.normalise({
        "full_name": "hillstreet-ph/open-connect", "name": "open-connect",
        "html_url": "https://github.com/hillstreet-ph/open-connect",
        "description": "desc", "default_branch": "main", "language": "Python",
        "topics": ["a", "b"], "private": False, "archived": False,
        "disabled": False, "fork": False, "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z", "pushed_at": "2026-01-03T00:00:00Z",
        "stargazers_count": 3, "open_issues_count": 7, "size": 42,
        "license": {"spdx_id": "MIT"},
    }, "2026-11-17T00:00:00+00:00")
    mapped = dict(zip(mod.COLUMNS, row))
    assert mapped["repository"] == "hillstreet-ph/open-connect"
    assert mapped["schema_name"] == "github_org"
    assert mapped["environment"] == "github"
    assert mapped["enabled"] is True
    assert mapped["id"] and len(mapped["id"]) == 36


def test_fetch_repos_requires_token_and_valid_org():
    with pytest.raises(SyncError, match="not set"):
        mod.fetch_repos("", "hillstreet-ph", http=lambda *a, **k: [])
    with pytest.raises(SyncError, match="invalid GitHub"):
        mod.fetch_repos("tok", "org/../evil", http=lambda *a, **k: [])


def test_fetch_repos_rejects_unpaged_large_orgs():
    with pytest.raises(SyncError, match="pagination"):
        mod.fetch_repos("tok", "org", http=lambda *a, **k: [{}] * 100)


def test_merge_sql_covers_every_column_without_self_reference():
    stage = mod.stage_sql([mod.normalise({"full_name": "o/r"}, "t")])
    sql = mod.merge_sql(mod.DEFAULT_TARGET, stage)
    assert "ON tgt.`id` = src.`id`" in sql
    for col in mod.COLUMNS:
        assert "`" + col + "`" in sql
    assert "UPDATE SET" in sql and "WHEN NOT MATCHED" in sql


class FakeClient:
    def __init__(self, exists=False):
        self.exists = exists
        self.submitted = []
        self.headers = {}
        self.statements_url = "https://dbx/api/2.0/sql/statements"
        self.warehouse_id = "w"
        self.timeout = 30
        self.max_poll = 2

    def table_exists(self, target):
        return self.exists

    def submit(self, sql):
        self.submitted.append(sql)
        return {"state": "SUCCEEDED", "statement_id": "s1"}


def test_dry_run_never_writes(monkeypatch):
    monkeypatch.setattr(mod, "fetch_repos", lambda *a, **k: [{"full_name": "o/r"}])
    result = mod.run("tok", FakeClient(), dry_run=True)
    assert result == {"ok": True, "dry_run": True, "repos": 1}


def test_live_run_merges_without_creating_a_table(monkeypatch):
    monkeypatch.setattr(mod, "fetch_repos", lambda *a, **k: [{"full_name": "o/r"}])
    monkeypatch.setattr(mod, "count_rows", lambda *a: 1)
    client = FakeClient(exists=False)
    summary = mod.run("tok", client)
    assert summary["ok"] and summary["executed"] == ["merge"]
    assert client.submitted[0].startswith("MERGE INTO")
    assert "CREATE TABLE" not in client.submitted[0]


def test_merge_is_idempotent_for_existing_table(monkeypatch):
    monkeypatch.setattr(mod, "fetch_repos", lambda *a, **k: [{"full_name": "o/r"}])
    monkeypatch.setattr(mod, "count_rows", lambda *a: 1)
    client = FakeClient(exists=True)
    assert mod.run("tok", client)["executed"] == ["merge"]
