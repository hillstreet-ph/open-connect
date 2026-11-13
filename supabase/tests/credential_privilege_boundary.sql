begin;
set local role anon;
do $$
begin
 begin
  perform public.list_credential_secrets();
  raise exception 'Anonymous credential RPC unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from public.credential_secrets;
  raise exception 'Anonymous credential table unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
begin
 if public.list_credential_secrets() <> '[]'::jsonb then
  raise exception 'Unrelated identity received credential metadata'; end if;
 begin
  perform 1 from public.credential_secrets;
  raise exception 'Authenticated direct credential table unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.resolve_connection_credential(
   '00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000099');
  raise exception 'Authenticated broker call unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.reveal_credential_secret('00000000-0000-4000-8000-000000000099');
  raise exception 'Missing credential reveal unexpectedly allowed';
 exception when raise_exception then
  if sqlerrm <> 'credential not found' then raise; end if;
 end;
end $$;
reset role;
rollback;
select 'credential_boundary_checks_passed' as result;
