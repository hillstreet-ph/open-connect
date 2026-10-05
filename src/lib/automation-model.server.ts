/** Bounded text generation only: never executes model-proposed tools or code. */
export function automationPrompt(config: Record<string, unknown>): string {
  const prompt = typeof config["prompt"] === "string" ? config["prompt"].trim() : "";
  if (!prompt || prompt.length > 8000)
    throw new Error("Enter an AI prompt between 1 and 8,000 characters.");
  return prompt;
}

export async function generateAutomationResponse(
  prompt: string,
  upstream: { name: "openrouter" | "litellm"; baseUrl: string; headers: Record<string, string> },
  request: typeof fetch = fetch,
  model = "open-connect/auto",
) {
  automationPrompt({ prompt });
  if (
    upstream.name === "openrouter" &&
    !["open-connect/auto", "poolside/laguna-s-2.1:free", "openrouter/free"].includes(model)
  )
    throw new Error("Choose a supported free model.");
  // Credentials must never follow a redirect or a configurable destination.
  const allowedBase =
    upstream.name === "openrouter"
      ? upstream.baseUrl === "https://openrouter.ai/api/v1"
      : upstream.baseUrl.startsWith("https://");
  if (!allowedBase) throw new Error("Model endpoint is not supported.");
  const requestModel = model === "open-connect/auto" ? "openrouter/free" : model;
  let response: Response;
  try {
    response = await request(upstream.baseUrl + "/chat/completions", {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
      headers: upstream.headers,
      body: JSON.stringify({
        model: requestModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
      }),
    });
  } catch {
    throw new Error("AI request failed or timed out. Check your connection and retry.");
  }
  if (!response.ok)
    throw new Error(
      `AI request failed (HTTP ${response.status}). Check provider availability and quota.`,
    );
  let data: { model?: string; choices?: { message?: { content?: unknown } }[] };
  try {
    data = await response.json();
  } catch {
    throw new Error("AI provider returned an invalid response.");
  }
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new Error("AI provider returned no text. Retry the run.");
  if (text.length > 50000) throw new Error("AI response exceeded the storage limit.");
  return {
    text,
    model: typeof data.model === "string" ? data.model : requestModel,
  };
}
