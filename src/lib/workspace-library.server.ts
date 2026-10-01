import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Read one existing library; never copy installs into individual projects. */
export async function readWorkspaceLibrary(
  context: { supabase: SupabaseClient<Database>; userId: string },
  resourceType: string | null = null,
) {
  const { data: library, error: libraryError } = await context.supabase
    .from("toolkits")
    .select("id")
    .eq("user_id", context.userId)
    .eq("slug", "open-connect-personal-library")
    .maybeSingle();
  if (libraryError) throw new Error(libraryError.message);
  const libraryId = library?.id ?? "00000000-0000-0000-0000-000000000000";
  let installedQuery = context.supabase
    .from("toolkit_items")
    .select(
      "id, created_at, resources(id, name, slug, description, category_slug, resource_type, version, verified, package_filename, package_size)",
    )
    .eq("toolkit_id", libraryId)
    .order("created_at", { ascending: false });
  let ownedQuery = context.supabase
    .from("resources")
    .select(
      "id, created_at, name, slug, description, category_slug, resource_type, version, verified, package_filename, package_size",
    )
    .eq("owner_id", context.userId)
    .order("created_at", { ascending: false });
  if (resourceType) {
    installedQuery = installedQuery.eq(
      "resources.resource_type",
      resourceType as Database["public"]["Enums"]["resource_type"],
    );
    ownedQuery = ownedQuery.eq("resource_type", resourceType as never);
  }
  const [installedResult, ownedResult] = await Promise.all([installedQuery, ownedQuery]);
  if (installedResult.error) throw new Error(installedResult.error.message);
  if (ownedResult.error) throw new Error(ownedResult.error.message);
  const installed = (installedResult.data ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    resources: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      category_slug: string | null;
      resource_type: string;
      version: string | null;
      verified: boolean;
      package_filename: string | null;
      package_size: number | null;
    } | null;
  }>;
  const byId = new Map(
    installed.flatMap((row) => (row.resources ? [[row.resources.id, row] as const] : [])),
  );
  for (const resource of ownedResult.data ?? []) {
    if (!byId.has(resource.id)) {
      byId.set(resource.id, {
        id: `owned-${resource.id}`,
        created_at: resource.created_at,
        resources: resource,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
