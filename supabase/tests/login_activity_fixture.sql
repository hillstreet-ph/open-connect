-- Disposable PostgreSQL fixture only. Mimics the pieces of Supabase Auth that the
-- login-activity functions rely on: auth.sessions, auth.jwt(), auth.uid(), and the
-- ON DELETE CASCADE from sessions to refresh tokens.
do $$begin
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
end$$;

create schema auth;

create function auth.jwt() returns jsonb language sql stable as
  $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;

create function auth.uid() returns uuid language sql stable as
  $$select nullif(auth.jwt()->>'sub','')::uuid$$;

create table auth.sessions (
  id uuid primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  not_after timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet
);

create table auth.refresh_tokens (
  id bigint generated always as identity primary key,
  session_id uuid references auth.sessions(id) on delete cascade,
  token text unique
);

create table auth.mfa_amr_claims (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references auth.sessions(id) on delete cascade,
  authentication_method text not null,
  unique (session_id, authentication_method)
);

grant usage on schema auth to authenticated, anon;

insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,user_agent,ip) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
    now()-interval '2 hours', now()-interval '5 minutes', now()-interval '5 minutes',
    'Mozilla/5.0 (X11; Linux x86_64) Chrome/156.0.0.0 Safari/537.36','103.226.24.32'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
    now()-interval '3 days', now()-interval '3 days', null,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) QoderApp/0.5.1 Chrome/150.0.0.0 Safari/537.36','104.28.220.28'),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',
    now()-interval '1 day', now()-interval '1 day', null,
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1','49.148.114.255');

insert into auth.refresh_tokens(session_id,token) values
  ('10000000-0000-4000-8000-000000000001','token-one'),
  ('10000000-0000-4000-8000-000000000002','token-two');

insert into auth.mfa_amr_claims(session_id,authentication_method) values
  ('10000000-0000-4000-8000-000000000001','password');
