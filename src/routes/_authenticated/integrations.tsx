import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, KeyRound, MessageCircle, Network } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Open-Connect" },
      {
        name: "description",
        content: "Connect AI clients, MCP tools, and Telegram through Open-Connect.",
      },
    ],
  }),
  component: IntegrationsPage,
});

const aiClients = [
  {
    provider: "chatgpt",
    name: "ChatGPT · Custom GPTs",
    body: "Connect GPT Actions and supported MCP clients with OAuth or a scoped Open-Connect key.",
    endpoints: ["/oauth", "/v1", "/mcp"],
    to: "/api-keys" as const,
  },
  {
    provider: "claude",
    name: "Claude / Anthropic",
    body: "Use Claude Desktop or API clients with the Open-Connect MCP endpoint and scoped key.",
    endpoints: ["/mcp", "/v1"],
    to: "/api-keys" as const,
  },
  {
    provider: "grok",
    name: "Grok / xAI",
    body: "Connect compatible model and tool workflows through Open-Connect.",
    endpoints: ["/v1", "/mcp"],
    to: "/models" as const,
  },
  {
    provider: "openwebui",
    name: "Open WebUI",
    body: "Point the OpenAI-compatible base URL to Open-Connect and use a scoped key.",
    endpoints: ["OPENAI_API_BASE=/v1", "OPENAI_API_KEY=oc_live_…"],
    to: "/models" as const,
  },
  {
    provider: "hermes",
    name: "Hermes Agent",
    body: "Connect the agent runtime to project-scoped tools from the Open-Connect MCP catalog.",
    endpoints: ["https://open-connect.site/mcp"],
    to: "/api-keys" as const,
  },
  {
    provider: "mistral",
    name: "Mistral / compatible clients",
    body: "Use the OpenAI-compatible model gateway with your own scoped API key.",
    endpoints: ["Base URL · /v1", "Bearer oc_live_…"],
    to: "/models" as const,
  },
  {
    provider: "manus",
    name: "Manus · AI agents",
    body: "Give supported agents access only to assigned projects and approved resources.",
    endpoints: ["/mcp", "/v1"],
    to: "/api-keys" as const,
  },
];

function IntegrationsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <Badge variant="outline" className="border-primary/40 text-primary">
          AI · MCP · Telegram
        </Badge>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Integrate AI clients, MCP, and Telegram
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Connect ChatGPT, Claude, Grok, AI agents, MCP-compatible tools, and Telegram through
          Open-Connect. Project access stays scoped, and provider credentials remain protected by
          the connection and credential controls.
        </p>
        {user ? (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/api-keys">API keys</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/mcp-servers">MCP catalog</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/connections">Telegram connections</Link>
            </Button>
          </div>
        ) : (
          <Button asChild className="mt-6">
            <Link to="/auth">Sign in to connect</Link>
          </Button>
        )}
      </header>

      <Card className="bg-pillar shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Open-Connect gateway</CardTitle>
          <CardDescription>
            Use the same project-scoped identity across supported AI and MCP clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 font-mono text-xs text-primary sm:grid-cols-2">
          <p>Models · https://open-connect.site/v1</p>
          <p>MCP · https://open-connect.site/mcp</p>
          <p>API · https://open-connect.site/api/v1</p>
          <p>OAuth · https://open-connect.site/oauth</p>
          <p className="sm:col-span-2">Authorization: Bearer oc_live_…</p>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-lg font-semibold">AI clients and agents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect model clients using the Open-Connect gateway or MCP tools.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {aiClients.map((client) => (
            <Card key={client.name} className="shadow-panel">
              <CardHeader className="p-4">
                <BrandLogo provider={client.provider} name={client.name} size="lg" />
                <CardTitle className="mt-3 text-sm">{client.name}</CardTitle>
                <CardDescription className="text-xs">{client.body}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 px-4 pb-4 font-mono text-[11px] text-primary">
                {client.endpoints.map((endpoint) => (
                  <p key={endpoint}>{endpoint}</p>
                ))}
                {user ? (
                  <Button asChild size="sm" variant="outline" className="mt-3 w-full font-sans">
                    <Link to={client.to}>Configure</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">MCP server and tools</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover MCP resources in the catalog, then connect clients with the endpoint and a scoped
          key.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Card className="shadow-panel">
            <CardHeader className="p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="size-5" />
              </div>
              <CardTitle className="mt-3 text-sm">Open-Connect MCP server</CardTitle>
              <CardDescription className="text-xs">
                Expose approved resources and tools to clients using each user’s project access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 px-4 pb-4 font-mono text-[11px] text-primary">
              <p>https://open-connect.site/mcp</p>
              <p>Authorization: Bearer oc_live_…</p>
              {user ? (
                <div className="mt-3 flex gap-2 font-sans">
                  <Button asChild size="sm">
                    <Link to="/api-keys">Create key</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/mcp-servers">Browse MCP</Link>
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card className="shadow-panel">
            <CardHeader className="p-4">
              <BrandLogo provider="cursor" name="MCP-capable IDEs" size="lg" />
              <CardTitle className="mt-3 text-sm">MCP-capable IDEs and agents</CardTitle>
              <CardDescription className="text-xs">
                Configure Cursor and other compatible clients with the Open-Connect server URL.
                Tools remain bounded by the signed-in account and its project grants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 px-4 pb-4 font-mono text-[11px] text-primary">
              <p>MCP · /mcp</p>
              <p>Tools · /mcp</p>
              {user ? (
                <Button asChild size="sm" variant="outline" className="mt-3 w-full font-sans">
                  <Link to="/mcp-servers">Browse MCP tools</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Telegram</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Telegram accounts and bots as explicit app connections for approved agent
          messaging.
        </p>
        <Card className="mt-5 shadow-panel">
          <CardHeader className="p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageCircle className="size-5" />
            </div>
            <CardTitle className="mt-3 text-sm">Telegram connections</CardTitle>
            <CardDescription className="text-xs">
              Each account owner chooses which Telegram connection to share with each project.
              Connection credentials stay private and are invoked through scoped capability grants.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {user ? (
              <Button asChild size="sm">
                <Link to="/connections">Manage Telegram connections</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-panel">
          <CardHeader>
            <KeyRound className="size-4 text-primary" />
            <CardTitle className="mt-2 text-base">ChatGPT OAuth</CardTitle>
            <CardDescription>
              OAuth endpoints for supported ChatGPT Actions and clients.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 font-mono text-xs text-primary">
            <p>/.well-known/oauth-authorization-server</p>
            <p>/oauth/authorize · /oauth/token · /oauth/register</p>
          </CardContent>
        </Card>
        <Card className="shadow-panel">
          <CardHeader>
            <Network className="size-4 text-primary" />
            <CardTitle className="mt-2 text-base">Quick setup</CardTitle>
            <CardDescription>
              Create a scoped key, then configure an AI model client or MCP client.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="overflow-x-auto rounded-lg border border-border bg-background/80 p-4 text-xs">{`OPENAI_API_BASE=https://open-connect.site/v1
OPENAI_API_KEY=oc_live_YOUR_KEY`}</pre>
            <pre className="overflow-x-auto rounded-lg border border-border bg-background/80 p-4 text-xs">{`{
  "mcpServers": {
    "open-connect": {
      "url": "https://open-connect.site/mcp",
      "headers": { "Authorization": "Bearer oc_live_YOUR_KEY" }
    }
  }
}`}</pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
