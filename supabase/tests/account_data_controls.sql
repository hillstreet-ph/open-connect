begin;
-- Set open_connect.test_user_id to an existing test-account UUID before running.
-- All writes roll back; no production account identifier is stored in this file.
select set_config('request.jwt.claim.sub',current_setting('open_connect.test_user_id'),true);
insert into public.data_control_settings(user_id,capture_activity,save_helper_memory,suggest_drafts,retention_days)
 values(auth.uid(),true,true,true,30) on conflict(user_id) do update set capture_activity=true,suggest_drafts=true,retention_days=30;
do $$
declare u uuid:=auth.uid(); r uuid; i integer;
begin
 for i in 1..3 loop
  r:=gen_random_uuid();
  insert into public.autonomous_runs(id,user_id,goal,environment,state,plan,correlation_id) values(r,u,'Data Controls regression test','development','succeeded','{}',r);
  insert into public.autonomous_run_events(user_id,run_id,event_type,summary,capability_slugs) values(u,r,'verified','Synthetic verified result',array['data-controls-test-capability']);
  insert into public.autonomous_run_events(user_id,run_id,event_type,summary,capability_slugs) values(u,r,'verified','Duplicate event for same run',array['data-controls-test-capability']);
 end loop;
 if (select count(*) from public.data_control_activity where user_id=u and source_key='data-controls-test-capability')<>3 then raise exception 'Distinct run counting failed'; end if;
 if (select count(*) from public.data_reuse_drafts where user_id=u and source_key='capability:data-controls-test-capability')<>1 then raise exception 'Draft deduplication failed'; end if;
 if (select count(*) from public.knowledge_items where user_id=u and metadata->>'capability'='data-controls-test-capability')<>3 then raise exception 'Knowledge capture failed'; end if;
end $$;
set local role authenticated;
do $$
declare d uuid; r uuid; r2 uuid;
begin
 select id into d from public.data_reuse_drafts where user_id=auth.uid() and source_key='capability:data-controls-test-capability';
 r:=public.build_data_reuse_draft(d); r2:=public.build_data_reuse_draft(d);
 if r<>r2 then raise exception 'Build is not idempotent'; end if;
 if not exists(select 1 from public.resources where id=r and owner_id=auth.uid() and not verified and not published) then raise exception 'Draft must stay private and unverified'; end if;
 perform public.sync_data_control_activity();
end $$;
reset role;
insert into public.memory_records(user_id,title,content,memory_type,metadata,created_at) values
 (auth.uid(),'Retention auto test','Synthetic automatic memory','summary','{"auto_capture":true}',now()-interval '40 days'),
 (auth.uid(),'Retention manual test','Synthetic manual memory','fact','{}',now()-interval '40 days');
select public.prune_data_control_history();
do $$ begin
 if exists(select 1 from public.memory_records where user_id=auth.uid() and title='Retention auto test') then raise exception 'Automatic retention failed'; end if;
 if not exists(select 1 from public.memory_records where user_id=auth.uid() and title='Retention manual test') then raise exception 'Manual data must be retained'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.data_control_settings) or exists(select 1 from public.data_control_activity) or exists(select 1 from public.data_reuse_drafts) then raise exception 'Cross-account read leaked rows'; end if;
 begin
  insert into public.data_control_settings(user_id) values(current_setting('open_connect.test_user_id')::uuid);
  raise exception 'Cross-account insert unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
select 'Data Controls capture, distinct runs, draft deduplication, idempotent private build, retention and account isolation passed; all test writes rolled back' as result;
