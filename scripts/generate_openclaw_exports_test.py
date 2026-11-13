#!/usr/bin/env python3
"""Contract tests for the OpenClaw marketplace export generator.

These run offline against in-memory registries, so they pin the merge
behaviour that the live build depends on without touching the network or
production:

  * a slug cataloged in two registries is folded to ONE entry, not appended
  * the primary registry stays authoritative for identity fields
  * risk escalates to the more severe label and never downgrades
  * a slug repeated *inside* one registry is still a hard failure
  * the real repository registries merge cleanly and the two known
    cross-registry slugs appear exactly once

The escalation case is the one that matters most. The primary registry calls
openclaw/parallel-plugin high risk while the ingest registry calls it medium;
before this contract existed the generator appended both and the build failed,
and a naive "keep the first" fix would have published a high-risk plugin as
medium. A test that only ever passes is the bug this change exists to prevent.

Usage:
    python3 scripts/generate_openclaw_exports_test.py

Exit codes: 0 all checks passed, 1 a check failed.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GENERATOR_PATH = ROOT / "scripts" / "generate_openclaw_exports.py"


def load_generator():
    spec = importlib.util.spec_from_file_location("generate_openclaw_exports", GENERATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gen = load_generator()


def package(slug, risk, **overrides):
    entry = {
        "slug": slug,
        "kind": "plugin",
        "install_command": "openclaw plugins install " + slug,
        "source_ref": slug,
        "source_type": "clawhub_registry",
        "canonical_url": "https://clawhub.ai/openclaw/plugins/" + slug,
        "license": None,
        "risk": risk,
        "state": "review_required",
        "review_reason": "review required",
    }
    entry.update(overrides)
    return entry


def registry(registry_id, packages):
    return {
        "registry_id": registry_id,
        "policy": {"mode": "metadata_only"},
        "packages": packages,
    }


class MergePackagesTest(unittest.TestCase):
    def test_cross_registry_duplicate_is_folded_to_one_entry(self):
        primary = registry("primary", [package("open-oc-plugin-a", "medium")])
        ingest = registry("ingest", [package("open-oc-plugin-a", "medium")])
        merged, deduplicated = gen.merge_packages([primary, ingest])
        self.assertEqual(len(merged), 1)
        self.assertEqual(deduplicated, ["open-oc-plugin-a"])

    def test_primary_registry_stays_authoritative_for_identity_fields(self):
        primary = registry(
            "primary",
            [package("open-oc-plugin-a", "medium", install_command="openclaw plugins install a")],
        )
        ingest = registry(
            "ingest",
            [package("open-oc-plugin-a", "medium", install_command="SOMETHING ELSE")],
        )
        merged, _ = gen.merge_packages([primary, ingest])
        self.assertEqual(merged[0]["install_command"], "openclaw plugins install a")

    def test_risk_escalates_to_the_more_severe_label(self):
        # The real case: primary says high, ingest says medium.
        primary = registry("primary", [package("open-oc-plugin-a", "high")])
        ingest = registry("ingest", [package("open-oc-plugin-a", "medium")])
        merged, _ = gen.merge_packages([primary, ingest])
        self.assertEqual(merged[0]["risk"], "high")

    def test_risk_escalates_when_the_later_registry_is_more_severe(self):
        primary = registry("primary", [package("open-oc-plugin-a", "medium")])
        ingest = registry("ingest", [package("open-oc-plugin-a", "critical")])
        merged, _ = gen.merge_packages([primary, ingest])
        self.assertEqual(merged[0]["risk"], "critical")

    def test_risk_never_downgrades(self):
        primary = registry("primary", [package("open-oc-plugin-a", "critical")])
        ingest = registry("ingest", [package("open-oc-plugin-a", "low")])
        merged, _ = gen.merge_packages([primary, ingest])
        self.assertEqual(merged[0]["risk"], "critical")

    def test_distinct_slugs_are_all_kept(self):
        primary = registry("primary", [package("open-oc-plugin-a", "medium")])
        ingest = registry("ingest", [package("open-oc-plugin-b", "medium")])
        merged, deduplicated = gen.merge_packages([primary, ingest])
        self.assertEqual(len(merged), 2)
        self.assertEqual(deduplicated, [])

    def test_merge_does_not_mutate_the_source_registries(self):
        primary = registry("primary", [package("open-oc-plugin-a", "high")])
        ingest = registry("ingest", [package("open-oc-plugin-a", "medium")])
        gen.merge_packages([primary, ingest])
        self.assertEqual(primary["packages"][0]["risk"], "high")
        self.assertEqual(ingest["packages"][0]["risk"], "medium")

    def test_unknown_risk_label_does_not_beat_a_known_one(self):
        primary = registry("primary", [package("open-oc-plugin-a", "high")])
        ingest = registry("ingest", [package("open-oc-plugin-a", "unrated")])
        merged, _ = gen.merge_packages([primary, ingest])
        self.assertEqual(merged[0]["risk"], "high")


class ValidateTest(unittest.TestCase):
    def test_duplicate_within_one_registry_still_fails(self):
        bad = registry(
            "primary",
            [package("open-oc-plugin-a", "medium"), package("open-oc-plugin-a", "medium")],
        )
        errors = gen.validate([bad], bad["packages"])
        self.assertTrue(
            any("duplicate slug within primary" in e for e in errors),
            "a slug repeated inside one registry must still fail the build: %r" % errors,
        )

    def test_merged_cross_registry_duplicate_passes_validation(self):
        primary = registry("primary", [package("open-oc-plugin-a", "high")])
        ingest = registry("ingest", [package("open-oc-plugin-a", "medium")])
        merged, _ = gen.merge_packages([primary, ingest])
        self.assertEqual(gen.validate([primary, ingest], merged), [])

    def test_policy_mode_must_stay_metadata_only(self):
        bad = registry("primary", [package("open-oc-plugin-a", "medium")])
        bad["policy"] = {"mode": "auto_install"}
        errors = gen.validate([bad], bad["packages"])
        self.assertTrue(any("metadata_only" in e for e in errors), errors)


class RealRegistryTest(unittest.TestCase):
    """The repository's own registries must merge cleanly."""

    def test_repository_registries_merge_without_duplicates(self):
        registries = gen.load_registries()
        merged, deduplicated = gen.merge_packages(registries)
        self.assertEqual(gen.validate(registries, merged), [])
        slugs = [p["slug"] for p in merged]
        self.assertEqual(len(slugs), len(set(slugs)), "merged catalog has a duplicate slug")
        self.assertTrue(deduplicated, "the known cross-registry duplicates should be folded")

    def test_known_cross_registry_slugs_appear_once_with_escalated_risk(self):
        registries = gen.load_registries()
        merged, _ = gen.merge_packages(registries)
        by_slug = {p["slug"]: p for p in merged}
        for slug in (
            "open-oc-plugin-openclaw-parallel-plugin",
            "open-oc-plugin-openclaw-duckduckgo-plugin",
        ):
            self.assertIn(slug, by_slug)
        # parallel-plugin is high in the primary registry and medium in the
        # ingest registry; the export must carry the severe label.
        self.assertEqual(by_slug["open-oc-plugin-openclaw-parallel-plugin"]["risk"], "high")

    def test_every_merged_entry_keeps_review_required(self):
        registries = gen.load_registries()
        merged, _ = gen.merge_packages(registries)
        for p in merged:
            self.assertEqual(p.get("state"), "review_required", p.get("slug"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
