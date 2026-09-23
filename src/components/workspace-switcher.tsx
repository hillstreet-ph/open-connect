import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, GalleryVerticalEnd } from "lucide-react";
import { useEffect, useMemo } from "react";
import { getCanonicalOrganization, listWorkspaces } from "@/lib/orgs.functions";
import { useWorkspaceContext } from "@/hooks/use-workspace-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function WorkspaceSwitcher() {
  const listWs = useServerFn(listWorkspaces);
  const getOrganization = useServerFn(getCanonicalOrganization);
  const navigate = useNavigate();
  const { workspaceId, setWorkspaceId } = useWorkspaceContext();
  const organization = useQuery({
    queryKey: ["organization", "hillstreet-ph"],
    queryFn: () => getOrganization(),
  });
  const workspaces = useQuery({
    queryKey: ["workspaces", organization.data?.id],
    queryFn: () => listWs({ data: { organizationId: organization.data!.id } }),
    enabled: Boolean(organization.data?.id),
  });
  const rows = useMemo(() => workspaces.data ?? [], [workspaces.data]);
  const current = rows.find((workspace) => workspace.id === workspaceId) ?? rows[0];

  useEffect(() => {
    if (!workspaceId && rows[0]?.id) setWorkspaceId(rows[0].id);
  }, [rows, setWorkspaceId, workspaceId]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              aria-label="Switch workspace"
            >
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/10">
                <img src="/open-connect-mark.svg" alt="Open Connect" className="size-7" />
              </span>
              <span className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-sm font-semibold">
                  {current?.name ?? "Workspace"}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {organization.data?.name ?? "hillstreet-ph"}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Current workspace
            </DropdownMenuLabel>
            {rows.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onSelect={() => {
                  setWorkspaceId(workspace.id);
                  void navigate({ to: "/projects" });
                }}
              >
                <GalleryVerticalEnd className="mr-2 size-4" />
                <span className="flex-1">{workspace.name}</span>
                {workspace.id === current?.id ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/projects">View all workspaces</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
