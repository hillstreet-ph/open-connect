import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  Boxes,
  CalendarClock,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  Plug,
  Sparkles,
  Workflow,
  Wrench,
  FileCode,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel, type Capability } from "@/lib/rbac";
import { BrandLogoMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";

type Item = { capability?: Capability; to: string; label: string; icon: React.ComponentType<{ className?: string }> };

/**
 * Primary IA (locked):
 * Dashboard → Projects → Work → Build → Marketplace → Connections →
 * AI Gateway → Developer. Settings live in the logo/account menu.
 *
 * Organization is a switcher, not a daily top-level work item.
 * System administration appears once for privileged roles in the shared menu.
 */

const PRIMARY: Item[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
];

const WORK: Item[] = [
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/automations", label: "Automations", icon: Workflow },
  { to: "/schedule", label: "Schedules", icon: CalendarClock },
];

const BUILD: Item[] = [
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/agents", label: "Agents", icon: Bot },
  { capability: "manage_toolkits", to: "/toolkits", label: "Toolkits", icon: Wrench },
];

const DISCOVER: Item[] = [
  { to: "/resources", label: "Marketplace", icon: Boxes },
];

const CONNECT: Item[] = [
  { to: "/connections", label: "Connections", icon: Plug },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/models", label: "AI Gateway", icon: Sparkles },
];

const DEVELOPER: Item[] = [
  { to: "/api-keys", label: "API & MCP", icon: KeyRound },
  { to: "/guides", label: "Guides", icon: FileCode },
];

function NavGroup({ label, items, pathname }: { label: string; items: Item[]; pathname: string }) {
  if (!items.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/50">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <SidebarMenuItem key={label + item.to + item.label}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <Link to={item.to}>
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { primary, can } = useRoles();
  const email = user?.email ?? "";
  const initial = (email[0] ?? "M").toUpperCase();
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-1 border-b border-sidebar-border px-3 py-3">
        <BrandLogoMenu />
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        <NavGroup label="" items={PRIMARY} pathname={pathname} />
        <NavGroup label="Work" items={WORK} pathname={pathname} />
        <NavGroup label="Build" items={BUILD.filter((item) => !item.capability || can(item.capability))} pathname={pathname} />
        <NavGroup label="Discover" items={DISCOVER} pathname={pathname} />
        <NavGroup label="Connect" items={CONNECT} pathname={pathname} />
        <NavGroup label="Developer" items={DEVELOPER} pathname={pathname} />
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary",
            )}
          >
            {initial}
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-xs font-medium">{email || "Signed in"}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {roleLabel(primary)}
            </p>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
