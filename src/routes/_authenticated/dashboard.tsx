import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, KeyRound, Plug, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatarBadge } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Open-Connect" },
      { name: "description", content: "Workspace overview for resources, connections and keys." },
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
    {
      icon: Sparkles,
      label: "Agents / toolkits",
      value: profile?.toolkits ?? 0,
      to: "/toolkits" as const,
    },
    {
      icon: KeyRound,
      label: "API Keys",
      value: profile?.keys ?? 0,
      to: "/api-keys" as const,
    },
    {
      icon: Plug,
      label: "Connections",
      value: profile?.connections ?? 0,
      to: "/connections" as const,
    },
    {
      icon: Boxes,
      label: "Resources",
      value: profile?.resources ?? 0,
      to: "/resources" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex min-w-0 items-start gap-4">
        {!isLoading && profile ? (
          <ProfileAvatarBadge
            name={profile.displayName}
            email={profile.email}
            avatarUrl={profile.avatarUrl}
          />
        ) : (
          <Skeleton className="size-10 rounded-full" />
        )}
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">
            {isLoading
              ? "Dashboard"
              : `Welcome back${profile?.displayName ? `, ${profile.displayName}` : ""}`}
          </h1>
          {isLoading ? (
            <Skeleton className="mt-3 h-4 w-48" />
          ) : (
            <p className="mt-1 truncate text-sm text-muted-foreground">{profile?.email}</p>
          )}
        </div>
      </div>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Overview
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.to} className="block">
            <Card className="shadow-panel transition-colors hover:border-primary/40">
              <CardHeader className="pb-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <stat.icon className="size-4" />
                </span>
                <CardDescription className="mt-2">{stat.label}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {isLoading ? "—" : stat.value}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-10 bg-pillar">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> Agent endpoints
          </CardTitle>
          <CardDescription>
            Use a scoped <code className="font-mono">oc_live_</code> key from API Keys. Manage keys
            from the account menu — they are never embedded in the browser as service credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 font-mono text-xs text-primary sm:grid-cols-2">
          <span>MCP · https://open-connect.site/mcp</span>
          <span>Models · https://open-connect.site/v1</span>
          <span>API · https://open-connect.site/api/v1</span>
          <span>OAuth · https://open-connect.site/oauth</span>
        </CardContent>
        <CardContent>
          <Button asChild size="sm" variant="outline">
            <Link to="/api-keys">Manage API Keys</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
