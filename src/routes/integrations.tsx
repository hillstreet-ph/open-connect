import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, KeyRound, Link2, MessageCircle, Plug, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Open-Connect" },
      {
        name: "description",
        content:
          "Connect ChatGPT plugins, Grok, Telegram, Claude, Hermes via MCP, OAuth, API keys or tokens.",
      },
    ],
  }),
  component: IntegrationsPage,
});

const clients = [
  {
    icon: Sparkles,
    name: "ChatGPT / OpenAI plugins",
    body: "Point Custom GPT or Actions at the Open-Connect OAuth and API endpoints with an oc_live_ key.",
    endpoints: ["OAuth · /oauth", "API · /api/v1", "Models · /v1"],
  },
  {
    icon: Bot,
    name: "Grok / xAI connectors",
    body: "Use the OpenAI-compatible /v1 gateway or MCP URL with a scoped Open-Connect key.",
    endpoints: ["Models · /v1", "MCP · /mcp"],
  },
  {
    icon: MessageCircle,
    name: "Telegram bots",
    body: "Store the bot token in Secrets (scope: agents / connections), then attach via Agents or Connections.",
    endpoints: ["Secrets vault", "Connections · telegram"],
  },
  {
    icon: Plug,
    name: "MCP clients",
    body: "Claude Desktop, Cursor, Hermes and any MCP client: one URL + one key.",
    endpoints: ["https://open-connect.site/mcp"],
  },
  {
    icon: KeyRound,
    name: "API key / bearer token",
    body: "Create scoped oc_live_ keys under API Keys. Never embed service-role credentials in clients.",
    endpoints: ["Authorization: Bearer oc_live_…"],
  },
  {
    icon: Link2,
    name: "OAuth apps",
    body: "Register agents against discovery metadata and PKCE authorize/token endpoints.",
    endpoints: ["/.well-known/oauth-authorization-server", "/oauth/authorize", "/oauth/token"],
  },
];

function IntegrationsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <Badge variant="outline" className="border-primary/40 text-primary">
        Connect any agent
      </Badge>
      <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Integrations</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        One platform endpoint for ChatGPT plugins, Grok, Telegram, Claude, Hermes and custom agents.
        Authenticate with API key, OAuth, MCP, or a stored secret from the vault.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {user ? (
          <>
            <Button asChild>
              <Link to="/agents">Connect agent</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/api-keys">API Keys</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/secrets">Secrets vault</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/connections">App connections</Link>
            </Button>
          </>
        ) : (
          <Button asChild>
            <Link to="/auth">Sign in to connect</Link>
          </Button>
        )}
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clients.map((c) => (
          <Card key={c.name} className="shadow-panel">
            <CardHeader>
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <c.icon className="size-4" />
              </span>
              <CardTitle className="mt-3 text-base">{c.name}</CardTitle>
              <CardDescription>{c.body}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 font-mono text-xs text-primary">
              {c.endpoints.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-12 bg-pillar">
        <CardHeader>
          <CardTitle className="text-base">Quick MCP config</CardTitle>
          <CardDescription>Use after creating an API key in the app workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background/80 p-4 text-xs">{`{
  "mcpServers": {
    "open-connect": {
      "url": "https://open-connect.site/mcp",
      "headers": {
        "Authorization": "Bearer oc_live_YOUR_KEY"
      }
    }
  }
}`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
