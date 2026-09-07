# Open Connect — Canonical Identity Model

**Product:** AI Resource Gateway + Integration Control Plane  
**Rule:** Independent apps consume Open Connect; they are not absorbed into it.

Do **not** rebuild the app from scratch. Refactor existing routes into three surfaces after the authorization layer is complete.

## Locked naming

### Human (organization)

| Role | Meaning |
|------|---------|
| **Owner** | Root governance (few people). Ownership transfer, org delete, appoint Admins, global security, org-wide provider credentials |
| **Admin** | Administration Console — members, projects, access, registry, gateway, vault metadata, ops, audit. **Not** Owner: no ownership transfer, no org delete, no unrestricted secret export |
| **Member** | Workspace only — projects they belong to, marketplace, resources, connections, models, files, personal API keys. Permission-aware UI (hide, do not only disable) |

> Prefer **Member** over generic “User” at org level. A Member can be Manager on one project and Viewer on another.

### Project

| Role | Meaning |
|------|---------|
| **Manager** | Project access, members, installs, environments |
| **Developer** | Build: resources, tools, keys in project scopes |
| **Viewer** | Read-only project surface |

### Machine principals (not human roles)

`AI Client` · `AI Agent` · `Service Account` · `API Client` · `MCP Client`

Stored in `principals` (and related key tables), never as org “admin” labels.

## Authorization equation

```text
Permission =
  Principal
  + Organization Role
  + Project Role
  + Project
  + Environment
  + Scope
  + Policy
  + Resource
```

Do **not** invent superadmin / client-admin / publisher-admin global roles. Use org + project + scopes + policies.

## Secrets

```text
Vault → Credential Broker → Capability execution
```

Clients and agents receive **capability execution**, never provider master credentials. UI shows metadata only (configured / valid / last validated).

## Three surfaces (navigation target)

1. **Member Workspace** — Dashboard, Projects, Marketplace, Resources, Connections, Models, Agents, Files, Developer (my keys), Activity, Settings  
2. **Admin Console** — Overview, Organization, Members, Projects, Environments, Access, Registry, Connections, AI Gateway, API & MCP, Vault (metadata), Operations, Usage, Audit, Security  
3. **Owner Console** — Admin + ownership, global policies, provider governance, billing/limits  

Existing routes (`/dashboard`, `/studio`, `/orgs`, `/projects`, `/roles`, `/admin`, `/api-keys`, `/secrets`, …) map into these surfaces; do not duplicate systems.

## Implementation order (mandatory)

1. Identity / RLS  
2. Organization roles (Owner / Admin / Member)  
3. Project membership / roles (Manager / Developer / Viewer)  
4. Environments  
5. Scopes / policies  
6. Credential broker  
7. API / MCP credentials (personal vs project vs service account)  
8. Route guards  
9. Permission-aware navigation  
10. Admin / Owner UI polish  

## Schema notes (current)

| Table | Role |
|-------|------|
| `organization_members.role` | `owner` \| `admin` \| `member` |
| `project_members.role` | `manager` \| `developer` \| `viewer` |
| `user_roles.role` (`app_role`) | Legacy platform enum — map `user` → Member in product language; keep until cutover |
| `principals` | Machine identities |
| `environments` | development / staging / production per project |

## Credential hygiene

Never place provider secrets in prompts, screenshots, Git, or resource manifests. Treat any leaked values as exposed and rotate at the provider.
