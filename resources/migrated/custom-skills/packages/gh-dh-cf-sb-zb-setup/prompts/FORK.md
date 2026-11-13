# Fork Mode
Preserve upstream history/license/notices. Route upstream changes through upstream-sync → compatibility → CI/security → candidate image/scan → Supabase compatibility → Zeabur staging → Cloudflare staging → E2E → release PR → production. Never upstream directly to main/production.
