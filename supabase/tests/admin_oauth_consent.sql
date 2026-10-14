-- Disposable database only. Never run against production; all test writes roll back.
begin;
do $$
declare
  code text;
  verifier text := repeat('v', 43);
  challenge text;
  result jsonb;
  requested text[] := array['mcp:connect', 'control:write'];
  before_count bigint;
begin
  challenge := translate(rtrim(encode(extensions.digest(verifier, 'sha256'), 'base64'), '='), '+/', '-_');
  if has_function_privilege('anon', 'public.oc_authorize_oauth_client(text,text,text,text[])', 'execute') then
    raise exception 'Anonymous consent was granted';
  end if;
  if not has_function_privilege('anon', 'public.oc_exchange_oauth_code(text,text,text,text)', 'execute') then
    raise exception 'Public PKCE exchange is unavailable';
  end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.oc_authorize_oauth_client('fixture-client', 'https://example.test/callback', challenge, requested);
    raise exception 'Unauthenticated consent succeeded';
  exception when others then
    if sqlerrm <> 'Sign in required' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  begin
    perform public.oc_authorize_oauth_client('fixture-client', 'https://example.test/callback', challenge, requested);
    raise exception 'Member admin consent succeeded';
  exception when insufficient_privilege then null; end;
  code := public.oc_authorize_oauth_client('fixture-client', 'https://example.test/callback', challenge, array['mcp:connect']);
  execute 'set local role anon';
  result := public.oc_exchange_oauth_code(code, verifier, 'fixture-client', 'https://example.test/callback');
  if result->>'scope' <> 'mcp:connect' then raise exception 'Member scope was expanded'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  begin
    perform public.oc_authorize_oauth_client('fixture-client', 'https://other.test/callback', challenge, requested);
    raise exception 'Unregistered callback accepted';
  exception when others then
    if sqlerrm not like 'Unregistered client or callback%' then raise; end if;
  end;
  begin
    perform public.oc_authorize_oauth_client('fixture-client', 'https://example.test/callback', 'bad', requested);
    raise exception 'Invalid PKCE accepted';
  exception when others then
    if sqlerrm <> 'Invalid PKCE challenge' then raise; end if;
  end;
  begin
    perform public.oc_authorize_oauth_client('fixture-client', 'https://example.test/callback', challenge, array['admin:*']);
    raise exception 'Unsupported scope accepted';
  exception when others then
    if sqlerrm <> 'Invalid scopes' then raise; end if;
  end;
  code := public.oc_authorize_oauth_client('fixture-client', 'https://example.test/callback', challenge, requested);
  execute 'set local role anon';
  begin
    perform public.oc_exchange_oauth_code(code, repeat('x', 43), 'fixture-client', 'https://example.test/callback');
    raise exception 'Wrong verifier accepted';
  exception when others then
    if sqlerrm <> 'invalid_grant' then raise; end if;
  end;
  begin
    perform public.oc_exchange_oauth_code(code, verifier, 'other-client', 'https://example.test/callback');
    raise exception 'Wrong client accepted';
  exception when others then
    if sqlerrm <> 'invalid_grant' then raise; end if;
  end;
  result := public.oc_exchange_oauth_code(code, verifier, 'fixture-client', 'https://example.test/callback');
  if result->>'scope' <> array_to_string(requested, ' ') or (result->>'expires_in')::integer <> 2592000 then
    raise exception 'Admin grant scope or lifetime changed';
  end if;
  begin
    perform public.oc_exchange_oauth_code(code, verifier, 'fixture-client', 'https://example.test/callback');
    raise exception 'Code replay accepted';
  exception when others then
    if sqlerrm <> 'invalid_grant' then raise; end if;
  end;

  execute 'set local role authenticated';
  code := public.oc_authorize_oauth_client('fixture-client', 'https://example.test/callback', challenge, requested);
  execute 'reset role';
  update public.oauth_authorization_codes set expires_at = now() - interval '1 second';
  execute 'set local role anon';
  begin
    perform public.oc_exchange_oauth_code(code, verifier, 'fixture-client', 'https://example.test/callback');
    raise exception 'Expired code accepted';
  exception when others then
    if sqlerrm <> 'invalid_grant' then raise; end if;
  end;

  execute 'set local role authenticated';
  code := public.oc_authorize_oauth_client('fixture-client', 'https://example.test/callback', challenge, requested);
  execute 'reset role';
  delete from public.user_roles where user_id = '00000000-0000-4000-8000-000000000001';
  select count(*) into before_count from public.api_keys;
  execute 'set local role anon';
  begin
    perform public.oc_exchange_oauth_code(code, verifier, 'fixture-client', 'https://example.test/callback');
    raise exception 'Demoted admin received a token';
  exception when others then
    if sqlerrm <> 'invalid_grant' then raise; end if;
  end;
  execute 'reset role';
  if (select count(*) from public.api_keys) <> before_count then raise exception 'Rejected exchange created a key'; end if;
end;
$$;
rollback;
