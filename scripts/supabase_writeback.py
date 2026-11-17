#!/usr/bin/env python3
"""Write governed sync metadata back to Supabase.

The Supabase data plane (PostgREST/Storage) returns HTTP 402 for this
project, but the Management API query endpoint accepts writes. This module
uses only additive tables and idempotent upserts -- it never deletes or
rewrites existing Supabase data. Token comes from the environment/dotenv.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_databricks_sync import (  # noqa: E402
    SyncError, http_json, load_env_file, log, sql_literal,
)

AUDIT_TABLE = "public.databricks_sync_audit"
GITHUB_TABLE = "public.github_projects"
DEFAULT_REFS = ["huadtiuuoiriqrjpjxhr", "hoseohvgoiarxluxqwqv"]


def write_query(pat, ref, sql, http=http_json):
    if not pat:
        raise SyncError("SUPABASE_PAT is not set")
    if not re.fullmatch(r"[a-z0-9]+", ref or ""):
        raise SyncError("invalid Supabase project ref")
    url = "https://api.supabase.com/v1/projects/%s/database/query" % ref
    result = http(url, method="POST", headers={
        "Authorization": "Bearer " + pat, "Content-Type": "application/json",
        "User-Agent": "supabase-writeback"}, body={"query": sql}, timeout=90)
    if isinstance(result, dict) and "error" in result:
        raise SyncError(str(result["error"]))
    return result


def lit(value):
    return sql_literal(value)


def audit_rows(state_path):
    if not state_path or not Path(state_path).exists():
        return []
    with open(state_path, encoding="utf-8") as handle:
        state = json.load(handle)
    if not isinstance(state, dict):
        return []
    tables = state.get("tables", {})
    return list(tables.items()) if isinstance(tables, dict) else []


def audit_sql(rows, now):
    stmts = [
        "CREATE TABLE IF NOT EXISTS %s (table_key text PRIMARY KEY, "
        "project_ref text, watermark text, status text, updated_at timestamptz)"
        % AUDIT_TABLE,
    ]
    if rows:
        values = ",\n  ".join(
            "(%s, %s, %s, %s, %s)" % (lit(key), lit(str(val.get("project_ref", ""))),
                                      lit(str(val.get("watermark", ""))),
                                      lit(str(val.get("status", "ok"))), lit(now))
            for key, val in rows if isinstance(val, dict))
        if values:
            stmts.append(
                'INSERT INTO %s ("table_key","project_ref","watermark","status","updated_at") '
                'VALUES\n  %s\nON CONFLICT ("table_key") DO UPDATE SET ' 
                "project_ref=EXCLUDED.project_ref, watermark=EXCLUDED.watermark, "
                "status=EXCLUDED.status, updated_at=EXCLUDED.updated_at" % (AUDIT_TABLE, values))
    return stmts


def github_sql(repos, now):
    stmts = [
        "CREATE TABLE IF NOT EXISTS %s (repository text PRIMARY KEY, name text, "
        "html_url text, archived boolean, pushed_at timestamptz, synced_at timestamptz)"
        % GITHUB_TABLE,
    ]
    values = ",\n  ".join(
        "(%s, %s, %s, %s, %s, %s)" % (
            lit(r.get("full_name")), lit(r.get("name")), lit(r.get("html_url")),
            "TRUE" if r.get("archived") else "FALSE", lit(r.get("pushed_at")), lit(now))
        for r in repos if r.get("full_name"))
    if values:
        stmts.append(
            'INSERT INTO %s ("repository","name","html_url","archived","pushed_at","synced_at") '
            'VALUES\n  %s\nON CONFLICT ("repository") DO UPDATE SET ' 
            "name=EXCLUDED.name, html_url=EXCLUDED.html_url, archived=EXCLUDED.archived, "
            "pushed_at=EXCLUDED.pushed_at, synced_at=EXCLUDED.synced_at" % (GITHUB_TABLE, values))
    return stmts


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--env-file", default="/data/home/workspace/.env")
    parser.add_argument("--mode", choices=["audit", "github"], required=True)
    parser.add_argument("--ref", action="append", default=[])
    parser.add_argument("--state", default=".sync_state/sync_state.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    load_env_file(args.env_file)
    try:
        pat = os.environ.get("SUPABASE_PAT", "")
        refs = args.ref or DEFAULT_REFS
        now = datetime.now(timezone.utc).isoformat()
        if args.mode == "audit":
            rows = audit_rows(args.state)
            sql = audit_sql(rows, now)
        else:
            from github_projects_sync import fetch_repos
            repos = fetch_repos(os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN", ""),
                                "hillstreet-ph")
            sql = github_sql(repos, now)
            rows = repos
        if args.dry_run:
            log("writeback_dry_run", mode=args.mode, rows=len(rows),
                refs=refs, statements=len(sql))
            return 0
        for ref in refs:
            for statement in sql:
                write_query(pat, ref, statement)
            log("writeback", mode=args.mode, ref=ref, rows=len(rows),
                statements=len(sql))
        return 0
    except (SyncError, OSError, ValueError) as exc:
        log("fatal", error=str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
