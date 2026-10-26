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
