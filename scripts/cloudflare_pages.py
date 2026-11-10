#!/usr/bin/env python3
"""Optional Cloudflare Pages build-state lookup for the production deploy gate.

The gate in `verify_production_deploy.py` proves that production serves the
commit on `main` HEAD by comparing `/build-info.json` against main. When those
two disagree it can say *that* the deploy is stale, but not *why*: it has no
view of Cloudflare's build queue, so it cannot tell a build that never started
from one that started and was superseded.

This module adds that view, optionally. With a Pages-scoped API token it asks
Cloudflare for the project's recent deployments and names the build that
superseded production: its commit, its build status, when it was created and
its deployment URL. Without a token it reports that build-level detail is
unavailable and the gate behaves exactly as it did before.

Design constraints, all deliberate:

* **Optional.** No token, no network call, no behaviour change. A contributor
  without Cloudflare access must never see this gate fail because of it.
* **Never fatal.** Every failure mode here (missing account id, HTTP error,
  malformed payload, timeout) degrades to "detail unavailable" with a reason.
  Build detail is diagnostic enrichment; it must not be able to turn a passing
  gate red, and it must not mask the real commit-mismatch verdict.
* **Never leaks the token.** The token is only ever placed in an Authorization
  header. Every string this module returns is passed through `redact()` first,
  because those strings end up in job summaries and issue bodies.

Environment:
    CLOUDFLARE_API_TOKEN      Pages:Read API token (optional)
    CLOUDFLARE_ACCOUNT_ID     account that owns the Pages project (needed with token)
    CLOUDFLARE_PAGES_PROJECT  project name (default: open-connect-app)
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

API_BASE = "https://api.cloudflare.com/client/v4"
DEFAULT_PROJECT = "open-connect-app"

TOKEN_ENV = "CLOUDFLARE_API_TOKEN"
ACCOUNT_ENV = "CLOUDFLARE_ACCOUNT_ID"
PROJECT_ENV = "CLOUDFLARE_PAGES_PROJECT"

# Enough to cover a burst of merges without paging. The API returns newest first.
MAX_DEPLOYMENTS = 25

# Cloudflare's stage statuses, in the words an operator would use.
STATUS_WORDS = {
    "success": "succeeded",
    "failure": "failed",
    "failed": "failed",
    "active": "still building",
    "building": "still building",
    "canceled": "cancelled",
    "cancelled": "cancelled",
    "idle": "queued",
    "queued": "queued",
    "skipped": "skipped",
}

# How a status should be *read*, which is not the same as how it is spelled.
# A failed build means the deploy broke; a succeeded build that is not live
# means it lost a race. Those are different faults and the gate must not blur
# them into one generic "mismatch".
OUTCOME_FAILED = "failed"
OUTCOME_CANCELLED = "cancelled"
OUTCOME_IN_PROGRESS = "in_progress"
OUTCOME_SUCCEEDED = "succeeded"
OUTCOME_UNKNOWN = "unknown"

OUTCOME_BY_STATUS = {
    "succeeded": OUTCOME_SUCCEEDED,
    "failed": OUTCOME_FAILED,
    "cancelled": OUTCOME_CANCELLED,
    "skipped": OUTCOME_CANCELLED,
    "still building": OUTCOME_IN_PROGRESS,
    "queued": OUTCOME_IN_PROGRESS,
}


def redact(text: str, secret: str | None) -> str:
    """Strip a secret from a string before it can reach a log or an issue body."""
    if not secret:
        return text
    return text.replace(secret, "[redacted]")


def _api_get(path: str, token: str, timeout: int = 20) -> tuple[int, dict | None, str]:
    """GET a Cloudflare API path.

    Returns (status, payload, error). `status` is 0 for a transport error, and
    `error` is a short human phrase that never contains the token.
    """
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "open-connect-deploy-verify/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read()), ""
    except urllib.error.HTTPError as exc:
        # Cloudflare puts a machine-readable reason in the body; surface the
        # first error message if there is one, else just the status.
        detail = ""
        try:
            body = json.loads(exc.read() or b"{}")
            errors = body.get("errors") or []
            if errors and isinstance(errors[0], dict):
                detail = str(errors[0].get("message") or "")
        except Exception:  # noqa: BLE001 - a bad error body is not worth failing on
            detail = ""
        return exc.code, None, f"HTTP {exc.code}" + (f" ({detail})" if detail else "")
    except Exception as exc:  # noqa: BLE001 - timeouts, DNS, TLS all land here
        return 0, None, f"transport error ({type(exc).__name__})"


class BuildDetail:
    """What Cloudflare knows about the build that should be live.

    `available` is False whenever the lookup could not be made — no token, no
    account id, an API error. In that case `reason` explains why, and the gate
    prints it verbatim instead of guessing.
    """

    def __init__(
        self,
        available: bool,
        reason: str = "",
        superseding: dict | None = None,
        production: dict | None = None,
        recent: list[dict] | None = None,
        related: list[dict] | None = None,
    ) -> None:
        self.available = available
        self.reason = reason
        self.superseding = superseding
        self.production = production
        self.recent = recent or []
        # Other deployments for main HEAD, newest first, excluding `superseding`.
        # Used to say "and an earlier attempt also failed" without letting an
        # older attempt stand in for the current one.
        self.related = related or []

    def _fields(self, d: dict) -> str:
        """The four fields an operator needs, in one clause."""
        return (
            f"commit {d['commit'][:10]}, status {d['status']}, "
            f"created {d['created']}, deployment {d['url']}"
        )

    def sentence(self) -> str:
        """One sentence for the gate's failure detail.

        The wording is chosen by *outcome*, not by the status string, because
        the operator's next action depends on which fault this is:

        * **failed** \u2014 the deploy broke. Nothing is racing; the build itself
          did not produce a deployable artifact. This is the case that must
          never be reported as a generic mismatch or as a success.
        * **cancelled / skipped** \u2014 the build was stopped before it finished.
        * **still building / queued** \u2014 it has not finished yet; wait.
        * **succeeded** \u2014 it built and is not live, so it lost a race.
        * **anything else** \u2014 an unrecognised status. Say so, and do not
          claim success on a status we do not understand.
        """
        if not self.available:
            return f"Build-level detail unavailable: {self.reason}"

        if self.superseding:
            s = self.superseding
            outcome = s.get("outcome", OUTCOME_UNKNOWN)
            fields = self._fields(s)

            if outcome == OUTCOME_FAILED:
                msg = (
                    f"The build for main HEAD FAILED: {fields}. "
                    "The deploy broke \u2014 this is not a build that lost a race "
                    "with a newer commit, it is a build that did not produce a "
                    "deployable artifact. Fix the build before re-running the gate."
                )
            elif outcome == OUTCOME_CANCELLED:
                msg = (
                    f"The build for main HEAD was {s['status']} before it "
                    f"finished: {fields}. The deploy never completed \u2014 this is "
                    "not a build that lost a race with a newer commit."
                )
            elif outcome == OUTCOME_IN_PROGRESS:
                msg = (
                    f"The build for main HEAD is {s['status']}: {fields}. "
                    "It has not finished yet; re-run the gate once it completes."
                )
            elif outcome == OUTCOME_SUCCEEDED:
                msg = (
                    f"Superseding build: {fields}. It succeeded but is not live, "
                    "so production is serving an older commit."
                )
            else:
                msg = (
                    f"The build for main HEAD has an unrecognised status "
                    f"{s['status']!r}: {fields}. The gate cannot tell whether "
                    "this build produced a deployable artifact, so it does not "
                    "claim that it did."
                )

            # An earlier attempt for the same commit is worth naming, but only
            # as context \u2014 it must never replace the newest build above.
            earlier = [d for d in self.related if d.get("outcome") == OUTCOME_FAILED]
            if earlier and outcome != OUTCOME_FAILED:
                msg += (
                    f" An earlier build for the same commit also failed "
                    f"(created {earlier[0]['created']})."
                )
            return msg

        # No deployment exists for main HEAD at all. That is a different fault
        # from "it built and lost the race", and the operator needs to know
        # which one they are looking at.
        newest = self.production or (self.recent[0] if self.recent else None)
        if newest:
            return (
                "No Cloudflare Pages deployment exists for main HEAD; the newest "
                f"production deployment is commit {newest['commit'][:10]} "
                f"({newest['status']}, created {newest['created']}). The build for "
                "this commit never started."
            )
        return (
            "No Cloudflare Pages deployments were returned for this project, so "
            "the build for main HEAD cannot be identified."
        )


class CloudflarePages:
    """A thin, optional reader over the Pages deployments API."""

    def __init__(
        self,
        token: str = "",
        account: str = "",
        project: str = DEFAULT_PROJECT,
    ) -> None:
        self.token = token.strip()
        self.account = account.strip()
        self.project = (project or DEFAULT_PROJECT).strip()

    @classmethod
    def from_env(cls) -> "CloudflarePages":
        return cls(
            token=os.environ.get(TOKEN_ENV, ""),
            account=os.environ.get(ACCOUNT_ENV, ""),
            project=os.environ.get(PROJECT_ENV, DEFAULT_PROJECT),
        )

    @property
    def enabled(self) -> bool:
        return bool(self.token and self.account)

    @property
    def disabled_reason(self) -> str:
        if not self.token and not self.account:
            return (
                f"no Cloudflare API token is configured (set {TOKEN_ENV} and "
                f"{ACCOUNT_ENV} to name the superseding build)"
            )
        if not self.token:
            return f"{TOKEN_ENV} is not set"
        return f"{ACCOUNT_ENV} is not set"

    def _normalise(self, raw: dict) -> dict | None:
        """Flatten one deployment into the fields the gate reports."""
        if not isinstance(raw, dict):
            return None
        trigger = raw.get("deployment_trigger") or {}
        meta = trigger.get("metadata") or {}
        commit = str(meta.get("commit_hash") or "").strip()
        if not commit:
            return None
        stage = raw.get("latest_stage") or {}
        status = str(stage.get("status") or "unknown").strip().lower()
        word = STATUS_WORDS.get(status, status)
        # A null/absent URL must never reach the message as the string "None".
        url = raw.get("url")
        url = str(url).strip() if url else ""
        return {
            "commit": commit,
            "status": word,
            "outcome": OUTCOME_BY_STATUS.get(word, OUTCOME_UNKNOWN),
            "created": str(raw.get("created_on") or "unknown"),
            "url": url or "(no deployment URL)",
            "environment": str(raw.get("environment") or "").lower(),
            "id": str(raw.get("short_id") or raw.get("id") or ""),
        }

    @staticmethod
    def _newest(deployments: list[dict]) -> list[dict]:
        """Order newest first.

        The API documents newest-first, but the gate must not *depend* on that:
        picking the first match in an unordered list is how a failed build gets
        reported as the older success that preceded it. Sort explicitly, and
        keep the API order as the tie-break for identical timestamps.
        """
        return sorted(
            deployments,
            # A deployment with no created_on cannot be ordered; push it last
            # rather than letting the literal "unknown" sort to the front.
            key=lambda d: (d["created"] != "unknown", d["created"]),
            reverse=True,
        )


    def describe(self, expected_sha: str, served_sha: str) -> BuildDetail:
        """Name the build that superseded production, or say why we cannot.

        `expected_sha` is main HEAD (what should be live); `served_sha` is what
        production actually reports. Never raises.
        """
        if not self.enabled:
            return BuildDetail(False, self.disabled_reason)

        path = (
            f"/accounts/{self.account}/pages/projects/{self.project}"
            f"/deployments?per_page={MAX_DEPLOYMENTS}"
        )
        status, payload, error = _api_get(path, self.token)

        if status != 200 or not isinstance(payload, dict):
            return BuildDetail(
                False,
                redact(
                    f"Cloudflare API returned {error or f'HTTP {status}'}", self.token
                ),
            )
        if payload.get("success") is False:
            return BuildDetail(False, "Cloudflare API reported success=false")

        raw = payload.get("result")
        if not isinstance(raw, list):
            return BuildDetail(
                False, "Cloudflare API returned an unexpected payload (no result list)"
            )

        deployments = [d for d in (self._normalise(r) for r in raw) if d]
        if not deployments:
            return BuildDetail(
                False, "Cloudflare returned no deployments with a commit hash"
            )

        # Order explicitly. The API documents newest-first, but relying on that
        # is how a failed build gets reported as the older success before it.
        deployments = self._newest(deployments)

        production = [d for d in deployments if d["environment"] == "production"]
        for_head = [d for d in deployments if d["commit"] == expected_sha]
        # The newest build for main HEAD is the one that decides what happened.
        # An older attempt for the same commit must never stand in for it.
        superseding = for_head[0] if for_head else None

        return BuildDetail(
            True,
            superseding=superseding,
            production=production[0] if production else None,
            recent=deployments[:5],
            related=for_head[1:],
        )
