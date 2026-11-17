"""Offline tests for scripts/supabase_backup_janitor.py.

Every HTTP call is intercepted by FakeHTTP; no live Supabase or R2 request is
ever made. No credential values appear in this file.
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "supabase_backup_janitor.py"
_spec = importlib.util.spec_from_file_location("supabase_backup_janitor", MODULE_PATH)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


class FakeResponse:
    """Minimal context-manager response returned by the fake urlopen."""

    def __init__(self, payload=None, status=200):
        self._payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        if isinstance(self._payload, (bytes, bytearray)):
            return bytes(self._payload)
        return json.dumps(self._payload).encode("utf-8")


class FakeHTTP:
    """Drop-in replacement for urllib.request.urlopen, fully in-process."""

    def __init__(self, gate_ok=True, sql_router=None):
        self.calls = []
        self.gate_ok = gate_ok
        self.sql_router = sql_router or (lambda q: [])

    def urlopen(self, req, timeout=None):
        method = req.get_method()
        url = req.full_url
        if method == "HEAD":
            self.calls.append({"method": "HEAD", "url": url})
            if not self.gate_ok:
                raise RuntimeError("simulated missing R2 manifest")
            return FakeResponse(status=200)
        if method == "POST":
            query = json.loads(req.data.decode("utf-8"))["query"]
            self.calls.append({"method": "POST", "url": url, "query": query})
            return FakeResponse(payload=self.sql_router(query))
        raise AssertionError("unexpected HTTP method %s" % method)

    def sql_queries(self):
        return [c["query"] for c in self.calls if c["method"] == "POST"]


def old_rows(*set_ids):
    return [
        {"set_id": s, "parts": 2, "newest": "2000-01-01T00:00:00+00:00", "bytes": "5"}
        for s in set_ids
    ]


def router(rows):
    """SQL router emulating old_sets plus the two-step lifecycle delete."""

    def respond(query):
        if "delete_lifecycle_objects" in query:
            return [{"id": "r1"}, {"id": "r2"}]
        if query.lstrip().upper().startswith("UPDATE"):
            return []
        if "SELECT split_part" in query:
            return rows
        return []

    return respond


@pytest.fixture
def creds(monkeypatch):
    """The janitor reads its config at import time, so patch the module attrs."""
    monkeypatch.setattr(mod, "PAT", "fake-pat")
    monkeypatch.setattr(mod, "AK", "fake-ak")
    monkeypatch.setattr(mod, "SK", "fake-sk")
    monkeypatch.setattr(mod, "EP", "https://r2.example")
    monkeypatch.setattr(mod, "REF", "testref")
    monkeypatch.setattr(mod, "BUCKET", "open-system-backups")
    monkeypatch.setattr(mod, "R2BUCKET", "supabase-backups")


def patch_urlopen(monkeypatch, fake):
    monkeypatch.setattr(mod.urllib.request, "urlopen", fake.urlopen)
    return fake


def run_main(monkeypatch, *args):
    """main() parses sys.argv directly; supply argv through monkeypatch."""
    monkeypatch.setattr(sys, "argv", ["supabase_backup_janitor", *args])
    return mod.main()


# --------------------------------------------------------------------------- #
# Malformed identifiers: refuse empty / slash-delimited / non-string set ids.
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("bad", ["", "   ", "\t", None, "/", "a/b", "2026/01/01"])
def test_malformed_set_id_refused(monkeypatch, bad):
    monkeypatch.setattr(mod, "BUCKET", "open-system-backups")
    seen = []

    def sql(query, write=False):
        seen.append(query)
        return []

    monkeypatch.setattr(mod, "supabase_sql", sql)
    with pytest.raises(ValueError, match="empty or malformed"):
        mod.delete_set(bad)
    assert seen == [], "no SQL may run for a malformed set id"


# --------------------------------------------------------------------------- #
# Bucket scoping: never touch credentials / invoices / non-backup buckets.
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("bucket", ["credentials", "invoices", "user-uploads", ""])
def test_non_backup_bucket_refused(monkeypatch, bucket):
    monkeypatch.setattr(mod, "BUCKET", bucket)
    seen = []
    monkeypatch.setattr(mod, "supabase_sql", lambda q, write=False: seen.append(q) or [])
    with pytest.raises(ValueError, match="non-backup bucket"):
        mod.delete_set("set-1")
    with pytest.raises(ValueError, match="non-backup bucket"):
        mod.old_sets(7)
    assert seen == []


def test_old_sets_query_is_scoped_to_backup_bucket(monkeypatch, creds):
    seen = []

    def sql(query, write=False):
        seen.append((query, write))
        return []

    monkeypatch.setattr(mod, "supabase_sql", sql)
    mod.old_sets(7)
    assert len(seen) == 1
    query = seen[0][0]
    assert "bucket_id='open-system-backups'" in query
    assert "credentials" not in query.lower()
    assert "invoices" not in query.lower()


# --------------------------------------------------------------------------- #
# SQL escaping.
# --------------------------------------------------------------------------- #
def test_set_id_and_bucket_are_sql_escaped(monkeypatch, creds):
    seen = []

    def sql(query, write=False):
        seen.append(query)
        return []

    monkeypatch.setattr(mod, "supabase_sql", sql)
    monkeypatch.setattr(mod, "BUCKET", "open-system-backup's")
    mod.delete_set("o'brien")
    assert len(seen) == 2
    assert all("o''brien" in q for q in seen)
    assert all("open-system-backup''s" in q for q in seen)


# --------------------------------------------------------------------------- #
# Lifecycle sequence: archive first, then storage.delete_lifecycle_objects.
# --------------------------------------------------------------------------- #
def test_delete_set_archives_then_calls_lifecycle_delete(monkeypatch, creds):
    calls = []

    def sql(query, write=False):
        calls.append((query, write))
        if query.lstrip().upper().startswith("UPDATE"):
            return []
        return [{"id": "r1"}, {"id": "r2"}]

    monkeypatch.setattr(mod, "supabase_sql", sql)
    assert mod.delete_set("2026-01-01") == 2
    assert len(calls) == 2
    first, second = calls
    assert first[0].startswith("UPDATE storage.objects SET archived_at=now()")
    assert first[1] is True
    assert "archived_at IS NULL" in first[0]
    assert "delete_lifecycle_objects" in second[0]
    assert second[1] is True
    assert "bucket_id='open-system-backups'" in first[0]
    assert "bucket_id='open-system-backups'" in second[0]


# --------------------------------------------------------------------------- #
# main(): gate enforcement, dry-run vs. apply.
# --------------------------------------------------------------------------- #
def test_dry_run_performs_no_deletes(monkeypatch, creds, capsys):
    fake = patch_urlopen(monkeypatch, FakeHTTP(gate_ok=True, sql_router=router(old_rows("2026-01-01"))))
    rc = run_main(monkeypatch, "--retention-days", "7")
    out = capsys.readouterr().out
    assert rc == 0
    assert '"gate": "pass"' in out
    queries = fake.sql_queries()
    assert queries and "SELECT split_part" in queries[0]
    assert not any(q.lstrip().upper().startswith("UPDATE") for q in queries)
    assert not any("delete_lifecycle_objects" in q for q in queries)
    assert '"would_delete": "2026-01-01"' in out
    assert '"deleted"' not in out
    assert '"applied": false' in out
    assert '"deleted_rows": 0' in out


def test_apply_blocked_without_manifest_gate(monkeypatch, creds, capsys):
    fake = patch_urlopen(monkeypatch, FakeHTTP(gate_ok=False))
    rc = run_main(monkeypatch, "--apply")
    out = capsys.readouterr().out
    assert rc == 3
    assert '"gate": "fail"' in out
    assert fake.sql_queries() == [], "no SQL may run when the R2 gate fails"
    assert '"would_delete"' not in out and '"deleted"' not in out


def test_apply_deletes_only_after_archiving(monkeypatch, creds, capsys):
    fake = patch_urlopen(monkeypatch, FakeHTTP(gate_ok=True, sql_router=router(old_rows("2026-01-01"))))
    rc = run_main(monkeypatch, "--apply", "--retention-days", "7")
    out = capsys.readouterr().out
    assert rc == 0
    queries = fake.sql_queries()
    archive = [i for i, q in enumerate(queries) if q.lstrip().upper().startswith("UPDATE")]
    lifecycle = [i for i, q in enumerate(queries) if "delete_lifecycle_objects" in q]
    assert len(archive) == 1 and len(lifecycle) == 1
    assert archive[0] < lifecycle[0]
    assert '"deleted": "2026-01-01"' in out
    assert '"rows": 2' in out
    assert '"applied": true' in out
    assert '"deleted_rows": 2' in out


def test_missing_credentials_exits_before_any_http(monkeypatch, creds, capsys):
    monkeypatch.setattr(mod, "PAT", "")
    fake = patch_urlopen(monkeypatch, FakeHTTP(gate_ok=True))
    rc = run_main(monkeypatch)
    assert rc == 2
    assert fake.calls == []
    assert "missing credentials" in capsys.readouterr().err
