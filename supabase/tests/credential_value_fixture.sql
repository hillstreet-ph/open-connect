-- Disposable PostgreSQL CI database only; never apply this file to a provider.
-- key_access_fixture.sql supplies synthetic roles and auth.uid().
-- This adapter models Vault's create/read/delete contract with pgcrypto encryption.
-- It does not validate Supabase Vault's production encryption implementation.
create schema extensions;
create extension pgcrypto with schema extensions;
create schema vault;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  secret bytea not null,
  name text unique,
  description text
);
create function vault.create_secret(p_secret text, p_name text, p_description text)
returns uuid language plpgsql security definer
set search_path = vault, extensions, pg_temp as $$
declare v_id uuid;
begin
  insert into vault.secrets(secret,name,description)
  values (extensions.pgp_sym_encrypt(p_secret,'disposable-fixture-key-only'),p_name,p_description)
  returning id into v_id;
  return v_id;
end;
$$;
create view vault.decrypted_secrets as
  select id,extensions.pgp_sym_decrypt(secret,'disposable-fixture-key-only') as decrypted_secret
  from vault.secrets;
revoke all on schema vault from public,anon,authenticated;
revoke all on vault.secrets,vault.decrypted_secrets from public,anon,authenticated;
revoke all on function vault.create_secret(text,text,text) from public,anon,authenticated;
create table public.credential_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  secret_type text not null,
  scopes text[] not null default '{}',
  secret_value text,
  vault_secret_id uuid references vault.secrets(id),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.credential_secrets enable row level security;
revoke all on public.credential_secrets from public,anon,authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);

