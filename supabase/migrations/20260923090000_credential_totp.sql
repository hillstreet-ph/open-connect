-- Password-manager style TOTP support. The authenticator seed remains in Vault;
-- authenticated users can request only the current short-lived code for their own row.

ALTER TABLE public.credential_secrets
  DROP CONSTRAINT IF EXISTS credential_secrets_secret_type_check;
ALTER TABLE public.credential_secrets
  ADD CONSTRAINT credential_secrets_secret_type_check
  CHECK (secret_type IN ('api_key','oauth_token','mcp_url','bot_token','password','totp','other'));

CREATE OR REPLACE FUNCTION public.base32_decode(p_value text)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_clean text := regexp_replace(upper(p_value), '[^A-Z2-7]', '', 'g');
  v_buffer bigint := 0;
  v_bits integer := 0;
  v_digit integer;
  v_output bytea := ''::bytea;
  v_character text;
BEGIN
  IF length(v_clean) < 16 THEN
    RAISE EXCEPTION 'invalid TOTP setup key';
  END IF;

  FOR v_index IN 1..length(v_clean) LOOP
    v_character := substr(v_clean, v_index, 1);
    v_digit := strpos(v_alphabet, v_character) - 1;
    IF v_digit < 0 THEN RAISE EXCEPTION 'invalid TOTP setup key'; END IF;
    v_buffer := (v_buffer << 5) | v_digit;
    v_bits := v_bits + 5;
    WHILE v_bits >= 8 LOOP
      v_bits := v_bits - 8;
      v_output := v_output || decode(lpad(to_hex((v_buffer >> v_bits) & 255), 2, '0'), 'hex');
      v_buffer := v_buffer & ((1::bigint << v_bits) - 1);
    END LOOP;
  END LOOP;
  RETURN v_output;
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
  JOIN vault.decrypted_secrets AS decrypted ON decrypted.id = credential.vault_secret_id
  WHERE credential.id = p_id
    AND credential.user_id = auth.uid()
    AND credential.secret_type = 'totp';

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

  UPDATE public.credential_secrets SET last_used_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('code', v_code, 'seconds_remaining', v_remaining);
END;
$$;

-- Replace the validation-only portion of the existing creation RPC so `totp`
-- is accepted while preserving its Vault-only storage behavior.
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
  IF p_secret_type NOT IN ('api_key','oauth_token','mcp_url','bot_token','password','totp','other') THEN
    RAISE EXCEPTION 'invalid secret type';
  END IF;
  IF p_secret_type = 'totp' THEN PERFORM public.base32_decode(p_secret_value); END IF;

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
    'id', v_id, 'name', left(trim(p_name), 120), 'secret_type', p_secret_type,
    'scopes', COALESCE(p_scopes, '{}'), 'has_secret', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.base32_decode(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_credential_totp_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_credential_totp_code(uuid) TO authenticated;
