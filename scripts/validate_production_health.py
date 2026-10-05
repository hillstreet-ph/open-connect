#!/usr/bin/env python3
"""Validate the public production-health envelope without reading secret values."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REQUIRED_SUPABASE_BINDINGS = (
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
)


def validate_health(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return ["health response must be a JSON object"]

    failures: list[str] = []
    if payload.get("status") != "ok":
        failures.append("status must be ok")

    if not payload.get("model_upstream"):
        failures.append("model_upstream must be configured")

    upstreams = payload.get("model_upstreams")
    if not isinstance(upstreams, list) or not upstreams:
        failures.append("model_upstreams must contain at least one provider")

    kv = payload.get("kv")
    if not isinstance(kv, dict) or not kv.get("bound") or not kv.get("writable"):
        failures.append("OC_KV must be bound and writable")

    env = payload.get("env")
    if not isinstance(env, dict):
        failures.append("env binding metadata must be present")
    else:
        for name in REQUIRED_SUPABASE_BINDINGS:
            if not env.get(name):
                failures.append(f"{name} must be configured")

    return failures


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_production_health.py HEALTH_JSON", file=sys.stderr)
        return 2

    try:
        payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"invalid health response: {exc}", file=sys.stderr)
        return 1

    failures = validate_health(payload)
    if failures:
        for failure in failures:
            print(f"production health contract failed: {failure}", file=sys.stderr)
        return 1

    print("production health contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
