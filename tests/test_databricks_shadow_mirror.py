"""Offline tests for scripts/databricks_shadow_mirror.py.

Every HTTP call is intercepted by FakeHTTP; no live Databricks request is
ever made. No credential values appear in this file.
"""
import importlib.util
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "databricks_shadow_mirror.py"
_spec = importlib.util.spec_from_file_location("databricks_shadow_mirror", MODULE_PATH)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)

PRIMARY_A = "open_connect.open_platform.auth__users"
FLAT_A = "open_platform__auth__users"
PRIMARY_B = "open_connect.open_operations.auth__users"
FLAT_B = "open_operations__auth__users"


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

    def statements(self):
        return [c["body"]["statement"] for c in self.calls
                if "api/2.0/sql/statements" in c["url"] and c["method"] == "POST"]


def is_post(c):
    return "api/2.0/sql/statements" in c["url"] and c["method"] == "POST"


def client_for(fake, counts=None):
    """Build a DatabricksClient whose COUNT queries return seeded values."""
    counts = counts or {}

    def responder(call):
        stmt = call["body"]["statement"]
        if "COUNT(*)" in stmt.upper():
            fqn = stmt.split("FROM", 1)[1].strip().replace("`", "")
            value = counts.get(fqn, 0)
            return {"statement_id": "s", "status": {"state": "SUCCEEDED"},
                    "result": {"data_array": [[str(value)]]}}
        return {"statement_id": "s", "status": {"state": "SUCCEEDED"}}

    fake.add(is_post, responder)
    return mod.DatabricksClient("https://dbx.example", "fake-token",
                                http=fake.http, sleep_fn=lambda _: None)


def spec(name, primary, rows=None):
    return mod.MirrorSpec(name, primary, rows)


def registry_file(path, entries):
    path.write_text(json.dumps(entries), encoding="utf-8")
    return str(path)


# --------------------------------------------------------------------------- #
# registry + helpers
# --------------------------------------------------------------------------- #
def test_load_registry_project_map_shape(tmp_path):
    path = registry_file(tmp_path / "map.json", [
        {"databricks_table": PRIMARY_A, "databricks_flat_name": FLAT_A, "row_count": 10},
        {"databricks_table": PRIMARY_B, "databricks_flat_name": FLAT_B, "row_count": 20},
    ])
    specs = mod.load_registry(path)
    assert [s.name for s in specs] == [FLAT_A, FLAT_B]
    assert specs[0].primary_fqn == PRIMARY_A
    assert specs[0].shadow_fqn == "open_connect.shadow." + FLAT_A
    assert specs[0].row_count == 10


def test_load_registry_sync_registry_shape_derives_flat_name(tmp_path):
    path = registry_file(tmp_path / "reg.json", {
        "defaults": {"batch_size": 500},
        "tables": {"ref-1": {"auth.users": {"databricks": PRIMARY_B}}},
    })
    specs = mod.load_registry(path)
    assert len(specs) == 1
    assert specs[0].name == FLAT_B
    assert specs[0].primary_fqn == PRIMARY_B


def test_shadow_name_from_primary():
    assert mod.shadow_name_from_primary(PRIMARY_A) == FLAT_A
    assert mod.shadow_name_from_primary("open_connect.open_operations.storage__buckets") == \
        "open_operations__storage__buckets"


def test_shadow_target_guard_rejects_non_shadow():
    assert mod.validate_shadow_target("open_connect.shadow." + FLAT_A) == \
        "open_connect.shadow." + FLAT_A
    with pytest.raises(mod.MirrorError, match="open_connect.shadow"):
        mod.validate_shadow_target(PRIMARY_A)


# --------------------------------------------------------------------------- #
# SQL construction
# --------------------------------------------------------------------------- #
def test_build_mirror_sql_uses_create_or_replace_with_backticks():
    sql = mod.build_mirror_sql(spec(FLAT_A, PRIMARY_A, 10))
    upper = sql.upper()
    assert upper.startswith("CREATE OR REPLACE TABLE ")
    assert "AS SELECT * FROM " in upper
    assert "`open_connect`.`shadow`.`%s`" % FLAT_A in sql
    assert "`open_connect`.`open_platform`.`auth__users`" in sql
    assert "DROP" not in upper and "DELETE" not in upper and "TRUNCATE" not in upper


def test_count_sql_uses_backticks():
    assert mod.count_sql(PRIMARY_A) == "SELECT COUNT(*) FROM " + mod.dqid(PRIMARY_A)


# --------------------------------------------------------------------------- #
# credentials (never print or store secret values)
# --------------------------------------------------------------------------- #
def test_read_env_file_parses_key_value_lines(tmp_path):
    path = tmp_path / ".env"
    path.write_text('# comment\nexport DATABRICKS_HOST="https://dbx.example"\n\n'
                    'DATABRICKS_TOKEN=not-a-real-token\n', encoding="utf-8")
    env = mod.read_env_file(str(path))
    assert env["DATABRICKS_HOST"] == "https://dbx.example"
    assert env["DATABRICKS_TOKEN"] == "not-a-real-token"


def test_missing_env_key_produces_clean_error():
    with pytest.raises(mod.MirrorError) as excinfo:
        mod.credentials_from_env({"DATABRICKS_HOST": "https://dbx.example"})
    message = str(excinfo.value)
    assert "DATABRICKS_TOKEN" in message
    assert "https://dbx.example" not in message  # no value leaked into the error


def test_missing_both_env_keys_are_named():
    with pytest.raises(mod.MirrorError) as excinfo:
        mod.credentials_from_env({})
    assert "DATABRICKS_HOST" in str(excinfo.value)
    assert "DATABRICKS_TOKEN" in str(excinfo.value)


def test_no_credentials_hardcoded_in_source():
    source = MODULE_PATH.read_text(encoding="utf-8")
    assert "DATABRICKS_TOKEN" in source and "DATABRICKS_HOST" in source
    assert "read_env_file" in source
    assert not re.search(r"Bearer\s+[A-Za-z0-9_-]{20,}", source)


# --------------------------------------------------------------------------- #
# orchestration
# --------------------------------------------------------------------------- #
def test_dry_run_emits_no_writes():
    specs = [spec(FLAT_A, PRIMARY_A, 10), spec(FLAT_B, PRIMARY_B, 20)]
    fake = FakeHTTP()
    client = client_for(fake)
    summary = mod.run(specs, client, mode="dry-run")
    assert fake.calls == []
    assert summary["tables_total"] == 2
    assert summary["writes_attempted"] == 0
    assert len(summary["planned"]) == 2
    assert all("CREATE OR REPLACE TABLE" in p["sql"] for p in summary["planned"])


def test_table_filter_limits_selection():
    specs = [spec(FLAT_A, PRIMARY_A, 10), spec(FLAT_B, PRIMARY_B, 20)]
    fake = FakeHTTP()
    client = client_for(fake)
    summary = mod.run(specs, client, mode="once", tables=[FLAT_B])
    assert summary["tables_total"] == 1
    creates = [s for s in fake.statements() if s.upper().startswith("CREATE OR REPLACE")]
    assert len(creates) == 1
    assert FLAT_B in creates[0] and FLAT_A not in creates[0]


def test_verify_detects_row_count_mismatch():
    specs = [spec(FLAT_A, PRIMARY_A, 10)]
    counts = {PRIMARY_A: 10, "open_connect.shadow." + FLAT_A: 9}
    fake = FakeHTTP()
    client = client_for(fake, counts=counts)
    summary = mod.run(specs, client, mode="verify")
    assert summary["mismatches"] == 1
    assert summary["ok"] is False
    result = summary["results"][0]
    assert result["primary_rows"] == 10
    assert result["shadow_rows"] == 9
    assert result["match"] is False
    assert not any(s.upper().startswith("CREATE") for s in fake.statements())


def test_verify_reports_zero_mismatches_when_counts_match():
    specs = [spec(FLAT_A, PRIMARY_A, 10)]
    counts = {PRIMARY_A: 10, "open_connect.shadow." + FLAT_A: 10}
    fake = FakeHTTP()
    client = client_for(fake, counts=counts)
    summary = mod.run(specs, client, mode="verify")
    assert summary["mismatches"] == 0
    assert summary["ok"] is True
    assert summary["results"][0]["match"] is True


def test_once_mirrors_all_tables_and_writes_only_to_shadow():
    specs = [spec(FLAT_A, PRIMARY_A, 10), spec(FLAT_B, PRIMARY_B, 20)]
    counts = {
        PRIMARY_A: 10, "open_connect.shadow." + FLAT_A: 10,
        PRIMARY_B: 20, "open_connect.shadow." + FLAT_B: 20,
    }
    fake = FakeHTTP()
    client = client_for(fake, counts=counts)
    summary = mod.run(specs, client, mode="once")
    statements = fake.statements()
    creates = [s for s in statements if s.upper().startswith("CREATE OR REPLACE")]
    assert len(creates) == 2
    assert all("`open_connect`.`shadow`." in s for s in creates)
    assert all("DROP" not in s.upper() and "DELETE" not in s.upper() for s in statements)
    assert summary["mirrored"] == 2 and summary["mirror_errors"] == 0
    assert summary["mismatches"] == 0 and summary["ok"] is True


def test_main_reports_missing_env_key_cleanly(tmp_path, capsys):
    env_file = tmp_path / ".env"
    env_file.write_text('DATABRICKS_HOST="https://dbx.example"\n', encoding="utf-8")
    reg = registry_file(tmp_path / "map.json", [
        {"databricks_table": PRIMARY_A, "databricks_flat_name": FLAT_A, "row_count": 10},
    ])
    rc = mod.main(["--once", "--env-file", str(env_file), "--registry", reg])
    assert rc == 2
    out = capsys.readouterr().out
    assert "DATABRICKS_TOKEN" in out
    assert "https://dbx.example" not in out


# --------------------------------------------------------------------------- #
# quality-review regressions
# --------------------------------------------------------------------------- #
def test_execute_evaluates_final_poll_success():
    """A statement succeeding on the very last GET must not report a timeout."""
    fake = FakeHTTP()
    gets = []

    def get(call):
        gets.append(1)
        if len(gets) == 4:  # last of max_poll + 1 = 4 polls
            return {"statement_id": "s1", "status": {"state": "SUCCEEDED"},
                    "result": {"data_array": [["42"]]}}
        return {"statement_id": "s1", "status": {"state": "PENDING"}}

    fake.add(is_post, lambda c: {"statement_id": "s1", "status": {"state": "PENDING"}})
    fake.add(lambda c: c["method"] == "GET", get)
    client = mod.DatabricksClient("https://dbx.example", "fake-token",
                                  http=fake.http, sleep_fn=lambda _: None, max_poll=3)
    resp = client.execute("SELECT 1")
    assert resp["status"]["state"] == "SUCCEEDED"
    assert resp["result"]["data_array"] == [["42"]]


def test_execute_handles_status_error_none():
    """status.error == None must yield a clean MirrorError, not AttributeError."""
    fake = FakeHTTP()
    fake.add(is_post, lambda c: {"statement_id": "s1",
                                 "status": {"state": "FAILED", "error": None}})
    client = mod.DatabricksClient("https://dbx.example", "fake-token",
                                  http=fake.http, sleep_fn=lambda _: None, max_poll=3)
    with pytest.raises(mod.MirrorError) as excinfo:
        client.execute("SELECT 1")
    message = str(excinfo.value)
    assert "s1" in message and "FAILED" in message
    assert "AttributeError" not in message


def test_credentials_error_names_custom_env_file(tmp_path):
    env_file = tmp_path / "custom.env"
    env_file.write_text('DATABRICKS_HOST="https://dbx.example"\n', encoding="utf-8")
    with pytest.raises(mod.MirrorError) as excinfo:
        mod.load_credentials(str(env_file))
    message = str(excinfo.value)
    assert str(env_file) in message
    assert mod.DEFAULT_ENV_FILE not in message


def test_validate_shadow_target_rejects_dotted_flat_name():
    with pytest.raises(mod.MirrorError, match="open_connect.shadow"):
        mod.validate_shadow_target("open_connect.shadow.a.b")


def test_validate_shadow_target_rejects_backticks():
    with pytest.raises(mod.MirrorError, match="open_connect.shadow"):
        mod.validate_shadow_target("open_connect.shadow.a`b")
