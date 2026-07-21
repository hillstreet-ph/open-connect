# Secrets Management Policy - Open Connect

## Overview
Open Connect utilizes a multi-layered security model for credential handling, centering on Supabase Vault and Railway environment injection.

## Secret Layers
1. **Supabase Vault**: Primary storage for sensitive database and API credentials.
2. **Agent Vault (`public.agent_vault`)**: Read-only replication for Edge Functions and XStack resolution.
3. **Railway Config**: Runtime variables for container orchestration.

## Safe Handling
- **No Local Storage**: Credentials should never be saved in local `.env` files on development machines.
- **Vault First**: All new integrations must register secrets via XStack Secret Broker.
- **Audit**: Use Langfuse and Supabase logs to monitor credential access patterns.
