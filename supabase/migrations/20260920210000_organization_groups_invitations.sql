-- Organization groups and auditable invitations.
-- Existing organization membership remains the source of truth for access.

-- Establish the workspace foundation when upgrading an older Open-Connect database.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique,
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null,
  description text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('manager', 'developer', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  slug text not null check (slug in ('development', 'staging', 'production')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.environments enable row level security;

grant select, insert, update, delete on public.organizations, public.organization_members,
  public.projects, public.project_members, public.environments to authenticated;
grant all on public.organizations, public.organization_members, public.projects,
  public.project_members, public.environments to service_role;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id and user_id = auth.uid()
      and role in ('owner', 'admin')
  ) or exists (
    select 1 from public.organizations
    where id = target_organization_id and owner_id = auth.uid()
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.can_manage_organization(uuid) from public;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;
grant execute on function public.can_manage_organization(uuid) to authenticated, service_role;

drop policy if exists "Members view organizations" on public.organizations;
create policy "Members view organizations" on public.organizations for select to authenticated
  using (owner_id = auth.uid() or public.is_organization_member(id));
drop policy if exists "Users create organizations" on public.organizations;
create policy "Users create organizations" on public.organizations for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists "Owners manage organizations" on public.organizations;
create policy "Owners manage organizations" on public.organizations for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Members view organization memberships" on public.organization_members;
create policy "Members view organization memberships" on public.organization_members for select to authenticated
  using (public.is_organization_member(organization_id));
drop policy if exists "Managers manage organization memberships" on public.organization_members;
create policy "Managers manage organization memberships" on public.organization_members for all to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

drop policy if exists "Members view projects" on public.projects;
create policy "Members view projects" on public.projects for select to authenticated
  using (public.is_organization_member(organization_id));
drop policy if exists "Managers manage projects" on public.projects;
create policy "Managers manage projects" on public.projects for all to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

drop policy if exists "Members view project memberships" on public.project_members;
create policy "Members view project memberships" on public.project_members for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)));
drop policy if exists "Managers manage project memberships" on public.project_members;
create policy "Managers manage project memberships" on public.project_members for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.can_manage_organization(p.organization_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and public.can_manage_organization(p.organization_id)));

drop policy if exists "Members view environments" on public.environments;
create policy "Members view environments" on public.environments for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_organization_member(p.organization_id)));
drop policy if exists "Managers manage environments" on public.environments;
create policy "Managers manage environments" on public.environments for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and public.can_manage_organization(p.organization_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and public.can_manage_organization(p.organization_id)));

create table if not exists public.organization_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.organization_group_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.organization_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  invited_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create index if not exists organization_groups_org_idx
  on public.organization_groups (organization_id, name);
create index if not exists organization_group_members_org_user_idx
  on public.organization_group_members (organization_id, user_id);
create index if not exists organization_invitations_org_status_idx
  on public.organization_invitations (organization_id, status, created_at desc);

alter table public.organization_groups enable row level security;
alter table public.organization_group_members enable row level security;
alter table public.organization_invitations enable row level security;

grant select, insert, update, delete on public.organization_groups to authenticated;
grant select, insert, update, delete on public.organization_group_members to authenticated;
grant select, insert, update, delete on public.organization_invitations to authenticated;
grant all on public.organization_groups, public.organization_group_members,
  public.organization_invitations to service_role;

drop policy if exists "Organization members view groups" on public.organization_groups;
create policy "Organization members view groups" on public.organization_groups
  for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists "Organization managers manage groups" on public.organization_groups;
create policy "Organization managers manage groups" on public.organization_groups
  for all to authenticated using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

drop policy if exists "Organization members view group membership" on public.organization_group_members;
create policy "Organization members view group membership" on public.organization_group_members
  for select to authenticated using (public.is_organization_member(organization_id));
drop policy if exists "Organization managers manage group membership" on public.organization_group_members;
create policy "Organization managers manage group membership" on public.organization_group_members
  for all to authenticated using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

drop policy if exists "Organization managers manage invitations" on public.organization_invitations;
create policy "Organization managers manage invitations" on public.organization_invitations
  for all to authenticated using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

drop trigger if exists organization_groups_touch_updated_at on public.organization_groups;
create trigger organization_groups_touch_updated_at before update on public.organization_groups
  for each row execute function public.touch_updated_at();
drop trigger if exists organization_invitations_touch_updated_at on public.organization_invitations;
create trigger organization_invitations_touch_updated_at before update on public.organization_invitations
  for each row execute function public.touch_updated_at();
