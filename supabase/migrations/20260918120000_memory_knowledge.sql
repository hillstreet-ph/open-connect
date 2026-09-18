-- Open-Connect Memory & Knowledge
-- Durable user-owned context with optional project/agent/session scoping.

create table if not exists public.memory_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  agent_id uuid,
  session_id text,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 50000),
  memory_type text not null default 'fact'
    check (memory_type in ('fact', 'preference', 'decision', 'instruction', 'summary')),
  importance smallint not null default 3 check (importance between 1 and 5),
  pinned boolean not null default false,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_records_user_updated_idx
  on public.memory_records (user_id, updated_at desc);
create index if not exists memory_records_project_idx
  on public.memory_records (project_id) where project_id is not null;
create index if not exists memory_records_tags_idx
  on public.memory_records using gin (tags);

alter table public.memory_records enable row level security;
grant select, insert, update, delete on public.memory_records to authenticated;
grant all on public.memory_records to service_role;

drop policy if exists "Users manage own memories" on public.memory_records;
create policy "Users manage own memories"
  on public.memory_records for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  title text not null check (char_length(title) between 1 and 240),
  content text not null check (char_length(content) between 1 and 200000),
  source_type text not null default 'note'
    check (source_type in ('note', 'document', 'url', 'repository', 'conversation', 'api')),
  source_url text,
  mime_type text,
  status text not null default 'ready'
    check (status in ('processing', 'ready', 'failed', 'archived')),
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_items_user_updated_idx
  on public.knowledge_items (user_id, updated_at desc);
create index if not exists knowledge_items_project_idx
  on public.knowledge_items (project_id) where project_id is not null;
create index if not exists knowledge_items_tags_idx
  on public.knowledge_items using gin (tags);
create index if not exists knowledge_items_search_idx
  on public.knowledge_items using gin (search_vector);

alter table public.knowledge_items enable row level security;
grant select, insert, update, delete on public.knowledge_items to authenticated;
grant all on public.knowledge_items to service_role;

drop policy if exists "Users manage own knowledge" on public.knowledge_items;
create policy "Users manage own knowledge"
  on public.knowledge_items for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists memory_records_touch_updated_at on public.memory_records;
create trigger memory_records_touch_updated_at
  before update on public.memory_records
  for each row execute function public.touch_updated_at();

drop trigger if exists knowledge_items_touch_updated_at on public.knowledge_items;
create trigger knowledge_items_touch_updated_at
  before update on public.knowledge_items
  for each row execute function public.touch_updated_at();
