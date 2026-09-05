#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys
import yaml

ROOT = Path(__file__).resolve().parent
config = yaml.safe_load((ROOT / "control-plane.yaml").read_text())
tests = yaml.safe_load((ROOT / "test-cases.yaml").read_text())["cases"]

subject = config["subject"]
capabilities = {(item["name"], target): item for item in config["capabilities"] for target in item["targets"]}
explicit_denies = set(config["explicit_denies"])
approval_risks = set(config["approval_policy"]["required_risks"])

def decide(request):
    if request["risk"] in approval_risks:
        return "approval_required"
    if request["tenant_id"] != subject["tenant_id"]:
        return "deny"
    if request["actor_id"] != subject["actor_id"] or request["agent_id"] != subject["agent_id"]:
        return "deny"
    if request["environment"] != subject["environment"]:
        return "deny"
    if request["capability"] in explicit_denies:
        return "deny"
    item = capabilities.get((request["capability"], request["target"]))
    if item is None:
        return "deny"
    constraints = item.get("constraints", {})
    if "command" in request and request["command"] not in constraints.get("allowed_commands", []):
        return "deny"
    if "domain" in request and request["domain"] not in constraints.get("allowed_domains", []):
        return "deny"
    return "allow"

errors = []
if config["security"]["default_decision"] != "deny":
    errors.append("default decision must be deny")
if config["security"]["credentials"] != "reference-only":
    errors.append("credentials must be reference-only")
if not config["audit_contract"]["append_only"]:
    errors.append("audit must be append-only")
if not config["approval_policy"]["one_time_consumption"]:
    errors.append("approvals must be one-time")

pattern = re.compile(config["security"]["secret_reference_pattern"])
for name, reference in config["credential_bindings"].items():
    if not pattern.fullmatch(reference):
        errors.append(f"invalid opaque credential reference: {name}")

results = []
for case in tests:
    actual = decide(case["request"])
    passed = actual == case["expected"]
    results.append({"id": case["id"], "expected": case["expected"], "actual": actual, "passed": passed})
    if not passed:
        errors.append(f"{case['id']}: expected {case['expected']}, got {actual}")

print(json.dumps({"status": "PASS" if not errors else "FAIL", "tests": results, "errors": errors}, indent=2))
sys.exit(1 if errors else 0)
