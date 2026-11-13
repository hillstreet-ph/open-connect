-- Reconcile the canonical production accounts across Google, GitHub, and
-- password sign-in. Role assignment is restricted to the exact verified email
-- allowlist and is mirrored into both legacy and shared RBAC tables.

create or replace function private.maybe_seed_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(nullif(trim(coalesce(new.email, '')), ''));
  assigned_role public.app_role := case normalized_email
    when 'tanauancharles1@gmail.com' then 'owner'::public.app_role
    when 'kairocasino8@gmail.com' then 'admin'::public.app_role
    else 'user'::public.app_role
  end;
begin
  delete from public.user_roles where user_id = new.id;
  insert into public.user_roles (user_id, role)
  values (new.id, assigned_role)
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

create or replace function platform_shared.sync_authorized_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(nullif(trim(coalesce(new.email, '')), ''));
  assigned_role text := case normalized_email
    when 'tanauancharles1@gmail.com' then 'owner'
    when 'kairocasino8@gmail.com' then 'admin'
    else 'user'
  end;
  is_approved boolean := normalized_email in (
    'tanauancharles1@gmail.com',
    'kairocasino8@gmail.com',
    'huxleysee@gmail.com'
  );
  gh_login text := coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'login'
  );
begin
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

-- Reconcile existing identities immediately instead of waiting for the next login.
delete from public.user_roles ur
using auth.users u
where ur.user_id = u.id
  and lower(u.email) in (
    'tanauancharles1@gmail.com',
    'kairocasino8@gmail.com',
    'huxleysee@gmail.com'
  );

insert into public.user_roles (user_id, role)
select u.id, case lower(u.email)
  when 'tanauancharles1@gmail.com' then 'owner'::public.app_role
  when 'kairocasino8@gmail.com' then 'admin'::public.app_role
  else 'user'::public.app_role
end
from auth.users u
where lower(u.email) in (
  'tanauancharles1@gmail.com',
  'kairocasino8@gmail.com',
  'huxleysee@gmail.com'
)
on conflict (user_id, role) do nothing;

insert into platform_shared.account_roles
  (user_id, email, github_login, role, approved, updated_at)
select
  u.id,
  lower(u.email),
  coalesce(
    u.raw_user_meta_data ->> 'user_name',
    u.raw_user_meta_data ->> 'preferred_username',
    u.raw_user_meta_data ->> 'login'
  ),
  case lower(u.email)
    when 'tanauancharles1@gmail.com' then 'owner'
    when 'kairocasino8@gmail.com' then 'admin'
    else 'user'
  end,
  true,
  now()
from auth.users u
where lower(u.email) in (
  'tanauancharles1@gmail.com',
  'kairocasino8@gmail.com',
  'huxleysee@gmail.com'
)
on conflict (user_id) do update set
  email = excluded.email,
  github_login = excluded.github_login,
  role = excluded.role,
  approved = true,
  updated_at = now();

delete from platform_shared.project_access pa
using auth.users u
where pa.user_id = u.id
  and lower(u.email) in (
    'tanauancharles1@gmail.com',
    'kairocasino8@gmail.com',
    'huxleysee@gmail.com'
  );

insert into platform_shared.project_access (user_id, project_key, role)
select
  u.id,
  pr.project_key,
  case lower(u.email)
    when 'tanauancharles1@gmail.com' then 'owner'
    when 'kairocasino8@gmail.com' then 'admin'
    else 'user'
  end
from auth.users u
cross join platform_shared.project_registry pr
where lower(u.email) in (
  'tanauancharles1@gmail.com',
  'kairocasino8@gmail.com',
  'huxleysee@gmail.com'
)
and pr.enabled = true
on conflict (user_id, project_key) do update set role = excluded.role;
