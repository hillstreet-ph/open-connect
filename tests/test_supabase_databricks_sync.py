"""Offline tests for scripts/supabase_databricks_sync.py.

Every HTTP call is intercepted by FakeHTTP; no live Supabase or Databricks
request is ever made.
"""
import importlib.util
import json
import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "supabase_databricks_sync.py"
_spec = importlib.util.spec_from_file_location("supabase_databricks_sync", MODULE_PATH)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)

REF = "huadtiuuoiriqrjpjxhr"
TARGET = "catalog.schema.projects"
SOURCE = "public.projects"


class FakeHTTP:
    def __init__(self):
        self.calls = []
        self.handlers = []

    def add(self, predicate, response):
        self.handlers.append((predicate, response))
        return self

    def http(self, url, *, method="GET", headers=None, body=None, timeout=60):
        call = {"url": url, "method": method, "headers": headers or {}, "body": body}
        self.calls.append(call)
        for predicate, response in self.handlers:
            if predicate(call):
                if isinstance(response, Exception):
                    raise response
                if callable(response):
                    return response(call)
                return response
        raise AssertionError("no mocked response for %s %s" % (method, url))

    def queries(self):
        return [c["body"]["query"] for c in self.calls
                if "api.supabase.com" in c["url"]]

    def statements(self):
        return [c["body"]["statement"] for c in self.calls
                if "api/2.0/sql/statements" in c["url"] and c["method"] == "POST"
                and not c["body"]["statement"].startswith("DESCRIBE")]


def is_supabase(c):
    return "api.supabase.com" in c["url"]


def is_info(c):
    return is_supabase(c) and "information_schema" in c["body"]["query"]


def is_data(c):
    return is_supabase(c) and "information_schema" not in c["body"]["query"]


def is_catalog(c):
    return "/api/2.1/unity-catalog/tables/" in c["url"] and c["method"] == "GET"


def is_db_post(c):
    return "api/2.0/sql/statements" in c["url"] and c["method"] == "POST"


def is_db_get(c):
    return "api/2.0/sql/statements" in c["url"] and c["method"] == "GET"


def ok_statement(c):
    return {"statement_id": "stmt-1", "status": {"state": "PENDING"}}


def done_statement(c):
    return {"statement_id": "stmt-1", "status": {"state": "SUCCEEDED"}}


def clients(fake, token="test-token"):
    return (
        mod.SupabaseClient("test-pat", http=fake.http),
        mod.DatabricksClient("https://workspace.cloud.databricks.com", token,
                             warehouse_id="dae787fe16c17482", sleep_fn=lambda _: None,
                             max_poll=5, http=fake.http),
    )


def registry(path, extra=None):
    tables = {REF: {SOURCE: TARGET}}
    if extra:
        tables[REF].update(extra)
    path.write_text(json.dumps({"tables": tables}), encoding="utf-8")
    return str(path)


def opts(**overrides):
    values = dict(batch_size=2, max_pages=5, full_refresh=False,
                  dry_run=False, once=True, tables=[])
    values.update(overrides)
    return values


ROWS = [
    {"id": 1, "name": "alpha", "updated_at": "2026-11-16T10:00:00+00:00"},
    {"id": 2, "name": "beta", "updated_at": "2026-11-17T10:00:00+00:00"},
]


def standard_fake(rows=ROWS, db_response=done_statement):
    fake = FakeHTTP()
    fake.add(is_info, [{"column_name": "updated_at"}])
    fake.add(lambda c: is_data(c) and c["body"]["query"].endswith(
        "OFFSET %d" % len(rows)), [])
    fake.add(is_data, rows)
    fake.add(is_db_post, ok_statement)
    fake.add(is_db_get, db_response)
    fake.add(is_catalog, {})
    return fake


# --------------------------------------------------------------------------- #
# registry / state / helpers
# --------------------------------------------------------------------------- #
def test_registry_string_and_dict_shapes(tmp_path):
    path = tmp_path / "registry.json"
    path.write_text(json.dumps({
        "defaults": {"primary_key": "id", "watermark_column": "created_at"},
        "watermark_columns": {REF + ":" + SOURCE: "updated_at"},
        "tables": {
            REF: {
                SOURCE: TARGET,
                "public.other": {"databricks": "cat.sch.other", "primary_key": None},
            }
        },
    }))
    specs = mod.load_registry(str(path))
    assert len(specs) == 2
    first = specs[0]
    assert first.key == REF + ":" + SOURCE
    assert first.target_table == TARGET
    assert first.watermark_column == "updated_at"
    assert first.primary_key == "id"
    assert specs[1].primary_key is None
    assert specs[1].target_table == "cat.sch.other"
    assert specs[1].watermark_column == "created_at"


def test_registry_direct_ref_mapping(tmp_path):
    path = tmp_path / "registry.json"
    path.write_text(json.dumps({REF: {SOURCE: TARGET}}))
    specs = mod.load_registry(str(path))
    assert [(s.ref, s.source_table, s.target_table) for s in specs] == [(REF, SOURCE, TARGET)]


def test_registry_missing_target_raises(tmp_path):
    path = tmp_path / "registry.json"
    path.write_text(json.dumps({REF: {SOURCE: {}}}))
    with pytest.raises(mod.SyncError, match="no Databricks target"):
        mod.load_registry(str(path))


def test_state_roundtrip_is_atomic(tmp_path):
    path = tmp_path / "state.json"
    state = mod.load_state(str(path))
    assert state == {"version": 1, "tables": {}}
    state["tables"][REF + ":" + SOURCE] = {"watermark": "w1"}
    mod.save_state(str(path), state)
    assert mod.load_state(str(path))["tables"][REF + ":" + SOURCE]["watermark"] == "w1"
    assert not (tmp_path / "state.json.tmp").exists()


def test_quoting_and_literal_escape():
    assert mod.qid("public.projects") == '"public"."projects"'
    assert mod.qid('a.b"c') == '"a"."b""c"'
    assert mod.sql_literal("x'; DROP TABLE t; --") == "'x''; DROP TABLE t; --'"
    assert mod.sql_literal(None) == "NULL"
    assert mod.sql_literal(True) == "TRUE"
    assert mod.sql_literal(7) == "7"


def test_apply_lookback():
    assert mod.apply_lookback("2026-11-17T00:00:00+00:00", 60) == \
        "2026-11-16T23:59:00+00:00"
    assert mod.apply_lookback("not-a-date", 60) == "not-a-date"
    assert mod.apply_lookback(None, 60) is None


def test_load_env_file_does_not_override_existing_env(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text('MY_TEST_KEY="from-file"\nOTHER="quoted"\n# comment\n\n')
    monkeypatch.setenv("MY_TEST_KEY", "from-env")
    monkeypatch.delenv("OTHER", raising=False)
    mod.load_env_file(str(path))
    assert os.environ["MY_TEST_KEY"] == "from-env"
    assert os.environ["OTHER"] == "quoted"
    monkeypatch.delenv("OTHER", raising=False)


# --------------------------------------------------------------------------- #
# Supabase client
# --------------------------------------------------------------------------- #
def test_supabase_uses_read_only_endpoint_with_bearer_pat():
    fake = FakeHTTP().add(lambda c: True, [])
    supabase, _ = clients(fake)
    assert supabase.query(REF, "SELECT 1") == []
    call = fake.calls[0]
    assert call["url"] == \
        "https://api.supabase.com/v1/projects/%s/database/query/read-only" % REF
    assert call["method"] == "POST"
    assert call["headers"]["Authorization"] == "Bearer test-pat"
    assert "query/read-only" in call["url"] and "query\"" not in call["url"]


def test_detect_watermark_column_prefers_updated_at():
    fake = FakeHTTP().add(is_info, [{"column_name": "updated_at"}])
    supabase, _ = clients(fake)
    assert supabase.detect_watermark_column(REF, SOURCE) == "updated_at"
    sql = fake.queries()[0]
    assert "information_schema.columns" in sql
    assert "WHEN lower(column_name) = 'updated_at' THEN 0" in sql
    assert "table_name = 'projects'" in sql


def test_detect_watermark_column_returns_none_when_absent():
    fake = FakeHTTP().add(is_info, [])
    supabase, _ = clients(fake)
    assert supabase.detect_watermark_column(REF, SOURCE) is None


def test_fetch_all_pages_and_filters_by_watermark():
    fake = FakeHTTP()
    fake.add(lambda c: "OFFSET 2" in c["body"]["query"], [])
    fake.add(lambda c: True, ROWS)
    supabase, _ = clients(fake)
    rows, pages = supabase.fetch_all(REF, SOURCE, "updated_at", "2026-11-01T00:00:00+00:00",
                                     batch_size=2, max_pages=5)
    assert len(rows) == 2 and pages == 1
    first = fake.queries()[0]
    assert '"public"."projects"' in first
    assert '"updated_at" > \'2026-11-01T00:00:00+00:00\'' in first
    assert "ORDER BY \"updated_at\" ASC" in first


def test_fetch_all_stops_at_max_pages():
    fake = FakeHTTP().add(lambda c: True, ROWS)
    supabase, _ = clients(fake)
    rows, pages = supabase.fetch_all(REF, SOURCE, None, None, batch_size=2, max_pages=2)
    assert len(rows) == 4 and pages == 2


# --------------------------------------------------------------------------- #
# Databricks client
# --------------------------------------------------------------------------- #
def test_databricks_statement_polls_to_success():
    fake = FakeHTTP()
    fake.add(is_db_post, {"statement_id": "stmt-1", "status": {"state": "PENDING"}})
    fake.add(is_db_get, {"status": {"state": "SUCCEEDED"}})
    _, db = clients(fake)
    assert db.submit("SELECT 1") == {"statement_id": "stmt-1", "state": "SUCCEEDED"}
    post = fake.calls[0]
    assert post["url"].endswith("/api/2.0/sql/statements")
    assert post["body"]["warehouse_id"] == "dae787fe16c17482"
    assert post["headers"]["Authorization"] == "Bearer test-token"
    assert any("stmt-1" in c["url"] and c["method"] == "GET" for c in fake.calls)


def test_databricks_statement_failure_raises_syncerror():
    fake = FakeHTTP()
    fake.add(is_db_post, {"statement_id": "stmt-1", "status": {"state": "PENDING"}})
    fake.add(is_db_get, {"status": {"state": "FAILED",
                                    "error": {"message": "bad SQL"}}})
    _, db = clients(fake)
    with pytest.raises(mod.SyncError, match="bad SQL"):
        db.submit("SELECT bad")


def test_databricks_statement_timeout():
    fake = FakeHTTP()
    fake.add(is_db_post, {"statement_id": "stmt-1", "status": {"state": "PENDING"}})
    fake.add(is_db_get, {"status": {"state": "RUNNING"}})
    _, db = clients(fake)
    db.max_poll = 2
    with pytest.raises(mod.SyncError, match="timed out"):
        db.submit("SELECT 1")


def test_databricks_sync_success_response_needs_no_poll():
    fake = FakeHTTP().add(is_db_post, {"statement_id": None,
                                       "status": {"state": "SUCCEEDED"}})
    _, db = clients(fake)
    assert db.submit("SELECT 1")["state"] == "SUCCEEDED"
    assert len(fake.calls) == 1


# --------------------------------------------------------------------------- #
# SQL construction
# --------------------------------------------------------------------------- #
def test_merge_sql_contains_upsert_and_no_delete():
    spec = mod.TableSpec(REF, SOURCE, TARGET, "updated_at", "id")
    columns = mod.ordered_columns(ROWS, "id")
    stage = mod.build_stage_sql(ROWS, columns)
    merge = mod.build_merge_sql(spec, columns, stage)
    create = mod.build_create_sql(spec, stage)
    assert "MERGE INTO" in merge and "WHEN MATCHED THEN UPDATE SET" in merge
    assert "WHEN NOT MATCHED THEN INSERT" in merge
    assert "CREATE TABLE " in create and "WHERE 1 = 0" not in create
    assert "DELETE" not in merge.upper().replace("UPDATED_AT", "")
    assert "id" in columns and columns[0] == "id"
    assert "alpha" in stage and "'alpha'" in stage


def test_append_fallback_uses_anti_join():
    spec = mod.TableSpec(REF, SOURCE, TARGET, "updated_at", None)
    columns = mod.ordered_columns(ROWS, None)
    append = mod.build_append_sql(spec, columns, mod.build_stage_sql(ROWS, columns))
    assert "INSERT INTO" in append and "LEFT ANTI JOIN" in append
    assert "<=>" in append and "DELETE" not in append.upper()


# --------------------------------------------------------------------------- #
# end-to-end orchestration
# --------------------------------------------------------------------------- #
def test_watermark_advances_only_after_success(tmp_path):
    reg = registry(tmp_path / "registry.json")
    state_path = tmp_path / "state.json"
    spec = mod.load_registry(reg)[0]
    spec.lookback_seconds = 0
    fake = standard_fake()
    fake.handlers.insert(0, (is_catalog, mod.SyncError("HTTP 404 for GET catalog table")))
    supabase, db = clients(fake)

    summary = mod.run_once([spec], supabase, db, mod.load_state(str(state_path)),
                           opts(), str(state_path))
    assert summary["ok"] and summary["rows_synced"] == 2
    saved = json.loads(state_path.read_text())["tables"][spec.key]
    assert saved["watermark"] == "2026-11-17T10:00:00+00:00"
    assert saved["column"] == "updated_at"
    assert len(fake.statements()) == 2  # CREATE + MERGE
    assert all("DELETE" not in sql.upper() for sql in fake.statements())

    # Second poll re-reads rows strictly newer than the stored watermark.
    fake2 = standard_fake(rows=[])
    supabase2, db2 = clients(fake2)
    summary2 = mod.run_once([spec], supabase2, db2, mod.load_state(str(state_path)),
                            opts(), str(state_path))
    assert summary2["results"][0]["status"] == "no_rows"
    assert any("> '2026-11-17T10:00:00+00:00'" in q for q in fake2.queries())
    assert json.loads(state_path.read_text())["tables"][spec.key]["watermark"] == \
        "2026-11-17T10:00:00+00:00"


def test_failure_keeps_old_watermark(tmp_path):
    reg = registry(tmp_path / "registry.json")
    state_path = tmp_path / "state.json"
    old_state = {"version": 1, "tables": {
        REF + ":" + SOURCE: {"watermark": "2026-11-01T00:00:00+00:00",
                             "column": "updated_at"}}}
    state_path.write_text(json.dumps(old_state, sort_keys=True), encoding="utf-8")
    before = state_path.read_text()

    spec = mod.load_registry(reg)[0]
    spec.lookback_seconds = 0
    fake = standard_fake(rows=[ROWS[0]],
                         db_response=lambda c: {"status": {"state": "FAILED",
                                                           "error": {"message": "warehouse down"}}})
    supabase, db = clients(fake)
    summary = mod.run_once([spec], supabase, db, mod.load_state(str(state_path)),
                           opts(), str(state_path))
    assert not summary["ok"] and summary["tables_failed"] == 1
    assert "warehouse down" in summary["results"][0]["error"]
    assert state_path.read_text() == before  # no watermark change on failure


def test_dry_run_writes_nothing(tmp_path):
    reg = registry(tmp_path / "registry.json")
    state_path = tmp_path / "state.json"
    spec = mod.load_registry(reg)[0]
    fake = FakeHTTP().add(is_info, [{"column_name": "updated_at"}]).add(is_data, ROWS)
    supabase, db = clients(fake)
    summary = mod.run_once([spec], supabase, db, mod.load_state(str(state_path)),
                           opts(dry_run=True), str(state_path))
    assert summary["ok"] and summary["results"][0]["status"] == "dry_run"
    assert fake.statements() == []
    assert not state_path.exists()
    assert any("MERGE INTO" in s["sql"] for s in summary["results"][0]["statements"])


def test_full_refresh_ignores_watermark(tmp_path):
    reg = registry(tmp_path / "registry.json")
    state_path = tmp_path / "state.json"
    state = {"version": 1, "tables": {
        REF + ":" + SOURCE: {"watermark": "2026-11-17T10:00:00+00:00",
                             "column": "updated_at"}}}
    state_path.write_text(json.dumps(state))
    spec = mod.load_registry(reg)[0]
    spec.lookback_seconds = 0
    fake = standard_fake()
    supabase, db = clients(fake)
    summary = mod.run_once([spec], supabase, db, mod.load_state(str(state_path)),
                           opts(full_refresh=True), str(state_path))
    assert summary["ok"]
    assert ">" not in fake.queries()[0].split("WHERE")[-1] if "WHERE" in fake.queries()[0] else True
    assert "2026-11-17T10:00:00+00:00" not in fake.queries()[0]


def test_table_filter_skips_other_tables(tmp_path):
    reg = registry(tmp_path / "registry.json", {"public.other": "cat.sch.other"})
    specs = mod.load_registry(reg)
    fake = standard_fake()
    supabase, db = clients(fake)
    summary = mod.run_once(specs, supabase, db, {"version": 1, "tables": {}},
                           opts(tables=["public.other"]), str(tmp_path / "state.json"))
    assert summary["tables_total"] == 1
    assert summary["results"][0]["target"] == "cat.sch.other"
    assert all(SOURCE not in q for q in fake.queries())


def test_configured_watermark_map_skips_information_schema(tmp_path):
    reg = registry(tmp_path / "registry.json")
    spec = mod.load_registry(reg)[0]
    spec.watermark_column = "created_at"
    fake = standard_fake(rows=[])
    supabase, _ = clients(fake)
    mod.sync_table(spec, supabase, FakeHTTP(),  # db unused for no rows
                   {"version": 1, "tables": {}}, opts())
    assert not any("information_schema" in q for q in fake.queries())


def test_no_credentials_hardcoded_in_source():
    source = MODULE_PATH.read_text(encoding="utf-8")
    assert "SUPABASE_PAT" in source and "DATABRICKS_TOKEN" in source
    assert "os.environ" in source
    import re
    assert not re.search(r"Bearer\s+[A-Za-z0-9_-]{20,}", source)
    assert "dae787fe16c17482" in source  # warehouse id is not a secret


# --------------------------------------------------------------------------- #
# data integrity: stable ordering, truncation detection, CTAS void casts
# --------------------------------------------------------------------------- #
def test_fetch_page_uses_primary_key_as_tiebreaker():
    fake = FakeHTTP().add(lambda c: True, [])
    supabase, _ = clients(fake)
    supabase.fetch_page(REF, SOURCE, "updated_at", "2026-11-01T00:00:00+00:00",
                        2, 0, primary_key="id")
    sql = fake.queries()[0]
    assert 'ORDER BY "updated_at" ASC, "id" ASC' in sql


def test_fetch_page_orders_by_primary_key_without_watermark():
    fake = FakeHTTP().add(lambda c: True, [])
    supabase, _ = clients(fake)
    supabase.fetch_page(REF, SOURCE, None, None, 2, 0, primary_key="id")
    sql = fake.queries()[0]
    assert 'ORDER BY "id" ASC' in sql
    assert "WHERE" not in sql


def test_fetch_page_has_deterministic_ctid_fallback():
    fake = FakeHTTP().add(lambda c: True, [])
    supabase, _ = clients(fake)
    supabase.fetch_page(REF, SOURCE, None, None, 2, 0)
    sql = fake.queries()[0]
    assert "ORDER BY ctid ASC" in sql


def test_fetch_all_marks_full_final_page_as_truncated():
    fake = FakeHTTP().add(lambda c: True, ROWS)
    supabase, _ = clients(fake)
    result = supabase.fetch_all(REF, SOURCE, None, None, batch_size=2,
                                max_pages=2, primary_key="id")
    rows, pages = result  # backwards-compatible 2-tuple unpacking
    assert len(rows) == 4 and pages == 2
    assert result.truncated is True


VOID_ROWS = [
    {"id": 1, "name": "alpha", "updated_at": "2026-11-17T10:00:00+00:00", "payload": None},
    {"id": 2, "name": "beta", "updated_at": "2026-11-18T10:00:00+00:00", "payload": None},
]


def full_page_fake(rows=ROWS):
    """Every data query returns a full batch, so max_pages truncates."""
    fake = FakeHTTP()
    fake.add(is_info, [{"column_name": "updated_at"}])
    fake.add(is_data, rows)
    fake.add(is_db_post, ok_statement)
    fake.add(is_db_get, done_statement)
    fake.add(is_catalog, {})
    return fake


def test_full_final_page_reports_table_failed(tmp_path):
    reg = registry(tmp_path / "registry.json")
    state_path = tmp_path / "state.json"
    spec = mod.load_registry(reg)[0]
    spec.lookback_seconds = 0
    supabase, db = clients(full_page_fake())
    summary = mod.run_once([spec], supabase, db, mod.load_state(str(state_path)),
                           opts(), str(state_path))
    assert not summary["ok"] and summary["tables_failed"] == 1
    assert "max_pages reached" in summary["results"][0]["error"]


def test_truncation_does_not_advance_state(tmp_path):
    reg = registry(tmp_path / "registry.json")
    state_path = tmp_path / "state.json"
    original = {"version": 1, "tables": {
        REF + ":" + SOURCE: {"watermark": "2026-11-01T00:00:00+00:00",
                             "column": "updated_at"}}}
    state_path.write_text(json.dumps(original, sort_keys=True), encoding="utf-8")
    before = state_path.read_text()
    spec = mod.load_registry(reg)[0]
    spec.lookback_seconds = 0
    supabase, db = clients(full_page_fake())
    mod.run_once([spec], supabase, db, mod.load_state(str(state_path)),
                 opts(), str(state_path))
    assert state_path.read_text() == before


def test_new_table_casts_void_columns_to_string(tmp_path, monkeypatch):
    reg = registry(tmp_path / "registry.json")
    state_path = tmp_path / "state.json"
    spec = mod.load_registry(reg)[0]
    spec.lookback_seconds = 0
    fake = standard_fake(rows=VOID_ROWS)
    fake.handlers.insert(0, (is_catalog,
                             mod.SyncError("HTTP 404 for GET catalog table")))
    supabase, db = clients(fake)

    inspections = []

    def column_types(name):
        inspections.append(name)
        if len(inspections) >= 2:  # post-CREATE DESCRIBE sees an all-NULL column
            return {"id": "bigint", "name": "string",
                    "updated_at": "timestamp", "payload": "void"}
        return {}

    monkeypatch.setattr(db, "column_types", column_types)
    summary = mod.run_once([spec], supabase, db, mod.load_state(str(state_path)),
                           opts(), str(state_path))
    assert summary["ok"] and len(inspections) >= 2
    alters = [s for s in fake.statements() if s.startswith("ALTER TABLE")]
    assert len(alters) == 1
    assert "ALTER COLUMN `payload` TYPE STRING" in alters[0]
    assert alters[0].startswith("ALTER TABLE `catalog`.`schema`.`projects` ")


def test_existing_table_never_gets_void_cast(tmp_path, monkeypatch):
    reg = registry(tmp_path / "registry.json")
    state_path = tmp_path / "state.json"
    spec = mod.load_registry(reg)[0]
    spec.lookback_seconds = 0
    fake = standard_fake(rows=VOID_ROWS)  # catalog returns {} -> table exists
    supabase, db = clients(fake)
    monkeypatch.setattr(db, "column_types", lambda name: {
        "id": "bigint", "name": "string", "updated_at": "timestamp",
        "payload": "void"})
    summary = mod.run_once([spec], supabase, db, mod.load_state(str(state_path)),
                           opts(), str(state_path))
    assert summary["ok"]
    statements = fake.statements()
    assert not any(s.startswith("ALTER TABLE") for s in statements)
    assert not any(s.startswith("CREATE TABLE") for s in statements)
    assert any(s.startswith("MERGE INTO") for s in statements)

# --- final review fixes -------------------------------------------------
def test_fetch_page_uses_ctid_tiebreaker_with_watermark_and_no_pk():
    fake = FakeHTTP().add(lambda c: True, [])
    supabase, _ = clients(fake)
    supabase.fetch_page(REF, SOURCE, "updated_at", "2026-01-01T00:00:00Z",
                        2, 0, primary_key=None)
    sql = fake.queries()[0]
    assert 'ORDER BY "updated_at" ASC, ctid ASC' in sql


class _SequenceHTTP(FakeHTTP):
    """Returns scripted batches for data queries, empty for any extra probe."""

    def __init__(self, batches):
        super().__init__()
        self.batches = list(batches)
        self.add(is_info, [{"column_name": "updated_at"}])

        def responder(call):
            if self.batches:
                return self.batches.pop(0)
            return []
        self.add(is_data, responder)


def test_fetch_all_exact_page_boundary_is_not_truncated():
    rows1 = [dict(r, updated_at="2026-01-01T00:00:00Z") for r in ROWS]
    rows2 = [dict(r, updated_at="2026-01-02T00:00:00Z") for r in ROWS]
    fake = _SequenceHTTP([rows1, rows2])
    supabase, _ = clients(fake)
    result = supabase.fetch_all(REF, SOURCE, "updated_at", None,
                                batch_size=2, max_pages=2, primary_key="id")
    assert len(result[0]) == 4 and result.truncated is False


def test_fetch_all_probe_finding_more_rows_is_truncated():
    rows1 = [dict(r, updated_at="2026-01-01T00:00:00Z") for r in ROWS]
    rows2 = [dict(r, updated_at="2026-01-02T00:00:00Z") for r in ROWS]
    fake = _SequenceHTTP([rows1, rows2, [dict(r, updated_at="2026-01-03T00:00:00Z") for r in ROWS[:1]]])
    supabase, _ = clients(fake)
    result = supabase.fetch_all(REF, SOURCE, "updated_at", None,
                                batch_size=2, max_pages=2, primary_key="id")
    assert result.truncated is True

# --- rate-limit backoff --------------------------------------------------
def test_query_retries_http_429_with_backoff():
    calls, sleeps = [], []

    def flaky(url, *, method="GET", headers=None, body=None, timeout=60):
        calls.append(url)
        if len(calls) < 3:
            raise mod.SyncError("HTTP 429 for %s: Too Many Requests" % url)
        return [{"ok": True}]

    supabase = mod.SupabaseClient("fake-pat", http=flaky,
                                  sleep_fn=lambda seconds: sleeps.append(seconds))
    assert supabase.query(REF, "SELECT 1") == [{"ok": True}]
    assert len(calls) == 3 and sleeps == [5, 10]


def test_query_does_not_retry_other_http_errors():
    calls = []

    def failing(url, **kwargs):
        calls.append(url)
        raise mod.SyncError("HTTP 500 for %s" % url)

    supabase = mod.SupabaseClient("fake-pat", http=failing, sleep_fn=lambda _: None)
    with pytest.raises(mod.SyncError):
        supabase.query(REF, "SELECT 1")
    assert len(calls) == 1

