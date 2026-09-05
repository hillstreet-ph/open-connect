#!/usr/bin/env python3
"""Local validator for the Open-Connect control-plane demo package."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore

ROOT = Path(__file__).resolve().parent
SECRET_RE = re.compile(r"vault://[a-z0-9-]+/(development|staging|production)/[a-z0-9-]+")


def load_yaml(name: str):
    text = (ROOT / name).read_text(encoding="utf-8")
    if yaml is None:
        return {"_raw": text}
    return yaml.safe_load(text)


def main() -> int:
    policy = load_yaml("control-plane.yaml")
    cases = load_yaml("test-cases.yaml")
    audit = (ROOT / "audit-events.jsonl").read_text(encoding="utf-8").strip().splitlines()

    errors: list[str] = []
    if isinstance(policy, dict) and policy.get("security", {}).get("default_decision") != "deny":
        errors.append("default_decision must be deny")
    if isinstance(policy, dict):
        for ref in (policy.get("credential_bindings") or {}).values():
            if not SECRET_RE.match(str(ref)):
                errors.append(f"bad credential ref: {ref}")

    for line in audit:
        evt = json.loads(line)
        if "correlation_id" not in evt:
            errors.append("audit event missing correlation_id")

    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 1
    print("OK — control-plane demo package validated locally")
    print(f"cases file present: {bool(cases)}")
    print(f"audit events: {len(audit)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
