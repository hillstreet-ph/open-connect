import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchFreeModelCatalog } from "@/lib/model-catalog";

export const listFreeModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveUserUpstreams } = await import("@/lib/gateway.server");
    const upstreams = await resolveUserUpstreams(context.userId);
    return {
      defaultModel: "open-connect/auto",
      autoDescription:
        "OpenRouter routes to its available free models. LiteLLM contributes models explicitly priced at zero.",
      providers: upstreams.map((upstream) => upstream.name),
      models: await fetchFreeModelCatalog(upstreams),
    };
  });
