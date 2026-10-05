import { Link, useRouterState } from "@tanstack/react-router";
import {
  Monitor,
  Globe,
  Terminal,
  Smartphone,
  Boxes,
  CalendarClock,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LockKeyhole,
  Plug,
  Sparkles,
  Workflow,
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
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

type Item = {
  capability?: Capability;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

/**
 * Primary IA (locked):
 * Workspace switcher → Dashboard → Projects → Work → Marketplace/Resources → Cloud → Connections.
 * Resource types and Memory/Knowledge are organized inside Resources; Integrations are in Settings.
 *
 * Organization settings live in the user menu; workspaces manage projects and environments.
 * System administration appears once for privileged roles in the shared menu.
 */

const PRIMARY: Item[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
];

const WORK: Item[] = [
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/tasks", label: "Task", icon: ListTodo },
  { to: "/schedule", label: "Schedules", icon: CalendarClock },
  { to: "/automations", label: "Automations", icon: Workflow },
];

const CLOUD: Item[] = [
  { to: "/cloud-phone", label: "Cloud Phone", icon: Smartphone },
  { to: "/cloud-browser", label: "Cloud Browser", icon: Globe },
  { to: "/cloud-terminal", label: "Cloud Terminal", icon: Terminal },
  { to: "/cloud-computer", label: "Cloud Computer", icon: Monitor },
];

const DISCOVER: Item[] = [
  { to: "/resources", label: "Marketplace", icon: Boxes },
  { to: "/library", label: "Resources", icon: Boxes },
];

const CONNECTIONS: Item[] = [
  { to: "/connections", label: "Connectors", icon: Plug },
  { to: "/secrets", label: "Credentials", icon: LockKeyhole },
  { to: "/models", label: "AI Gateway", icon: Sparkles },
];

function NavGroup({ label, items, pathname }: { label: string; items: Item[]; pathname: string }) {
  if (!items.length) return null;
  return (
    <SidebarGroup className="py-1">
      {label ? (
        <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/50">
          {label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <SidebarMenuItem key={label + item.to + item.label}>
                <SidebarMenuButton
                  asChild
                  className="h-8 text-xs"
                  isActive={active}
                  tooltip={item.label}
                >
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
      <SidebarHeader className="gap-1 border-b border-sidebar-border px-2 py-2">
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1 py-1">
        <NavGroup label="" items={PRIMARY} pathname={pathname} />
        <NavGroup label="Work" items={WORK} pathname={pathname} />
        <NavGroup
          label="Discover"
          items={DISCOVER.filter((item) => !item.capability || can(item.capability))}
          pathname={pathname}
        />
        <NavGroup label="Cloud" items={CLOUD} pathname={pathname} />
        <NavGroup label="Connections" items={CONNECTIONS} pathname={pathname} />
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <UserMenu sidebar />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
