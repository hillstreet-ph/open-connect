import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const testFreeModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAutoFreeRoutes, resolveUserUpstreams } = await import("@/lib/gateway.server");
    const routes = await resolveAutoFreeRoutes(await resolveUserUpstreams(context.userId));
    if (!routes.length)
      throw new Error("Connect OpenRouter or a free LiteLLM model before testing.");
    let lastStatus = 0;
    for (const route of routes) {
      const { upstream, model } = route;
      let response: Response;
      try {
        response = await fetch(upstream.baseUrl + "/chat/completions", {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(60_000),
          headers: upstream.headers,
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Reply with OK." }],
            max_tokens: 1024,
          }),
        });
      } catch {
        continue;
      }
      if (!response.ok) {
        lastStatus = response.status;
        continue;
      }
      const data = (await response.json().catch(() => null)) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      } | null;
      if (!data?.choices?.[0]?.message?.content) continue;
      return {
        ok: true,
        model: data.model ?? model,
        checkedAt: new Date().toISOString(),
      };
    }
    throw new Error(
      `Free model test failed after trying connected routes${lastStatus ? ` (last HTTP ${lastStatus})` : ""}. Check provider keys, quotas, and free model availability.`,
    );
  });
