#!/usr/bin/env python3
"""Sync the GitHub org project inventory into Databricks.

Read-only on GitHub; upsert-only on Databricks. No credentials are stored in
this file -- tokens come from the process environment or a dotenv file.
"""
import argparse
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_databricks_sync import (  # noqa: E402
    DatabricksClient, SyncError, dqid, http_json, load_env_file, log, sql_literal,
)

DEFAULT_ORG = "hillstreet-ph"
# The Databricks metastore is at its table quota, so the GitHub inventory is
# upserted as tagged rows in the existing governed project registry instead of
# creating another table. `schema_name='github_org'` marks these rows.
DEFAULT_TARGET = "open_connect.open_platform.platform_shared__project_registry"
COLUMNS = ["created_at", "display_name", "enabled", "environment", "id",
           "project_key", "repository", "schema_name", "updated_at",
           "_rescued_data"]


def normalise(repo, synced_at):
    import uuid
    full_name = repo.get("full_name", "")
    return [
        repo.get("created_at") or synced_at,
        repo.get("name") or full_name.split("/")[-1],
        not bool(repo.get("archived") or repo.get("disabled")),
        "github",
        str(uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/" + full_name)),
        repo.get("name") or full_name.split("/")[-1],
        full_name,
        "github_org",
        synced_at,
        None,
    ]


def fetch_repos(token, org, http=http_json):
    if not token:
        raise SyncError("GITHUB_PERSONAL_ACCESS_TOKEN is not set")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", org or ""):
        raise SyncError("invalid GitHub organisation name")
    url = ("https://api.github.com/orgs/%s/repos?per_page=100&sort=updated&type=all"
           % org)
    result = http(url, method="GET", headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "User-Agent": "open-connect-github-project-sync",
    }, timeout=60)
    if not isinstance(result, list):
        raise SyncError("unexpected GitHub repos response: %s" % type(result).__name__)
    if len(result) >= 100:
        raise SyncError("org has 100+ repos; pagination is required before syncing")
    return result


def stage_sql(rows):
    tuples = ["(" + ", ".join(sql_literal(v) for v in row) + ")" for row in rows]
    return ("SELECT * FROM VALUES\n  " + ",\n  ".join(tuples)
            + "\n  AS src(" + ", ".join(dqid(c) for c in COLUMNS) + ")")


def merge_sql(target, stage):
    updates = ", ".join("%s = src.%s" % (dqid(c), dqid(c))
                        for c in COLUMNS if c != "repository")
    cols = ", ".join(dqid(c) for c in COLUMNS)
    vals = ", ".join("src.%s" % dqid(c) for c in COLUMNS)
    return ("MERGE INTO %s AS tgt USING (%s) AS src "
            "ON tgt.`id` = src.`id` "
            "WHEN MATCHED THEN UPDATE SET %s "
            "WHEN NOT MATCHED THEN INSERT (%s) VALUES (%s)"
            % (dqid(target), stage, updates, cols, vals))


def count_rows(client, target):
    """Read a row count via the SQL API (submit() discards result rows)."""
    body = {"statement": ("SELECT count(*) FROM %s WHERE `schema_name` = 'github_org'"
                          % dqid(target)),
            "warehouse_id": client.warehouse_id, "wait_timeout": "30s"}
    response = client.http(client.statements_url, method="POST",
                           headers=client.headers, body=body, timeout=client.timeout)
    sid = response.get("statement_id")
    for _ in range(client.max_poll + 1):
        if response.get("status", {}).get("state") in ("SUCCEEDED", "FAILED"):
            break
        response = client.http("%s/%s" % (client.statements_url, sid),
                               method="GET", headers=client.headers,
                               timeout=client.timeout)
    if response.get("status", {}).get("state") != "SUCCEEDED":
        raise SyncError("count query failed for %s" % target)
    return int(response["result"]["data_array"][0][0])


def run(token, client, org=DEFAULT_ORG, target=DEFAULT_TARGET, dry_run=False):
    repos = fetch_repos(token, org)
    rows = [normalise(r, __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc).isoformat()) for r in repos]
    stage = stage_sql(rows) if rows else None
    statements = [("merge", merge_sql(target, stage))] if stage else []
    if dry_run:
        log("github_projects_dry_run", org=org, repos=len(rows),
            statements=[k for k, _ in statements])
        return {"ok": True, "dry_run": True, "repos": len(rows)}
    executed = []
    for kind, sql in statements:
        outcome = client.submit(sql)
        executed.append({"kind": kind, "state": outcome.get("state"),
                         "statement_id": outcome.get("statement_id")})
    count = count_rows(client, target)
    ok = count == len(rows)
    summary = {"ok": ok, "org": org, "repos": len(rows), "target_rows": count,
               "executed": [e["kind"] for e in executed]}
    log("github_projects_sync", **summary)
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--env-file", default="/data/home/workspace/.env")
    parser.add_argument("--org", default=DEFAULT_ORG)
    parser.add_argument("--target", default=DEFAULT_TARGET)
    parser.add_argument("--warehouse-id", default="dae787fe16c17482")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    load_env_file(args.env_file)
    try:
        token = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN", "")
        client = None if args.dry_run else DatabricksClient(
            os.environ.get("DATABRICKS_HOST", ""),
            os.environ.get("DATABRICKS_TOKEN", ""),
            warehouse_id=args.warehouse_id)
        result = run(token, client, org=args.org, target=args.target,
                     dry_run=args.dry_run)
        return 0 if result["ok"] else 1
    except (SyncError, OSError, ValueError) as exc:
        log("fatal", error=str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
