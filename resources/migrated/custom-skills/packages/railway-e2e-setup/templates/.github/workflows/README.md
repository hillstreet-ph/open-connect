# Railway CI/CD

Generate actual workflows only after repository/Railway topology discovery.

Typical lifecycle:
- CI/test/security
- container build/publish when applicable
- Railway staging deployment
- health/application E2E verification
- protected production deployment
- concurrency control
- post-deploy verification.

Never expose production credentials to untrusted pull requests.
