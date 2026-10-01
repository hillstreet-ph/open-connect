import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const testFreeModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveUserUpstreams } = await import("@/lib/gateway.server");
    const upstream = (await resolveUserUpstreams(context.userId)).find(
      (u) => u.name === "openrouter",
    );
    if (!upstream) throw new Error("Connect OpenRouter before testing.");
    const response = await fetch(upstream.baseUrl + "/chat/completions", {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
      headers: upstream.headers,
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 32,
      }),
    });
    if (!response.ok)
      throw new Error(
        `OpenRouter test failed (HTTP ${response.status}). Check your key, quota, and provider availability.`,
      );
    const data = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    if (!data.choices?.[0]?.message?.content)
      throw new Error("OpenRouter returned no text. Retry or choose another available model.");
    return {
      ok: true,
      model: data.model ?? "openrouter/free",
      checkedAt: new Date().toISOString(),
    };
  });
