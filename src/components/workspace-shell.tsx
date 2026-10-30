import { workspaceBackTarget } from "@/lib/back-navigation";
import { BackButton } from "@/components/back-button";
import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { WorkspaceSearch } from "@/components/workspace-search";
import { flatAppNav } from "@/lib/nav";
import { AgentHelper } from "@/components/agent-helper";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  const { primary } = useRoles();
  const title = pageTitle(pathname);
  const backTarget = workspaceBackTarget(pathname, hash);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-dvh w-full overflow-hidden" data-shell="app-ops">
        <AppSidebar />
        <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
          <header className="relative z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-border/80 bg-background px-3 sm:gap-3 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <BackButton target={backTarget} />
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
            <Link
              to="/settings"
              className="shrink-0 rounded-md px-2 py-2 text-xs font-medium hover:bg-accent focus-visible:outline focus-visible:outline-2"
              title="Open your account settings"
            >
              Settings
            </Link>
            <WorkspaceSearch />
          </header>
          <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain pb-[max(5rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </SidebarInset>
      </div>
      <AgentHelper />
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
    "/integrations": "Integrations",
    "/project-access": "Project access",
    "/custom-oauth-callback": "App authorization",
    "/api-keys": "API keys",
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
