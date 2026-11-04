-- Disposable PostgreSQL only. Model the observed production trigger and retain
-- the current OAuth ACLs so the follow-up migration cannot silently change them.
create schema platform;
create function platform.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create table platform.timestamp_fixture (id integer primary key, updated_at timestamptz);
insert into platform.timestamp_fixture values (1, '2000-01-01T00:00:00Z');
create trigger timestamp_fixture_update before update on platform.timestamp_fixture
  for each row execute function platform.set_updated_at();
create temporary table oauth_acl_before_timestamp_hardening as
  select oid, proacl from pg_proc
  where pronamespace = 'public'::regnamespace and proname like 'oc_%';
