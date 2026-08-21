import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Cpu, KeyRound, Plug, Settings, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ApiKeysCard } from "@/components/api-keys-card";
import { ResourceLibraryCard } from "@/components/resource-library-card";
import { ProfileAvatarBadge } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Open-Connect" },
      { name: "description", content: "Resources, connections and models in one place." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-dashboard"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;
      const [
        { data: profileRow },
        { data: roles },
        { count: keyCount },
        { count: connCount },
        { count: toolkitCount },
        { count: resourceCount },
      ] = await Promise.all([
        supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
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
        roles: (roles ?? []).map((row) => row.role),
        keys: keyCount ?? 0,
        connections: connCount ?? 0,
        toolkits: toolkitCount ?? 0,
        resources: resourceCount ?? 0,
      };
    },
  });

  const planes = [
    {
      icon: Boxes,
      title: "1 · Resources",
      body: profile
        ? `${profile.resources} published skills, MCP servers, tools & agents`
        : "Agent & skills library",
      to: "/resources" as const,
      cta: "Browse library",
    },
    {
      icon: Plug,
      title: "2 · Connections",
      body: profile
        ? `${profile.connections} app(s) connected — capability grants only`
        : "Pipedream-style app connections",
      to: "/connections" as const,
      cta: "Manage apps",
    },
    {
      icon: Cpu,
      title: "3 · Models",
      body: "Single gateway /v1 · open-connect/* aliases · OpenRouter upstream",
      to: "/models" as const,
      cta: "View models",
    },
    {
      icon: Sparkles,
      title: "Toolkits & agents",
      body: profile
        ? `${profile.toolkits} toolkit(s) · connect ChatGPT, Claude, Hermes`
        : "Bundle capabilities for agents",
      to: "/toolkits" as const,
      cta: "Open toolkits",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {!isLoading && profile ? (
            <ProfileAvatarBadge
              name={profile.displayName}
              email={profile.email}
              avatarUrl={profile.avatarUrl}
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold">
              {isLoading ? "Overview" : `Welcome${profile?.displayName ? `, ${profile.displayName}` : ""}`}
            </h1>
            {isLoading ? (
              <Skeleton className="mt-3 h-4 w-56" />
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{profile?.email}</span>
                {profile?.roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {role}
                  </Badge>
                ))}
                <Badge variant="outline">{profile?.keys ?? 0} live key(s)</Badge>
              </div>
            )}
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              One platform for all AI needs — resources, connections and models behind a single account and{" "}
              <code className="text-primary">oc_live_</code> key.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/agents">Connect agent</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/settings">
              <Settings className="mr-1 size-4" /> Settings
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {planes.map((panel) => (
          <Card key={panel.title} className="shadow-panel">
            <CardHeader>
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <panel.icon className="size-4" />
              </span>
              <CardTitle className="mt-3 text-base">{panel.title}</CardTitle>
              <CardDescription>{panel.body}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link to={panel.to}>{panel.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        <ApiKeysCard />
        <ResourceLibraryCard />
      </div>

      <Card className="mt-10 bg-pillar">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="size-4" /> Agent endpoints
          </CardTitle>
          <CardDescription>
            Authenticate with a scoped Open-Connect key. New keys include MCP, resources, connections and
            models scopes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 font-mono text-xs text-primary sm:grid-cols-2">
          <span>MCP · https://open-connect.site/mcp</span>
          <span>Models · https://open-connect.site/v1</span>
          <span>API · https://open-connect.site/api/v1</span>
          <span>OAuth · https://open-connect.site/oauth</span>
        </CardContent>
      </Card>
    </div>
  );
}
