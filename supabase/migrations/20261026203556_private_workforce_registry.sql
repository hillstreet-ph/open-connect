-- Private specialist identities; legacy teams and resources remain authoritative references.
create table public.workforce_agents (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid references public.projects(id) on delete cascade, slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
 department text not null, lead boolean not null default false,
 source_resource_id uuid, -- historical origin; availability is revalidated before use
 legacy_team_id uuid references public.ai_agency_teams(id) on delete set null, enabled boolean not null default true,
 active_version_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index workforce_agent_scope_slug on public.workforce_agents(coalesce(project_id::text,'personal:'||owner_id::text),slug);
create unique index workforce_source_identity on public.workforce_agents(coalesce(project_id::text,'personal:'||owner_id::text),source_resource_id) where source_resource_id is not null;
create table public.workforce_agent_versions (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references public.workforce_agents(id) on delete cascade,
 number integer not null check(number>0), config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=50000),
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), unique(agent_id,number), unique(agent_id,id)
);
alter table public.workforce_agents add constraint workforce_active_revision foreign key(id,active_version_id) references public.workforce_agent_versions(agent_id,id);
alter table public.agent_chats add column workforce_agent_id uuid references public.workforce_agents(id) on delete cascade,
 add column workforce_version_id uuid references public.workforce_agent_versions(id) on delete cascade;
alter table public.agent_chats add constraint workforce_chat_binding check((workforce_agent_id is null)=(workforce_version_id is null));
alter table public.agent_chats add constraint workforce_chat_revision foreign key(workforce_agent_id,workforce_version_id) references public.workforce_agent_versions(agent_id,id) on delete cascade;
create index workforce_chat_agent on public.agent_chats(workforce_agent_id,created_at desc);
create table public.workforce_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 agent_id uuid not null references public.workforce_agents(id) on delete cascade, version_id uuid not null references public.workforce_agent_versions(id) on delete cascade,
 chat_id uuid references public.agent_chats(id) on delete set null, state text not null check(state in ('completed','failed')),
 model text, latency_ms integer check(latency_ms>=0), created_at timestamptz not null default now()
);
create index workforce_events_owner on public.workforce_events(user_id,agent_id,created_at desc);
alter table public.workforce_agents enable row level security;
alter table public.workforce_agent_versions enable row level security;
alter table public.workforce_events enable row level security;
revoke all on public.workforce_agents,public.workforce_agent_versions,public.workforce_events from anon,authenticated;
grant select,insert,update on public.workforce_agents to authenticated;
grant select,insert on public.workforce_agent_versions to authenticated;
grant select on public.workforce_events to authenticated;
grant all on public.workforce_agents,public.workforce_agent_versions,public.workforce_events to service_role;
create policy workforce_read on public.workforce_agents for select to authenticated using (
 (project_id is null and owner_id=(select auth.uid())) or (project_id is not null and public.can_access_project(project_id))
);
create policy workforce_create on public.workforce_agents for insert to authenticated with check (
 owner_id=(select auth.uid()) and (project_id is null or public.can_manage_project(project_id))
);
create policy workforce_manage on public.workforce_agents for update to authenticated using (
 (project_id is null and owner_id=(select auth.uid())) or (project_id is not null and public.can_manage_project(project_id))
) with check (
 (project_id is null and owner_id=(select auth.uid())) or (project_id is not null and public.can_manage_project(project_id))
);
create policy workforce_revision_read on public.workforce_agent_versions for select to authenticated using (
 exists(select 1 from public.workforce_agents a where a.id=agent_id)
);
create policy workforce_revision_create on public.workforce_agent_versions for insert to authenticated with check (
 created_by=(select auth.uid()) and exists(select 1 from public.workforce_agents a where a.id=agent_id and (
 (a.project_id is null and a.owner_id=(select auth.uid())) or (a.project_id is not null and public.can_manage_project(a.project_id))))
);
create policy workforce_event_read on public.workforce_events for select to authenticated using(user_id=(select auth.uid()));

create function public.workforce_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.owner_id is distinct from old.owner_id or new.project_id is distinct from old.project_id or new.slug is distinct from old.slug or new.source_resource_id is distinct from old.source_resource_id or new.lead is distinct from old.lead then
   raise exception 'Workforce identity and scope are immutable';
 end if;
 new.updated_at=now(); return new;
end $$;
create trigger workforce_identity_guard before update on public.workforce_agents for each row execute function public.workforce_identity_guard();
revoke all on function public.workforce_identity_guard() from public,anon,authenticated;

create function public.workforce_chat_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.workforce_agent_id is distinct from old.workforce_agent_id or new.workforce_version_id is distinct from old.workforce_version_id) then
   raise exception 'Specialist chat identity is immutable';
 end if;
 if tg_op='INSERT' and new.workforce_agent_id is not null and not exists(
   select 1 from public.workforce_agents a where a.id=new.workforce_agent_id and a.enabled and a.active_version_id=new.workforce_version_id
 ) then raise exception 'Specialist version is not active or accessible'; end if;
 return new;
end $$;
create trigger workforce_chat_guard before insert or update on public.agent_chats for each row execute function public.workforce_chat_guard();
revoke all on function public.workforce_chat_guard() from public,anon,authenticated;

-- Invoker RPCs keep row policies active. Row locks and expected versions prevent lost edits.
create function public.save_workforce_agent(p_id uuid,p_project_id uuid,p_slug text,p_lead boolean,p_legacy_team_id uuid,p_config jsonb,p_expected integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.workforce_agents; v_id uuid; n integer;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_config->>'department' is null or p_config->>'name' is null or length(p_config->>'instructions')<10 then raise exception 'Invalid specialist configuration'; end if;
 if p_legacy_team_id is not null and not exists(select 1 from public.ai_agency_teams where id=p_legacy_team_id and user_id=auth.uid()) then raise exception 'Legacy team is unavailable'; end if;
 if p_id is null then
   insert into public.workforce_agents(owner_id,project_id,slug,department,lead,legacy_team_id,source_resource_id)
   values(auth.uid(),p_project_id,p_slug,p_config->>'department',p_lead,p_legacy_team_id,nullif(p_config->>'sourceResourceId','')::uuid) returning * into a;
   n=1;
 else
   select * into a from public.workforce_agents where id=p_id for update;
   if not found then raise exception 'Specialist unavailable'; end if;
   if a.source_resource_id is distinct from nullif(p_config->>'sourceResourceId','')::uuid then raise exception 'Source resource identity is immutable'; end if;
   select coalesce(max(number),0)+1 into n from public.workforce_agent_versions where agent_id=a.id;
   if p_expected is distinct from n-1 then raise exception 'Specialist changed; refresh before editing'; end if;
 end if;
 insert into public.workforce_agent_versions(agent_id,number,config,created_by) values(a.id,n,p_config,auth.uid()) returning id into v_id;
 return jsonb_build_object('agent_id',a.id,'version_id',v_id,'number',n);
end $$;
create function public.activate_workforce_agent(p_id uuid,p_version_id uuid,p_expected_active uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.workforce_agents set active_version_id=p_version_id,
 department=(select config->>'department' from public.workforce_agent_versions where id=p_version_id and agent_id=p_id)
 where id=p_id and active_version_id is not distinct from p_expected_active;
 if not found then raise exception 'Specialist changed or access denied'; end if;
end $$;
create function public.launch_workforce_chat(p_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.workforce_agents; title text; chat uuid;
begin
 select * into a from public.workforce_agents where id=p_id and enabled and active_version_id is not null;
 if not found then raise exception 'Choose an active specialist available to your account'; end if;
 select left(config->>'name',100) into title from public.workforce_agent_versions where id=a.active_version_id and agent_id=a.id;
 insert into public.agent_chats(user_id,title,workforce_agent_id,workforce_version_id) values(auth.uid(),title,a.id,a.active_version_id) returning id into chat;
 return chat;
end $$;
revoke all on function public.save_workforce_agent(uuid,uuid,text,boolean,uuid,jsonb,integer),public.activate_workforce_agent(uuid,uuid,uuid),public.launch_workforce_chat(uuid) from public,anon;
grant execute on function public.save_workforce_agent(uuid,uuid,text,boolean,uuid,jsonb,integer),public.activate_workforce_agent(uuid,uuid,uuid),public.launch_workforce_chat(uuid) to authenticated;
notify pgrst,'reload schema';
