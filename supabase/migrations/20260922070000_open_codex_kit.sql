insert into public.resources (
  slug, name, description, resource_type, category_slug, author, source,
  source_url, version, license, installation_type, installation_config,
  supported_clients, verified, featured, published
) values (
  'open-codex-kit',
  'Open Codex Kit',
  'Codex CLI, OpenAI Agents SDK, cloud workspace, browser/computer, MCP, skills, plugins, and governed Git operations through one verified toolkit.',
  'plugin',
  'developer',
  'HillStreet Information Technology Services',
  'first-party',
  'https://open-connect.site/downloads/open-codex-kit.zip',
  '1.0.0',
  'proprietary',
  'package',
  '{"package_url":"https://open-connect.site/downloads/open-codex-kit.zip","mcp_url":"https://open-connect.site/mcp","credential_transport":"opaque_reference_only","default_access":"read_only","production_approval_required":true,"destructive_approval_required":true}'::jsonb,
  array['ChatGPT','Codex','Open-Connect'],
  true,
  true,
  true
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  category_slug = excluded.category_slug,
  author = excluded.author,
  source = excluded.source,
  source_url = excluded.source_url,
  version = excluded.version,
  license = excluded.license,
  installation_type = excluded.installation_type,
  installation_config = excluded.installation_config,
  supported_clients = excluded.supported_clients,
  verified = excluded.verified,
  featured = excluded.featured,
  published = excluded.published,
  updated_at = now();
