import { useRoles } from "@/hooks/use-roles";
import {
  ALL_ROLES,
  CAPABILITY_DOCS,
  capabilityLevel,
  PLATFORM_ROLE_SUMMARY,
  roleLabel,
  type AppRole,
} from "@/lib/rbac";
import {
  ORG_ROLE_SUMMARY,
  PROJECT_ROLE_SUMMARY,
  type OrgRole,
  type ProjectRole,
} from "@/lib/identity";
import { AVAILABLE_KEY_SCOPES, scopeCapability } from "@/lib/access-profiles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The three role names that apply at every human scope, with their per-scope vocabulary. */
const HUMAN_ROLES: { name: string; platform: AppRole; org: OrgRole; project: ProjectRole }[] = [
  { name: "Member", platform: "user", org: "member", project: "member" },
  { name: "Developer", platform: "developer", org: "developer", project: "developer" },
  { name: "Admin", platform: "admin", org: "admin", project: "admin" },
];

function Level({ level }: { level: "full" | "denied" }) {
  if (level === "full") {
    return <span className="inline-block size-2.5 rounded-full bg-primary" title="full" />;
  }
  return (
    <span
      className="inline-block size-2.5 rounded-full border border-muted-foreground/40"
      title="denied"
    />
  );
}

export function AccessReferencePanel() {
  const { primary } = useRoles();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight sm:text-xl">
            Access reference
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the canonical platform, organization, and project access roles.
          </p>
        </div>
        <Badge variant="secondary" className="uppercase">
          Platform · {roleLabel(primary)}
        </Badge>
      </div>

      <Card className="overflow-hidden shadow-panel">
        <CardHeader className="border-b border-border/60 p-4">
          <CardTitle className="text-sm">Human roles</CardTitle>
          <CardDescription>
            The same three names apply at platform, organization, and project scope. Scope
            determines what each role can do.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Project</th>
              </tr>
            </thead>
            <tbody>
              {HUMAN_ROLES.map((row) => (
                <tr
                  key={row.name}
                  className={
                    row.platform === primary
                      ? "border-b border-border/60 bg-primary/5"
                      : "border-b border-border/60"
                  }
                >
                  <td className="px-4 py-3 align-top font-medium text-foreground">{row.name}</td>
                  <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                    {PLATFORM_ROLE_SUMMARY[row.platform]}
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                    {ORG_ROLE_SUMMARY[row.org]}
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                    {PROJECT_ROLE_SUMMARY[row.project]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardContent className="border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
          A person may hold a different role per project. Organization membership does not grant
          project access; Admins grant project access from each project's access screen. Legacy
          Owner and Publisher values migrate to Admin and Developer.
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-panel">
        <CardHeader className="border-b border-border/60 p-4">
          <CardTitle className="text-sm">Platform capabilities</CardTitle>
          <CardDescription>
            Minimum platform role required for each capability. Organization and project roles apply
            within their own scope and are not described here.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Capability</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="px-3 py-3 text-center font-medium">
                    {roleLabel(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_DOCS.map((row) => (
                <tr key={row.id} className="border-b border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-3 text-sm">{row.label}</td>
                  {ALL_ROLES.map((r) => (
                    <td key={r} className="px-3 py-3 text-center">
                      <Level level={capabilityLevel(r, row.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardContent className="flex flex-wrap gap-4 border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary" /> allowed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border border-muted-foreground/40" /> denied
          </span>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-panel">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Machine principals</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
            AI Client · AI Agent · Service Account · API Client · MCP Client — never human org
            roles. Authenticate with <code className="text-primary">oc_live_</code> keys under
            scopes.
          </CardContent>
        </Card>
        <Card className="shadow-panel">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Secrets rule</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
            Vault → credential broker → capability. Clients never receive provider master
            credentials.
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">API key scopes</CardTitle>
          <CardDescription>
            New <code className="text-primary">oc_live_</code> keys receive these scopes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1.5 px-4 pb-4 text-[11px] text-muted-foreground sm:grid-cols-2">
          {AVAILABLE_KEY_SCOPES.map((scope) => (
            <div key={scope} className="flex items-baseline gap-2">
              <code className="text-primary">{scope}</code>
              <span>{scopeCapability(scope).label}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
