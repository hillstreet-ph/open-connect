-- Separate organization, workspace, and project boundaries and bind gateway keys to one context.
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

alter table public.workspaces enable row level security;
grant select, insert, update, delete on public.workspaces to authenticated;
grant all on public.workspaces to service_role;

drop policy if exists "Organization members view workspaces" on public.workspaces;
create policy "Organization members view workspaces" on public.workspaces for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=workspaces.organization_id and m.user_id=auth.uid()));
drop policy if exists "Organization managers manage workspaces" on public.workspaces;
create policy "Organization managers manage workspaces" on public.workspaces for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id=workspaces.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')))
with check (exists (select 1 from public.organization_members m where m.organization_id=workspaces.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

alter table public.projects add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

do $$
declare org record; workspace uuid;
begin
  for org in select id, owner_id from public.organizations loop
    insert into public.workspaces(organization_id,name,slug,description,created_by)
    values(org.id,'Default workspace','default','Backfilled workspace for existing projects',org.owner_id)
    on conflict (organization_id,slug) do update set name=excluded.name
    returning id into workspace;
    update public.projects set workspace_id=workspace where organization_id=org.id and workspace_id is null;
  end loop;
end $$;

alter table public.api_keys add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.api_keys add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.api_keys add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.api_keys add column if not exists access_profile text not null default 'legacy';
alter table public.api_keys drop constraint if exists api_keys_access_profile_check;
alter table public.api_keys add constraint api_keys_access_profile_check check (access_profile in ('legacy','read_only','builder','developer','administrator','custom'));

create or replace function public.oc_verify_gateway_key(p_key text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare k public.api_keys;
begin
 if p_key is null or p_key not like 'oc_live_%' or length(p_key)>256 then return null; end if;
 select * into k from public.api_keys where key_hash=encode(extensions.digest(p_key,'sha256'),'hex') and revoked_at is null and (expires_at is null or expires_at>now());
 if not found then return null; end if;
 update public.api_keys set last_used_at=now() where id=k.id;
 return jsonb_build_object('id',k.id,'user_id',k.user_id,'scopes',k.scopes,'expires_at',k.expires_at,'organization_id',k.organization_id,'workspace_id',k.workspace_id,'project_id',k.project_id,'access_profile',k.access_profile);
end $function$;

revoke all on function public.oc_verify_gateway_key(text) from public;
grant execute on function public.oc_verify_gateway_key(text) to anon,authenticated;
