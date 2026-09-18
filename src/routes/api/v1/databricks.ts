import { createFileRoute } from "@tanstack/react-router";
import {
  databricksConfig,
  ensureOpenConnectLakehouse,
  upsertDatabricksRows,
} from "@/lib/databricks.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function authorized(request: Request) {
  const expected = process.env.DATABRICKS_SYNC_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && provided && expected === provided);
}

export const Route = createFileRoute("/api/v1/databricks")({
  server: {
    handlers: {
      GET: async () => {
        const config = databricksConfig();
        return json({
          configured: config.configured,
          // Connectivity is intentionally checked only by the authenticated sync operation.
          reachable: null,
          catalog: config.configured ? config.catalog : null,
          schema: config.configured ? config.schema : null,
        });
      },
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
        if (!databricksConfig().configured)
          return json({ error: "Databricks is not configured" }, 503);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await ensureOpenConnectLakehouse();

        const [memory, knowledge, resources] = await Promise.all([
          supabaseAdmin
            .from("memory_records")
            .select(
              "id,user_id,project_id,title,content,memory_type,importance,pinned,tags,expires_at,created_at,updated_at",
            )
            .limit(1000),
          supabaseAdmin
            .from("knowledge_items")
            .select(
              "id,user_id,project_id,title,content,source_type,source_url,mime_type,status,tags,created_at,updated_at",
            )
            .limit(1000),
          supabaseAdmin
            .from("resources")
            .select(
              "id,slug,name,description,resource_type,category_slug,license,verified,published,source,updated_at",
            )
            .limit(1000),
        ]);
        const error = memory.error || knowledge.error || resources.error;
        if (error) return json({ error: "Supabase export failed" }, 502);

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
            (memory.data ?? []) as Array<Record<string, unknown>>,
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
            (knowledge.data ?? []) as Array<Record<string, unknown>>,
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
            (resources.data ?? []) as Array<Record<string, unknown>>,
          ),
        ]);
        return json({ ok: true, memoryRecords, knowledgeItems, resources: resourceRecords });
      },
    },
  },
});
