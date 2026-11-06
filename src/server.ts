import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getMtlsMode, mtlsMetadataFields } from "./lib/mtls.server";
import { OAUTH_SCOPES_SUPPORTED } from "./lib/oauth.server";
import { TOKEN_ENDPOINT_AUTH_METHODS } from "./lib/oauth-client-auth";
import { runWithRuntimeEnv } from "./lib/runtime-env.server";
import { aiGatewayMetadata, llmsTxt } from "./lib/ai-gateway-discovery";
import { isRosterPath, rosterPageCandidates } from "./lib/ai-factory-roster-assets";

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
    token_endpoint_auth_methods_supported: [...TOKEN_ENDPOINT_AUTH_METHODS],
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

  if (path === "/.well-known/ai-gateway") {
    return jsonResponse(aiGatewayMetadata(ISSUER));
  }

  if (path === "/llms.txt") {
    return new Response(llmsTxt(ISSUER), {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
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
 * Serve the AI Factory roster's static pages from the asset layer.
 *
 * The roster is a self-contained static site shipped under
 * `/ai-factory/roster/`. Only exact file paths resolve on their own, so the
 * extensionless URL for each page (`/ai-factory/roster/teams`) reached the app
 * router and 404'd. Resolving the page file here gives every roster page real
 * HTML at its own URL while leaving every non-roster path to the SPA.
 *
 * Returns `null` when the request is not a roster page or when no page file
 * matches, so the caller falls through to normal routing untouched.
 */
async function handleRosterAsset(request: Request, env: unknown): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const url = new URL(request.url);
  if (!isRosterPath(url.pathname)) return null;

  const candidates = rosterPageCandidates(url.pathname);
  if (candidates.length === 0) return null;

  const assets = (env as { ASSETS?: { fetch: (request: Request) => Promise<Response> } })?.ASSETS;
  if (!assets) return null;

  for (const candidate of candidates) {
    let response = await assets.fetch(
      new Request(new URL(candidate, url.origin).toString(), request),
    );
    // The asset layer redirects `/page.html` to `/page`; follow that once so the
    // explicit-.html form (old bookmarks) serves the page too.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) continue;
      response = await assets.fetch(new Request(new URL(location, url.origin).toString(), request));
    }
    if (response.status === 200) return response;
  }

  return null;
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

        const rosterAsset = await handleRosterAsset(request, env);
        if (rosterAsset) return rosterAsset;

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
