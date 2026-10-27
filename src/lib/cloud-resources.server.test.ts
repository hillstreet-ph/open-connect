import assert from "node:assert/strict";
import test from "node:test";
import {
  computerPrefix,
  controlCloudComputer,
  createCloudComputer,
  desktopServiceSchema,
  listCloudComputers,
  purchasePhoneNumber,
  searchPhoneNumbers,
} from "./cloud-resources.server.ts";

const TWILIO = JSON.stringify({
  account_sid: `AC${"a".repeat(32)}`,
  api_key_sid: `SK${"b".repeat(32)}`,
  api_key_secret: "fixture_secret_value_123",
});

type Call = { url: string; body: Record<string, unknown> | string | null };

/** Fake Zeabur GraphQL: answers by operation keyword and records every request. */
function zeaburFake(services: Array<{ _id: string; name: string }>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    calls.push({ url, body });
    const q = body.query;
    const reply = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
    if (q.includes("projects(")) {
      return reply({
        projects: {
          edges: [
            { node: { _id: "p1", name: "open-connect-computers-sin1", region: { id: "sin1" } } },
            { node: { _id: "p2", name: "unrelated", region: { id: "sin1" } } },
          ],
        },
      });
    }
    if (q.includes("environments(")) return reply({ environments: [{ _id: "e1" }] });
    if (q.includes("services(")) {
      return reply({
        services: {
          edges: services.map((s) => ({
            node: {
              ...s,
              createdAt: "2026-10-27T00:00:00Z",
              status: "RUNNING",
              domains: [{ domain: `${s.name}.zeabur.app` }],
            },
          })),
        },
      });
    }
    if (q.includes("createPrebuiltService"))
      return reply({ createPrebuiltService: { _id: "new1" } });
    if (q.includes("addDomain")) return reply({ addDomain: { domain: "x.zeabur.app" } });
    if (q.includes("deleteService")) return reply({ deleteService: true });
    if (q.includes("restartService")) return reply({ restartService: true });
    return new Response(JSON.stringify({ errors: [{ message: "unexpected" }] }), { status: 400 });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

test("per-user prefix is stable and does not reveal the user id", async () => {
  const a = await computerPrefix("user-1");
  assert.equal(a, await computerPrefix("user-1"));
  assert.notEqual(a, await computerPrefix("user-2"));
  assert.match(a, /^oc-[a-f0-9]{10}$/);
  assert.doesNotMatch(a, /user/);
});

test("desktop schema pins the image, protects the desktop and sanitizes timezone", () => {
  const schema = desktopServiceSchema("oc-0123456789-abcd", "pw-fixture", "Asia/Manila; rm -rf /");
  assert.equal(schema.source.image, "lscr.io/linuxserver/webtop:ubuntu-xfce");
  assert.equal(schema.env.find((e) => e.key === "PASSWORD")?.default, "pw-fixture");
  assert.equal(schema.env.find((e) => e.key === "TZ")?.default, "UTC");
  assert.throws(() => desktopServiceSchema("other-name", "pw"), /Invalid name/);
});

test("listing only returns the caller's desktops from Open-Connect projects", async () => {
  const mine = await computerPrefix("user-1");
  const other = await computerPrefix("user-2");
  const { fetch } = zeaburFake([
    { _id: "a".repeat(24), name: `${mine}-aaaa` },
    { _id: "b".repeat(24), name: `${other}-bbbb` },
  ]);
  const list = await listCloudComputers("token", "user-1", fetch);
  assert.deepEqual(
    list.map((c) => [c.name, c.url]),
    [[`${mine}-aaaa`, `https://${mine}-aaaa.zeabur.app`]],
  );
});

test("create enforces the per-user limit and sends a schema, not the token, in variables", async () => {
  const mine = await computerPrefix("user-1");
  const full = zeaburFake([{ _id: "a".repeat(24), name: `${mine}-aaaa` }]);
  await assert.rejects(
    createCloudComputer("token", "user-1", { region: "sin1", maxPerUser: 1 }, full.fetch),
    /limit is 1/,
  );
  const empty = zeaburFake([]);
  const created = await createCloudComputer(
    "token",
    "user-1",
    { region: "sin1", maxPerUser: 1 },
    empty.fetch,
  );
  assert.equal(created.url, "https://x.zeabur.app");
  assert.equal(created.password.length, 24);
  const mutation = empty.calls.find((c) =>
    JSON.stringify(c.body).includes("createPrebuiltService"),
  )!;
  assert.doesNotMatch(JSON.stringify(mutation.body), /token/);
});

test("control refuses services that belong to someone else", async () => {
  const other = await computerPrefix("user-2");
  const { fetch, calls } = zeaburFake([{ _id: "b".repeat(24), name: `${other}-bbbb` }]);
  await assert.rejects(
    controlCloudComputer("token", "user-1", "b".repeat(24), "delete", fetch),
    /not found/,
  );
  assert.equal(
    calls.some((c) => JSON.stringify(c.body).includes("deleteService")),
    false,
  );
});

test("phone search maps Twilio numbers and monthly price; purchase validates E.164", async () => {
  const fetch = (async (url: string) => {
    if (url.includes("pricing.twilio.com"))
      return new Response(
        JSON.stringify({
          price_unit: "USD",
          phone_number_prices: [
            { number_type: "local", base_price: "1.15", current_price: "1.15" },
          ],
        }),
      );
    return new Response(
      JSON.stringify({
        available_phone_numbers: [
          {
            phone_number: "+14155550100",
            friendly_name: "(415) 555-0100",
            locality: "San Francisco",
            capabilities: { sms: true, voice: true },
          },
        ],
      }),
    );
  }) as unknown as typeof globalThis.fetch;
  const result = await searchPhoneNumbers(TWILIO, { country: "US", type: "Local" }, fetch);
  assert.equal(result.monthlyPrice, "1.15");
  assert.equal(result.currency, "USD");
  assert.equal(result.numbers[0]!.phoneNumber, "+14155550100");
  await assert.rejects(purchasePhoneNumber(TWILIO, "415-555", fetch), /Invalid phone number/);
  await assert.rejects(
    searchPhoneNumbers(TWILIO, { country: "usa", type: "Local" }, fetch),
    /Invalid country/,
  );
});
