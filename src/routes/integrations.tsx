import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRound, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { BrandLogo } from "@/components/brand-logo";
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
          "Connect ChatGPT, Claude, Grok, Open WebUI, Hermes via MCP, OAuth, API keys or tokens.",
      },
    ],
  }),
  component: IntegrationsPage,
});

const clients = [
  {
    provider: "chatgpt",
    name: "ChatGPT / OpenAI",
    body: "Custom GPT, Actions, or plugins → OAuth + /v1 with an oc_live_ key.",
    endpoints: ["OAuth · /oauth", "Models · /v1", "API · /api/v1"],
  },
  {
    provider: "claude",
    name: "Claude / Anthropic",
    body: "Claude Desktop or API clients via MCP URL + scoped key.",
    endpoints: ["MCP · /mcp", "Models · /v1"],
  },
  {
    provider: "grok",
    name: "Grok / xAI",
    body: "OpenAI-compatible /v1 gateway or MCP for Grok connectors.",
    endpoints: ["Models · /v1", "MCP · /mcp"],
  },
  {
    provider: "openwebui",
    name: "Open WebUI",
    body: "Set OpenAI base URL to https://open-connect.site/v1 and paste oc_live_ key.",
    endpoints: ["Base URL · /v1", "API key · oc_live_…"],
  },
  {
    provider: "hermes",
    name: "Hermes Agent",
    body: "Point Hermes MCP config at Open-Connect with Bearer auth.",
    endpoints: ["https://open-connect.site/mcp"],
  },
  {
    provider: "cursor",
    name: "Cursor / MCP IDEs",
    body: "Any MCP-capable IDE: one URL, one key, tools/list from the catalog.",
    endpoints: ["MCP · /mcp"],
  },
  {
    provider: "telegram",
    name: "Telegram bots",
    body: "Store bot token in Secrets, then attach via Agents or Connections.",
    endpoints: ["Secrets vault", "Connections · telegram"],
  },
  {
    provider: "openai",
    name: "API key / bearer",
    body: "Scoped oc_live_ keys — never embed service-role credentials in clients.",
    endpoints: ["Authorization: Bearer oc_live_…"],
  },
];

function IntegrationsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <Badge variant="outline" className="border-primary/40 text-primary">
        Professional setup · AI clients
      </Badge>
      <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Integrations</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Connect ChatGPT, Claude, Grok, Open WebUI, Hermes, Cursor, and custom agents. One MCP URL,
        one model gateway, one key.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {user ? (
          <>
            <Button asChild>
              <Link to="/studio">Open Studio</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/agents">Connect agent</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/api-keys">API Keys</Link>
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
              <BrandLogo provider={c.provider} name={c.name} size="lg" />
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

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Card className="shadow-panel">
          <CardHeader>
            <KeyRound className="size-4 text-primary" />
            <CardTitle className="mt-2 text-base">OAuth apps</CardTitle>
            <CardDescription>PKCE S256 for ChatGPT and OAuth MCP clients.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 font-mono text-xs text-primary">
            <p>/.well-known/oauth-authorization-server</p>
            <p>/oauth/authorize · /oauth/token</p>
          </CardContent>
        </Card>
        <Card className="shadow-panel">
          <CardHeader>
            <Link2 className="size-4 text-primary" />
            <CardTitle className="mt-2 text-base">Stack logos</CardTitle>
            <CardDescription>Infrastructure you already use with Open-Connect.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {["github", "supabase", "cloudflare", "google", "openai"].map((p) => (
              <BrandLogo key={p} provider={p} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-12 bg-pillar">
        <CardHeader>
          <CardTitle className="text-base">Quick MCP config</CardTitle>
          <CardDescription>Use after creating an API key in the workspace.</CardDescription>
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
