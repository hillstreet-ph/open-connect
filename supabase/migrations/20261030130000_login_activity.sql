-- Login activity: a signed-in person can review and end their own sessions.
--
-- auth.sessions is owned by supabase_auth_admin, so authenticated callers cannot
-- read it directly. These SECURITY DEFINER helpers expose only the caller's own
-- rows, keyed on auth.uid(), and never another account's sessions.
--
-- Deleting a session cascades to auth.refresh_tokens and auth.mfa_amr_claims
-- (both declare ON DELETE CASCADE), so the revoked session cannot refresh.

create or replace function public.oc_login_activity()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip text,
  is_current boolean
)
language sql
security definer
set search_path = ''
stable
as $function$
  select
    s.id,
    s.created_at,
    greatest(
      s.created_at,
      coalesce(s.refreshed_at::timestamptz, s.created_at),
      s.updated_at
    ) as last_active_at,
    s.user_agent,
    host(s.ip) as ip,
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
  order by last_active_at desc
  limit 50;
$function$;

revoke all on function public.oc_login_activity() from public;
grant execute on function public.oc_login_activity() to authenticated;

create or replace function public.oc_revoke_login_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare removed integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from auth.sessions
   where id = p_session_id
     and user_id = auth.uid();
  get diagnostics removed = row_count;
  return removed > 0;
end
$function$;

revoke all on function public.oc_revoke_login_session(uuid) from public;
grant execute on function public.oc_revoke_login_session(uuid) to authenticated;

create or replace function public.oc_revoke_other_login_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare removed integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from auth.sessions
   where user_id = auth.uid()
     and id is distinct from nullif(auth.jwt() ->> 'session_id', '')::uuid;
  get diagnostics removed = row_count;
  return removed;
end
$function$;

revoke all on function public.oc_revoke_other_login_sessions() from public;
grant execute on function public.oc_revoke_other_login_sessions() to authenticated;
