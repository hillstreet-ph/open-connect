create table if not exists public.capability_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  environment text not null check (environment in ('development','staging','production')),
  state text not null default 'installed' check (state in ('installed','disabled','failed')),
  configuration jsonb not null default '{}'::jsonb,
  correlation_id uuid not null,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, resource_id, environment)
);

create table if not exists public.autonomous_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null,
  environment text not null check (environment in ('development','staging','production')),
  state text not null check (state in ('planned','running','approval_required','succeeded','failed','rolled_back')),
  plan jsonb not null,
  evidence jsonb not null default '{}'::jsonb,
  rollback jsonb not null default '{}'::jsonb,
  correlation_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.capability_installations enable row level security;
alter table public.autonomous_runs enable row level security;

create policy "users read own capability installations" on public.capability_installations
  for select to authenticated using (user_id = auth.uid());
create policy "users read own autonomous runs" on public.autonomous_runs
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.capability_installations from anon, authenticated;
revoke insert, update, delete on public.autonomous_runs from anon, authenticated;
grant select on public.capability_installations, public.autonomous_runs to authenticated;
grant all on public.capability_installations, public.autonomous_runs to service_role;

insert into public.resources (
  slug, name, description, resource_type, category_slug, author, source,
  version, installation_type, installation_config, supported_clients,
  verified, featured, published
) values (
  'airtable-app', 'Airtable',
  'Read and write Airtable bases, records, interfaces, comments, and draft automations through a scoped connection.',
  'app', 'data', 'Open-Connect', 'chatgpt-plugin', '1.0.0', 'oauth',
  '{"credential_ref":"credential://airtable/kobeplay","health_check":"mcp.ping + workspaces.list","approval_gates":["record.delete","table.delete","interface.publish","automation.delete"]}'::jsonb,
  array['ChatGPT','Open-Connect','Open-System'], true, true, true
)
on conflict (slug) do update set
  description = excluded.description,
  installation_config = excluded.installation_config,
  supported_clients = excluded.supported_clients,
  verified = true,
  published = true,
  updated_at = now();
