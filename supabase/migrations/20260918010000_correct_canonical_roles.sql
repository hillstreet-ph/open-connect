-- Keep legacy route guards synchronized with verified GitHub identities.

create or replace function private.maybe_seed_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(nullif(trim(coalesce(new.email, '')), ''));
  auth_provider text := coalesce(new.raw_app_meta_data ->> 'provider', '');
  gh_login text := lower(coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'login',
    ''
  ));
  assigned_role public.app_role := 'user'::public.app_role;
begin
  if auth_provider = 'github'
    and normalized_email = 'tanauancharles1@gmail.com'
    and gh_login = 'master-kanor' then
    assigned_role := 'owner'::public.app_role;
  elsif auth_provider = 'github'
    and normalized_email = 'kairocasino8@gmail.com' then
    assigned_role := 'admin'::public.app_role;
  end if;

  delete from public.user_roles where user_id = new.id;
  insert into public.user_roles (user_id, role)
  values (new.id, assigned_role)
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_seed_owner on auth.users;
create trigger on_auth_user_created_seed_owner
after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute function private.maybe_seed_owner();

delete from public.user_roles ur
using auth.users u
where ur.user_id = u.id
  and lower(u.email) in (
    'tanauancharles1@gmail.com',
    'kairocasino8@gmail.com',
    'huxleysee@gmail.com'
  );

insert into public.user_roles (user_id, role)
select
  u.id,
  case
    when coalesce(u.raw_app_meta_data ->> 'provider', '') = 'github'
      and lower(u.email) = 'tanauancharles1@gmail.com'
      and lower(coalesce(
        u.raw_user_meta_data ->> 'user_name',
        u.raw_user_meta_data ->> 'preferred_username',
        u.raw_user_meta_data ->> 'login',
        ''
      )) = 'master-kanor'
      then 'owner'::public.app_role
    when coalesce(u.raw_app_meta_data ->> 'provider', '') = 'github'
      and lower(u.email) = 'kairocasino8@gmail.com'
      then 'admin'::public.app_role
    else 'user'::public.app_role
  end
from auth.users u
where lower(u.email) in (
  'tanauancharles1@gmail.com',
  'kairocasino8@gmail.com',
  'huxleysee@gmail.com'
)
on conflict (user_id, role) do nothing;
