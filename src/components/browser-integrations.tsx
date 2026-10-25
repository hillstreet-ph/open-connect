import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const integrations = [
  {
    name: "Playwright MCP",
    description:
      "Snapshots, clicks, forms, screenshots and tabs through Microsoft's browser tools.",
    setup:
      "Run its HTTP server in your isolated worker, then connect your authenticated HTTPS /mcp endpoint as a Custom MCP server.",
    source: "https://github.com/microsoft/playwright-mcp",
    kind: "Open source · worker required",
  },
  {
    name: "Browser Use",
    description:
      "Natural-language browser agents with an open-source Python library and a separate hosted service.",
    setup:
      "Use your existing Browser Use connection through Composio. Self-hosting needs a browser worker and model provider; hosted sessions are metered.",
    source: "https://github.com/browser-use/browser-use",
    kind: "Open source library · cloud service separate",
  },
  {
    name: "Stagehand",
    description: "Code and AI browser actions, observations and structured extraction.",
    setup:
      "Run the SDK in your own worker with a model connection. Expose reviewed tools through an authenticated MCP server to connect here.",
    source: "https://github.com/browserbase/stagehand",
    kind: "Open source SDK · adapter required",
  },
  {
    name: "Chrome DevTools MCP",
    description:
      "Browser inspection, console diagnostics, network analysis and automation for coding agents.",
    setup:
      "Run in an isolated worker. A local stdio server needs an authenticated HTTP MCP bridge before this cloud gateway can reach it.",
    source: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
    kind: "Open source · bridge required",
  },
];

export function BrowserIntegrations() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect more browser tools</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>
          TinyFish powers the task runner and direct browser above. Other browser tools run through
          your own connections. Open-source software can be free; hosting and model usage may cost
          money.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {integrations.map((item) => (
            <article key={item.name} className="space-y-2 rounded-md border p-3">
              <h3 className="font-medium">{item.name}</h3>
              <p className="text-xs text-muted-foreground">{item.kind}</p>
              <p>{item.description}</p>
              <p className="text-muted-foreground">{item.setup}</p>
              <a className="underline" href={item.source} target="_blank" rel="noopener noreferrer">
                Official setup and source
              </a>
            </article>
          ))}
        </div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>In Connections, reuse an existing account or add your Custom MCP server endpoint.</li>
          <li>
            Open Advanced browser tools below, select the connection, and discover its actual tools.
          </li>
          <li>Test navigation and a snapshot on example.com, then close the test session.</li>
          <li>
            For ChatGPT or another agent, connect to <code>https://open-connect.site/mcp</code> and
            authorize your account. The client must support remote MCP tools.
          </li>
        </ol>
        <p className="text-muted-foreground">
          Setup choices are not connected-status checks. Tool discovery verifies what your server
          exposes. Reuse the same connection to avoid duplicates. MultiOn remains a reference until
          a working provider endpoint and account are verified.
        </p>
        <Button asChild variant="outline">
          <Link to="/connections">Manage browser connections</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
