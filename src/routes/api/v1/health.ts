import { createFileRoute } from "@tanstack/react-router";
import { json, resolveUpstream } from "@/lib/gateway.server";

export const Route = createFileRoute("/api/v1/health")({
  server: {
    handlers: {
      GET: async () => {
        const upstream = resolveUpstream();
        return json({
          status: "ok",
          service: "open-connect",
          domain: "open-connect.site",
          surfaces: {
            mcp: "/mcp",
            models: "/v1",
            api: "/api/v1",
            oauth: "/oauth",
          },
          model_upstream: upstream?.name ?? null,
          time: new Date().toISOString(),
        });
      },
    },
  },
});
