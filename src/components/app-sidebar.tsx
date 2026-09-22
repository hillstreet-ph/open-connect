import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  BookOpen,
  Brain,
  Building2,
  Boxes,
  CalendarClock,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LockKeyhole,
  Plug,
  Sparkles,
  Workflow,
  Wrench,
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
import { useRoles } from "@/hooks/use-roles";
import { type Capability } from "@/lib/rbac";
import { UserMenu } from "@/components/user-menu";

type Item = {
  capability?: Capability;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

/**
 * Primary IA (locked):
 * Dashboard → Organizations → Workspaces → Work → Build → Marketplace → Connections →
 * AI Gateway → Developer. Settings live in the user avatar menu.
 *
 * Organizations manage people and groups; Workspaces manage projects and environments.
 * System administration appears once for privileged roles in the shared menu.
 */

const PRIMARY: Item[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/orgs", label: "Organizations", icon: Building2 },
  { to: "/projects", label: "Workspaces", icon: FolderKanban },
];

const WORK: Item[] = [
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/automations", label: "Automations", icon: Workflow },
  { to: "/schedule", label: "Schedules", icon: CalendarClock },
];

const BUILD: Item[] = [
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen },
  { capability: "manage_toolkits", to: "/toolkits", label: "Toolkits", icon: Wrench },
];

const DISCOVER: Item[] = [{ to: "/resources", label: "Marketplace", icon: Boxes }];

const CONNECT: Item[] = [
  { to: "/connections", label: "Connections", icon: Plug },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/secrets", label: "Credentials", icon: LockKeyhole },
  { to: "/models", label: "AI Gateway", icon: Sparkles },
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
  const { can } = useRoles();
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-1 border-b border-sidebar-border px-3 py-3">
        <Link
          to="/dashboard"
          aria-label="Open Connect dashboard"
          className="flex items-center gap-2 rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-8 shrink-0 items-center justify-center">
            <img
              src="/open-connect-mark.svg"
              alt="Open Connect"
              className="block size-8 object-contain"
            />
          </span>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Open Connect
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        <NavGroup label="" items={PRIMARY} pathname={pathname} />
        <NavGroup label="Work" items={WORK} pathname={pathname} />
        <NavGroup
          label="Build"
          items={BUILD.filter((item) => !item.capability || can(item.capability))}
          pathname={pathname}
        />
        <NavGroup label="Discover" items={DISCOVER} pathname={pathname} />
        <NavGroup label="Connect" items={CONNECT} pathname={pathname} />
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <UserMenu sidebar />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
