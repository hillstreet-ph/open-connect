-- Run only after login_activity_fixture.sql and the login-activity migration
-- in a disposable database.

-- Anonymous role cannot call the helpers at all.
do $$begin
  execute 'set local role anon';
  begin
    perform public.oc_login_activity();
    raise exception 'Anonymous login activity accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.oc_revoke_other_login_sessions();
    raise exception 'Anonymous revoke accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end$$;

-- A token without a subject sees nothing and cannot revoke.
do $$declare rows jsonb; begin
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into rows from public.oc_login_activity() t;
  if jsonb_array_length(rows) <> 0 then
    raise exception 'Subject-less token leaked rows'; end if;
  begin
    perform public.oc_revoke_login_session('10000000-0000-4000-8000-000000000001');
    raise exception 'Subject-less revoke accepted';
  exception when others then
    if sqlerrm = 'Subject-less revoke accepted' then raise; end if;
  end;
  execute 'reset role';
end$$;

-- Signed-in user: sees only own sessions, newest activity first.
do $$declare rows jsonb; n integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","session_id":"10000000-0000-4000-8000-000000000001"}',true);
  execute 'set local role authenticated';

  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into rows from public.oc_login_activity() t;
  if jsonb_array_length(rows) <> 2 then
    raise exception 'Expected two own sessions, got %', jsonb_array_length(rows); end if;
  if (rows->0->>'id') <> '10000000-0000-4000-8000-000000000001' then
    raise exception 'Sessions must be ordered by most recent activity'; end if;
  if (rows->0->>'is_current')::boolean is not true then
    raise exception 'Current session not flagged'; end if;
  if (rows->1->>'is_current')::boolean is not false then
    raise exception 'Non-current session misflagged'; end if;
  if rows::text like '%10000000-0000-4000-8000-000000000003%' then
    raise exception 'Another account''s session leaked'; end if;
  if (rows->0->>'ip') <> '103.226.24.32' then
    raise exception 'IP not exposed as text, got %', rows->0->>'ip'; end if;

  -- Cannot revoke another account's session.
  if public.oc_revoke_login_session('10000000-0000-4000-8000-000000000003') then
    raise exception 'Revoked another account''s session'; end if;

  -- Revoking an own session also clears its refresh tokens via cascade.
  if not public.oc_revoke_login_session('10000000-0000-4000-8000-000000000002') then
    raise exception 'Own session not revoked'; end if;

  -- Only one own session remains, so nothing else to sign out.
  n := public.oc_revoke_other_login_sessions();
  if n <> 0 then raise exception 'Expected no extra sessions revoked, got %', n; end if;

  execute 'reset role';
end$$;

-- Raw table checks after restoring the owner role.
do $$begin
  if (select count(*) from auth.sessions where id='10000000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'Foreign session was deleted'; end if;
  if exists(select 1 from auth.sessions where id='10000000-0000-4000-8000-000000000002') then
    raise exception 'Session row survived revoke'; end if;
  if exists(select 1 from auth.refresh_tokens where session_id='10000000-0000-4000-8000-000000000002') then
    raise exception 'Refresh tokens survived revoke'; end if;
  if not exists(select 1 from auth.sessions where id='10000000-0000-4000-8000-000000000001') then
    raise exception 'Current session was removed'; end if;
end$$;

-- Sign-out-everywhere from a user with several sessions keeps only the current one.
do $$declare n integer;
begin
  insert into auth.sessions(id,user_id,created_at,updated_at,user_agent,ip) values
    ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001',
      now()-interval '1 hour', now()-interval '1 hour','Mozilla/5.0 Chrome/155.0.0.0','192.96.202.207');
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","session_id":"10000000-0000-4000-8000-000000000001"}',true);
  execute 'set local role authenticated';
  n := public.oc_revoke_other_login_sessions();
  execute 'reset role';
  if n <> 1 then raise exception 'Expected one other session revoked, got %', n; end if;
  if not exists(select 1 from auth.sessions where id='10000000-0000-4000-8000-000000000001') then
    raise exception 'Sign-out-everywhere removed the current session'; end if;
  if exists(select 1 from auth.sessions where id='10000000-0000-4000-8000-000000000004') then
    raise exception 'Other own session survived sign-out-everywhere'; end if;
end$$;
