import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import linear_projects_sync as mod
from supabase_databricks_sync import SyncError


def test_requires_token():
    with pytest.raises(SyncError, match="LINEAR_API_KEY"):
        mod.fetch_projects("", http=lambda *a, **k: {})


def test_fetch_projects_reads_nodes_and_rejects_pagination():
    fake = lambda *a, **k: {"data": {"projects": {"nodes": [{"id": "x"}], "pageInfo": {}}}}
    assert mod.fetch_projects("tok", http=fake) == [{"id": "x"}]
    paged = lambda *a, **k: {"data": {"projects": {"nodes": [], "pageInfo": {"hasNextPage": True}}}}
    with pytest.raises(SyncError, match="pagination"):
        mod.fetch_projects("tok", http=paged)


def test_normalise_namespaces_id_and_keeps_supabase_rows_distinct():
    row = mod.normalise({"id": "abc", "name": "Alpha", "state": "started",
                         "createdAt": "t1", "updatedAt": "t2",
                         "description": "four"}, "now")
    d = dict(zip(mod.COLUMNS, row))
    assert d["id"] == "linear:abc"
    assert d["schema_name"] == "linear"
    assert d["environment"] == "linear"
    assert "four" in d["_rescued_data"]


class FakeClient:
    def __init__(self):
        self.sql = []

    def submit(self, sql):
        self.sql.append(sql)
        return {"state": "SUCCEEDED"}


def test_run_merges_without_creating_table(monkeypatch):
    monkeypatch.setattr(mod, "fetch_projects", lambda *a, **k: [
        {"id": "abc", "name": "Alpha", "state": "started", "createdAt": "t1",
         "updatedAt": "t2", "description": "four"}])
    client = FakeClient()
    assert mod.run("tok", client)["projects"] == 1
    assert client.sql[0].startswith("MERGE INTO")
    assert "CREATE TABLE" not in client.sql[0]
