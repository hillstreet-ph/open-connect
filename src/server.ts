import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getMtlsMode, mtlsMetadataFields } from "./lib/mtls.server";
import { OAUTH_SCOPES_SUPPORTED } from "./lib/oauth.server";
import { runWithRuntimeEnv } from "./lib/runtime-env.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

const ISSUER = "https://open-connect.site";

function oauthAuthorizationServerMetadata() {
  const mtlsEnabled = getMtlsMode() !== "off";
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    ...mtlsMetadataFields(mtlsEnabled),
    token_endpoint_auth_methods_supported: ["none"],
    logo_uri: `${ISSUER}/open-connect-mark.png`,
    scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
    service_documentation: `${ISSUER}/integrations`,
  };
}

function oauthProtectedResourceMetadata(resource: string) {
  return {
    resource,
    authorization_servers: [ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
    resource_documentation: `${ISSUER}/integrations`,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

/** Handle OAuth discovery before the SPA so ChatGPT always gets JSON + S256. */
function handleWellKnown(request: Request): Response | null {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS" && path.startsWith("/.well-known")) {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
      },
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") return null;

  if (
    path === "/.well-known/oauth-authorization-server" ||
    path === "/.well-known/openid-configuration" ||
    path === "/.well-known/oauth-authorization-server/mcp"
  ) {
    return jsonResponse(oauthAuthorizationServerMetadata());
  }

  if (
    path === "/.well-known/oauth-protected-resource" ||
    path === "/.well-known/oauth-protected-resource/mcp"
  ) {
    const resource = url.searchParams.get("resource") || `${ISSUER}/mcp`;
    return jsonResponse(oauthProtectedResourceMetadata(resource));
  }

  return null;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Unhandled gateway failures must stay machine-readable. The MCP route dispatches
 * tools whose handlers throw curated, safe Error messages; without this net every
 * such throw surfaced as an HTML 500 page that JSON-RPC clients cannot parse
 * (see #513). MCP and API requests now receive a JSON-RPC error object whose
 * data.message carries the actionable reason. Secrets are never included.
 */
async function structuredFailureResponse(
  request: Request,
  error: unknown,
  rpcBodyClone: Request | null,
): Promise<Response> {
  const url = new URL(request.url);
  const isJsonEndpoint =
    request.method === "POST" &&
    (url.pathname === "/mcp" ||
      url.pathname === "/v1" ||
      url.pathname.startsWith("/v1/") ||
      url.pathname.startsWith("/api/"));
  if (!isJsonEndpoint) {
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  let requestId: string | number | null = null;
  if (rpcBodyClone) {
    try {
      const body = (await rpcBodyClone.json()) as { id?: string | number };
      if (typeof body?.id === "string" || typeof body?.id === "number") requestId = body.id;
    } catch {
      // Body already consumed or not JSON-RPC; id stays null per JSON-RPC 2.0 §5.1.6.1.
    }
  }

  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32603,
        message: "Internal error",
        data: {
          status: "failed",
          code: "gateway_tool_error",
          message:
            error instanceof Error && error.message
              ? error.message.slice(0, 300)
              : "The gateway request failed. Try again.",
          secrets_exposed: false,
        },
      },
    }),
    {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    },
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    const rpcBodyClone =
      request.method === "POST" && url.pathname === "/mcp" ? request.clone() : null;
    try {
      return await runWithRuntimeEnv(env, async () => {
        const wellKnown = handleWellKnown(request);
        if (wellKnown) return wellKnown;

        const handler = await getServerEntry();
        const response = await handler.fetch(request, env, ctx);
        return await normalizeCatastrophicSsrResponse(response);
      });
    } catch (error) {
      console.error(error);
      return structuredFailureResponse(request, error, rpcBodyClone);
    }
  },
};
