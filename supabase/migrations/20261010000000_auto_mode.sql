-- Auto controls owned task preferences. It never grants gateway or host permissions.
create table if not exists public.auto_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null default 'personal' check (length(scope_key) between 1 and 160),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope_key)
);
alter table public.auto_preferences enable row level security;
create policy "Owners read Auto preferences" on public.auto_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners insert Auto preferences" on public.auto_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update Auto preferences" on public.auto_preferences
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update on public.auto_preferences to authenticated;
grant all on public.auto_preferences to service_role;

-- Reviewed first-party instruction package; no executable remote code or secrets.
insert into public.resources (
  slug, name, description, resource_type, category_slug, author, source,
  source_url, repository_url, version, license, installation_type, installation_config,
  supported_clients, verified, featured, published
) values (
  'auto', 'Auto',
  'Autonomous task completion and automatic matching of relevant tools in ChatGPT Work and Codex. Saved Auto switch, scoped discovery, and secure credential routing. Host approvals remain enforced.',
  'skill', 'developer', 'Open-Connect', 'open-connect',
  'https://github.com/hillstreet-ph/open-connect/blob/main/skills/auto/SKILL.md',
  'https://github.com/hillstreet-ph/open-connect', '2.0.0', 'MIT', 'skill-source',
  '{"review_state":"approved","security_review":"first_party_instructions_only_no_secret_access_no_approval_bypass","skill_path":"skills/auto/SKILL.md","implicit_invocation":true,"mcp_url":"https://open-connect.site/mcp","mode_tool":"get_auto_mode","toggle_tool":"set_auto_mode","discovery_tool":"auto_discover","host_approvals":"enforced","credential_values_exposed":false}'::jsonb,
  array['ChatGPT','Codex','Open-Connect'], true, true, true
) on conflict (slug) do update set
  name = excluded.name, description = excluded.description, resource_type = excluded.resource_type,
  category_slug = excluded.category_slug, author = excluded.author, source = excluded.source,
  source_url = excluded.source_url, repository_url = excluded.repository_url, version = excluded.version,
  license = excluded.license, installation_type = excluded.installation_type,
  installation_config = excluded.installation_config, supported_clients = excluded.supported_clients,
  verified = excluded.verified, featured = excluded.featured, published = excluded.published,
  updated_at = now();
