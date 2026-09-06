import { createFileRoute } from "@tanstack/react-router";
import { ROLE_SCOPE_MATRIX, KEY_SCOPE_DOCS, roleLabel, type AppRole } from "@/lib/rbac";
import { useRoles } from "@/hooks/use-roles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/roles")({
  head: () => ({
    meta: [
      { title: "Roles & access — Open-Connect" },
      { name: "description", content: "Capability matrix for workspace roles and API key scopes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RolesAccessPage,
});

/** Capability rows mapped across Open-Connect roles (mockup-style matrix). */
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
    capability: "Connections · secrets",
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
            Capability matrix — a role grants access; a persona never does.
          </p>
        </div>
        <Badge variant="secondary" className="uppercase">
          Your role · {roleLabel(primary)}
        </Badge>
      </div>

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
            <CardTitle className="text-sm">How access is decided</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
            Role becomes an RLS / capability check at query time. Nothing in the UI and nothing in a
            prompt can widen it beyond your assigned role.
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
            <CardTitle className="text-sm">Service identities</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
            Agents authenticate with <code className="text-primary">oc_live_</code> keys under their
            own narrow scopes — never as a person, never with an operator session.
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Role summaries</CardTitle>
          <CardDescription>From the workspace RBAC matrix</CardDescription>
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
