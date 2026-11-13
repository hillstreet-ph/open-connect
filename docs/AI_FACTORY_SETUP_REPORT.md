# AI Factory — Setup Report

**Status: live and verified in production.**
Last verified: 2026-11-07 against `https://open-connect.site`.

---

## 1. What the AI Factory is

One product inside open-connect, not a separate copy. It lives at `/ai-factory` and
has three tabs:

| Tab                | Route                     | What it does                                      |
| ------------------ | ------------------------- | ------------------------------------------------- |
| Overview           | `/ai-factory`             | Team management, proposal generation, run history |
| Teams              | `/ai-factory?view=teams`  | Saved teams, starter categories, archive/restore  |
| Roster & playbooks | `/ai-factory?view=roster` | The static roster (9 pages) in an iframe          |

The roster is a set of static HTML pages served from `/ai-factory/roster/`. It is
**not** an SPA route — see `docs/AI_FACTORY.md` for why `src/server.ts` is
load-bearing and must not be removed.

---

## 2. Roster pages — production status

All nine pages return `200` with their own real HTML (not the SPA shell), each with
`<base href="/ai-factory/roster/">` injected.

| Page           | Clean URL                           | Status | Title                               |
| -------------- | ----------------------------------- | ------ | ----------------------------------- |
| index          | `/ai-factory/roster/`               | 200    | AI Factory — Agents, Teams & Niches |
| teams          | `/ai-factory/roster/teams`          | 200    | Agent Teams & Roster — 103 Agents   |
| niches         | `/ai-factory/roster/niches`         | 200    | Niches — 22 Markets, Bot vs Human   |
| playbooks      | `/ai-factory/roster/playbooks`      | 200    | Playbooks & Briefings               |
| hub            | `/ai-factory/roster/hub`            | 200    | Agency Hub — Operating Model        |
| studio         | `/ai-factory/roster/studio`         | 200    | Studio Builder                      |
| connectors     | `/ai-factory/roster/connectors`     | 200    | Connectors — Live Status            |
| command-center | `/ai-factory/roster/command-center` | 200    | Command Center — All Deliverables   |
| registry       | `/ai-factory/roster/registry`       | 200    | Registry & Import Package           |

### Assets and data from the base path

| Path                    | Status        |
| ----------------------- | ------------- |
| `assets/nav.js`         | 200           |
| `assets/studio.js`      | 200           |
| `data/agents-v10.json`  | 200           |
| `data/catalog-v11.json` | 200           |
| `images/agents/*.webp`  | 200 (103/103) |

### Legacy `.html` URLs

All still work: `teams.html`, `niches.html`, `playbooks.html`, `hub.html`,
`studio.html`, `connectors.html`, `command-center.html`, `registry.html` → `200`.
`index.html` → `308` → `/ai-factory/roster/` → `200` (correct canonicalization).

---

## 3. Main app — unaffected

| Route                           | Status | Behaviour               |
| ------------------------------- | ------ | ----------------------- |
| `/ai-factory`                   | 200    | Overview tab            |
| `/ai-factory?view=roster`       | 200    | Roster tab              |
| `/`                             | 200    | Landing                 |
| `/dashboard`                    | 200    | Dashboard               |
| `/this-path-does-not-exist-xyz` | 404    | Unknown path still 404s |

---

## 4. The redirect loop that caused the 404s

Cloudflare canonicalizes navigation requests for `.html` files:

```
/ai-factory/roster/teams.html        → 308 → /ai-factory/roster/teams
/ai-factory/roster/teams/index.html  → 308 → /ai-factory/roster/teams/
/ai-factory/roster/teams/            → 307 → /ai-factory/roster/teams
/ai-factory/roster/teams             → no file → 404
```

Emitting `<page>/index.html` alone does not fix this — it moves the failure one hop
later. The fix has three parts:

1. **`handleRosterAsset` in `src/server.ts`** intercepts roster paths and fetches the
   file from the `ASSETS` binding with `accept: */*` (a subresource request, which the
   asset layer does not canonicalize). This is what actually serves the pages.
2. **`public/_redirects`** carries `200`-rewrites for the clean URLs as a second line
   of defence.
3. **`<base href="/ai-factory/roster/">`** is injected into every page so relative
   `assets/`, `data/` and `images/` references resolve from the roster root.

Cross-page links are rewritten to clean URLs so navigation never re-enters the loop.

---

## 5. Data integrity

| Metric                              | Value                             |
| ----------------------------------- | --------------------------------- |
| Teams                               | 25                                |
| Agents                              | 103                               |
| Niches                              | 22                                |
| Agents with all seven schema fields | 103 / 103                         |
| Agents with zero live connectors    | 4 (honest — no connector claimed) |

The seven-field agent schema is intact on every agent: `name`, `description`,
`instruction`, `knowledge`, `tools`, `skills`, `connectors`.

**Connector honesty rule:** an agent only lists a connector under `live` if it is
actually connected. Agents with no live connector report an empty `live` array rather
than claiming one. Verified across all 103 agents.

---

## 6. Import package

`/ai-factory/roster/import/` — reproduces the exact merged live state.

| File                 | Status | Contents                      |
| -------------------- | ------ | ----------------------------- |
| `agents.json`        | 200    | 103 agents, full config       |
| `teams.json`         | 200    | 25 teams                      |
| `import.sql`         | 200    | Full import, readable         |
| `import_compact.sql` | 200    | Single-statement compact form |
| `README.md`          | 200    | Import instructions           |

`import.sql` and `import_compact.sql` were missing from the previous package. They are
generated by `scripts/generate-ai-factory-import-sql.mjs` from `agents.json` and
`teams.json`, so they cannot drift from the data.

---

## 7. PR history

| PR   | Commit    | Outcome                                                                                      |
| ---- | --------- | -------------------------------------------------------------------------------------------- |
| #858 | `ebd1336` | Merged. Added the `src/server.ts` handler — **this is load-bearing**, not inert.             |
| #859 | `86b8f1d` | Merged. Directory indexes + base href + clean-URL links. Insufficient alone (redirect loop). |
| #860 | `f4e297f` | Merged. `_redirects` 200-rewrites + base href on every page. Fixed the loop.                 |
| #863 | `ffb3a5a` | Merged. Import package completed; invalid agent slug fixed.                                  |
| #865 | `3b37210` | Merged. Malformed imported agent normalized to the seven-field schema.                       |

---

## 8. Still blocked on your side

- **Cloudflare API token** — not needed for the verification above (all checks were
  done over plain HTTPS against production), but required if you want deploy logs or
  cache purges from the API.
- **Authenticated session** — the three `/ai-factory` tabs render behind auth. The
  routes return `200` and the tab wiring is verified in source, but a signed-in
  browser check of the iframe console (and of the roster tab's rendering) needs a
  session I do not have.
