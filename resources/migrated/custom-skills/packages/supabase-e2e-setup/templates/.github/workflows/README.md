# Supabase CI/CD Workflows

Generate only after project discovery.

Typical capabilities:
- migration lint/validation
- local/staging DB tests
- generated type consistency
- RLS/Auth/Storage integration tests
- Edge Function test/deploy
- staging verification
- production migration behind environment/approval gates
- production verification

Never expose production privileged credentials to untrusted pull requests.
