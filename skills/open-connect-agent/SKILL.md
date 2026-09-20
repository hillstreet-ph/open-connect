---
name: open-connect-agent
description: Coordinate ChatGPT, Claude, Grok, Mistral, Kimi, Manus, and Hermes/Open-System through the Open-Connect control plane for shared project planning, coding, review, testing, scheduling, memory, and audited delivery.
---

# Open-Connect Agent

Use Open-Connect as the commander and Open-System/Hermes as the execution supervisor.

## Operating sequence

1. Resolve organization, workspace, project, task, and environment.
2. Retrieve only relevant knowledge and prior run evidence.
3. Build a bounded plan and classify each action by risk.
4. Route work by capability, health, cost, latency, quota, and data policy.
5. Give each provider the minimum context and opaque credential references only.
6. Run code in isolated workspaces and use feature branches.
7. Require independent review and automated tests before promotion.
8. Pause for approval on production, destructive, billing, credential, identity, permission, DNS, or public-release actions.
9. Record outputs, decisions, evidence, costs, failures, and reusable memory.

Never place tokens, passwords, session cookies, private keys, or recovery codes in prompts, logs, repositories, skills, or artifacts. A provider marked authorization-required is unavailable until its owner completes OAuth/API authorization.
