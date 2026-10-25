import type { SupabaseClient } from "@supabase/supabase-js";
import { redactDataText } from "./data-controls.ts";
export async function createConnectorDraft(db: SupabaseClient, userId: string, id: string) {
  const { data: row, error } = await db
    .from("app_connections")
    .select("id,display_name,metadata")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !row) throw new Error("Owned connector not found");
  const slug = `connector-${row.id}`;
  const existing = await db
    .from("resources")
    .select("id")
    .eq("owner_id", userId)
    .eq("slug", slug)
    .maybeSingle();
  if (existing.error) throw new Error("Could not check existing connector draft");
  if (existing.data) return { id: existing.data.id as string };
  const tools = (row.metadata.capabilities?.tools || []) as Array<{
    name: string;
    description?: string;
  }>;
  const content = redactDataText(
    `# ${row.display_name}\n\n${row.metadata.description || "Private connector plugin draft"}\n\n## Connection\nTransport: ${row.metadata.transport || "http"}\nUse the configured account connection by ID. Credentials must remain in the Vault.\n\n## Tools\n${tools.map((t) => `- ${t.name}: ${t.description || ""}`).join("\n")}\n\n## Review\nConfirm source, license, permissions and execution tests before publishing. This draft does not embed credentials or authorize an external installation.`,
  );
  const inserted = await db
    .from("resources")
    .insert({
      owner_id: userId,
      slug,
      name: row.display_name,
      description: String(row.metadata.description || "Private connector plugin draft").slice(
        0,
        1000,
      ),
      resource_type: "plugin",
      source: "connector-draft",
      installation_type: "manifest",
      installation_config: {
        draft_markdown: content,
        connector_id: row.id,
        executable: false,
        review_state: "pending_security_review",
      },
      verified: false,
      published: false,
      license: null,
      version: "0.1.0",
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error("Could not create the private connector draft");
  return { id: inserted.data.id as string };
}
