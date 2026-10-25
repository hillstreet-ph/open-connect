-- Run inside a transaction after setting request.jwt.claim.sub to an existing
-- test owner's UUID, with SET LOCAL ROLE authenticated. Always ROLLBACK.
-- Only generated test rows are touched; no automation execution is invoked.
do $$
declare
  owner_id uuid := auth.uid();
  task_id uuid := gen_random_uuid();
  template_id uuid := gen_random_uuid();
  automation_id uuid := gen_random_uuid();
  schedule_id uuid := gen_random_uuid();
  fixture_name text := '__operations_test_' || task_id;
  next_status text;
  affected integer;
begin
  if owner_id is null then raise exception 'An authenticated fixture owner is required'; end if;
  insert into public.tasks(id,user_id,title,status,priority,description)
    values(task_id,owner_id,fixture_name,'todo','high','Disposable operation test');
  foreach next_status in array array['todo','in_progress','blocked','done','cancelled'] loop
    update public.tasks set status=next_status where id=task_id and user_id=owner_id;
    if not exists(select 1 from public.tasks where id=task_id and status=next_status) then
      raise exception 'Task transition failed: %',next_status;
    end if;
  end loop;
  insert into public.work_templates(id,user_id,name,kind,title)
    values(template_id,owner_id,fixture_name,'task','Reusable task');
  begin
    insert into public.work_templates(user_id,name,kind,title)
      values(owner_id,upper(fixture_name),'task','Duplicate');
    raise exception 'Duplicate template protection failed';
  exception when unique_violation then null; end;
  insert into public.automations(id,user_id,name,trigger_type,action_type,config,enabled)
    values(automation_id,owner_id,fixture_name,'manual','model','{"prompt":"Disposable test; do not execute"}',true);
  insert into public.schedules(id,user_id,automation_id,name,run_at,next_run_at,timezone,status)
    values(schedule_id,owner_id,automation_id,fixture_name,now()+interval '1 hour',now()+interval '1 hour','Asia/Manila','active');
  update public.schedules set status='paused',next_run_at=null where id=schedule_id;
  if not exists(select 1 from public.schedules where id=schedule_id and status='paused' and next_run_at is null) then raise exception 'Pause failed'; end if;
  update public.schedules set status='active',next_run_at=now()+interval '1 hour' where id=schedule_id;
  update public.automations set enabled=false where id=automation_id;
  if not exists(select 1 from public.automations where id=automation_id and not enabled) then raise exception 'Disable automation failed'; end if;

  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from public.tasks where id=task_id)
    or exists(select 1 from public.work_templates where id=template_id)
    or exists(select 1 from public.automations where id=automation_id)
    or exists(select 1 from public.schedules where id=schedule_id) then
    raise exception 'Private operation records leaked to another owner';
  end if;
  update public.tasks set status='done' where id=task_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Another owner changed a task'; end if;
  begin
    insert into public.work_templates(user_id,name,kind,title)
      values(owner_id,fixture_name || '_foreign','task','Forbidden');
    raise exception 'Cross-owner template insert was permitted';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  delete from public.schedules where id=schedule_id;
  delete from public.automations where id=automation_id;
  delete from public.work_templates where id=template_id;
  delete from public.tasks where id=task_id;
  if exists(select 1 from public.tasks where id=task_id) then raise exception 'Fixture cleanup failed'; end if;
end $$;
