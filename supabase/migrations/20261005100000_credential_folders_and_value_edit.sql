-- Proton-style credential folders with owner-only management and metadata-only project sharing.
-- Credentials remain single-copy in Supabase Vault; folders and projects store references only.

create table if not exists public.credential_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists credential_folders_user_name_idx
  on public.credential_folders(user_id, lower(name));
create index if not exists credential_folders_user_created_idx
  on public.credential_folders(user_id, created_at desc);

create table if not exists public.credential_folder_items (
  folder_id uuid not null references public.credential_folders(id) on delete cascade,
  credential_id uuid not null references public.credential_secrets(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (folder_id, credential_id)
);
create index if not exists credential_folder_items_credential_idx
  on public.credential_folder_items(credential_id);

create table if not exists public.credential_folder_projects (
  folder_id uuid not null references public.credential_folders(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (folder_id, project_id)
);
create index if not exists credential_folder_projects_project_idx
  on public.credential_folder_projects(project_id);

alter table public.credential_folders enable row level security;
alter table public.credential_folder_items enable row level security;
alter table public.credential_folder_projects enable row level security;
revoke all on public.credential_folders from public, anon, authenticated;
revoke all on public.credential_folder_items from public, anon, authenticated;
revoke all on public.credential_folder_projects from public, anon, authenticated;
grant all on public.credential_folders to service_role;
grant all on public.credential_folder_items to service_role;
grant all on public.credential_folder_projects to service_role;

create or replace function public.create_credential_folder(p_name text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_name text := left(trim(coalesce(p_name, '')), 80);
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if length(v_name) = 0 then raise exception 'Folder name required'; end if;
  insert into public.credential_folders(user_id, name)
  values (auth.uid(), v_name)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'name', v_name);
end;
$$;

create or replace function public.list_credential_folders()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', folder.id,
    'name', folder.name,
    'created_at', folder.created_at,
    'updated_at', folder.updated_at,
    'credential_ids', coalesce((
      select jsonb_agg(item.credential_id order by credential.name)
      from public.credential_folder_items item
      join public.credential_secrets credential on credential.id = item.credential_id
      where item.folder_id = folder.id and credential.user_id = auth.uid()
    ), '[]'::jsonb),
    'project_ids', coalesce((
      select jsonb_agg(assignment.project_id order by project.name)
      from public.credential_folder_projects assignment
      join public.projects project on project.id = assignment.project_id
      where assignment.folder_id = folder.id
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', project.id, 'name', project.name) order by project.name)
      from public.credential_folder_projects assignment
      join public.projects project on project.id = assignment.project_id
      where assignment.folder_id = folder.id
    ), '[]'::jsonb)
  ) order by lower(folder.name)), '[]'::jsonb)
  from public.credential_folders folder
  where folder.user_id = auth.uid();
$$;

create or replace function public.update_credential_folder(
  p_folder_id uuid,
  p_name text,
  p_credential_ids uuid[],
  p_project_ids uuid[]
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 80);
  v_credential_ids uuid[];
  v_project_ids uuid[];
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if length(v_name) = 0 then raise exception 'Folder name required'; end if;
  if not exists (
    select 1 from public.credential_folders
    where id = p_folder_id and user_id = auth.uid()
  ) then raise exception 'Folder not found or access denied'; end if;

  select coalesce(array_agg(distinct requested.id), '{}')
    into v_credential_ids
  from unnest(coalesce(p_credential_ids, '{}')) as requested(id);
  select coalesce(array_agg(distinct requested.id), '{}')
    into v_project_ids
  from unnest(coalesce(p_project_ids, '{}')) as requested(id);

  if exists (
    select 1
    from unnest(v_credential_ids) as requested(id)
    left join public.credential_secrets credential
      on credential.id = requested.id and credential.user_id = auth.uid()
    where credential.id is null
  ) then raise exception 'Credential not found or access denied'; end if;

  foreach v_id in array v_project_ids loop
    if not exists (
      select 1 from public.project_members
      where project_id = v_id and user_id = auth.uid()
    ) then raise exception 'Project access denied'; end if;
  end loop;

  update public.credential_folders
  set name = v_name, updated_at = now()
  where id = p_folder_id and user_id = auth.uid();

  delete from public.credential_folder_items item
  where item.folder_id = p_folder_id
    and not (item.credential_id = any(v_credential_ids));
  insert into public.credential_folder_items(folder_id, credential_id)
  select p_folder_id, requested.id
  from unnest(v_credential_ids) as requested(id)
  on conflict (folder_id, credential_id) do nothing;

  delete from public.credential_folder_projects assignment
  where assignment.folder_id = p_folder_id
    and not (assignment.project_id = any(v_project_ids));
  insert into public.credential_folder_projects(folder_id, project_id, added_by)
  select p_folder_id, requested.id, auth.uid()
  from unnest(v_project_ids) as requested(id)
  on conflict (folder_id, project_id) do nothing;

  return jsonb_build_object(
    'id', p_folder_id,
    'name', v_name,
    'credential_ids', to_jsonb(v_credential_ids),
    'project_ids', to_jsonb(v_project_ids)
  );
end;
$$;

create or replace function public.delete_credential_folder(p_folder_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  delete from public.credential_folders
  where id = p_folder_id and user_id = auth.uid();
  return found;
end;
$$;

-- Update a Vault value by rotating its encrypted Vault record. Raw values are never returned.
create or replace function public.update_credential_secret_value(p_id uuid, p_secret_value text)
returns jsonb
language plpgsql security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_type text;
  v_name text;
  v_old_vault_id uuid;
  v_new_vault_id uuid;
begin
  if v_owner is null then raise exception 'unauthorized'; end if;
  if p_secret_value is null or length(p_secret_value) < 4 then
    raise exception 'Secret value required (min 4 characters)';
  end if;

  select secret_type, name, vault_secret_id
    into v_type, v_name, v_old_vault_id
  from public.credential_secrets
  where id = p_id and user_id = v_owner
  for update;
  if not found then raise exception 'Credential not found or access denied'; end if;

  if v_type in ('api_key', 'oauth_token', 'bot_token') and p_secret_value ~ '\s' then
    raise exception 'API keys and tokens cannot contain spaces or sentences';
  end if;

  if exists (
    select 1
    from public.credential_secrets credential
    join vault.decrypted_secrets decrypted on decrypted.id = credential.vault_secret_id
    where credential.user_id = v_owner
      and credential.id <> p_id
      and decrypted.decrypted_secret = p_secret_value
  ) then raise exception 'This credential value is already stored'; end if;

  v_new_vault_id := vault.create_secret(
    p_secret_value,
    'open_connect_' || p_id::text || '_' || gen_random_uuid()::text,
    'Updated Open-Connect credential ' || p_id::text
  );

  update public.credential_secrets
  set secret_value = null,
      vault_secret_id = v_new_vault_id,
      updated_at = now()
  where id = p_id and user_id = v_owner;

  if v_old_vault_id is not null then
    delete from vault.secrets where id = v_old_vault_id;
  end if;

  return jsonb_build_object('id', p_id, 'name', v_name, 'updated_at', now());
end;
$$;

-- Project members receive metadata references, with the owning folder named as the share source.
create or replace function public.list_project_credentials(p_project_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  with shares as (
    select
      assignment.project_id,
      assignment.credential_id,
      assignment.id as direct_id,
      assignment.created_at,
      false as from_folder,
      null::text as folder_name
    from public.project_credentials assignment
    join public.credential_secrets credential on credential.id = assignment.credential_id
    where assignment.project_id = p_project_id
    union all
    select
      folder_assignment.project_id,
      folder_item.credential_id,
      null::uuid as direct_id,
      folder_assignment.created_at,
      true as from_folder,
      folder.name as folder_name
    from public.credential_folder_projects folder_assignment
    join public.credential_folders folder on folder.id = folder_assignment.folder_id
    join public.credential_folder_items folder_item on folder_item.folder_id = folder.id
    join public.credential_secrets credential on credential.id = folder_item.credential_id
    where folder_assignment.project_id = p_project_id
      and folder.user_id = credential.user_id
  ),
  grouped as (
    select
      share.project_id,
      share.credential_id,
      (array_agg(share.direct_id) filter (where share.direct_id is not null))[1] as direct_id,
      bool_or(share.from_folder) as shared_via_folder,
      coalesce(array_agg(distinct share.folder_name) filter (where share.folder_name is not null), '{}') as folder_names,
      min(share.created_at) as created_at
    from shares share
    group by share.project_id, share.credential_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', coalesce(grouped.direct_id::text, grouped.project_id::text || ':' || grouped.credential_id::text),
    'credential_id', credential.id,
    'name', credential.name,
    'secret_type', credential.secret_type,
    'scopes', credential.scopes,
    'shared_via_folder', grouped.shared_via_folder,
    'folder_names', grouped.folder_names,
    'can_remove', not grouped.shared_via_folder
      and (credential.user_id = auth.uid() or public.can_manage_project(grouped.project_id)),
    'created_at', grouped.created_at
  ) order by grouped.created_at desc), '[]'::jsonb)
  from grouped
  join public.credential_secrets credential on credential.id = grouped.credential_id
  where grouped.project_id = p_project_id
    and public.can_access_project(p_project_id);
$$;

revoke all on function public.create_credential_folder(text) from public, anon;
revoke all on function public.list_credential_folders() from public, anon;
revoke all on function public.update_credential_folder(uuid, text, uuid[], uuid[]) from public, anon;
revoke all on function public.delete_credential_folder(uuid) from public, anon;
revoke all on function public.update_credential_secret_value(uuid, text) from public, anon;
revoke all on function public.list_project_credentials(uuid) from public, anon;
grant execute on function public.create_credential_folder(text) to authenticated;
grant execute on function public.list_credential_folders() to authenticated;
grant execute on function public.update_credential_folder(uuid, text, uuid[], uuid[]) to authenticated;
grant execute on function public.delete_credential_folder(uuid) to authenticated;
grant execute on function public.update_credential_secret_value(uuid, text) to authenticated;
grant execute on function public.list_project_credentials(uuid) to authenticated;
