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

export const Route = createFileRoute("/.well-known/openid-configuration" as any)({
  server: {
    handlers: {
      GET: async () => json(oauthMetadata()),
    },
  },
});
