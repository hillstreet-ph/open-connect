-- Registered OAuth integrations: account-owned confidential clients.
--
-- Dynamic client registration (/oauth/register) keeps creating public PKCE
-- clients. This migration lets a signed-in user register a named integration
-- with redirect URLs and receive a client ID plus a client secret that is
-- shown once. Only a SHA-256 digest of the secret is stored.
--
-- Confidential clients still use PKCE (OAuth 2.1); the secret is an additional
-- proof at the token endpoint. The token exchange now runs through
-- oc_exchange_oauth_code_client so the secret check cannot be skipped by
-- calling the older exchange functions directly through the Data API.

alter table public.oauth_clients
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists client_secret_hash text,
  add column if not exists client_secret_prefix text,
  add column if not exists secret_rotated_at timestamptz,
  add column if not exists revoked_at timestamptz;

create index if not exists oauth_clients_owner_user_id_idx
  on public.oauth_clients(owner_user_id)
  where owner_user_id is not null;

-- Shared redirect URI validation (same rules as dynamic registration).
create or replace function public.oc_valid_oauth_redirect_uris(p_redirect_uris text[])
returns boolean language plpgsql immutable set search_path = pg_temp as $function$
declare u text;
begin
  if cardinality(p_redirect_uris) is null or cardinality(p_redirect_uris) not between 1 and 10 then
    return false;
  end if;
  foreach u in array p_redirect_uris loop
    if u is null
       or length(u) > 2048
       or (
         u !~ '^https://[^/@[:space:]#]+(/[^[:space:]#]*)?$'
         and u !~ '^http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]{1,5})?(/[^[:space:]#]*)?$'
       )
    then return false; end if;
  end loop;
  return true;
end $function$;

create or replace function public.oc_create_oauth_integration(p_name text, p_redirect_uris text[])
returns jsonb language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare
  cid text := 'oc_cli_' || encode(extensions.gen_random_bytes(24), 'hex');
  secret text := 'oc_sec_' || encode(extensions.gen_random_bytes(32), 'hex');
  clean_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if length(clean_name) not between 1 and 120 then raise exception 'Name must be 1 to 120 characters'; end if;
  if not public.oc_valid_oauth_redirect_uris(p_redirect_uris) then
    raise exception 'Provide 1 to 10 HTTPS or loopback redirect URLs';
  end if;
  if (select count(*) from public.oauth_clients where owner_user_id = auth.uid() and revoked_at is null) >= 25 then
    raise exception 'Integration limit reached. Revoke an unused integration first.';
  end if;
  insert into public.oauth_clients(client_id, client_name, redirect_uris, created_at, owner_user_id, client_secret_hash, client_secret_prefix, secret_rotated_at)
  values (cid, clean_name, p_redirect_uris, now(), auth.uid(), encode(extensions.digest(secret, 'sha256'), 'hex'), left(secret, 14), now());
  return jsonb_build_object(
    'client_id', cid,
    'client_secret', secret,
    'client_name', clean_name,
    'redirect_uris', p_redirect_uris,
    'token_endpoint_auth_method', 'client_secret_basic'
  );
end $function$;

create or replace function public.oc_list_oauth_integrations()
returns jsonb language sql stable security definer
set search_path to 'public', 'pg_temp' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'client_id', client_id,
    'client_name', client_name,
    'redirect_uris', redirect_uris,
    'client_secret_prefix', client_secret_prefix,
    'created_at', created_at,
    'secret_rotated_at', secret_rotated_at,
    'revoked_at', revoked_at
  ) order by created_at desc), '[]'::jsonb)
  from public.oauth_clients
  where owner_user_id = auth.uid();
$function$;

create or replace function public.oc_update_oauth_integration(p_client_id text, p_name text, p_redirect_uris text[])
returns jsonb language plpgsql security definer
set search_path to 'public', 'pg_temp' as $function$
declare clean_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if length(clean_name) not between 1 and 120 then raise exception 'Name must be 1 to 120 characters'; end if;
  if not public.oc_valid_oauth_redirect_uris(p_redirect_uris) then
    raise exception 'Provide 1 to 10 HTTPS or loopback redirect URLs';
  end if;
  update public.oauth_clients
     set client_name = clean_name, redirect_uris = p_redirect_uris
   where client_id = p_client_id and owner_user_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'Integration not found'; end if;
  -- Pending codes were issued for the previous callback list.
  delete from public.oauth_authorization_codes where client_id = p_client_id;
  return jsonb_build_object('client_id', p_client_id, 'client_name', clean_name, 'redirect_uris', p_redirect_uris);
end $function$;

create or replace function public.oc_rotate_oauth_integration_secret(p_client_id text)
returns jsonb language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare secret text := 'oc_sec_' || encode(extensions.gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  update public.oauth_clients
     set client_secret_hash = encode(extensions.digest(secret, 'sha256'), 'hex'),
         client_secret_prefix = left(secret, 14),
         secret_rotated_at = now()
   where client_id = p_client_id and owner_user_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'Integration not found'; end if;
  return jsonb_build_object('client_id', p_client_id, 'client_secret', secret);
end $function$;

create or replace function public.oc_revoke_oauth_integration(p_client_id text)
returns boolean language plpgsql security definer
set search_path to 'public', 'pg_temp' as $function$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  update public.oauth_clients
     set revoked_at = now(), client_secret_hash = null
   where client_id = p_client_id and owner_user_id = auth.uid() and revoked_at is null;
  if not found then return false; end if;
  delete from public.oauth_authorization_codes where client_id = p_client_id;
  return true;
end $function$;

-- Revoked clients can no longer start consent.
create or replace function public.oc_oauth_client_registered(p_client_id text, p_redirect_uri text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.oauth_clients
    where client_id = p_client_id
      and revoked_at is null
      and public.oc_redirect_uri_key(p_redirect_uri) = any (
        select public.oc_redirect_uri_key(uri) from unnest(redirect_uris) as uri
      )
  );
$$;

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

  if not public.oc_oauth_client_registered(p_client_id, p_redirect_uri) then
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

-- Token exchange with client authentication. Public clients pass a null secret.
create or replace function public.oc_exchange_oauth_code_client(
  p_code text, p_verifier text, p_client_id text, p_redirect_uri text, p_resource text, p_client_secret text
)
returns jsonb language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare client_row public.oauth_clients;
begin
  select * into client_row from public.oauth_clients where client_id = p_client_id;
  if not found or client_row.revoked_at is not null then raise exception 'invalid_client'; end if;
  if client_row.owner_user_id is not null then
    -- Owned integrations are confidential: a matching secret is mandatory.
    if client_row.client_secret_hash is null
       or p_client_secret is null
       or encode(extensions.digest(p_client_secret, 'sha256'), 'hex') <> client_row.client_secret_hash then
      raise exception 'invalid_client';
    end if;
  elsif p_client_secret is not null and p_client_secret <> '' then
    -- Public clients must not present a secret they were never issued.
    raise exception 'invalid_client';
  end if;
  return public.oc_exchange_oauth_code_resource(p_code, p_verifier, p_client_id, p_redirect_uri, p_resource);
end $function$;

-- The older exchange entry points skip client authentication; keep them
-- internal so the token endpoint must go through oc_exchange_oauth_code_client.
revoke execute on function public.oc_exchange_oauth_code_resource(text,text,text,text,text) from public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.oc_exchange_oauth_code(text,text,text,text)') is not null then
    execute 'revoke execute on function public.oc_exchange_oauth_code(text,text,text,text) from public, anon, authenticated';
  end if;
end $$;

revoke all on function public.oc_valid_oauth_redirect_uris(text[]) from public;
revoke all on function public.oc_create_oauth_integration(text,text[]) from public, anon;
revoke all on function public.oc_list_oauth_integrations() from public, anon;
revoke all on function public.oc_update_oauth_integration(text,text,text[]) from public, anon;
revoke all on function public.oc_rotate_oauth_integration_secret(text) from public, anon;
revoke all on function public.oc_revoke_oauth_integration(text) from public, anon;
revoke all on function public.oc_exchange_oauth_code_client(text,text,text,text,text,text) from public;
revoke all on function public.oc_oauth_client_registered(text,text) from public;
revoke all on function public.oc_authorize_oauth_client_resource(text,text,text,text[],text) from public, anon;

grant execute on function public.oc_create_oauth_integration(text,text[]) to authenticated;
grant execute on function public.oc_list_oauth_integrations() to authenticated;
grant execute on function public.oc_update_oauth_integration(text,text,text[]) to authenticated;
grant execute on function public.oc_rotate_oauth_integration_secret(text) to authenticated;
grant execute on function public.oc_revoke_oauth_integration(text) to authenticated;
grant execute on function public.oc_exchange_oauth_code_client(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.oc_oauth_client_registered(text,text) to anon, authenticated;
grant execute on function public.oc_authorize_oauth_client_resource(text,text,text,text[],text) to authenticated;
