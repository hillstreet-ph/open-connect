import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  Boxes,
  Building2,
  Database,
  FileCode,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Lock,
  Plug,
  Settings,
  Shield,
  Sparkles,
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
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { roleLabel } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

const PLATFORM: Item[] = [
  { to: "/dashboard", label: "Hub", icon: LayoutDashboard },
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/orgs", label: "Organizations", icon: Building2 },
];

const CATALOG: Item[] = [
  { to: "/resources", label: "Marketplace", icon: Boxes },
  { to: "/agents", label: "AI agents", icon: Bot },
  { to: "/models", label: "Models", icon: Sparkles },
  { to: "/toolkits", label: "Toolkits", icon: Wrench },
];

const CONNECT: Item[] = [
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/connections", label: "Connectors & plugins", icon: Plug },
  { to: "/api-keys", label: "API keys", icon: KeyRound },
  { to: "/secrets", label: "Secrets", icon: Lock },
];

const ADMIN: Item[] = [
  { to: "/roles", label: "Roles & access", icon: Shield },
  { to: "/guides", label: "Setup", icon: FileCode },
  { to: "/settings", label: "Settings", icon: Settings },
];

const DATA: Item[] = [
  { to: "/resources", label: "Packages", icon: HardDrive },
  { to: "/secrets", label: "Vault", icon: Database },
];

function NavGroup({ label, items, pathname }: { label: string; items: Item[]; pathname: string }) {
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
              <SidebarMenuItem key={item.to + item.label}>
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
  const { primary } = useRoles();
  const email = user?.email ?? "";
  const initial = (email[0] ?? "U").toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-1 border-b border-sidebar-border px-3 py-3">
        <Link to="/dashboard" className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-sidebar-accent">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-glow">
            <Plug className="size-4" />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate font-display text-sm font-semibold tracking-tight">
              Open-Connect
            </span>
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              Workspace ops
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        <NavGroup label="Platform" items={PLATFORM} pathname={pathname} />
        <NavGroup label="Catalog" items={CATALOG} pathname={pathname} />
        <NavGroup label="Connect" items={CONNECT} pathname={pathname} />
        <NavGroup label="Data" items={DATA} pathname={pathname} />
        <NavGroup label="Administration" items={ADMIN} pathname={pathname} />
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
