-- Credential / secrets manager (password-manager style references)
CREATE TABLE IF NOT EXISTS public.credential_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  secret_type text NOT NULL DEFAULT 'api_key'
    CHECK (secret_type IN ('api_key','oauth_token','mcp_url','bot_token','password','other')),
  scopes text[] NOT NULL DEFAULT '{}',
  -- Never returned after insert; only stored server-side for gateway use
  secret_value text NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credential_secrets_user_idx ON public.credential_secrets (user_id);

ALTER TABLE public.credential_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own secrets"
  ON public.credential_secrets
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credential_secrets TO authenticated;
GRANT ALL ON public.credential_secrets TO service_role;

-- Hide secret_value from default client selects via a view for listing
CREATE OR REPLACE VIEW public.credential_secrets_meta AS
  SELECT id, user_id, name, secret_type, scopes, last_used_at, created_at, updated_at,
         (length(secret_value) > 0) AS has_secret
  FROM public.credential_secrets;

GRANT SELECT ON public.credential_secrets_meta TO authenticated;
