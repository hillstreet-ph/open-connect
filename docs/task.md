# Open Connect Master Task List

## Active Roadmap
- [ ] **Monitoring & Alerts**: Finalize setup of observability alerts via Langfuse and Railway.
- [ ] **Backup Workflow**: Re-attempt and verify the automated backup workflow with rate limit optimizations.
- [x] **Documentation Centralization**: Complete the migration of core guides to the `docs/` directory.

## Execution History
### July 2026
- **Centralization Init**: Created `docs/task.md` and `docs/dna.md` to serve as the agent coordination hub.
- **Production Ready**: Verified end-to-end Autonomous Deployment pipeline (Supabase + Railway).
- **Security Baseline**: Implemented Supabase Vault secrets management and `public.agent_vault` replication.
- **Storage Init**: Created 'backups', 'avatars', and 'documents' buckets with strict RLS.
- **RAG Baseline**: Created `public.documents_embeddings` with HNSW indexing.

## Maintenance Logs
- Scheduled backups every 6 hours.
- Healthchecks active at `/ready`.
