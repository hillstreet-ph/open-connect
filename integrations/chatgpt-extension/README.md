# Open-Connect ChatGPT Extension — staging prototype

This is an independently reviewable Chrome Manifest V3 prototype. It provides a Chrome side panel with an Open-Connect shortcut and locally persisted preference for future suggestions. It does **not** implement suggestions, chat-history ingestion, file uploads, OAuth, autonomous approvals, workflow execution, or native ChatGPT sidebar integration.

## Local validation

Run `node --check` on all JavaScript files, validate `manifest.json` as JSON, and load the directory via `chrome://extensions` → Developer mode → Load unpacked. Check the side panel and persistence. Test in a disposable Chrome profile.

## Security and release gates

Before release: verify the Open-Connect API and OAuth contract; define user-consented context access and retention; implement scoped approval policies with mandatory provider confirmations; run browser tests and security review. Chrome desktop extensions are not supported by standard Android Chrome.

Do not deploy this prototype as a fully functional integration or claim Chrome Web Store publication.
