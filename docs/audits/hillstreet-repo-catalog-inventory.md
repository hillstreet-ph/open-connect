# HillStreet GitHub → Open Connect catalog inventory

**Date:** 2026-09-10  
**Rule:** Reuse packages; register metadata in Open Connect; do not absorb independent products.

## Org repos scanned (`org:hillstreet-ph`)

| Repo | Visibility | Useful for OC marketplace? | Decision |
|------|------------|----------------------------|----------|
| **open-connect** | public | Canonical control plane | **KEEP** (this product) |
| **open-custom-skills** | private | E2E skill **zip packages** | **REGISTER** as skills |
| **v1-open-connect** | public | Legacy; has `.skills/` | **MIGRATE** useful skills only — do not merge app |
| **open-template** | public | Roadmaps / security zip | **REGISTER** selected guides/templates only |
| **open-kobeplay** | private | Business product | **CONSUMER** — do not absorb |
| **openlist-railway** | public | OpenList/Alist on Railway | **RELATED** to Open Box — not OC core |

Independent products (Open Box, TGate, etc.) may live outside this org search result set; they remain **consumers** of OC.

---

## A. open-custom-skills (primary skill source)

| Package file | Suggested slug | Type |
|--------------|----------------|------|
| inspect-analyze-e2e.zip | `inspect-analyze-e2e` | skill |
| github-e2e-setup.zip | `github-e2e-setup` | skill |
| cloudflare-e2e-setup.zip | `cloudflare-e2e-setup` | skill |
| supabase-e2e-setup.zip | `supabase-e2e-setup` | skill |
| credentials-e2e-setup.zip | `credentials-e2e-setup` | skill |
| complete-e2e-prompt.zip | `complete-e2e-prompt` | skill |
| docker-e2e-setup.zip | `docker-e2e-setup` | skill |
| railway-e2e-setup.zip | `railway-e2e-setup` | skill |
| zeabur-e2e-setup.zip | `zeabur-e2e-setup` | skill |
| gh-cf-sb-setup.zip | `gh-cf-sb-setup` | skill |
| gh-cf-sb-zb-setup.zip | `gh-cf-sb-zb-setup` | skill |
| gh-dh-cf-sb-zb-setup.zip | `gh-dh-cf-sb-zb-setup` | skill |
| Complete Prompts Library For Development.pdf | `complete-prompts-library` | prompt |

**Source pattern:**  
`https://github.com/hillstreet-ph/open-custom-skills` (private — download via OC after package upload to Storage, or authorized clone).

Stack policy for GH+CF+SB-only skills: prefer those over Railway/Zeabur variants when listing “default professional setup.”

---

## B. Already on open-connect public downloads

| Path | Type |
|------|------|
| `public/downloads/skills/agent-browser/` | skill |
| `public/downloads/skills/cloudflare-browser/` | skill |
| `public/downloads/skills/multion-autonomous/` | skill |
| `public/downloads/open-connect-control-plane-demo/` | guide/demo |

These should remain first-party marketplace entries (slug match folder names).

---

## C. Not to merge into OC codebase

| Repo | Why |
|------|-----|
| open-kobeplay | Separate business product |
| openlist-railway | Open Box / storage product path |
| v1-open-connect app | Legacy surface — skills only |
| open-template roadmaps | Docs/templates, not runtime |

---

## D. Registration method

1. **Metadata** in `public.resources` (slug, type, source_url, verified, published).  
2. **Binary** in Supabase Storage `resource-packages` or `public/downloads` (login-gated download).  
3. Optional: Toolkit “HillStreet E2E Professional” referencing skill slugs.

SQL helper: `supabase/migrations/*_catalog_hillstreet_skills.sql` (apply when DB available).

---

## E. Blockers (2026-09-10)

- Supabase SQL API **timeout** — live INSERT/SELECT on `resources` not verified this session.  
- `open-custom-skills` is **private** — catalog can point at GitHub; end-user download needs OC Storage copies or signed access.  
- Marketplace list API requires `oc_live_` key (401 without key) — expected.

## F. Deploy note

App edge remains Cloudflare Pages from `main`. Catalog rows are **data** deploys (migration), not only git static files.
