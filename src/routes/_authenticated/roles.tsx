import { createFileRoute, Link } from "@tanstack/react-router";
import { ROLE_SCOPE_MATRIX, KEY_SCOPE_DOCS, roleLabel, type AppRole } from "@/lib/rbac";
import {
  ORG_ROLE_LABEL,
  PROJECT_ROLE_LABEL,
  type OrgRole,
  type ProjectRole,
} from "@/lib/identity";
import { useRoles } from "@/hooks/use-roles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/roles")({
  head: () => ({
    meta: [
      { title: "Roles & access — Open-Connect" },
      {
        name: "description",
        content: "Organization, project, and machine principal roles for Open Connect.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RolesAccessPage,
});

const ORG_ROLES: OrgRole[] = ["member", "admin", "owner"];
const PROJECT_ROLES: ProjectRole[] = ["viewer", "developer", "manager"];

const MATRIX: { capability: string; levels: Record<AppRole, "full" | "scoped" | "denied"> }[] = [
  {
    capability: "Dashboard & Studio",
    levels: { user: "full", developer: "full", publisher: "full", admin: "full", owner: "full" },
  },
  {
    capability: "Download marketplace packages",
    levels: { user: "full", developer: "full", publisher: "full", admin: "full", owner: "full" },
  },
  {
    capability: "Upload own packages",
    levels: { user: "full", developer: "full", publisher: "full", admin: "full", owner: "full" },
  },
  {
    capability: "API keys (full autonomous scopes)",
    levels: { user: "full", developer: "full", publisher: "full", admin: "full", owner: "full" },
  },
  {
    capability: "Connections · secrets (metadata)",
    levels: { user: "full", developer: "full", publisher: "full", admin: "full", owner: "full" },
  },
  {
    capability: "Manage toolkits",
    levels: { user: "denied", developer: "full", publisher: "full", admin: "full", owner: "full" },
  },
  {
    capability: "Publish resources",
    levels: { user: "denied", developer: "denied", publisher: "full", admin: "full", owner: "full" },
  },
  {
    capability: "Verify resources",
    levels: { user: "denied", developer: "denied", publisher: "denied", admin: "full", owner: "full" },
  },
  {
    capability: "Manage roles",
    levels: { user: "denied", developer: "denied", publisher: "denied", admin: "full", owner: "full" },
  },
  {
    capability: "Admin panel",
    levels: { user: "denied", developer: "denied", publisher: "denied", admin: "full", owner: "full" },
  },
];

const ROLES: AppRole[] = ["user", "developer", "publisher", "admin", "owner"];

function Cell({ level }: { level: "full" | "scoped" | "denied" }) {
  if (level === "full") {
    return <span className="inline-block size-2.5 rounded-full bg-primary" title="full" />;
  }
  if (level === "scoped") {
    return (
      <span
        className="inline-block size-2.5 rounded-full border-2 border-primary bg-transparent"
        title="scoped"
      />
    );
  }
  return (
    <span className="inline-block size-2.5 rounded-full border border-muted-foreground/40" title="denied" />
  );
}

function RolesAccessPage() {
  const { primary } = useRoles();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Roles & access
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Principal + org role + project role + environment + scope + policy — never a single global
            super-role.
          </p>
        </div>
        <Badge variant="secondary" className="uppercase">
          Platform · {roleLabel(primary)}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-panel">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Organization roles</CardTitle>
            <CardDescription>Owner · Admin · Member (canonical)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4 text-xs text-muted-foreground">
            {ORG_ROLES.map((r) => (
              <div key={r} className="rounded-lg border border-border/60 px-3 py-2">
                <span className="font-medium text-foreground">{ORG_ROLE_LABEL[r]}</span>
                <p className="mt-0.5">
                  {r === "owner" && "Root governance — ownership, global security, appoint Admins."}
                  {r === "admin" &&
                    "Administration Console — members, projects, registry, gateway, audit. Not Owner."}
                  {r === "member" &&
                    "Workspace only — assigned projects, marketplace, personal keys. Permission-aware UI."}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="shadow-panel">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Project roles</CardTitle>
            <CardDescription>Manager · Developer · Viewer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4 text-xs text-muted-foreground">
            {PROJECT_ROLES.map((r) => (
              <div key={r} className="rounded-lg border border-border/60 px-3 py-2">
                <span className="font-medium text-foreground">{PROJECT_ROLE_LABEL[r]}</span>
                <p className="mt-0.5">
                  {r === "manager" && "Project access, members, installs, environments."}
                  {r === "developer" && "Build resources, tools, project-scoped keys."}
                  {r === "viewer" && "Read-only project surface."}
                </p>
              </div>
            ))}
            <p className="pt-1 text-[11px]">
              Same person can be Manager on one project and Viewer on another. See{" "}
              <Link to="/orgs" className="text-primary underline-offset-2 hover:underline">
                Organizations
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-panel border-primary/20">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Three product surfaces</CardTitle>
          <CardDescription>Member Workspace · Admin Console · Owner Console</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 px-4 pb-4 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="font-medium text-foreground">Member Workspace</p>
            <p className="mt-1">Projects, marketplace, resources, models, my API keys, activity.</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="font-medium text-foreground">Admin Console</p>
            <p className="mt-1">Members, registry, gateway, vault metadata, ops, audit — not raw secrets.</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="font-medium text-foreground">Owner Console</p>
            <p className="mt-1">Ownership, global policies, provider governance, billing/limits.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" /> full
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-primary" /> within scope
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-muted-foreground/40" /> denied
        </span>
      </div>

      <Card className="overflow-hidden shadow-panel">
        <CardHeader className="border-b border-border/60 p-4">
          <CardTitle className="text-sm">Legacy platform capability matrix</CardTitle>
          <CardDescription>
            app_role enum still used by route guards until cutover; product language is Member not
            User.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Capability</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-3 py-3 text-center font-medium">
                    {roleLabel(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.capability} className="border-b border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-3 text-sm">{row.capability}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-3 py-3 text-center">
                      <Cell level={row.levels[r]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-panel">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Machine principals</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
            AI Client · AI Agent · Service Account · API Client · MCP Client — never human org roles.
            Authenticate with <code className="text-primary">oc_live_</code> keys under scopes.
          </CardContent>
        </Card>
        <Card className="shadow-panel">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">API key scopes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 px-4 pb-4 font-mono text-[11px] text-muted-foreground">
            {KEY_SCOPE_DOCS.slice(0, 6).map((s) => (
              <div key={s.scope}>
                <span className="text-primary">{s.scope}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="shadow-panel">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Secrets rule</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
            Vault → credential broker → capability. Clients never receive provider master credentials.
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Platform role summaries</CardTitle>
          <CardDescription>Legacy workspace RBAC matrix</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_SCOPE_MATRIX.map((row) => (
            <div
              key={row.role}
              className={
                row.role === primary
                  ? "rounded-xl border border-primary/40 bg-primary/5 p-3"
                  : "rounded-xl border border-border/70 p-3"
              }
            >
              <p className="text-sm font-medium">{roleLabel(row.role)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.summary}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
