-- Resolve a connection credential only for the trusted server-side broker.
-- Browser clients and signed-in users cannot execute this function directly.

CREATE OR REPLACE FUNCTION public.resolve_connection_credential(
  p_user_id uuid,
  p_credential_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  SELECT decrypted.decrypted_secret
  INTO v_secret
  FROM public.credential_secrets AS credential
  JOIN vault.decrypted_secrets AS decrypted
    ON decrypted.id = credential.vault_secret_id
  WHERE credential.id = p_credential_id
    AND credential.user_id = p_user_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'connection credential not found';
  END IF;

  UPDATE public.credential_secrets
  SET last_used_at = now()
  WHERE id = p_credential_id
    AND user_id = p_user_id;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_connection_credential(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_connection_credential(uuid, uuid)
  TO service_role;
