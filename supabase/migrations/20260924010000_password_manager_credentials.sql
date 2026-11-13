-- Password-manager credential records with owner-only reveal and optional TOTP.
-- Passwords and TOTP seeds remain separate encrypted entries in Supabase Vault.

ALTER TABLE public.credential_secrets
  ADD COLUMN IF NOT EXISTS email_address text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS totp_vault_secret_id uuid;

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
        'email_address', email_address,
        'username', username,
        'website', website,
        'notes', notes,
        'last_used_at', last_used_at,
        'created_at', created_at,
        'updated_at', updated_at,
        'has_secret', vault_secret_id IS NOT NULL,
        'has_totp', totp_vault_secret_id IS NOT NULL OR secret_type = 'totp'
      ) ORDER BY created_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.credential_secrets
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.create_credential_item(
  p_name text,
  p_secret_type text,
  p_scopes text[],
  p_secret_value text,
  p_email_address text,
  p_username text,
  p_website text,
  p_notes text,
  p_totp_secret text
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
  v_totp_vault_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name required'; END IF;
  IF p_secret_value IS NULL OR length(p_secret_value) < 4 THEN RAISE EXCEPTION 'secret required'; END IF;
  IF p_secret_type NOT IN ('api_key','oauth_token','mcp_url','bot_token','password','totp','other') THEN
    RAISE EXCEPTION 'invalid secret type';
  END IF;
  IF p_totp_secret IS NOT NULL AND length(trim(p_totp_secret)) > 0 THEN
    PERFORM public.base32_decode(p_totp_secret);
  END IF;

  v_vault_id := vault.create_secret(
    p_secret_value,
    'open_connect_' || v_id::text,
    'Open-Connect credential ' || v_id::text
  );
  IF p_totp_secret IS NOT NULL AND length(trim(p_totp_secret)) > 0 THEN
    v_totp_vault_id := vault.create_secret(
      p_totp_secret,
      'open_connect_totp_' || v_id::text,
      'Open-Connect credential TOTP ' || v_id::text
    );
  END IF;

  INSERT INTO public.credential_secrets (
    id, user_id, name, secret_type, scopes, secret_value, vault_secret_id,
    email_address, username, website, notes, totp_vault_secret_id
  ) VALUES (
    v_id, v_user_id, left(trim(p_name), 120), p_secret_type, COALESCE(p_scopes, '{}'), NULL,
    v_vault_id, nullif(left(trim(COALESCE(p_email_address, '')), 320), ''),
    nullif(left(trim(COALESCE(p_username, '')), 320), ''),
    nullif(left(trim(COALESCE(p_website, '')), 2048), ''),
    nullif(left(COALESCE(p_notes, ''), 4000), ''), v_totp_vault_id
  );

  RETURN jsonb_build_object(
    'id', v_id, 'name', left(trim(p_name), 120), 'secret_type', p_secret_type,
    'scopes', COALESCE(p_scopes, '{}'), 'has_secret', true,
    'has_totp', v_totp_vault_id IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reveal_credential_secret(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted.decrypted_secret
  INTO v_secret
  FROM public.credential_secrets AS credential
  JOIN vault.decrypted_secrets AS decrypted ON decrypted.id = credential.vault_secret_id
  WHERE credential.id = p_id AND credential.user_id = auth.uid();

  IF v_secret IS NULL THEN RAISE EXCEPTION 'credential not found'; END IF;
  UPDATE public.credential_secrets SET last_used_at = now() WHERE id = p_id AND user_id = auth.uid();
  RETURN jsonb_build_object('value', v_secret);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_credential_totp_code(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions, pg_temp
AS $$
DECLARE
  v_seed text;
  v_counter bigint := floor(extract(epoch FROM clock_timestamp()) / 30)::bigint;
  v_message bytea;
  v_digest bytea;
  v_offset integer;
  v_binary bigint;
  v_code text;
  v_remaining integer;
BEGIN
  SELECT decrypted.decrypted_secret
  INTO v_seed
  FROM public.credential_secrets AS credential
  JOIN vault.decrypted_secrets AS decrypted
    ON decrypted.id = COALESCE(credential.totp_vault_secret_id, credential.vault_secret_id)
  WHERE credential.id = p_id
    AND credential.user_id = auth.uid()
    AND (credential.totp_vault_secret_id IS NOT NULL OR credential.secret_type = 'totp');

  IF v_seed IS NULL THEN RAISE EXCEPTION '2FA credential not found'; END IF;
  v_message := decode(lpad(to_hex(v_counter), 16, '0'), 'hex');
  v_digest := extensions.hmac(v_message, public.base32_decode(v_seed), 'sha1');
  v_offset := get_byte(v_digest, 19) & 15;
  v_binary := ((get_byte(v_digest, v_offset) & 127)::bigint << 24)
    | (get_byte(v_digest, v_offset + 1)::bigint << 16)
    | (get_byte(v_digest, v_offset + 2)::bigint << 8)
    | get_byte(v_digest, v_offset + 3)::bigint;
  v_code := lpad((v_binary % 1000000)::text, 6, '0');
  v_remaining := 30 - (extract(epoch FROM clock_timestamp())::integer % 30);
  UPDATE public.credential_secrets SET last_used_at = now() WHERE id = p_id AND user_id = auth.uid();
  RETURN jsonb_build_object('code', v_code, 'seconds_remaining', v_remaining);
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
  v_totp_vault_id uuid;
BEGIN
  DELETE FROM public.credential_secrets
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING vault_secret_id, totp_vault_secret_id INTO v_vault_id, v_totp_vault_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_vault_id IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_vault_id; END IF;
  IF v_totp_vault_id IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_totp_vault_id; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_credential_item(text, text, text[], text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reveal_credential_secret(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_credential_totp_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credential_item(text, text, text[], text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_credential_secret(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_credential_totp_code(uuid) TO authenticated;
