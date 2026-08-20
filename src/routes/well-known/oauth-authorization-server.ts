import { createFileRoute } from "@tanstack/react-router";
import { oauthMetadata } from "@/lib/oauth.server";

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

// Path must be /.well-known/... for ChatGPT / MCP discovery
export const Route = createFileRoute("/.well-known/oauth-authorization-server" as any)({
  server: {
    handlers: {
      GET: async () => json(oauthMetadata()),
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
