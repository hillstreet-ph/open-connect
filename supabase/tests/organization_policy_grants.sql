-- Run after organization_policy_fixture.sql and the grant-repair migration.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false);
do $$begin
  if (select count(*) from public.organizations)<>1 then raise exception 'Owner organization read failed'; end if;
  if not public.can_manage_organization('20000000-0000-4000-8000-000000000011') then
    raise exception 'Owner management lost'; end if;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',false);
do $$begin
  if (select count(*) from public.organizations)<>1 then raise exception 'Member organization read failed'; end if;
  if not public.is_organization_member('20000000-0000-4000-8000-000000000011') then
    raise exception 'Member helper failed'; end if;
  if public.can_manage_organization('20000000-0000-4000-8000-000000000011') then
    raise exception 'Member management broadened'; end if;
  begin
    insert into public.organization_groups(organization_id,name,created_by) values
      ('20000000-0000-4000-8000-000000000011','Forbidden',auth.uid());
    raise exception 'Member write accepted';
  exception when insufficient_privilege then null; end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000013',false);
do $$begin
  if (select count(*) from public.organizations)<>0 then raise exception 'Nonmember organization exposed'; end if;
  if public.is_organization_member('20000000-0000-4000-8000-000000000011') or
    public.can_manage_organization('20000000-0000-4000-8000-000000000011') then
    raise exception 'Nonmember helper access broadened'; end if;
end$$;
select set_config('request.jwt.claim.sub','',false);
do $$begin
  if (select count(*) from public.organizations)<>0 then raise exception 'Missing identity read accepted'; end if;
end$$;
reset role;
set role anon;
do $$begin
  begin perform public.is_organization_member('20000000-0000-4000-8000-000000000011');
    raise exception 'Anonymous membership call accepted'; exception when insufficient_privilege then null; end;
  begin perform public.can_manage_organization('20000000-0000-4000-8000-000000000011');
    raise exception 'Anonymous management call accepted'; exception when insufficient_privilege then null; end;
end$$;
reset role;
do $$begin
  if not has_function_privilege('service_role','public.is_organization_member(uuid)','execute') then
    raise exception 'Service role helper execution missing'; end if;
  if (select count(*) from public.organization_members)<>2 or
    (select count(*) from public.organizations)<>1 then raise exception 'Membership data changed'; end if;
end$$;
