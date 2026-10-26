# Proton executor

This is an independently written adapter to the official Proton CLIs. It does not bundle Proton code, provide a public Proton OAuth server, or grant provider administration. Supported operations are Pass vault/item metadata listing and vault creation/rename, plus Drive file metadata listing and folder creation/file rename. Password reads, item secret writes, vault exports, account administration, file upload/download, sharing and deletion are intentionally unavailable.

## Account setup on the trusted executor host

Use one dedicated OS user/container **and encrypted secret store per Proton account**. Separate cache directories alone do not isolate the Drive keychain service. Install reviewed official releases from [Pass CLI](https://protonpass.github.io/pass-cli/) and [Drive CLI](https://proton.me/download/drive/cli/index.html); keep their versions pinned in your host inventory. This adapter requires a Node runtime and the repository's installed MCP SDK; Cloudflare Workers cannot execute these CLIs.

For Pass, set `PROTON_PASS_SESSION_DIR` to a private absolute directory, then run `pass-cli login` interactively. Native browser login handles MFA. A scoped PAT can alternatively be supplied as `PROTON_PASS_PERSONAL_ACCESS_TOKEN` **only to the native login process via your trusted secret resolver**, never in an MCP argument, shell history or Open-Connect connector credential. PAT sessions expire after two hours; reauthenticate natively. Viewer/editor/manager rights remain controlled by Proton. Do not configure session locking that requires an interactive unlock for unattended operations.

For Drive, set a private absolute `PROTON_DRIVE_CACHE_DIR`, `PROTON_DRIVE_CREDENTIALS_STORE=keychain` (or GPG-encrypted `pass`) and `PROTON_DRIVE_LOG_LEVEL=ERROR`. Run `proton-drive auth login` interactively in that isolated account. `unsafe_file` is rejected. The CLI, OS keychain and GPG setup must already work before starting this adapter.

## Start and connect

Configure these names in the trusted host's secret/config manager:

| Name | Value |
| --- | --- |
| `PROTON_MCP_PROVIDER` | `proton_pass` or `proton_drive` |
| `PROTON_MCP_ACCOUNT_ID` | A persisted opaque ID unique to this isolated account; never reuse for a different account |
| `PROTON_PASS_BINARY` / `PROTON_DRIVE_BINARY` | Absolute path to the installed official CLI |
| `PROTON_PASS_SESSION_DIR` / `PROTON_DRIVE_CACHE_DIR` | Private absolute native session/cache directory |
| `PROTON_MCP_BEARER_TOKEN` | Independent random bridge token, at least 32 characters; **not** a Proton PAT |
| `PROTON_MCP_ALLOW_WRITES` | Default false; `true` enables the supported writes, each requiring explicit confirmation |
| `PROTON_MCP_PORT` | Default 8788; listens only on 127.0.0.1 |

Run `node services/proton-mcp/server.mjs` from the repository. Publish `/mcp` through a trusted HTTPS reverse proxy with request size/time/rate limits and authentication-header logging disabled. Do not expose the loopback service directly or share this token across accounts. Session commands run serially with bounded time/output; errors never forward CLI stderr. Never allow untrusted users to modify the executable, host environment, session directories or secret store.

In Open-Connect → Connections choose Proton Pass/Drive, enter that account's trusted HTTPS `/mcp` URL and the **bridge bearer token**, label the account and connect. Setup must complete an actual MCP handshake before it is marked verified. Existing credentials remain in Vault. Link ChatGPT/Claude to `https://open-connect.site/mcp` using Open-Connect OAuth; that flow is separate from native Proton login. Account access, write confirmation and provider permissions still apply on every call.

## Acceptance and revocation

Run `node --test services/proton-mcp/executor.test.mjs`. On an approved test account verify list tools, metadata reads, denied writes when disabled, a confirmed disposable folder/vault rename, expired native sessions, wrong bridge token and two separate accounts. These tests require real provider consent; unit tests alone are not a production activation claim. Revoke the Open-Connect connection, bridge token and native Proton session separately when retiring an account. No live Proton account or executor deployment is provisioned by committing this directory.

Contracts reviewed: [Pass login](https://protonpass.github.io/pass-cli/commands/login/), [Pass agents](https://protonpass.github.io/pass-cli/commands/agent/), [Drive CLI](https://github.com/ProtonDriveApps/sdk/tree/main/cli). Review upstream CLI changes before upgrading.
