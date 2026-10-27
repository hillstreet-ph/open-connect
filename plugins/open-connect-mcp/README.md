# Open Connect MCP release source

Canonical existing App-backed plugin: `plugin_asdk_app_6acaeb867398819195374ebecb7c3a97`.
This source overlays its existing consolidated bundle; omitted skills, licenses and assets remain in the saved release. Do not replace the bundle with this partial directory as a fresh installation.

Release 1.2.0 adds the repository's `skills/auto/SKILL.md` and `skills/open-connect-control/SKILL.md`. Preserve the App binding, presentation, OAuth and private audience. The older `plugins/chatgpt-open-connect` directory describes a different App identity and must not be used to publish this plugin.

The three starter prompts are in the control skill. Native ChatGPT App prompt buttons are App-owned configuration and have not been changed by this skills release. Clients must load the skill and authorize their own existing MCP connection. No unimplemented admin operations or device executors are introduced by these instructions.
