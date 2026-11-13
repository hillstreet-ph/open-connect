-- Account-owned inbound Telegram integrations stay separate from outbound app_connections.
CREATE TABLE IF NOT EXISTS public.inbound_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'telegram'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  credential_reference text NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disabled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, display_name)
);

CREATE INDEX IF NOT EXISTS inbound_integrations_user_idx
  ON public.inbound_integrations (user_id, provider);

ALTER TABLE public.inbound_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own inbound integrations"
  ON public.inbound_integrations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_integrations TO authenticated;
GRANT ALL ON public.inbound_integrations TO service_role;

COMMENT ON TABLE public.inbound_integrations IS
  'Account-owned inbound integration credentials; intentionally separate from outbound app_connections.';
