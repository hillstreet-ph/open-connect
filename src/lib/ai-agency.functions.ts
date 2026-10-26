import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runAgencyTeam, validateAgencyInput } from "./ai-agency";
import { requestTeamWorker } from "./agent-team";

export const runAiAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateAgencyInput)
  .handler(async ({ data, context }) => {
    const { resolveAutoFreeRoutes, resolveUserUpstreams } = await import("./gateway.server");
    const routes = await resolveAutoFreeRoutes(await resolveUserUpstreams(context.userId, false));
    return runAgencyTeam(routes, data, requestTeamWorker);
  });
