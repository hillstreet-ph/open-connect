# AI Agency and Cloud Browser

## AI Agency

Connections now contains Connectors, Credentials, AI Gateway and AI Agency.
The authenticated `/ai-agency` route offers Development, Business, Marketing,
Operations, Research, Customer Support, and Data teams. The canonical category
registry is `config/ai-agency.registry.json`; each team has three specialist roles.

A run uses the same connected, catalog-verified free-model router as the existing
MCP worker team. It accepts a 4,000-character goal and 24,000-character reference
context. Common credential patterns are redacted before model calls and in outputs.
Fallback is bounded; a failed worker is shown as unavailable. There is no fallback
to a paid model. Workers return independent proposals; they cannot execute browser
commands, approve operations or publish resources. Generated text is not evidence
that an external action completed.

`run_agent_team` accepts an optional `category` using the same seven category IDs.
Existing clients omitting it retain the generic Planner/Builder/Reviewer behavior.
Its existing `models:invoke` and `agents:invoke` checks and personal-context
restriction remain enforced. The web route uses authenticated server functions;
model credentials remain server-side and belong to the current user.

Run outputs can be copied or explicitly saved to the existing private chat
history. Saving reuses `agent_chats`, its ownership controls and existing revision
contract; it needs no second history table or migration. Saving does not publish
the run. Browser execution is available through the canonical Cloud Browser page.

## Browser consolidation

Cloud Browser has four top-level surfaces: TinyFish, Browser Use, Browserbase,
and Connected tools. Worker adapters (Playwright, Stagehand, Chrome DevTools,
BrowserAct and MultiOn), research tools and verification tools are selected within
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

## Verification resources reviewed

| Source                                 | Finding                                                        | Integration state                                                                                       |
| -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Dhravya/agent-captcha`                | Cryptographic proof designed for agents signing a guestbook    | Reference only; not a generic human CAPTCHA solver                                                      |
| `Captcha-Sonic/CaptchaSonic-Extension` | Browser extension with provider-specific solving functionality | Not installed into hosted browsers; compatibility, credential handling and runtime security need review |
| `2captcha/mcp-captcha-solver`          | Local Selenium/stdio MCP demonstration focused on reCAPTCHA v2 | Requires a provider account, Chrome/driver and a hosted authenticated worker for cloud use              |

The supplied `2captcha/mcp-captcha-solverl` URL returned 404. The corrected source
above was verified through GitHub. These repositories are linked from Verification
tools; no upstream code is automatically installed, no solver account is created
and no universal CAPTCHA bypass is claimed. Browserbase's existing supported
verification option remains available at session creation. Unresolved challenges
require the same session's supported interactive flow or human handoff.

## Validation and deployment

Run the repository-required lint, tests, typecheck, production build and SSR smoke
checks. Unit coverage includes category routing, credential redaction, unavailable
workers, source category validation and consolidation of browser surfaces. CI must
pass before a normal merge. Production readiness additionally requires an
actual authenticated team run, working model connections and a provider-specific
browser test; an HTML render or saved connector alone is insufficient evidence.
