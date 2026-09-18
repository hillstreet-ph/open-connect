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
