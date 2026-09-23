-- Consolidate the owner account into one organization with two clear workspaces.
-- Existing projects, groups and memberships are preserved and reassigned before
-- duplicate organization records are removed.

do $$
declare
  canonical_org uuid := 'e1a3d54f-0f55-4237-92b7-0d7c4cde39af';
  legacy_hillstreet uuid := 'c78db364-5b6d-487a-b94d-56b0c8f4bf0d';
  legacy_kobeplay uuid := '424a4095-6640-4df2-b79c-e1f611c56eff';
  hoopstreet_workspace uuid := 'b46caede-d759-48db-9ac7-69d4a9c91c1a';
  kobeplay_workspace uuid := 'b8bb1027-14d4-4934-b86d-55b5b96048dd';
begin
  update public.organizations
  set name = 'hillstreet-ph', slug = 'hillstreet-ph'
  where id = canonical_org;

  update public.workspaces
  set name = 'HoopStreet', slug = 'hoopstreet',
      description = 'HoopStreet products, development, and digital ventures.'
  where id = hoopstreet_workspace;

  update public.workspaces
  set organization_id = canonical_org, name = 'KobePlay', slug = 'kobeplay',
      description = 'KobePlay campaigns, operations, and client delivery.'
  where id = kobeplay_workspace;

  update public.projects
  set organization_id = canonical_org, workspace_id = kobeplay_workspace
  where id = 'b76d47b1-dd3f-4442-8807-c21cb4b15cff';

  update public.organization_groups
  set organization_id = canonical_org
  where organization_id = legacy_hillstreet;

  update public.organization_group_members
  set organization_id = canonical_org
  where organization_id = legacy_hillstreet;

  delete from public.organization_members
  where organization_id in (legacy_hillstreet, legacy_kobeplay);

  delete from public.workspaces
  where organization_id = legacy_hillstreet;

  delete from public.organizations
  where id in (legacy_hillstreet, legacy_kobeplay);
end $$;

