-- Consolidate Open-Connect into one organization and one workspace without
-- removing projects or their existing resource assignments.

do $$
declare
  canonical_org public.organizations%rowtype;
  canonical_workspace public.workspaces%rowtype;
begin
  select * into strict canonical_org
  from public.organizations
  where slug = 'hillstreet-ph';

  select * into canonical_workspace
  from public.workspaces
  where organization_id = canonical_org.id
  order by case when slug = 'hoopstreet' then 0 else 1 end, created_at
  limit 1;

  if canonical_workspace.id is null then
    insert into public.workspaces (
      organization_id, name, slug, description, created_by
    ) values (
      canonical_org.id,
      'HillStreet',
      'hillstreet',
      'Single workspace for all HillStreet projects and installed resources.',
      canonical_org.owner_id
    ) returning * into canonical_workspace;
  else
    update public.workspaces
    set name = 'HillStreet',
        slug = 'hillstreet',
        description = 'Single workspace for all HillStreet projects and installed resources.'
    where id = canonical_workspace.id
    returning * into canonical_workspace;
  end if;

  update public.projects
  set organization_id = canonical_org.id,
      workspace_id = canonical_workspace.id
  where organization_id = canonical_org.id
     or workspace_id in (
       select id from public.workspaces where organization_id = canonical_org.id
     );

  update public.api_keys
  set organization_id = canonical_org.id,
      workspace_id = canonical_workspace.id
  where organization_id = canonical_org.id
     or workspace_id in (
       select id from public.workspaces where organization_id = canonical_org.id
     );

  delete from public.workspaces
  where organization_id = canonical_org.id
    and id <> canonical_workspace.id;

  -- Preserve the existing Open-Box project while giving it its canonical slug.
  update public.projects
  set name = 'Open-Box', slug = 'open-box', workspace_id = canonical_workspace.id
  where organization_id = canonical_org.id
    and lower(name) = 'open-box'
    and not exists (
      select 1 from public.projects existing
      where existing.organization_id = canonical_org.id
        and existing.slug = 'open-box'
        and existing.id <> projects.id
    );

  insert into public.projects (
    organization_id, workspace_id, name, slug, description, created_by
  )
  select
    canonical_org.id,
    canonical_workspace.id,
    seed.name,
    seed.slug,
    seed.description,
    canonical_org.owner_id
  from (values
    ('Open-Connect', 'open-connect', 'AI control plane and personal resource workspace.'),
    ('Open-System', 'open-system', 'Agent execution and orchestration plane.'),
    ('Open-Model', 'open-model', 'Model routing and provider gateway.'),
    ('Open-Box', 'open-box', 'Data, artifacts, knowledge, and backups.'),
    ('Open-Secret', 'open-secret', 'Credential and secret gateway.'),
    ('Open-Worker', 'open-worker', 'Governed AI agent workers.'),
    ('Open-Hub', 'open-hub', 'Shared application and operations hub.'),
    ('Open-TGate', 'open-tgate', 'Telegram gateway and automation.'),
    ('Open-Teleset', 'open-teleset', 'Communication and outreach automation.'),
    ('Open-Payment', 'open-payment', 'Payment workflows and integrations.'),
    ('Open-KobePlay', 'open-kobeplay', 'KobePlay product and operations project.')
  ) as seed(name, slug, description)
  on conflict (organization_id, slug) do update
  set workspace_id = excluded.workspace_id,
      name = excluded.name,
      description = excluded.description;

  insert into public.project_members (project_id, user_id, role)
  select project.id, canonical_org.owner_id, 'manager'
  from public.projects project
  where project.organization_id = canonical_org.id
  on conflict (project_id, user_id) do update set role = 'manager';

  insert into public.environments (project_id, name, slug, is_default)
  select project.id, environment.name, environment.slug, environment.is_default
  from public.projects project
  cross join (values
    ('Development', 'development', true),
    ('Staging', 'staging', false),
    ('Production', 'production', false)
  ) as environment(name, slug, is_default)
  where project.organization_id = canonical_org.id
  on conflict (project_id, slug) do nothing;
end $$;
