import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Building2,
  KeyRound,
  Lock,
  Plug,
  Sparkles,
  Bot,
  Layers,
  BookOpen,
  Wrench,
  Shield,
  LayoutDashboard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatarBadge } from "@/components/user-menu";
import { ResourceLibraryCard } from "@/components/resource-library-card";
import { useRoles } from "@/hooks/use-roles";
import { KEY_SCOPE_DOCS, ROLE_SCOPE_MATRIX, roleLabel } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Open-Connect" },
      {
        name: "description",
        content: "Workspace hub: Studio, organizations, professional setup, and role scopes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const hubBlocks = [
  {
    to: "/studio" as const,
    icon: LayoutDashboard,
    title: "Studio",
    body: "Create agents, skills, prompts, plugins, custom MCP, and connectors.",
    badge: "Create",
  },
  {
    to: "/orgs" as const,
    icon: Building2,
    title: "Organizations",
    body: "Group work into organizations and projects for your team.",
    badge: "Workspace",
  },
  {
    to: "/guides" as const,
    icon: BookOpen,
    title: "Professional setup",
    body: "MCP, OAuth, marketplace, and control-plane E2E demo package.",
    badge: "Guides",
  },
  {
    to: "/settings" as const,
    icon: Shield,
    title: "Role & account",
    body: "Your role controls uploads, publishing, toolkits, and admin.",
    badge: "RBAC",
  },
];

const quickLinks = [
  {
    category: "Connect agents",
    items: [
      { to: "/api-keys" as const, icon: KeyRound, title: "API Keys", body: "Scoped oc_live_ keys" },
      { to: "/agents" as const, icon: Bot, title: "Agents", body: "MCP clients & keys" },
      { to: "/integrations" as const, icon: Wrench, title: "Integrations", body: "ChatGPT · Claude · Grok · Open WebUI" },
    ],
  },
  {
    category: "Catalog",
    items: [
      { to: "/resources" as const, icon: Boxes, title: "Marketplace", body: "View & download skills" },
      { to: "/connections" as const, icon: Plug, title: "Connections", body: "Link apps (logos)" },
      { to: "/models" as const, icon: Sparkles, title: "Models", body: "Multi-provider /v1" },
    ],
  },
  {
    category: "Security",
    items: [
      { to: "/secrets" as const, icon: Lock, title: "Secrets", body: "Credential vault" },
      { to: "/toolkits" as const, icon: Layers, title: "Toolkits", body: "Developer+ role" },
      { to: "/settings" as const, icon: KeyRound, title: "Settings", body: "Profile & password" },
    ],
  },
];

function Dashboard() {
  const { primary, loading: rolesLoading, can } = useRoles();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-dashboard"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;
      const [
        { data: profileRow },
        { count: keyCount },
        { count: connCount },
        { count: toolkitCount },
        { count: resourceCount },
      ] = await Promise.all([
        supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle(),
        supabase.from("api_keys").select("id", { count: "exact", head: true }).is("revoked_at", null),
        supabase
          .from("app_connections")
          .select("id", { count: "exact", head: true })
          .eq("status", "connected"),
        supabase.from("toolkits").select("id", { count: "exact", head: true }),
        supabase.from("resources").select("id", { count: "exact", head: true }).eq("published", true),
      ]);
      return {
        email: userData.user?.email ?? "",
        displayName: profileRow?.display_name ?? "",
        avatarUrl: profileRow?.avatar_url ?? null,
        keys: keyCount ?? 0,
        connections: connCount ?? 0,
        toolkits: toolkitCount ?? 0,
        resources: resourceCount ?? 0,
      };
    },
  });

  const stats = [
    { icon: Layers, label: "Toolkits", value: profile?.toolkits ?? 0, to: "/toolkits" as const },
    { icon: KeyRound, label: "API Keys", value: profile?.keys ?? 0, to: "/api-keys" as const },
    { icon: Plug, label: "Connections", value: profile?.connections ?? 0, to: "/connections" as const },
    { icon: Boxes, label: "Marketplace", value: profile?.resources ?? 0, to: "/resources" as const },
  ];

  const roleRow = ROLE_SCOPE_MATRIX.find((r) => r.role === primary) ?? ROLE_SCOPE_MATRIX[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        {!isLoading && profile ? (
          <ProfileAvatarBadge
            name={profile.displayName}
            email={profile.email}
            avatarUrl={profile.avatarUrl}
          />
        ) : (
          <Skeleton className="size-10 shrink-0 rounded-full" />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {isLoading
                ? "Workspace"
                : `Welcome${profile?.displayName ? `, ${profile.displayName}` : ""}`}
            </h1>
            {!rolesLoading ? (
              <Badge variant="secondary" className="text-[10px] uppercase">
                {roleLabel(primary)}
              </Badge>
            ) : null}
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-4 w-40" />
          ) : (
            <p className="mt-1 truncate text-sm text-muted-foreground">{profile?.email}</p>
          )}
        </div>
      </div>

      {/* Primary hub */}
      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Workspace hub
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {hubBlocks.map((block) => (
          <Link key={block.to} to={block.to} className="block">
            <Card className="h-full shadow-panel transition-colors hover:border-primary/40">
              <CardHeader className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <block.icon className="size-4" />
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {block.badge}
                  </Badge>
                </div>
                <CardTitle className="mt-3 text-base">{block.title}</CardTitle>
                <CardDescription className="text-xs">{block.body}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Overview
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.to} className="block">
            <Card className="h-full shadow-panel transition-colors hover:border-primary/40">
              <CardHeader className="p-4 pb-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <stat.icon className="size-3.5" />
                </span>
                <CardDescription className="mt-2 text-xs">{stat.label}</CardDescription>
                <CardTitle className="text-2xl tabular-nums sm:text-3xl">
                  {isLoading ? "—" : stat.value}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {quickLinks.map((group) => (
        <div key={group.category} className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.category}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {group.items.map((item) => (
              <Link key={item.to} to={item.to} className="block">
                <Card className="h-full shadow-panel transition-colors hover:border-primary/40">
                  <CardHeader className="p-4">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <item.icon className="size-4" />
                    </span>
                    <CardTitle className="mt-3 text-base">{item.title}</CardTitle>
                    <CardDescription>{item.body}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* Role scope */}
      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Role scope
      </h2>
      <Card className="mt-3 shadow-panel">
        <CardHeader className="p-5 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Your role: {roleLabel(primary)}</CardTitle>
            <Badge variant="secondary" className="uppercase">
              {primary}
            </Badge>
          </div>
          <CardDescription>{roleRow?.summary}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 pt-2 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace capabilities
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {roleRow?.can.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Toolkits: {can("manage_toolkits") ? "allowed" : "requires developer+"} · Publish:{" "}
              {can("publish_resources") ? "allowed" : "requires publisher+"} · Admin:{" "}
              {can("admin_panel") ? "allowed" : "requires admin+"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              API key scopes (oc_live_)
            </p>
            <ul className="mt-2 space-y-1.5 font-mono text-[11px] text-muted-foreground">
              {KEY_SCOPE_DOCS.map((s) => (
                <li key={s.scope}>
                  <span className="text-primary">{s.scope}</span>
                  <span className="font-sans text-xs"> — {s.meaning}</span>
                </li>
              ))}
            </ul>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to="/api-keys">Manage API Keys</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {can("upload_resources") ? (
        <>
          <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upload packages
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish skills, tools, and agents. Prefer Studio for the full create hub.
          </p>
          <div className="mt-4 max-w-xl">
            <ResourceLibraryCard />
          </div>
        </>
      ) : null}

      <Card className="mt-10 bg-pillar">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> Agent endpoints
          </CardTitle>
          <CardDescription>
            Use a scoped <code className="font-mono">oc_live_</code> key from API Keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 px-4 pb-4 font-mono text-[11px] text-primary sm:grid-cols-2 sm:px-6 sm:text-xs">
          <span>MCP · https://open-connect.site/mcp</span>
          <span>Models · https://open-connect.site/v1</span>
          <span>API · https://open-connect.site/api/v1</span>
          <span>OAuth · https://open-connect.site/oauth</span>
        </CardContent>
        <CardContent className="flex flex-wrap gap-2 px-4 pb-4 sm:px-6">
          <Button asChild size="sm">
            <Link to="/studio">Open Studio</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/guides">Professional setup</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/orgs">Organizations</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
