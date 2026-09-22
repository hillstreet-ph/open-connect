create extension if not exists supabase_vault cascade;

create table if not exists public.service_credentials (
  name text primary key check (name ~ '^[a-z0-9_]{3,80}$'),
  vault_secret_id uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.service_credentials enable row level security;
revoke all on public.service_credentials from public, anon, authenticated;
grant all on public.service_credentials to service_role;

create or replace function public.get_service_credential(p_name text)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret text;
begin
  if auth.role() <> 'service_role' then raise exception 'unauthorized'; end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  join public.service_credentials sc on sc.vault_secret_id = ds.id
  where sc.name = p_name;
  return v_secret;
end;
$$;

create or replace function public.set_service_credential(p_name text, p_secret_value text)
returns boolean
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'unauthorized'; end if;
  if p_name !~ '^[a-z0-9_]{3,80}$' then raise exception 'invalid credential name'; end if;
  if p_secret_value is null or length(p_secret_value) < 16 then raise exception 'invalid credential'; end if;

  select vault_secret_id into v_old_id from public.service_credentials where name = p_name for update;
  v_new_id := vault.create_secret(
    p_secret_value,
    'open_connect_service_' || p_name,
    'Open-Connect service credential ' || p_name
  );

  insert into public.service_credentials(name, vault_secret_id, updated_at)
  values (p_name, v_new_id, now())
  on conflict (name) do update set vault_secret_id = excluded.vault_secret_id, updated_at = now();

  if v_old_id is not null then delete from vault.secrets where id = v_old_id; end if;
  return true;
end;
$$;

revoke all on function public.get_service_credential(text) from public, anon, authenticated;
revoke all on function public.set_service_credential(text, text) from public, anon, authenticated;
grant execute on function public.get_service_credential(text) to service_role;
grant execute on function public.set_service_credential(text, text) to service_role;
