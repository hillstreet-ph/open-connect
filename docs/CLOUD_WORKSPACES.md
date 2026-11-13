# Cloud workspaces

Cloud Browser, Computer, Terminal, and Phone use verified remote MCP connections. Personal
mode lists only the signed-in user's connected Custom MCP and Apify MCP connections. Selecting
a project also includes its explicitly shared connections. Personal use does not require a
project. Discovery and execution recheck ownership or project membership on the server.

Each page discovers the selected provider's actual tool catalog and input schemas. Run a
provider tool with its required arguments. Project-shared calls retain the existing audit trail;
destructive tools require confirmation. Native Twilio and Telegram writes continue through
the scope-checked Open-Connect MCP route rather than the cloud form.

Browser session shortcuts appear only for session/profile/context/cookie tools advertised by
the selected connection. Saved sign-ins live at the browser provider. Reusing its session ID
or profile resumes state only if the provider supports it and the state has not expired. These
shortcuts do not create a browser, extend provider retention, or copy login cookies to this site.
An ordinary documentation/search MCP server is not a browser executor.

## Provisioning and verification

1. Connect an authenticated HTTPS MCP server that actually implements the required browser,
   desktop, terminal, or phone operations. Use the existing connection when present.
2. Verify discovery, then a bounded provider read. Provider registration alone is insufficient.
3. Create or resume a provider session using the advertised schema. Verify navigation or a
   harmless terminal command before enabling task execution.
4. For persistent login, verify the provider's isolated profile storage, resume, expiry, and
   delete controls. Complete login/MFA using its supported user handoff. Keep credential values
   in the Secrets UI and provider secret stores.
5. In each AI host, verify `list_connection_tools` and `call_connection_tool` using the same
   authorized connection. Administrator grants do not provision cloud hardware or add an adapter.

The control-plane `/api/v1/sessions` API separately requires an isolated browser worker configured
with `OC_BROWSER_WORKER_URL` and its vault credential reference. It is not automatically wired
to these cloud pages. The MCP gateway does not currently expose that session API. A phone UI,
desktop stream, persistent profile store, and browser credential injection must not be reported
ready until their provider and execution path have been tested.

## Rollback

The personal cloud UI/server changes are reversible by reverting their source commit. They do
not mutate connection ownership or project grants. Keep the anonymous consent restriction:
signed-out callers do not need permission to invoke the consent RPC. Existing OAuth tokens and
provider sessions are not rewritten by this release.
