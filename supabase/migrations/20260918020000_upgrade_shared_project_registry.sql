-- Upgrade installations where the original shared RBAC migration already ran.
create schema if not exists platform_shared;

alter table if exists platform_shared.project_registry
  add column if not exists display_name text,
  add column if not exists repository text,
  add column if not exists schema_name text,
  add column if not exists environment text not null default 'production';

update platform_shared.project_registry
set display_name = initcap(replace(project_key, '_', ' '))
where display_name is null;

insert into platform_shared.project_registry
  (project_key, display_name, repository, schema_name, environment, enabled)
values
  ('open-connect', 'Open Connect', 'hillstreet-ph/open-connect', 'open_connect', 'production', true),
  ('open-system', 'Open System', 'hillstreet-ph/open-system', 'open_system', 'production', true),
  ('open-model', 'Open Model', 'hillstreet-ph/open-model', 'open_model', 'production', true),
  ('open-hub', 'Open Hub', 'hillstreet-ph/open-hub', 'open_hub', 'production', true),
  ('open-box', 'Open Box', 'hillstreet-ph/open-box', 'open_box', 'production', true),
  ('open-automation', 'Open Automation', 'hillstreet-ph/open-automation', 'open_automation', 'production', true)
on conflict (project_key) do update set
  display_name = excluded.display_name,
  repository = excluded.repository,
  schema_name = excluded.schema_name,
  environment = excluded.environment,
  enabled = excluded.enabled;
