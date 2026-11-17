"""Offline tests for scripts/supabase_realtime_watcher.py.

A fake sync engine is injected through the watcher's ``engine_factory`` hook,
so no test ever touches live Supabase / Databricks APIs or real credentials.
"""
import importlib.util
import json
import os
import signal
import sys
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
MODULE_PATH = SCRIPTS / "supabase_realtime_watcher.py"

# Make sibling import (supabase_databricks_sync) resolvable when loaded by path.
sys.path.insert(0, str(SCRIPTS))
_spec = importlib.util.spec_from_file_location("supabase_realtime_watcher", MODULE_PATH)
watch = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(watch)


class FakeEngine:
    """Records cycles; can raise on selected cycles; no network I/O."""

    def __init__(self, fail_on=(), on_cycle=None, watermarks=None, summary_ok=True):
        self.calls = []
        self.fail_on = set(fail_on)
        self.on_cycle = on_cycle
        self._watermarks = watermarks or {}
        self.summary_ok = summary_ok

    def run_cycle(self):
        n = len(self.calls) + 1
        self.calls.append(n)
        if self.on_cycle:
            self.on_cycle(n)
        if n in self.fail_on:
            raise RuntimeError("boom on cycle %d" % n)
        return {
            "ok": self.summary_ok,
            "tables_total": 1,
            "tables_failed": 0,
            "results": [{"table": "huadtiuuoiriqrjpjxhr:public.projects",
                         "status": "ok", "watermark_after": "2026-11-17T00:00:00+00:00"}],
        }

    def watermarks(self):
        return dict(self._watermarks)


def noop_sleep(_seconds):
    return None


def config_for(tmp_path, **overrides):
    values = dict(
        registry=str(ROOT / "config" / "supabase" / "table_registry.json"),
        state_path=str(tmp_path / "watcher_state.json"),
        health_path=str(tmp_path / "watcher_health.json"),
        env_file=str(tmp_path / "missing.env"),
        tables=list(watch.DEFAULT_TABLES),
        interval=0,
        once=True,
        max_cycles=0,
        engine_opts={},
    )
    values.update(overrides)
    return watch.WatchConfig(**values)


def test_default_tables_are_the_critical_set():
    assert watch.DEFAULT_TABLES == [
        "public.projects",
        "public.workspaces",
        "public.open_system_sync_events",
    ]


def test_once_calls_sync_once_with_expected_tables(tmp_path):
    cfg = config_for(tmp_path, once=True)
    engine = FakeEngine()

    code = watch.run(cfg, engine_factory=lambda c: engine, sleep_fn=noop_sleep)

    assert engine.calls == [1], "expected exactly one cycle with --once"
    assert cfg.tables == watch.DEFAULT_TABLES
    health = json.loads(Path(cfg.health_path).read_text(encoding="utf-8"))
    assert health["cycles"] == 1
    assert health["failures"] == 0
    assert isinstance(health["last_success_ts"], str)
    assert code == 0


def test_failing_cycle_recorded_in_health_and_loop_continues(tmp_path):
    cfg = config_for(tmp_path, once=False, max_cycles=4)
    engine = FakeEngine(fail_on={2})

    watch.run(cfg, engine_factory=lambda c: engine, sleep_fn=noop_sleep)

    assert engine.calls == [1, 2, 3, 4], "loop must survive a bad cycle"
    health = json.loads(Path(cfg.health_path).read_text(encoding="utf-8"))
    assert health["cycles"] == 4
    assert health["failures"] == 1
    assert "boom on cycle 2" in health["last_error"]
    assert isinstance(health["last_success_ts"], str)


def test_sigterm_stops_loop(tmp_path):
    cfg = config_for(tmp_path, once=False, max_cycles=10)
    stop = threading.Event()

    def fire_sigterm(_n):
        os.kill(os.getpid(), signal.SIGTERM)

    engine = FakeEngine(on_cycle=fire_sigterm)
    original = {
        sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)
    }
    try:
        watch.run(cfg, engine_factory=lambda c: engine, sleep_fn=noop_sleep,
                  stop_event=stop, install_handlers=True)
    finally:
        for sig, handler in original.items():
            signal.signal(sig, handler)

    assert stop.is_set(), "SIGTERM must set the stop event"
    assert engine.calls == [1], "loop must stop promptly after SIGTERM"
    health = json.loads(Path(cfg.health_path).read_text(encoding="utf-8"))
    assert health["cycles"] == 1


def test_health_json_is_valid_with_all_required_keys(tmp_path):
    cfg = config_for(tmp_path, once=True)
    engine = FakeEngine(watermarks={"ref:public.projects": "2026-11-17T00:00:00+00:00"})

    watch.run(cfg, engine_factory=lambda c: engine, sleep_fn=noop_sleep)

    with Path(cfg.health_path).open(encoding="utf-8") as handle:
        health = json.load(handle)
    for key in ("last_success_ts", "cycles", "failures", "last_error", "watermarks"):
        assert key in health, "missing health key: %s" % key
    assert isinstance(health["cycles"], int)
    assert isinstance(health["failures"], int)
    assert isinstance(health["watermarks"], dict)
    assert health["watermarks"]["ref:public.projects"] == "2026-11-17T00:00:00+00:00"
    assert health["last_error"] is None


def test_redact_secrets_never_leaks_token_values():
    watch.os.environ["SUPABASE_PAT"] = "super-secret-pat-value"
    watch.os.environ["DATABRICKS_TOKEN"] = "super-secret-db-token"
    try:
        text = "failed with super-secret-pat-value and super-secret-db-token"
        redacted = watch.redact_secrets(text)
        assert "super-secret-pat-value" not in redacted
        assert "super-secret-db-token" not in redacted
        assert "***" in redacted
    finally:
        watch.os.environ.pop("SUPABASE_PAT", None)
        watch.os.environ.pop("DATABRICKS_TOKEN", None)


def test_uses_real_sync_engine_run_once():
    # The watcher delegates to the shared engine rather than reimplementing MERGE.
    assert callable(watch.sync.run_once)
    assert callable(watch.sync.load_registry)
    assert callable(watch.sync.load_state)


def test_default_engine_adapter_delegates_to_run_once(tmp_path):
    """The production adapter wires the shared engine; no SQL is reimplemented."""

    class StubSync:
        DEFAULT_BATCH_SIZE = 500
        DEFAULT_MAX_PAGES = 50
        DEFAULT_WAREHOUSE_ID = "wh"
        DEFAULT_POLL_INTERVAL = 2.0
        DEFAULT_MAX_POLL = 60

        def __init__(self):
            self.calls = []

        def load_env_file(self, path):
            return []

        def load_registry(self, path):
            return ["spec-a"]

        def load_state(self, path):
            return {"tables": {}}

        class SupabaseClient:
            def __init__(self, *a, **k):
                pass

        class DatabricksClient:
            def __init__(self, *a, **k):
                pass

        def run_once(self, specs, supabase, databricks, state, opts, state_path):
            self.calls.append((specs, opts, state_path))
            return {"ok": True, "results": []}

    stub = StubSync()
    cfg = config_for(tmp_path, once=True)
    adapter = watch.SyncEngineAdapter(cfg, sync_module=stub)
    summary = adapter.run_cycle()

    assert summary == {"ok": True, "results": []}
    assert len(stub.calls) == 1
    specs, opts, state_path = stub.calls[0]
    assert specs == ["spec-a"]
    assert opts["tables"] == watch.DEFAULT_TABLES
    assert state_path == cfg.state_path
