-- Account consent and key verification; deployed to open-platform on September 19.
CREATE TABLE IF NOT EXISTS public.oauth_clients (client_id text PRIMARY KEY, client_name text NOT NULL, redirect_uris text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.oauth_authorization_codes (code_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,client_id text NOT NULL REFERENCES public.oauth_clients(client_id),redirect_uri text NOT NULL,challenge text NOT NULL,scopes text[] NOT NULL,expires_at timestamptz NOT NULL);
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_clients,public.oauth_authorization_codes FROM anon,authenticated;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;
CREATE OR REPLACE FUNCTION public.oc_authorize_oauth_client(p_client_id text, p_redirect_uri text, p_challenge text, p_scopes text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE code text := encode(extensions.gen_random_bytes(32),'hex');
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.oauth_clients WHERE client_id=p_client_id AND p_redirect_uri=ANY(redirect_uris)) THEN RAISE EXCEPTION 'Unregistered client or callback. Reconnect from ChatGPT.'; END IF;
 IF p_challenge IS NULL OR p_challenge !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION 'Invalid PKCE challenge'; END IF;
 IF cardinality(p_scopes) IS NULL OR cardinality(p_scopes)=0 OR array_position(p_scopes,NULL) IS NOT NULL OR NOT p_scopes <@ ARRAY['openid','mcp:connect','resources:read','resources:write','connections:read','connections:invoke','models:read','models:invoke','tools:invoke','secrets:read','agents:invoke']::text[] THEN RAISE EXCEPTION 'Invalid scopes'; END IF;
 DELETE FROM public.oauth_authorization_codes WHERE expires_at < now();
 INSERT INTO public.oauth_authorization_codes VALUES(encode(extensions.digest(code,'sha256'),'hex'),auth.uid(),p_client_id,p_redirect_uri,p_challenge,p_scopes,now()+interval '5 minutes');
 RETURN code;
END $function$

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
 raw_key := 'oc_live_' || encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash,scopes,expires_at)
 VALUES(grant_row.user_id,'OAuth: '||(SELECT client_name FROM public.oauth_clients WHERE client_id=p_client_id),left(raw_key,14),encode(extensions.digest(raw_key,'sha256'),'hex'),grant_row.scopes,now()+interval '30 days');
 RETURN jsonb_build_object('access_token',raw_key,'token_type','Bearer','expires_in',2592000,'scope',array_to_string(grant_row.scopes,' '));
END $function$

CREATE OR REPLACE FUNCTION public.oc_register_oauth_client(p_name text, p_redirect_uris text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE cid text := 'oc_cli_' || encode(extensions.gen_random_bytes(24),'hex'); u text;
BEGIN
 IF cardinality(p_redirect_uris) IS NULL OR cardinality(p_redirect_uris) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid callback list'; END IF;
 FOREACH u IN ARRAY p_redirect_uris LOOP
  IF u IS NULL OR length(u)>2048 OR u !~ '^https://[^/@[:space:]#]+(/[^[:space:]#]*)?$' THEN RAISE EXCEPTION 'HTTPS callbacks required'; END IF;
 END LOOP;
 INSERT INTO public.oauth_clients VALUES(cid,left(coalesce(nullif(p_name,''),'MCP client'),120),p_redirect_uris,now());
 RETURN jsonb_build_object('client_id',cid,'client_name',left(coalesce(nullif(p_name,''),'MCP client'),120),'redirect_uris',p_redirect_uris,'token_endpoint_auth_method','none','grant_types',jsonb_build_array('authorization_code'),'response_types',jsonb_build_array('code'));
END $function$

CREATE OR REPLACE FUNCTION public.oc_verify_gateway_key(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE k public.api_keys;
BEGIN
 IF p_key IS NULL OR p_key NOT LIKE 'oc_live_%' OR length(p_key)>256 THEN RETURN NULL; END IF;
 SELECT * INTO k FROM public.api_keys WHERE key_hash=encode(extensions.digest(p_key,'sha256'),'hex') AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now());
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.api_keys SET last_used_at=now() WHERE id=k.id;
 RETURN jsonb_build_object('id',k.id,'user_id',k.user_id,'scopes',k.scopes,'expires_at',k.expires_at);
END $function$

REVOKE ALL ON FUNCTION public.oc_register_oauth_client(text,text[]),public.oc_authorize_oauth_client(text,text,text,text[]),public.oc_exchange_oauth_code(text,text,text,text),public.oc_verify_gateway_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oc_register_oauth_client(text,text[]),public.oc_exchange_oauth_code(text,text,text,text),public.oc_verify_gateway_key(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.oc_authorize_oauth_client(text,text,text,text[]) TO authenticated;

