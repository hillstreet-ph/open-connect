import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCloudWorkspaceToolAllowed } from "@/lib/cloud-workspace-policy";

const connectionInput = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

export const discoverCloudTools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(connectionInput)
  .handler(async ({ data, context }) => {
    const { listCustomMcpTools } = await import("@/lib/custom-mcp.server");
    const catalog = await listCustomMcpTools(context.userId, data.connectionId, data.projectId);
    return {
      tools: catalog.tools.map((tool) => ({
        name: String(tool["name"] ?? ""),
        description: String(tool["description"] ?? ""),
        inputSchema: JSON.stringify(tool["inputSchema"] ?? {}, null, 2),
        destructive:
          (tool["annotations"] as Record<string, unknown> | undefined)?.["destructiveHint"] ===
          true,
      })),
    };
  });

export const runCloudTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    connectionInput.extend({
      toolName: z.string().min(1).max(256),
      arguments: z.record(z.string(), z.unknown()),
      confirm: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    const { callCustomMcpTool } = await import("@/lib/custom-mcp.server");
    return {
      result: JSON.stringify(
        await callCustomMcpTool(
          context.userId,
          data.connectionId,
          data.toolName,
          data.arguments,
          data.projectId,
          (connection, tool) => {
            const annotations = (tool["annotations"] ?? {}) as Record<string, unknown>;
            assertCloudWorkspaceToolAllowed(connection.provider, annotations);
            if (annotations["destructiveHint"] === true && !data.confirm) {
              throw new Error("Confirm the destructive operation before running this tool.");
            }
          },
        ),
        null,
        2,
      ),
    };
  });
