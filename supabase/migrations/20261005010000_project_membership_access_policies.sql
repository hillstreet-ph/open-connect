-- Enforce project-scoped access for members while keeping organization owners/admins in control.
create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_project(target_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and (
        public.can_manage_organization(p.organization_id)
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id
            and pm.user_id = auth.uid()
            and pm.role = 'manager'
        )
      )
  );
$$;

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.can_manage_project(target_project_id)
      or public.is_project_member(target_project_id);
$$;

create or replace function public.can_access_project_resource(target_resource_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.project_resources pr
    where pr.resource_id = target_resource_id
      and public.can_access_project(pr.project_id)
  );
$$;

revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.can_manage_project(uuid) from public;
revoke all on function public.can_access_project(uuid) from public;
revoke all on function public.can_access_project_resource(uuid) from public;
grant execute on function public.is_project_member(uuid) to authenticated, service_role;
grant execute on function public.can_manage_project(uuid) to authenticated, service_role;
grant execute on function public.can_access_project(uuid) to authenticated, service_role;
grant execute on function public.can_access_project_resource(uuid) to authenticated, service_role;

drop policy if exists "Members view projects" on public.projects;
create policy "Assigned members and organization managers view projects"
  on public.projects for select to authenticated
  using (public.can_access_project(id));

drop policy if exists "Members view project memberships" on public.project_members;
create policy "Project members view project memberships"
  on public.project_members for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists "Managers manage project memberships" on public.project_members;
create policy "Project managers manage project memberships"
  on public.project_members for all to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

drop policy if exists "Members view environments" on public.environments;
create policy "Project members view environments"
  on public.environments for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists "Managers manage environments" on public.environments;
create policy "Project managers manage environments"
  on public.environments for all to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

drop policy if exists "Members view project resources" on public.project_resources;
create policy "Project members view project resources"
  on public.project_resources for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists "Managers manage project resources" on public.project_resources;
create policy "Project managers add project resources"
  on public.project_resources for insert to authenticated
  with check (
    added_by = auth.uid()
    and public.can_manage_project(project_id)
  );
create policy "Project managers update project resources"
  on public.project_resources for update to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));
create policy "Project managers remove project resources"
  on public.project_resources for delete to authenticated
  using (public.can_manage_project(project_id));

drop policy if exists "Members read project resources" on public.resources;
create policy "Assigned members read project resources"
  on public.resources for select to authenticated
  using (public.can_access_project_resource(id));

-- Close stale invitations only when the invited account has verified its email and
-- already has the corresponding organization membership. Unverified invites stay pending.
update public.organization_invitations invitation
set status = 'accepted',
    updated_at = now()
where invitation.status = 'pending'
  and invitation.invited_user_id is not null
  and exists (
    select 1
    from auth.users auth_user
    join public.organization_members membership
      on membership.user_id = auth_user.id
     and membership.organization_id = invitation.organization_id
    where auth_user.id = invitation.invited_user_id
      and auth_user.email_confirmed_at is not null
  );
