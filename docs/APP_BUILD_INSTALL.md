# Studio app build and installation

Studio’s Build & install workbench reuses the universal connector form. Add an HTTPS MCP HTTP/SSE or OpenAPI app, or choose an existing owned connection. Inspection refreshes supported broker capabilities, records a snapshot, and shows tools before offering a private plugin draft. Discovery is distinct from execution testing. Managed catalogs without a callable broker adapter are explicitly identified; they are not advertised as agent-ready.

Client export supports VS Code’s `servers` schema and portable/Cursor `mcpServers`. These configurations point to Open-Connect’s fixed HTTPS MCP endpoint, use the client’s OAuth flow, and never embed upstream tokens or Vault references. Downloading configuration is not installation in the host; merge with existing client configuration and complete its authentication.

The generated Node ZIP contains an original local stdio MCP server, a real initialization/discovery/read-only-tool self-test, an MCP inspection client, an interactive gateway app client, editor configurations, environment placeholders and instructions. It pins the product’s v1 SDK and 2025-11-25 protocol. Node 22.19+ is required. Run `npm install`, `npm test`, fill `.env` locally and run `npm run inspect` or `npm run chat`. No packages or local processes are installed by the website.

The agent uses the selected connection ID, separate Integrations and Gateway keys, bounded tool steps and explicit local confirmation. It shows arguments with credential fields redacted. The backend still enforces project grants, owner tool restrictions and destructive-action confirmation. Free-model routing is best-effort. The generated local server’s app_status example is not an implementation of an upstream app: add and test app-specific tools before hosting it.

Private plugin drafts still need source/license/runtime review before publication. No executable third-party source is copied into the Marketplace. Local stdio and MCPB runtimes are not run by the hosted app. MCP Apps, SDK v2 and modern skills protocol methods link to official guides rather than claiming implemented support. Official SDK links cover TypeScript, Python, C#, Go, Rust, Ruby, Java, Swift, PHP and Kotlin.

Sources checked on 2026-10-25:

- https://modelcontextprotocol.io/llms.txt
- https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector
- https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli
- https://ts.sdk.modelcontextprotocol.io/
- https://code.visualstudio.com/docs/agent-customization/mcp-servers
- https://cursor.com/docs/mcp

Validation covers client schema differences, readiness states, secret-free setup files, ZIP path/CRC integrity and a generated server actually started through the MCP SDK and called by its self-test. Full CI additionally checks the product build, SSR, existing access boundaries and CodeQL.
