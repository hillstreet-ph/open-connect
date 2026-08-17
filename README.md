# Open Connect Gateway

Open-Connect — Master Development Blueprint




Document purpose: This is the handoff specification you can give to another AI coding agent, Medo, Codex, or a developer. It defines what Open-Connect is, what the three repositories do, how they must integrate, what infrastructure to use, and what “production ready” means.





---




1. Project definition




Open-Connect is an open, unified AI Agent Integration Gateway and Resource Platform.




The objective is to let a user create one Open-Connect account and use one platform to obtain three major capabilities:




Core	Purpose	Engine




1. Resources	AI skills, MCP servers, tools, plugins, agents, prompts, guides	Open-Connect

2. Connections	Apps, OAuth, APIs, credentials, actions, triggers, workflows	Pipedream-derived integration engine

3. Models	Multiple AI providers/models through one API	LiteLLM





These are three backend/service planes but one customer-facing product.




The user should not have to understand that separate repositories or services exist.





---




2. Product architecture




AI CLIENTS

────────────────────────────────────────────




ChatGPT / ChatGPT Apps

Hermes Agent

Claude-compatible clients

Custom AI Agents

Agent frameworks

IDE Agents

Automation Agents

Internal applications

SDK/API applications

MCP clients




                    │

                    │ ONE CONNECTION

                    ▼




══════════════════════════════════════════════

              OPEN-CONNECT

            open-connect.site

══════════════════════════════════════════════




                    │

              Open Gateway API

                    │

       Authentication / Authorization

                    │

               Supabase Auth

                    │

                    ▼




          ┌─────────┼─────────┐

          │         │         │

          ▼         ▼         ▼




     RESOURCE     CONNECTION   MODEL

       HUB           HUB        HUB




   Open-Connect    Pipedream   LiteLLM

      Registry      Engine     Gateway




          │         │         │

          ▼         ▼         ▼




       Skills      Apps      OpenAI

       MCP         OAuth     Anthropic

       Tools       APIs      Google

       Plugins     Actions   Gemini

       Agents      Triggers  Groq

       Prompts     Workflow  OpenRouter

       Guides      Secrets   Ollama

       Resources   Webhooks  HuggingFace

                             etc.




          └─────────┼─────────┘

                    │

                    ▼




              OPEN TOOLKITS

                    │

         User-selectable bundles

                    │

                    ▼




              ONE API KEY

              ONE MCP URL

              ONE ACCOUNT





---




3. Primary public domain




The entire product is presented through:




https://open-connect.site




Do not expose three unrelated products to users.




Cloudflare is the public edge and routing layer.




Conceptually:




Internet

   │

   ▼

Cloudflare

   │

   ▼

open-connect.site

   │

   ├── frontend

   │

   ├── API Gateway

   │

   ├── MCP Gateway

   │

   ├── OAuth Gateway

   │

   └── Model Gateway




Backend services may live on different infrastructure, but users interact with one domain.





---




4. GitHub repository architecture




There are three core repositories.




A. Main application




[hillstreet-ph/open-connect](https://github.com/hillstreet-ph/open-connect?utm_source=chatgpt.com)




Purpose:




Open-Connect frontend

Resource Registry

Skills Library

MCP Registry

Tools

Plugins

Agents

Prompts

Guides

Toolkits

User Dashboard

Connections UI

Models UI

Gateway UI

API Keys UI

Administration




This is the product/control plane.





---




B. Connections engine




[hillstreet-ph/open-connect-connections](https://github.com/hillstreet-ph/open-connect-connections?utm_source=chatgpt.com)




Derived from:




[Pipedream open-source repository](https://github.com/PipedreamHQ/pipedream?utm_source=chatgpt.com)




Purpose:




Application catalog

OAuth integrations

API integrations

Actions

Triggers

Sources

Workflows

Connection metadata

Webhook/event integrations




This repository must not become another customer-facing Open-Connect UI.




It is an integration engine behind Open-Connect.





---




C. Model gateway




[hillstreet-ph/open-connect-models](https://github.com/hillstreet-ph/open-connect-models?utm_source=chatgpt.com)




Derived from:




[LiteLLM open-source repository](https://github.com/BerriAI/litellm?utm_source=chatgpt.com)




Purpose:




AI provider integrations

Model catalog

OpenAI-compatible API

Routing

Load balancing

Retries

Fallbacks

Budgets

Usage

Virtual/scoped keys where applicable

Model aliases

Guardrails where supported




Again, this should operate behind Open-Connect.





---




5. Infrastructure




The core infrastructure is:




GitHub

   │

   │ source / CI/CD

   ▼

Cloudflare

   │

   │ Edge / DNS / TLS / routing / frontend

   ▼

Open-Connect

   │

   ├───────────────┐

   ▼               ▼

Supabase        Backend runtimes

   │               │

   │               ├── Connections

   │               │

   │               └── LiteLLM

   │

   ├── Auth

   ├── PostgreSQL

   ├── RLS

   ├── User profiles

   ├── API keys

   ├── Registry

   ├── Connections metadata

   └── Audit state




Responsibilities




GitHub




source control




branches




pull requests




CI




security scanning




deployment triggers





Cloudflare




open-connect.site




DNS




HTTPS/TLS




CDN




static frontend




edge gateway/routing




WAF/rate limiting where appropriate




public API routing





Supabase




account authentication




PostgreSQL




user profiles




authorization state




Row Level Security




resource registry




gateway key metadata




connection metadata




audit data





Pipedream-derived service




external application connectivity





LiteLLM-derived service




model/provider gateway






---




6. Authentication




Supabase is the canonical Open-Connect identity system.




The currently provisioned Open-Connect Supabase project is healthy and its project endpoint is:




[Open-Connect Supabase project](https://havsbgrdfoeuxkbbkvnr.supabase.co?utm_source=chatgpt.com).




Required account lifecycle:




Visitor

   │

   ▼

Sign Up / Login

   │

   ▼

Supabase Auth

   │

   ▼

Authenticated User

   │

   ▼

profiles

   │

   ▼

Dashboard




Support at minimum:




Email signup

Email login

Logout

Password reset

Email verification

Session refresh

Protected dashboard routes




OAuth login providers can be added separately.





---




7. Authorization




Authentication and authorization must remain separate.




Recommended roles:




anonymous

user

developer

publisher

admin

owner




Never trust a role supplied by the browser.




Authorization must be validated server-side/database-side.




Supabase RLS is required for user-owned data.





---




8. Existing database foundation




The Open-Connect Supabase project already contains important tables, including:




profiles

api_keys




categories

platforms

resources

skills

guides

setup_guides

free_tools




integration_connections




model_gateway_catalog




oauth_clients

oauth_codes

oauth_consents

oauth_tokens




gateway_audit_log




RLS has already been enabled across the existing public tables.




Existing migrations include the unified resource registry, profiles/gateway keys, OAuth gateway schema, three-in-one gateway registry, and RLS hardening.




Do not throw this schema away and start another database.




Extend it carefully with migrations.





---




9. Resource Hub




The first pillar is the universal AI-resource library.




The system should support:




Skills

MCP Servers

Tools

Plugins

Agents

Prompts

Guides

References

Setup Guides

Free Tools




Each resource needs normalized metadata.




Recommended conceptual object:




Resource




id

slug

name

description




resource_type

category




author

source

source_url

repository_url




version

license




installation_type

installation_config




supported_clients




verified

featured

published




created_at

updated_at





---




10. Avoid duplicated catalogs




Do not create independent databases for:




skills

MCP

plugins

tools

agents

prompts




and then implement the same search logic six times.




Use a normalized resource registry.




Specific resource tables can extend it where special fields are required.




Conceptually:




resources

    │

    ├── skill

    ├── mcp

    ├── tool

    ├── plugin

    ├── agent

    ├── prompt

    └── guide




One search system can therefore discover everything.





---




11. Connection Hub




The second pillar is:




Connect Apps




The UI should abstract away Pipedream complexity.




Users should see something like:




Connections




Search applications...




GitHub          Connect

Google Drive    Connect

Gmail           Connect

Slack           Connect

Notion          Connect

Supabase        Connect

Cloudflare      Connect

...




The user clicks:




Connect




Then:




Open-Connect

     │

     ▼

OAuth flow

     │

     ▼

Provider

     │

     ▼

Authorization

     │

     ▼

Open-Connect callback

     │

     ▼

Connection established





---




12. Credentials architecture




This is critical.




Open-Connect is not supposed to give AI agents raw credentials.




Never expose:




OAuth refresh tokens

OAuth client secrets

Supabase service-role keys

LiteLLM master key

Provider API keys

Database passwords

Cloudflare API tokens

GitHub private tokens




to the browser or external AI agent.




Instead:




AI Agent

   │

   │ Open-Connect scoped credential

   ▼

Open Gateway

   │

   │ validates permission

   ▼

Connection Service

   │

   │ accesses protected credential

   ▼

External Application




The agent receives capability, not the underlying secret.





---




13. Connection object




Conceptually:




Connection




id

user_id

organization_id




provider

provider_account_id




display_name

status




credential_reference




scopes

capabilities




created_at

updated_at

last_used_at




Sensitive credentials should not be stored in plaintext fields.





---




14. OAuth architecture




Use a central facade:




open-connect.site/oauth/*




Conceptual lifecycle:




GET /oauth/authorize

        │

        ▼

Validate client

        │

        ▼

Authenticate Open-Connect user

        │

        ▼

Consent

        │

        ▼

Authorization code

        │

        ▼

POST /oauth/token

        │

        ▼

Scoped access token




OAuth provider callbacks must also be explicitly handled.




Do not implement OAuth solely in React.





---




15. Model Hub




The third pillar is:




Models




LiteLLM provides the backend abstraction.




The user sees:




Models




Explore

My Models

Providers

Routing

Usage




Provider UI might contain:




OpenAI

Anthropic

Google

Azure

OpenRouter

Groq

Hugging Face

Ollama

etc.




Only expose providers actually supported/configured.





---




16. One model API




The public model endpoint should be:




https://open-connect.site/v1




This should behave as an OpenAI-compatible API where supported.




For example, an external agent should be configurable approximately as:




Base URL:

https://open-connect.site/v1




API key:

<OPEN_CONNECT_SCOPED_KEY>




The user should not need to configure LiteLLM directly.





---




17. Model aliases




Add stable Open-Connect model aliases.




Example concept:




open-connect/fast

open-connect/balanced

open-connect/reasoning

open-connect/coding

open-connect/vision




Internally:




open-connect/coding

       │

       ▼

LiteLLM Router

       │

       ├── primary model

       ├── fallback model

       └── alternate provider




This lets Open-Connect change infrastructure without breaking every connected agent.





---




18. Toolkits — key unification layer




This should become one of Open-Connect's strongest features.




A Toolkit is a reusable package containing resources from all three pillars.




Example:




GitHub Developer Toolkit




could contain:




Skills

├── Code Review

├── Repository Analysis

└── Release Planning




MCP

└── GitHub MCP




Connection

└── GitHub OAuth




Tools

├── Search repository

├── Read file

├── Create issue

└── Create pull request




Models

├── Coding model

└── Reasoning fallback




Permissions

├── repositories:read

├── issues:write

└── pull_requests:write




The user installs one Toolkit instead of manually assembling ten components.





---




19. Toolkit architecture




Toolkit

   │

   ├── resources[]

   │

   ├── connections[]

   │

   ├── tools[]

   │

   ├── model_policy

   │

   └── permissions[]




Important principle:




> A Toolkit references resources. It should not duplicate their complete records.







---




20. Public integration surfaces




Open-Connect should expose four primary machine interfaces.




MCP




https://open-connect.site/mcp




For MCP-capable agents.




REST API




https://open-connect.site/api/v1/*




For custom integrations and SDKs.




OAuth




https://open-connect.site/oauth/*




For delegated authorization.




Models




https://open-connect.site/v1/*




For OpenAI-compatible model access.





---




21. One Open-Connect key




Users should be able to create a scoped key from:




Dashboard

→ Developer

→ API Keys

→ Create Key




Example:




oc_live_********************************




Never store the raw token if avoidable.




Recommended:




user receives raw key once




        ↓




server stores




key_id

prefix

hash

owner

scopes

expiration

status

last_used




Requests hash/verify the presented credential.





---




22. API-key permissions




Example scopes:




resources:read




skills:read

tools:execute




connections:read

connections:execute




models:list

models:invoke




mcp:connect




toolkits:read

toolkits:execute




A single key does not mean unlimited access.




It means one credential with controlled scopes.





---




23. Target website information architecture




Avoid dozens of top-level pages.




Use a simple navigation system.




Public




Home

Explore

Toolkits

Developers

Docs

Pricing          optional/future




Explore




All

Skills

MCP

Tools

Plugins

Agents

Prompts

Apps

Models




User Dashboard




Overview




My Library

My Toolkits




Connections

Models




API Keys

Usage




Profile

Settings




Administration




Users

Resources

Applications

Models

Providers

Toolkits

Gateway

Audit

System





---




24. Landing pages




Do not create three unrelated homepages.




Use one homepage and three major product landing sections/pages.




Recommended:




/




Main Open-Connect landing page.




Then:




/resources

/connections

/models




This explains the 3-in-1 concept cleanly.





---




25. Homepage




Recommended hero:




> Connect your AI to everything.






Supporting concept:




> Discover agent resources, connect applications, and access AI models through one gateway.






Primary CTA:




Get Started




Secondary:




Explore Resources




Then show the three pillars:




Agent Resources




Skills, MCP servers, tools,

plugins, agents and prompts.





Connect Apps




OAuth applications, APIs,

actions, triggers and workflows.





AI Models




Multiple AI providers through

one compatible gateway.





---




26. Search




Universal search should span:




Skills

MCP

Tools

Plugins

Agents

Prompts

Apps

Models

Toolkits

Guides




Example:




Search: github




Results:




TOOLKIT

GitHub Developer




APP

GitHub




MCP

GitHub MCP




SKILL

GitHub Repository Review




TOOL

Create GitHub Issue




GUIDE

Connect GitHub to Open-Connect




One index/search API should power this.





---




27. Client compatibility




The architecture should be client-neutral.




Target categories:




ChatGPT-compatible integrations

Hermes Agent

MCP clients

Custom agents

Python applications

JavaScript applications

Agent frameworks

Automation systems

Internal enterprise agents




Do not hardcode the entire platform around one AI client.





---




28. Recommended “Connect to Agent” experience




Every compatible Toolkit/resource should provide:




Connect




Then show relevant options:




MCP

REST API

OpenAI-compatible API

OAuth

SDK/config




For example:




Connect Open-Connect




MCP URL

https://open-connect.site/mcp




Model Base URL

https://open-connect.site/v1




REST API

https://open-connect.site/api/v1




Authentication

Bearer <OPEN_CONNECT_KEY>





---




29. Gateway request lifecycle




All machine requests should conceptually follow:




Client

   │

   ▼

Cloudflare

   │

   ▼

Open Gateway

   │

   ├── Authenticate

   ├── Rate limit

   ├── Resolve account

   ├── Check scopes

   ├── Resolve Toolkit

   ├── Apply policy

   ├── Audit

   │

   ▼

Router

   │

   ├── Resource service

   ├── MCP

   ├── Connection service

   └── Model service





---




30. Cloudflare architecture




Cloudflare remains the public edge, not necessarily the runtime for every service.




Cloudflare

                        │

                 open-connect.site

                        │

        ┌───────────────┼────────────────┐

        │               │                │

        ▼               ▼                ▼

     Static UI       Edge/API          Routing

                                         │

                         ┌───────────────┼──────────────┐

                         ▼               ▼              ▼

                      Supabase      Connections      LiteLLM




LiteLLM is a Python/container service. Do not try to bundle it into the Vite frontend.





---




31. Cloudflare routing target




Conceptually:




/                       → Open-Connect frontend




/api/v1/*               → Open Gateway




/mcp*                    → MCP Gateway




/oauth/*                 → OAuth Gateway




/v1/*                    → protected LiteLLM gateway




Do not expose an unprotected LiteLLM upstream directly to the Internet.





---




32. Cloudflare frontend configuration




The earlier deployment failure was caused by a missing Wrangler compatibility date.




The repository configuration has already been corrected around:




name = open-connect

compatibility_date = 2026-08-17

assets = ./dist

SPA fallback enabled




Do not remove that fix.




Build:




pnpm install --frozen-lockfile

pnpm run build




Output:




dist





---




33. Environment configuration




Frontend should receive only public/browser-safe configuration.




For example:




VITE_SUPABASE_URL

VITE_SUPABASE_PUBLISHABLE_KEY

VITE_APP_URL




Never put these into Vite/browser environment variables:




SUPABASE_SERVICE_ROLE_KEY

DATABASE_PASSWORD

LITELLM_MASTER_KEY

OPENAI_API_KEY

ANTHROPIC_API_KEY

GOOGLE_PRIVATE_KEY

OAUTH_CLIENT_SECRET

CLOUDFLARE_API_TOKEN

GITHUB_TOKEN




VITE_* values are effectively public.





---




34. Login UX




Target:




open-connect.site/login




UI:




Welcome to Open-Connect




Email

Password




[ Sign In ]




Forgot password?




──────── or ────────




[ Continue with GitHub ]

[ Continue with Google ]




Don't have an account?

Create account




Social providers can be introduced after base Supabase authentication is stable.





---




35. Protected routes




Require authentication for:




/dashboard

/library

/toolkits/my

/connections

/api-keys

/usage

/settings




Public catalog routes may remain readable without login.




Execution/install/connect operations require authentication.





---




36. Supabase security




Current RLS coverage should be preserved.




Additionally enforce:




User can only read own private connections.




User can only modify own API keys.




User cannot read credential secrets.




Public catalog is read-only for normal users.




Publisher operations require publisher/admin authorization.




Admin operations require server-side admin authorization.




OAuth codes/tokens are not generally queryable from browsers.




Audit logs cannot be modified by ordinary users.




A security migration has also already removed public/anonymous execution of sensitive SECURITY DEFINER functions.




Do not reverse this.





---




37. Security issue still to review




Supabase security analysis still flags:




unaccent extension in public schema




and authenticated execution of:




get_user_role(uuid)




The latter was intentionally retained temporarily because RLS policies may depend on it.




Before changing it, inspect every dependent policy/function.




Do not blindly revoke it and break authorization.





---




38. Connections security




Provider authorization:




User

 ↓

Open-Connect

 ↓

OAuth Provider

 ↓

callback

 ↓

server

 ↓

secure credential storage/reference




Never:




OAuth Provider

 ↓

React localStorage

 ↓

AI agent




Avoid that architecture completely.





---




39. Model security




Likewise:




Agent

 ↓

oc_live_xxx

 ↓

Open Gateway

 ↓

LiteLLM

 ↓

Provider secret

 ↓

Provider




Never:




Agent

 ↓

OpenAI secret




Agent

 ↓

Anthropic secret




Agent

 ↓

Gemini secret




Open-Connect abstracts these credentials.





---




40. Audit system




Record meaningful gateway events:




user_id

key_id

toolkit_id




request_type

resource_id




provider

model




connection_id




status

latency

usage




ip_hash or appropriate request metadata




created_at




Do not put raw credentials into logs.





---




41. Usage dashboard




Users should eventually see:




API requests




Model requests

Tokens




Tool executions




Connection executions




MCP sessions




Errors




Estimated/actual model cost where available




This can use gateway audit and LiteLLM usage information.





---




42. Admin publishing workflow




Resource lifecycle:




Draft

 ↓

Validate

 ↓

Review

 ↓

Publish

 ↓

Verified

 ↓

Update

 ↓

Deprecated / Archived




Do not allow arbitrary submissions to become trusted/verified automatically.





---




43. GitHub importing




Resources should eventually support GitHub import.




Input:




GitHub repository URL




Open-Connect analyzes supported metadata and proposes:




name

description

type

version

license

author

README

installation instructions

supported clients




Then:




Validate

→ Preview

→ Publish




This is particularly useful for agent skills and MCP repositories.





---




44. Repository synchronization




Keep upstream history for both forks.




Pipedream upstream

       │

       ▼

open-connect-connections

       │

 Open-Connect modifications




and:




LiteLLM upstream

       │

       ▼

open-connect-models

       │

 Open-Connect modifications




Do not manually copy upstream releases into open-connect.





---




45. CI/CD




Main Open-Connect currently has active CI and CodeQL workflows.




The recent main CI run completed successfully.




Target pipeline:




Push / PR

   │

   ├── Install

   ├── Typecheck

   ├── Lint

   ├── Tests

   ├── Build

   ├── Security checks

   │

   ▼

Merge main

   │

   ▼

Cloudflare deployment

   │

   ▼

Smoke tests




Never deploy production merely because compilation succeeds.





---




46. Development environments




Use:




development

preview/staging

production




Recommended:




feature/*

      ↓

Pull Request

      ↓

Preview

      ↓

main

      ↓

Production




Do not experiment directly against production user credentials.





---




47. Definition of production-ready




Another AI agent must not report “done” merely because files were generated.




Production means all of these pass:




✓ open-connect.site loads




✓ signup works

✓ login works

✓ logout works

✓ password reset works

✓ protected routes work




✓ user profile created




✓ RLS isolation verified




✓ resource catalog loads

✓ universal search works




✓ connection can be created

✓ OAuth callback works

✓ disconnected connection is revoked/removed




✓ Open-Connect API key can be generated

✓ scope enforcement works

✓ revoked key fails




✓ /api/v1 responds

✓ /mcp responds correctly




✓ /v1/models works

✓ model completion works

✓ unauthorized /v1 request fails




✓ Toolkit can be installed

✓ Toolkit permissions are enforced




✓ logs/audit records generated




✓ no secrets appear in browser bundle

✓ no secrets committed to GitHub




✓ CI passes




✓ Cloudflare production deployment passes




✓ custom domain works

✓ HTTPS works





---




48. Implementation phases




Use this sequence rather than developing everything simultaneously.




Phase 1 — Foundation: stabilize GitHub repositories, Cloudflare frontend deployment, custom domain, Supabase environment, signup/login/logout/reset, protected routes, profiles and RLS.




Phase 2 — Resource Hub: normalize resources, Skills/MCP/Tools/Plugins/Agents/Prompts, categories, universal search, detail pages, install instructions and GitHub imports.




Phase 3 — Connections: application catalog, connection records, OAuth flow, callbacks, scopes, secure credential boundary, actions/triggers and connection UI.




Phase 4 — Models: deploy LiteLLM runtime, configure providers, put Open Gateway in front of it, /v1/models, chat/completion endpoints, aliases, routing/fallback and usage.




Phase 5 — Toolkits: create toolkit schema, resource references, connections, model policies, scopes, installation and one-click agent configuration.




Phase 6 — External agents: MCP, REST API, OpenAI-compatible API, OAuth client authorization, ChatGPT-compatible integration, Hermes configuration and SDK examples.




Phase 7 — Production hardening: rate limiting, WAF, audit logs, key rotation/revocation, security review, observability, backups, error handling, integration tests and documentation.





---




49. Explicit non-goals




The implementation agent should not:




× Merge all three repositories into one giant source tree.




× Rebuild Pipedream from scratch.




× Rebuild LiteLLM from scratch.




× Replace the existing Supabase project.




× Create three independent customer accounts.




× Create three unrelated dashboards.




× expose LiteLLM master credentials.




× expose OAuth provider secrets.




× put service-role credentials into Vite.




× store provider tokens in localStorage.




× duplicate resources across many catalogs.




× promise support for providers LiteLLM/Pipedream

  do not actually support.




× treat every upstream capability as automatically

  production-ready in Open-Connect.




× deploy proprietary/enterprise-only upstream

  functionality as though it were open source.





---




50. Final product experience




The desired customer experience is ultimately this simple:




1. Visit open-connect.site




2. Create account




3. Explore:

      Resources

      Apps

      Models

      Toolkits




4. Connect apps




5. Select models/providers




6. Install skills/toolkits




7. Create Open-Connect key




8. Connect an AI agent




9. Agent receives:




      MCP

      Tools

      Skills

      Connections

      Models




10. User manages everything from

    one Open-Connect dashboard.




The complexity stays behind the gateway.





---




51. Canonical one-line definition




Use this definition in development documentation:




> Open-Connect is a unified AI agent integration platform combining an agent resource and skills registry, secure application/OAuth connectivity, and a multi-provider AI model gateway behind one account, dashboard, API, MCP endpoint and domain.







---




52. Handoff instruction for Medo / coding agents




You can give the agent this exact implementation directive:




> Continue development of hillstreet-ph/open-connect as the primary product and UI. Integrate hillstreet-ph/open-connect-connections as the Pipedream-derived application/OAuth/actions/workflow engine and hillstreet-ph/open-connect-models as the LiteLLM-derived model gateway. Maintain three repositories but expose one customer-facing platform at open-connect.site. Use Cloudflare for the public edge/frontend/routing and the existing open-connect Supabase project for authentication, PostgreSQL, profiles, RLS, registry, gateway state and audit metadata. Do not expose provider credentials, OAuth refresh tokens, Supabase service-role credentials or LiteLLM master credentials to browsers or agents. External clients must connect through scoped Open-Connect credentials using /mcp, /api/v1/*, /oauth/*, or /v1/*. Implement incrementally, validate each phase, preserve upstream Pipedream/LiteLLM history and licensing, avoid duplicate resource catalogs, and do not report production completion until authentication, RLS, gateway authorization, connections, models, Toolkits, Cloudflare deployment, custom domain, security checks and end-to-end smoke tests pass.






That is the master blueprint and implementation contract I would use for another autonomous development agent.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f047d610-9833-4f21-a17b-957c39169d7f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
