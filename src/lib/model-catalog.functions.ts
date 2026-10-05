import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchFreeModelCatalog } from "@/lib/model-catalog";

export const listFreeModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchMergedModelCatalog, resolveUserUpstreams } = await import("@/lib/gateway.server");
    const upstreams = await resolveUserUpstreams(context.userId);
    const catalog = await fetchMergedModelCatalog(upstreams);
    const freeModels = await fetchFreeModelCatalog(upstreams);
    return {
      defaultModel: "open-connect/auto",
      autoDescription:
        "Routes through verified free OpenRouter, NVIDIA, Ollama Cloud, and LiteLLM models.",
      providers: upstreams.map((upstream) => upstream.name),
      models: freeModels,
      allModels: catalog.ids.map((id) => ({
        id,
        free: freeModels.some((model) => model.id === id),
      })),
    };
  });
