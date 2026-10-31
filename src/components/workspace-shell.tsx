import { NotificationInbox } from "@/components/notification-inbox";
import { workspaceBackTarget } from "@/lib/back-navigation";
import { BackButton } from "@/components/back-button";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { sidebarDefaultOpen } from "@/lib/sidebar-state";
import { WorkspaceSearch } from "@/components/workspace-search";
import { flatAppNav } from "@/lib/nav";
import { AgentHelper } from "@/components/agent-helper";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  const title = pageTitle(pathname);
  const backTarget = workspaceBackTarget(pathname, hash);

  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen()}>
      <div className="flex h-dvh w-full overflow-hidden" data-shell="app-ops">
        <AppSidebar />
        <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
          <header className="relative z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-border/80 bg-background px-3 sm:gap-3 sm:px-4">
            <SidebarTrigger className="-ml-1" title="Toggle sidebar (Ctrl/⌘ B)" />
            <BackButton target={backTarget} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold tracking-tight sm:text-base">
                {title}
              </p>
            </div>
            <WorkspaceSearch />
            <NotificationInbox />
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
