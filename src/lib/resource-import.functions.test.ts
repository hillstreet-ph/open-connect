import { expect, mock, test } from "bun:test";

type Handler = (input: {
  data: { url: string; skill: null };
  context: { userId: string; supabase: unknown };
}) => Promise<{ results: Array<{ status: string }>; publication_performed: boolean }>;

let importHandler: Handler;
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(handler: Handler) {
      importHandler = handler;
      return handler;
    },
  }),
}));
mock.module("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
mock.module("./public-fetch.server", () => ({
  publicText: async () => "# Harmless imported guide\n\nRead the documentation before use.",
}));
await import("./resource-import.functions");

test("a clean public import remains a private unverified draft without a publication write", async () => {
  const writes: Array<Record<string, unknown>> = [];
  let publicationWrites = 0;
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: { id: "private-draft" }, error: null }),
    insert(row: Record<string, unknown>) {
      writes.push(row);
      return this;
    },
    update() {
      publicationWrites++;
      throw new Error("Import must not promote a resource");
    },
  };
  const result = await importHandler({
    data: { url: "https://docs.example/guide.md", skill: null },
    context: { userId: "fixture-owner", supabase: { from: () => query } },
  });
  expect(writes).toHaveLength(1);
  expect(writes[0]?.verified).toBe(false);
  expect(writes[0]?.published).toBe(false);
  const config = writes[0]?.installation_config as Record<string, unknown>;
  expect(config.review_state).toBe("pending_security_review");
  expect((config.scan_report as { findings: unknown[] }).findings).toEqual([]);
  expect(publicationWrites).toBe(0);
  expect(result.publication_performed).toBe(false);
  expect(result.results).toEqual([expect.objectContaining({ status: "draft" })]);
});
