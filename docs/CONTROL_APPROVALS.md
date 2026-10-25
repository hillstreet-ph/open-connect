# Control approval inbox

Open **Settings → Approval requests** at `/settings#approvals`, or choose **Approvals** in the workspace header.

The inbox shows the signed-in account's latest 100 requests, including the exact target, action, environment, risk, expiry, and decision state. It refreshes every 15 seconds and supports manual refresh. A pending request past its expiry is displayed as expired and cannot be decided; ask the agent for a new request.

Only an administrator can decide a live personal request. The server checks the authenticated identity and role, then reuses the same conditional decision handler as MCP. Tenant ownership, requester ownership, pending state, expiry, and explicit confirmation are checked server-side. No browser write access to the approval table is granted.

Approving records authorization only. It does not start a deployment, import accounts, or claim execution. The requesting agent must resume through the supported executor and verify results.

Settings tabs are URL-driven and preserve deep links. Tab changes replace the current history entry. The shared Back control returns to a parent surface and is hidden on the public homepage and workspace dashboard. Integrations returns to the Integrations tab in Settings.
