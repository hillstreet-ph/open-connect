-- Canonical shared RBAC for GitHub OAuth identities.
-- Passwords and OAuth client secrets must remain in provider secret stores.

-- P1 fix: Create the shared schema before referencing it.
create schema if not exists platform_shared;

-- P1 fix: Create project_registry (referenced by sync trigger but was missing).
create table if not exists platform_shared.project_registry (
  project_key text primary key,
  display_name text not null,
  repository text,
  schema_name text,
  environment text not null default 'production',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Older shared-registry deployments used repository/schema metadata but did
-- not include a human-readable display name. Keep both layouts compatible.
alter table platform_shared.project_registry
  add column if not exists display_name text,
  add column if not exists repository text,
  add column if not exists schema_name text,
  add column if not exists environment text not null default 'production';

update platform_shared.project_registry
set display_name = initcap(replace(project_key, '_', ' '))
where display_name is null;

alter table platform_shared.project_registry
  alter column display_name set not null;

-- Seed the four HillStreet projects.
insert into platform_shared.project_registry
  (project_key, display_name, repository, schema_name, environment, enabled)
values
  ('open-connect',    'Open Connect',    'hillstreet-ph/open-connect',    'open_connect',    'production', true),
  ('open-system',     'Open System',     'hillstreet-ph/open-system',     'open_system',     'production', true),
  ('open-model',      'Open Model',      'hillstreet-ph/open-model',      'open_model',      'production', true),
  ('open-hub',        'Open Hub',        'hillstreet-ph/open-hub',        'open_hub',        'production', true),
  ('open-box',        'Open Box',        'hillstreet-ph/open-box',        'open_box',        'production', true),
  ('open-automation', 'Open Automation', 'hillstreet-ph/open-automation', 'open_automation', 'production', true)
on conflict (project_key) do update set
  display_name = excluded.display_name,
  repository = coalesce(platform_shared.project_registry.repository, excluded.repository),
  schema_name = coalesce(platform_shared.project_registry.schema_name, excluded.schema_name),
  environment = coalesce(platform_shared.project_registry.environment, excluded.environment),
  enabled = excluded.enabled;

create table if not exists platform_shared.account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  github_login text,
  role text not null check (role in ('owner','admin','user')),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- P2 fix: Use partial unique index so null/empty emails don't collide.
create unique index if not exists account_roles_email_lower_idx
  on platform_shared.account_roles (lower(email))
  where email is not null and email <> '';

create table if not exists platform_shared.project_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null references platform_shared.project_registry(project_key) on delete cascade,
  role text not null check (role in ('owner','admin','user')),
  created_at timestamptz not null default now(),
  primary key (user_id, project_key)
);

alter table platform_shared.project_registry enable row level security;
alter table platform_shared.account_roles enable row level security;
alter table platform_shared.project_access enable row level security;

-- Project registry is readable by authenticated, writable only by service_role.
drop policy if exists "project_registry_read" on platform_shared.project_registry;
create policy "project_registry_read" on platform_shared.project_registry
for select to authenticated using (true);

create or replace function platform_shared.current_app_role()
returns text language sql stable security definer set search_path = ''
as $$ select role from platform_shared.account_roles where user_id = auth.uid() and approved = true $$;

revoke all on function platform_shared.current_app_role() from public;
grant execute on function platform_shared.current_app_role() to authenticated;

drop policy if exists "account_roles_read_self_or_privileged" on platform_shared.account_roles;
create policy "account_roles_read_self_or_privileged" on platform_shared.account_roles
for select to authenticated using (
  user_id = auth.uid() or platform_shared.current_app_role() in ('owner','admin')
);

drop policy if exists "project_access_read_self_or_privileged" on platform_shared.project_access;
create policy "project_access_read_self_or_privileged" on platform_shared.project_access
for select to authenticated using (
  user_id = auth.uid() or platform_shared.current_app_role() in ('owner','admin')
);

create or replace function platform_shared.sync_authorized_identity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  -- P2 fix: Preserve null emails instead of coalescing to empty string.
  normalized_email text := lower(nullif(trim(coalesce(new.email, '')), ''));
  assigned_role text;
  is_approved boolean := false;
  gh_login text := coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'login'
  );
  auth_provider text := coalesce(
    new.raw_app_meta_data ->> 'provider',
    ''
  );
begin
  -- P2 fix: Only approve GitHub-authenticated identities from the allowlist.
  -- Email/password or other providers are stored but not auto-approved.
  if auth_provider <> 'github' and normalized_email is not null then
    -- Non-GitHub provider: store identity, deny auto-approval.
    insert into platform_shared.account_roles
      (user_id, email, github_login, role, approved, updated_at)
    values
      (new.id, normalized_email, gh_login, 'user', false, now())
    on conflict (user_id) do update set
      email = excluded.email,
      github_login = excluded.github_login,
      updated_at = now();
    return new;
  end if;

  assigned_role := case normalized_email
    when 'tanauancharles1@gmail.com' then 'owner'
    when 'kairocasino8@gmail.com' then 'admin'
    when 'huxleysee@gmail.com' then 'user'
    else 'user'
  end;

  is_approved := normalized_email in (
    'tanauancharles1@gmail.com',
    'kairocasino8@gmail.com',
    'huxleysee@gmail.com'
  );

  insert into platform_shared.account_roles
    (user_id, email, github_login, role, approved, updated_at)
  values
    (new.id, normalized_email, gh_login, assigned_role, is_approved, now())
  on conflict (user_id) do update set
    email = excluded.email,
    github_login = excluded.github_login,
    role = excluded.role,
    approved = excluded.approved,
    updated_at = now();

  -- Rebuild project access for this user.
  delete from platform_shared.project_access where user_id = new.id;

  if is_approved then
    insert into platform_shared.project_access (user_id, project_key, role)
    select new.id, project_key, assigned_role
    from platform_shared.project_registry
    where enabled = true
    on conflict (user_id, project_key) do update set role = excluded.role;
  end if;

  return new;
end;
$$;

revoke all on function platform_shared.sync_authorized_identity() from public;

drop trigger if exists sync_authorized_identity_trigger on auth.users;
create trigger sync_authorized_identity_trigger
after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute function platform_shared.sync_authorized_identity();

-- P2 fix: Reconcile project_access when project_registry changes.
create or replace function platform_shared.reconcile_project_access()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.enabled = true then
    insert into platform_shared.project_access (user_id, project_key, role)
    select ar.user_id, new.project_key, ar.role
    from platform_shared.account_roles ar
    where ar.approved = true
    on conflict (user_id, project_key) do update set role = excluded.role;
  elsif tg_op = 'UPDATE' then
    if old.enabled = true and new.enabled = false then
      delete from platform_shared.project_access where project_key = new.project_key;
    elsif old.enabled = false and new.enabled = true then
      insert into platform_shared.project_access (user_id, project_key, role)
      select ar.user_id, new.project_key, ar.role
      from platform_shared.account_roles ar
      where ar.approved = true
      on conflict (user_id, project_key) do update set role = excluded.role;
    end if;
  elsif tg_op = 'DELETE' then
    delete from platform_shared.project_access where project_key = old.project_key;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function platform_shared.reconcile_project_access() from public;

drop trigger if exists reconcile_project_access_trigger on platform_shared.project_registry;
create trigger reconcile_project_access_trigger
after insert or update or delete on platform_shared.project_registry
for each row execute function platform_shared.reconcile_project_access();

-- P1 fix: Disable the legacy owner-seed trigger (replaced by this RBAC).
drop trigger if exists on_auth_user_created_seed_owner on auth.users;

-- Backfill existing users.
insert into platform_shared.account_roles
  (user_id, email, github_login, role, approved, updated_at)
select
  u.id,
  lower(nullif(trim(coalesce(u.email, '')), '')),
  coalesce(
    u.raw_user_meta_data ->> 'user_name',
    u.raw_user_meta_data ->> 'preferred_username',
    u.raw_user_meta_data ->> 'login'
  ),
  case lower(nullif(trim(coalesce(u.email, '')), ''))
    when 'tanauancharles1@gmail.com' then 'owner'
    when 'kairocasino8@gmail.com' then 'admin'
    else 'user'
  end,
  lower(nullif(trim(coalesce(u.email, '')), '')) in (
    'tanauancharles1@gmail.com',
    'kairocasino8@gmail.com',
    'huxleysee@gmail.com'
  ),
  now()
from auth.users u
on conflict (user_id) do update set
  email = excluded.email,
  github_login = excluded.github_login,
  role = excluded.role,
  approved = excluded.approved,
  updated_at = now();

insert into platform_shared.project_access (user_id, project_key, role)
select ar.user_id, pr.project_key, ar.role
from platform_shared.account_roles ar
cross join platform_shared.project_registry pr
where ar.approved = true and pr.enabled = true
on conflict (user_id, project_key) do update set role = excluded.role;

-- P2 fix: Grant service_role full access for backend administration.
grant usage on schema platform_shared to authenticated, service_role;
grant select on platform_shared.account_roles, platform_shared.project_access, platform_shared.project_registry to authenticated;
grant all on platform_shared.account_roles, platform_shared.project_access, platform_shared.project_registry to service_role;
