import { z } from "zod";

export const campaignBriefSchema = z.object({
  brief: z.string().trim().min(12).max(2_000),
  audience: z.string().trim().min(3).max(500),
  product: z.string().trim().min(3).max(1_000),
  tone: z.string().trim().min(2).max(200),
  channels: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
});

export type CampaignBrief = z.infer<typeof campaignBriefSchema>;

export const campaignResultSchema = z.object({
  concept: z.object({
    name: z.string(),
    promise: z.string(),
    direction: z.string(),
  }),
  variants: z
    .array(
      z.object({
        headline: z.string(),
        body: z.string(),
        channel: z.string(),
      }),
    )
    .length(3),
  checklist: z.array(z.string()).min(3),
  imagePrompts: z.array(z.string()).min(1).max(3),
});

export type CampaignResult = z.infer<typeof campaignResultSchema> & {
  images: Array<{ dataUrl: string; prompt: string }>;
  responseId: string;
};

export type OpenAIResponsePayload = {
  id?: string;
  output?: Array<{
    type?: string;
    result?: string;
    revised_prompt?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string; code?: string };
};

export function extractResponseText(payload: OpenAIResponsePayload): string | undefined {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
}

export function extractGeneratedImages(
  payload: OpenAIResponsePayload,
  prompts: string[],
): Array<{ dataUrl: string; prompt: string }> {
  return (payload.output ?? [])
    .filter((item) => item.type === "image_generation_call" && item.result)
    .map((item, index) => ({
      dataUrl: `data:image/png;base64,${item.result}`,
      prompt: item.revised_prompt || prompts[index] || prompts[0] || "Campaign visual",
    }));
}

export const campaignJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["concept", "variants", "checklist", "imagePrompts"],
  properties: {
    concept: {
      type: "object",
      additionalProperties: false,
      required: ["name", "promise", "direction"],
      properties: {
        name: { type: "string" },
        promise: { type: "string" },
        direction: { type: "string" },
      },
    },
    variants: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "body", "channel"],
        properties: {
          headline: { type: "string" },
          body: { type: "string" },
          channel: { type: "string" },
        },
      },
    },
    checklist: { type: "array", minItems: 3, items: { type: "string" } },
    imagePrompts: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string" },
    },
  },
} as const;
