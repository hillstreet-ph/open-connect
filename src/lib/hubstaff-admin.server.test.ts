import { afterEach, describe, expect, it, vi } from "vitest";
import { hubstaffAdminConfig, hubstaffAdminRequest } from "./hubstaff-admin.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Hubstaff Admin API", () => {
  it("uses the durable credential broker", () => {
    expect(hubstaffAdminConfig()).toMatchObject({
      configured: true,
      credential: "hubstaff_admin_refresh_token",
    });
  });

  it("rejects paths outside Hubstaff v2", async () => {
    await expect(hubstaffAdminRequest({ path: "https://example.com" })).rejects.toThrow(
      "Invalid Hubstaff API path",
    );
  });
});
