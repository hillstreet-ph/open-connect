-- Publish one canonical Hubstaff Admin integration. The access token remains
-- in encrypted runtime storage and is represented here only by a reference.
insert into public.resources (
  slug, name, description, resource_type, category_slug, author, source,
  source_url, version, license, installation_type, installation_config,
  supported_clients, verified, featured, published
)
values (
  'open-hubstaff-admin-kit', 'Open Hubstaff Admin Kit',
  'Governed Hubstaff organization, workforce, time-tracking, and task administration through the Open-Connect MCP gateway.',
  'plugin', 'business', 'HillStreet Information Technology Services', 'first-party',
  'https://open-connect.site/mcp', '1.0.0', 'proprietary', 'mcp-gateway',
  '{"mcp_url":"https://open-connect.site/mcp","provider":"hubstaff_admin","credential_ref":"credential://hubstaff/admin","credential_transport":"opaque_reference_only","capabilities":["identity.read","organization.read","hubstaff.read","hubstaff.write","tasks.read","tasks.write"],"default_access":"scoped_read_write","destructive_approval_required":true,"review_state":"approved"}'::jsonb,
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
