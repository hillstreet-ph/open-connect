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
    .eq("user_id", userId)
    .like("slug", "collection-%");
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

  const [
    { data: projects, error: projectError },
    { data: organizationRoles, error: organizationRoleError },
    { data: projectRoles, error: projectRoleError },
    { data: ownedOrganizations, error: ownedOrganizationError },
  ] = await Promise.all([
    supabase.from("projects").select("id, organization_id"),
    supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .in("role", ["owner", "admin"]),
    supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId)
      .in("role", ["admin", "manager"]),
    supabase.from("organizations").select("id").eq("owner_id", userId),
  ]);
  if (projectError) throw new Error(projectError.message);
  if (organizationRoleError) throw new Error(organizationRoleError.message);
  if (projectRoleError) throw new Error(projectRoleError.message);
  if (ownedOrganizationError) throw new Error(ownedOrganizationError.message);

  const managedOrganizationIds = new Set([
    ...(organizationRoles ?? []).map((row) => row.organization_id as string),
    ...(ownedOrganizations ?? []).map((row) => row.id as string),
  ]);
  const managedProjectIds = new Set((projectRoles ?? []).map((row) => row.project_id as string));
  const manageableProjects = (projects ?? []).filter(
    (project) =>
      managedOrganizationIds.has(project.organization_id as string) ||
      managedProjectIds.has(project.id as string),
  );

  let assignedProjects = 0;
  const projectChunks = manageableProjects.flatMap((project) =>
    resourceIds.map((resourceId) => ({
      project_id: project.id as string,
      resource_id: resourceId,
      added_by: userId,
    })),
  );
  for (let offset = 0; offset < projectChunks.length; offset += 500) {
    const { error } = await supabase.from("project_resources").upsert(
      projectChunks.slice(offset, offset + 500),
      { onConflict: "project_id,resource_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    assignedProjects += Math.min(500, projectChunks.length - offset);
  }

  return {
    resources: resourceIds.length,
    collections: toolkitIds.length,
    projects: manageableProjects.length,
    projectLinks: assignedProjects,
  };
}
