CREATE TABLE public.agent_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  mcp_url text NOT NULL,
  transport text NOT NULL DEFAULT 'http',
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  toolkit_id uuid REFERENCES public.toolkits(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'ready',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_connections_user_id_idx ON public.agent_connections(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_connections TO authenticated;
GRANT ALL ON public.agent_connections TO service_role;

ALTER TABLE public.agent_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent connections" ON public.agent_connections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER agent_connections_touch_updated_at BEFORE UPDATE ON public.agent_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();