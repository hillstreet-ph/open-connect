import { z } from "zod";

/** Omitted project context means personal ownership, never an implicit shared grant. */
export const cloudConnectionInput = z.object({
  projectId: z.string().uuid().optional(),
  connectionId: z.string().uuid(),
});
