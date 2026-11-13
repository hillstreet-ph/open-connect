import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { hubstaffAdminConfig, hubstaffAdminRequest } from "./hubstaff-admin.server.ts";

describe("Hubstaff Admin API", () => {
  it("advertises the canonical connection provider and legacy fallback", () => {
    const config = hubstaffAdminConfig();
    assert.equal(config.configured, true);
    assert.equal(config.provider, "hubstaff_admin");
    assert.equal(config.credential, "hubstaff_admin_refresh_token");
  });
  it("rejects paths outside Hubstaff v2 before resolving credentials", async () => {
    await assert.rejects(
      hubstaffAdminRequest("user-1", { path: "https://example.com" }),
      /Invalid Hubstaff API path/,
    );
  });
  it("uses a connected organization token directly as the bearer credential", async () => {
    const request = mock.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer hsoat_test_value");
      return Response.json({ organizations: [] });
    });
    const legacyAccessToken = mock.fn(async () => "legacy-token");
    const result = await hubstaffAdminRequest(
      "user-1",
      { method: "GET", path: "/v2/organizations" },
      {
        resolveUserCredential: async () => "hsoat_test_value",
        legacyAccessToken,
        fetch: request,
      },
    );
    assert.deepEqual(result, { organizations: [] });
    assert.equal(request.mock.callCount(), 1);
    assert.equal(legacyAccessToken.mock.callCount(), 0);
  });
  it("keeps the durable refresh-token broker as a fallback", async () => {
    const request = mock.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer legacy-access");
      return Response.json({ id: 1 });
    });
    assert.deepEqual(
      await hubstaffAdminRequest(
        "user-1",
        { path: "/v2/users/me" },
        {
          resolveUserCredential: async () => null,
          legacyAccessToken: async () => "legacy-access",
          fetch: request,
        },
      ),
      { id: 1 },
    );
  });
});
