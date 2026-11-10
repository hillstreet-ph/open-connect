#!/usr/bin/env python3
"""Generates portable, machine-readable exports for the OpenClaw marketplace
resources (config/openclaw-install-requests.registry.json).

The registry is consumable only inside this repository. Nothing about it can
be taken into ChatGPT, Claude, Mistral, Hermes or another agent runtime.
This script closes that gap by emitting, for all cataloged resources, a
download bundle under public/openclaw/exports/:

    registry.json    verbatim registry copy
    universal.json   neutral portable catalog (one record per resource)
    chatgpt.json     custom-GPT-ready instructions + catalog
    claude.json      Claude-ready skill catalog
    mistral.json     Mistral / Le Chat agents-ready catalog
    hermes.json      Hermes runtime agent config
    prompt.md        human-readable install pack
    index.json       manifest with download URLs

POLICY (must stay intact): exports are metadata-only. They carry the install
command and canonical URL as text so the operator can run them in their own
environment after license verification and a separate security review. No
export executes, schedules, or automates an install, and no credentials are
shipped. Every entry keeps its registry state (review_required).

Usage:
    python3 scripts/generate_openclaw_exports.py
    python3 scripts/generate_openclaw_exports.py --verify-build
"""

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = ROOT / "config" / "openclaw-install-requests.registry.json"
EXPORTS_DIR = ROOT / "public" / "openclaw" / "exports"
BUILD_DIR = ROOT / ".output" / "public" / "openclaw" / "exports"

SITE = "https://open-connect.site"
EXPORT_BASE = SITE + "/openclaw/exports/"

POLICY_NOTE = (
    "Metadata-only catalog. Install commands are provided as text for the "
    "operator to run in their own environment after license verification and a "
    "separate security review. Nothing here executes, downloads, or auto-installs "
    "a package, and no credentials are included."
)

INSTRUCTIONS = " ".join(
    [
        "You are a marketplace assistant for Open-Connect. The catalog below lists the cataloged resources.",
        "For any resource the user asks about, show its slug, kind, risk, state, and install_command.",
        "Never claim to install anything yourself. Always tell the user to run the install command in their own terminal, and to complete license verification and a security review first (state is review_required until then).",
        "If the user asks for the upstream project, share the canonical_url when present.",
        "Treat critical-risk entries (browser, desktop, billing, autonomy) as requiring isolation review before the user installs them.",
    ]
)


def portable_entry(p):
    return {
        "slug": p.get("slug"),
        "kind": p.get("kind"),
        "install_command": p.get("install_command"),
        "source_ref": p.get("source_ref"),
        "source_type": p.get("source_type"),
        "canonical_url": p.get("canonical_url"),
        "risk": p.get("risk"),
        "state": p.get("state"),
        "review_reason": p.get("review_reason"),
    }


def validate(registry, packages):
    errors = []
    slugs = set()
    for p in packages:
        slug = p.get("slug") or ""
        if not slug.startswith("open-oc-"):
            errors.append("bad slug: " + slug)
        if slug in slugs:
            errors.append("duplicate slug: " + slug)
        slugs.add(slug)
        if p.get("state") != "review_required":
            errors.append("unexpected state on %s: %s" % (slug, p.get("state")))
        url = p.get("canonical_url")
        if url and not url.startswith("https://"):
            errors.append("non-https canonical_url on " + slug)
        if p.get("kind") and not p.get("install_command"):
            errors.append("missing install_command on " + slug)
    policy = registry.get("policy") or {}
    if policy.get("mode") != "metadata_only":
        errors.append("policy.mode must remain metadata_only")
    return errors


def build_universal(registry, catalog, publishers):
    return {
        "schema": "open-connect.marketplace.resource/v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "registry_id": registry.get("registry_id"),
        "source": SITE + "/openclaw/exports/registry.json",
        "count": len(catalog),
        "publisher_requests": [
            {
                "source_ref": x.get("source_ref"),
                "canonical_url": x.get("canonical_url"),
                "state": x.get("state"),
                "review_reason": x.get("review_reason"),
            }
            for x in publishers
        ],
        "policy": POLICY_NOTE,
        "resources": catalog,
    }


def build_runtime(fmt, runtime_name, catalog):
    return {
        "format": fmt,
        "name": "Open-Connect Marketplace (%s)" % runtime_name,
        "description": (
            "Portable export of %d OpenClaw marketplace resources "
            "(plugins and skills) cataloged by Open-Connect." % len(catalog)
        ),
        "source": EXPORT_BASE + "index.json",
        "policy": POLICY_NOTE,
        "instructions": INSTRUCTIONS,
        "catalog": catalog,
    }


def build_prompt(catalog, publishers):
    lines = []
    lines.append("# Open-Connect Marketplace install pack")
    lines.append("")
    lines.append(
        "Portable export of %d OpenClaw marketplace resources "
        "(plugins and skills). Generated from the Open-Connect marketplace registry."
        % len(catalog)
    )
    lines.append("")
    lines.append("> Policy: metadata-only. Run each install command in your own")
    lines.append("> environment only after license verification and a separate")
    lines.append("> security review. Every entry is review_required until then.")
    lines.append("")
    for p in catalog:
        lines.append("## " + p["slug"])
        lines.append("")
        lines.append("- Kind: %s" % p["kind"])
        lines.append("- Risk: %s" % p["risk"])
        lines.append("- State: %s" % p["state"])
        lines.append("- Source: %s (%s)" % (p["source_ref"], p["source_type"]))
        if p["canonical_url"]:
            lines.append("- Upstream: %s" % p["canonical_url"])
        lines.append("- Install: `%s`" % p["install_command"])
        lines.append("- Review: %s" % p["review_reason"])
        lines.append("")
    if publishers:
        lines.append("## Publisher requests (no package selected yet)")
        lines.append("")
        for x in publishers:
            lines.append(
                "- %s (%s) - %s: %s"
                % (x.get("source_ref"), x.get("canonical_url"), x.get("state"), x.get("review_reason"))
            )
        lines.append("")
    return "\n".join(lines) + "\n"


def build_index(catalog):
    return {
        "schema": "open-connect.marketplace.export-index/v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(catalog),
        "formats": ["registry", "universal", "chatgpt", "claude", "mistral", "hermes", "prompt"],
        "base": EXPORT_BASE,
        "downloads": {
            "registry": EXPORT_BASE + "registry.json",
            "universal": EXPORT_BASE + "universal.json",
            "chatgpt": EXPORT_BASE + "chatgpt.json",
            "claude": EXPORT_BASE + "claude.json",
            "mistral": EXPORT_BASE + "mistral.json",
            "hermes": EXPORT_BASE + "hermes.json",
            "prompt": EXPORT_BASE + "prompt.md",
        },
        "policy": POLICY_NOTE,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-build", action="store_true")
    args = parser.parse_args()

    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    packages = registry.get("packages") or []
    publishers = registry.get("publisher_requests") or []
    catalog = [portable_entry(p) for p in packages]

    errors = validate(registry, packages)
    if errors:
        for e in errors:
            print("[openclaw-exports] " + e, file=sys.stderr)
        sys.exit(1)

    files = {
        "registry.json": json.dumps(registry, indent=2, ensure_ascii=False) + "\n",
        "universal.json": json.dumps(build_universal(registry, catalog, publishers), indent=2, ensure_ascii=False) + "\n",
        "chatgpt.json": json.dumps(build_runtime("chatgpt.custom-gpt/v1", "ChatGPT custom GPT", catalog), indent=2, ensure_ascii=False) + "\n",
        "claude.json": json.dumps(build_runtime("claude.skills/v1", "Claude", catalog), indent=2, ensure_ascii=False) + "\n",
        "mistral.json": json.dumps(build_runtime("mistral.le-chat-agents/v1", "Mistral / Le Chat agents", catalog), indent=2, ensure_ascii=False) + "\n",
        "hermes.json": json.dumps(build_runtime("hermes.agent/v1", "Hermes agent runtime", catalog), indent=2, ensure_ascii=False) + "\n",
        "prompt.md": build_prompt(catalog, publishers),
        "index.json": json.dumps(build_index(catalog), indent=2, ensure_ascii=False) + "\n",
    }

    if EXPORTS_DIR.exists():
        shutil.rmtree(EXPORTS_DIR)
    for rel, content in files.items():
        path = EXPORTS_DIR / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    if args.verify_build:
        bad = 0
        for rel in [
            "index.json",
            "universal.json",
            "chatgpt.json",
            "claude.json",
            "mistral.json",
            "hermes.json",
            "prompt.md",
            "registry.json",
        ]:
            path = BUILD_DIR / rel
            if not path.exists():
                print("[openclaw-exports] missing from build output: " + rel, file=sys.stderr)
                bad += 1
                continue
            if rel not in ("index.json", "universal.json"):
                # generated_at differs by design; compare the other docs verbatim.
                if path.read_text(encoding="utf-8") != files[rel]:
                    print("[openclaw-exports] stale in build output: " + rel, file=sys.stderr)
                    bad += 1
        if bad:
            sys.exit(1)

    print(
        "[openclaw-exports] %d resources x %d export files written to public/openclaw/exports"
        % (len(catalog), len(files))
    )


if __name__ == "__main__":
    main()
