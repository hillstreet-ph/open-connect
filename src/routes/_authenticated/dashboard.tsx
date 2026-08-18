import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Cpu, LogOut, Plug } from "lucide-react";
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
      { name: "description", content: "Manage your Open-Connect resources, connections, models and keys." },
      { property: "og:title", content: "Dashboard — Open-Connect" },
      { property: "og:description", content: "Your Open-Connect control plane." },
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
      const [{ data: profileRow }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      return {
        email: userData.user?.email ?? "",
        displayName: profileRow?.display_name ?? "",
        roles: (roles ?? []).map((row) => row.role),
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
      body: "Installed skills, MCP servers and tools appear here.",
    },
    { icon: Plug, title: "Connections", body: "No applications connected yet." },
    { icon: Cpu, title: "Models", body: "Configure providers and routing policy." },
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
        <Button variant="outline" onClick={signOut}>
          <LogOut className="mr-1 size-4" /> Sign out
        </Button>
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
              <Badge variant="outline" className="text-muted-foreground">
                Coming in the next phase
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-10 bg-pillar">
        <CardHeader>
          <CardTitle className="text-base">Your gateway endpoints</CardTitle>
          <CardDescription>Authenticate with a scoped Open-Connect key.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 font-mono text-xs text-primary sm:grid-cols-2">
          <span>https://open-connect.site/mcp</span>
          <span>https://open-connect.site/api/v1</span>
          <span>https://open-connect.site/oauth</span>
          <span>https://open-connect.site/v1</span>
        </CardContent>
      </Card>
    </div>
  );
}
