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
| 6 | User avatar menu | API keys & MCP, Settings, Organizations & workspaces, Credentials, System administration (privileged), Help, Sign out |

Naming: use **Schedules** (noun), not “Scheduled”.

## Studio (detail types inside, not all in sidebar)

Skills · Plugins · Tools · Agents · Prompts · MCP · Workflows · Templates · Model configs

## Settings and administration

The platform logo returns to Dashboard. The user avatar at the bottom of the sidebar opens account and system settings.
Settings contains Profile and Security & login tabs. Only implemented settings are shown.
Organizations & workspaces opens the existing organization management page; it does not claim to switch active tenant context.
Credentials opens the existing scoped credential page.

Admins and owners get one System administration submenu: User roles (`/admin`) and Access reference (`/roles`).
No separate Owner Console or Admin Console appears in daily navigation. Owners retain their existing permissions within shared pages.
Marketplace remains the single resource registry entry. Existing URLs and server authorization remain unchanged.

## Product rule

Open Connect is the gateway and control plane. Independent applications consume it; they are not absorbed into it.

## Role and scope alignment

| Context | Access | Placement |
|---|---|---|
| Personal settings | Every signed-in account | Settings: Profile; Security & login |
| Client workspace | Member (stored as user) | Daily work, own credentials and API keys |
| Toolkit management | Developer and higher | Build, using manage_toolkits capability |
| System administration | Platform admin and owner | User avatar menu: User roles; Access reference |
| Owner role management | Platform owner only | Within the shared User roles page |
| Organizations and projects | Existing membership policies | Organizations & workspaces; Projects |

System administration manages platform roles, not tenant membership. Organization
owner/admin/member and project manager/developer/viewer are separate contexts.
No additional access is granted by navigation. Clients are Members, not a new database role.
Owner-role revocation and self-admin revocation controls mirror existing server denials.

## Account menu placement and MCP verification

The platform logo is a dashboard link, never a menu trigger. The bottom user
avatar is the only settings menu in the workspace; the public site uses its
header account avatar. Neither surface duplicates account links in its sidebar.
Marketplace and resource discovery stay in the daily sidebar. Dashboard focuses
on work and catalog activity, not repeated settings or API scope lists.

API keys & MCP contains key creation and a same-origin, read-only initialize +
tools/list test. A test does not install a ChatGPT plugin or validate every tool.
ChatGPT OAuth sign-in and tool approval are separate from bearer-key testing.
Reference: https://developers.openai.com/plugins/deploy/connect-chatgpt
