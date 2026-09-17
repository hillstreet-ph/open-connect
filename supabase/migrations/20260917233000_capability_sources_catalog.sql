-- Official capability sources and discovery directories. Idempotent by category/slug.
-- Secrets are never stored here; credential binding happens through Open-Connect.

insert into public.categories (slug, name, description) values
  ('browser', 'Browser', 'Search, fetch, browser sessions, and web agents'),
  ('security', 'Security', 'Identity, credentials, auditing, and secure operations'),
  ('business', 'Business', 'Business operations, CRM, finance, and collaboration')
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description;

insert into public.resources (
  slug, name, description, resource_type, category_slug, author, source,
  source_url, version, installation_type, installation_config,
  supported_clients, verified, featured, published
) values
  (
    'docker-agent-mcp', 'Docker Agent MCP',
    'Docker MCP Gateway, local stdio, and remote MCP tool-provider integration with allowlists and deferred loading.',
    'mcp', 'infrastructure', 'Docker', 'official-docs',
    'https://docs.docker.com/ai/docker-agent/tools/mcp/', '1.0.0', 'provider-config',
    '{"config":"config/docker-agent.open-connect.yaml","credential_transport":"environment_or_oauth","duplicate_policy":"namespace_or_whitelist"}'::jsonb,
    array['Open-Connect','Docker Agent','ChatGPT','Claude','Codex'], true, true, true
  ),
  (
    'docker-agent-skills', 'Docker Agent Skills',
    'Loads reusable SKILL.md packages on demand while reusing the canonical Open-Connect skill source.',
    'skill', 'developer', 'Docker', 'official-docs',
    'https://docs.docker.com/ai/docker-agent/features/skills/', '1.0.0', 'skill-source',
    '{"discovery":"SKILL.md","reuse_local_open_connect_skills":true,"bulk_copy":false}'::jsonb,
    array['Open-Connect','Docker Agent','Claude','Codex'], true, true, true
  ),
  (
    'opx-coding-directory', 'OPX Coding Skills Directory',
    'Discovery source for coding skills. Each package requires provenance, license, and duplicate review before installation.',
    'app', 'developer', 'OpxSkills', 'external-directory',
    'https://www.opxskills.com/category/coding', '1.0.0', 'discovery-only',
    '{"bulk_install":false,"review_required":["provenance","license","duplicate_key","instructions"]}'::jsonb,
    array['Open-Connect','ChatGPT','Claude','Codex'], true, false, true
  ),
  (
    'tinyfish-mcp', 'TinyFish Web Agent MCP',
    'Official remote MCP for web search, fetch, browser sessions, and web-agent runs.',
    'mcp', 'browser', 'TinyFish', 'official-remote-mcp',
    'https://agent.tinyfish.ai/mcp', '1.0.0', 'oauth-mcp-url',
    '{"documentation":"https://docs.tinyfish.ai/for-coding-agents","credential_ref":"credential://tinyfish/open-connect","capabilities":["search","fetch","browser","agent"],"status":"authorization_required"}'::jsonb,
    array['Open-Connect','ChatGPT','Claude','Codex','Open-System'], true, true, true
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
  installation_type = excluded.installation_type,
  installation_config = excluded.installation_config,
  supported_clients = excluded.supported_clients,
  verified = excluded.verified,
  featured = excluded.featured,
  published = excluded.published,
  updated_at = now();
