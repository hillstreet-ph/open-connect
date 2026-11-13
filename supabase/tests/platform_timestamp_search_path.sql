-- Disposable PostgreSQL only, after the timestamp follow-up migration.
do $$
begin
  if (select proconfig from pg_proc where oid = 'platform.set_updated_at()'::regprocedure)
      is distinct from array['search_path=pg_catalog']::text[] then
    raise exception 'Timestamp helper search_path is not pinned';
  end if;
  if exists (
    select 1 from oauth_acl_before_timestamp_hardening before
    join pg_proc after on after.oid = before.oid
    where before.proacl is distinct from after.proacl
  ) then
    raise exception 'Timestamp hardening changed an OAuth RPC ACL';
  end if;
end;
$$;

-- A caller-controlled lookup path must not affect this trigger's operation.
set search_path = pg_temp;
do $$
begin
  update platform.timestamp_fixture set updated_at = '2000-01-01T00:00:00Z' where id = 1;
  if (select updated_at from platform.timestamp_fixture where id = 1) is distinct from now() then
    raise exception 'Timestamp helper no longer updates rows correctly';
  end if;
end;
$$;
reset search_path;
