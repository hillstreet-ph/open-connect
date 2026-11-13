# Resource review evidence and execution

An `approved` display label and `verified=true` do not authorize execution. MCP
execution and installation also require `installation_config.executable` to be
the boolean `true`, and both independent security and license review records.
Catalog metadata and existing instruction-package download behavior are separate
from execution eligibility; this change does not remove catalog rows or bulk
unpublish packages.

Each `security_review` and `license_review` record in `installation_config` must
contain `state: "approved"`, the current resource `version`, its exact
`content_sha256`, a reviewer UUID different from the resource owner, an ISO
`reviewed_at` timestamp, and an HTTPS `evidence_url`. The config's content SHA-256
must be a 64-character hex digest. A blocked package scan always prevents
promotion and execution. Single and bulk verification/publication, including the
owner administration MCP path, reject absent or mismatched evidence. Removing
verification or publication remains possible without approval evidence.

These fields are an evidence contract, not automatic clearance. Static scanning
does not create independent security or license approval. Existing legacy labels
are not converted into review records. Actual package bytes, licenses, review
identity, and evidence references must be independently checked before any new
review record is accepted. This change does not provide a review-ingestion UI or
assert that historical packages have passed review.

Issue #393 remains open until the review records have authoritative provenance,
database writes cannot forge or overwrite reviewer decisions, affected historical
versions are reconciled, and an independent reviewer verifies production behavior.
Application metadata validation alone does not protect against privileged or
direct database tampering. No production resource state is changed by this patch.
