import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cloud Browser workspace sections (Research, Monitor, Datasets, Wallet). Every
 * call runs with the signed-in user's own TinyFish connection from the vault;
 * no deployment-wide key is ever used here.
 */
async function client(userId: string) {
  const { cloudBrowserClient } = await import("@/lib/tinyfish.server");
  return (await cloudBrowserClient(userId)).client;
}

const id = z.string().min(1).max(128);

export const getCloudBrowserWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { CloudBrowserNotConnectedError } = await import("@/lib/tinyfish.server");
    try {
      const wallet = await (await client(context.userId)).getWallet();
      return {
        connected: true as const,
        balance: String(wallet["available_balance"] ?? ""),
        currency: String(wallet["currency"] ?? "USD"),
      };
    } catch (error) {
      if (error instanceof CloudBrowserNotConnectedError) return { connected: false as const };
      throw error;
    }
  });

// ---------- Research ----------

export const listCloudBrowserResearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { summarizeResearch } = await import("@/lib/tinyfish");
    const { data } = await (await client(context.userId)).listResearch(20);
    return (data ?? []).map(summarizeResearch);
  });

export const startCloudBrowserResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ query: z.string().min(1).max(10_000), mode: z.enum(["deep", "max"]) }))
  .handler(async ({ data, context }) => {
    const { normalizeResearch } = await import("@/lib/tinyfish");
    const started = await (await client(context.userId)).startResearch(normalizeResearch(data));
    if (!started.research_run_id) throw new Error("TinyFish did not start the research run.");
    return { research_run_id: started.research_run_id };
  });

export const getCloudBrowserResearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id }))
  .handler(async ({ data, context }) => {
    const { summarizeResearch } = await import("@/lib/tinyfish");
    return summarizeResearch(await (await client(context.userId)).getResearch(data.id));
  });

export const cancelCloudBrowserResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id }))
  .handler(async ({ data, context }) => {
    await (await client(context.userId)).cancelResearch(data.id);
    return { cancelled: true };
  });

// ---------- Monitors ----------

function monitorView(monitor: import("@/lib/tinyfish").Monitor) {
  return {
    id: monitor.id,
    name: monitor.name,
    type: monitor.type,
    target: String(monitor.config["url"] ?? monitor.config["query"] ?? ""),
    schedule_cron: monitor.schedule_cron,
    status: monitor.status,
    last_error: monitor.last_error ?? null,
    created_at: monitor.created_at ?? null,
  };
}

export const listCloudBrowserMonitors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { monitors } = await (await client(context.userId)).listMonitors();
    return (monitors ?? []).map(monitorView);
  });

export const createCloudBrowserMonitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      type: z.enum(["fetch", "search"]),
      url: z.string().max(2048).optional(),
      query: z.string().max(500).optional(),
      name: z.string().max(100).optional(),
      purpose: z.string().max(2000).optional(),
      schedule_cron: z.string().min(9).max(120),
    }),
  )
  .handler(async ({ data, context }) => {
    const { normalizeMonitor } = await import("@/lib/tinyfish");
    const created = await (await client(context.userId)).createMonitor(normalizeMonitor(data));
    return monitorView(created.monitor);
  });

export const updateCloudBrowserMonitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id, action: z.enum(["pause", "resume", "run", "delete"]) }))
  .handler(async ({ data, context }) => {
    const tf = await client(context.userId);
    if (data.action === "run") await tf.runMonitor(data.id);
    else if (data.action === "delete") await tf.deleteMonitor(data.id);
    else await tf.setMonitorStatus(data.id, data.action === "pause" ? "paused" : "active");
    return { ok: true, action: data.action };
  });

// ---------- Datasets ----------

export const listCloudBrowserDatasets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { summarizeDataset } = await import("@/lib/tinyfish");
    const { data } = await (await client(context.userId)).listDatasets(20);
    return (data ?? []).map(summarizeDataset);
  });

export const createCloudBrowserDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      prompt: z.string().min(3).max(15_000),
      target_rows: z.number().int().min(1).max(250),
    }),
  )
  .handler(async ({ data, context }) => {
    const { normalizeDataset, summarizeDataset } = await import("@/lib/tinyfish");
    return summarizeDataset(
      await (await client(context.userId)).createDataset(normalizeDataset(data)),
    );
  });

export const getCloudBrowserDatasetRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id }))
  .handler(async ({ data, context }) => {
    const rows = await (await client(context.userId)).datasetRows(data.id, 200);
    return {
      columns: rows.columns ?? [],
      rows: (rows.rows ?? []).map((row) => ({
        id: row._id,
        data: Object.fromEntries(
          Object.entries(row.data ?? {}).map(([key, value]) => [
            key,
            value === null || value === undefined
              ? ""
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value),
          ]),
        ) as Record<string, string>,
      })),
      truncated: rows.truncated === true,
    };
  });

export const updateCloudBrowserDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id, action: z.enum(["populate", "delete"]) }))
  .handler(async ({ data, context }) => {
    const tf = await client(context.userId);
    if (data.action === "delete") await tf.deleteDataset(data.id);
    else await tf.populateDataset(data.id);
    return { ok: true, action: data.action };
  });
