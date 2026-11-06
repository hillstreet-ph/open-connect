import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeDeveloperAccess, type TokenRow } from "./developer-access.ts";

const token = (over: Partial<TokenRow>): TokenRow => ({
  id: "t",
  name: "CLI",
  key_prefix: "oc_live_abc123",
  scopes: ["mcp:connect"],
  access_profile: "developer",
  oauth_resource: null,
  last_used_at: null,
  expires_at: null,
  revoked_at: null,
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

test("splits personal tokens from OAuth grants and groups grants per app", () => {
  const now = Date.parse("2026-11-06T00:00:00Z");
  const out = summarizeDeveloperAccess(
    {
      tokens: [
        token({ id: "p1" }),
        token({
          id: "g1",
          name: "OAuth: ChatGPT",
          oauth_resource: "https://open-connect.site/mcp",
          scopes: ["mcp:connect"],
          last_used_at: "2026-11-02T00:00:00Z",
        }),
        token({
          id: "g2",
          name: "OAuth: ChatGPT",
          scopes: ["resources:read"],
          last_used_at: "2026-11-03T00:00:00Z",
        }),
        token({ id: "old", expires_at: "2026-10-01T00:00:00Z" }),
      ],
      oauthApps: [
        {
          client_id: "oc_cli_x",
          client_name: "My app",
          redirect_uris: ["https://a.test/cb"],
          created_at: "2026-11-01T00:00:00Z",
          secret_rotated_at: null,
          revoked_at: null,
        },
      ],
      webhooks: [{ id: "w1", name: "Deploys", created_at: "2026-11-01T00:00:00Z" }],
      channels: [
        {
          id: "c1",
          kind: "webhook",
          name: "Alerts",
          enabled: true,
          created_at: "2026-11-01T00:00:00Z",
        },
      ],
    },
    now,
  );
  assert.deepEqual(
    out.personal_tokens.map((t) => t.id),
    ["p1"],
  );
  assert.equal(out.authorized_apps.length, 1);
  assert.equal(out.authorized_apps[0]!.app, "ChatGPT");
  assert.equal(out.authorized_apps[0]!.sessions, 2);
  assert.deepEqual(out.authorized_apps[0]!.scopes.sort(), ["mcp:connect", "resources:read"]);
  assert.equal(out.authorized_apps[0]!.last_used_at, "2026-11-03T00:00:00Z");
  assert.equal(out.oauth_apps[0]!.status, "active");
  assert.equal(out.secret_values_exposed, false);
});

test("never returns secret material or notification destinations", () => {
  const out = summarizeDeveloperAccess({
    tokens: [{ ...token({}), key_hash: "deadbeef" } as TokenRow],
    oauthApps: [
      {
        client_id: "oc_cli_x",
        client_name: "A",
        redirect_uris: [],
        created_at: "x",
        secret_rotated_at: null,
        revoked_at: null,
        client_secret_hash: "h",
      } as never,
    ],
    webhooks: [{ id: "w", name: "W", created_at: "x", secret_hash: "s" } as never],
    channels: [
      {
        id: "c",
        kind: "webhook",
        name: "C",
        enabled: true,
        created_at: "x",
        destination: "https://hooks.test/T0K3N",
      } as never,
    ],
  });
  const json = JSON.stringify(out);
  for (const leak of [
    "deadbeef",
    "client_secret_hash",
    "secret_hash",
    "T0K3N",
    "destination",
    "key_hash",
  ])
    assert.ok(!json.includes(leak), "leaked " + leak);
});
