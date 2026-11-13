-- Reproducible operations, marketplace discovery, and governed open-* agent team.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid, organization_id uuid, title text not null, description text,
  status text not null default 'todo', priority text not null default 'medium', due_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid, automation_id uuid, name text not null, description text, cron_expr text, run_at timestamptz,
  timezone text not null default 'UTC', status text not null default 'active', last_run_at timestamptz,
  next_run_at timestamptz, lease_owner text, lease_expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint schedules_have_timing check (cron_expr is not null or run_at is not null)
);
create index if not exists schedules_due_idx on public.schedules(status, next_run_at) where status = 'active';
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid, name text not null, description text, trigger_type text not null default 'manual',
  action_type text not null default 'notify', enabled boolean not null default true, config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz, last_status text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.registry_sources (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null, adapter text not null,
  base_url text not null, trust_level text not null default 'untrusted_discovery', enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb, last_collected_at timestamptz, last_status text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.registry_ingestion_runs (
  id uuid primary key default gen_random_uuid(), source_id uuid references public.registry_sources(id) on delete set null,
  status text not null default 'running', discovered_count integer not null default 0, changed_count integer not null default 0,
  error_summary text, evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.resource_source_records (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.registry_sources(id) on delete cascade,
  external_id text not null, canonical_url text not null, normalized_slug text not null, name text not null,
  description text, license text, content_hash text not null, review_state text not null default 'pending_security_review',
  source_updated_at timestamptz, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  stale_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  unique(source_id, external_id), unique(source_id, canonical_url)
);
create index if not exists resource_source_records_review_idx on public.resource_source_records(review_state, last_seen_at desc);

create table if not exists public.agent_definitions (
  id text primary key check (id like 'open-%'), role text not null, supervisor_id text references public.agent_definitions(id),
  capabilities text[] not null default '{}', execution_policy jsonb not null default '{}'::jsonb,
  enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.agent_delegations (
  parent_id text not null references public.agent_definitions(id) on delete cascade,
  child_id text not null references public.agent_definitions(id) on delete cascade,
  primary key(parent_id, child_id), constraint no_self_delegation check(parent_id <> child_id)
);

do $$ begin
  alter table public.schedules add constraint schedules_automation_fk foreign key (automation_id) references public.automations(id) on delete set null;
exception when duplicate_object then null; end $$;

alter table public.tasks enable row level security;
alter table public.schedules enable row level security;
alter table public.automations enable row level security;
alter table public.registry_sources enable row level security;
alter table public.registry_ingestion_runs enable row level security;
alter table public.resource_source_records enable row level security;
alter table public.agent_definitions enable row level security;
alter table public.agent_delegations enable row level security;

drop policy if exists "users manage own tasks" on public.tasks;
create policy "users manage own tasks" on public.tasks for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "users manage own schedules" on public.schedules;
create policy "users manage own schedules" on public.schedules for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "users manage own automations" on public.automations;
create policy "users manage own automations" on public.automations for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "authenticated read registry sources" on public.registry_sources;
create policy "authenticated read registry sources" on public.registry_sources for select to authenticated using(true);
drop policy if exists "authenticated read resource candidates" on public.resource_source_records;
create policy "authenticated read resource candidates" on public.resource_source_records for select to authenticated using(true);
drop policy if exists "authenticated read agent definitions" on public.agent_definitions;
create policy "authenticated read agent definitions" on public.agent_definitions for select to authenticated using(true);
drop policy if exists "authenticated read agent delegations" on public.agent_delegations;
create policy "authenticated read agent delegations" on public.agent_delegations for select to authenticated using(true);

revoke insert, update, delete on public.registry_sources, public.registry_ingestion_runs, public.resource_source_records, public.agent_definitions, public.agent_delegations from anon, authenticated;
grant select on public.registry_sources, public.resource_source_records, public.agent_definitions, public.agent_delegations to authenticated;
grant all on public.registry_sources, public.registry_ingestion_runs, public.resource_source_records, public.agent_definitions, public.agent_delegations to service_role;

insert into public.agent_definitions(id, role, supervisor_id, capabilities, execution_policy) values
('open-ceo-developer','supervisor',null,array['plan','delegate','review'],jsonb_build_object('production_requires_approval',true)),
('open-planner','planner','open-ceo-developer',array['research','decompose'],jsonb_build_object('write',false)),
('open-fullstack-developer','implementation','open-ceo-developer',array['frontend','backend','api'],jsonb_build_object('branch_required',true)),
('open-devops','delivery','open-ceo-developer',array['ci','container','staging'],jsonb_build_object('production_requires_approval',true)),
('open-browser-researcher','research','open-planner',array['browse','extract'],jsonb_build_object('login_requires_approval',true)),
('open-db-engineer','data','open-fullstack-developer',array['schema','migration','rls'],jsonb_build_object('production_requires_approval',true)),
('open-security-reviewer','security_gate','open-ceo-developer',array['secret_scan','dependency_scan','policy'],jsonb_build_object('independent_review',true)),
('open-qa-reviewer','quality_gate','open-ceo-developer',array['test','smoke','e2e'],jsonb_build_object('independent_review',true))
on conflict(id) do update set role=excluded.role, supervisor_id=excluded.supervisor_id, capabilities=excluded.capabilities, execution_policy=excluded.execution_policy, updated_at=now();

insert into public.agent_delegations(parent_id, child_id)
select supervisor_id, id from public.agent_definitions where supervisor_id is not null
on conflict do nothing;
