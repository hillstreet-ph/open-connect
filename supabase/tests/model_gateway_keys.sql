-- Disposable database only; run after fixtures and model key migration.
do $$declare raw text := 'sk-oc-' || repeat('a',32); kid uuid := gen_random_uuid(); r jsonb;
begin
  insert into public.api_keys(id,user_id,key_prefix,key_hash,scopes,access_profile)
  values(kid,'00000000-0000-4000-8000-000000000001','sk-oc-aaaaaa',
    encode(extensions.digest(raw,'sha256'),'hex'),array['models:read','models:invoke'],'custom');
  r := public.oc_verify_gateway_key(raw);
  if r->>'id' <> kid::text or r->'scopes' <> '["models:read","models:invoke"]'::jsonb then
    raise exception 'Model key failed verification'; end if;
  begin update public.api_keys set scopes=array['mcp:connect'] where id=kid;
    raise exception 'Model key scope expansion accepted'; exception when check_violation then null; end;
  -- Untrusted insertion metadata cannot grant integration permissions to an sk key.
  update public.api_keys set key_prefix='oc_live_legacy',scopes=array['models:read','control:write'] where id=kid;
  r := public.oc_verify_gateway_key(raw);
  if r->'scopes' <> '["models:read"]'::jsonb then raise exception 'Prefix metadata bypass'; end if;
  update public.api_keys set expires_at=now()-interval '1 second' where id=kid;
  if public.oc_verify_gateway_key(raw) is not null then raise exception 'Expired key accepted'; end if;
  update public.api_keys set expires_at=null,revoked_at=now() where id=kid;
  if public.oc_verify_gateway_key(raw) is not null then raise exception 'Revoked key accepted'; end if;
  if public.oc_verify_gateway_key('sk-oc-' || repeat('b',32)) is not null then raise exception 'Unknown key accepted'; end if;
  raw := 'oc_live_' || repeat('c',64);
  insert into public.api_keys(id,user_id,key_prefix,key_hash,scopes,access_profile)
  values(gen_random_uuid(),'00000000-0000-4000-8000-000000000001','oc_live_cccccc',
    encode(extensions.digest(raw,'sha256'),'hex'),array['mcp:connect'],'custom');
  if public.oc_verify_gateway_key(raw)->'scopes' <> '["mcp:connect"]'::jsonb then
    raise exception 'Legacy compatibility broken'; end if;
end$$;
