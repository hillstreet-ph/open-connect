# Docker Workflow Templates

Generate workflows only after stack and release topology discovery.

Typical capabilities:
- PR image build + smoke/security test
- Buildx multi-platform build
- Docker Hub login only on trusted publish events
- metadata/tag generation
- staging image publish
- release image publish
- SBOM/provenance where supported
- immutable digest output

Do not expose registry credentials to untrusted pull requests.
