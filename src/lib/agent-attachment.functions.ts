import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const prepareAgentAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      name: z.string().max(180),
      data: z
        .string()
        .min(1)
        .max(5600000)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    }),
  )
  .handler(async ({ data }) => {
    const { extractAgentAttachment } = await import("./agent-attachment.server");
    return extractAgentAttachment(data.name, new Uint8Array(Buffer.from(data.data, "base64")));
  });
