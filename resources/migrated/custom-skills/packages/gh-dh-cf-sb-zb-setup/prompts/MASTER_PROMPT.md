# Master Prompt
Execute `gh-dh-cf-sb-zb-setup/SKILL.md`.

Use GitHub + Docker Hub + Supabase + Zeabur + Cloudflare. Railway is NOT_REQUIRED.

Discover existing resources first. Preserve production. Build the release once, scan it, publish to Docker Hub, record the immutable digest, validate that digest in Zeabur staging, and promote the SAME verified digest to Zeabur production. Verify Supabase and Cloudflare end to end. Never fabricate credentials or infer completion.
