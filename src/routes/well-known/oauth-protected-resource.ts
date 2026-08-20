import { createFileRoute } from "@tanstack/react-router";
import { protectedResourceMetadata } from "@/lib/oauth.server";

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/.well-known/oauth-protected-resource" as any)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const resource =
          url.searchParams.get("resource") || "https://open-connect.site/mcp";
        return json(protectedResourceMetadata(resource));
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, OPTIONS",
          },
        }),
    },
  },
});
