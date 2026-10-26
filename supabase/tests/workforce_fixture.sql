-- Disposable PostgreSQL only. Never apply this fixture to a provider database.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,service_role;
create table public.projects(id uuid primary key);
create table public.fixture_members(project_id uuid,user_id uuid,manager boolean);
create function public.can_access_project(p uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.fixture_members where project_id=p and user_id=auth.uid())$$;
create function public.can_manage_project(p uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.fixture_members where project_id=p and user_id=auth.uid() and manager)$$;
create table public.resources(id uuid primary key);
create table public.ai_agency_teams(id uuid primary key,user_id uuid,name text);
grant select on public.ai_agency_teams to authenticated;
insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
insert into public.projects values('10000000-0000-4000-8000-000000000001');
insert into public.fixture_members values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',true),('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',false);

insert into public.resources values('20000000-0000-4000-8000-000000000001');
insert into public.ai_agency_teams values('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Development team');
