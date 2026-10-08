import { afterEach, describe, expect, it, vi } from "vitest";
import { hubstaffAdminConfig, hubstaffAdminRequest } from "./hubstaff-admin.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Hubstaff Admin API", () => {
  it("advertises the canonical connection provider and legacy fallback", () => {
    expect(hubstaffAdminConfig()).toMatchObject({
      configured: true,
      provider: "hubstaff_admin",
      credential: "hubstaff_admin_refresh_token",
    });
  });

  it("rejects paths outside Hubstaff v2 before resolving credentials", async () => {
    await expect(
      hubstaffAdminRequest("user-1", { path: "https://example.com" }),
    ).rejects.toThrow("Invalid Hubstaff API path");
  });

  it("uses a connected organization token directly as the bearer credential", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer hsoat_test_value");
      return new Response(JSON.stringify({ organizations: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const legacyAccessToken = vi.fn(async () => "legacy-token");

    await expect(
      hubstaffAdminRequest(
        "user-1",
        { method: "GET", path: "/v2/organizations" },
        {
          resolveUserCredential: async () => "hsoat_test_value",
          legacyAccessToken,
          fetch: request,
        },
      ),
    ).resolves.toEqual({ organizations: [] });

    expect(request).toHaveBeenCalledOnce();
    expect(legacyAccessToken).not.toHaveBeenCalled();
  });

  it("keeps the durable refresh-token broker as a fallback", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer legacy-access");
      return new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      hubstaffAdminRequest(
        "user-1",
        { path: "/v2/users/me" },
        {
          resolveUserCredential: async () => null,
          legacyAccessToken: async () => "legacy-access",
          fetch: request,
        },
      ),
    ).resolves.toEqual({ id: 1 });
  });
});
