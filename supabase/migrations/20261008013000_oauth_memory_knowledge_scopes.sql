-- Keep the database OAuth allowlist aligned with the public authorization metadata.
-- Forward-only repair for PR #285; the original deployed migration remains immutable.
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
       'agents:invoke'
     ]::text[] THEN
    RAISE EXCEPTION 'Invalid scopes';
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
