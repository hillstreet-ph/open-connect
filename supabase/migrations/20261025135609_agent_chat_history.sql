create table public.agent_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  mode text not null default 'workspace' check(mode in ('workspace','browser')),
  messages jsonb not null default '[]'::jsonb check(jsonb_typeof(messages)='array' and jsonb_array_length(messages)<=200 and octet_length(messages::text)<=2000000),
  browser_run_id text check(browser_run_id is null or browser_run_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  revision integer not null default 0 check(revision>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_chats_owner_updated on public.agent_chats(user_id,updated_at desc,id);
alter table public.agent_chats enable row level security;
revoke all on public.agent_chats from anon;
grant select,insert,update,delete on public.agent_chats to authenticated;
grant all on public.agent_chats to service_role;
create policy agent_chats_owner on public.agent_chats for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
