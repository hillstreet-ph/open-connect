# Secrets Policy

- Never bake runtime secrets into images.
- Never commit Docker Hub tokens or `.env` files.
- Use GitHub/provider secret stores.
- Use BuildKit secret mounts only when sensitive build-time access is genuinely required.
- Report secret names/status only.
