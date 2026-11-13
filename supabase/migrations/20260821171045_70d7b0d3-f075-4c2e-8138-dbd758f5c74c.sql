ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS package_path text,
  ADD COLUMN IF NOT EXISTS package_filename text,
  ADD COLUMN IF NOT EXISTS package_size bigint,
  ADD COLUMN IF NOT EXISTS package_mime text;

CREATE INDEX IF NOT EXISTS resources_owner_id_idx ON public.resources(owner_id);

DROP POLICY IF EXISTS "Owners manage their resources" ON public.resources;
CREATE POLICY "Owners manage their resources" ON public.resources
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.app_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  scopes text[] NOT NULL DEFAULT '{}',
  credential_reference text,
  provider_account_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_connections TO authenticated;
GRANT ALL ON public.app_connections TO service_role;
ALTER TABLE public.app_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own app connections" ON public.app_connections;
CREATE POLICY "Users manage their own app connections" ON public.app_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());