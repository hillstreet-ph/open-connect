# AI Agency and Cloud Browser

## AI Agency

Connections contains Connectors, Credentials, AI Gateway and AI Agency. The
canonical private-team implementation from PR #450 is retained, including team
creation/editing, 2–6 distinct roles, reversible archive/restore, optimistic edit
checks, free-model readiness and owner-isolated run history. Its existing database
migration is retained unchanged. See [AI Agency](AI_AGENCY.md).

The six templates (Development, Business, Marketing, Research, Operations and
Custom) come from `config/ai-agency.registry.json`. Custom teams can represent
support, data or other work using their own names and roles. MCP `run_agent_team`
accepts an optional template `category`, with the same scopes and personal-context
restriction. Existing clients omitting it retain Planner/Builder/Reviewer roles.
Workers produce proposals; browser and external actions use connected tools.

History uses the existing `autonomous_runs` table. There is no second chat-history
mirror or second credential store. Outputs can be copied from private run history.
PR #453 reconciles the earlier Agency work with browser consolidation in one route.

## Browser consolidation

Cloud Browser has four top-level surfaces: TinyFish, Browser Use, Browserbase,
and Connected tools. Worker adapters (Playwright, Stagehand, Chrome DevTools,
BrowserAct and MultiOn) and research tools are selected within
one connected-tools explorer. Legacy provider query values still work. Native
provider panels remain mounted when hidden, so switching surfaces does not close
an active native session. The tools explorer stays mounted to retain result and
session references while changing the visible provider.

The Agents resource library links to Cloud Browser rather than mounting another
browser task form. Existing `/agents?run=...` references can continue the exact run
in Cloud Browser. The chat assistant's browser mode remains a contextual entry
point, using the same provider functions rather than a second execution backend.

Direct TinyFish control retains pointer movement, click/drag, scrolling, tabs,
keyboard entry, paste and masked text input for mobile. The duplicate keyboard
row is removed; navigation keys are in one toolbar. Browser Use remains a prompt
agent; Browserbase remains its supported manual view. Features are not assumed
interchangeable between providers. No connections, keys, sessions or provider
accounts were deleted during UI consolidation.

## Global verification

Verification is a shared browser service rather than a Connected Tools resource
selection. The global panel applies to owned browsers and authorized AI clients.
Native provider assistance stays within the provider session; the common external
resolver supports reCAPTCHA v2 and Turnstile with an owned 2Captcha key and explicit
metered-use policy. See [Global browser automation](GLOBAL_BROWSER_AUTOMATION.md)
for tools, supported paths, limitations and credential setup.

## Validation and deployment

Run the repository-required lint, tests, typecheck, production build and SSR smoke
checks. Unit coverage includes category routing, credential redaction, unavailable
workers, source category validation and consolidation of browser surfaces. CI must
pass before a normal merge. Production readiness additionally requires an
actual authenticated team run, working model connections and a provider-specific
browser test; an HTML render or saved connector alone is insufficient evidence.
