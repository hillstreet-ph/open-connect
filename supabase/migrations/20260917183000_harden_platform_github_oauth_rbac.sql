-- Require verified GitHub OAuth for automatic shared-platform role approval.
-- Password credentials and OAuth client secrets remain in provider secret stores.

create or replace function platform_shared.sync_authorized_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(nullif(trim(coalesce(new.email, '')), ''));
  github_login text := lower(nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'login',
    ''
  )), ''));
  auth_provider text := lower(coalesce(new.raw_app_meta_data ->> 'provider', ''));
  assigned_role text := 'user';
  is_approved boolean := false;
begin
  if auth_provider = 'github' then
    assigned_role := case normalized_email
      when 'tanauancharles1@gmail.com' then 'owner'
      when 'kairocasino8@gmail.com' then 'admin'
      when 'huxleysee@gmail.com' then 'user'
      else 'user'
    end;

    is_approved :=
      (normalized_email = 'tanauancharles1@gmail.com' and github_login = 'master-kanor')
      or normalized_email in ('kairocasino8@gmail.com', 'huxleysee@gmail.com');
  end if;

  insert into platform_shared.account_roles
    (user_id, email, github_login, role, approved, updated_at)
  values
    (new.id, normalized_email, github_login, assigned_role, is_approved, now())
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

revoke all on function platform_shared.sync_authorized_identity() from public;
