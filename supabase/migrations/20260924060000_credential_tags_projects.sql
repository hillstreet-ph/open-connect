-- Organize Vault credentials with custom tags and project references.
-- Secret values remain single-copy in Vault; project rows store only opaque IDs.

alter table public.credential_secrets
  add column if not exists tags text[] not null default '{}';

create index if not exists credential_secrets_tags_idx
  on public.credential_secrets using gin(tags);

create or replace function public.assert_credential_value_unique(p_secret_value text)
returns boolean language plpgsql security definer set search_path = public, vault, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if exists (
    select 1
    from public.credential_secrets credential
    join vault.decrypted_secrets decrypted on decrypted.id = credential.vault_secret_id
    where credential.user_id = auth.uid()
      and decrypted.decrypted_secret = p_secret_value
  ) then
    raise exception 'This credential value is already stored';
  end if;
  return true;
end;
$$;

create or replace function public.organize_credential(
  p_credential_id uuid,
  p_tags text[],
  p_project_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tags text[];
  v_project_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (
    select 1 from public.credential_secrets
    where id = p_credential_id and user_id = auth.uid()
  ) then raise exception 'credential not found or access denied'; end if;

  select coalesce(array_agg(tag order by tag), '{}') into v_tags
  from (
    select distinct lower(left(trim(value), 40)) as tag
    from unnest(coalesce(p_tags, '{}')) value
    where length(trim(value)) between 1 and 40
    limit 20
  ) normalized;

  update public.credential_secrets set tags = v_tags where id = p_credential_id;

  foreach v_project_id in array coalesce(p_project_ids, '{}') loop
    if not exists (
      select 1 from public.project_members
      where project_id = v_project_id and user_id = auth.uid()
    ) then raise exception 'project access denied'; end if;
    insert into public.project_credentials(project_id, credential_id, added_by)
    values (v_project_id, p_credential_id, auth.uid())
    on conflict (project_id, credential_id) do nothing;
  end loop;

  return jsonb_build_object(
    'credential_id', p_credential_id,
    'tags', v_tags,
    'project_ids', coalesce(p_project_ids, '{}')
  );
end;
$$;

create or replace function public.list_credential_secrets()
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', credential.id,
    'name', credential.name,
    'secret_type', credential.secret_type,
    'email_address', credential.email_address,
    'username', credential.username,
    'website', credential.website,
    'notes', credential.notes,
    'tags', credential.tags,
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', project.id, 'name', project.name) order by project.name)
      from public.project_credentials assignment
      join public.projects project on project.id = assignment.project_id
      where assignment.credential_id = credential.id
    ), '[]'::jsonb),
    'last_used_at', credential.last_used_at,
    'created_at', credential.created_at,
    'updated_at', credential.updated_at,
    'has_secret', credential.vault_secret_id is not null,
    'has_totp', credential.totp_vault_secret_id is not null or credential.secret_type = 'totp'
  ) order by credential.created_at desc), '[]'::jsonb)
  from public.credential_secrets credential
  where credential.user_id = auth.uid();
$$;

revoke all on function public.assert_credential_value_unique(text) from public, anon;
revoke all on function public.organize_credential(uuid, text[], uuid[]) from public, anon;
grant execute on function public.assert_credential_value_unique(text) to authenticated;
grant execute on function public.organize_credential(uuid, text[], uuid[]) to authenticated;
