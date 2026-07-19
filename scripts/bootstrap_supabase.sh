#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

require_env SUPABASE_ACCESS_TOKEN
require_env SUPABASE_PROJECT_REF
require_env SUPABASE_DB_PASSWORD
require_env SUPABASE_SERVICE_ROLE_KEY
require_env SUPABASE_URL
require_env SUPABASE_ANON_KEY

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is not installed" >&2
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

mkdir -p supabase/migrations
mkdir -p supabase/functions/get_secret
mkdir -p supabase/functions/add_secret

if [[ ! -f supabase/config.toml ]]; then
  supabase init >/dev/null 2>&1 || true
fi

cat > supabase/migrations/20260712_autonomous_bootstrap.sql <<'SQL'

create table if not exists public.agent_vault (
  id uuid primary key default gen_random_uuid(),
  service_name text not null unique,
  encrypted_secret text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.agent_vault enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_vault'
      AND policyname = 'service role manages agent vault'
  ) THEN
    CREATE POLICY "service role manages agent vault"
      ON public.agent_vault
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END
$$;
SQL

cat > supabase/functions/get_secret/index.ts <<'TS'
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const serviceName = url.searchParams.get('service_name');
  if (!serviceName) {
    return new Response(JSON.stringify({ error: 'Missing service_name query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await supabase
    .from('agent_vault')
    .select('service_name, encrypted_secret, metadata')
    .eq('service_name', serviceName)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!data) {
    return new Response(JSON.stringify({ error: 'Secret not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      service_name: data.service_name,
      secret_value: data.encrypted_secret,
      metadata: data.metadata ?? {},
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
TS

cat > supabase/functions/add_secret/index.ts <<'TS'
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = await req.json().catch(() => null);
  const serviceName = payload?.service_name;
  const secretValue = payload?.secret_value;

  if (!serviceName || !secretValue) {
    return new Response(JSON.stringify({ error: 'service_name and secret_value are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await supabase
    .from('agent_vault')
    .upsert(
      {
        service_name: serviceName,
        encrypted_secret: secretValue,
        metadata: payload?.metadata ?? {},
      },
      { onConflict: 'service_name' },
    )
    .select('service_name, encrypted_secret, metadata')
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      service_name: data?.service_name,
      secret_value: data?.encrypted_secret,
      metadata: data?.metadata ?? {},
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
TS

export SUPABASE_ACCESS_TOKEN
supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
supabase db push
supabase functions deploy get_secret --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy add_secret --project-ref "$SUPABASE_PROJECT_REF"

echo "Supabase bootstrap complete."
