# Zeabur CI/CD Workflows

Generate actual workflows only after repository and Zeabur topology discovery.

Typical capabilities:
- CI/test/security
- container build/publish when applicable
- staging deploy
- health/E2E verification
- protected production deployment
- concurrency control
- post-deploy verification.

Never expose production deployment credentials to untrusted pull requests.
