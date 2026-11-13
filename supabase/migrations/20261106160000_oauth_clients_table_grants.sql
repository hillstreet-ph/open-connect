-- oauth_clients now stores client secret hashes. Access is only through
-- SECURITY DEFINER RPCs, so restore the table-level revoke from
-- 20260922020000_oauth_consent_reconciliation.sql, which had drifted in
-- production (anon/authenticated held SELECT/INSERT/UPDATE/DELETE; RLS with no
-- policies was the only barrier). Also removes the table from the anon and
-- authenticated GraphQL schemas.
revoke all on table public.oauth_clients from anon, authenticated;
