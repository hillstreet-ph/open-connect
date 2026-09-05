import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe, KeyRound, Link2, Monitor, Terminal } from "lucide-react";
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
          "Grok, MultiOn, Open WebUI, Claude, ChatGPT — MCP, OAuth, autonomous browser, cloud computer.",
      },
    ],
  }),
  component: IntegrationsPage,
});

const clients = [
  {
    provider: "grok",
    name: "Grok / xAI",
    body: "Primary reasoning client. OpenAI-compatible /v1 + MCP tools (browser skills, MultiOn).",
    endpoints: ["Models · /v1", "MCP · /mcp", "Skills · multion / browser"],
  },
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
    provider: "openwebui",
    name: "Open WebUI",
    body: "Set OpenAI base URL to https://open-connect.site/v1 and paste oc_live_ key.",
    endpoints: ["Base URL · /v1", "API key · oc_live_…"],
  },
  {
    provider: "cloudflare",
    name: "MultiOn + Browser",
    body: "Autonomous web agents (MultiOn) + Cloudflare Browser Rendering CDP + agent-browser CLI.",
    endpoints: ["docs.multion.ai", "Skills · marketplace", "Secrets · multion_api_key"],
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
    provider: "openai",
    name: "API key / bearer",
    body: "Scoped oc_live_ keys — never embed service-role credentials in clients.",
    endpoints: ["Authorization: Bearer oc_live_…"],
  },
];

const autonomy = [
  {
    icon: Globe,
    title: "MultiOn (cloud / local browser)",
    body: "Natural-language browse sessions. Remote headless or local Chrome extension. API key in Secrets as multion_api_key.",
    link: "https://docs.multion.ai/welcome",
    skill: "multion-autonomous",
  },
  {
    icon: Monitor,
    title: "Cloudflare Browser (CDP)",
    body: "Headless Chrome on Cloudflare Browser Rendering — screenshots, navigate, scrape, video via WebSocket CDP.",
    link: "/resources",
    skill: "cloudflare-browser",
  },
  {
    icon: Terminal,
    title: "Agent Browser CLI",
    body: "Deterministic CLI automation: snapshot refs, click, fill, annotate — for agent verification loops.",
    link: "/resources",
    skill: "agent-browser",
  },
];

function IntegrationsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <Badge variant="outline" className="border-primary/40 text-primary">
        Professional setup · AI clients · autonomy
      </Badge>
      <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Integrations</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Connect <strong className="text-foreground">Grok</strong>, ChatGPT, Claude, Open WebUI, and
        autonomous <strong className="text-foreground">browser / cloud computer</strong> control via
        MultiOn and Cloudflare. One MCP URL, one model gateway, one key.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {user ? (
          <>
            <Button asChild>
              <Link to="/studio">Open Studio</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/resources">Browser skills</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/api-keys">API Keys</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/secrets">Secrets</Link>
            </Button>
          </>
        ) : (
          <Button asChild>
            <Link to="/auth">Sign in to connect</Link>
          </Button>
        )}
      </div>

      <h2 className="mt-14 text-lg font-semibold">Autonomous browser & compute</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Motor-cortex style control: MultiOn for natural language, Cloudflare CDP for edge headless,
        agent-browser for CLI precision.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {autonomy.map((a) => (
          <Card key={a.title} className="shadow-panel">
            <CardHeader>
              <a.icon className="size-5 text-primary" />
              <CardTitle className="mt-2 text-base">{a.title}</CardTitle>
              <CardDescription>{a.body}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <p className="font-mono text-primary">skill · {a.skill}</p>
              {a.link.startsWith("http") ? (
                <a href={a.link} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                  Docs →
                </a>
              ) : (
                <Link to={a.link} className="text-primary hover:underline">
                  Marketplace →
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-14 text-lg font-semibold">AI clients</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            {["github", "supabase", "cloudflare", "google", "openai", "grok"].map((p) => (
              <BrandLogo key={p} provider={p} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-12 bg-pillar">
        <CardHeader>
          <CardTitle className="text-base">Grok + MultiOn quick config</CardTitle>
          <CardDescription>
            After login: create oc_live_ key, store MULTION_API_KEY in Secrets, download browser
            skills from Marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
          <pre className="overflow-x-auto rounded-lg border border-border bg-background/80 p-4 text-xs">{`// MultiOn browse (store key in Open-Connect Secrets)
import { MultiOnClient } from "multion";
const multion = new MultiOnClient({ apiKey: process.env.MULTION_API_KEY });
await multion.browse({ cmd: "…", url: "https://…" });`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
