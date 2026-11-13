-- Move credential values into Supabase Vault and expose metadata-only RPCs.
CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;

ALTER TABLE public.credential_secrets
  ADD COLUMN IF NOT EXISTS vault_secret_id uuid;

UPDATE public.credential_secrets
SET vault_secret_id = vault.create_secret(
  secret_value,
  'open_connect_' || id::text,
  'Open-Connect credential ' || id::text
)
WHERE vault_secret_id IS NULL
  AND secret_value IS NOT NULL
  AND length(secret_value) > 0;

ALTER TABLE public.credential_secrets
  ALTER COLUMN secret_value DROP NOT NULL;

UPDATE public.credential_secrets
SET secret_value = NULL
WHERE vault_secret_id IS NOT NULL;

REVOKE ALL ON public.credential_secrets FROM authenticated;
REVOKE ALL ON public.credential_secrets_meta FROM authenticated;

CREATE OR REPLACE FUNCTION public.list_credential_secrets()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'secret_type', secret_type,
        'scopes', scopes,
        'last_used_at', last_used_at,
        'created_at', created_at,
        'updated_at', updated_at,
        'has_secret', vault_secret_id IS NOT NULL
      ) ORDER BY created_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.credential_secrets
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.create_credential_secret(
  p_name text,
  p_secret_type text,
  p_scopes text[],
  p_secret_value text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_vault_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name required'; END IF;
  IF p_secret_value IS NULL OR length(p_secret_value) < 4 THEN RAISE EXCEPTION 'secret required'; END IF;
  IF p_secret_type NOT IN ('api_key','oauth_token','mcp_url','bot_token','password','other') THEN
    RAISE EXCEPTION 'invalid secret type';
  END IF;

  v_vault_id := vault.create_secret(
    p_secret_value,
    'open_connect_' || v_id::text,
    'Open-Connect credential ' || v_id::text
  );

  INSERT INTO public.credential_secrets (
    id, user_id, name, secret_type, scopes, secret_value, vault_secret_id
  ) VALUES (
    v_id, v_user_id, left(trim(p_name), 120), p_secret_type, COALESCE(p_scopes, '{}'), NULL, v_vault_id
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'name', left(trim(p_name), 120),
    'secret_type', p_secret_type,
    'scopes', COALESCE(p_scopes, '{}'),
    'has_secret', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_credential_secret(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_vault_id uuid;
BEGIN
  DELETE FROM public.credential_secrets
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING vault_secret_id INTO v_vault_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_vault_id IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_vault_id; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.list_credential_secrets() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_credential_secret(text, text, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_credential_secret(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_credential_secrets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_credential_secret(text, text, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_credential_secret(uuid) TO authenticated;
