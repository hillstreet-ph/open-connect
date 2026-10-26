create table public.ai_agency_teams (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 100),
 category text not null check (category in ('development','business','marketing','research','operations','custom')),
 description text not null default '' check (length(description)<=2000),
 roles text[] not null check (cardinality(roles) between 2 and 6 and array_position(roles,null) is null and length(array_to_string(roles,''))<=480),
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index ai_agency_teams_owner_name on public.ai_agency_teams(user_id,lower(btrim(name)));
alter table public.ai_agency_teams enable row level security;
create policy "Owners manage AI Agency teams" on public.ai_agency_teams for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.ai_agency_teams from anon,authenticated;
grant select,insert,update on public.ai_agency_teams to authenticated;
grant all on public.ai_agency_teams to service_role;
notify pgrst, 'reload schema';
