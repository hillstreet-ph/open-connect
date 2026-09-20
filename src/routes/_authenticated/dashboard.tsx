import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, ListTodo, Plug, Layers, LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatarBadge } from "@/components/user-menu";
import { ResourceLibraryCard } from "@/components/resource-library-card";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Open-Connect" },
      {
        name: "description",
        content: "Workspace hub: projects, tasks, Studio, and marketplace resources.",
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
    to: "/tasks" as const,
    icon: ListTodo,
    title: "Tasks",
    body: "Track work and follow progress across your projects.",
    badge: "Workspace",
  },
  {
    to: "/projects" as const,
    icon: Layers,
    title: "Projects",
    body: "Organize tasks, agents, and resources around your work.",
    badge: "Work",
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
        { count: connCount },
        { count: toolkitCount },
        { count: resourceCount },
      ] = await Promise.all([
        supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle(),
        supabase
          .from("app_connections")
          .select("id", { count: "exact", head: true })
          .eq("status", "connected"),
        supabase.from("toolkits").select("id", { count: "exact", head: true }),
        supabase
          .from("resources")
          .select("id", { count: "exact", head: true })
          .eq("published", true),
      ]);
      return {
        email: userData.user?.email ?? "",
        displayName: profileRow?.display_name ?? "",
        avatarUrl: profileRow?.avatar_url ?? null,
        connections: connCount ?? 0,
        toolkits: toolkitCount ?? 0,
        resources: resourceCount ?? 0,
      };
    },
  });

  const stats = [
    { icon: Layers, label: "Toolkits", value: profile?.toolkits ?? 0, to: "/toolkits" as const },
    {
      icon: Plug,
      label: "Connections",
      value: profile?.connections ?? 0,
      to: "/connections" as const,
    },
    {
      icon: Boxes,
      label: "Marketplace",
      value: profile?.resources ?? 0,
      to: "/resources" as const,
    },
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
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats
          .filter((stat) => stat.to !== "/toolkits" || can("manage_toolkits"))
          .map((stat) => (
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

      <p className="mt-6 text-sm text-muted-foreground">
        Open your user menu at the bottom of the sidebar for organizations and workspaces, API keys
        & MCP, credentials, settings, and administration available to your role.
      </p>

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
    </div>
  );
}
