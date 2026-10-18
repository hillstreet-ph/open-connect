-- Restore the signed-in credential form's permission; the existing function requires auth.uid() and encrypts values in Vault.
REVOKE ALL ON FUNCTION public.create_credential_item(text,text,text[],text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credential_item(text,text,text[],text,text,text,text,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
