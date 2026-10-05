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
        content: "Built-in Open-Connect integrations for AI clients, MCP, and Telegram.",
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
    endpoints: ["/oauth", "/mcp"],
    to: "/api-keys" as const,
  },
  {
    provider: "claude",
    name: "Claude / Anthropic",
    body: "Use Claude Desktop or API clients with the Open-Connect MCP endpoint and scoped key.",
    endpoints: ["/mcp"],
    to: "/api-keys" as const,
  },
  {
    provider: "grok",
    name: "Grok / xAI",
    body: "Connect AI agent workflows to approved Open-Connect tools using owner-scoped access.",
    endpoints: ["/mcp"],
    to: "/api-keys" as const,
  },
  {
    provider: "openwebui",
    name: "Open WebUI",
    body: "Connect an AI client to Open-Connect tools using its owner’s scoped access.",
    endpoints: ["/mcp", "Scoped client key"],
    to: "/api-keys" as const,
  },
  {
    provider: "hermes",
    name: "Hermes Agent",
    body: "Connect the agent runtime to project-scoped tools from the Open-Connect MCP catalog.",
    endpoints: ["https://open-connect.site/mcp"],
    to: "/api-keys" as const,
  },
  {
    provider: "manus",
    name: "Manus · AI agents",
    body: "Give supported agents access only to assigned projects and approved resources.",
    endpoints: ["/mcp"],
    to: "/api-keys" as const,
  },
];

function IntegrationsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <Badge variant="outline" className="border-primary/40 text-primary">
          Built-in Open-Connect integrations
        </Badge>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Integrations
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Integrations are Open-Connect entry points for AI agents, MCP clients, and Telegram.
          Open-Connect owns the integration definitions; each user owns their setup and grants
          access to projects explicitly. Resources, external app connectors, and AI model providers
          are managed separately.
        </p>
        {user ? (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/api-keys">Client API keys</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/mcp-servers">MCP tools</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/connections">Telegram bot connection</Link>
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
          <CardTitle className="text-base">Ownership and access</CardTitle>
          <CardDescription>
            Every setup belongs to its signed-in account. Use project-scoped keys and explicit
            grants so clients only see approved capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <p>
            <strong>Integrations</strong>
            <br />
            AI clients, MCP clients, and Telegram entry points.
          </p>
          <p>
            <strong>Connectors</strong>
            <br />
            Owner-controlled accounts Open-Connect uses with external apps.
          </p>
          <p>
            <strong>AI Gateway</strong>
            <br />
            Model providers, provider keys, and routing.
          </p>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-lg font-semibold">AI clients and agents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect agent clients to approved Open-Connect capabilities. Model providers are configured
          separately.
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
              This bot integration belongs to your account. Grant only the project capabilities
              required for Telegram messaging; bot credentials stay private to you.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {user ? (
              <Button asChild size="sm">
                <Link to="/connections">Set up my Telegram integration</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-muted-foreground">
        Open-Connect does not share an owner’s integration setup by default. Sharing project
        resources, connector accounts, or credentials requires a separate explicit grant.
      </p>
    </div>
  );
}
