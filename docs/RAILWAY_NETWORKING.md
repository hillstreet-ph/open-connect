# Networking — Open-Connect (Railway + Cloudflare)

## Routing model

```text
PUBLIC DOMAIN (Cloudflare)
  open-connect.site, www.open-connect.site      → Cloudflare Pages (frontend, unchanged)
  api.open-connect.site                         → Cloudflare CNAME → Railway origin
                                                → control_plane service (Railway)
```

## Services exposed to the public

| Service | Public? | How |
|---------|---------|-----|
| `control_plane` (Railway) | Yes, via custom domain | `api.open-connect.site` |
| Supabase (Auth + DB) | No (private; VPC/Internet via managed HTTPS) | managed |
| Databricks | No | managed |
| Credential vault | No (internal broker) | internal |

## Ingress / egress rules

- Only the `control_plane` service listens on the public Internet (port `$PORT`).
- The control plane does **not** open additional public ports.
- Private networking: not required for the control plane (no sibling Railway
  services on Railway; dependencies are external, managed services).
- `OC_ALLOWED_ORIGINS=https://open-connect.site` restricts CORS to the Cloudflare
  frontend origin.

## Custom domain cutover (Cloudflare)

1. Railway custom domain `api.open-connect.site` assigned to the service.
2. Railway publishes a generated origin domain (e.g. `oc-prod-*.up.railway.app`).
3. In Cloudflare DNS, add a **CNAME** `api.open-connect.site` → the Railway origin
   domain, **proxy OFF** (`DNS only`) so traffic flows to Railway.
4. Cloudflare TLS (`flexible` or `full`, depending on plan) terminates at the edge.
5. Verify `curl -v https://api.open-connect.site/healthz` after cutover.

## Health / readiness

- Railway performs a TCP-level liveness on `$PORT` by default.
- The FastAPI app exposes a semantic HTTP readiness probe at `/healthz`
  (return `{ "status": "ok", "environment": "<lane>" }`). Use this to confirm the
  app is actually serving, not just the process listening.
