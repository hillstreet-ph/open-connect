# Production Safety

- `main` is production source of truth.
- No routine direct push/force push/delete.
- Staging validation precedes normal production promotion.
- Never destroy DB/storage/volumes/domains/secrets to obtain a clean install.
- Production success requires post-deploy verification.
- Rollback must consider database compatibility separately.
