-- Disposable database only. The migration must have removed historical revoked keys.
do $$begin
  if exists(select 1 from public.api_keys where revoked_at is not null) then
    raise exception 'Historical revoked keys retained'; end if;
end$$;
create table public.fixture_request_logs (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references public.api_keys(id) on delete set null
);
insert into public.fixture_request_logs(api_key_id)
values('10000000-0000-4000-8000-000000000002');
grant usage on schema extensions to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$declare raw text; kid uuid;
begin
  -- Foreign keys remain inaccessible and unaffected.
  update public.api_keys set revoked_at=now() where id='10000000-0000-4000-8000-000000000001';
  update public.api_keys set revoked_at=now() where id='10000000-0000-4000-8000-000000000002';
  if exists(select 1 from public.api_keys where id='10000000-0000-4000-8000-000000000002') then
    raise exception 'Own revoked key was not deleted'; end if;
  -- Both new model keys and existing integration/OAuth key formats use this path.
  foreach raw in array array['sk-oc-' || repeat('d',32),'oc_live_' || repeat('e',64)] loop
    kid := gen_random_uuid();
    insert into public.api_keys(id,user_id,key_prefix,key_hash,scopes,access_profile)
    values(kid,auth.uid(),left(raw,12),encode(extensions.digest(raw,'sha256'),'hex'),array['models:read'],'custom');
    if public.oc_verify_gateway_key(raw) is null then raise exception 'Active key rejected'; end if;
    update public.api_keys set revoked_at=now() where id=kid;
    if public.oc_verify_gateway_key(raw) is not null then raise exception 'Deleted key accepted'; end if;
    if exists(select 1 from public.api_keys where id=kid) then raise exception 'Deleted key retained'; end if;
    -- Retry is a safe no-op.
    update public.api_keys set revoked_at=now() where id=kid;
  end loop;
end$$;
reset role;
do $$begin
  if not exists(select 1 from public.api_keys where id='10000000-0000-4000-8000-000000000001') then
    raise exception 'Foreign active key deleted'; end if;
  if not exists(select 1 from public.fixture_request_logs where api_key_id is null) then
    raise exception 'Request log was lost'; end if;
end$$;
