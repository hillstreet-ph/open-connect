-- Durable capability gaps and redacted learning events for autonomous agents.
create table if not exists public.capability_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_run_id uuid references public.autonomous_runs(id) on delete set null,
  requested_capability text not null check (char_length(requested_capability) between 1 and 240),
  goal text not null check (char_length(goal) between 1 and 4000),
  state text not null default 'draft'
    check (state in ('draft', 'review', 'approved', 'rejected', 'implemented')),
  specification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.autonomous_run_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.autonomous_runs(id) on delete cascade,
  event_type text not null
    check (event_type in ('discovered', 'planned', 'executed', 'verified', 'blocked', 'failed', 'learned')),
  summary text not null check (char_length(summary) between 1 and 50000),
  capability_slugs text[] not null default '{}',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists capability_requests_user_state_idx
  on public.capability_requests (user_id, state, updated_at desc);
create index if not exists autonomous_run_events_run_idx
  on public.autonomous_run_events (run_id, created_at desc);

alter table public.capability_requests enable row level security;
alter table public.autonomous_run_events enable row level security;

drop policy if exists "users read own capability requests" on public.capability_requests;
create policy "users read own capability requests" on public.capability_requests
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "users read own autonomous events" on public.autonomous_run_events;
create policy "users read own autonomous events" on public.autonomous_run_events
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.capability_requests from anon, authenticated;
revoke insert, update, delete on public.autonomous_run_events from anon, authenticated;
grant select on public.capability_requests, public.autonomous_run_events to authenticated;
grant all on public.capability_requests, public.autonomous_run_events to service_role;

insert into public.resources (
  slug, name, description, resource_type, category_slug, author, source,
  version, installation_type, installation_config, supported_clients,
  verified, featured, published
) values (
  'tinyfish-agent-browser', 'TinyFish Agent Browser',
  'Browser-agent capability for structured website navigation and extraction through an approved connector.',
  'tool', 'developer', 'Open-Connect', 'connector', '1.0.0', 'api',
  '{"credential_ref":"credential://tinyfish/browser-agent","adapter":"tinyfish-compatible","health_check":"browser.session.create","approval_gates":["login","payment","public_post","data_export"],"memory_policy":"redacted-outcomes-only"}'::jsonb,
  array['ChatGPT','Open-Connect','Open-System'], true, false, true
)
on conflict (slug) do update set
  description = excluded.description,
  installation_config = excluded.installation_config,
  supported_clients = excluded.supported_clients,
  verified = true,
  published = true,
  updated_at = now();
