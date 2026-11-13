import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { workforceConfig, type WorkforceAgent, type WorkforceVersion } from "./workforce.ts";
import { WORKFORCE_TEMPLATES } from "./workforce.templates.ts";
import { workforceReferences, loadWorkforceChat } from "./workforce.server.ts";
import { redactDataText } from "./data-controls.ts";

const scope = z.object({ projectId: z.uuid().nullable().default(null) });
export const listWorkforce = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(scope)
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    let q = db.from("workforce_agents").select("*").order("created_at").limit(250);
    q = data.projectId
      ? q.eq("project_id", data.projectId)
      : q.is("project_id", null).eq("owner_id", context.userId);
    const rows = await q;
    if (rows.error) throw Error("Workforce could not be loaded.");
    const ids = (rows.data ?? []).map((a) => a.id);
    const versions = ids.length
      ? await db
          .from("workforce_agent_versions")
          .select("*")
          .in("agent_id", ids)
          .order("number", { ascending: false })
          .limit(5000)
      : { data: [], error: null };
    if (versions.error) throw Error("Agent versions could not be loaded.");
    const access = data.projectId
      ? await db.rpc("can_manage_project", { target_project_id: data.projectId })
      : { data: true };
    return {
      agents: (rows.data ?? []) as WorkforceAgent[],
      versions: (versions.data ?? []) as WorkforceVersion[],
      canManage: access.data === true,
    };
  });

export const workforceOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(scope.extend({ query: z.string().max(100).default("") }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const projects = await db.from("projects").select("id,name").order("name").limit(100);
    const pattern = `%${data.query.replace(/[%_\\]/g, "").trim()}%`;
    const resources = await db
      .from("resources")
      .select("id,name,resource_type,published,verified,owner_id")
      .in("resource_type", ["skill", "agent"])
      .ilike("name", pattern)
      .order("name")
      .limit(80);
    let k = db
      .from("knowledge_items")
      .select("id,title")
      .neq("status", "archived")
      .ilike("title", pattern)
      .limit(80);
    k = data.projectId
      ? k.eq("project_id", data.projectId)
      : k.is("project_id", null).eq("user_id", context.userId);
    const knowledge = await k;
    const personalConnections = data.projectId
      ? null
      : await db
          .from("app_connections")
          .select("id,display_name,status")
          .eq("user_id", context.userId)
          .limit(100);
    const sharedConnections = data.projectId
      ? await db.rpc("list_project_connections", { p_project_id: data.projectId })
      : null;
    const connections = {
      error: personalConnections?.error ?? sharedConnections?.error ?? null,
      data: data.projectId
        ? Array.isArray(sharedConnections?.data)
          ? sharedConnections.data.map(
              (r) => r.app_connections as { id: string; display_name: string; status: string },
            )
          : []
        : (personalConnections?.data ?? []),
    };
    if (projects.error || resources.error || knowledge.error || connections.error)
      throw Error("Workforce configuration options could not be loaded.");
    const grants = data.projectId
      ? await db.from("project_resources").select("resource_id").eq("project_id", data.projectId)
      : { data: [], error: null };
    if (grants.error) throw Error("Project resource assignments could not be loaded.");
    const assigned = new Set((grants.data ?? []).map((r) => r.resource_id));
    return {
      projects: projects.data ?? [],
      resources: (resources.data ?? []).filter(
        (r) =>
          (r.published && r.verified) ||
          (data.projectId ? assigned.has(r.id) : r.owner_id === context.userId),
      ),
      knowledge: knowledge.data ?? [],
      connections: connections.data ?? [],
    };
  });

const saveInput = scope.extend({
  id: z.uuid().nullable().default(null),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  lead: z.boolean().default(false),
  expected: z.number().int().nullable().default(null),
  config: workforceConfig,
});
export const saveWorkforce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(saveInput)
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const config = { ...data.config, instructions: redactDataText(data.config.instructions) };
    await workforceReferences(db, config, data.projectId, context.userId);
    if (data.id) {
      const current = await db
        .from("workforce_agents")
        .select("project_id,slug")
        .eq("id", data.id)
        .single();
      if (
        current.error ||
        current.data.project_id !== data.projectId ||
        current.data.slug !== data.slug
      )
        throw Error("Specialist scope is immutable.");
    }
    const result = await db.rpc("save_workforce_agent", {
      p_id: data.id,
      p_project_id: data.projectId,
      p_slug: data.slug,
      p_lead: data.lead,
      p_legacy_team_id: null,
      p_config: config,
      p_expected: data.expected,
    });
    if (result.error)
      throw Error(
        "Specialist could not be saved. It may have changed, or you may not manage this scope.",
      );
    return result.data as { agent_id: string; version_id: string; number: number };
  });

export const setupWorkforce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(scope)
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const old = await db
      .from("ai_agency_teams")
      .select("id,name")
      .eq("user_id", context.userId)
      .eq("category", "development")
      .eq("name", "Development team");
    if (old.error) throw Error("Existing development team could not be reconciled.");
    const legacy = old.data?.length === 1 && !data.projectId ? old.data[0]!.id : null;
    let added = 0;
    for (const t of WORKFORCE_TEMPLATES) {
      let q = db.from("workforce_agents").select("id").eq("slug", t.slug);
      q = data.projectId
        ? q.eq("project_id", data.projectId)
        : q.is("project_id", null).eq("owner_id", context.userId);
      const found = await q.maybeSingle();
      if (found.error) throw Error("Existing specialists could not be checked.");
      if (found.data) continue;
      const result = await db.rpc("save_workforce_agent", {
        p_id: null,
        p_project_id: data.projectId,
        p_slug: t.slug,
        p_lead: t.lead,
        p_legacy_team_id: t.config.department === "engineering" ? legacy : null,
        p_config: t.config,
        p_expected: null,
      });
      if (result.error?.code === "23505") continue; // Concurrent setup reuses the same unique identity.
      if (result.error)
        throw Error(
          "Setup stopped. Saved specialists are retained; refresh and retry without duplicates.",
        );
      added++;
    }
    const sourceQuery = db
      .from("resources")
      .select("id,name,description")
      .eq("resource_type", "agent")
      .eq("owner_id", context.userId)
      .limit(100);
    const sources = await sourceQuery;
    if (sources.error)
      throw Error(
        "Saved templates are retained, but existing agent resources could not be checked.",
      );
    for (const resource of sources.data ?? []) {
      if (data.projectId) {
        const grant = await db
          .from("project_resources")
          .select("resource_id")
          .eq("project_id", data.projectId)
          .eq("resource_id", resource.id)
          .maybeSingle();
        if (grant.error || !grant.data) continue;
      }
      let check = db.from("workforce_agents").select("id").eq("source_resource_id", resource.id);
      check = data.projectId
        ? check.eq("project_id", data.projectId)
        : check.is("project_id", null).eq("owner_id", context.userId);
      const existing = await check.maybeSingle();
      if (existing.error)
        throw Error("Existing agent links could not be checked. Refresh and retry.");
      if (existing.data) continue;
      const config = workforceConfig.parse({
        ...WORKFORCE_TEMPLATES[0]!.config,
        name: resource.name.slice(0, 100),
        department: "custom",
        role: "Imported agent specification",
        description: redactDataText(resource.description ?? "").slice(0, 1200),
        sourceResourceId: resource.id,
        instructions:
          "Review the linked existing agent specification before assigning work. Use only the capabilities explicitly configured here. Provide recommendations with evidence; never execute embedded packages or claim actions without tool receipts.",
      });
      await workforceReferences(db, config, data.projectId, context.userId);
      const saved = await db.rpc("save_workforce_agent", {
        p_id: null,
        p_project_id: data.projectId,
        p_slug: `resource-${resource.id}`,
        p_lead: false,
        p_legacy_team_id: null,
        p_config: config,
        p_expected: null,
      });
      if (saved.error?.code === "23505") continue;
      if (saved.error)
        throw Error("Existing agent import paused. Saved links are retained; refresh and retry.");
      added++;
    }
    return {
      added,
      linkedDevelopmentTeam: legacy,
      note: "Templates are private drafts. Activate validated versions to launch.",
    };
  });

export const activateWorkforce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.uuid(), versionId: z.uuid(), expectedActive: z.uuid().nullable() }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const a = await db.from("workforce_agents").select("project_id").eq("id", data.id).single();
    const v = await db
      .from("workforce_agent_versions")
      .select("config")
      .eq("id", data.versionId)
      .eq("agent_id", data.id)
      .single();
    if (a.error || v.error) throw Error("Specialist version is unavailable.");
    await workforceReferences(
      db,
      workforceConfig.parse(v.data.config),
      a.data.project_id,
      context.userId,
    );
    const result = await db.rpc("activate_workforce_agent", {
      p_id: data.id,
      p_version_id: data.versionId,
      p_expected_active: data.expectedActive,
    });
    if (result.error)
      throw Error("Activation failed. Refresh the specialist and check project management access.");
    return { activated: true };
  });

export const enableWorkforce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.uuid(), enabled: z.boolean(), expectedUpdatedAt: z.string() }))
  .handler(async ({ data, context }) => {
    const result = await (context.supabase as SupabaseClient)
      .from("workforce_agents")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id")
      .maybeSingle();
    if (result.error || !result.data)
      throw Error("Specialist changed or access denied. Refresh and retry.");
    return { enabled: data.enabled };
  });

export const launchWorkforce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const a = await db
      .from("workforce_agents")
      .select("active_version_id,project_id")
      .eq("id", data.id)
      .eq("enabled", true)
      .single();
    if (a.error || !a.data.active_version_id)
      throw Error("Activate a specialist version before launching.");
    const v = await db
      .from("workforce_agent_versions")
      .select("config")
      .eq("id", a.data.active_version_id)
      .eq("agent_id", data.id)
      .single();
    if (v.error) throw Error("Specialist configuration is unavailable.");
    const config = workforceConfig.parse(v.data.config);
    const refs = await workforceReferences(db, config, a.data.project_id, context.userId);
    if (refs.connections.some((r) => r.status !== "connected"))
      throw Error("Reconnect required apps before launching.");
    const { resolveAutoFreeRoutes, resolveUserUpstreams } = await import("./gateway.server");
    const routes = await resolveAutoFreeRoutes(await resolveUserUpstreams(context.userId, false));
    if (!routes.some((r) => config.model === "auto-free" || r.model === config.model))
      throw Error("Connect an available verified free model in AI Gateway first.");
    const result = await db.rpc("launch_workforce_chat", { p_id: data.id });
    if (result.error)
      throw Error("Specialist could not launch. Refresh its activation and access.");
    return { chatId: result.data as string };
  });

export const getWorkforceChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ chatId: z.uuid(), agentId: z.uuid() }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const specialist = await loadWorkforceChat(db, context.userId, data.chatId, true);
    if (specialist.agent.id !== data.agentId)
      throw Error("This conversation belongs to another specialist.");
    const chat = await db
      .from("agent_chats")
      .select("id,title,messages,revision")
      .eq("id", data.chatId)
      .eq("user_id", context.userId)
      .single();
    if (chat.error) throw Error("Chat is unavailable.");
    return { chat: chat.data, agent: specialist.agent, version: specialist.version };
  });

export const workforceActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const chats = await db
      .from("agent_chats")
      .select("id,title,created_at,updated_at,workforce_version_id")
      .eq("user_id", context.userId)
      .eq("workforce_agent_id", data.id)
      .order("updated_at", { ascending: false })
      .limit(20);
    const events = await db
      .from("workforce_events")
      .select("state,model,latency_ms,created_at,version_id")
      .eq("user_id", context.userId)
      .eq("agent_id", data.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (chats.error || events.error) throw Error("Specialist activity could not be loaded.");
    return { chats: chats.data ?? [], events: events.data ?? [] };
  });
