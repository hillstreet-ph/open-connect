import type { SupabaseClient } from "@supabase/supabase-js";
import { workforceConfig, type WorkforceAgent, type WorkforceVersion } from "./workforce.ts";
import { redactDataText } from "./data-controls.ts";

export async function workforceReferences(
  db: SupabaseClient,
  config: ReturnType<typeof workforceConfig.parse>,
  projectId: string | null,
  userId: string,
) {
  const ids = [
    ...new Set([...config.skillIds, ...(config.sourceResourceId ? [config.sourceResourceId] : [])]),
  ];
  const resources = ids.length
    ? await db
        .from("resources")
        .select("id,name,description,resource_type,owner_id,published,verified")
        .in("id", ids)
    : { data: [], error: null };
  if (resources.error || resources.data?.length !== ids.length)
    throw Error("An attached resource is unavailable.");
  for (const row of resources.data ?? []) {
    if (!(row.published && row.verified)) {
      if (projectId) {
        const grant = await db
          .from("project_resources")
          .select("resource_id")
          .eq("project_id", projectId)
          .eq("resource_id", row.id)
          .maybeSingle();
        if (!grant.data || grant.error)
          throw Error("Attach only resources explicitly assigned to this project.");
      } else if (row.owner_id !== userId)
        throw Error("Attached resource is not owned by this account.");
    }
    if (config.skillIds.includes(row.id) && row.resource_type !== "skill")
      throw Error("Choose skill resources for the skills field.");
    if (config.sourceResourceId === row.id && row.resource_type !== "agent")
      throw Error("Source resource must be an agent.");
  }
  let knowledge: { id: string; title: string; content: string }[] = [];
  if (config.knowledgeIds.length) {
    let q = db
      .from("knowledge_items")
      .select("id,title,content,project_id,user_id")
      .in("id", config.knowledgeIds)
      .neq("status", "archived");
    q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null).eq("user_id", userId);
    const result = await q;
    if (result.error || result.data?.length !== new Set(config.knowledgeIds).size)
      throw Error("An attached knowledge source is unavailable in this scope.");
    knowledge = (result.data ?? []).map((r) => ({
      id: r.id,
      title: redactDataText(r.title),
      content: redactDataText(r.content ?? "").slice(0, 1600),
    }));
  }
  const connections: { id: string; display_name: string; status: string }[] = [];
  if (projectId && config.connectionIds.length) {
    const shared = await db.rpc("list_project_connections", { p_project_id: projectId });
    if (shared.error || !Array.isArray(shared.data))
      throw Error("Project connections are unavailable.");
    for (const id of new Set(config.connectionIds)) {
      const row = shared.data.find(
        (r: { connection_id: string }) => r.connection_id === id,
      )?.app_connections;
      if (!row) throw Error("A connection is not shared with this project.");
      connections.push({ id: row.id, display_name: row.display_name, status: row.status });
    }
  } else
    for (const id of new Set(config.connectionIds)) {
      const row = await db
        .from("app_connections")
        .select("id,display_name,status")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (row.error || !row.data) throw Error("An attached connection is unavailable.");
      connections.push(row.data);
    }
  return {
    skills: (resources.data ?? [])
      .filter((r) => r.resource_type === "skill")
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: redactDataText(r.description ?? "").slice(0, 600),
      })),
    knowledge,
    connections,
  };
}

export async function loadWorkforceChat(
  db: SupabaseClient,
  userId: string,
  chatId: string,
  readOnly = false,
) {
  const chat = await db
    .from("agent_chats")
    .select("id,workforce_agent_id,workforce_version_id")
    .eq("id", chatId)
    .eq("user_id", userId)
    .maybeSingle();
  if (chat.error || !chat.data?.workforce_agent_id) throw Error("Specialist chat is unavailable.");
  let aQuery = db.from("workforce_agents").select("*").eq("id", chat.data.workforce_agent_id);
  if (!readOnly) aQuery = aQuery.eq("enabled", true);
  const a = await aQuery.maybeSingle();
  if (a.error || !a.data) throw Error("Specialist is disabled or access has changed.");
  const v = await db
    .from("workforce_agent_versions")
    .select("*")
    .eq("id", chat.data.workforce_version_id)
    .eq("agent_id", a.data.id)
    .maybeSingle();
  if (v.error || !v.data) throw Error("Specialist version is unavailable.");
  const config = workforceConfig.parse(v.data.config);
  const references = readOnly
    ? { skills: [], knowledge: [], connections: [] }
    : await workforceReferences(db, config, a.data.project_id, userId);
  if (references.connections.some((c) => c.status !== "connected"))
    throw Error("Reconnect the specialist's required apps before launching.");
  return {
    agent: a.data as WorkforceAgent,
    version: { ...v.data, config } as WorkforceVersion,
    references,
  };
}
