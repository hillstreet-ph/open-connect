-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- roles
CREATE TYPE public.app_role AS ENUM ('user','developer','publisher','admin','owner');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- catalog
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are public" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE TYPE public.resource_type AS ENUM ('skill','mcp','tool','plugin','agent','prompt','guide','app','model');
CREATE TABLE public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  resource_type public.resource_type NOT NULL,
  category_slug text REFERENCES public.categories(slug) ON DELETE SET NULL,
  author text,
  source text,
  source_url text,
  repository_url text,
  version text,
  license text,
  installation_type text,
  installation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  supported_clients text[] NOT NULL DEFAULT '{}',
  verified boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resources_type_idx ON public.resources (resource_type);
CREATE INDEX resources_published_idx ON public.resources (published);
GRANT SELECT ON public.resources TO anon, authenticated;
GRANT ALL ON public.resources TO service_role;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published resources are public" ON public.resources FOR SELECT USING (published = true);
CREATE POLICY "Admins read all resources" ON public.resources FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "Admins manage resources" ON public.resources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER resources_touch BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.categories (slug, name, description) VALUES
  ('development','Development','Coding, review and repository workflows'),
  ('productivity','Productivity','Docs, notes, tasks and scheduling'),
  ('data','Data','Databases, warehouses and analytics'),
  ('communication','Communication','Chat, email and notifications'),
  ('infrastructure','Infrastructure','Cloud, edge and deployment');

INSERT INTO public.resources (slug, name, description, resource_type, category_slug, author, version, license, installation_type, supported_clients, verified, featured, published) VALUES
  ('github-mcp','GitHub MCP','Read repositories, issues and pull requests over MCP.','mcp','development','Open-Connect','1.0.0','MIT','mcp-url','{ChatGPT,Claude,Cursor}',true,true,true),
  ('repo-review','GitHub Repository Review','Structured code review skill for pull requests.','skill','development','Open-Connect','1.2.0','MIT','skill-bundle','{ChatGPT,Claude}',true,true,true),
  ('create-github-issue','Create GitHub Issue','Tool that opens an issue in a connected repository.','tool','development','Open-Connect','1.0.0','MIT','gateway-tool','{ChatGPT,Claude,Hermes}',true,false,true),
  ('notion-mcp','Notion MCP','Search and update Notion pages from an agent.','mcp','productivity','Open-Connect','0.9.0','MIT','mcp-url','{ChatGPT,Claude}',true,false,true),
  ('postgres-analyst','Postgres Analyst','Agent that explores schemas and writes safe SQL.','agent','data','Open-Connect','0.4.0','Apache-2.0','agent-config','{Claude,Hermes}',false,true,true),
  ('release-notes-prompt','Release Notes Prompt','Prompt template that turns commits into release notes.','prompt','development','Open-Connect','1.0.0','MIT','prompt','{ChatGPT,Claude}',true,false,true),
  ('connect-github-guide','Connect GitHub to Open-Connect','Step-by-step guide for the GitHub OAuth connection.','guide','development','Open-Connect','1.0.0','CC-BY-4.0','doc','{ChatGPT,Claude,Cursor,Hermes}',true,false,true),
  ('slack-notifier','Slack Notifier','Plugin that posts agent results into Slack channels.','plugin','communication','Open-Connect','0.7.0','MIT','gateway-tool','{ChatGPT,Hermes}',false,false,true);