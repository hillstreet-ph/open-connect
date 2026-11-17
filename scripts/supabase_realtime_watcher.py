#!/usr/bin/env python3
"""Near-realtime Supabase -> Databricks watcher (incremental polling).

Supabase's data plane (REST / Storage / Realtime) returns HTTP 402 for both
projects, so WebSocket Realtime is impossible.  "Realtime" here means frequent
incremental polling through the *only* working read path: the Management API
read-only SQL endpoint.  This module is a thin supervision loop around the
existing engine in ``supabase_databricks_sync.py`` -- it reuses that module's
``run_once`` (and therefore its watermark + MERGE logic) and never duplicates
its SQL.  It writes a small health JSON file and logs one JSON line per cycle.

No credentials live in this file: the default engine loads them from env /
dotenv at runtime, and error strings are redacted before being logged or
persisted.  There is no DELETE / DROP / TRUNCATE anywhere.

For offline tests, pass ``engine_factory`` to :func:`run` to inject a fake
engine whose ``run_cycle()`` returns a sync summary; no live API is contacted.
"""
import argparse
import datetime as dt
import json
import os
import signal
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

try:  # works both as ``python scripts/...py`` and when loaded by importlib
    import supabase_databricks_sync as sync
except ImportError:  # pragma: no cover - depends on how the module is loaded
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import supabase_databricks_sync as sync

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TABLES = [
    "public.projects",
    "public.workspaces",
    "public.open_system_sync_events",
]
DEFAULT_REGISTRY = str(ROOT / "config" / "supabase" / "table_registry.json")
DEFAULT_STATE = str(ROOT / ".sync_state" / "watcher_state.json")
DEFAULT_HEALTH = str(ROOT / ".sync_state" / "watcher_health.json")
DEFAULT_ENV_FILE = "/data/home/workspace/.env"
DEFAULT_INTERVAL = 60


@dataclass
class WatchConfig:
    """All tunables for one watcher run."""

    registry: str = DEFAULT_REGISTRY
    state_path: str = DEFAULT_STATE
    health_path: str = DEFAULT_HEALTH
    env_file: str = DEFAULT_ENV_FILE
    tables: list = field(default_factory=lambda: list(DEFAULT_TABLES))
    interval: float = DEFAULT_INTERVAL
    once: bool = False
    max_cycles: int = 0  # 0 = unbounded
    engine_opts: dict = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# secret hygiene
# --------------------------------------------------------------------------- #
def redact_secrets(text, secrets=None):
    """Replace known credential values in ``text`` with ``***``."""
    text = str(text)
    if secrets is None:
        secrets = [
            os.environ.get("SUPABASE_PAT"),
            os.environ.get("DATABRICKS_TOKEN"),
        ]
    for secret in secrets:
        if secret and len(secret) >= 4:
            text = text.replace(secret, "***")
    return text


# --------------------------------------------------------------------------- #
# default engine adapter -- delegates to the shared sync engine
# --------------------------------------------------------------------------- #
class SyncEngineAdapter:
    """Adapter that runs the real ``sync.run_once`` for one configured cycle."""

    def __init__(self, config, sync_module=sync):
        self.config = config
        self.sync = sync_module
        self.sync.load_env_file(config.env_file)
        opts = config.engine_opts or {}
        self.opts = {
            "batch_size": opts.get("batch_size", sync.DEFAULT_BATCH_SIZE),
            "max_pages": opts.get("max_pages", sync.DEFAULT_MAX_PAGES),
            "full_refresh": bool(opts.get("full_refresh", False)),
            "dry_run": bool(opts.get("dry_run", False)),
            "once": True,  # each watcher cycle is a single sync pass
            "tables": list(config.tables),
        }
        self.specs = self.sync.load_registry(config.registry)
        self.state = self.sync.load_state(config.state_path)
        self.supabase = self.sync.SupabaseClient(os.environ.get("SUPABASE_PAT", ""))
        self.databricks = self.sync.DatabricksClient(
            os.environ.get("DATABRICKS_HOST", ""),
            os.environ.get("DATABRICKS_TOKEN", ""),
            warehouse_id=opts.get("warehouse_id", sync.DEFAULT_WAREHOUSE_ID),
            poll_interval=opts.get("poll_interval", sync.DEFAULT_POLL_INTERVAL),
            max_poll=opts.get("max_poll", sync.DEFAULT_MAX_POLL),
        )

    def run_cycle(self):
        return self.sync.run_once(
            self.specs, self.supabase, self.databricks, self.state,
            self.opts, self.config.state_path,
        )

    def watermarks(self):
        return {
            key: info.get("watermark")
            for key, info in self.state.get("tables", {}).items()
            if isinstance(info, dict) and "watermark" in info
        }


def default_engine_factory(config):
    """Production hook: build the real sync-engine adapter."""
    return SyncEngineAdapter(config)


# --------------------------------------------------------------------------- #
# health file
# --------------------------------------------------------------------------- #
def _fresh_health():
    return {
        "version": 1,
        "last_success_ts": None,
        "cycles": 0,
        "failures": 0,
        "last_error": None,
        "watermarks": {},
        "updated_ts": None,
    }


def load_health(path):
    """Read health JSON, tolerating a missing/corrupt file by starting fresh."""
    health = _fresh_health()
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, ValueError, OSError):
        return health
    if not isinstance(data, dict):
        return health
    for key, default in health.items():
        if key not in data:
            data[key] = default
    if not isinstance(data.get("watermarks"), dict):
        data["watermarks"] = {}
    return data


def write_health(path, health):
    """Persist health JSON atomically (temp file + os.replace)."""
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    tmp = "%s.%d.%s.tmp" % (path, os.getpid(), uuid.uuid4().hex)
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(health, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


# --------------------------------------------------------------------------- #
# loop control
# --------------------------------------------------------------------------- #
def install_signal_handlers(stop_event):
    """Make SIGTERM / SIGINT set ``stop_event`` for a graceful shutdown."""

    def handler(_signum, _frame):
        stop_event.set()

    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, handler)


def interruptible_sleep(interval, stop_event, sleep_fn, tick=0.5, deadline=None):
    """Sleep until ``deadline`` (else ``interval`` from now), waking on ``stop_event``."""
    if interval <= 0:
        return stop_event.is_set()
    if deadline is None:
        deadline = time.monotonic() + interval
    while not stop_event.is_set():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        sleep_fn(min(tick, remaining))
    return stop_event.is_set()


def _collect_watermarks(engine, summary):
    watermarks = {}
    getter = getattr(engine, "watermarks", None)
    if callable(getter):
        try:
            watermarks.update(getter() or {})
        except Exception:
            pass
    for result in (summary or {}).get("results", []) or []:
        if isinstance(result, dict) and result.get("table") and "watermark_after" in result:
            watermarks[result["table"]] = result.get("watermark_after")
    return watermarks


def _safe_int(value, default=0):
    """Coerce a health counter to int, tolerating corrupt values."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _summary_error(summary):
    """Build a redacted error string from a failed sync summary."""
    if not isinstance(summary, dict):
        return None
    parts = []
    failed = summary.get("tables_failed")
    if failed:
        parts.append("tables_failed=%s" % failed)
    for result in summary.get("results") or []:
        if not isinstance(result, dict):
            continue
        err = result.get("error")
        if err:
            parts.append("%s: %s" % (result.get("table", "?"), err))
        elif result.get("status") in ("failed", "error"):
            parts.append("%s: status=%s" % (
                result.get("table", "?"), result.get("status")))
    if not parts:
        parts.append("sync summary reported ok=False")
    return redact_secrets("; ".join(parts))


def run(config, *, engine_factory=default_engine_factory, sleep_fn=time.sleep,
        now_fn=None, stop_event=None, install_handlers=True):
    """Run the supervision loop.

    Every per-cycle exception is caught, recorded in health, and the loop keeps
    going.  Returns 0 if the final cycle succeeded, else 1.
    """
    if now_fn is None:
        now_fn = lambda: dt.datetime.now(dt.timezone.utc)
    if stop_event is None:
        stop_event = threading.Event()
    if install_handlers:
        try:
            install_signal_handlers(stop_event)
        except ValueError:
            # signal.signal is main-thread only; an embedded caller may supply
            # its own stop_event instead.
            pass

    engine = engine_factory(config)
    health = load_health(config.health_path)
    last_ok = False
    run_cycles = 0

    while not stop_event.is_set():
        cycle_start = time.monotonic()
        summary = None
        error = None
        try:
            summary = engine.run_cycle()
            last_ok = bool(summary) and bool(summary.get("ok", True))
        except Exception as exc:  # never die on one bad cycle
            last_ok = False
            error = redact_secrets("%s: %s" % (type(exc).__name__, exc))
        if not last_ok and error is None:
            error = _summary_error(summary) or "sync cycle reported failure"

        watermarks = _collect_watermarks(engine, summary)
        try:
            health["cycles"] = _safe_int(health.get("cycles")) + 1
            health["failures"] = _safe_int(health.get("failures"))
            if last_ok:
                health["last_success_ts"] = now_fn().isoformat()
                # Keep the last error visible even after recovery; operators
                # can use last_success_ts to judge current health.
            else:
                health["failures"] += 1
                health["last_error"] = error
            if watermarks:
                health.setdefault("watermarks", {}).update(watermarks)
            health["updated_ts"] = now_fn().isoformat()
        except Exception:
            # Corrupt health values must never abort the supervision loop.
            pass
        try:
            write_health(config.health_path, health)
        except Exception as exc:
            sync.log("watcher_health_write_error",
                     error=redact_secrets("%s: %s" % (type(exc).__name__, exc)))

        run_cycles += 1
        sync.log(
            "watcher_cycle",
            cycle=health.get("cycles", run_cycles),
            ok=last_ok,
            tables=list(config.tables),
            failures=health.get("failures", 0),
            watermarks=health.get("watermarks", {}),
            error=health.get("last_error"),
        )

        if config.once:
            break
        if config.max_cycles and run_cycles >= config.max_cycles:
            break
        if stop_event.is_set():
            break
        if interruptible_sleep(config.interval, stop_event, sleep_fn,
                               deadline=cycle_start + config.interval):
            break

    return 0 if last_ok else 1


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def build_parser():
    parser = argparse.ArgumentParser(
        description="Near-realtime Supabase -> Databricks watcher (polling)."
    )
    parser.add_argument("--registry", default=DEFAULT_REGISTRY)
    parser.add_argument("--state", default=DEFAULT_STATE,
                        help="shared sync watermark state file")
    parser.add_argument("--health", default=DEFAULT_HEALTH,
                        help="health JSON output file")
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE,
                        help="dotenv file to load credentials from (existing env wins)")
    parser.add_argument("--table", action="append", dest="tables", default=None,
                        help="critical table to watch (repeatable); overrides defaults")
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL,
                        help="seconds between cycles (default: 60)")
    parser.add_argument("--once", action="store_true",
                        help="run exactly one cycle (for CI / health checks)")
    parser.add_argument("--max-cycles", type=int, default=0,
                        help="stop after this many cycles (0 = unbounded)")
    parser.add_argument("--warehouse-id", default=sync.DEFAULT_WAREHOUSE_ID)
    parser.add_argument("--batch-size", type=int, default=sync.DEFAULT_BATCH_SIZE)
    parser.add_argument("--max-pages", type=int, default=sync.DEFAULT_MAX_PAGES)
    parser.add_argument("--poll-interval", type=float, default=sync.DEFAULT_POLL_INTERVAL)
    parser.add_argument("--max-poll", type=int, default=sync.DEFAULT_MAX_POLL)
    parser.add_argument("--dry-run", action="store_true",
                        help="fetch and print SQL, write nothing")
    parser.add_argument("--full-refresh", action="store_true",
                        help="ignore stored watermarks and re-sync all rows")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    config = WatchConfig(
        registry=args.registry,
        state_path=args.state,
        health_path=args.health,
        env_file=args.env_file,
        tables=args.tables if args.tables else list(DEFAULT_TABLES),
        interval=args.interval,
        once=args.once,
        max_cycles=args.max_cycles,
        engine_opts={
            "warehouse_id": args.warehouse_id,
            "batch_size": args.batch_size,
            "max_pages": args.max_pages,
            "poll_interval": args.poll_interval,
            "max_poll": args.max_poll,
            "dry_run": args.dry_run,
            "full_refresh": args.full_refresh,
        },
    )
    return run(config)


if __name__ == "__main__":
    raise SystemExit(main())
