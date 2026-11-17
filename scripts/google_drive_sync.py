#!/usr/bin/env python3
"""Sync Google Drive file metadata into the governed Databricks registry.

Requires a user-consented GOOGLE_REFRESH_TOKEN in addition to the OAuth
client id/secret. Without it the script exits 0 with a skipped event --
it never invents data or creates new Databricks objects.
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_databricks_sync import (  # noqa: E402
    DatabricksClient, SyncError, dqid, http_json, load_env_file, log, sql_literal,
)

TARGET = "open_connect.open_platform.platform_shared__project_registry"
COLUMNS = ["created_at", "display_name", "enabled", "environment", "id",
           "project_key", "repository", "schema_name", "updated_at", "_rescued_data"]
SCOPE = "https://www.googleapis.com/auth/drive.readonly"


def access_token(client_id, secret, refresh):
    if not all([client_id, secret, refresh]):
        raise SyncError("Google OAuth client id, secret and refresh token are all required")
    data = urllib.parse.urlencode({"client_id": client_id, "client_secret": secret,
                                   "refresh_token": refresh, "grant_type": "refresh_token",
                                   "scope": SCOPE}).encode()
    request = urllib.request.Request("https://oauth2.googleapis.com/token", data=data,
                                     headers={"Content-Type": "application/x-www-form-urlencoded",
                                              "User-Agent": "open-connect-drive-sync"},
                                     method="POST")
    with urllib.request.urlopen(request, timeout=45) as response:
        result = json.loads(response.read())
    token = result.get("access_token")
    if not token:
        raise SyncError("Google OAuth refresh failed")
    return token


def list_files(token, max_files=200, http=http_json):
    params = urllib.parse.urlencode({"pageSize": min(max_files, 1000),
                                     "fields": "files(id,name,mimeType,modifiedTime,trashed),nextPageToken"})
    result = http("https://www.googleapis.com/drive/v3/files?" + params,
                  headers={"Authorization": "Bearer " + token, "User-Agent": "open-connect-drive-sync"},
                  timeout=45)
    files = [f for f in (result.get("files") or []) if not f.get("trashed")]
    return files[:max_files]


def normalise(item, now):
    fid = "gdrive:" + item.get("id", "")
    return [item.get("modifiedTime") or now, item.get("name") or "", True,
            "google_drive", fid, fid, fid, "google_drive", now,
            json.dumps({"mime_type": item.get("mimeType")})]


def merge_sql(rows):
    tuples = ["(" + ", ".join(sql_literal(v) for v in r) + ")" for r in rows]
    stage = ("SELECT * FROM VALUES\n  " + ",\n  ".join(tuples)
             + "\n  AS src(" + ", ".join(dqid(c) for c in COLUMNS) + ")")
    updates = ", ".join("%s = src.%s" % (dqid(c), dqid(c)) for c in COLUMNS if c != "id")
    return ("MERGE INTO %s AS tgt USING (%s) AS src ON tgt.`id` = src.`id` "
            "WHEN MATCHED THEN UPDATE SET %s "
            "WHEN NOT MATCHED THEN INSERT (%s) VALUES (%s)"
            % (dqid(TARGET), stage, updates, ", ".join(dqid(c) for c in COLUMNS),
               ", ".join("src." + dqid(c) for c in COLUMNS)))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--env-file", default="/data/home/workspace/.env")
    parser.add_argument("--warehouse-id", default="dae787fe16c17482")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    load_env_file(args.env_file)
    refresh = os.environ.get("GOOGLE_REFRESH_TOKEN", "")
    if not refresh:
        log("skipped", reason="GOOGLE_REFRESH_TOKEN not set; consented Drive access unavailable")
        return 0
    try:
        token = access_token(os.environ.get("GOOGLE_CLIENT_ID", ""),
                             os.environ.get("GOOGLE_CLIENT_SECRET", ""), refresh)
        files = list_files(token)
        now = datetime.now(timezone.utc).isoformat()
        rows = [normalise(f, now) for f in files]
        if args.dry_run:
            log("drive_dry_run", files=len(rows))
            return 0
        client = DatabricksClient(os.environ.get("DATABRICKS_HOST", ""),
                                  os.environ.get("DATABRICKS_TOKEN", ""),
                                  warehouse_id=args.warehouse_id)
        if rows:
            client.submit(merge_sql(rows))
        log("google_drive_sync", files=len(rows), target=TARGET)
        return 0
    except (SyncError, OSError, ValueError) as exc:
        log("fatal", error=str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
