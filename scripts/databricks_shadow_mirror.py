#!/usr/bin/env python3
"""Databricks shadow-database mirror engine.

Mirrors every primary Delta table listed in the authoritative project map into
a single shadow schema ``open_connect.shadow`` using::

    CREATE OR REPLACE TABLE open_connect.shadow.<flat_name>
    AS SELECT * FROM <primary_fqn>

Databricks supports ``CREATE OR REPLACE TABLE ... AS SELECT`` (but NOT
``CREATE TABLE IF NOT EXISTS ... AS SELECT``), so the mirror is idempotent.

Safety properties:
  * The ONLY DDL/DML this module emits is ``CREATE OR REPLACE TABLE`` against
    ``open_connect.shadow`` (plus ``CREATE SCHEMA IF NOT EXISTS`` for that
    schema). No DROP, DELETE, TRUNCATE, INSERT, MERGE or UPDATE is ever
    generated, and no source table is ever modified.
  * Every mirror target is validated to live under ``open_connect.shadow``.
  * Credentials are read from a dotenv file (KEY=VALUE lines) and never
    printed or embedded in source, logs, errors or the JSON summary.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

DEFAULT_REGISTRY = "/data/home/workspace/supabase-export/project_map.json"
DEFAULT_ENV_FILE = "/data/home/workspace/.env"
DEFAULT_WAREHOUSE_ID = "dae787fe16c17482"
SHADOW_SCHEMA = "open_connect.shadow"
CATALOG = "open_connect"

SUCCESS_STATES = {"SUCCEEDED"}
FAILURE_STATES = {"FAILED", "CANCELED", "CANCELLED", "CLOSED", "TIMEDOUT"}


def _statement_error_message(resp):
    """Extract an error message without assuming status.error is a dict."""
    error = (resp.get("status") or {}).get("error") or {}
    return error.get("message") or ""


class MirrorError(RuntimeError):
    """A clean, credential-free error."""


def log(event, **fields):
    payload = {"event": event}
    payload.update(fields)
    print(json.dumps(payload, sort_keys=True, default=str), flush=True)


# --------------------------------------------------------------------------- #
# credentials / identifiers
# --------------------------------------------------------------------------- #
def read_env_file(path=DEFAULT_ENV_FILE):
    """Parse KEY=VALUE (and ``export KEY=VALUE``) lines into a dict.

    Values are returned to the caller only; this function never prints them.
    """
    env = {}
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
                if key:
                    env[key] = value
    except FileNotFoundError:
        pass
    return env


def credentials_from_env(env, env_file=DEFAULT_ENV_FILE):
    host = env.get("DATABRICKS_HOST")
    token = env.get("DATABRICKS_TOKEN")
    missing = [k for k, value in (("DATABRICKS_HOST", host),
                                  ("DATABRICKS_TOKEN", token)) if not value]
    if missing:
        raise MirrorError("missing required env key(s): %s (from %s)"
                          % (", ".join(missing), env_file))
    return {"host": host, "token": token}


def load_credentials(env_file=DEFAULT_ENV_FILE):
    return credentials_from_env(read_env_file(env_file), env_file=env_file)


def dqid(name):
    """Backtick-quote a Databricks SQL identifier (``a.b`` -> ```a`.`b```)."""
    return ".".join("`%s`" % str(part).replace("`", "``")
                    for part in str(name).split("."))


def shadow_name_from_primary(primary_fqn):
    """Derive the flat shadow table name from a primary FQN.

    ``open_connect.open_platform.auth__users`` -> ``open_platform__auth__users``.
    """
    parts = str(primary_fqn).split(".")
    if len(parts) >= 3 and parts[0].lower() == CATALOG:
        parts = parts[1:]
    return "__".join(parts)


def validate_shadow_target(fqn):
    text = str(fqn)
    parts = text.split(".")
    if (len(parts) != 3 or parts[0].lower() != CATALOG
            or parts[1].lower() != "shadow" or not parts[2]
            or "`" in text):
        raise MirrorError("mirror target must be under %s: %s" % (SHADOW_SCHEMA, fqn))
    return fqn


# --------------------------------------------------------------------------- #
# registry / spec
# --------------------------------------------------------------------------- #
class MirrorSpec:
    __slots__ = ("name", "primary_fqn", "row_count")

    def __init__(self, name, primary_fqn, row_count=None):
        self.name = str(name)
        self.primary_fqn = str(primary_fqn)
        self.row_count = row_count

    @property
    def key(self):
        return self.name

    @property
    def shadow_fqn(self):
        return validate_shadow_target("%s.%s" % (SHADOW_SCHEMA, self.name))


def load_registry(path=DEFAULT_REGISTRY):
    """Normalise a registry into a de-duplicated list of MirrorSpec.

    Accepts the authoritative project-map shape (a JSON list of objects with
    ``databricks_table`` / ``databricks_flat_name`` / ``row_count``) and the
    sync-registry shape (``{"tables": {ref: {source: {"databricks": fqn}}}}``).
    """
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    specs = []
    seen = set()
    if isinstance(data, list):
        for entry in data:
            if not isinstance(entry, dict):
                continue
            primary = entry.get("databricks_table")
            if not primary:
                continue
            name = entry.get("databricks_flat_name") or shadow_name_from_primary(primary)
            specs.append(MirrorSpec(name, primary, entry.get("row_count")))
    elif isinstance(data, dict) and isinstance(data.get("tables"), dict):
        for _ref, tables in data["tables"].items():
            if not isinstance(tables, dict):
                continue
            for _source, options in tables.items():
                primary = options.get("databricks") if isinstance(options, dict) else options
                if not primary:
                    continue
                specs.append(MirrorSpec(shadow_name_from_primary(primary), primary))
    else:
        raise MirrorError("unrecognised registry format: %s" % path)

    unique = []
    for spec in specs:
        if spec.shadow_fqn in seen:
            continue
        seen.add(spec.shadow_fqn)
        unique.append(spec)
    return unique


# --------------------------------------------------------------------------- #
# SQL
# --------------------------------------------------------------------------- #
def build_mirror_sql(spec):
    target = validate_shadow_target(spec.shadow_fqn)
    return "CREATE OR REPLACE TABLE %s AS SELECT * FROM %s" % (
        dqid(target), dqid(spec.primary_fqn))


def count_sql(fqn):
    return "SELECT COUNT(*) FROM " + dqid(fqn)


# --------------------------------------------------------------------------- #
# Databricks SQL Statement Execution API client
# --------------------------------------------------------------------------- #
class DatabricksClient:
    def __init__(self, host, token, warehouse_id=DEFAULT_WAREHOUSE_ID,
                 poll_interval=0.5, max_poll=120, wait_timeout="30s",
                 sleep_fn=time.sleep, timeout=60, http=None):
        if not host:
            raise MirrorError("DATABRICKS_HOST is not set")
        if not token:
            raise MirrorError("DATABRICKS_TOKEN is not set")
        self.host = str(host).rstrip("/")
        self.warehouse_id = warehouse_id
        self.poll_interval = poll_interval
        self.max_poll = max_poll
        self.wait_timeout = wait_timeout
        self.sleep_fn = sleep_fn
        self.timeout = timeout
        self.http = http or self._default_http
        self.headers = {"Authorization": "Bearer " + token,
                        "User-Agent": "databricks-shadow-mirror"}

    @staticmethod
    def _default_http(url, *, method="GET", headers=None, body=None, timeout=60):
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
            raise MirrorError("HTTP %s for %s %s: %s" % (exc.code, method, url, detail)) from exc
        except urllib.error.URLError as exc:
            raise MirrorError("network error for %s %s: %s" % (method, url, exc.reason)) from exc
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except (ValueError, TypeError) as exc:
            raise MirrorError("invalid JSON response from %s: %s" % (url, exc)) from exc

    @property
    def statements_url(self):
        return self.host + "/api/2.0/sql/statements"

    def execute(self, statement):
        body = {"statement": statement, "warehouse_id": self.warehouse_id,
                "wait_timeout": self.wait_timeout, "on_wait_timeout": "CONTINUE"}
        resp = self.http(self.statements_url, method="POST", headers=self.headers,
                         body=body, timeout=self.timeout)
        statement_id = resp.get("statement_id")
        state = (resp.get("status") or {}).get("state")
        if not statement_id:
            if state in SUCCESS_STATES:
                return resp
            raise MirrorError("statement submitted without an id: %s" % state)
        for _ in range(self.max_poll + 1):
            if state in SUCCESS_STATES:
                return resp
            if state in FAILURE_STATES:
                raise MirrorError("statement %s %s: %s"
                                  % (statement_id, state, _statement_error_message(resp)))
            self.sleep_fn(self.poll_interval)
            resp = self.http("%s/%s" % (self.statements_url, statement_id),
                             method="GET", headers=self.headers, timeout=self.timeout)
            state = (resp.get("status") or {}).get("state")
        # The last GET's state must be evaluated too: a statement that succeeds
        # (or fails) on the final poll must not be reported as a timeout.
        if state in SUCCESS_STATES:
            return resp
        if state in FAILURE_STATES:
            raise MirrorError("statement %s %s: %s"
                              % (statement_id, state, _statement_error_message(resp)))
        raise MirrorError("statement %s timed out after %d polls (last state %s)"
                          % (statement_id, self.max_poll, state))

    def scalar_count(self, fqn):
        resp = self.execute(count_sql(fqn))
        rows = (resp.get("result") or {}).get("data_array") or []
        if not rows or not rows[0]:
            raise MirrorError("COUNT query returned no rows for %s" % fqn)
        return int(rows[0][0])

    def ensure_shadow_schema(self):
        return self.execute("CREATE SCHEMA IF NOT EXISTS " + dqid(SHADOW_SCHEMA))


# --------------------------------------------------------------------------- #
# orchestration
# --------------------------------------------------------------------------- #
def matches_filter(spec, filters):
    if not filters:
        return True
    candidates = {spec.name, spec.primary_fqn, spec.shadow_fqn}
    return any(f in candidates for f in filters)


def run(specs, client, mode="once", tables=None):
    """Run one of ``dry-run``, ``once`` (mirror + verify) or ``verify``."""
    selected = [s for s in specs if matches_filter(s, tables)]
    summary = {
        "mode": mode,
        "tables_total": len(selected),
        "writes_attempted": 0,
        "mirrored": 0,
        "mirror_errors": 0,
        "verified": 0,
        "mismatches": 0,
        "verify_exceptions": 0,
        "results": [],
    }
    if mode == "dry-run":
        summary["planned"] = [
            {"table": s.name, "primary": s.primary_fqn, "shadow": s.shadow_fqn,
             "sql": build_mirror_sql(s)}
            for s in selected
        ]
        summary["ok"] = True
        return summary

    if mode == "once":
        for spec in selected:
            summary["writes_attempted"] += 1
            try:
                client.execute(build_mirror_sql(spec))
                summary["mirrored"] += 1
            except Exception as exc:
                summary["mirror_errors"] += 1
                summary["results"].append(
                    {"table": spec.name, "status": "mirror_error", "error": str(exc)})

    for spec in selected:
        try:
            primary_rows = client.scalar_count(spec.primary_fqn)
            shadow_rows = client.scalar_count(spec.shadow_fqn)
            match = primary_rows == shadow_rows
            summary["verified"] += 1
            if not match:
                summary["mismatches"] += 1
            summary["results"].append({
                "table": spec.name,
                "primary_rows": primary_rows,
                "shadow_rows": shadow_rows,
                "match": match,
            })
        except Exception as exc:
            summary["verify_exceptions"] += 1
            summary["results"].append(
                {"table": spec.name, "status": "verify_exception", "error": str(exc)})

    summary["ok"] = (summary["mirror_errors"] == 0 and summary["mismatches"] == 0
                     and summary["verify_exceptions"] == 0)
    return summary


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def build_parser():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--registry", default=DEFAULT_REGISTRY,
                        help="authoritative project map (or sync registry) JSON")
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE,
                        help="dotenv file to read DATABRICKS_HOST / DATABRICKS_TOKEN from")
    parser.add_argument("--warehouse-id", default=DEFAULT_WAREHOUSE_ID)
    parser.add_argument("--table", action="append", default=[], dest="tables",
                        help="only mirror/verify this flat table name (repeatable)")
    parser.add_argument("--once", action="store_true",
                        help="refresh all shadow tables and verify row counts (default)")
    parser.add_argument("--verify", action="store_true",
                        help="verify row counts only; write nothing")
    parser.add_argument("--dry-run", action="store_true",
                        help="emit the planned SQL only; write nothing")
    parser.add_argument("--poll-interval", type=float, default=0.5)
    parser.add_argument("--max-poll", type=int, default=120)
    parser.add_argument("--wait-timeout", default="30s")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    mode = "dry-run" if args.dry_run else ("verify" if args.verify else "once")
    try:
        specs = load_registry(args.registry)
    except (OSError, ValueError, MirrorError) as exc:
        log("fatal", error=str(exc))
        return 2

    client = None
    if mode != "dry-run":
        try:
            creds = load_credentials(args.env_file)
            client = DatabricksClient(
                creds["host"], creds["token"], warehouse_id=args.warehouse_id,
                poll_interval=args.poll_interval, max_poll=args.max_poll,
                wait_timeout=args.wait_timeout)
            if mode == "once":
                client.ensure_shadow_schema()
        except (OSError, ValueError, MirrorError) as exc:
            log("fatal", error=str(exc))
            return 2

    summary = run(specs, client, mode=mode, tables=args.tables)
    print(json.dumps(summary, sort_keys=True), flush=True)
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
