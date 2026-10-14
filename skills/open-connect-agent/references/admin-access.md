# Open-Connect admin access

1. Call `open_connect_status` through the original installed connector. Read its actual scopes.
   Keep ChatGPT action approval settings, Open-Connect account roles, client scopes, project grants
   and provider consent separate. **Allow all actions** changes only the host approval preference.
2. For `configure_connection`, `execute_plan`, `decide_control_approval`, `create_capability_draft`,
   `record_run_outcome` and `install_capability`, require both an Admin/legacy Owner account and
   `control:write`. Other policy and provider checks still apply; a scope does not install an executor.
3. If `control:write` is absent, use the signed-in owner key-management UI at
   `https://open-connect.site/api-keys` to update the exact active owned connection key, or reconnect
   with explicit OAuth consent requesting the scope after deployed discovery advertises it.
   Preserve the key's organization, workspace, project, expiry and value. Do not update grants by
   direct SQL, impersonate a user session, or add the scope silently to default consent.
4. Verify the original connector after its authentication cache refreshes (up to 30 seconds).
   Inspect actual scopes again. Do not test access by changing a production connection or sending
   a message. If the host cannot present authorization, report the exact owner action required.
5. Create or edit credential values in the authenticated **Secrets** UI at
   `https://open-connect.site/secrets`. `list_credential_metadata` and `match_browser_credentials`
   return metadata only. `configure_connection` accepts an opaque `credential://` reference.
   Never put raw secrets in tool arguments, plugins, skills, logs or source files.
6. Treat `secure_injection_available: false` as a missing browser integration. An account match
   does not sign in. Use only the browser host's supported authentication flow; do not extract
   cookies or fill through another transport after a native credential protection blocks access.
7. Update remote MCP behavior in its owning repository and deployment. Preserve plugin/App IDs,
   endpoint, OAuth bindings and audience. Refresh tools through the host's supported app settings
   after deployment; a package version bump alone does not refresh cached tool schemas or grants.
8. Report source validation, deployment, plugin release, live client grants and successful operations
   separately. Do not call unsupported operations enabled or a standby worker actively monitoring.
