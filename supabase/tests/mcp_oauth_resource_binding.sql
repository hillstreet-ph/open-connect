-- Disposable PostgreSQL fixture only; never apply this fixture to a provider.
begin;
do $$
declare
  code text;
  verifier text := repeat('v',43);
  challenge text := translate(rtrim(encode(extensions.digest(repeat('v',43),'sha256'),'base64'),'='),'+/','-_');
  token jsonb;
  verified jsonb;
begin
  if has_function_privilege('anon','public.oc_authorize_oauth_client_resource(text,text,text,text[],text)','execute') then raise exception 'Anonymous consent allowed'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  if not public.oc_oauth_client_registered('fixture-client','https://example.test/callback') or public.oc_oauth_client_registered('fixture-client','https://evil.test/callback') then raise exception 'Callback registration mismatch'; end if;
  begin
    perform public.oc_authorize_oauth_client_resource('fixture-client','https://example.test/callback',challenge,array['mcp:connect'],'https://other.test/mcp');
    raise exception 'Wrong resource consent accepted';
  exception when others then if sqlerrm <> 'invalid_target' then raise; end if; end;
  code := public.oc_authorize_oauth_client_resource('fixture-client','https://example.test/callback',challenge,array['mcp:connect'],'https://open-connect.site/mcp');
  execute 'set local role anon';
  begin
    perform public.oc_exchange_oauth_code_resource(code,verifier,'fixture-client','https://example.test/callback','https://other.test/mcp');
    raise exception 'Wrong target redeemed';
  exception when others then if sqlerrm <> 'invalid_target' then raise; end if; end;
  -- Wrong target must not consume the valid code.
  token := public.oc_exchange_oauth_code_resource(code,verifier,'fixture-client','https://example.test/callback','https://open-connect.site/mcp');
  verified := public.oc_verify_gateway_key(token->>'access_token');
  if verified->>'oauth_resource' <> 'https://open-connect.site/mcp' then raise exception 'Audience not bound'; end if;
  if token->>'scope' <> 'mcp:connect' then raise exception 'Scope escalation'; end if;
  begin
    perform public.oc_exchange_oauth_code_resource(code,verifier,'fixture-client','https://example.test/callback','https://open-connect.site/mcp');
    raise exception 'Replay accepted';
  exception when others then if sqlerrm <> 'invalid_grant' then raise; end if; end;
end $$;
rollback;
