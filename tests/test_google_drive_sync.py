import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import google_drive_sync as mod
from supabase_databricks_sync import SyncError


def test_oauth_requires_all_credentials():
    with pytest.raises(SyncError, match="required"):
        mod.access_token("id", "secret", "")


def test_list_files_drops_trashed_and_caps():
    http = lambda *a, **k: {"files": [{"id": "1", "name": "a"},
                                      {"id": "2", "trashed": True}]}
    assert mod.list_files("tok", http=http) == [{"id": "1", "name": "a"}]


def test_normalise_namespaces_drive_id():
    d = dict(zip(mod.COLUMNS, mod.normalise({"id": "x", "name": "Doc",
                                              "mimeType": "text/plain"}, "now")))
    assert d["id"] == "gdrive:x"
    assert d["schema_name"] == "google_drive"


def test_merge_does_not_create_table():
    sql = mod.merge_sql([mod.normalise({"id": "x", "name": "Doc"}, "now")])
    assert sql.startswith("MERGE INTO")
    assert "CREATE TABLE" not in sql
