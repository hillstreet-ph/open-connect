import { createFileRoute } from "@tanstack/react-router";
import {
  campaignBriefSchema,
  campaignJsonSchema,
  campaignResultSchema,
} from "@/lib/campaign-studio";

const OPENAI_API = "https://api.openai.com/v1/responses";
const TEXT_MODEL = process.env.OPENAI_CAMPAIGN_MODEL || "gpt-6-astra";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst";

type OpenAIOutput = {
  id?: string;
  output?: Array<{
    type?: string;
    result?: string;
    revised_prompt?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string; code?: string };
};

function openAIHeaders(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "OpenAI-Project": process.env.OPENAI_PROJECT_ID || "proj_P1GhW0FJdBA5g3dpuKN8BZh8",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function extractText(payload: OpenAIOutput): string | undefined {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
}

export const Route = createFileRoute("/api/campaign-studio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.OPENAI_API_KEY;
        if (!key) return json({ error: "Campaign Studio is not configured." }, 503);

        const raw = await request.json().catch(() => null);
        const parsed = campaignBriefSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Check the campaign brief fields and try again." }, 400);
        }

        const { brief, audience, product, tone, channels } = parsed.data;
        const response = await fetch(OPENAI_API, {
          method: "POST",
          headers: openAIHeaders(key),
          body: JSON.stringify({
            model: TEXT_MODEL,
            reasoning: { effort: "medium" },
            instructions:
              "You are a senior creative director. Produce specific, usable campaign work. Avoid filler and unsupported claims. The visual must contain no logos and no rendered text.",
            input: `Build a launch-ready campaign direction.\nBrief: ${brief}\nAudience: ${audience}\nProduct: ${product}\nTone: ${tone}\nChannels: ${channels.join(", ")}.`,
            text: {
              format: {
                type: "json_schema",
                name: "campaign_concept",
                strict: true,
                schema: campaignJsonSchema,
              },
              verbosity: "medium",
            },
          }),
          signal: AbortSignal.timeout(180_000),
        }).catch(() => null);

        if (!response) return json({ error: "OpenAI did not respond. Try again." }, 502);
        const payload = (await response.json().catch(() => ({}))) as OpenAIOutput;
        if (!response.ok) {
          console.error("Campaign Studio OpenAI error", response.status, payload.error?.code);
          return json({ error: payload.error?.message || "Campaign generation failed." }, 502);
        }

        const text = extractText(payload);
        if (!text) return json({ error: "The response did not include campaign copy." }, 502);
        const decoded = (() => {
          try {
            return JSON.parse(text) as unknown;
          } catch {
            return null;
          }
        })();
        const campaign = campaignResultSchema.safeParse(decoded);
        if (!campaign.success)
          return json({ error: "The generated campaign was incomplete." }, 502);

        const imageResponse = await fetch(OPENAI_API, {
          method: "POST",
          headers: openAIHeaders(key),
          body: JSON.stringify({
            model: TEXT_MODEL,
            input: `Create one premium campaign key visual. No typography, words, labels, or logos. ${campaign.data.imagePrompts[0]}`,
            tools: [{ type: "image_generation", model: IMAGE_MODEL, quality: "medium" }],
            tool_choice: { type: "image_generation" },
          }),
          signal: AbortSignal.timeout(180_000),
        }).catch(() => null);
        const imagePayload = imageResponse
          ? ((await imageResponse.json().catch(() => ({}))) as OpenAIOutput)
          : ({} as OpenAIOutput);
        if (imageResponse && !imageResponse.ok) {
          console.error(
            "Campaign Studio image error",
            imageResponse.status,
            imagePayload.error?.code,
          );
        }

        const generated = (imagePayload.output ?? []).filter(
          (item) => item.type === "image_generation_call" && item.result,
        );
        const images = generated.map((item, index) => ({
          dataUrl: `data:image/png;base64,${item.result}`,
          prompt:
            item.revised_prompt ||
            campaign.data.imagePrompts[index] ||
            campaign.data.imagePrompts[0],
        }));

        return json({ ...campaign.data, images, responseId: payload.id || "unknown" });
      },
    },
  },
});
