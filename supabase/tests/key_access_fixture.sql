-- Disposable PostgreSQL test database only. Never apply this fixture to a provider database.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create table public.user_roles(user_id uuid,role text);
create table public.api_keys (
  id uuid primary key, user_id uuid not null, name text, key_hash text, key_prefix text,
  scopes text[], access_profile text, organization_id uuid,workspace_id uuid,project_id uuid,
  expires_at timestamptz,revoked_at timestamptz
);
create table public.control_audit_events (
  id bigint generated always as identity primary key, timestamp timestamptz default now(),
  tenant_id uuid not null,actor_id uuid,agent_id text not null,capability text not null,
  target text not null,environment text not null,result text not null,
  correlation_id uuid not null,evidence jsonb not null
);
alter table public.api_keys enable row level security;
create policy own_keys on public.api_keys to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete,truncate,references,trigger on public.api_keys to authenticated;
grant select on public.user_roles,public.control_audit_events to authenticated;
insert into public.user_roles values
  ('00000000-0000-4000-8000-000000000001','owner'),
  ('00000000-0000-4000-8000-000000000002','user');
insert into public.api_keys(id,user_id,key_hash,key_prefix,scopes,access_profile,organization_id,workspace_id,project_id,expires_at)
values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','fixture-hash','fixture-prefix',array['mcp:connect'],'custom',
    '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',now()+interval '90 days'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','other-hash','fixture-prefix',array['mcp:connect'],'custom',null,null,null,null),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','revoked-hash','fixture-prefix',array['mcp:connect'],'custom',null,null,null,null),
  ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','expired-hash','fixture-prefix',array['mcp:connect'],'custom',null,null,null,now()-interval '1 day');
update public.api_keys set revoked_at=now() where id='10000000-0000-4000-8000-000000000003';
