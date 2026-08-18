CREATE TABLE public.toolkits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.toolkits TO authenticated;
GRANT SELECT ON public.toolkits TO anon;
GRANT ALL ON public.toolkits TO service_role;

ALTER TABLE public.toolkits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published toolkits are public" ON public.toolkits
  FOR SELECT USING (published = true);
CREATE POLICY "Users can view own toolkits" ON public.toolkits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own toolkits" ON public.toolkits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own toolkits" ON public.toolkits
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own toolkits" ON public.toolkits
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER toolkits_touch_updated_at BEFORE UPDATE ON public.toolkits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.toolkit_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  toolkit_id uuid NOT NULL REFERENCES public.toolkits(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (toolkit_id, resource_id)
);

CREATE INDEX toolkit_items_toolkit_id_idx ON public.toolkit_items(toolkit_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.toolkit_items TO authenticated;
GRANT SELECT ON public.toolkit_items TO anon;
GRANT ALL ON public.toolkit_items TO service_role;

ALTER TABLE public.toolkit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toolkit items follow toolkit visibility" ON public.toolkit_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.toolkits t
    WHERE t.id = toolkit_id AND (t.published = true OR t.user_id = auth.uid())
  ));
CREATE POLICY "Users manage items in own toolkits" ON public.toolkit_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.toolkits t WHERE t.id = toolkit_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.toolkits t WHERE t.id = toolkit_id AND t.user_id = auth.uid()));

INSERT INTO public.categories (slug, name, description) VALUES
  ('productivity', 'Productivity', 'Docs, notes, tasks and calendars'),
  ('developer', 'Developer', 'Code, repos, CI and infrastructure'),
  ('communication', 'Communication', 'Chat, email and meetings'),
  ('data', 'Data', 'Databases, warehouses and analytics'),
  ('ai', 'AI', 'Models, prompts and agent scaffolding')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.resources (slug, name, description, resource_type, category_slug, author, source, verified, featured, published, supported_clients) VALUES
  ('github-mcp', 'GitHub MCP Server', 'Read repositories, issues and pull requests over MCP.', 'mcp', 'developer', 'Open-Connect', 'registry', true, true, true, ARRAY['claude','cursor','openai']),
  ('postgres-mcp', 'Postgres MCP Server', 'Query and inspect Postgres databases over MCP.', 'mcp', 'data', 'Open-Connect', 'registry', true, false, true, ARRAY['claude','cursor']),
  ('notion-app', 'Notion', 'Connect Notion pages, databases and comments.', 'app', 'productivity', 'Open-Connect', 'connections', true, true, true, ARRAY['agents']),
  ('slack-app', 'Slack', 'Send messages and read channels in Slack workspaces.', 'app', 'communication', 'Open-Connect', 'connections', true, true, true, ARRAY['agents']),
  ('google-calendar-app', 'Google Calendar', 'Create and read calendar events.', 'app', 'productivity', 'Open-Connect', 'connections', true, false, true, ARRAY['agents']),
  ('gemini-flash-model', 'Gemini 3.7 Flash', 'Fast general-purpose model with long context.', 'model', 'ai', 'Open-Connect', 'models', true, true, true, ARRAY['openai-compatible']),
  ('gpt5-model', 'GPT-5', 'High-reasoning model for complex agent work.', 'model', 'ai', 'Open-Connect', 'models', true, false, true, ARRAY['openai-compatible']),
  ('web-search-tool', 'Web Search', 'Search the live web and return cited results.', 'tool', 'data', 'Open-Connect', 'registry', true, true, true, ARRAY['agents']),
  ('http-request-tool', 'HTTP Request', 'Call any HTTP endpoint with scoped credentials.', 'tool', 'developer', 'Open-Connect', 'registry', true, false, true, ARRAY['agents']),
  ('code-review-skill', 'Code Review', 'Structured review skill for diffs and pull requests.', 'skill', 'developer', 'Open-Connect', 'registry', true, true, true, ARRAY['claude','cursor']),
  ('meeting-notes-skill', 'Meeting Notes', 'Turn transcripts into decisions and action items.', 'skill', 'productivity', 'Open-Connect', 'registry', true, false, true, ARRAY['claude']),
  ('research-agent', 'Research Agent', 'Multi-step researcher that cites every claim.', 'agent', 'ai', 'Open-Connect', 'registry', true, true, true, ARRAY['agents']),
  ('support-triage-agent', 'Support Triage Agent', 'Classifies and routes inbound support requests.', 'agent', 'communication', 'Open-Connect', 'registry', false, false, true, ARRAY['agents']),
  ('sql-explain-prompt', 'SQL Explainer', 'Prompt that explains and optimises SQL queries.', 'prompt', 'data', 'Open-Connect', 'registry', true, false, true, ARRAY['any']),
  ('release-notes-prompt', 'Release Notes', 'Prompt that drafts release notes from commits.', 'prompt', 'developer', 'Open-Connect', 'registry', true, false, true, ARRAY['any'])
ON CONFLICT (slug) DO NOTHING;