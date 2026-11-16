/**
 * Open-Connect — Railway Infrastructure as Code
 *
 * Migrates the open-connect control-plane from Zeabur to Railway.
 *
 * Source of truth: docs/RAILWAY.md, docs/RAILWAY_VARIABLES.md,
 * docs/DEPLOYMENT_RECORD.md.
 *
 * Production-safety discipline (enforced by the app, not by Railway):
 *   - control-plane/src/config.py Settings.assert_safe() requires
 *     OC_ALLOW_PRODUCTION == true whenever OC_ENVIRONMENT == "production".
 *     The Railway "production" environment MUST set OC_ENVIRONMENT=production
 *     AND OC_ALLOW_PRODUCTION=true. Everything else fails closed at startup.
 *   - Credential references are vault:// URIs only — never literal secrets in
 *     this file / config-as-code / the image. The Open-Connect credential
 *     broker resolves them at runtime.
 *
 * Rules:
 *   - This file must NEVER carry secret values. If a value is genuinely
 *     secret, set it as a Railway sealed variable by the operator (see
 *     docs/RAILWAY_VARIABLES.md) instead.
 *   - Do not introduce legacy railway.toml / railway.json for this new service —
 *     Railway IaC (this file) is the single source of truth.
 *   - Build once / promote the same validated Docker artifact across envs.
 */
import { defineConfig } from "@railway/cli/railway.js";

/**
 * Railway Ia C service shape:
 *   - dockerfilePath: relative to buildContext (repo root)
 *   - buildContext: ".."  → repo root, so the control-plane Dockerfile's
 *     `COPY pyproject.toml ./` / `COPY app ./app` resolve at
 *     control-plane/pyproject.toml and control-plane/app.
 *   - Railway injects PORT at runtime; the Dockerfile CMD binds
 *     0.0.0.0 on ${PORT:-8080}. Do NOT override startCommand.
 *   - The Dockerfile HEALTHCHECK is baked into the image; Railway additionally
 *     performs a TCP port-level liveness on $PORT by default. Application-level
 *     readiness is proven by curling /healthz after deploy (see
 *     docs/RAILWAY_DEPLOYMENT.md).
 */
export default defineConfig({
  project: "open-connect",
  description:
    "Open-Connect control plane (FastAPI). Migrated from Zeabur to Railway.",

  // ── Project-level environment variables (inherited by all services/envs) ──
  environmentVariables: {
    // Shared, non-secret configuration.
    OC_OIDC_AUDIENCE: { value: "authenticated", type: "PLAIN_TEXT" },
    OC_SESSION_TTL_SECONDS: { value: "1800", type: "PLAIN_TEXT" },
    // Fail-closed gate. Defaults to false until the "production" environment
    // explicitly overrides to true (Railway applies env per-environment).
    OC_ALLOW_PRODUCTION: { value: "false", type: "SECRET" },
  },

  services: {
    "open-connect": {
      // Build context = repo root; the root Dockerfile mirrors Zeabur.Dockerfile
      // and builds the control-plane (COPY control-plane/pyproject.toml + app).
      dockerfilePath: "Dockerfile",
      buildContext: "..",

      // Do not override CMD — the control-plane Dockerfile already binds
      // 0.0.0.0:$PORT and execs uvicorn app.main:app.
      // startCommand: "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}",

      // Service-level variables. OC_* values here are plain config or
      // vault:// references. Genuinely secret values are NOT stored here;
      // they are injected as Railway sealed variables (see
      // docs/RAILWAY_VARIABLES.md).
      env: {
        // Runtime configuration (non-secret)
        OC_ENVIRONMENT: { value: "staging", type: "PLAIN_TEXT" },
        OC_PUBLIC_BASE_URL: { value: "https://api.open-connect.site", type: "PLAIN_TEXT" },
        OC_OIDC_ISSUER: { value: "https://huadtiuuoiriqrjpjxhr.supabase.co/auth/v1", type: "PLAIN_TEXT" },
        OC_OIDC_AUDIENCE: { value: "authenticated", type: "PLAIN_TEXT" },
        OC_ALLOWED_ORIGINS: { value: "https://open-connect.site", type: "PLAIN_TEXT" },
        OC_SESSION_TTL_SECONDS: { value: "1800", type: "PLAIN_TEXT" },
        OC_ALLOW_PRODUCTION: { value: "false", type: "SECRET" },

        // Vault references (non-secret; broker resolves them at runtime)
        OC_E2B_CREDENTIAL_REF: {
          value: "vault://e2b/production/open-connect-control",
          type: "PLAIN_TEXT",
        },
        OC_OPENBROWSER_CREDENTIAL_REF: {
          value: "vault://openbrowser/production/open-connect-control",
          type: "PLAIN_TEXT",
        },
        OC_BROWSER_WORKER_CREDENTIAL_REF: {
          value: "vault://browser-worker/production/open-connect-control",
          type: "PLAIN_TEXT",
        },
        OC_BROWSER_PROFILE_STORE_REF: {
          value: "vault://browser-profiles/production/open-connect-control",
          type: "PLAIN_TEXT",
        },
        OC_GUACAMOLE_CREDENTIAL_REF: {
          value: "vault://guacamole/production/open-connect-control",
          type: "PLAIN_TEXT",
        },
        OC_MODEL_GATEWAY_CREDENTIAL_REF: {
          value: "vault://models/production/open-connect-control",
          type: "PLAIN_TEXT",
        },
      },

      // Railway provisions a default <project>-<env>.up.railway.app domain
      // automatically; we pin the custom domain that fronts the control plane.
      domains: ["api.open-connect.site"],
    },

    "open-connect-staging": {
      // Separate service instance in the staging environment (production and
      // staging are provisioned as distinct services in this project).
      dockerfilePath: "Dockerfile",
      buildContext: "..",
      env: {
        OC_ENVIRONMENT: { value: "staging", type: "PLAIN_TEXT" },
        OC_ALLOW_PRODUCTION: { value: "false", type: "SECRET" },
        OC_PUBLIC_BASE_URL: {
          value: "https://control-staging.open-connect.site",
          type: "PLAIN_TEXT",
        },
        OC_OIDC_ISSUER: {
          value: "https://huadtiuuoiriqrjpjxhr.supabase.co/auth/v1",
          type: "PLAIN_TEXT",
        },
        OC_OIDC_AUDIENCE: { value: "authenticated", type: "PLAIN_TEXT" },
        OC_ALLOWED_ORIGINS: {
          value: "https://staging.open-connect.site",
          type: "PLAIN_TEXT",
        },
      },
      domains: ["control-staging.open-connect.site"],
    },
  },
});
