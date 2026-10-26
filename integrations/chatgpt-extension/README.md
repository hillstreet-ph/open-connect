# Open-Connect ChatGPT Extension — staging prototype

Chrome Manifest V3 companion panel with navigation links and locally stored, opt-in preferences. The layout is inspired by a three-column ChatGPT experience, but Chrome's sidePanel API owns the panel placement. No native ChatGPT UI is modified.

## Implemented
- Chrome extension action opens side panel
- Dashboard navigation links
- Locally persisted preferences, default off

## Not implemented
OAuth, ChatGPT history retrieval, AI autocomplete, native plus-menu integration, file uploads, autonomous task execution, always-allow approvals, Android Chrome support, Chrome Web Store publication.

## Validation and release
Run `node --check background.js`, `node --check content.js`, `node --check panel.js`, and validate manifest JSON. Load unpacked in desktop Chrome and manually test the side panel and storage. Production release requires OAuth and backend contracts, consent, privacy review, accessibility, integration tests, and provider-enforced approvals. No production deployment is authorized by this staging package.

## Release topology

- Chrome desktop: extension side panel, distributed as an unpacked development build until store review.
- Android Chrome: use an Open-Connect web application or supported ChatGPT plugin; Chrome Android does not install standard MV3 extensions.
- ChatGPT app: separate official integration with authenticated backend actions, not injected native navigation.
- Open-Connect backend: OAuth, least-privilege scopes, context consent, and workflow checkpoints must be implemented and verified before connecting this prototype.

Do not assume an approval preference overrides host or provider security prompts. Production merge and publication are gated on the checklist.
