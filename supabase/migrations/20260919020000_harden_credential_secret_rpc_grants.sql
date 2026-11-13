-- Supabase roles can retain explicit function grants independently of PUBLIC.
-- Credential Vault RPCs require an authenticated user and must not be exposed to anon.
REVOKE ALL ON FUNCTION public.list_credential_secrets() FROM anon;
REVOKE ALL ON FUNCTION public.create_credential_secret(text, text, text[], text) FROM anon;
REVOKE ALL ON FUNCTION public.delete_credential_secret(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.list_credential_secrets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_credential_secret(text, text, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_credential_secret(uuid) TO authenticated;
