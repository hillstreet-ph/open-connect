-- Run only after key_access_fixture.sql and the owned-key-access migration in a disposable database.
set role authenticated;
select set_config('request.jwt.claim.sub','',false);
do $$begin
  begin
    perform public.oc_update_owned_key_access('10000000-0000-4000-8000-000000000001','developer');
    raise exception 'Unauthenticated update accepted';
  exception when insufficient_privilege then null; end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$declare r jsonb; before_row public.api_keys; after_row public.api_keys; n bigint;
begin
  begin update public.api_keys set scopes=array['*'] where id='10000000-0000-4000-8000-000000000001';
    raise exception 'Direct grant bypass allowed'; exception when insufficient_privilege then null; end;
  begin update public.api_keys set project_id=null where id='10000000-0000-4000-8000-000000000001';
    raise exception 'Direct boundary removal allowed'; exception when insufficient_privilege then null; end;
  begin update public.api_keys set expires_at=null where id='10000000-0000-4000-8000-000000000001';
    raise exception 'Direct expiry change allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.api_keys where id='10000000-0000-4000-8000-000000000001';
    raise exception 'Direct deletion allowed'; exception when insufficient_privilege then null; end;
  begin update public.api_keys set revoked_at=null where id='10000000-0000-4000-8000-000000000003';
    raise exception 'Revoked key reactivated'; exception when insufficient_privilege then null; end;
  select * into before_row from public.api_keys where id='10000000-0000-4000-8000-000000000001';
  r := public.oc_update_owned_key_access(before_row.id,'administrator');
  if not (r->'scopes' ? 'knowledge:read') or not (r->'scopes' ? 'control:write') then
    raise exception 'Administrator surface incomplete'; end if;
  if r ? 'key_hash' or r ? 'key_prefix' or r ? 'user_id' then raise exception 'Unexpected credential metadata'; end if;
  select * into after_row from public.api_keys where id=before_row.id;
  if (to_jsonb(before_row)-'scopes'-'access_profile') <> (to_jsonb(after_row)-'scopes'-'access_profile') then
    raise exception 'Token, owner, scope boundary or expiry changed'; end if;
  select count(*) into n from public.control_audit_events;
  if n<>1 then raise exception 'Access update not audited'; end if;
  r := public.oc_update_owned_key_access(before_row.id,'administrator');
  if r->>'unchanged'<>'true' or (select count(*) from public.control_audit_events)<>n then
    raise exception 'Repeated access update is not idempotent'; end if;
  if not exists(select 1 from public.control_audit_events where evidence->'before'->>'profile'='custom'
    and evidence->'after'->>'profile'='administrator') then raise exception 'Rollback evidence missing'; end if;

  begin perform public.oc_update_owned_key_access('10000000-0000-4000-8000-000000000002','developer');
    raise exception 'Foreign key updated'; exception when insufficient_privilege then null; end;
  begin perform public.oc_update_owned_key_access('10000000-0000-4000-8000-000000000003','developer');
    raise exception 'Revoked key updated'; exception when insufficient_privilege then null; end;
  begin perform public.oc_update_owned_key_access('10000000-0000-4000-8000-000000000004','developer');
    raise exception 'Expired key updated'; exception when insufficient_privilege then null; end;
  begin perform public.oc_update_owned_key_access(before_row.id,'legacy');
    raise exception 'Unknown profile accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.oc_update_owned_key_access(before_row.id,'custom',array['*']);
    raise exception 'Wildcard scope accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.oc_update_owned_key_access(before_row.id,'custom',array[null]::text[]);
    raise exception 'Null scope accepted'; exception when invalid_parameter_value then null; end;
  r := public.oc_update_owned_key_access(before_row.id,'custom',array['knowledge:read','knowledge:read']);
  if r->'scopes' <> '["knowledge:read"]'::jsonb then raise exception 'Custom scopes not deduplicated'; end if;
  r := public.oc_update_owned_key_access(before_row.id,'custom',array[]::text[]);
  if r->'scopes' <> '[]'::jsonb then raise exception 'Explicit empty grant rejected'; end if;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$declare owned_id uuid := '10000000-0000-4000-8000-000000000002'; r jsonb;
begin
  begin insert into public.api_keys(id,user_id,scopes,access_profile)
    values(gen_random_uuid(),auth.uid(),array['*'],'custom');
    raise exception 'Direct wildcard insertion allowed'; exception when invalid_parameter_value then null; end;
  begin insert into public.api_keys(id,user_id,scopes,access_profile)
    values(gen_random_uuid(),auth.uid(),array['control:write'],'custom');
    raise exception 'Direct member control insertion allowed'; exception when insufficient_privilege then null; end;
  insert into public.api_keys(id,user_id,scopes,access_profile)
    values('10000000-0000-4000-8000-000000000005',auth.uid(),array['knowledge:read'],'custom');
  update public.api_keys set revoked_at=now() where id='10000000-0000-4000-8000-000000000005';
  if not exists(select 1 from public.api_keys where id='10000000-0000-4000-8000-000000000005' and revoked_at is not null)
    then raise exception 'Normal creation/revocation broken'; end if;
  begin perform public.oc_update_owned_key_access(owned_id,'administrator');
    raise exception 'Member received control permission'; exception when insufficient_privilege then null; end;
  begin perform public.oc_update_owned_key_access(owned_id,'custom',array['control:write']);
    raise exception 'Custom profile bypassed Admin role'; exception when insufficient_privilege then null; end;
  r := public.oc_update_owned_key_access(owned_id,'developer');
  if not (r->'scopes' ? 'knowledge:read') or r->'scopes' ? 'control:write' then
    raise exception 'Member developer permissions incorrect'; end if;
end$$;
reset role;
do $$begin
  if has_function_privilege('anon','public.oc_update_owned_key_access(uuid,text,text[])','execute') then
    raise exception 'Anonymous execution enabled'; end if;
  if not has_function_privilege('authenticated','public.oc_update_owned_key_access(uuid,text,text[])','execute') then
    raise exception 'Authenticated execution missing'; end if;
end$$;
