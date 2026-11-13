create table public.work_templates (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 80),
 kind text not null check (kind in ('task','automation')),
 title text not null check (length(btrim(title)) between 1 and 240),
 description text not null default '' check (length(description) <= 8000),
 priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
 created_at timestamptz not null default now()
);
create unique index work_templates_owner_name on public.work_templates(user_id,kind,lower(btrim(name)));
alter table public.work_templates enable row level security;
create policy "Owners manage work templates" on public.work_templates for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.work_templates from anon;
grant select,insert,delete on public.work_templates to authenticated;
grant all on public.work_templates to service_role;
notify pgrst, 'reload schema';
