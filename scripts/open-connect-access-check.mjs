#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/** Probe the configured control plane once; return metadata, never keys or response bodies. */
export async function checkOpenConnectAccess({
  key,
  requiredScopes = [],
  projectId,
  fetchImpl = fetch,
}) {
  if (!key || !key.startsWith("oc_live_") || key.includes("${")) {
    return { status: "configuration_error", credential_available: false };
  }
  try {
    const response = await fetchImpl("https://open-connect.site/mcp", {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return {
        status: response.status === 401 ? "invalid_or_expired_key" : "gateway_or_transport_denial",
        http_status: response.status,
        response_type: response.headers.get("content-type"),
      };
    }
    const metadata = await response.json();
    if (metadata.authenticated !== true || !Array.isArray(metadata.scopes)) {
      return { status: "invalid_gateway_response" };
    }
    if (projectId && metadata.context?.project_id !== projectId) {
      return { status: "project_boundary_mismatch" };
    }
    const missing = requiredScopes.filter(
      (scope) => !metadata.scopes.includes(scope) && !metadata.scopes.includes("*"),
    );
    return {
      status: missing.length ? "scope_insufficient" : "verified",
      missing_scopes: missing,
      scopes: metadata.scopes,
      project_id: metadata.context?.project_id ?? null,
      access_profile: metadata.context?.access_profile ?? "legacy",
    };
  } catch {
    return { status: "transport_error" };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const requiredScopes = [];
  let projectId;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scope" && args[i + 1]) requiredScopes.push(args[++i]);
    else if (args[i] === "--project-id" && args[i + 1]) projectId = args[++i];
    else throw new Error("Use --scope <permission> or --project-id <id>");
  }
  const result = await checkOpenConnectAccess({
    key: process.env.OPEN_CONNECT_API_KEY,
    requiredScopes,
    projectId,
  });
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "verified" ? 0 : 1;
}
