# Credential resolver adapter

Open-Connect uses one host-level adapter instead of copying every provider secret into every app.
Set only this non-secret path in the trusted runtime:

```bash
export OPEN_CONNECT_CREDENTIAL_RESOLVER=/absolute/path/to/approved-vault-adapter
```

For each missing variable, the broker calls:

```text
approved-vault-adapter resolve credential://provider/purpose ENVIRONMENT_NAME
```

The adapter writes exactly one JSON object to standard output:

```json
{ "value": "resolved-internally" }
```

The broker captures the response in memory, injects it only into the selected child process, and
does not print or persist the value. Adapter diagnostics belong on standard error and must be
redacted. The adapter must return a non-zero status when access is denied, authentication is stale,
or the reference is unavailable.

The adapter may wrap Proton Pass CLI, a cloud secret manager, or another approved enterprise vault.
Its provider login material stays in the host secret store. Do not put vault exports, master
passwords, cookies, recovery codes, or private keys in this repository or adapter configuration.

Automatic command routing is available for supported developer CLIs:

```bash
npm run credentials:exec:auto -- gh pr list
npm run credentials:exec:auto -- docker push hillstreet/open-connect:latest
npm run credentials:exec:auto -- wrangler deploy
```

Use an explicit profile for commands whose purpose cannot be inferred safely. Credential access is
audited to `~/.local/state/open-connect/credential-access.jsonl` with names and decisions only.
