# Open Connect — Canonical Identity Model

**Product:** HillStreet's shared AI resource gateway and integration control plane. ChatGPT plugins and other AI clients connect to this Open-Connect installation; teams use one account surface across multiple projects.

## Human roles

The same three role names apply at platform, organization, and project scope. Scope determines what each role can do.

| Role | Organization access | Project access |
|---|---|---|
| **Admin** | Manage members, groups, settings, and sharing. Organization admins can manage every project in the organization. | Manage collaborators, installs, settings, and environments for an explicitly assigned project. |
| **Developer** | Develop, publish, and verify resources; use organization resources and projects they are assigned to. | Build and manage resources, tools, and project-scoped keys. |
| **Member** | Use the workspace, marketplace, resources, and assigned projects. | Use resources and features explicitly shared with that project. |

A person may have a different role for each project. Organization membership does not automatically grant access to project folders or resources. Admins grant and remove access from each project's access screen. Groups organize people; group membership alone does not grant project access.

## Machine principals

AI Client · AI Agent · Service Account · API Client · MCP Client

Machine principals use scoped keys and policies. They are not human role assignments, and they never receive provider master credentials.

## Authorization

Permission = principal + platform role + organization role + project role + project + environment + scope + policy + resource.

Navigation visibility is not an authorization boundary. Server functions and database policies enforce permissions. Keep API keys and connections scoped; secrets flow through the server-side credential broker.

## Canonical database roles

| Table | Allowed human roles |
|---|---|
| user_roles.role | user (Member) · developer · admin |
| organization_members.role | member · developer · admin |
| organization_invitations.role | member · developer · admin |
| project_members.role | member · developer · admin |

Historical organizations.owner_id is retained as record metadata; it is not an authorization shortcut. Legacy Owner and Publisher platform values are migrated to Admin and Developer and are not offered for new assignments.

## Resources and projects

The organization is the shared connection point for approved resources, skills, tools, prompts, agents, MCP servers, and other integrations. Projects group work by purpose and apply explicit collaboration boundaries. An AI client can use a resource only when its credentials, scopes, and project or organization policies allow the operation.

Never put provider secrets in prompts, screenshots, Git, or resource manifests. Clients and agents receive capability execution through the credential broker, never provider master credentials.
