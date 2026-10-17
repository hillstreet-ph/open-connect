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

The canonical mobile skill and its references are tracked in `skills/hillstreet-integrations-mobile`.

As of 2026-10-17, use the existing app-backed **open-connect MCP** plugin (`plugin_asdk_app_6acaeb867398819195374ebecb7c3a97`) as the consolidated ChatGPT package. Version 1.1.0, release `pluginrel_6ad2fce4465c81919ba2098eec6645ec`, includes all 71 unique skills from OpenConnect Integrations Skills 1.3.3. The mobile skill and its references match Open Connect 1.0.5 byte for byte. Preserve the original App binding, presentation, audience and provider authorization when updating this package. Do not add the standalone package's MCP configuration, which would duplicate the App connection.

Package construction preserves the bundle's supporting files and licenses and deduplicates the identical mobile skill by its directory/name. One upstream YAML description contains unquoted colons; apply `docs/plugin-packaging/iodbc-description.patch` before validating all skill headers. The patch only quotes that scalar and does not change instructions or executable code.

The standalone **Open Connect**, separate **OpenConnect Integrations Skills**, and legacy **open-connect** are migration candidates. Their installed entries should be removed only after verifying the consolidated package and confirming the exact removal targets. Uninstalling an entry does not delete its creator-owned source package or provider accounts.

Use the existing App-backed plugin from an Android Chrome chat when the ChatGPT host offers it. Packaging skills does not prove Android activation, refresh cached tool schemas, install local executors, or grant administrator access. Skills requiring a shell, local CLI or another provider still require those dependencies. Do not claim mobile end-to-end readiness until the target Android host executes the intended operation successfully.
