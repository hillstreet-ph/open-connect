import { describe, expect, test } from "bun:test";
import {
  matchingBrowserKeys,
  reuseBrowserKey,
  type VaultBrowserMetadata,
} from "./browser-vault.server";
const row: VaultBrowserMetadata = {
  id: "owned-id",
  secret_type: "api_key",
  website: "https://cloud.browser-use.com/settings",
  tags: [],
};
describe("automatic browser Vault reuse", () => {
  test("matches exact HTTPS origins or explicit tags, never names, lookalikes or passwords", () => {
    expect(matchingBrowserKeys("browser_use", [row])).toEqual([row]);
    for (const website of [
      "http://cloud.browser-use.com",
      "https://cloud.browser-use.com.evil.test",
      "https://evil.test/browser-use.com",
      "https://cloud.browser-use.com:123",
      "https://user:pass@cloud.browser-use.com",
    ])
      expect(matchingBrowserKeys("browser_use", [{ ...row, website }])).toEqual([]);
    expect(matchingBrowserKeys("browser_use", [{ ...row, secret_type: "password" }])).toEqual([]);
    expect(
      matchingBrowserKeys("browser_use", [{ ...row, tags: ["provider:browserbase"] }]),
    ).toEqual([]);
    expect(
      matchingBrowserKeys("browserbase", [
        { ...row, website: null, tags: ["provider:browserbase"] },
      ]),
    ).toHaveLength(1);
    expect(matchingBrowserKeys("browserbase", [row])).toEqual([]);
  });
  function setup(rows = [row], existing = false, valid = true) {
    const calls: string[] = [];
    return {
      calls,
      dependencies: {
        hasConnection: async () => existing,
        metadata: async () => {
          calls.push("metadata");
          return rows;
        },
        resolve: async (reference: string) => {
          calls.push(reference);
          return "mock-private-key";
        },
        validate: async (key: string) => {
          expect(key).toBe("mock-private-key");
          calls.push("validate");
          if (!valid) throw new Error("upstream mock-private-key");
        },
        bind: async (id: string, reference: string) => {
          expect(id).toBe(row.id);
          expect(reference).toBe(`credential://browser_use/${id}`);
          calls.push("bind");
        },
      },
    };
  }
  test("existing connections do not read or resolve other credentials", async () => {
    const { calls, dependencies } = setup([row], true);
    expect(await reuseBrowserKey("browser_use", dependencies)).toBe("existing");
    expect(calls).toEqual([]);
  });
  test("missing and ambiguous metadata never resolve secrets or call providers", async () => {
    for (const [rows, status] of [
      [[], "missing"],
      [[row, { ...row, id: "other-id" }], "ambiguous"],
    ] as const) {
      const { calls, dependencies } = setup([...rows]);
      expect(await reuseBrowserKey("browser_use", dependencies)).toBe(status);
      expect(calls).toEqual(["metadata"]);
    }
  });
  test("binds only an opaque reference after successful validation", async () => {
    const { calls, dependencies } = setup();
    expect(await reuseBrowserKey("browser_use", dependencies)).toBe("connected");
    expect(calls).toEqual(["metadata", "credential://browser_use/owned-id", "validate", "bind"]);
  });
  test("validation failure never writes and hides upstream secrets", async () => {
    const { calls, dependencies } = setup([row], false, false);
    expect(await reuseBrowserKey("browser_use", dependencies)).toBe("unavailable");
    expect(calls).not.toContain("bind");
  });
});
