import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Product workspace boundary — Claude Design ops layout:
 * left sidebar · top context bar · main content.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthenticatedShell,
});

function AuthenticatedShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { primary } = useRoles();
  const title = pageTitle(pathname);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-[calc(100dvh-3.5rem)] w-full" data-shell="app-ops">
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border/80 bg-background/95 px-3 backdrop-blur sm:h-14 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold tracking-tight sm:text-base">
                {title}
              </p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                Capability matrix · scoped keys · org workspace
              </p>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline" className="text-[10px] uppercase">
                {roleLabel(primary)}
              </Badge>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search"
                  className="h-8 w-40 bg-muted/40 pl-8 text-xs lg:w-52"
                  readOnly
                  aria-label="Search workspace"
                />
              </div>
              <Link
                to="/roles"
                className="rounded-md border border-border/70 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Roles & access
              </Link>
            </div>
          </header>
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function pageTitle(pathname: string): string {
  const map: Record<string, string> = {
    "/dashboard": "Hub overview",
    "/studio": "Studio",
    "/orgs": "Organizations",
    "/agents": "AI agents",
    "/resources": "Marketplace",
    "/models": "Models",
    "/toolkits": "Toolkits",
    "/integrations": "Integrations",
    "/connections": "Connectors & plugins",
    "/api-keys": "API keys",
    "/secrets": "Secrets",
    "/roles": "Roles & access",
    "/guides": "Professional setup",
    "/settings": "Settings",
    "/admin": "Admin",
  };
  if (map[pathname]) return map[pathname];
  for (const [path, title] of Object.entries(map)) {
    if (pathname.startsWith(path)) return title;
  }
  return "Workspace";
}
