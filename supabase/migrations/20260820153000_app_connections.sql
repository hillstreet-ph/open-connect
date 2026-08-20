CREATE TABLE IF NOT EXISTS public.app_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  display_name text NOT NULL,
  provider_account_id text,
  status text NOT NULL DEFAULT 'connected',
  scopes text[] NOT NULL DEFAULT '{}',
  credential_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_connections_user_provider_acct
  ON public.app_connections (user_id, provider, COALESCE(provider_account_id, ''));

CREATE INDEX IF NOT EXISTS app_connections_user_id_idx ON public.app_connections(user_id);

ALTER TABLE public.app_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own app connections" ON public.app_connections;
CREATE POLICY "Users manage own app connections" ON public.app_connections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_connections TO authenticated;
GRANT ALL ON public.app_connections TO service_role;

INSERT INTO public.resources (slug, name, description, resource_type, category_slug, author, source, verified, featured, published, supported_clients)
VALUES
  ('github-app', 'GitHub', 'Connect repositories, issues and pull requests.', 'app', 'developer', 'Open-Connect', 'connections', true, true, true, ARRAY['agents']),
  ('gmail-app', 'Gmail', 'Read and send email with scoped access.', 'app', 'communication', 'Open-Connect', 'connections', true, false, true, ARRAY['agents']),
  ('google-drive-app', 'Google Drive', 'Browse and manage Drive files.', 'app', 'productivity', 'Open-Connect', 'connections', true, false, true, ARRAY['agents']),
  ('cloudflare-app', 'Cloudflare', 'Manage zones and Workers metadata.', 'app', 'developer', 'Open-Connect', 'connections', true, false, true, ARRAY['agents'])
ON CONFLICT (slug) DO NOTHING;
