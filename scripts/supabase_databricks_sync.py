#!/usr/bin/env python3
"""Incremental Supabase -> Databricks Delta sync engine.

Both Supabase projects are HTTP 402 on their data plane (REST / Storage /
Auth / Realtime).  The only usable data path is the Management API SQL
endpoint ``POST /v1/projects/{ref}/database/query/read-only`` with a PAT.
Consequently "realtime" here means *scheduled incremental polling*: run this
script repeatedly (cron / worker) with ``--once``.  Supabase Realtime
triggers/WebSockets are deliberately not used.

Safety properties:
  * Supabase is only ever queried through the read-only SQL endpoint.
  * Databricks writes are MERGE (upsert) or INSERT (append + dedup) only;
    there is no DELETE / DROP / TRUNCATE anywhere in this module.
  * A per-table watermark is persisted only after that table's batch has
    been applied successfully; a failed batch leaves the old watermark in
    place, so the next poll replays the same rows (idempotent via MERGE).
  * No credentials are stored in source: all secrets come from env vars
    (optionally loaded from a dotenv file at runtime).
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_REGISTRY = "/data/home/workspace/supabase-export/table_registry.json"
DEFAULT_STATE = "/data/home/workspace/supabase-export/sync_state.json"
DEFAULT_ENV_FILE = "/data/home/workspace/.env"
DEFAULT_WAREHOUSE_ID = "dae787fe16c17482"
DEFAULT_BATCH_SIZE = 500
DEFAULT_MAX_PAGES = 50
DEFAULT_LOOKBACK_SECONDS = 60
DEFAULT_POLL_INTERVAL = 2.0
DEFAULT_MAX_POLL = 60
STAGE_ALIAS = "__supabase_sync_stage"

SUCCESS_STATES = {"SUCCEEDED"}
FAILURE_STATES = {"FAILED", "CANCELED", "CANCELLED", "CLOSED", "TIMEDOUT"}
TERMINAL_STATES = SUCCESS_STATES | FAILURE_STATES


class SyncError(RuntimeError):
    """A recoverable, per-table sync failure (never carries credentials)."""


# --------------------------------------------------------------------------- #
# generic helpers
# --------------------------------------------------------------------------- #
def log(event, **fields):
    """Emit one structured JSON log line."""
    payload = {"event": event}
    payload.update(fields)
    print(json.dumps(payload, sort_keys=True, default=str), flush=True)


def load_env_file(path=DEFAULT_ENV_FILE):
    """Load KEY=VALUE pairs into os.environ without overriding real env vars."""
    loaded = []
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                if line.startswith("export "):
                    line = line[len("export "):].strip()
                key, value = line.split("=", 1)
                key, value = key.strip(), value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                    value = value[1:-1]
                if key and key not in os.environ:
                    os.environ[key] = value
                loaded.append(key)
    except FileNotFoundError:
        pass
    return loaded


def http_json(url, *, method="GET", headers=None, body=None, timeout=60):
    """Minimal JSON-over-HTTP helper using only the stdlib."""
    data = None if body is None else json.dumps(body).encode("utf-8")
    req_headers = {"Accept": "application/json"}
    req_headers.update(headers or {})
    if body is not None:
        req_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(url, data=data, method=method, headers=req_headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:2000]
        raise SyncError("HTTP %s for %s %s: %s" % (exc.code, method, url, detail)) from exc
    except urllib.error.URLError as exc:
        raise SyncError("network error for %s %s: %s" % (method, url, exc.reason)) from exc
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise SyncError("invalid JSON response from %s: %s" % (url, exc)) from exc


def qid(name):
    """Quote a Postgres identifier (double quotes, for Supabase SQL)."""
    return ".".join('"%s"' % str(part).replace('"', '""') for part in str(name).split("."))


def dqid(name):
    """Quote a Databricks SQL identifier (backticks)."""
    return ".".join("`%s`" % str(part).replace("`", "``") for part in str(name).split("."))


def sql_literal(value):
    """Render a Python value as a safe Spark SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def sql_typed_literal(value, dtype=None):
    """Render a value for a Databricks target column of a known type.

    The Management API serialises JSON object/array columns as text, while the
    Delta tables were created from JSONL with inferred STRUCT/ARRAY/MAP types.
    Cast those text values back with from_json so MERGE does not fail.
    """
    if dtype and str(dtype).upper().startswith(("STRUCT", "ARRAY", "MAP")) and value is not None:
        payload = value if isinstance(value, (dict, list)) else str(value)
        text = json.dumps(payload, default=str) if isinstance(payload, (dict, list)) else str(payload)
        return "from_json(%s, '%s')" % (sql_literal(text), str(dtype).replace("'", "''"))
    return sql_literal(value)


def parse_timestamp(value):
    """Best-effort ISO-8601 parse; returns None when not parseable."""
    try:
        return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def apply_lookback(watermark, lookback_seconds):
    """Re-read a small overlap window so late-arriving rows are not missed."""
    if watermark is None or not lookback_seconds:
        return watermark
    parsed = parse_timestamp(watermark)
    if parsed is None:
        return watermark
    return (parsed - dt.timedelta(seconds=int(lookback_seconds))).isoformat()


# --------------------------------------------------------------------------- #
# registry / state
# --------------------------------------------------------------------------- #
class TableSpec:
    __slots__ = ("ref", "source_table", "target_table", "watermark_column",
                 "primary_key", "lookback_seconds", "batch_size")

    def __init__(self, ref, source_table, target_table, watermark_column=None,
                 primary_key="id", lookback_seconds=DEFAULT_LOOKBACK_SECONDS,
                 batch_size=DEFAULT_BATCH_SIZE):
        self.ref = str(ref)
        self.source_table = str(source_table)
        self.target_table = str(target_table)
        self.watermark_column = watermark_column
        self.primary_key = primary_key
        self.lookback_seconds = int(lookback_seconds)
        self.batch_size = int(batch_size)

    @property
    def key(self):
        return "%s:%s" % (self.ref, self.source_table)

    def to_dict(self):
        return {
            "ref": self.ref,
            "source_table": self.source_table,
            "target_table": self.target_table,
            "watermark_column": self.watermark_column,
            "primary_key": self.primary_key,
        }


def load_registry(path=DEFAULT_REGISTRY):
    """Normalise a JSON registry into a list of TableSpec.

    Accepted shapes::

        {"tables": {ref: {"schema.table": "catalog.schema.table"}}, ...}
        {ref: {"schema.table": {"databricks": "...", "watermark_column": "..."}}}

    Per-table values may be a target-table string or an options dict.
    """
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SyncError("registry must be a JSON object: %s" % path)

    defaults = data.get("defaults") or {}
    if not isinstance(defaults, dict):
        defaults = {}
    refs = data.get("tables") if isinstance(data.get("tables"), dict) else data

    watermark_map = defaults.get("watermark_columns") or data.get("watermark_columns") or {}
    if not isinstance(watermark_map, dict):
        watermark_map = {}

    skip = {"tables", "defaults", "watermark_columns"}
    specs = []
    for ref, tables in refs.items():
        if ref in skip or not isinstance(tables, dict):
            continue
        for source_table, value in tables.items():
            options = dict(value) if isinstance(value, dict) else {"databricks": value}
            target = (options.get("databricks") or options.get("target")
                      or options.get("databricks_table"))
            if not target:
                raise SyncError("no Databricks target for %s:%s" % (ref, source_table))
            wm = (options.get("watermark_column")
                  or watermark_map.get("%s:%s" % (ref, source_table))
                  or watermark_map.get(source_table)
                  or defaults.get("watermark_column"))
            specs.append(TableSpec(
                ref=ref,
                source_table=source_table,
                target_table=target,
                watermark_column=wm,
                primary_key=options.get("primary_key", defaults.get("primary_key", "id")),
                lookback_seconds=options.get("lookback_seconds",
                                             defaults.get("lookback_seconds", DEFAULT_LOOKBACK_SECONDS)),
                batch_size=options.get("batch_size", defaults.get("batch_size", DEFAULT_BATCH_SIZE)),
            ))
    return specs


def load_state(path=DEFAULT_STATE):
    if not os.path.exists(path):
        return {"version": 1, "tables": {}}
    with open(path, "r", encoding="utf-8") as handle:
        state = json.load(handle)
    if not isinstance(state, dict):
        raise SyncError("state file must be a JSON object: %s" % path)
    state.setdefault("version", 1)
    if not isinstance(state.get("tables"), dict):
        state["tables"] = {}
    return state


def save_state(path, state):
    """Atomically persist state (temp file + os.replace)."""
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


# --------------------------------------------------------------------------- #
# API clients
# --------------------------------------------------------------------------- #
class SupabaseClient:
    """Read-only Management API SQL client."""

    def __init__(self, pat, timeout=120, http=http_json):
        if not pat:
            raise SyncError("SUPABASE_PAT is not set")
        self.pat = pat
        self.timeout = timeout
        self.http = http

    def query(self, ref, sql):
        url = "https://api.supabase.com/v1/projects/%s/database/query/read-only" % ref
        result = self.http(
            url,
            method="POST",
            headers={"Authorization": "Bearer " + self.pat,
                     "User-Agent": "supabase-databricks-sync"},
            body={"query": sql},
            timeout=self.timeout,
        )
        if isinstance(result, dict):
            # Some Management API responses wrap rows; accept common shapes.
            for key in ("rows", "data", "result"):
                if isinstance(result.get(key), list):
                    return result[key]
            raise SyncError("unexpected Supabase SQL response: %s" % sorted(result))
        if not isinstance(result, list):
            raise SyncError("Supabase SQL response is not a list of rows")
        return result

    def detect_watermark_column(self, ref, source_table, preferred=("updated_at", "created_at")):
        schema, _, table = str(source_table).partition(".")
        names = ", ".join("'%s'" % str(c).lower() for c in preferred)
        order = " ".join("WHEN lower(column_name) = '%s' THEN %d" % (str(c).lower(), i)
                          for i, c in enumerate(preferred))
        sql = (
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = '%s' AND table_name = '%s' "
            "AND lower(column_name) IN (%s) "
            "ORDER BY CASE %s ELSE 99 END LIMIT 1"
            % (schema.replace("'", "''"), table.replace("'", "''"), names, order)
        )
        rows = self.query(ref, sql)
        return rows[0].get("column_name") if rows else None

    def fetch_page(self, ref, source_table, watermark_column, watermark,
                   limit, offset, full_refresh=False):
        sql_parts = ["SELECT * FROM " + qid(source_table)]
        if watermark_column and watermark is not None and not full_refresh:
            sql_parts.append("WHERE %s > %s" % (qid(watermark_column), sql_literal(watermark)))
        order = []
        if watermark_column:
            order.append(qid(watermark_column))
        if order:
            sql_parts.append("ORDER BY " + ", ".join(c + " ASC" for c in order))
        sql_parts.append("LIMIT %d OFFSET %d" % (int(limit), int(offset)))
        return self.query(ref, " ".join(sql_parts))

    def fetch_all(self, ref, source_table, watermark_column, watermark,
                  batch_size=DEFAULT_BATCH_SIZE, max_pages=DEFAULT_MAX_PAGES,
                  full_refresh=False):
        """Page through all rows newer than the watermark."""
        rows, pages = [], 0
        while pages < max_pages:
            page = self.fetch_page(ref, source_table, watermark_column, watermark,
                                   batch_size, len(rows), full_refresh)
            if not page:
                break
            pages += 1
            rows.extend(page)
            if len(page) < batch_size:
                break
        return rows, pages


class DatabricksClient:
    """Databricks SQL Statement Execution API client."""

    def __init__(self, host, token, warehouse_id=DEFAULT_WAREHOUSE_ID,
                 poll_interval=DEFAULT_POLL_INTERVAL, max_poll=DEFAULT_MAX_POLL,
                 sleep_fn=time.sleep, timeout=60, http=http_json):
        if not host:
            raise SyncError("DATABRICKS_HOST is not set")
        if not token:
            raise SyncError("DATABRICKS_TOKEN is not set")
        self.host = str(host).rstrip("/")
        self.warehouse_id = warehouse_id
        self.poll_interval = poll_interval
        self.max_poll = max_poll
        self.sleep_fn = sleep_fn
        self.timeout = timeout
        self.http = http
        self.headers = {"Authorization": "Bearer " + token,
                        "User-Agent": "supabase-databricks-sync"}

    @property
    def statements_url(self):
        return self.host + "/api/2.0/sql/statements"

    def table_exists(self, full_name):
        """Return True when a Unity Catalog table already exists.

        A 404 means absent; unexpected API errors are treated as "exists" so a
        transient catalogue failure can never cause a destructive CTAS.
        """
        url = "%s/api/2.1/unity-catalog/tables/%s" % (
            self.host, urllib.parse.quote(str(full_name), safe="."))
        try:
            self.http(url, method="GET", headers=self.headers, timeout=self.timeout)
            return True
        except SyncError as exc:
            if str(exc).startswith("HTTP 404 "):
                return False
            return True
        except Exception:
            return True

    def column_types(self, full_name):
        """Return {column: data_type} for an existing Delta table.

        Retries transient statement failures: an empty type map makes complex
        columns fail with a STRING->STRUCT cast error, so it is worth retrying.
        """
        body = {"statement": "DESCRIBE TABLE " + dqid(full_name),
                "warehouse_id": self.warehouse_id,
                "wait_timeout": "30s", "on_wait_timeout": "CONTINUE"}
        last_error = None
        for attempt in range(3):
            try:
                resp = self.http(self.statements_url, method="POST", headers=self.headers,
                                 body=body, timeout=self.timeout)
                sid = resp.get("statement_id")
                for _ in range(self.max_poll + 1):
                    state = (resp.get("status") or {}).get("state")
                    if state in SUCCESS_STATES:
                        break
                    if state in FAILURE_STATES:
                        last_error = "describe failed: %s" % state
                        break
                    self.sleep_fn(self.poll_interval)
                    resp = self.http("%s/%s" % (self.statements_url, sid), method="GET",
                                     headers=self.headers, timeout=self.timeout)
                rows = (resp.get("result") or {}).get("data_array") or []
                types = {r[0]: r[1] for r in rows if len(r) >= 2 and r[0] and not str(r[0]).startswith("#")}
                if types:
                    return types
                last_error = "describe returned no columns"
            except Exception as exc:
                last_error = str(exc)
            if attempt < 2:
                self.sleep_fn(self.poll_interval)
        return {}

    def submit(self, statement):
        body = {
            "statement": statement,
            "warehouse_id": self.warehouse_id,
            "wait_timeout": "0s",
            "on_wait_timeout": "CONTINUE",
        }
        response = self.http(self.statements_url, method="POST", headers=self.headers,
                             body=body, timeout=self.timeout)
        statement_id = response.get("statement_id")
        status = response.get("status") or {}
        state = status.get("state")
        if not statement_id:
            if state in SUCCESS_STATES:
                return {"statement_id": None, "state": state}
            raise SyncError("Databricks statement submitted without an id: %s" % state)
        return self._wait(statement_id, state)

    def _wait(self, statement_id, state):
        for _ in range(self.max_poll + 1):
            if state in SUCCESS_STATES:
                return {"statement_id": statement_id, "state": state}
            if state in FAILURE_STATES:
                raise SyncError("Databricks statement %s failed in state %s"
                                % (statement_id, state))
            self.sleep_fn(self.poll_interval)
            response = self.http("%s/%s" % (self.statements_url, statement_id),
                                 method="GET", headers=self.headers, timeout=self.timeout)
            status = response.get("status") or {}
            state = status.get("state")
            if state in FAILURE_STATES:
                message = (status.get("error") or {}).get("message", "")
                raise SyncError("Databricks statement %s %s: %s" % (statement_id, state, message))
        raise SyncError("Databricks statement %s timed out after %d polls (last state %s)" % (
            statement_id, self.max_poll, state))


# --------------------------------------------------------------------------- #
# SQL construction
# --------------------------------------------------------------------------- #
def ordered_columns(rows, primary_key=None):
    columns = set()
    for row in rows:
        columns.update(row.keys())
    result = sorted(columns)
    if primary_key and primary_key in result:
        result.remove(primary_key)
        result.insert(0, primary_key)
    return result


def build_stage_sql(rows, columns, type_map=None):
    """Inline VALUES source, e.g. SELECT * FROM VALUES (...) AS t(`id`, ...)."""
    type_map = type_map or {}
    tuples = ["(" + ", ".join(sql_typed_literal(row.get(c), type_map.get(c)) for c in columns) + ")"
              for row in rows]
    return "SELECT * FROM VALUES\n  " + ",\n  ".join(tuples) + \
        "\n  AS %s(%s)" % (STAGE_ALIAS, ", ".join(dqid(c) for c in columns))


def build_create_sql(spec, stage_sql):
    """Create the Delta target from its first batch (never drops an existing one).

    Databricks SQL does not support ``CREATE TABLE IF NOT EXISTS ... AS SELECT``,
    so callers must check catalogue existence first and only emit this when the
    target is genuinely absent.
    """
    return "CREATE TABLE %s AS %s" % (dqid(spec.target_table), stage_sql)


def build_merge_sql(spec, columns, stage_sql):
    pk = spec.primary_key or "id"
    updates = [("%s = src.%s" % (dqid(c), dqid(c))) for c in columns if c != pk]
    insert_cols = ", ".join(dqid(c) for c in columns)
    insert_vals = ", ".join("src.%s" % dqid(c) for c in columns)
    sql = "MERGE INTO %s AS tgt USING (%s) AS src ON tgt.%s = src.%s" % (
        dqid(spec.target_table), stage_sql, dqid(pk), dqid(pk))
    if updates:
        sql += "\nWHEN MATCHED THEN UPDATE SET " + ", ".join(updates)
    sql += "\nWHEN NOT MATCHED THEN INSERT (%s) VALUES (%s)" % (insert_cols, insert_vals)
    return sql


def build_append_sql(spec, columns, stage_sql):
    """Dedup fallback when no primary key is available: INSERT only new rows."""
    conditions = " AND ".join("tgt.%s <=> src.%s" % (dqid(c), dqid(c)) for c in columns)
    return ("INSERT INTO %s (%s)\nSELECT DISTINCT src.* FROM (%s) AS src\n"
            "LEFT ANTI JOIN %s AS tgt ON %s" % (
                dqid(spec.target_table), ", ".join(dqid(c) for c in columns),
                stage_sql, dqid(spec.target_table), conditions))


# --------------------------------------------------------------------------- #
# orchestration
# --------------------------------------------------------------------------- #
def sync_table(spec, supabase, databricks, state, opts):
    """Sync one table. Raises SyncError on failure; caller must not persist state."""
    current = state["tables"].get(spec.key, {})
    stored_watermark = current.get("watermark")

    column = spec.watermark_column
    if not column:
        column = supabase.detect_watermark_column(spec.ref, spec.source_table)
    effective_watermark = apply_lookback(stored_watermark, spec.lookback_seconds)

    rows, pages = supabase.fetch_all(
        spec.ref, spec.source_table, column, effective_watermark,
        batch_size=opts["batch_size"], max_pages=opts["max_pages"],
        full_refresh=opts["full_refresh"],
    )
    result = {
        "table": spec.key,
        "target": spec.target_table,
        "watermark_column": column,
        "watermark_before": stored_watermark,
        "rows_fetched": len(rows),
        "pages": pages,
        "dry_run": bool(opts["dry_run"]),
    }
    if not rows:
        result["status"] = "no_rows"
        log("table_sync", **result)
        return result

    columns = ordered_columns(rows, spec.primary_key)
    type_map = {} if opts["dry_run"] else databricks.column_types(spec.target_table)
    stage_sql = build_stage_sql(rows, columns, type_map)
    statements = []
    if not databricks.table_exists(spec.target_table):
        statements.append(("create", build_create_sql(spec, stage_sql)))
    if spec.primary_key and spec.primary_key in columns:
        statements.append(("merge", build_merge_sql(spec, columns, stage_sql)))
    else:
        statements.append(("append", build_append_sql(spec, columns, stage_sql)))

    result["columns"] = columns
    result["statements"] = [{"kind": kind, "sql": sql} for kind, sql in statements] \
        if opts["dry_run"] else [kind for kind, _ in statements]

    if opts["dry_run"]:
        result["status"] = "dry_run"
        log("table_sync", **result)
        return result

    executed = []
    for kind, sql in statements:
        outcome = databricks.submit(sql)
        executed.append({"kind": kind, "state": outcome["state"],
                         "statement_id": outcome["statement_id"]})
    result["executed"] = executed

    # Advance only after every statement succeeded.
    if column:
        newest = rows[-1].get(column)
        if newest is not None:
            result["watermark_after"] = newest
            state["tables"][spec.key] = {
                "watermark": newest,
                "column": column,
                "last_sync": dt.datetime.now(dt.timezone.utc).isoformat(),
                "rows_synced": len(rows),
                "target_table": spec.target_table,
            }
    result["status"] = "ok"
    result["rows_synced"] = len(rows)
    log("table_sync", **{k: v for k, v in result.items() if k != "sql"})
    return result


def matches_filter(spec, filters):
    if not filters:
        return True
    candidates = {spec.key, spec.source_table, spec.target_table,
                  "%s:%s" % (spec.ref, spec.source_table)}
    return any(f in candidates for f in filters)


def run_once(specs, supabase, databricks, state, opts, state_path):
    results = []
    for spec in specs:
        if not matches_filter(spec, opts["tables"]):
            continue
        try:
            results.append(sync_table(spec, supabase, databricks, state, opts))
            if not opts["dry_run"]:
                save_state(state_path, state)
        except Exception as exc:  # per-table isolation; watermark unchanged
            failure = {"table": spec.key, "status": "failed",
                       "error": "%s: %s" % (type(exc).__name__, exc)}
            log("table_sync_error", **failure)
            results.append(failure)
    ok = sum(1 for r in results if r["status"] in ("ok", "no_rows", "dry_run"))
    summary = {
        "event": "sync_summary",
        "mode": "full_refresh" if opts["full_refresh"] else "incremental",
        "dry_run": bool(opts["dry_run"]),
        "once": bool(opts["once"]),
        "state_file": state_path,
        "tables_total": len(results),
        "tables_ok": ok,
        "tables_failed": len(results) - ok,
        "rows_synced": sum(r.get("rows_synced", 0) for r in results),
        "results": results,
    }
    summary["ok"] = summary["tables_failed"] == 0
    log("sync_summary", **{k: v for k, v in summary.items() if k != "event"})
    return summary


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--registry", default=DEFAULT_REGISTRY)
    parser.add_argument("--state", default=DEFAULT_STATE)
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE,
                        help="dotenv file to load credentials from (existing env wins)")
    parser.add_argument("--warehouse-id", default=DEFAULT_WAREHOUSE_ID)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES)
    parser.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL)
    parser.add_argument("--max-poll", type=int, default=DEFAULT_MAX_POLL)
    parser.add_argument("--table", action="append", default=[], dest="tables",
                        help="only sync this table (repeatable; source ref:table or target)")
    parser.add_argument("--dry-run", action="store_true", help="fetch and print SQL, write nothing")
    parser.add_argument("--once", action="store_true", help="run exactly one poll cycle (default)")
    parser.add_argument("--loop", action="store_true", help="poll forever")
    parser.add_argument("--interval", type=int, default=300,
                        help="seconds between cycles with --loop")
    parser.add_argument("--full-refresh", action="store_true",
                        help="ignore stored watermarks and re-sync all rows")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    load_env_file(args.env_file)
    try:
        specs = load_registry(args.registry)
        state = load_state(args.state)
        supabase = SupabaseClient(os.environ.get("SUPABASE_PAT", ""))
        databricks = DatabricksClient(
            os.environ.get("DATABRICKS_HOST", ""),
            os.environ.get("DATABRICKS_TOKEN", ""),
            warehouse_id=args.warehouse_id,
            poll_interval=args.poll_interval,
            max_poll=args.max_poll,
        )
    except (SyncError, OSError, ValueError) as exc:
        log("fatal", error=str(exc))
        return 2

    opts = {
        "batch_size": args.batch_size,
        "max_pages": args.max_pages,
        "full_refresh": args.full_refresh,
        "dry_run": args.dry_run,
        "once": args.once or not args.loop,
        "tables": args.tables,
    }
    exit_code = 0
    while True:
        summary = run_once(specs, supabase, databricks, state, opts, args.state)
        if not summary["ok"]:
            exit_code = 1
        if not args.loop:
            break
        try:
            time.sleep(args.interval)
        except KeyboardInterrupt:
            break
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
