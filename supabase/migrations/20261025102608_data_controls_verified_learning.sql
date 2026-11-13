-- Integrate the actual successful outcome writer, requiring an explicit verification assertion.
create or replace function public.capture_data_control_activity() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare item_id uuid; owner_id uuid; kind text; item_key text; keys text[]; prefs public.data_control_settings;
begin
 item_id:=new.id;
 if tg_table_name='resources' then owner_id:=new.owner_id; kind:='resource'; keys:=array[new.slug];
 elsif tg_table_name='toolkits' then owner_id:=new.user_id; kind:='toolkit'; keys:=array[new.id::text];
 elsif tg_table_name='memory_records' then owner_id:=new.user_id; kind:='memory'; keys:=array[new.id::text];
 elsif tg_table_name='knowledge_items' then owner_id:=new.user_id; kind:='knowledge'; keys:=array[new.id::text];
 else
  if new.event_type <> 'verified' and not (new.event_type='learned' and coalesce(new.evidence->>'verified','false')='true') then return new; end if;
  item_id:=new.run_id; owner_id:=new.user_id; kind:='capability'; keys:=new.capability_slugs;
 end if;
 select * into prefs from public.data_control_settings s where s.user_id=owner_id;
 if not coalesce(prefs.capture_activity,false) then return new; end if;
 foreach item_key in array keys loop
  if length(item_key) not between 1 and 240 then continue; end if;
  insert into public.data_control_activity(user_id,source_kind,source_key,source_id)
   values(owner_id,kind,item_key,item_id)
   on conflict do nothing;
  if kind='capability' then
   insert into public.knowledge_items(user_id,title,content,source_type,tags,metadata)
    select owner_id,left('Verified capability: '||item_key,240),'Capability '||item_key||' completed a verified run. Evidence remains in the private run record.','api',array['auto-saved','verified-run'],jsonb_build_object('auto_capture',true,'run_id',item_id,'capability',item_key)
    where not exists(select 1 from public.knowledge_items k where k.user_id=owner_id and k.metadata @> jsonb_build_object('auto_capture',true,'run_id',item_id,'capability',item_key));
  end if;
  if kind='capability' and prefs.suggest_drafts and
   (select count(*) from public.data_control_activity a where a.user_id=owner_id and a.source_kind=kind and a.source_key=item_key and a.created_at > now()-make_interval(days=>prefs.retention_days)) >= 3 then
   insert into public.data_reuse_drafts(user_id,source_key,title,content)
    values(owner_id,'capability:'||item_key,left('Reusable workflow: '||item_key,200),
      '# Reusable workflow'||E'\n\nCapability: '||item_key||E'\n\nObserved in at least three verified runs.\n\n## Inputs\nDescribe required inputs using placeholders.\n\n## Steps\n1. Confirm the connected account and scope.\n2. Run the capability using secure credential references.\n3. Validate the result against the intended outcome.\n\n## Review before publication\nComplete source, license, dependency and security review. Do not include private account data.')
    on conflict(user_id,source_key) do nothing;
  end if;
 end loop;
 return new;
end $$;

create or replace function public.sync_data_control_activity() returns void
 language plpgsql security invoker set search_path='' as $$
declare uid uuid:=(select auth.uid()); prefs public.data_control_settings;
begin
 select * into prefs from public.data_control_settings where user_id=uid;
 if not coalesce(prefs.capture_activity,false) then return; end if;
 insert into public.data_control_activity(user_id,source_kind,source_key,source_id,created_at)
 select uid,kind,item_key,item_id,observed from (
  select 'memory' as kind,id::text as item_key,id as item_id,created_at as observed from public.memory_records where user_id=uid
  union all select 'knowledge',id::text,id,created_at from public.knowledge_items where user_id=uid
  union all select 'resource',slug,id,created_at from public.resources where owner_id=uid
  union all select 'toolkit',id::text,id,created_at from public.toolkits where user_id=uid
  union all select 'capability',slug,run_id,created_at from public.autonomous_run_events cross join lateral unnest(capability_slugs) slug where user_id=uid and (event_type='verified' or (event_type='learned' and coalesce(evidence->>'verified','false')='true'))
 ) items where observed >= now()-make_interval(days=>prefs.retention_days)
 and length(item_key) between 1 and 240
 on conflict do nothing;
 if prefs.suggest_drafts then
  insert into public.data_reuse_drafts(user_id,source_key,title,content)
  select uid,'capability:'||source_key,left('Reusable workflow: '||source_key,200),
   '# Reusable workflow'||E'\n\nCapability: '||source_key||E'\n\nObserved in at least three verified runs. Complete the inputs, steps, validation criteria, source, license and dependency review in Studio. Use placeholders instead of private account data.'
  from public.data_control_activity where user_id=uid and source_kind='capability'
   and created_at >= now()-make_interval(days=>prefs.retention_days)
  group by source_key having count(*)>=3 on conflict do nothing;
 end if;
end $$;
