-- Explicit owner consent updates grants without rotating keys or changing their tenant boundary.
create or replace function public.oc_update_owned_key_access(
  p_key_id uuid, p_profile text, p_custom_scopes text[] default '{}'::text[]
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  actor uuid := auth.uid();
  key_row public.api_keys;
  available text[] := array['openid','mcp:connect','resources:read','resources:write',
    'memory:read','knowledge:read','connections:read','connections:invoke','models:read',
    'models:invoke','tools:invoke','secrets:read','agents:invoke','control:write'];
  requested text[];
  changed boolean;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  requested := case p_profile
    when 'administrator' then available
    when 'developer' then array_remove(available, 'control:write')
    when 'builder' then array_remove(array_remove(available, 'control:write'), 'secrets:read')
    when 'read_only' then array['openid','mcp:connect','resources:read','memory:read',
      'knowledge:read','connections:read','models:read','secrets:read']
    when 'custom' then coalesce(p_custom_scopes, '{}'::text[])
    else null end;
  if requested is null then raise exception 'Unsupported access profile' using errcode = '22023'; end if;
  if exists(select 1 from unnest(requested) s where s is null or not s = any(available)) then
    raise exception 'Unsupported API key permission' using errcode = '22023';
  end if;
  select coalesce(array_agg(s order by array_position(available, s)), '{}'::text[])
    into requested from (select distinct unnest(requested) s) deduplicated;
  if 'control:write' = any(requested) and not exists(
    select 1 from public.user_roles where user_id = actor and role::text in ('admin','owner')
  ) then raise exception 'Administrator permissions require an Admin account' using errcode = '42501'; end if;

  select * into key_row from public.api_keys where id = p_key_id and user_id = actor for update;
  if not found or key_row.revoked_at is not null or
    (key_row.expires_at is not null and key_row.expires_at <= now()) then
    raise exception 'Active owned API key required' using errcode = '42501';
  end if;
  changed := key_row.access_profile is distinct from p_profile or key_row.scopes is distinct from requested;
  if changed then
    update public.api_keys set access_profile = p_profile, scopes = requested
      where id = key_row.id and user_id = actor;
    insert into public.control_audit_events
      (tenant_id,actor_id,agent_id,capability,target,environment,result,correlation_id,evidence)
    values (coalesce(key_row.organization_id,actor),actor,'open-connect-key-management',
      'api_keys.update_access','api_key:' || key_row.id,'production','success',gen_random_uuid(),
      jsonb_build_object('before',jsonb_build_object('profile',key_row.access_profile,'scopes',key_row.scopes),
        'after',jsonb_build_object('profile',p_profile,'scopes',requested),
        'organization_id',key_row.organization_id,'workspace_id',key_row.workspace_id,
        'project_id',key_row.project_id));
  end if;
  return jsonb_build_object('id',key_row.id,'access_profile',p_profile,'scopes',requested,
    'organization_id',key_row.organization_id,'workspace_id',key_row.workspace_id,
    'project_id',key_row.project_id,'expires_at',key_row.expires_at,'unchanged',not changed);
end;
$function$;
revoke all on function public.oc_update_owned_key_access(uuid,text,text[]) from public, anon;
grant execute on function public.oc_update_owned_key_access(uuid,text,text[]) to authenticated;

-- Existing owner RLS permitted arbitrary own-key updates. Keep public creation
-- and one-way revocation, but require the audited RPC for grant/context changes.
revoke update,delete,truncate,references,trigger on public.api_keys from authenticated, anon;
grant update(revoked_at) on public.api_keys to authenticated;

create or replace function public.oc_guard_authenticated_key_write()
returns trigger language plpgsql
set search_path = public, pg_temp
as $function$
declare
  available text[] := array['openid','mcp:connect','resources:read','resources:write',
    'memory:read','knowledge:read','connections:read','connections:invoke','models:read',
    'models:invoke','tools:invoke','secrets:read','agents:invoke','control:write'];
begin
  -- Trusted backend OAuth/key bookkeeping retains its existing service role path.
  if current_user <> 'authenticated' then return new; end if;
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Owned API key required' using errcode='42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.revoked_at is not null or new.revoked_at is null or
      (to_jsonb(old)-'revoked_at') is distinct from (to_jsonb(new)-'revoked_at') then
      raise exception 'Only one-way key revocation is allowed directly' using errcode='42501';
    end if;
    return new;
  end if;
  if new.access_profile is null or new.access_profile not in
    ('read_only','builder','developer','administrator','custom') or new.scopes is null or
    exists(select 1 from unnest(new.scopes) s where s is null or not s=any(available)) then
    raise exception 'Unsupported API key permission' using errcode='22023';
  end if;
  if ('control:write'=any(new.scopes) or new.access_profile='administrator') and not exists(
    select 1 from public.user_roles where user_id=auth.uid() and role::text in ('admin','owner')
  ) then raise exception 'Administrator permissions require an Admin account' using errcode='42501'; end if;
  return new;
end;
$function$;
revoke all on function public.oc_guard_authenticated_key_write() from public,anon,authenticated;
drop trigger if exists oc_authenticated_key_write_guard on public.api_keys;
create trigger oc_authenticated_key_write_guard before insert or update on public.api_keys
  for each row execute function public.oc_guard_authenticated_key_write();
