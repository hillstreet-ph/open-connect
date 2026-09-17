-- Correct legacy owner seeding and enforce the canonical Open-Connect roles.

create or replace function private.maybe_seed_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) = 'tanauancharles1@gmail.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'owner')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

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
  id,
  case lower(email)
    when 'tanauancharles1@gmail.com' then 'owner'::public.app_role
    when 'kairocasino8@gmail.com' then 'admin'::public.app_role
    else 'user'::public.app_role
  end
from auth.users
where lower(email) in (
  'tanauancharles1@gmail.com',
  'kairocasino8@gmail.com',
  'huxleysee@gmail.com'
)
on conflict (user_id, role) do nothing;
