#!/usr/bin/env python3
"""Unit tests for the auto-fix scope contract.

These run offline against in-memory workflow/package.json fixtures, so the
contract is pinned without touching the real files. The point of the suite is
that the checker must FAIL on a narrowed scope -- a contract test that only
ever passes is the bug this whole change exists to prevent.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import validate_autofix_scope as module
from validate_autofix_scope import (
    ScopeError,
    check_scope,
    is_repo_wide,
    load_autofix_steps,
    load_lint_script,
    parse_eslint_target,
    parse_prettier_targets,
)


def steps_with(*commands: str) -> list[dict]:
    """Build an autofix job's steps from raw shell lines."""
    return [{"name": "Apply automatic fixes", "run": "\n".join(commands)}]


class ParseEslintTargetTest(unittest.TestCase):
    def test_bare_dot(self):
        self.assertEqual(parse_eslint_target("eslint ."), ".")

    def test_with_fix_flag_after_target(self):
        self.assertEqual(parse_eslint_target("bunx eslint . --fix"), ".")

    def test_with_fix_flag_before_target(self):
        self.assertEqual(parse_eslint_target("eslint --fix ."), ".")

    def test_narrowed_target(self):
        self.assertEqual(parse_eslint_target("eslint src --fix"), "src")

    def test_quoted_target(self):
        self.assertEqual(parse_eslint_target('eslint "src/**/*.ts"'), "src/**/*.ts")

    def test_no_target_defaults_to_cwd(self):
        self.assertEqual(parse_eslint_target("eslint --fix"), ".")

    def test_missing_eslint_raises(self):
        with self.assertRaises(ScopeError):
            parse_eslint_target("prettier --write .")


class ParsePrettierTargetsTest(unittest.TestCase):
    def test_single_quoted_glob(self):
        self.assertEqual(
            parse_prettier_targets('bunx prettier --write "src/**/*.{ts,tsx,css}"'),
            ["src/**/*.{ts,tsx,css}"],
        )

    def test_repo_root(self):
        self.assertEqual(parse_prettier_targets("prettier --write ."), ["."])

    def test_multiple_targets(self):
        self.assertEqual(
            parse_prettier_targets("prettier --write src scripts"),
            ["src", "scripts"],
        )

    def test_no_target_raises(self):
        with self.assertRaises(ScopeError):
            parse_prettier_targets("prettier --write")

    def test_missing_prettier_raises(self):
        with self.assertRaises(ScopeError):
            parse_prettier_targets("eslint . --fix")


class IsRepoWideTest(unittest.TestCase):
    def test_root_is_repo_wide(self):
        self.assertTrue(is_repo_wide("."))
        self.assertTrue(is_repo_wide("./"))

    def test_recursive_glob_is_repo_wide(self):
        self.assertTrue(is_repo_wide("**/*"))
        self.assertTrue(is_repo_wide("**/*.{ts,tsx,css,js,mjs,json,md}"))

    def test_subdirectory_is_not_repo_wide(self):
        self.assertFalse(is_repo_wide("src"))
        self.assertFalse(is_repo_wide("src/**/*.{ts,tsx,css}"))
        self.assertFalse(is_repo_wide("scripts/**/*.mjs"))


class CheckScopeTest(unittest.TestCase):
    """The contract itself: matching scopes pass, drift fails."""

    def test_matching_repo_wide_scope_passes(self):
        violations = check_scope(
            "eslint .",
            steps_with(
                'bunx prettier --write "**/*.{ts,tsx,css,js,mjs,json,md}"',
                "bunx eslint . --fix",
                "bunx eslint .",
            ),
        )
        self.assertEqual(violations, [])

    def test_narrowed_prettier_fails(self):
        """The original bug: prettier on src/ while lint covers the repo."""
        violations = check_scope(
            "eslint .",
            steps_with(
                'bunx prettier --write "src/**/*.{ts,tsx,css}"',
                "bunx eslint . --fix",
                "bunx eslint .",
            ),
        )
        self.assertEqual(len(violations), 1)
        self.assertIn("src/**/*.{ts,tsx,css}", violations[0])
        self.assertIn("narrower than the repository", violations[0])

    def test_narrowed_eslint_fails(self):
        violations = check_scope(
            "eslint .",
            steps_with(
                'bunx prettier --write "**/*.{ts,tsx,css}"',
                "bunx eslint src --fix",
                "bunx eslint .",
            ),
        )
        self.assertTrue(any("eslint on 'src'" in v for v in violations))

    def test_narrowed_verification_fails(self):
        """A verification step that checks a narrower scope proves nothing."""
        violations = check_scope(
            "eslint .",
            steps_with(
                'bunx prettier --write "**/*.{ts,tsx,css}"',
                "bunx eslint . --fix",
                "bunx eslint src",
            ),
        )
        self.assertTrue(any("verification step" in v for v in violations))

    def test_missing_verification_fails(self):
        violations = check_scope(
            "eslint .",
            steps_with(
                'bunx prettier --write "**/*.{ts,tsx,css}"',
                "bunx eslint . --fix",
            ),
        )
        self.assertTrue(any("no post-fix eslint verification" in v for v in violations))

    def test_missing_prettier_fails(self):
        violations = check_scope(
            "eslint .",
            steps_with("bunx eslint . --fix", "bunx eslint ."),
        )
        self.assertTrue(any("never invokes prettier" in v for v in violations))

    def test_missing_eslint_fails(self):
        violations = check_scope(
            "eslint .",
            steps_with('bunx prettier --write "**/*.{ts,tsx,css}"'),
        )
        self.assertTrue(any("never invokes eslint" in v for v in violations))

    def test_multiline_run_block_is_parsed_per_line(self):
        """A multi-line run block must not leak the next line as a target."""
        violations = check_scope(
            "eslint .",
            steps_with(
                'bunx prettier --write "**/*.{ts,tsx,css}"',
                "bunx eslint . --fix",
                "bunx eslint .",
            ),
        )
        self.assertEqual(violations, [])


class LoaderTest(unittest.TestCase):
    def test_missing_lint_script_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            pkg = Path(tmp) / "package.json"
            pkg.write_text(json.dumps({"scripts": {}}), encoding="utf-8")
            with self.assertRaises(ScopeError):
                load_lint_script(pkg)

    def test_missing_autofix_job_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf = Path(tmp) / "wf.yml"
            wf.write_text(
                "jobs:\n  something-else:\n    steps:\n      - run: echo hi\n",
                encoding="utf-8",
            )
            with self.assertRaises(ScopeError) as ctx:
                load_autofix_steps(wf)
            self.assertIn("autofix", str(ctx.exception))

    def test_real_repo_files_load(self):
        """The real package.json and workflow must parse."""
        self.assertIn("eslint", load_lint_script())
        self.assertTrue(load_autofix_steps())


if __name__ == "__main__":
    unittest.main()
