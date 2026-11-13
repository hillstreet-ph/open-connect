-- Seed the canonical owner workspace and common-use groups idempotently.

insert into public.organizations (name, slug, owner_id)
select 'HillStreet Information Technology Services', 'hillstreet', id
from auth.users
where lower(email) = lower('tanauancharles1@gmail.com')
on conflict (slug) do update set
  name = excluded.name,
  owner_id = excluded.owner_id;

insert into public.organization_members (organization_id, user_id, role)
select organization.id, owner_user.id, 'owner'
from public.organizations organization
join auth.users owner_user on lower(owner_user.email) = lower('tanauancharles1@gmail.com')
where organization.slug = 'hillstreet'
on conflict (organization_id, user_id) do update set role = 'owner';

insert into public.organization_groups (organization_id, name, description, created_by)
select organization.id, seed.name, seed.description, owner_user.id
from public.organizations organization
join auth.users owner_user on lower(owner_user.email) = lower('tanauancharles1@gmail.com')
cross join (
  values
    ('Engineering', 'Developers, DevOps, data, security, and platform engineering.'),
    ('Operations', 'Day-to-day operations, support, automation, and delivery.'),
    ('Administration', 'Workspace administrators, billing, policy, and member management.')
) as seed(name, description)
where organization.slug = 'hillstreet'
on conflict (organization_id, name) do update set description = excluded.description;

insert into public.organization_group_members (organization_id, group_id, user_id, added_by)
select organization.id, organization_group.id, owner_user.id, owner_user.id
from public.organizations organization
join public.organization_groups organization_group on organization_group.organization_id = organization.id
join auth.users owner_user on lower(owner_user.email) = lower('tanauancharles1@gmail.com')
where organization.slug = 'hillstreet' and organization_group.name = 'Administration'
on conflict (group_id, user_id) do nothing;

revoke execute on function public.is_organization_member(uuid) from anon;
revoke execute on function public.can_manage_organization(uuid) from anon;
