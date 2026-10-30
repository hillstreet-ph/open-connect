-- Native OAuth clients (RFC 8252 §7.3): accept http loopback redirect URIs and
-- match them by host and path so the client's runtime-chosen port is honored.

-- Canonical match key for a redirect URI. https URIs match exactly; http
-- loopback URIs collapse to host + path (port is intentionally ignored).
create or replace function public.oc_redirect_uri_key(p_uri text)
returns text language sql immutable set search_path = pg_temp as $function$
  select case
    when p_uri ~ '^http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]{1,5})?(/[^?#[:space:]]*)?$'
      then 'loopback:' || regexp_replace(
             regexp_replace(
               regexp_replace(p_uri, '^http://', ''),
               ':[0-9]+(?=/|$)', ''
             ),
             '[?#].*$', ''
           )
    else p_uri
  end;
$function$;

revoke all on function public.oc_redirect_uri_key(text) from public;

create or replace function public.oc_register_oauth_client(p_name text, p_redirect_uris text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare cid text := 'oc_cli_' || encode(extensions.gen_random_bytes(24),'hex'); u text;
begin
 if cardinality(p_redirect_uris) is null or cardinality(p_redirect_uris) not between 1 and 5 then raise exception 'Invalid callback list'; end if;
 foreach u in array p_redirect_uris loop
  -- https callbacks for web clients, http loopback callbacks for native clients.
  if u is null
     or length(u) > 2048
     or (
       u !~ '^https://[^/@[:space:]#]+(/[^[:space:]#]*)?$'
       and u !~ '^http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]{1,5})?(/[^[:space:]#]*)?$'
     )
  then raise exception 'HTTPS or loopback callbacks required'; end if;
 end loop;
 insert into public.oauth_clients values(cid,left(coalesce(nullif(p_name,''),'MCP client'),120),p_redirect_uris,now());
 return jsonb_build_object('client_id',cid,'client_name',left(coalesce(nullif(p_name,''),'MCP client'),120),'redirect_uris',p_redirect_uris,'token_endpoint_auth_method','none','grant_types',jsonb_build_array('authorization_code'),'response_types',jsonb_build_array('code'));
end $function$;

-- Port-agnostic loopback matching for consent and the registration check.
create or replace function public.oc_authorize_oauth_client_resource(p_client_id text, p_redirect_uri text, p_challenge text, p_scopes text[], p_resource text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare code text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if p_resource is distinct from 'https://open-connect.site/mcp' then raise exception 'invalid_target'; end if;
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not exists (
    select 1
    from public.oauth_clients
    where client_id = p_client_id
      and public.oc_redirect_uri_key(p_redirect_uri) = any (
        select public.oc_redirect_uri_key(uri) from unnest(redirect_uris) as uri
      )
  ) then
    raise exception 'Unregistered client or callback. Restart the connection from your AI client.';
  end if;

  if p_challenge is null or p_challenge !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Invalid PKCE challenge';
  end if;

  if cardinality(p_scopes) is null
     or cardinality(p_scopes) = 0
     or array_position(p_scopes, null) is not null
     or not p_scopes <@ array[
       'openid',
       'mcp:connect',
       'resources:read',
       'resources:write',
       'memory:read',
       'knowledge:read',
       'connections:read',
       'connections:invoke',
       'models:read',
       'models:invoke',
       'tools:invoke',
       'secrets:read',
       'agents:invoke',
       'control:write'
     ]::text[] then
    raise exception 'Invalid scopes';
  end if;

  if 'control:write' = any(p_scopes) and not exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role::text in ('admin', 'owner')
  ) then
    raise exception 'Administrator permissions require an Admin account' using errcode = '42501';
  end if;

  delete from public.oauth_authorization_codes where expires_at < now();

  insert into public.oauth_authorization_codes(code_hash,user_id,client_id,redirect_uri,challenge,scopes,expires_at,resource)
  values (
    encode(extensions.digest(code, 'sha256'), 'hex'),
    auth.uid(),
    p_client_id,
    p_redirect_uri,
    p_challenge,
    p_scopes,
    now() + interval '5 minutes',
    p_resource
  );

  return code;
end
$function$;

create or replace function public.oc_oauth_client_registered(p_client_id text, p_redirect_uri text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.oauth_clients
    where client_id = p_client_id
      and public.oc_redirect_uri_key(p_redirect_uri) = any (
        select public.oc_redirect_uri_key(uri) from unnest(redirect_uris) as uri
      )
  );
$$;

revoke all on function public.oc_register_oauth_client(text,text[]) from public;
grant execute on function public.oc_register_oauth_client(text,text[]) to anon,authenticated;
revoke all on function public.oc_authorize_oauth_client_resource(text,text,text,text[],text) from public,anon;
grant execute on function public.oc_authorize_oauth_client_resource(text,text,text,text[],text) to authenticated;
revoke all on function public.oc_oauth_client_registered(text,text) from public;
grant execute on function public.oc_oauth_client_registered(text,text) to anon,authenticated;
