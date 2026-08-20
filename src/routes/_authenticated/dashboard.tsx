import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Cpu, KeyRound, LogOut, Plug, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ApiKeysCard } from "@/components/api-keys-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Open-Connect" },
      { name: "description", content: "Manage resources, connections, models and keys." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;
      const [{ data: profileRow }, { data: roles }, { count: keyCount }, { count: connCount }, { count: toolkitCount }] =
        await Promise.all([
          supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", userId),
          supabase.from("api_keys").select("id", { count: "exact", head: true }).is("revoked_at", null),
          supabase.from("app_connections").select("id", { count: "exact", head: true }),
          supabase.from("toolkits").select("id", { count: "exact", head: true }),
        ]);
      return {
        email: userData.user?.email ?? "",
        displayName: profileRow?.display_name ?? "",
        roles: (roles ?? []).map((row) => row.role),
        keys: keyCount ?? 0,
        connections: connCount ?? 0,
        toolkits: toolkitCount ?? 0,
      };
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    await navigate({ to: "/" });
  }

  const panels = [
    {
      icon: Boxes,
      title: "My Library",
      body: "Browse the resource registry and install skills, MCP servers and tools.",
      to: "/resources" as const,
      stat: null as number | null,
    },
    {
      icon: Plug,
      title: "Connections",
      body: profile ? `${profile.connections} app connection(s)` : "Connect GitHub, Slack, Notion and more.",
      to: "/connections" as const,
      stat: profile?.connections ?? null,
    },
    {
      icon: Cpu,
      title: "Models",
      body: "OpenAI-compatible gateway at /v1 with open-connect/* aliases.",
      to: "/models" as const,
      stat: null,
    },
    {
      icon: Sparkles,
      title: "Toolkits",
      body: profile ? `${profile.toolkits} toolkit(s)` : "Bundle capabilities for agents.",
      to: "/toolkits" as const,
      stat: profile?.toolkits ?? null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {isLoading ? "Overview" : `Welcome${profile?.displayName ? `, ${profile.displayName}` : ""}`}
          </h1>
          {isLoading ? (
            <Skeleton className="mt-3 h-4 w-56" />
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{profile?.email}</span>
              {profile?.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/agents">Connect agent</Link>
          </Button>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="mr-1 size-4" /> Sign out
          </Button>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {panels.map((panel) => (
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
                <Link to={panel.to}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        <ApiKeysCard />
      </div>

      <Card className="mt-10 bg-pillar">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="size-4" /> Gateway endpoints
          </CardTitle>
          <CardDescription>Authenticate with a scoped Open-Connect key (oc_live_…).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 font-mono text-xs text-primary sm:grid-cols-2">
          <span>https://open-connect.site/mcp</span>
          <span>https://open-connect.site/api/v1</span>
          <span>https://open-connect.site/v1</span>
          <span>https://open-connect.site/oauth</span>
        </CardContent>
      </Card>
    </div>
  );
}
