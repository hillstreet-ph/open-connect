-- Disposable database only. Load the original policy migration, then reproduce live ACL drift.
do $$begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end$$;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
  $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,service_role;
create or replace function public.touch_updated_at() returns trigger language plpgsql as
  $$begin new.updated_at=now(); return new; end$$;
\ir ../migrations/20260920210000_organization_groups_invitations.sql
insert into auth.users values
  ('00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000013');
insert into public.organizations(id,name,slug,owner_id) values
  ('20000000-0000-4000-8000-000000000011','Fixture organization','fixture-org',
   '00000000-0000-4000-8000-000000000011');
insert into public.organization_members(organization_id,user_id,role) values
  ('20000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011','admin'),
  ('20000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','member');
revoke all on function public.is_organization_member(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_manage_organization(uuid) to anon;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',false);
do $$begin
  begin
    perform id from public.organizations;
    raise exception 'ACL drift baseline did not fail';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
