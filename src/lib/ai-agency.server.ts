import type { SupabaseClient } from "@supabase/supabase-js";
import { agencyTeamInput, type AgencyTeam } from "./ai-agency.ts";
export async function listOwnedAgencyTeams(
  db: SupabaseClient,
  userId: string,
  filters: { category?: string | undefined; archived?: boolean | undefined } = {},
) {
  let query = db
    .from("ai_agency_teams")
    .select("id,name,category,description,roles,archived,updated_at")
    .eq("user_id", userId)
    .eq("archived", filters.archived ?? false)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (filters.category) query = query.eq("category", filters.category);
  const { data, error } = await query;
  if (error) throw new Error("Could not load your AI Agency teams.");
  return (data ?? []) as AgencyTeam[];
}
export async function saveOwnedAgencyTeam(
  db: SupabaseClient,
  userId: string,
  input: { team: unknown; id?: string | undefined; expectedUpdatedAt?: string | undefined },
) {
  const team = agencyTeamInput.parse(input.team);
  const now = new Date().toISOString();
  const query = input.id
    ? db
        .from("ai_agency_teams")
        .update({ ...team, updated_at: now })
        .eq("id", input.id)
        .eq("user_id", userId)
        .eq("updated_at", input.expectedUpdatedAt ?? "")
    : db.from("ai_agency_teams").insert({ ...team, user_id: userId });
  const { data, error } = await query.select("id").maybeSingle();
  if (error?.code === "23505")
    throw new Error("You already have a team with this name. Choose a different name.");
  if (error) throw new Error("Could not save your team.");
  if (!data) throw new Error("Team changed. Reload it before saving again.");
  return data as { id: string };
}
export async function ownedActiveAgencyTeam(db: SupabaseClient, userId: string, id: string) {
  const { data, error } = await db
    .from("ai_agency_teams")
    .select("id,name,category,description,roles,archived,updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("archived", false)
    .maybeSingle();
  if (error || !data) throw new Error("Choose an active team that belongs to your account.");
  agencyTeamInput.parse(data);
  return data as AgencyTeam;
}
