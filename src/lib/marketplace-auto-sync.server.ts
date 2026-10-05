import type { SupabaseClient } from "@supabase/supabase-js";
import { isKobePlayMarketplaceResource } from "@/lib/marketplace-auto-sync";

const LIBRARY_SLUG = "open-connect-personal-library";

/**
 * Keep a user's supported Marketplace resources in their Library, KobePlay
 * collection, and manageable KobePlay workspace projects.
 * Packages are only linked as data; this never runs downloaded code.
 */
export async function syncKobePlayMarketplaceResources(supabase: SupabaseClient, userId: string) {
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
    .filter((resource) => isKobePlayMarketplaceResource(resource))
    .map((resource) => resource.id as string);
  if (!resourceIds.length) return { resources: 0, collections: 0, projects: 0 };

  const { data: collections, error: collectionsError } = await supabase
    .from("toolkits")
    .select("id, name, slug")
    .eq("user_id", userId)
    .like("slug", "collection-%");
  if (collectionsError) throw new Error(collectionsError.message);

  let kobePlayCollections = (collections ?? []).filter((collection) =>
    /kobe\s*play/i.test(`${collection.name} ${collection.slug}`),
  );
  if (!kobePlayCollections.length) {
    const { data: createdCollection, error } = await supabase
      .from("toolkits")
      .insert({
        user_id: userId,
        name: "KobePlay",
        slug: `collection-kobeplay-${crypto.randomUUID().slice(0, 8)}`,
        description: "Marketplace resources for the KobePlay workspace.",
        published: false,
      })
      .select("id, name, slug")
      .single();
    if (error) throw new Error(error.message);
    kobePlayCollections = [createdCollection];
  }

  const toolkitIds = [
    ...new Set([libraryId, ...kobePlayCollections.map((row) => row.id as string)]),
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
    { data: workspaces, error: workspaceError },
    { data: organizationRoles, error: organizationRoleError },
    { data: projectRoles, error: projectRoleError },
  ] = await Promise.all([
    supabase.from("projects").select("id, organization_id, workspace_id"),
    supabase.from("workspaces").select("id, name, slug"),
    supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("role", "admin"),
    supabase.from("project_members").select("project_id").eq("user_id", userId).eq("role", "admin"),
  ]);
  if (projectError) throw new Error(projectError.message);
  if (workspaceError) throw new Error(workspaceError.message);
  if (organizationRoleError) throw new Error(organizationRoleError.message);
  if (projectRoleError) throw new Error(projectRoleError.message);

  const kobePlayWorkspaceIds = new Set(
    (workspaces ?? [])
      .filter((workspace) => workspace.slug === "kobeplay" || /kobe\s*play/i.test(workspace.name))
      .map((workspace) => workspace.id as string),
  );
  const managedOrganizationIds = new Set(
    (organizationRoles ?? []).map((row) => row.organization_id as string),
  );
  const managedProjectIds = new Set((projectRoles ?? []).map((row) => row.project_id as string));
  const manageableProjects = (projects ?? []).filter(
    (project) =>
      kobePlayWorkspaceIds.has(project.workspace_id as string) &&
      (managedOrganizationIds.has(project.organization_id as string) ||
        managedProjectIds.has(project.id as string)),
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
    const { error } = await supabase
      .from("project_resources")
      .upsert(projectChunks.slice(offset, offset + 500), {
        onConflict: "project_id,resource_id",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(error.message);
    assignedProjects += Math.min(500, projectChunks.length - offset);
  }

  return {
    resources: resourceIds.length,
    collections: kobePlayCollections.length,
    projects: manageableProjects.length,
    projectLinks: assignedProjects,
  };
}
