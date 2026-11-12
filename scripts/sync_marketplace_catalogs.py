#!/usr/bin/env python3
"""Metadata-only marketplace catalog sync for open-connect.

Fetches the public Hermes Agent marketplace and ClawHub catalogs and merges any
new resources into config/hermes-clawhub-ingest.registry.json as review_required
metadata entries. This script never downloads packages, never executes install
commands, and never rotates credentials. Installation remains operator-run.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

REGISTRY_PATH = Path("config/hermes-clawhub-ingest.registry.json")
HERMES_MARKETPLACE_URL = "https://hermes-agent.nousresearch.com/marketplace"
CLAWHUB_PLUGIN_PAGES = [
    "https://clawhub.ai/plugins",
    "https://clawhub.ai/",
]
CLAWHUB_API_CANDIDATES = [
    "https://clawhub.ai/api/v1/skills",
    "https://clawhub.ai/api/v1/plugins",
]
USER_AGENT = (
    "open-connect-marketplace-sync/1.0 (metadata-only catalog sync; "
    "+https://open-connect.site)"
)
DEFAULT_RISK = "medium"
DEFAULT_REVIEW_REASON = (
    "Automated catalog ingestion; license verification and a security review "
    "are required before this entry can become approved."
)


def fetch(url: str, timeout: int = 30) -> str:
    request = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def try_fetch(urls: list[str]) -> tuple[str | None, str | None]:
    """Return (text, failure_note); text is None when every URL fails."""
    failures = []
    for url in urls:
        try:
            return fetch(url), None
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as exc:
            failures.append(f"{url}: {exc}")
    return None, "; ".join(failures)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")


def collect_hermes() -> tuple[dict[str, dict], str | None]:
    """Return {plugin_name: entry} from the Hermes marketplace page."""
    text, failure = try_fetch([HERMES_MARKETPLACE_URL])
    if text is None:
        return {}, f"hermes fetch failed: {failure}"
    found: dict[str, dict] = {}
    # Install commands rendered in the page (server-side render or embedded text).
    for name in re.findall(r"hermes plugins install ([A-Za-z0-9_.-]+)", text):
        found.setdefault(name, {"name": name, "publisher": None, "official": False})
    # Slug-like identifiers inside embedded JSON state of the client-rendered page.
    for name in set(re.findall(r'"slug"\s*:\s*"([A-Za-z0-9_.-]+)"', text)):
        found.setdefault(name, {"name": name, "publisher": None, "official": False})
    # Publisher attribution where the page exposes "by <publisher>" markers.
    for match in re.finditer(
        r"hermes plugins install ([A-Za-z0-9_.-]+).*?by ([A-Za-z0-9_. -]{2,40})",
        text,
        re.S,
    ):
        name, publisher = match.group(1), match.group(2).strip()
        if name in found and found[name]["publisher"] is None:
            found[name]["publisher"] = publisher
    return found, None


def collect_clawhub() -> tuple[dict[str, dict], str | None]:
    """Return {owner/name: entry} from ClawHub API and pages."""
    entries: dict[str, dict] = {}
    notes: list[str] = []

    api_text, api_failure = try_fetch(CLAWHUB_API_CANDIDATES)
    if api_text is not None:
        try:
            payload = json.loads(api_text)
            items = payload if isinstance(payload, list) else payload.get("skills") or payload.get("plugins") or payload.get("items") or []
            for item in items:
                if not isinstance(item, dict):
                    continue
                owner = item.get("owner") or item.get("publisher") or item.get("author")
                name = item.get("name") or item.get("slug")
                if owner and name:
                    entries[f"{owner}/{name}"] = {
                        "owner": str(owner), "name": str(name), "kind_hint": item.get("kind"),
                    }
        except (json.JSONDecodeError, AttributeError, TypeError) as exc:
            notes.append(f"clawhub api parse failed: {exc}")
    else:
        notes.append(f"clawhub api unreachable: {api_failure}")

    page_text, page_failure = try_fetch(CLAWHUB_PLUGIN_PAGES)
    if page_text is not None:
        # Detail links: /<owner>/plugins/<name> or /<owner>/skills/<name>
        for owner, kind, name in re.findall(
            r'href="/([A-Za-z0-9_-]+)/(plugins|skills)/([A-Za-z0-9_.-]+)"', page_text
        ):
            entries.setdefault(f"{owner}/{name}", {"owner": owner, "name": name, "kind_hint": kind})
        # Card titles rendered as "Name@owner".
        for title, owner in re.findall(r"([A-Za-z0-9_. /+-]{2,60})@([A-Za-z0-9_-]+)", page_text):
            name = slugify(title.splitlines()[-1].strip())
            if name and len(name) > 1 and name not in {"openclaw"}:
                entries.setdefault(f"{owner}/{name}", {"owner": owner, "name": name, "kind_hint": None})
    else:
        notes.append(f"clawhub pages unreachable: {page_failure}")

    note = "; ".join(notes) if notes else None
    return entries, note


def build_hermes_entry(item: dict) -> dict:
    name = item["name"]
    return {
        "slug": f"open-oc-plugin-hermes-{slugify(name)}",
        "kind": "plugin",
        "runtime": "hermes",
        "install_command": f"hermes plugins install {name}",
        "source_ref": name,
        "source_type": "hermes_marketplace",
        "publisher": item.get("publisher"),
        "official": bool(item.get("official")),
        "canonical_url": None,
        "license": None,
        "risk": DEFAULT_RISK,
        "state": "review_required",
        "review_reason": DEFAULT_REVIEW_REASON,
    }


def build_clawhub_entry(item: dict) -> dict:
    owner, name = item["owner"], item["name"]
    kind = item.get("kind_hint") if item.get("kind_hint") in ("plugin", "skill") else "plugin"
    return {
        "slug": f"open-oc-{kind}-{slugify(owner)}-{slugify(name)}",
        "kind": kind,
        "runtime": "openclaw",
        "install_command": f"openclaw {kind}s install {owner}/{name}",
        "source_ref": f"{owner}/{name}",
        "source_type": "clawhub_registry",
        "publisher": owner,
        "canonical_url": f"https://clawhub.ai/{owner}/{kind}s/{name}",
        "license": None,
        "risk": DEFAULT_RISK,
        "state": "review_required",
        "review_reason": DEFAULT_REVIEW_REASON,
    }


def regenerate_batches(registry: dict) -> None:
    packages = registry["packages"]
    hermes = [p for p in packages if p.get("runtime") == "hermes"]
    openclaw = [p for p in packages if p.get("runtime") == "openclaw"]
    registry["operator_install_batches"] = {
        "note": (
            "Install commands are operator-run text. Nothing in this repository "
            "executes them. Run only after an entry reaches state approved with "
            "a verified license."
        ),
        "hermes_official": [p["install_command"] for p in hermes if p.get("official")],
        "hermes_community_low_medium_risk": [
            p["install_command"] for p in hermes
            if not p.get("official") and p.get("risk") in ("low", "medium")
        ],
        "openclaw_low_medium_risk": [
            p["install_command"] for p in openclaw if p.get("risk") in ("low", "medium")
        ],
        "hold_for_deep_review": [
            p["install_command"] for p in packages if p.get("risk") in ("high", "critical")
        ],
    }


def main() -> int:
    if not REGISTRY_PATH.exists():
        print(f"registry not found: {REGISTRY_PATH}", file=sys.stderr)
        return 1
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))

    existing_refs = {p.get("source_ref") for p in registry["packages"]}
    existing_slugs = {p.get("slug") for p in registry["packages"]}

    hermes, hermes_note = collect_hermes()
    clawhub, clawhub_note = collect_clawhub()

    added = 0
    for name, item in sorted(hermes.items()):
        entry = build_hermes_entry(item)
        if entry["source_ref"] in existing_refs or entry["slug"] in existing_slugs:
            continue
        registry["packages"].append(entry)
        existing_refs.add(entry["source_ref"])
        existing_slugs.add(entry["slug"])
        added += 1
    for ref, item in sorted(clawhub.items()):
        entry = build_clawhub_entry(item)
        if entry["source_ref"] in existing_refs or entry["slug"] in existing_slugs:
            continue
        registry["packages"].append(entry)
        existing_refs.add(entry["source_ref"])
        existing_slugs.add(entry["slug"])
        added += 1

    registry["last_sync"] = {
        "synced_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mode": "metadata_only",
        "hermes_candidates_seen": len(hermes),
        "clawhub_candidates_seen": len(clawhub),
        "packages_added": added,
        "packages_total": len(registry["packages"]),
        "notes": [n for n in (hermes_note, clawhub_note) if n],
    }
    regenerate_batches(registry)

    REGISTRY_PATH.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    print(
        f"sync complete: hermes candidates={len(hermes)} "
        f"clawhub candidates={len(clawhub)} added={added} "
        f"total={len(registry['packages'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
