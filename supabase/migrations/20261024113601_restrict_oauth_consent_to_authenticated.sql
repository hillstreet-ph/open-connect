-- Consent requires an authenticated session; remove legacy explicit anonymous grants.
REVOKE ALL ON FUNCTION public.oc_authorize_oauth_client(text,text,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_authorize_oauth_client(text,text,text,text[]) TO authenticated;
