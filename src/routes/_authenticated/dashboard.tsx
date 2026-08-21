import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  KeyRound,
  Lock,
  Plug,
  Sparkles,
  Bot,
  Layers,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatarBadge } from "@/components/user-menu";
import { ResourceLibraryCard } from "@/components/resource-library-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Open-Connect" },
      { name: "description", content: "Workspace overview and package uploads." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const quickLinks = [
  {
    category: "Get started",
    items: [
      { to: "/api-keys" as const, icon: KeyRound, title: "API Keys", body: "Create oc_live_ keys for agents" },
      { to: "/agents" as const, icon: Bot, title: "Agents", body: "Connect MCP clients" },
      { to: "/integrations" as const, icon: BookOpen, title: "Integrations", body: "ChatGPT, Grok, Telegram" },
    ],
  },
  {
    category: "Catalog",
    items: [
      { to: "/resources" as const, icon: Boxes, title: "Marketplace", body: "Skills, tools, plugins" },
      { to: "/connections" as const, icon: Plug, title: "Connections", body: "Link apps" },
      { to: "/models" as const, icon: Sparkles, title: "Models", body: "Multi-provider gateway" },
    ],
  },
  {
    category: "Security",
    items: [
      { to: "/secrets" as const, icon: Lock, title: "Secrets", body: "Credential vault" },
      { to: "/toolkits" as const, icon: Layers, title: "Toolkits", body: "Bundle capabilities" },
      { to: "/settings" as const, icon: KeyRound, title: "Settings", body: "Profile and password" },
    ],
  },
];

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
    { icon: Layers, label: "Toolkits", value: profile?.toolkits ?? 0, to: "/toolkits" as const },
    { icon: KeyRound, label: "API Keys", value: profile?.keys ?? 0, to: "/api-keys" as const },
    { icon: Plug, label: "Connections", value: profile?.connections ?? 0, to: "/connections" as const },
    { icon: Boxes, label: "Marketplace", value: profile?.resources ?? 0, to: "/resources" as const },
  ];

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
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {isLoading
              ? "Dashboard"
              : `Welcome${profile?.displayName ? `, ${profile.displayName}` : ""}`}
          </h1>
          {isLoading ? (
            <Skeleton className="mt-2 h-4 w-40" />
          ) : (
            <p className="mt-1 truncate text-sm text-muted-foreground">{profile?.email}</p>
          )}
        </div>
      </div>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Upload packages
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Publish skills, tools, and agents to the marketplace. Downloads require sign-in.
      </p>
      <div className="mt-4 max-w-xl">
        <ResourceLibraryCard />
      </div>

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
        <CardContent className="px-4 pb-4 sm:px-6">
          <Button asChild size="sm" variant="outline">
            <Link to="/api-keys">Manage API Keys</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
