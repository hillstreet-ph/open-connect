# Migration Safety

All durable schema changes should be migration-controlled. Prefer expand/migrate/contract. Treat DROP/TRUNCATE/large destructive data changes as high risk. Require staging, compatibility analysis, backup/recovery readiness, and appropriate approval.
