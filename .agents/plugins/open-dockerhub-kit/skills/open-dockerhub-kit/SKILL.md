---
name: open-dockerhub-kit
description: Build, publish, secure, and operate authorized Docker Hub images and repositories. Use for setup, CI publishing, multi-architecture builds, tags, provenance, vulnerability review, webhooks, access audits, deployment handoff, and image verification.
---

# Open Docker Hub Kit

Operate through the connected account and repository CI. Prefer short-lived scoped tokens and immutable digests.

## Workflow

1. Identify namespace, repository, visibility, build source, platforms, and deployment consumers.
2. Inspect tags, automated builds, webhooks, collaborators, retention, and scans.
3. Reuse the established Dockerfile and workflow; add only missing capabilities.
4. Build with pinned bases, non-root runtime, minimal layers, health checks, and no embedded secrets.
5. Test, scan, generate provenance/SBOM when supported, and publish through protected CI.
6. Verify the remote digest and confirm every consumer pulls it and becomes healthy.

## Capabilities and guardrails

Manage repositories, teams, tags, manifests, architectures, webhooks, CI, signing, scanning, and deployment handoff within granted scopes. Never put tokens in images, build arguments, logs, archives, or source. Do not overwrite production tags without rollback, or delete/change visibility/access without approval. Avoid duplicate repositories and pipelines.
