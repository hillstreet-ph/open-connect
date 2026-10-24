# CI/CD Notes
Generate actual workflows only after repository discovery.

Expected:
CI/security → Docker build/scan/publish → immutable digest → Zeabur staging → E2E → protected production → SAME digest promotion.

Never expose production secrets to untrusted pull requests.
