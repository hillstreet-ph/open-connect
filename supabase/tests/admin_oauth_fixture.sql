-- Disposable database only, after key_access_fixture.sql. Never apply to a provider.
create schema extensions;
create extension pgcrypto with schema extensions;
alter table public.api_keys alter column id set default gen_random_uuid();
create table public.oauth_clients (
  client_id text primary key, client_name text not null, redirect_uris text[] not null
);
create table public.oauth_authorization_codes (
  code_hash text primary key, user_id uuid not null, client_id text not null,
  redirect_uri text not null, challenge text not null, scopes text[] not null,
  expires_at timestamptz not null
);
revoke all on public.oauth_clients, public.oauth_authorization_codes from public, anon, authenticated;
insert into public.oauth_clients values
  ('fixture-client', 'Disposable OAuth fixture', array['https://example.test/callback']);
insert into public.user_roles values
  ('00000000-0000-4000-8000-000000000003', 'admin');
