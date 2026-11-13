-- Canonicalize HillStreet human roles across platform, organization, and projects.
-- organizations.owner_id remains metadata and no longer grants authorization.

alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.project_members drop constraint if exists project_members_role_check;
alter table public.organization_invitations drop constraint if exists organization_invitations_role_check;

update public.organization_members set role = 'admin' where role = 'owner';
update public.organization_members om
set role = case
  when lower(u.email) = 'sungukkim96@gmail.com' then 'developer'
  when lower(u.email) = 'huxleysee@gmail.com' then 'member'
  else om.role
end
from auth.users u
where u.id = om.user_id
  and lower(u.email) in ('sungukkim96@gmail.com', 'huxleysee@gmail.com');

update public.project_members
set role = case when role = 'manager' then 'admin' when role = 'viewer' then 'member' else role end;

alter table public.organization_members add constraint organization_members_role_check
  check (role = any (array['admin'::text, 'developer'::text, 'member'::text]));
alter table public.project_members add constraint project_members_role_check
  check (role = any (array['admin'::text, 'developer'::text, 'member'::text]));
alter table public.organization_invitations add constraint organization_invitations_role_check
  check (role = any (array['admin'::text, 'developer'::text, 'member'::text]));

update public.organization_invitations oi
set role = case
  when lower(u.email) = 'sungukkim96@gmail.com' then 'developer'
  when lower(u.email) = 'huxleysee@gmail.com' then 'member'
  else oi.role
end,
updated_at = now()
from auth.users u
where oi.invited_user_id = u.id
  and lower(u.email) in ('sungukkim96@gmail.com', 'huxleysee@gmail.com');

-- Convert historical platform Owner / Publisher rows before the UI removes those labels.
insert into public.user_roles (user_id, role)
select user_id, case role::text
  when 'owner' then 'admin'::public.app_role
  when 'publisher' then 'developer'::public.app_role
end
from public.user_roles where role::text in ('owner', 'publisher')
on conflict (user_id, role) do nothing;
delete from public.user_roles where role::text in ('owner', 'publisher');

-- Set one platform role per HillStreet account, matching the finalized roster.
delete from public.user_roles ur
using auth.users u
where u.id = ur.user_id
  and lower(u.email) in (
    'tanauancharles1@gmail.com', 'kairocasino8@gmail.com', 'sungukkim96@gmail.com',
    'tgbacker@gmail.com', 'huxleysee@gmail.com'
  );

insert into public.user_roles (user_id, role)
select u.id, case lower(u.email)
  when 'tanauancharles1@gmail.com' then 'admin'::public.app_role
  when 'kairocasino8@gmail.com' then 'admin'::public.app_role
  when 'sungukkim96@gmail.com' then 'developer'::public.app_role
  when 'tgbacker@gmail.com' then 'user'::public.app_role
  when 'huxleysee@gmail.com' then 'user'::public.app_role
end
from auth.users u
where lower(u.email) in (
  'tanauancharles1@gmail.com', 'kairocasino8@gmail.com', 'sungukkim96@gmail.com',
  'tgbacker@gmail.com', 'huxleysee@gmail.com'
);

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.can_manage_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project_id
      and (
        public.can_manage_organization(p.organization_id)
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.user_id = auth.uid() and pm.role = 'admin'
        )
      )
  );
$$;

drop policy if exists "Owners manage organizations" on public.organizations;
drop policy if exists "Organization admins manage organizations" on public.organizations;
create policy "Organization admins manage organizations"
  on public.organizations for update to authenticated
  using (public.can_manage_organization(id))
  with check (public.can_manage_organization(id));
