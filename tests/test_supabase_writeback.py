import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import supabase_writeback as mod
from supabase_databricks_sync import SyncError


def test_write_query_validates_inputs():
    with __import__("pytest").raises(SyncError, match="PAT"):
        mod.write_query("", "abc123", "SELECT 1")
    with __import__("pytest").raises(SyncError, match="invalid"):
        mod.write_query("tok", "bad-ref!", "SELECT 1")


def test_write_query_uses_management_write_endpoint():
    seen = {}

    def fake(url, **kwargs):
        seen.update(url=url, kwargs=kwargs)
        return [{"ok": 1}]

    assert mod.write_query("tok", "abc123", "SELECT 1", http=fake) == [{"ok": 1}]
    assert seen["url"].endswith("/abc123/database/query")
    assert seen["kwargs"]["body"] == {"query": "SELECT 1"}
    assert "read-only" not in seen["url"]


def test_audit_sql_is_additive_and_idempotent():
    stmts = mod.audit_sql([("public.projects", {"watermark": "2026-01-01"})], "now")
    assert len(stmts) == 2
    assert "CREATE TABLE IF NOT EXISTS" in stmts[0]
    assert 'ON CONFLICT ("table_key") DO UPDATE' in stmts[1]
    assert "`" not in stmts[1]
    assert "DELETE" not in " ".join(stmts).upper().replace("EXCLUDED", "")


def test_github_sql_upserts_all_repos():
    stmts = mod.github_sql([{"full_name": "o/r", "name": "r", "html_url": "u",
                             "archived": False, "pushed_at": "t"}], "now")
    assert len(stmts) == 2
    assert stmts[1].count("ON CONFLICT") == 1
    assert "('o/r'" in stmts[1]
    assert "FALSE" in stmts[1] and "`" not in stmts[1]


def test_empty_audit_returns_only_table_creation():
    assert len(mod.audit_sql([], "now")) == 1


def test_audit_rows_reads_nested_state(tmp_path):
    path = tmp_path / "state.json"
    path.write_text('{"version":1,"tables":{"t1":{"watermark":"x"}}}')
    assert mod.audit_rows(str(path)) == [("t1", {"watermark": "x"})]
