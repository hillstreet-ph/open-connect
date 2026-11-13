-- OAuth resource indicators: bind new grants without changing existing/manual keys.
ALTER TABLE public.oauth_authorization_codes ADD COLUMN resource text NOT NULL DEFAULT 'https://open-connect.site/mcp' CHECK (resource = 'https://open-connect.site/mcp');
ALTER TABLE public.api_keys ADD COLUMN oauth_resource text CHECK (oauth_resource IS NULL OR oauth_resource = 'https://open-connect.site/mcp');

CREATE OR REPLACE FUNCTION public.oc_authorize_oauth_client_resource(p_client_id text, p_redirect_uri text, p_challenge text, p_scopes text[], p_resource text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  code text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  IF p_resource IS DISTINCT FROM 'https://open-connect.site/mcp' THEN RAISE EXCEPTION 'invalid_target'; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.oauth_clients
    WHERE client_id = p_client_id
      AND p_redirect_uri = ANY(redirect_uris)
  ) THEN
    RAISE EXCEPTION 'Unregistered client or callback. Restart the connection from your AI client.';
  END IF;

  IF p_challenge IS NULL OR p_challenge !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION 'Invalid PKCE challenge';
  END IF;

  IF cardinality(p_scopes) IS NULL
     OR cardinality(p_scopes) = 0
     OR array_position(p_scopes, NULL) IS NOT NULL
     OR NOT p_scopes <@ ARRAY[
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
     ]::text[] THEN
    RAISE EXCEPTION 'Invalid scopes';
  END IF;

  IF 'control:write' = ANY(p_scopes) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'Administrator permissions require an Admin account' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.oauth_authorization_codes
  WHERE expires_at < now();

  INSERT INTO public.oauth_authorization_codes(code_hash,user_id,client_id,redirect_uri,challenge,scopes,expires_at,resource)
  VALUES (
    encode(extensions.digest(code, 'sha256'), 'hex'),
    auth.uid(),
    p_client_id,
    p_redirect_uri,
    p_challenge,
    p_scopes,
    now() + interval '5 minutes',
    p_resource
  );

  RETURN code;
END
$function$
;
CREATE OR REPLACE FUNCTION public.oc_exchange_oauth_code_resource(p_code text, p_verifier text, p_client_id text, p_redirect_uri text, p_resource text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE grant_row public.oauth_authorization_codes; raw_key text; v_challenge text;
BEGIN
 IF p_resource IS DISTINCT FROM 'https://open-connect.site/mcp' THEN RAISE EXCEPTION 'invalid_target'; END IF;
 IF p_code IS NULL OR p_verifier IS NULL OR p_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 v_challenge := translate(rtrim(encode(extensions.digest(p_verifier,'sha256'),'base64'),'='),'+/','-_');
 DELETE FROM public.oauth_authorization_codes WHERE code_hash=encode(extensions.digest(p_code,'sha256'),'hex') AND client_id=p_client_id AND redirect_uri=p_redirect_uri AND oauth_authorization_codes.challenge=v_challenge AND resource=p_resource AND expires_at>now() RETURNING * INTO grant_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 -- Recheck authority at redemption in case the account was demoted after consent.
 IF 'control:write' = ANY(grant_row.scopes) AND NOT EXISTS (
   SELECT 1 FROM public.user_roles
   WHERE user_id = grant_row.user_id AND role::text IN ('admin', 'owner')
 ) THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 raw_key := 'oc_live_' || encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash,scopes,expires_at,oauth_resource)
 VALUES(grant_row.user_id,'OAuth: '||(SELECT client_name FROM public.oauth_clients WHERE client_id=p_client_id),left(raw_key,14),encode(extensions.digest(raw_key,'sha256'),'hex'),grant_row.scopes,now()+interval '30 days',p_resource);
 RETURN jsonb_build_object('access_token',raw_key,'token_type','Bearer','expires_in',2592000,'scope',array_to_string(grant_row.scopes,' '));
END $function$
;
CREATE OR REPLACE FUNCTION public.oc_verify_gateway_key(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare k public.api_keys;
begin
 if p_key is null or (left(p_key,8) <> 'oc_live_' and p_key !~ '^sk-oc-[A-Za-z0-9_-]{32}$') or length(p_key)>256 then return null; end if;
 select * into k from public.api_keys where key_hash=encode(extensions.digest(p_key,'sha256'),'hex') and revoked_at is null and (expires_at is null or expires_at>now());
 if not found then return null; end if;
 if left(p_key,6) = 'sk-oc-' then
   k.scopes := array(select s from unnest(k.scopes) s where s in ('models:read','models:invoke'));
 end if;
 update public.api_keys set last_used_at=now() where id=k.id;
 return jsonb_build_object('id',k.id,'user_id',k.user_id,'scopes',k.scopes,'expires_at',k.expires_at,'organization_id',k.organization_id,'workspace_id',k.workspace_id,'project_id',k.project_id,'access_profile',k.access_profile,'oauth_resource',k.oauth_resource);
end $function$
;

-- Keep deployed callers compatible; all newly minted OAuth tokens are resource-bound.
CREATE OR REPLACE FUNCTION public.oc_authorize_oauth_client(p_client_id text, p_redirect_uri text, p_challenge text, p_scopes text[])
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
 SELECT public.oc_authorize_oauth_client_resource(p_client_id,p_redirect_uri,p_challenge,p_scopes,'https://open-connect.site/mcp');
$$;
CREATE OR REPLACE FUNCTION public.oc_exchange_oauth_code(p_code text, p_verifier text, p_client_id text, p_redirect_uri text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
 SELECT public.oc_exchange_oauth_code_resource(p_code,p_verifier,p_client_id,p_redirect_uri,'https://open-connect.site/mcp');
$$;
-- A boolean registration check permits a safe access_denied callback without exposing client data.
CREATE OR REPLACE FUNCTION public.oc_oauth_client_registered(p_client_id text,p_redirect_uri text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.oauth_clients WHERE client_id=p_client_id AND p_redirect_uri=ANY(redirect_uris));
$$;
REVOKE ALL ON FUNCTION public.oc_authorize_oauth_client_resource(text,text,text,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oc_authorize_oauth_client_resource(text,text,text,text[],text) TO authenticated;
REVOKE ALL ON FUNCTION public.oc_exchange_oauth_code_resource(text,text,text,text,text),public.oc_oauth_client_registered(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oc_exchange_oauth_code_resource(text,text,text,text,text),public.oc_oauth_client_registered(text,text) TO anon,authenticated;
-- Reassert existing entry-point privileges for both fresh and upgraded databases.
REVOKE ALL ON FUNCTION public.oc_authorize_oauth_client(text,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oc_authorize_oauth_client(text,text,text,text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.oc_exchange_oauth_code(text,text,text,text),public.oc_verify_gateway_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oc_exchange_oauth_code(text,text,text,text),public.oc_verify_gateway_key(text) TO anon,authenticated;
