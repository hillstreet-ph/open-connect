import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { WorkspaceSearch } from "@/components/workspace-search";
import { flatAppNav } from "@/lib/nav";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { primary } = useRoles();
  const title = pageTitle(pathname);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-dvh w-full" data-shell="app-ops">
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border/80 bg-background/95 px-3 backdrop-blur sm:h-14 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold tracking-tight sm:text-base">
                {title}
              </p>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline" className="text-[10px] uppercase">
                {roleLabel(primary)}
              </Badge>
            </div>
            <WorkspaceSearch />
          </header>
          <div className="flex-1 overflow-auto">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function pageTitle(pathname: string): string {
  const canonical = flatAppNav().find(
    (item) => pathname === item.to || pathname.startsWith(item.to + "/"),
  );
  if (canonical) return canonical.label;
  const map: Record<string, string> = {
    "/campaign-studio": "Campaign Studio",
    "/orgs": "Organization",
    "/integrations": "Integrations",
    "/api-keys": "API keys",
    "/roles": "Access reference",
    "/guides": "Professional setup",
    "/settings": "Settings",
    "/admin": "System administration",
  };
  if (map[pathname]) return map[pathname];
  for (const [path, title] of Object.entries(map)) {
    if (pathname.startsWith(path + "/")) return title;
  }
  return "Workspace";
}
