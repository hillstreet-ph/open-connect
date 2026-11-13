create table public.browser_automation_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 native_assistance boolean not null default false,
 external_assistance boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.browser_automation_preferences enable row level security;
create policy "Owners manage browser preferences" on public.browser_automation_preferences for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.browser_automation_preferences from anon,authenticated;
grant select,insert,update on public.browser_automation_preferences to authenticated;
grant all on public.browser_automation_preferences to service_role;
create table public.browser_verification_attempts (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 browser text not null,
 browser_ref text not null,
 page_url text not null,
 challenge_type text not null check (challenge_type in ('recaptcha_v2','turnstile')),
 site_key text not null,
 credential_id uuid not null,
 task_id bigint,
 state text not null check (state in ('submitting','processing','ready','failed','submission_unknown')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index browser_verification_owner_created on public.browser_verification_attempts(user_id,created_at desc);
alter table public.browser_verification_attempts enable row level security;
create policy "Owners read verification attempts" on public.browser_verification_attempts for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.browser_verification_attempts from anon,authenticated;
grant select on public.browser_verification_attempts to authenticated;
grant all on public.browser_verification_attempts to service_role;
notify pgrst, 'reload schema';
