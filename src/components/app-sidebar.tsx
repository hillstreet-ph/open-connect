import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  BookOpen,
  Brain,
  Boxes,
  CalendarClock,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LockKeyhole,
  Plug,
  Sparkles,
  ScrollText,
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
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

type Item = {
  capability?: Capability;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

/**
 * Primary IA (locked):
 * Workspace switcher → Dashboard → Workspaces → Work → Build → Marketplace → Connections →
 * AI Gateway. Integrations, API keys, and settings live in the user avatar menu.
 *
 * Organization settings live in the user menu; workspaces manage projects and environments.
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
  { to: "/skills", label: "Skills", icon: Wrench },
  { to: "/prompts", label: "Prompts", icon: ScrollText },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen },
  { capability: "manage_toolkits", to: "/toolkits", label: "Toolkits", icon: Wrench },
];

const DISCOVER: Item[] = [{ to: "/resources", label: "Marketplace", icon: Boxes }];

const CONNECT: Item[] = [
  { to: "/connections", label: "Connections", icon: Plug },
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
      <SidebarHeader className="gap-1 border-b border-sidebar-border px-2 py-2">
        <WorkspaceSwitcher />
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
