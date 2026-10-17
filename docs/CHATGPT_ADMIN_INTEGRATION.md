# Administrator integration release

The administrator resource-management server was merged in PR #335. It provides `get_admin_access`, `get_owned_resource`, `create_resource`, `update_resource`, `upload_resource_content`, `set_resource_publication`, and `get_credential_management` through MCP and the documented ChatGPT Actions contract.

## Independent readiness checks

1. Verify the active production commit through Cloudflare Pages.
2. Call status independently through Open-Connect, Open-Connect MCP, and the existing Composio custom toolkit. Scope strings do not prove the actual Admin role.
3. Discover `get_admin_access` and verify personal context plus resource-management capability.
4. Preview Composio imports; zero candidates with all matched accounts existing means no additional import is needed.
5. Search and read existing owned resources before writes. Preserve the exact revision for compare-and-set updates. Drafts and edited content remain private and unverified until a separate security review.
6. Refresh the existing toolkit in Composio and the existing app in ChatGPT when either host still advertises an older schema. Updating skill instructions does not perform that refresh. Preserve App IDs, OAuth bindings, audience and provider approval gates.
7. Credential creation, value retrieval, editing and deletion use the authenticated Secrets UI. MCP provides metadata and opaque credential references only; it does not provide raw values or secure browser injection.

## Plugin source synchronization

The canonical mobile skill and its references are tracked in `skills/hillstreet-integrations-mobile`. Overlay those files onto the existing Open Connect and OpenConnect Integrations Skills packages using guarded release IDs. Preserve the packages' existing manifests, endpoints, other skills and binary assets; bump only their release versions. Do not create replacement plugins or claim new grants from a version bump.
