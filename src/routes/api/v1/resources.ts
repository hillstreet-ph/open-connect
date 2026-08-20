import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateKey,
  gatewayError,
  hasScope,
  json,
  logGatewayRequest,
} from "@/lib/gateway.server";

export const Route = createFileRoute("/api/v1/resources")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = await authenticateKey(request);
        if (!key) return gatewayError("Missing or invalid Open-Connect key.", 401, "invalid_api_key");
        if (!hasScope(key, "resources:read") && !hasScope(key, "models:read")) {
          return gatewayError("Key is missing resources:read scope.", 403, "insufficient_scope");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("resources")
          .select("id, slug, name, description, resource_type, category_slug, verified, featured")
          .eq("published", true)
          .order("featured", { ascending: false })
          .order("name")
          .limit(100);

        if (error) return gatewayError(error.message, 500, "db_error");

        await logGatewayRequest({
          key,
          endpoint: "/api/v1/resources",
          statusCode: 200,
          upstream: "supabase",
        });

        return json({ data: data ?? [] });
      },
    },
  },
});