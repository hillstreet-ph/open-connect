import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getMtlsMode, mtlsMetadataFields } from "./lib/mtls.server";

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

function injectCloudflareEnv(env: unknown) {
  if (!env || typeof env !== "object") return;
  const record = env as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && value.length > 0) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
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
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    ...mtlsMetadataFields(mtlsEnabled),
    scopes_supported: [
      "mcp:connect",
      "models:read",
      "models:invoke",
      "resources:read",
      "openid",
    ],
    service_documentation: `${ISSUER}/models`,
  };
}

function oauthProtectedResourceMetadata(resource: string) {
  return {
    resource,
    authorization_servers: [ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp:connect", "models:read", "models:invoke", "resources:read"],
    resource_documentation: `${ISSUER}/models`,
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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      injectCloudflareEnv(env);

      const wellKnown = handleWellKnown(request);
      if (wellKnown) return wellKnown;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
