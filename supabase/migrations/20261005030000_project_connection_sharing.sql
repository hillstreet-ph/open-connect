-- Explicit project grants for personal app connections. The connection row and secret
-- stay owned by one user; project members receive only safe metadata and brokered use.
drop policy if exists "Users manage own app connections" on public.app_connections;

create table if not exists public.project_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid not null references public.app_connections(id) on delete cascade,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, connection_id)
);
create index if not exists project_connections_connection_id_idx
  on public.project_connections(connection_id);
alter table public.project_connections enable row level security;
revoke all on public.project_connections from public, anon, authenticated;
grant all on public.project_connections to service_role;

create table if not exists public.project_connection_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid not null references public.app_connections(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_name text not null,
  outcome text not null default 'started'
    check (outcome = any(array['started'::text,'succeeded'::text,'failed'::text])),
  error_kind text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists project_connection_audit_project_time_idx
  on public.project_connection_audit(project_id, created_at desc);
alter table public.project_connection_audit enable row level security;
revoke all on public.project_connection_audit from public, anon, authenticated;
grant all on public.project_connection_audit to service_role;

create or replace function public.list_project_connections(p_project_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pc.id,
    'project_id', pc.project_id,
    'connection_id', pc.connection_id,
    'created_at', pc.created_at,
    'can_revoke', (ac.user_id = auth.uid() or public.can_manage_project(pc.project_id)),
    'app_connections', jsonb_build_object(
      'id', ac.id,
      'provider', ac.provider,
      'display_name', ac.display_name,
      'status', ac.status,
      'scopes', ac.scopes
    )
  ) order by pc.created_at desc), '[]'::jsonb)
  from public.project_connections pc
  join public.app_connections ac on ac.id = pc.connection_id
  where pc.project_id = p_project_id
    and public.can_access_project(p_project_id);
$$;

create or replace function public.add_project_connection(p_project_id uuid, p_connection_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.can_access_project(p_project_id) then raise exception 'project access denied'; end if;
  if not exists (
    select 1 from public.app_connections
    where id = p_connection_id and user_id = auth.uid() and status = 'connected'
  ) then raise exception 'only your own verified connection can be shared'; end if;
  insert into public.project_connections(project_id, connection_id, added_by)
  values (p_project_id, p_connection_id, auth.uid())
  on conflict (project_id, connection_id) do update set added_by = excluded.added_by
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'project_id', p_project_id, 'connection_id', p_connection_id);
end;
$$;

create or replace function public.remove_project_connection(p_project_id uuid, p_connection_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  delete from public.project_connections pc
  using public.app_connections ac
  where pc.project_id = p_project_id and pc.connection_id = p_connection_id
    and ac.id = pc.connection_id
    and (ac.user_id = auth.uid() or public.can_manage_project(p_project_id));
  return found;
end;
$$;

revoke all on function public.list_project_connections(uuid) from public, anon;
revoke all on function public.add_project_connection(uuid, uuid) from public, anon;
revoke all on function public.remove_project_connection(uuid, uuid) from public, anon;
grant execute on function public.list_project_connections(uuid) to authenticated;
grant execute on function public.add_project_connection(uuid, uuid) to authenticated;
grant execute on function public.remove_project_connection(uuid, uuid) to authenticated;

-- Project members see credential references as metadata only. This does not reveal
-- secret values or authorize an app connection; connector access is separate.
create or replace function public.list_project_credentials(p_project_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pc.id, 'credential_id', cs.id, 'name', cs.name,
    'secret_type', cs.secret_type, 'scopes', cs.scopes, 'created_at', pc.created_at
  ) order by pc.created_at desc), '[]'::jsonb)
  from public.project_credentials pc
  join public.credential_secrets cs on cs.id = pc.credential_id
  where pc.project_id = p_project_id and public.can_access_project(p_project_id);
$$;

create or replace function public.add_project_credential(p_project_id uuid, p_credential_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.credential_secrets where id=p_credential_id and user_id=auth.uid()) then
    raise exception 'credential not found or access denied';
  end if;
  if not public.can_access_project(p_project_id) then raise exception 'project access denied'; end if;
  insert into public.project_credentials(project_id, credential_id, added_by)
  values (p_project_id, p_credential_id, auth.uid())
  on conflict (project_id, credential_id) do update set added_by=excluded.added_by
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'project_id', p_project_id, 'credential_id', p_credential_id);
end;
$$;

create or replace function public.remove_project_credential(p_project_id uuid, p_credential_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  delete from public.project_credentials pc
  using public.credential_secrets cs
  where pc.project_id=p_project_id and pc.credential_id=p_credential_id
    and cs.id=pc.credential_id
    and (cs.user_id=auth.uid() or public.can_manage_project(p_project_id));
  return found;
end;
$$;

revoke all on function public.list_project_credentials(uuid) from public, anon;
revoke all on function public.add_project_credential(uuid, uuid) from public, anon;
revoke all on function public.remove_project_credential(uuid, uuid) from public, anon;
grant execute on function public.list_project_credentials(uuid) to authenticated;
grant execute on function public.add_project_credential(uuid, uuid) to authenticated;
grant execute on function public.remove_project_credential(uuid, uuid) to authenticated;
