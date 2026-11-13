# Context storage and custom connectors

## Data Controls

Open Settings → Data Controls. Memory and Knowledge cards show account-owned record counts and UTF-8 text sizes, with previews of the five latest records. Select a record to read its full text, tags and update time. Archived Knowledge is excluded from active counts. Text size does not represent physical database or index usage.

Files & images uses the existing private `memory-knowledge-files` bucket. Upload documents or images up to 10 MB each, preview supported raster images, download files or delete them. File counts and bytes cover all account-owned objects in the bucket, including attachments uploaded through Memory and Knowledge. Files are paginated 50 at a time. File links expire after 60 seconds; credentials and binary files are not included in the existing JSON context export. Deleting a file does not delete saved context text.

## Custom connection profiles

Open Connectors → Add custom MCP or Add API profile. Enter a connector name, account label, description, HTTPS endpoint and authentication details. Credentials stay in the existing server-side vault.

A custom MCP connection uses the exact Streamable HTTP MCP endpoint. The server must complete MCP initialization; an ordinary REST base URL or HTML dashboard is not an MCP server. API-key authentication supports a configurable credential header, including `X-API-Key` and `x-consumer-api-key`. Bearer tokens use the Authorization header. Reserved protocol/routing headers cannot be overridden.

The Composio preset fills `https://connect.composio.dev/mcp` and the consumer-key header. Supply a Composio consumer key for that mode. OAuth-only access must be authorized in a supported client; project API keys and personal access tokens are separate credential types. See [Composio Connect](https://docs.composio.dev/docs/composio-connect) and [Composio's client setup source](https://github.com/ComposioHQ/composio/tree/next/docs).

API profiles store a URL and credential reference without executing a request or claiming tool support. They remain configured/unverified until a reviewed provider adapter or MCP server supplies tool execution. They are not arbitrary REST proxies.

Validation reports safe HTTP/authentication/protocol diagnostics without echoing remote response bodies or credentials. Redirects and cross-origin transport requests do not forward credentials.

## Validation

Control tests cover header selection, protocol override rejection, private file boundaries, byte formatting and remote error redaction. `supabase/tests/context_storage_overview.sql` tests counts, Unicode byte sizes, private file metadata, pagination and account isolation in a rolled-back transaction; supply `open_connect.test_user_id` as an existing test account. A live Storage smoke test additionally verifies upload, signed download, unsigned-access rejection and cleanup.
