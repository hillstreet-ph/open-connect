-- Disposable PostgreSQL fixture only; never apply this fixture to a provider.
begin;
do $$
declare
  verifier text := repeat('w',43);
  challenge text := translate(rtrim(encode(extensions.digest(repeat('w',43),'sha256'),'base64'),'='),'+/','-_');
  created jsonb; rotated jsonb; cid text; secret text; code text; token jsonb; listed jsonb;
begin
  if has_function_privilege('anon','public.oc_create_oauth_integration(text,text[])','execute') then raise exception 'Anonymous registration allowed'; end if;
  if has_function_privilege('anon','public.oc_exchange_oauth_code_resource(text,text,text,text,text)','execute') then raise exception 'Unauthenticated exchange still exposed'; end if;
  if not has_function_privilege('anon','public.oc_exchange_oauth_code_client(text,text,text,text,text,text)','execute') then raise exception 'Token endpoint cannot exchange'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  begin
    perform public.oc_create_oauth_integration('Bad', array['http://evil.test/cb']);
    raise exception 'Insecure redirect accepted';
  exception when others then if sqlerrm not like 'Provide 1 to 10%' then raise; end if; end;
  created := public.oc_create_oauth_integration('Fixture connector', array['https://app.test/cb']);
  cid := created->>'client_id'; secret := created->>'client_secret';
  if secret !~ '^oc_sec_[0-9a-f]{64}$' then raise exception 'Secret format'; end if;
  listed := public.oc_list_oauth_integrations();
  if jsonb_array_length(listed) <> 1 or listed::text like '%' || secret || '%' then raise exception 'Listing leaked secret or wrong count'; end if;

  -- Another account cannot see or manage it.
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  if jsonb_array_length(public.oc_list_oauth_integrations()) <> 0 then raise exception 'Cross-account listing'; end if;
  if public.oc_revoke_oauth_integration(cid) then raise exception 'Cross-account revoke'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);

  code := public.oc_authorize_oauth_client_resource(cid,'https://app.test/cb',challenge,array['mcp:connect'],'https://open-connect.site/mcp');
  execute 'set local role anon';
  begin
    perform public.oc_exchange_oauth_code_client(code,verifier,cid,'https://app.test/cb','https://open-connect.site/mcp',null);
    raise exception 'Missing secret accepted';
  exception when others then if sqlerrm <> 'invalid_client' then raise; end if; end;
  begin
    perform public.oc_exchange_oauth_code_client(code,verifier,cid,'https://app.test/cb','https://open-connect.site/mcp','oc_sec_wrong');
    raise exception 'Wrong secret accepted';
  exception when others then if sqlerrm <> 'invalid_client' then raise; end if; end;
  -- Failed client authentication must not consume the code.
  token := public.oc_exchange_oauth_code_client(code,verifier,cid,'https://app.test/cb','https://open-connect.site/mcp',secret);
  if token->>'scope' <> 'mcp:connect' then raise exception 'Scope mismatch'; end if;

  -- Public clients may not present a secret.
  begin
    perform public.oc_exchange_oauth_code_client('x',verifier,'fixture-client','https://example.test/callback','https://open-connect.site/mcp','oc_sec_x');
    raise exception 'Public client secret accepted';
  exception when others then if sqlerrm <> 'invalid_client' then raise; end if; end;

  -- Rotation invalidates the old secret; revocation blocks consent.
  execute 'set local role authenticated';
  rotated := public.oc_rotate_oauth_integration_secret(cid);
  code := public.oc_authorize_oauth_client_resource(cid,'https://app.test/cb',challenge,array['mcp:connect'],'https://open-connect.site/mcp');
  execute 'set local role anon';
  begin
    perform public.oc_exchange_oauth_code_client(code,verifier,cid,'https://app.test/cb','https://open-connect.site/mcp',secret);
    raise exception 'Rotated secret still valid';
  exception when others then if sqlerrm <> 'invalid_client' then raise; end if; end;
  execute 'set local role authenticated';
  if not public.oc_revoke_oauth_integration(cid) then raise exception 'Revoke failed'; end if;
  if public.oc_oauth_client_registered(cid,'https://app.test/cb') then raise exception 'Revoked client still registered'; end if;
  execute 'set local role anon';
  begin
    perform public.oc_exchange_oauth_code_client(code,verifier,cid,'https://app.test/cb','https://open-connect.site/mcp',rotated->>'client_secret');
    raise exception 'Revoked client exchanged';
  exception when others then if sqlerrm <> 'invalid_client' then raise; end if; end;
end $$;
rollback;
