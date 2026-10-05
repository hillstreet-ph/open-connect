import type { SupabaseClient } from "@supabase/supabase-js";
import { isOpenAiMarketplaceResource } from "@/lib/marketplace-auto-sync";

const LIBRARY_SLUG = "open-connect-personal-library";

/**
 * Keep a user's OpenAI/ChatGPT Marketplace resources in their Library and each
 * collection. Project resource pages merge the user's Library automatically,
 * so the same packages are immediately available in all of that user's projects.
 * Packages are only linked as data; this never runs downloaded code.
 */
export async function syncOpenAiMarketplaceResources(supabase: SupabaseClient, userId: string) {
  const { data: existingLibrary, error: libraryReadError } = await supabase
    .from("toolkits")
    .select("id")
    .eq("user_id", userId)
    .eq("slug", LIBRARY_SLUG)
    .maybeSingle();
  if (libraryReadError) throw new Error(libraryReadError.message);

  let libraryId = (existingLibrary as { id: string } | null)?.id;
  if (!libraryId) {
    const { data: created, error } = await supabase
      .from("toolkits")
      .insert({
        user_id: userId,
        slug: LIBRARY_SLUG,
        name: "Personal Library",
        description: "Resources added from Studio and Marketplace.",
        published: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    libraryId = (created as { id: string }).id;
  }

  const { data: catalog, error: catalogError } = await supabase
    .from("resources")
    .select("id, slug, name, description, category_slug, supported_clients")
    .eq("published", true);
  if (catalogError) throw new Error(catalogError.message);

  const resourceIds = (catalog ?? [])
    .filter((resource) => isOpenAiMarketplaceResource(resource))
    .map((resource) => resource.id as string);
  if (!resourceIds.length) return { resources: 0, collections: 0, projects: 0 };

  const { data: collections, error: collectionsError } = await supabase
    .from("toolkits")
    .select("id")
    .eq("user_id", userId);
  if (collectionsError) throw new Error(collectionsError.message);

  const toolkitIds = [
    ...new Set([libraryId, ...(collections ?? []).map((row) => row.id as string)]),
  ];
  for (const toolkitId of toolkitIds) {
    const { error } = await supabase.from("toolkit_items").upsert(
      resourceIds.map((resourceId, position) => ({
        toolkit_id: toolkitId,
        resource_id: resourceId,
        position,
      })),
      { onConflict: "toolkit_id,resource_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }

  return { resources: resourceIds.length, collections: toolkitIds.length, projects: 0 };
}
