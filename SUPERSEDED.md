# Superseded branches (archive)

Single archive branch for historical feature tips that are **already integrated into `main`**.

- **Do not deploy** this branch to production.
- **Do not merge** it into `main` expecting new features.
- Tree is based on `main` at archive time; tip SHAs below preserve the old branch points for archaeology.

## Archived tips

| Former branch | Tip SHA |
|---------------|---------|
| `ai-feat/lobehub-style-home` | `26f07bd2ae36a1fbabb4fd2bf42e8aa5fcc4c85b` |
| `ai-feat/workspace-hub-roles` | `d5c6b6146147bf72f94a0db3d89d1e637dace348` |
| `ai-fix/e2e-marketplace-oauth-polish` | `607dcd364dee9fb39a1565afe8eaa4511b46da54` |
| `ai-fix/guides-hub-demo-zip` | `7ea99f1b691058395c59371eab3305f838f37641` |
| `ai-fix/marketplace-packages-and-guide-hub` | `50ce713c6522ecd58f953bfdaf82c979257ee0e7` |
| `ai-fix/public-vs-workspace-shell` | `ea28897a9a9f439d8949563001efd8cf1ef14d51` |
| `ai-fix/route-tree-skills-download` | `7eb6cbfc08f2c6379cd1c948e60b9abf20d82397` |
| `ai-fix/studio-brands-orgs` | `d04871dc46d0854d5cd16f3ccb0911d0359083a7` |
| `ai-fix/v1-root-and-skills-catalog` | `601173c5f1f84f1b09c03106fc84d0ce96d773f4` |
| `feature/open-connect-control-plane` | `82ce2c36a5e0136faaf3724ab6f3dae155addb71` |

## Why one branch

These branches diverged 60+ commits behind production. Their features (studio, orgs, guides, brands, marketplace shell, `/v1`, control-plane demo, etc.) were already landed on `main` via sequential PRs. Keeping ten long-lived tips was noise; this branch is the single archive pointer.

## Recover a tip

```bash
git fetch origin
git checkout -b recover/<name> <tip-sha>
```
