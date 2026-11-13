# Zeabur deployment — Open Connect control plane

The public web application remains on Cloudflare Pages at `https://open-connect.site`.
Zeabur runs the FastAPI control-plane service from this repository.

## Source deployment

1. Create a Zeabur GitHub service from `hillstreet-ph/open-connect`.
2. Keep the repository root as the build root.
3. Zeabur reads `zbpack.json` and builds `Zeabur.Dockerfile`.
4. Configure the service health-check path as `/healthz`.
5. Bind a dedicated API hostname, such as `api.open-connect.site`, after the
   deployment is healthy.

The container listens on `0.0.0.0:$PORT`, as required by Zeabur.

## Secret boundary

Configure production variables through Zeabur's encrypted environment-variable
settings or the Open Connect credential broker. Never commit values to this
repository.

Required variable names are documented in `control-plane/.env.example`.

## Verification

```bash
curl --fail --show-error https://<service-domain>/healthz
```

A successful deployment must return HTTP 200 before DNS or frontend routing is
changed.
