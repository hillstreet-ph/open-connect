-- Account-wide controls. Other accounts must opt in independently.
create table public.data_control_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 capture_activity boolean not null default false,
 save_helper_memory boolean not null default false,
 suggest_drafts boolean not null default false,
 retention_days integer not null default 90 check (retention_days in (30,90,365)),
 updated_at timestamptz not null default now()
);
create table public.data_control_activity (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source_kind text not null check (source_kind in ('memory','knowledge','resource','toolkit','capability')),
 source_key text not null check (length(source_key) between 1 and 240),
 source_id uuid not null,
 created_at timestamptz not null default now(),
 unique(user_id,source_kind,source_key,source_id)
);
create index data_control_activity_user_created on public.data_control_activity(user_id,created_at desc);
create table public.data_reuse_drafts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source_key text not null,
 title text not null check (length(title) between 1 and 200),
 content text not null check (length(content) between 1 and 50000),
 resource_type text not null default 'skill' check (resource_type in ('skill','prompt','guide','toolkit')),
 resource_id uuid references public.resources(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,source_key)
);
alter table public.data_control_settings enable row level security;
alter table public.data_control_activity enable row level security;
alter table public.data_reuse_drafts enable row level security;
grant select,insert,update,delete on public.data_control_settings,public.data_control_activity,public.data_reuse_drafts to authenticated;
grant all on public.data_control_settings,public.data_control_activity,public.data_reuse_drafts to service_role;
create policy "Own data control settings" on public.data_control_settings for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Own data control activity" on public.data_control_activity for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Own reuse drafts" on public.data_reuse_drafts for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- Invoker triggers preserve the original writer's permissions. Only identifiers
-- enter the activity index; credentials, prompts and tool payloads are never copied.
create function public.capture_data_control_activity() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare item_id uuid; owner_id uuid; kind text; item_key text; keys text[]; prefs public.data_control_settings;
begin
 item_id:=new.id;
 if tg_table_name='resources' then owner_id:=new.owner_id; kind:='resource'; keys:=array[new.slug];
 elsif tg_table_name='toolkits' then owner_id:=new.user_id; kind:='toolkit'; keys:=array[new.id::text];
 elsif tg_table_name='memory_records' then owner_id:=new.user_id; kind:='memory'; keys:=array[new.id::text];
 elsif tg_table_name='knowledge_items' then owner_id:=new.user_id; kind:='knowledge'; keys:=array[new.id::text];
 else
  if new.event_type <> 'verified' then return new; end if;
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
revoke all on function public.capture_data_control_activity() from public,anon,authenticated;
create trigger data_controls_memory after insert on public.memory_records for each row execute function public.capture_data_control_activity();
create trigger data_controls_knowledge after insert on public.knowledge_items for each row execute function public.capture_data_control_activity();
create trigger data_controls_resource after insert on public.resources for each row execute function public.capture_data_control_activity();
create trigger data_controls_toolkit after insert on public.toolkits for each row execute function public.capture_data_control_activity();
create trigger data_controls_verified after insert on public.autonomous_run_events for each row execute function public.capture_data_control_activity();

-- Atomic conversion: unique slug plus a locked draft prevents duplicate packages.
-- This creates a private, unverified review candidate, never a published resource.
create function public.build_data_reuse_draft(draft_id uuid) returns uuid
 language plpgsql security invoker set search_path='' as $$
declare d public.data_reuse_drafts; rid uuid;
begin
 select * into d from public.data_reuse_drafts where id=draft_id and user_id=(select auth.uid()) for update;
 if not found then raise exception 'Draft not found'; end if;
 if d.resource_id is not null then return d.resource_id; end if;
 insert into public.resources(slug,name,description,resource_type,owner_id,source,installation_type,installation_config,verified,published,license,version)
 values('reuse-'||d.id::text,d.title,'Private usage-based draft. Complete the content, source and license review in Studio.',d.resource_type::public.resource_type,d.user_id,'data-controls','inline',jsonb_build_object('draft_markdown',d.content,'review_state','pending','data_controls_draft_id',d.id),false,false,null,'0.1.0') returning id into rid;
 update public.data_reuse_drafts set resource_id=rid,updated_at=now() where id=d.id;
 return rid;
end $$;
revoke all on function public.build_data_reuse_draft(uuid) from public,anon;
grant execute on function public.build_data_reuse_draft(uuid) to authenticated;

-- Called only by the existing OIDC-authenticated background scheduler.
create function public.prune_data_control_history() returns void
 language plpgsql security invoker set search_path='' as $$
begin
 delete from public.data_control_activity a using public.data_control_settings s
  where a.user_id=s.user_id and a.created_at < now()-make_interval(days=>s.retention_days);
 delete from public.memory_records m using public.data_control_settings s
  where m.user_id=s.user_id and m.metadata @> '{"auto_capture":true}'::jsonb
   and m.created_at < now()-make_interval(days=>s.retention_days);
 delete from public.knowledge_items k using public.data_control_settings s
  where k.user_id=s.user_id and k.metadata @> '{"auto_capture":true}'::jsonb
   and k.created_at < now()-make_interval(days=>s.retention_days);
end $$;
revoke all on function public.prune_data_control_history() from public,anon,authenticated;
grant execute on function public.prune_data_control_history() to service_role;

-- Opt-in sync imports identifiers from this account's existing retained records.
create function public.sync_data_control_activity() returns void
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
  union all select 'capability',slug,run_id,created_at from public.autonomous_run_events cross join lateral unnest(capability_slugs) slug where user_id=uid and event_type='verified'
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
revoke all on function public.sync_data_control_activity() from public,anon;
grant execute on function public.sync_data_control_activity() to authenticated;
