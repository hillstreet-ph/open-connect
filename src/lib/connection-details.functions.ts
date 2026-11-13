import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { connectionIdentity } from "@/lib/connection-presentation";
import { isExecutableMcpProvider } from "@/lib/remote-mcp";

export const getConnectionDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ connectionId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: connection, error } = await context.supabase
      .from("app_connections")
      .select("id,provider,status,metadata,credential_reference")
      .eq("id", data.connectionId)
      .eq("user_id", context.userId)
      .single();
    if (error || !connection) throw new Error("Connection not found.");
    const managed = connection.credential_reference?.startsWith("composio://connected-account/");
    let identity = connectionIdentity(connection.metadata);
    let identityNotice = "";
    if (managed) {
      try {
        const { getManagedConnection, getManagedAccountIdentity } =
          await import("@/lib/managed-connectors.server");
        const remote = await getManagedConnection(
          connection.provider,
          connection.credential_reference!.split("/").pop()!,
        );
        let remoteIdentity = connectionIdentity(remote.data);
        if (!remoteIdentity.email && !remoteIdentity.login && !remoteIdentity.name) {
          remoteIdentity =
            (await getManagedAccountIdentity(
              connection.provider,
              connection.credential_reference!.split("/").pop()!,
              remote.user_id || context.userId,
            )) ?? remoteIdentity;
        }
        identity = Object.fromEntries(
          Object.entries(identity).map(([key, value]) => [
            key,
            value || remoteIdentity[key as keyof typeof remoteIdentity],
          ]),
        ) as typeof identity;
      } catch {
        identityNotice = "Provider identity is temporarily unavailable.";
      }
    }
    let tools: Array<{ name: string; description: string }> = [];
    let toolsNotice = "";
    if (connection.status !== "connected")
      toolsNotice = "Reconnect this account to discover tools.";
    else {
      try {
        if (managed) {
          const { listManagedTools } = await import("@/lib/managed-connectors.server");
          const catalog = await listManagedTools(connection.provider);
          tools = catalog.tools;
          toolsNotice = catalog.hasMore
            ? "Provider catalog is partially loaded (discovery limit reached). Account permissions still apply."
            : "Provider catalog tools. Account permissions still apply.";
        } else if (
          isExecutableMcpProvider(connection.provider) ||
          ["twilio", "telegram"].includes(connection.provider)
        ) {
          const { listCustomMcpTools } = await import("@/lib/custom-mcp.server");
          const catalog = await listCustomMcpTools(context.userId, connection.id);
          tools = catalog.tools.map((tool) => ({
            name: String(tool["name"] ?? ""),
            description: String(tool["description"] ?? ""),
          }));
        } else toolsNotice = "Tool discovery is not available for this connector.";
      } catch {
        toolsNotice = "Could not load tools. Refresh to try again.";
      }
    }
    const { readWorkspaceLibrary } = await import("@/lib/workspace-library.server");
    const resources = await readWorkspaceLibrary(context);
    const providerWords = connection.provider.replace(/^custom_/, "").replaceAll("_", " ");
    const related = resources.flatMap((row) => {
      const resource = row.resources;
      if (!resource || !`${resource.name} ${resource.slug}`.toLowerCase().includes(providerWords))
        return [];
      return [
        {
          type: resource.resource_type,
          id: resource.id,
          name: resource.name,
          description: resource.description,
          verified: resource.verified,
        },
      ];
    });
    const skills = related.filter((resource) => resource.type === "skill");
    const toolkits = related.filter((resource) => resource.type === "toolkit");
    return { identity, identityNotice, tools, toolsNotice, skills, toolkits };
  });
