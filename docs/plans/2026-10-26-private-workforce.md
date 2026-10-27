# Private Workforce implementation

Approved first release: complete OAuth-first connection setup; add a private/project workforce directory, immutable agent versions, builder, departments and version-bound specialist chats. Preserve existing agency teams/resources/accounts. Reconcile Development team with open-agentDev and its three existing roles plus Frontend, DevOps, Security and Technical Writing. Keep legacy proposal runs separate. No background worker, public publication or consumer-account administration is introduced.

Tasks: (1) login/reconnect policy and forms; (2) registry schema, RLS, atomic lifecycle and reconciliation; (3) directory/profiles/builder; (4) existing chat integration with version binding and server-enforced capability limits; (5) regression tests, review, preview/production validation and release.

Defaults: private/project access, verified free models, original brand icons, no automatic provider grants, no secrets in instructions, no invented ChatGPT launch URLs. Existing resource and project IDs are reused. Missing provider login or models remains a readiness blocker.
