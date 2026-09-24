-- Let owners reorganize existing credentials without touching Vault values.
-- The selected project IDs replace the prior assignment set atomically.

create or replace function public.update_credential_organization(
  p_credential_id uuid,
  p_notes text,
  p_tags text[],
  p_project_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tags text[];
  v_project_ids uuid[];
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

  select coalesce(array_agg(distinct value), '{}') into v_project_ids
  from unnest(coalesce(p_project_ids, '{}')) value;

  foreach v_project_id in array v_project_ids loop
    if not exists (
      select 1 from public.project_members
      where project_id = v_project_id and user_id = auth.uid()
    ) then raise exception 'project access denied'; end if;
  end loop;

  update public.credential_secrets
  set tags = v_tags,
      notes = left(coalesce(p_notes, ''), 4000),
      updated_at = now()
  where id = p_credential_id and user_id = auth.uid();

  delete from public.project_credentials assignment
  where assignment.credential_id = p_credential_id
    and not (assignment.project_id = any(v_project_ids));

  foreach v_project_id in array v_project_ids loop
    insert into public.project_credentials(project_id, credential_id, added_by)
    values (v_project_id, p_credential_id, auth.uid())
    on conflict (project_id, credential_id) do nothing;
  end loop;

  return jsonb_build_object(
    'credential_id', p_credential_id,
    'notes', left(coalesce(p_notes, ''), 4000),
    'tags', v_tags,
    'project_ids', v_project_ids
  );
end;
$$;

revoke all on function public.update_credential_organization(uuid, text, text[], uuid[])
  from public, anon;
grant execute on function public.update_credential_organization(uuid, text, text[], uuid[])
  to authenticated;
