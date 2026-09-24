-- Share general Vault credential references with projects without exposing secret values.
create table if not exists public.project_credentials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  credential_id uuid not null references public.credential_secrets(id) on delete cascade,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, credential_id)
);

alter table public.project_credentials enable row level security;
revoke all on public.project_credentials from public, anon, authenticated;
grant all on public.project_credentials to service_role;

create or replace function public.list_project_credentials(p_project_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pc.id, 'credential_id', cs.id, 'name', cs.name,
    'secret_type', cs.secret_type, 'scopes', cs.scopes, 'created_at', pc.created_at
  ) order by pc.created_at desc), '[]'::jsonb)
  from public.project_credentials pc
  join public.credential_secrets cs on cs.id = pc.credential_id
  where pc.project_id = p_project_id and cs.user_id = auth.uid();
$$;

create or replace function public.add_project_credential(p_project_id uuid, p_credential_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.credential_secrets where id=p_credential_id and user_id=auth.uid()) then
    raise exception 'credential not found or access denied';
  end if;
  if not exists (select 1 from public.project_members where project_id=p_project_id and user_id=auth.uid()) then
    raise exception 'project access denied';
  end if;
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
  delete from public.project_credentials pc using public.credential_secrets cs
  where pc.project_id=p_project_id and pc.credential_id=p_credential_id
    and cs.id=pc.credential_id and cs.user_id=auth.uid();
  return found;
end;
$$;

revoke all on function public.list_project_credentials(uuid) from public;
revoke all on function public.add_project_credential(uuid, uuid) from public;
revoke all on function public.remove_project_credential(uuid, uuid) from public;
grant execute on function public.list_project_credentials(uuid) to authenticated;
grant execute on function public.add_project_credential(uuid, uuid) to authenticated;
grant execute on function public.remove_project_credential(uuid, uuid) to authenticated;
