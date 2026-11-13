-- Private incoming webhook inbox. The service role is the only writer.
create table public.incoming_webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  secret_hash text not null check (length(secret_hash) = 64),
  created_at timestamptz not null default now()
);
create table public.incoming_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.incoming_webhooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_id text not null check (length(delivery_id) between 1 and 200),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique(webhook_id, delivery_id)
);
create index incoming_webhook_deliveries_owner_idx on public.incoming_webhook_deliveries(user_id, received_at desc);
alter table public.incoming_webhooks enable row level security;
alter table public.incoming_webhook_deliveries enable row level security;
revoke all on public.incoming_webhooks, public.incoming_webhook_deliveries from anon, authenticated;
grant all on public.incoming_webhooks, public.incoming_webhook_deliveries to service_role;
