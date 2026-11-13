#!/usr/bin/env python3
"""Assert the auto-fix job's scope matches what `bun run lint` actually covers.

WHY THIS EXISTS
---------------
The required "Build & validate" check runs `bun run lint`, which is `eslint .`
over the whole repository. The auto-fix job in .github/workflows/pr-automation.yml
must therefore fix the same scope. It once did not: it ran

    prettier --write "src/**/*.{ts,tsx,css}"

while lint covered the repo, so 125 fixable errors living outside src/ were
never touched, `git diff --cached` stayed empty, and the job reported
"No automatic fixes required" while CI failed. PR #980 widened the eslint call
but left the prettier call narrowed to src/ -- the same bug, half-fixed.

A comment in the workflow cannot prevent that from happening again. This script
can: it parses the workflow and package.json and fails the build when the two
scopes drift apart.

WHAT IT ASSERTS
---------------
1. `scripts.lint` in package.json is an eslint invocation, and its target is
   extracted (e.g. "." for `eslint .`).
2. The autofix job's eslint invocation targets the SAME path as `scripts.lint`.
3. The autofix job's prettier invocation is repo-root anchored -- "." or a
   `**/...` glob -- and NOT narrowed to a subdirectory such as `src/`.
4. The autofix job's post-fix verification step re-runs the same eslint target
   as `scripts.lint`, so "lint is clean" is proven against the real contract.

Exit code 0 when every assertion holds, 1 otherwise, with a message naming the
exact drift. No network, no dependencies beyond PyYAML.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
PACKAGE_JSON = REPO_ROOT / "package.json"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "pr-automation.yml"

# The job that applies fixes. Named so a rename is a loud failure, not a silent
# "no autofix job found, nothing to check".
AUTOFIX_JOB_ID = "autofix"

# A prettier target is repo-wide when it is the repo root or a recursive glob
# anchored at the root. Anything else (src/, scripts/, a brace list of
# subdirectories) is a narrowed scope and is rejected.
REPO_WIDE_TARGETS = {".", "./", "**/*", "**/**", "**"}


class ScopeError(Exception):
    """A scope contract violation, carrying a human-readable diagnosis."""


def _strip_quotes(token: str) -> str:
    return token.strip().strip("'\"")


def parse_eslint_target(command: str) -> str:
    """Return the path argument of an eslint invocation.

    Handles `eslint .`, `bunx eslint . --fix`, `npx eslint src --fix`,
    `eslint --fix .` and `eslint . --max-warnings 0`. Flags are skipped; the
    first non-flag token after `eslint` is the target.
    """
    tokens = command.split()
    try:
        idx = next(i for i, t in enumerate(tokens) if t.endswith("eslint"))
    except StopIteration:
        raise ScopeError(f"no eslint invocation found in: {command!r}") from None

    for token in tokens[idx + 1 :]:
        if token.startswith("-"):
            continue
        return _strip_quotes(token)

    # `eslint` with no path defaults to the current directory.
    return "."


def parse_prettier_targets(command: str) -> list[str]:
    """Return every path argument of a prettier invocation.

    `prettier --write "src/**/*.{ts,tsx,css}"` -> ['src/**/*.{ts,tsx,css}'].
    A bare `prettier --write .` -> ['.'].
    """
    tokens = command.split()
    try:
        idx = next(i for i, t in enumerate(tokens) if t.endswith("prettier"))
    except StopIteration:
        raise ScopeError(f"no prettier invocation found in: {command!r}") from None

    targets: list[str] = []
    for token in tokens[idx + 1 :]:
        if token.startswith("-"):
            continue
        targets.append(_strip_quotes(token))

    if not targets:
        raise ScopeError(
            f"prettier invoked with no path in: {command!r} -- an implicit "
            "target is not a scope this contract can verify"
        )
    return targets


def is_repo_wide(target: str) -> bool:
    """True when a prettier target covers the whole repository."""
    normalised = target.strip()
    if normalised in REPO_WIDE_TARGETS:
        return True
    # `**/*.{ts,tsx,css}` and friends: a recursive glob from the root.
    return normalised.startswith("**/")


def load_lint_script(package_json: Path = PACKAGE_JSON) -> str:
    data = json.loads(package_json.read_text(encoding="utf-8"))
    scripts = data.get("scripts") or {}
    lint = scripts.get("lint")
    if not lint:
        raise ScopeError(f"package.json has no `lint` script ({package_json})")
    return lint


def load_autofix_steps(workflow: Path = WORKFLOW) -> list[dict]:
    """Return the autofix job's steps, or raise if the job is missing."""
    doc = yaml.safe_load(workflow.read_text(encoding="utf-8"))
    jobs = (doc or {}).get("jobs") or {}
    job = jobs.get(AUTOFIX_JOB_ID)
    if job is None:
        raise ScopeError(
            f"workflow {workflow.name} has no `{AUTOFIX_JOB_ID}` job. "
            f"Found jobs: {sorted(jobs)}. If the job was renamed, update "
            f"AUTOFIX_JOB_ID in this script so the contract keeps being checked."
        )
    steps = job.get("steps") or []
    if not steps:
        raise ScopeError(f"job `{AUTOFIX_JOB_ID}` has no steps")
    return steps


def _step_commands(steps: list[dict]) -> list[tuple[str, str]]:
    """(step name, single command line) for every command in a `run` block.

    A `run` block is a shell script, so it is split into individual lines:
    parsing the whole block as one string would treat the next line's `bunx`
    and `eslint` as path arguments of the previous prettier call. Blank lines
    and shell comments are dropped.
    """
    out: list[tuple[str, str]] = []
    for step in steps:
        run = step.get("run")
        if not (isinstance(run, str) and run.strip()):
            continue
        name = step.get("name") or "<unnamed step>"
        for raw in run.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            out.append((name, line))
    return out


def check_scope(
    lint_script: str,
    steps: list[dict],
) -> list[str]:
    """Run every assertion. Returns a list of violations (empty == pass)."""
    violations: list[str] = []

    lint_target = parse_eslint_target(lint_script)
    commands = _step_commands(steps)

    # --- 1. the autofix job must actually invoke eslint -------------------
    eslint_cmds = [(n, c) for n, c in commands if re.search(r"\beslint\b", c)]
    if not eslint_cmds:
        violations.append(
            "the autofix job never invokes eslint, so it cannot fix what "
            f"`bun run lint` ({lint_script!r}) reports"
        )

    # --- 2. every eslint call in the job must target the lint target ------
    for name, cmd in eslint_cmds:
        try:
            target = parse_eslint_target(cmd)
        except ScopeError as exc:
            violations.append(f"step {name!r}: {exc}")
            continue
        if target != lint_target:
            violations.append(
                f"step {name!r} runs eslint on {target!r} but `bun run lint` "
                f"covers {lint_target!r}. The auto-fix scope must match the "
                f"required check's scope exactly."
            )

    # --- 3. prettier must be repo-wide, not narrowed to a subdirectory ----
    prettier_cmds = [(n, c) for n, c in commands if re.search(r"\bprettier\b", c)]
    if not prettier_cmds:
        violations.append(
            "the autofix job never invokes prettier; formatting fixes would "
            "not be applied at all"
        )
    for name, cmd in prettier_cmds:
        try:
            targets = parse_prettier_targets(cmd)
        except ScopeError as exc:
            violations.append(f"step {name!r}: {exc}")
            continue
        for target in targets:
            if not is_repo_wide(target):
                violations.append(
                    f"step {name!r} runs prettier on {target!r}, which is "
                    f"narrower than the repository. `bun run lint` covers "
                    f"{lint_target!r} repo-wide, so formatting fixes outside "
                    f"{target!r} would be silently skipped -- the exact bug "
                    f"PR #980 was meant to fix."
                )

    # --- 4. the post-fix verification must re-run the real lint target ----
    verify_cmds = [
        (n, c)
        for n, c in commands
        if re.search(r"\beslint\b", c) and "--fix" not in c
    ]
    if not verify_cmds:
        violations.append(
            "the autofix job has no post-fix eslint verification step, so it "
            "could report success while fixable errors remain"
        )
    for name, cmd in verify_cmds:
        try:
            target = parse_eslint_target(cmd)
        except ScopeError as exc:
            violations.append(f"step {name!r}: {exc}")
            continue
        if target != lint_target:
            violations.append(
                f"verification step {name!r} checks eslint on {target!r} but "
                f"the required check runs it on {lint_target!r}; the "
                f"verification would not prove the real contract is met."
            )

    return violations


def main() -> int:
    try:
        lint_script = load_lint_script()
        steps = load_autofix_steps()
    except ScopeError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    violations = check_scope(lint_script, steps)

    if violations:
        print("FAIL: auto-fix scope does not match `bun run lint`.", file=sys.stderr)
        print(f"  bun run lint -> {lint_script!r}", file=sys.stderr)
        for v in violations:
            print(f"  - {v}", file=sys.stderr)
        print(
            "\nThe auto-fix job must fix exactly what the required "
            '"Build & validate" check lints. Widen the auto-fix paths, or '
            "narrow `bun run lint` -- but they must agree.",
            file=sys.stderr,
        )
        return 1

    lint_target = parse_eslint_target(lint_script)
    print("PASS: auto-fix scope matches `bun run lint`.")
    print(f"  lint target:     {lint_target!r}")
    print(f"  autofix eslint:  {lint_target!r}")
    print("  autofix prettier: repo-wide")
    print("  post-fix verify: same target as lint")
    return 0


if __name__ == "__main__":
    sys.exit(main())
