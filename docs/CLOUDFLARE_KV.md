# Cloudflare Workers KV — Open-Connect

## Purpose

Edge key–value store for **fast, ephemeral** data at Cloudflare’s network:

| Use | Key pattern | TTL |
|-----|-------------|-----|
| OAuth code one-time use | `oauth:code:used:{id}` | ~15 min |
| Rate limits | `rl:{bucket}` | window seconds |
| Health probe | `oc:health:ping` | 60 s |

**Do not** store long-term secrets, API keys, or user PII in KV. Those stay in Supabase / Secrets vault.

## Setup (dashboard)

1. Cloudflare → **Workers & Pages** → **KV** → **Create a namespace**  
   Name: `open-connect-kv`
2. Copy the **Namespace ID**
3. Open **Workers & Pages** → **open-connect-app** → **Settings** → **Bindings** → **Add** → **KV namespace**
   - Variable name: **`OC_KV`**
   - Namespace: `open-connect-kv`
4. Edit repo `wrangler.toml` and set:

```toml
[[kv_namespaces]]
binding = "OC_KV"
id = "<YOUR_NAMESPACE_ID>"
```

5. **Redeploy** (push to `main` or Retry deployment)

## Code

```ts
import { kvGet, kvPut, rateLimitAllow, kvHealth } from "@/lib/kv.server";

// Soft-fail when unbound (local / before binding)
const ok = await rateLimitAllow(`ip:${ip}`, 60, 60);
```

Binding access uses `cloudflare:workers` `env.OC_KV` when running on Pages.

## Verify

```bash
curl -sS https://open-connect.site/api/v1/health | jq .kv
```

Expect after binding:

```json
{ "binding": "OC_KV", "bound": true, "writable": true }
```

Before binding: `bound: false` (app still healthy; KV is optional).

## API create namespace (optional)

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/storage/kv/namespaces" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"open-connect-kv"}'
```
