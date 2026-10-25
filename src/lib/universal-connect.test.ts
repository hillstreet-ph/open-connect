import { websiteText } from "./website-text.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { oauthProvider, type OAuthBundle } from "./custom-oauth.server.ts";
import { openApiOperations } from "./openapi-connector.ts";
import { withMcpClient } from "./mcp-client.server.ts";
import { publicFetch, boundedWorkerFetch } from "./public-fetch.server.ts";
import { planBulkReview } from "./resource-review-bulk.ts";

test("OpenAPI detects operation schemas and write/destructive annotations", () => {
  const result = openApiOperations({
    openapi: "3.1.0",
    info: { title: "Orders" },
    servers: [{ url: "https://api.example.com/v1" }],
    paths: {
      "/orders/{id}": {
        get: {
          operationId: "read_order",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        },
        delete: {
          operationId: "delete_order",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        },
      },
    },
  });
  assert.equal(result.tools.length, 2);
  assert.equal(result.tools[0]?.annotations.readOnlyHint, true);
  assert.equal(result.tools[1]?.annotations.destructiveHint, true);
  assert.deepEqual(result.tools[0]?.inputSchema["required"], ["id"]);
  assert.throws(() =>
    openApiOperations({ openapi: "3.0.0", servers: [{ url: "https://127.0.0.1" }], paths: {} }),
  );
});
test("OAuth discovers/registers a client and exchanges a PKCE-bound code", async () => {
  const bundle: OAuthBundle = { endpoint: "https://mcp.example/mcp", transport: "http" };
  let redirected: URL | undefined;
  const provider = oauthProvider(
    bundle,
    "fixture-state",
    "https://open-connect.site/custom-oauth-callback",
    (url) => {
      redirected = url;
    },
  );
  const send = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("oauth-protected-resource"))
      return Response.json({
        resource: bundle.endpoint,
        authorization_servers: ["https://auth.example"],
        scopes_supported: ["read"],
      });
    if (url.includes("oauth-authorization-server"))
      return Response.json({
        issuer: "https://auth.example",
        authorization_endpoint: "https://auth.example/authorize",
        token_endpoint: "https://auth.example/token",
        registration_endpoint: "https://auth.example/register",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    if (url.endsWith("/register"))
      return Response.json({
        client_id: "fixture-client",
        redirect_uris: [provider.redirectUrl],
        token_endpoint_auth_method: "none",
      });
    if (url.endsWith("/token")) {
      assert.equal(new URLSearchParams(String(init?.body)).get("code_verifier"), bundle.verifier);
      return Response.json({
        access_token: "fixture-access",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "fixture-refresh",
        scope: "read",
      });
    }
    throw new Error("Unexpected OAuth request");
  };
  assert.equal(await auth(provider, { serverUrl: bundle.endpoint, fetchFn: send }), "REDIRECT");
  assert.equal(redirected?.searchParams.get("state"), "fixture-state");
  assert.equal(redirected?.searchParams.get("code_challenge_method"), "S256");
  assert.ok(bundle.verifier);
  assert.ok(!redirected?.href.includes(bundle.verifier));
  assert.equal(
    await auth(provider, {
      serverUrl: bundle.endpoint,
      authorizationCode: "fixture-code",
      fetchFn: send,
    }),
    "AUTHORIZED",
  );
  assert.equal(bundle.tokens?.access_token, "fixture-access");
  assert.equal(bundle.tokens?.issuer, "https://auth.example");
  assert.ok(bundle.expires_at! > Date.now());
});
test("SSE transport initializes and discovers tools through a same-origin message endpoint", async () => {
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  const send: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    assert.equal(new Headers(init?.headers).get("X-API-Key"), "fixture-key");
    if (url.pathname === "/sse") {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
            controller.enqueue(encoder.encode("event: endpoint\ndata: /messages\n\n"));
          },
          cancel() {
            stream = undefined;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    const msg = JSON.parse(String(init?.body));
    if (msg.id !== undefined) {
      const result =
        msg.method === "initialize"
          ? {
              protocolVersion: "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "SSE fixture", version: "1" },
            }
          : { tools: [{ name: "read_fixture", inputSchema: { type: "object" } }] };
      stream?.enqueue(
        encoder.encode(
          `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })}\n\n`,
        ),
      );
    }
    return new Response(null, { status: 202 });
  };
  const tools = await withMcpClient(
    "https://mcp.example/sse",
    { "X-API-Key": "fixture-key" },
    (client) => client.listTools(),
    send,
    "sse",
  );
  assert.equal(tools.tools[0]?.name, "read_fixture");
});
test("public imports reject private networks and unencrypted endpoints before I/O", async () => {
  await assert.rejects(publicFetch("http://example.com"));
  await assert.rejects(publicFetch("https://127.0.0.1/"));
  await assert.rejects(publicFetch("https://localhost/"));
  await assert.rejects(publicFetch("https://example.com:8443/"));
});
test("blocked scans cannot be bulk verified or published", () => {
  const rows = [
    {
      id: "one",
      verified: false,
      published: false,
      installation_config: { scan_report: { state: "blocked" } },
    },
  ];
  for (const action of ["verify", "publish", "verify_publish"] as const) {
    const result = planBulkReview(rows, action);
    assert.deepEqual(result.apply, []);
    assert.equal(result.skipped[0]?.reason, "scan_blocked");
  }
});

test("Worker fetch bounds responses and never enables redirect following", async () => {
  let redirect: RequestRedirect | undefined;
  const response = await boundedWorkerFetch(
    new URL("https://example.com/schema.json"),
    {},
    async (_url, init) => {
      redirect = init?.redirect;
      return Response.json({ ok: true });
    },
  );
  assert.equal(redirect, "manual");
  assert.deepEqual(await response.json(), { ok: true });
  await assert.rejects(
    () =>
      boundedWorkerFetch(
        new URL("https://example.com"),
        {},
        async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1)),
      ),
    /exceeds/,
  );
});
test("OpenAPI rejects missing path parameters and supports path-level parameters", () => {
  const base = { openapi: "3.1.0", servers: [{ url: "https://api.example.com" }] };
  assert.throws(
    () =>
      openApiOperations({ ...base, paths: { "/items/{id}": { get: { operationId: "read" } } } }),
    /placeholder/,
  );
  const result = openApiOperations({
    ...base,
    paths: {
      "/items/{id}": {
        parameters: [{ name: "id", in: "path", schema: { type: "string" } }],
        get: { operationId: "read" },
      },
    },
  });
  assert.deepEqual(result.tools[0]?.inputSchema["required"], ["id"]);
});

test("website extraction never emits HTML, including malformed nested tag input", () => {
  const doc = websiteText(
    "<html><title>Example</title><body><script>alert(1)</script><p>Hello &lt;script&gt;</p><scr<script>ipt>bad</body></html>",
  );
  assert.ok(doc.startsWith("# Example"));
  assert.ok(doc.includes("Hello"));
  assert.ok(!doc.includes("alert(1)"));
  assert.ok(!/[<>]/.test(doc));
  assert.ok(doc.includes("&amp;lt;script&amp;gt;"));
});
