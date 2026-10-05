import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { listCustomMcpTools, callCustomMcpTool } = await import("@/lib/custom-mcp.server");
    const catalog = await listCustomMcpTools(context.userId, data.connectionId, data.projectId);
    const tool = catalog.tools.find((item) => item["name"] === data.toolName);
    if (!tool) throw new Error("Tool is no longer available. Refresh the connection.");
    const annotations = (tool["annotations"] ?? {}) as Record<string, unknown>;
    if (annotations["destructiveHint"] === true && !data.confirm) {
      throw new Error("Confirm the destructive operation before running this tool.");
    }
    return {
      result: JSON.stringify(
        await callCustomMcpTool(
          context.userId,
          data.connectionId,
          data.toolName,
          data.arguments,
          data.projectId,
        ),
        null,
        2,
      ),
    };
  });
