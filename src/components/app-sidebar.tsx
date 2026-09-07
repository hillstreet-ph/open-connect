import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  Boxes,
  Building2,
  CalendarClock,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  Lock,
  Plug,
  Settings,
  Shield,
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
import { roleLabel, hasRole, type AppRole } from "@/lib/rbac";
import { appRoleToOrgRole, ORG_ROLE_LABEL } from "@/lib/identity";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

/** Member Workspace — default surface for every signed-in human */
const MEMBER_WORKSPACE: Item[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/resources", label: "Marketplace", icon: Boxes },
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/models", label: "Models", icon: Sparkles },
  { to: "/toolkits", label: "Toolkits", icon: Wrench },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/connections", label: "Connections", icon: Plug },
  { to: "/api-keys", label: "My API keys", icon: KeyRound },
  { to: "/guides", label: "Guides", icon: FileCode },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** Admin Console — org Admin / Owner (platform admin+) */
const ADMIN_CONSOLE: Item[] = [
  { to: "/orgs", label: "Organization", icon: Building2 },
  { to: "/projects", label: "Projects & access", icon: FolderKanban },
  { to: "/roles", label: "Roles & scopes", icon: Shield },
  { to: "/resources", label: "Resource registry", icon: Boxes },
  { to: "/secrets", label: "Vault metadata", icon: Lock },
  { to: "/tasks", label: "Operations · tasks", icon: ListTodo },
  { to: "/schedule", label: "Scheduled", icon: CalendarClock },
  { to: "/automations", label: "Automations", icon: Workflow },
  { to: "/models", label: "AI Gateway", icon: Sparkles },
];

/** Owner Console — ownership / governance (platform owner) */
const OWNER_CONSOLE: Item[] = [
  { to: "/roles", label: "Ownership & policies", icon: Shield },
  { to: "/orgs", label: "Org governance", icon: Building2 },
  { to: "/secrets", label: "Credential governance", icon: Lock },
  { to: "/settings", label: "Global security", icon: Settings },
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
  const { primary, roles } = useRoles();
  const email = user?.email ?? "";
  const initial = (email[0] ?? "M").toUpperCase();
  const orgLabel = ORG_ROLE_LABEL[appRoleToOrgRole(primary)];

  const showAdmin = hasRole(roles as AppRole[], "admin");
  const showOwner = hasRole(roles as AppRole[], "owner");

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-1 border-b border-sidebar-border px-3 py-3">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-sidebar-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-glow">
            <Plug className="size-4" />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate font-display text-sm font-semibold tracking-tight">
              Open-Connect
            </span>
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              {showOwner ? "Owner · Admin · Member" : showAdmin ? "Admin · Member" : "Member workspace"}
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        <NavGroup label="Member Workspace" items={MEMBER_WORKSPACE} pathname={pathname} />
        {showAdmin ? (
          <NavGroup label="Admin Console" items={ADMIN_CONSOLE} pathname={pathname} />
        ) : null}
        {showOwner ? (
          <NavGroup label="Owner Console" items={OWNER_CONSOLE} pathname={pathname} />
        ) : null}
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
              {orgLabel} · {roleLabel(primary)}
            </p>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
