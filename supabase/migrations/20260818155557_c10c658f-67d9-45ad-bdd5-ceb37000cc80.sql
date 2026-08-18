CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['models:read','models:invoke'],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_user_id_idx ON public.api_keys(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own api keys" ON public.api_keys
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own api keys" ON public.api_keys
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own api keys" ON public.api_keys
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own api keys" ON public.api_keys
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.gateway_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  model text,
  status_code integer NOT NULL,
  upstream text NOT NULL,
  total_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gateway_requests_user_id_idx ON public.gateway_requests(user_id);

GRANT SELECT ON public.gateway_requests TO authenticated;
GRANT ALL ON public.gateway_requests TO service_role;

ALTER TABLE public.gateway_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own gateway requests" ON public.gateway_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);