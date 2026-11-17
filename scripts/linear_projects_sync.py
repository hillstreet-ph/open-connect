#!/usr/bin/env python3
"""Sync Linear projects into the governed Databricks project registry.

Read-only on Linear, upsert-only on Databricks. No new tables are created
(the metastore is at quota); rows are tagged schema_name='linear' and merged
on a deterministic namespaced id, so Supabase/GitHub rows are untouched.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_databricks_sync import (  # noqa: E402
    DatabricksClient, SyncError, dqid, http_json, load_env_file, log, sql_literal,
)

TARGET = "open_connect.open_platform.platform_shared__project_registry"
COLUMNS = ["created_at", "display_name", "enabled", "environment", "id",
           "project_key", "repository", "schema_name", "updated_at",
           "_rescued_data"]
QUERY = ("query { projects(first: 100) { nodes { id name description state "
         "createdAt updatedAt } pageInfo { hasNextPage endCursor } } }")


def fetch_projects(token, http=http_json):
    if not token:
        raise SyncError("LINEAR_API_KEY is not set")
    result = http("https://api.linear.app/graphql", method="POST",
                  headers={"Authorization": token, "Content-Type": "application/json",
                           "User-Agent": "open-connect-linear-sync"},
                  body={"query": QUERY}, timeout=60)
    if result.get("errors"):
        raise SyncError("Linear GraphQL error: %s" % result["errors"])
    projects = (result.get("data") or {}).get("projects") or {}
    if (projects.get("pageInfo") or {}).get("hasNextPage"):
        raise SyncError("Linear has >100 projects; pagination required")
    return projects.get("nodes") or []


def normalise(item, now):
    return [item.get("createdAt") or now, item.get("name") or "",
            item.get("state") not in ("cancelled", "archived"),
            "linear", "linear:" + item.get("id", ""),
            (item.get("name") or "").lower().replace(" ", "-"),
            "linear:" + item.get("id", ""), "linear",
            item.get("updatedAt") or now,
            json.dumps({"description": item.get("description")})]


def merge_sql(rows):
    tuples = ["(" + ", ".join(sql_literal(v) for v in row) + ")" for row in rows]
    stage = ("SELECT * FROM VALUES\n  " + ",\n  ".join(tuples)
             + "\n  AS src(" + ", ".join(dqid(c) for c in COLUMNS) + ")")
    updates = ", ".join("%s = src.%s" % (dqid(c), dqid(c))
                        for c in COLUMNS if c != "id")
    cols = ", ".join(dqid(c) for c in COLUMNS)
    return ("MERGE INTO %s AS tgt USING (%s) AS src ON tgt.`id` = src.`id` "
            "WHEN MATCHED THEN UPDATE SET %s "
            "WHEN NOT MATCHED THEN INSERT (%s) VALUES (%s)"
            % (dqid(TARGET), stage, updates, cols,
               ", ".join("src.%s" % dqid(c) for c in COLUMNS)))


def run(token, client, dry_run=False):
    items = fetch_projects(token)
    rows = [normalise(i, datetime.now(timezone.utc).isoformat()) for i in items]
    if dry_run:
        log("linear_dry_run", projects=len(rows))
        return {"ok": True, "dry_run": True, "projects": len(rows)}
    client.submit(merge_sql(rows))
    summary = {"ok": True, "projects": len(rows), "target": TARGET}
    log("linear_projects_sync", **summary)
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--env-file", default="/data/home/workspace/.env")
    parser.add_argument("--warehouse-id", default="dae787fe16c17482")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    load_env_file(args.env_file)
    try:
        client = None if args.dry_run else DatabricksClient(
            os.environ.get("DATABRICKS_HOST", ""),
            os.environ.get("DATABRICKS_TOKEN", ""),
            warehouse_id=args.warehouse_id)
        result = run(os.environ.get("LINEAR_API_KEY", ""), client, args.dry_run)
        return 0 if result["ok"] else 1
    except (SyncError, OSError, ValueError) as exc:
        log("fatal", error=str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
