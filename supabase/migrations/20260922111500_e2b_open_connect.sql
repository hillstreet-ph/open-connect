-- Publish one canonical E2B integration. The credential remains in the runtime
-- secret store and is represented only by an opaque reference in metadata.
insert into public.resources (
  slug, name, description, resource_type, category_slug, author, source,
  source_url, version, license, installation_type, installation_config,
  supported_clients, verified, featured, published
)
values (
  'open-e2b-kit', 'Open E2B Kit',
  'Governed E2B sandbox health, inventory, creation, and termination through the Open-Connect MCP gateway.',
  'plugin', 'developer', 'HillStreet Information Technology Services', 'first-party',
  'https://open-connect.site/mcp', '1.0.0', 'proprietary', 'mcp-gateway',
  '{"mcp_url":"https://open-connect.site/mcp","provider":"e2b","credential_ref":"credential://e2b/open-connect","credential_transport":"opaque_reference_only","capabilities":["sandbox.health","sandbox.list","sandbox.create","sandbox.kill"],"default_access":"scoped_read_write","destructive_approval_required":true,"review_state":"approved"}'::jsonb,
  array['ChatGPT','Codex','Open-Connect','Open-System'], true, true, true
)
on conflict (slug) do update set
  name=excluded.name,
  description=excluded.description,
  resource_type=excluded.resource_type,
  category_slug=excluded.category_slug,
  author=excluded.author,
  source=excluded.source,
  source_url=excluded.source_url,
  version=excluded.version,
  license=excluded.license,
  installation_type=excluded.installation_type,
  installation_config=excluded.installation_config,
  supported_clients=excluded.supported_clients,
  verified=excluded.verified,
  featured=excluded.featured,
  published=excluded.published,
  updated_at=now();
