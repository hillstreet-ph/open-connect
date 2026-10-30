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
| 4 | Discover | Marketplace, Resources, Agents, Skills, MCP, Tools, Toolkits, Prompts, Memory, Knowledge, Others |
| 5 | Connections | Plugins, Connectors, Credentials, AI Gateway |
| 6 | User avatar menu | hillstreet-ph (System administration), Developer, Settings, Help, Sign out |

Naming: use **Schedules** (noun), not “Scheduled”.

## Studio (detail types inside, not all in sidebar)

Skills · Plugins · Tools · Agents · Prompts · MCP · Workflows · Templates · Model configs

## Settings and administration

The platform logo returns to Dashboard. The user avatar at the bottom of the sidebar opens account and system settings.
Settings holds personal account surfaces only: Profile, Security & login, Data Controls, and Integrations. Anything that already has a sidebar destination (Projects, Connectors, Credentials, AI Gateway, Automations, Memory, Knowledge) is not repeated in Settings.
Credentials opens the existing scoped credential page.

System administration is one page (`/admin`) with Organization, Platform roles, and Access reference tabs. It opens from the single `hillstreet-ph` entry in the account menu; it is not duplicated in Settings or the sidebar. Platform role assignment shows only for platform Admins. The old `/orgs` and `/roles` URLs redirect to the matching tab. Direct route authorization remains enforced.
Marketplace remains the single resource registry entry. Existing URLs and server authorization remain unchanged.

## Product rule

Open Connect is the gateway and control plane. Independent applications consume it; they are not absorbed into it.

## Role and scope alignment

| Context | Access | Placement |
|---|---|---|
| Personal settings | Every signed-in account | Settings: Profile; Security & login |
| Client workspace | Member (stored as user) | Daily work, own credentials and API keys |
| Toolkit management | Developer and higher | Build, using manage_toolkits capability |
| System administration | Platform admin and owner | Account menu → `hillstreet-ph` (`/admin`); Organization, Platform roles, Access reference tabs |
| Organization membership | Organization Admins | System administration → Organization tab |
| Organizations and projects | Existing membership policies | Organization tab; Projects |

System administration manages platform roles; Organization settings manages HillStreet membership and groups; each project controls its own collaboration grants. Admin, Developer, and Member are the only human role labels across those scopes. Navigation adds no access. Clients use Member-level human identity plus their own scoped machine credentials.

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
