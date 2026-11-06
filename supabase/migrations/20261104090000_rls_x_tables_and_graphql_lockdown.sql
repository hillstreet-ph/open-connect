-- Security hardening: RLS on internal x_* tables and pg_graphql exposure lockdown.
--
-- Context: Supabase Security Advisor flags (see issues #399, #408):
--   1. Eight public x_* tables with row level security disabled.
--   2. Anonymous and authenticated GraphQL schema visibility warnings.
--
-- 1. The x_* tables hold internal integration state only. Effective-grant checks
--    (2026-10-25, issue #399) confirmed zero direct SELECT/INSERT/UPDATE/DELETE/
--    TRUNCATE privileges for anon or authenticated on any of them, so enabling RLS
--    changes no effective client access: client roles were already denied and now
--    remain denied by policy as well; the server-side service role bypasses RLS.
--    These tables are internal-only, so the least-privilege design is default-deny
--    with no client policies.

alter table public.x_storages       enable row level security;
alter table public.x_users          enable row level security;
alter table public.x_meta           enable row level security;
alter table public.x_setting_items  enable row level security;
alter table public.x_search_nodes   enable row level security;
alter table public.x_task_items     enable row level security;
alter table public.x_ssh_public_keys enable row level security;
alter table public.x_sharing_dbs    enable row level security;

-- 2. The web application never calls the Supabase pg_graphql endpoint: it uses
--    supabase-js (PostgREST) server-side and its only GraphQL client targets the
--    external Zeabur API (src/lib/cloud-resources.server.ts). Removing schema
--    visibility and function execution from the client roles eliminates the
--    advisor's anonymous and authenticated GraphQL exposure warnings without
--    affecting any application workflow.

revoke usage on schema graphql from anon, authenticated;
revoke all on all functions in schema graphql from anon, authenticated;
