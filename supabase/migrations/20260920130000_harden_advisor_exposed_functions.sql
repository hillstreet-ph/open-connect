-- Harden privileged database helpers reported by the Supabase security advisor.
--
-- The web application implements OAuth at its own server routes and does not
-- invoke the legacy oc_* database RPCs. Keep those functions available only to
-- the server-side service role. Membership helpers remain available to signed-in
-- users because platform RLS policies call them, but they must not disclose a
-- different user's membership or role through PostgREST.

alter view public.credential_secrets_meta set (security_invoker = true);

alter function platform.set_updated_at()
  set search_path = platform, pg_temp;

create or replace function platform.user_in_org(p_user_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = platform, pg_temp
as $$
  select p_user_id = auth.uid()
    and exists (
      select 1
      from platform.memberships
      where user_id = p_user_id and org_id = p_org_id
    );
$$;

create or replace function platform.user_role(p_user_id uuid, p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = platform, pg_temp
as $$
  select role
  from platform.memberships
  where p_user_id = auth.uid()
    and user_id = p_user_id
    and org_id = p_org_id
  limit 1;
$$;

revoke all on function platform.user_in_org(uuid, uuid) from public, anon;
revoke all on function platform.user_role(uuid, uuid) from public, anon;
grant execute on function platform.user_in_org(uuid, uuid) to authenticated, service_role;
grant execute on function platform.user_role(uuid, uuid) to authenticated, service_role;

revoke all on function platform_shared.current_app_role() from public, anon;
grant execute on function platform_shared.current_app_role() to authenticated, service_role;

revoke all on function platform_shared.sync_authorized_identity()
  from public, anon, authenticated;
grant execute on function platform_shared.sync_authorized_identity() to service_role;

revoke all on function public.oc_authorize_oauth_client(text, text, text, text[])
  from public, anon, authenticated;
revoke all on function public.oc_exchange_oauth_code(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.oc_register_oauth_client(text, text[])
  from public, anon, authenticated;
revoke all on function public.oc_verify_gateway_key(text)
  from public, anon, authenticated;

grant execute on function public.oc_authorize_oauth_client(text, text, text, text[])
  to service_role;
grant execute on function public.oc_exchange_oauth_code(text, text, text, text)
  to service_role;
grant execute on function public.oc_register_oauth_client(text, text[])
  to service_role;
grant execute on function public.oc_verify_gateway_key(text)
  to service_role;
