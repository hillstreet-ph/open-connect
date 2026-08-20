import { createFileRoute } from "@tanstack/react-router";
import { json, resolveUpstream } from "@/lib/gateway.server";

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

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
          env: {
            SUPABASE_URL: present("SUPABASE_URL"),
            SUPABASE_PUBLISHABLE_KEY: present("SUPABASE_PUBLISHABLE_KEY"),
            SUPABASE_SERVICE_ROLE_KEY: present("SUPABASE_SERVICE_ROLE_KEY"),
            VITE_SUPABASE_URL: present("VITE_SUPABASE_URL"),
            VITE_SUPABASE_PUBLISHABLE_KEY: present("VITE_SUPABASE_PUBLISHABLE_KEY"),
            VITE_APP_URL: present("VITE_APP_URL"),
            LITELLM_BASE_URL: present("LITELLM_BASE_URL"),
            LITELLM_MASTER_KEY: present("LITELLM_MASTER_KEY"),
          },
          time: new Date().toISOString(),
        });
      },
    },
  },
});
