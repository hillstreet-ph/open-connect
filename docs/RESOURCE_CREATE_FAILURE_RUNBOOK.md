# Resource create failure — production diagnostic runbook

## Symptom
Authenticated Open-Connect Custom MCP `create_resource` returned an internal tool error while `get_admin_access` reported administrator=true, personal_context=true, resource_management=true, and scopes including `control:write` and `resources:write`.

## Safe diagnosis
1. Correlate the failed MCP request with Cloudflare/worker logs by request ID and UTC time. Never log bearer tokens or request bodies containing secrets.
2. Confirm the authenticated principal and personal (unscoped) context. Verify authorization before any database write.
3. Inspect the Supabase `resources` insert error code, constraint, table columns, and grants. Report a sanitized code and request ID; do not expose database credentials or user data.
4. Check whether the test slug already exists for this owner. A uniqueness conflict is different from a missing column, denied policy, or unavailable database.
5. Check `resource-packages` bucket configuration separately; resource creation should not require package upload.
6. Confirm deployed commit and migration versions match the repository; compare with the `resources` schema.
7. Reproduce with a new unique slug, `published=false`, `verified=false`, and a private owner-only resource. Never use production secrets in test content.
8. Verify the new resource is readable by its owner and inaccessible to a different owner or project-scoped key.
9. Validate update/upload optimistic concurrency and ensure publishing still requires independent review.
10. Run unit, integration, authorization-denial, build, and CI tests; release only with passing evidence.

## Acceptance
- `create_resource` returns an owned private resource and revision.
- Unauthorized requests fail without side effects.
- No existing resources, secrets, credentials, or connection bindings are modified.
- MCP tool errors are sanitized, actionable, and traceable with request IDs.
- Rollback restores the previous deployment without deleting user data.

## Known limits
The MCP Secrets interface currently supports authenticated UI actions; secret value read/write through MCP and secure injection are not implemented. Do not claim full credential administration through MCP until independently implemented and verified.
