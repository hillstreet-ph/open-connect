# Open Connect — Primary navigation IA

**Locked mental model:**  
Dashboard → Projects → Work → Build → Discover → Connect → Invoke → Develop → Manage

## Hierarchy

```text
Organization  (switcher, not daily top nav)
   ↓
Workspace     (switcher)
   ↓
Project       (center of the system)
   ↓
Tasks / Automations / Schedules / Runs
   ↓
Resources + Connections + Agents
```

Projects own tasks, schedules, automations, agents, resources, connections, models, files, environments, and members. Open Connect does not absorb independent apps (Open Box, etc.).

## Member sidebar order

| Order | Group | Items |
|------:|-------|--------|
| 1 | — | Dashboard, **Projects** |
| 2 | Work | Tasks, Automations, **Schedules** |
| 3 | Build | Studio, Agents, Toolkits |
| 4 | Discover | Marketplace |
| 5 | Connect | Connections, Integrations, AI Gateway |
| 6 | Developer | API & MCP, Guides |
| 7 | — | Settings |

Naming: use **Schedules** (noun), not “Scheduled”.

## Studio (detail types inside, not all in sidebar)

Skills · Plugins · Tools · Agents · Prompts · MCP · Workflows · Templates · Model configs

## Privileged surfaces (role-gated)

- **Admin Console** — Organization, Roles & scopes, Vault metadata, Resource registry  
- **Owner Console** — Org governance, Ownership & policies, Credential governance  

Members do **not** see infrastructure-heavy admin items by default.

## Organization placement

Organization is a **container**. Expose via top switcher (“Switch org / workspace”), not as the first permanent work item.

## Product rule

Open Connect is the gateway and control plane. Independent applications consume it; they are not absorbed into it.
