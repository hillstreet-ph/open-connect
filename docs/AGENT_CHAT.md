# Agent chat and browser tasks

Open Agent-Helper from the floating chat button. Workspace chat answers questions using the configured model and tools; Browser mode starts a TinyFish task from the supplied goal. Browser tasks have bounded duration and can pause for user input. Provider availability, website authentication and challenges can require intervention.

Registered users can create, search, reopen, rename, export and delete their own saved conversations. History persists in `agent_chats` with owner-only RLS and optimistic revision checks. Anonymous accounts are excluded. Reopening history does not rerun a task. Browser history keeps the original goal and run reference; provider run retention is separate from conversation retention. This is Open-Connect history, not an import of ChatGPT conversations.

Attach up to three TXT, Markdown, CSV, JSON, log or text-bearing PDF files, each at most 4 MB. PDFs are limited to 30 pages; extracted text is limited to 24,000 characters across attachments. Browser goals including attachment text are limited to 8,000 characters. Only extracted text is saved, not original files. Common credential patterns are redacted; review documents before uploading sensitive information. Scanned PDFs and images need OCR and are not supported.

The TinyFish preview is read-only. Use Direct control for a new interactive browser session, including navigation and login; its profile lifecycle is separate from an autonomous TinyFish run. Completed tasks show results without reserving an empty live-preview area. Saved profiles may need fresh login when a site expires authentication.

The two chat migrations were applied to production before release. Schema, RLS and grants were inspected using read-only queries. Owner and revision filters have regression tests; a database role-switch transaction test could not finish through the connector and is not counted as a successful cross-account test.
