import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo } from "react";
import { getCanonicalOrganization, listWorkspaces } from "@/lib/orgs.functions";
import { useWorkspaceContext } from "@/hooks/use-workspace-context";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function WorkspaceSwitcher() {
  const listWs = useServerFn(listWorkspaces);
  const getOrganization = useServerFn(getCanonicalOrganization);
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
    if (rows[0]?.id && !rows.some((workspace) => workspace.id === workspaceId)) {
      setWorkspaceId(rows[0].id);
    }
  }, [rows, setWorkspaceId, workspaceId]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild aria-label="Open HillStreet workspace projects">
          <Link to="/projects">
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
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
