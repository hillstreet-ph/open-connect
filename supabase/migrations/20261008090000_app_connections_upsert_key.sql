-- Make the MCP configure_connection upsert conflict target valid.
-- provider_account_id is always populated for capability grants.
CREATE UNIQUE INDEX IF NOT EXISTS app_connections_user_provider_account_id_unique
  ON public.app_connections (user_id, provider, provider_account_id);
