-- Permit explicit administrator OAuth consent without rewriting existing grants.
-- Ownership, exact callback, PKCE, expiration and single-use code checks remain enforced.
CREATE OR REPLACE FUNCTION public.oc_authorize_oauth_client(
  p_client_id text,
  p_redirect_uri text,
  p_challenge text,
  p_scopes text[]
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  code text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.oauth_clients
    WHERE client_id = p_client_id
      AND p_redirect_uri = ANY(redirect_uris)
  ) THEN
    RAISE EXCEPTION 'Unregistered client or callback. Reconnect from ChatGPT.';
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

  INSERT INTO public.oauth_authorization_codes
  VALUES (
    encode(extensions.digest(code, 'sha256'), 'hex'),
    auth.uid(),
    p_client_id,
    p_redirect_uri,
    p_challenge,
    p_scopes,
    now() + interval '5 minutes'
  );

  RETURN code;
END
$function$;

REVOKE ALL ON FUNCTION public.oc_authorize_oauth_client(text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oc_authorize_oauth_client(text, text, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.oc_exchange_oauth_code(p_code text, p_verifier text, p_client_id text, p_redirect_uri text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE grant_row public.oauth_authorization_codes; raw_key text; v_challenge text;
BEGIN
 IF p_code IS NULL OR p_verifier IS NULL OR p_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 v_challenge := translate(rtrim(encode(extensions.digest(p_verifier,'sha256'),'base64'),'='),'+/','-_');
 DELETE FROM public.oauth_authorization_codes WHERE code_hash=encode(extensions.digest(p_code,'sha256'),'hex') AND client_id=p_client_id AND redirect_uri=p_redirect_uri AND oauth_authorization_codes.challenge=v_challenge AND expires_at>now() RETURNING * INTO grant_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 -- Recheck authority at redemption in case the account was demoted after consent.
 IF 'control:write' = ANY(grant_row.scopes) AND NOT EXISTS (
   SELECT 1 FROM public.user_roles
   WHERE user_id = grant_row.user_id AND role::text IN ('admin', 'owner')
 ) THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 raw_key := 'oc_live_' || encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash,scopes,expires_at)
 VALUES(grant_row.user_id,'OAuth: '||(SELECT client_name FROM public.oauth_clients WHERE client_id=p_client_id),left(raw_key,14),encode(extensions.digest(raw_key,'sha256'),'hex'),grant_row.scopes,now()+interval '30 days');
 RETURN jsonb_build_object('access_token',raw_key,'token_type','Bearer','expires_in',2592000,'scope',array_to_string(grant_row.scopes,' '));
END $function$

REVOKE ALL ON FUNCTION public.oc_exchange_oauth_code(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oc_exchange_oauth_code(text, text, text, text) TO anon, authenticated;
