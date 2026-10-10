-- Restore the original authenticated policy-helper contract after ACL drift.
-- Both helpers bind decisions to auth.uid(); function bodies, policies and data are unchanged.
revoke all on function public.is_organization_member(uuid) from public, anon;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;
revoke all on function public.can_manage_organization(uuid) from public, anon;
