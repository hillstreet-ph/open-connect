import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
  databricksConfig,
  ensureOpenConnectLakehouse,
  upsertDatabricksRows,
} from "@/lib/databricks.server";
import { fetchSupabaseReadonlyRows } from "@/lib/supabase.readonly.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function authorized(request: Request) {
  const expected = process.env["DATABRICKS_SYNC_SECRET"]?.trim() ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export const Route = createFileRoute("/api/v1/databricks")({
  server: {
    handlers: {
      GET: async () =>
        json({ configured: databricksConfig().configured, sourceOfTruth: "supabase" }),
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
        if (!databricksConfig().configured)
          return json({ error: "Databricks is not configured" }, 503);
        await ensureOpenConnectLakehouse();

        const [memoryData, knowledgeData, resourcesData] = await Promise.all([
          fetchSupabaseReadonlyRows("memory_records"),
          fetchSupabaseReadonlyRows("knowledge_items"),
          fetchSupabaseReadonlyRows("resources"),
        ]);
        const failed = [memoryData, knowledgeData, resourcesData]
          .map((row) => row.error)
          .filter((message): message is string => Boolean(message));
        if (failed.length > 0) {
          return json({ error: `Supabase export failed: ${failed.join("; ")}` }, 502);
        }

        const [memoryRecords, knowledgeItems, resourceRecords] = await Promise.all([
          upsertDatabricksRows(
            {
              table: "memory_records",
              privateRows: true,
              columns: [
                "id",
                "user_id",
                "project_id",
                "title",
                "content",
                "memory_type",
                "importance",
                "pinned",
                "tags",
                "expires_at",
                "created_at",
                "updated_at",
              ],
            },
            (memoryData.rows ?? []) as Array<Record<string, unknown>>,
          ),
          upsertDatabricksRows(
            {
              table: "knowledge_items",
              privateRows: true,
              columns: [
                "id",
                "user_id",
                "project_id",
                "title",
                "content",
                "source_type",
                "source_url",
                "mime_type",
                "status",
                "tags",
                "created_at",
                "updated_at",
              ],
            },
            (knowledgeData.rows ?? []) as Array<Record<string, unknown>>,
          ),
          upsertDatabricksRows(
            {
              table: "resources",
              columns: [
                "id",
                "slug",
                "name",
                "description",
                "resource_type",
                "category_slug",
                "license",
                "verified",
                "published",
                "source",
                "updated_at",
              ],
            },
            (resourcesData.rows ?? []) as Array<Record<string, unknown>>,
          ),
        ]);

        return json({ ok: true, memoryRecords, knowledgeItems, resources: resourceRecords });
      },
    },
  },
});
