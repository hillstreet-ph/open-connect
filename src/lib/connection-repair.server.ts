import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  repairOwnedConnection,
  type RepairConnection,
  type RepairInput,
} from "./connection-repair.ts";

export async function repairConnection(
  db: SupabaseClient<Database>,
  userId: string,
  input: RepairInput,
) {
  const columns =
    "id,user_id,provider,display_name,status,credential_reference,metadata,scopes,updated_at";
  return repairOwnedConnection(userId, input, {
    load: async () => {
      const { data, error } = await db
        .from("app_connections")
        .select(columns)
        .eq("id", input.connection_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error("Connection inspection is unavailable.");
      return data as RepairConnection | null;
    },
    credential: async (id) => {
      const { data, error } = await db
        .from("credential_secrets")
        .select("secret_type,website")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error("Credential metadata is unavailable.");
      return data;
    },
    validate: async (candidate) => {
      const { materializeCustomMcpConnection } = await import("./custom-mcp.server.ts");
      const { fetchMcpTools } = await import("./mcp-client.server.ts");
      const connection = await materializeCustomMcpConnection({
        ...candidate,
        metadata: candidate.metadata as Json,
      });
      const tools = await fetchMcpTools(
        connection.endpoint,
        connection.headers,
        fetch,
        connection.transport,
      );
      return tools.length;
    },
    update: async (candidate, expected) => {
      const { data, error } = await db
        .from("app_connections")
        .update({
          credential_reference: candidate.credential_reference,
          metadata: candidate.metadata as Json,
          status: candidate.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.connection_id)
        .eq("user_id", userId)
        .eq("provider", candidate.provider)
        .eq("updated_at", expected)
        .select(columns)
        .maybeSingle();
      if (error) throw new Error("Connection repair could not be saved.");
      return data as RepairConnection | null;
    },
  });
}
