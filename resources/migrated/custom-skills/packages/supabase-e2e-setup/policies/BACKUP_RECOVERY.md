# Backup / Recovery

Verify actual backup/PITR capability before claiming readiness. Database backup and Storage backup are separate concerns. Prefer safe restore testing outside production. Recovery must cover DB, Auth configuration, RLS, Storage, functions, secrets, migrations, jobs, and integrations.
