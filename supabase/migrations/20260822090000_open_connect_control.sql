create type public.control_session_state as enum ('requested','provisioning','ready','paused','closing','closed','failed','expired');
create type public.control_approval_state as enum ('pending','approved','denied','expired','consumed');

create table public.control_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null,
  environment text not null check (environment in ('development','staging','production')),
  provider text not null,
  capability text not null,
  state public.control_session_state not null default 'requested',
  provider_handle_ciphertext text,
  correlation_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.control_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  requested_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  action text not null,
  target text not null,
  environment text not null,
  risk text not null,
  parameters_digest text not null,
  state public.control_approval_state not null default 'pending',
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.control_audit_events (
  id bigint generated always as identity primary key,
  timestamp timestamptz not null default now(),
  tenant_id uuid not null,
  actor_id uuid,
  agent_id text not null,
  capability text not null,
  target text not null,
  environment text not null,
  result text not null,
  approval_id uuid references public.control_approvals(id),
  correlation_id uuid not null,
  evidence jsonb not null default '{}'::jsonb
);

alter table public.control_sessions enable row level security;
alter table public.control_approvals enable row level security;
alter table public.control_audit_events enable row level security;

create policy "users read own control sessions" on public.control_sessions for select to authenticated using (user_id = auth.uid());
create policy "users read own approval requests" on public.control_approvals for select to authenticated using (requested_by = auth.uid());
create policy "users read own audit events" on public.control_audit_events for select to authenticated using (actor_id = auth.uid());

revoke insert, update, delete on public.control_sessions from anon, authenticated;
revoke insert, update, delete on public.control_approvals from anon, authenticated;
revoke insert, update, delete on public.control_audit_events from anon, authenticated;
