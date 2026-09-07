import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
  Cloud,
  Globe,
  KeyRound,
  Link2,
  Monitor,
  Plug,
  Shield,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Single gateway — Open-Connect" },
      {
        name: "description",
        content:
          "One gateway for ChatGPT, Claude, Grok, Open WebUI, Hermes, Mistral — plugins, skills, MCP, credentials, LiteLLM models, MultiOn browser.",
      },
    ],
  }),
  component: IntegrationsPage,
});

const clients = [
  {
    provider: "grok",
    name: "Grok / xAI",
    body: "Primary client. /v1 models + MCP tools, browser skills, MultiOn autonomy.",
    endpoints: ["/v1", "/mcp", "oc_live_ key"],
  },
  {
    provider: "chatgpt",
    name: "ChatGPT · Custom GPTs",
    body: "Plugins / Actions / MCP via OAuth PKCE S256 and scoped API key.",
    endpoints: ["/oauth", "/v1", "/mcp"],
  },
  {
    provider: "claude",
    name: "Claude / Anthropic",
    body: "Claude Desktop & API clients — MCP URL + Bearer key for skills & tools.",
    endpoints: ["/mcp", "/v1"],
  },
  {
    provider: "openwebui",
    name: "Open WebUI",
    body: "Rebrand path: set OpenAI base to open-connect.site/v1 + oc_live_ key.",
    endpoints: ["OPENAI_API_BASE=/v1", "OPENAI_API_KEY=oc_live_…"],
  },
  {
    provider: "hermes",
    name: "Hermes Agent",
    body: "Agent runtime with MCP tools from the Open-Connect catalog.",
    endpoints: ["https://open-connect.site/mcp"],
  },
  {
    provider: "mistral",
    name: "Mistral / others",
    body: "Any OpenAI-compatible chat (Mistral, Groq, Ollama frontends) via /v1.",
    endpoints: ["Base URL · /v1", "Bearer oc_live_…"],
  },
  {
    provider: "cursor",
    name: "Cursor · IDEs",
    body: "MCP-capable IDEs: one URL, one key, tools/list from marketplace.",
    endpoints: ["MCP · /mcp"],
  },
  {
    provider: "telegram",
    name: "Telegram",
    body: "Connect Telegram bots/channels as app connections for agent messaging.",
    endpoints: ["/connections", "capability grants"],
  },
];

const credentials = [
  {
    provider: "pipedream",
    name: "Pipedream",
    body: "Workflow automation connectors — grant via Connections, secrets server-side.",
  },
  {
    provider: "composio",
    name: "Composio",
    body: "Toolkits & auth for 100s of apps — use with agents through Open-Connect.",
  },
  {
    provider: "onepassword",
    name: "1Password",
    body: "Credential vault pattern — store references in Secrets, never in client prompts.",
  },
  {
    provider: "litellm",
    name: "LiteLLM · OpenRouter",
    body: "Multi-provider model router behind /v1 — OpenAI-compatible aliases.",
  },
];

const autonomy = [
  {
    icon: Globe,
    title: "MultiOn autonomous browser",
    body: "Natural-language browse, cloud or local. Store multion_api_key in Secrets.",
    skill: "multion-autonomous",
  },
  {
    icon: Monitor,
    title: "Cloud browser (CDP)",
    body: "Cloudflare Browser Rendering — headless Chrome, screenshots, navigate, scrape.",
    skill: "cloudflare-browser",
  },
  {
    icon: Terminal,
    title: "Cloud terminal · agent-browser",
    body: "CLI automation & terminal-style control for agent verification loops.",
    skill: "agent-browser",
  },
  {
    icon: Cloud,
    title: "Cloud computer pattern",
    body: "Pair browser + terminal skills with MCP tools for Manus-style compute sessions.",
    skill: "marketplace",
  },
];

const catalog = [
  { icon: Sparkles, label: "Skills", hint: "Agent skill packages" },
  { icon: Plug, label: "Plugins", hint: "ChatGPT / client plugins" },
  { icon: Bot, label: "Agents · MCP", hint: "Servers & agent defs" },
  { icon: Link2, label: "Connectors", hint: "App capability grants" },
  { icon: Shield, label: "Prompts · tools", hint: "Reusable packages" },
];

function IntegrationsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <Badge variant="outline" className="border-primary/40 text-primary">
        Single gateway · open-connect.site
      </Badge>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        One access point for every AI client
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Open-Connect is the professional control plane for <strong className="text-foreground">ChatGPT</strong>,{" "}
        <strong className="text-foreground">Claude</strong>, <strong className="text-foreground">Grok</strong>,{" "}
        <strong className="text-foreground">Open WebUI</strong>, <strong className="text-foreground">Hermes</strong>,{" "}
        <strong className="text-foreground">Mistral</strong>, and more — plugins, skills, MCP, connectors,
        credentials (Pipedream · Composio · 1Password), LiteLLM models, Telegram, and autonomous browser /
        terminal compute. One account. One key. One catalog.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {user ? (
          <>
            <Button asChild>
              <Link to="/studio">Studio · create & upload</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/api-keys">API keys</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/connections">Connectors</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/resources">Marketplace</Link>
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

      {/* Gateway endpoints */}
      <Card className="mt-10 bg-pillar shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Gateway endpoints</CardTitle>
          <CardDescription>Point every client here — never scatter vendor keys.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 font-mono text-xs text-primary sm:grid-cols-2">
          <p>Models · https://open-connect.site/v1</p>
          <p>MCP · https://open-connect.site/mcp</p>
          <p>API · https://open-connect.site/api/v1</p>
          <p>OAuth · https://open-connect.site/oauth</p>
          <p className="sm:col-span-2">Authorization: Bearer oc_live_…</p>
        </CardContent>
      </Card>

      <h2 className="mt-14 text-lg font-semibold">AI chat clients</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Plugins, skills, and connectors for each surface through the same gateway.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {clients.map((c) => (
          <Card key={c.name} className="shadow-panel">
            <CardHeader className="p-4">
              <BrandLogo provider={c.provider} name={c.name} size="lg" />
              <CardTitle className="mt-3 text-sm">{c.name}</CardTitle>
              <CardDescription className="text-xs">{c.body}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 px-4 pb-4 font-mono text-[11px] text-primary">
              {c.endpoints.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-14 text-lg font-semibold">Credentials & model providers</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Server-side capability grants — clients only see oc_live_ keys and MCP tools.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {credentials.map((c) => (
          <Card key={c.name} className="shadow-panel">
            <CardHeader className="p-4">
              <BrandLogo provider={c.provider} name={c.name} size="lg" />
              <CardTitle className="mt-3 text-sm">{c.name}</CardTitle>
              <CardDescription className="text-xs">{c.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <h2 className="mt-14 text-lg font-semibold">Autonomous control</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Cloud browser, cloud terminal, MultiOn autonomous sessions — Manus-style compute via skills.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {autonomy.map((a) => (
          <Card key={a.title} className="shadow-panel">
            <CardHeader className="p-4">
              <a.icon className="size-5 text-primary" />
              <CardTitle className="mt-2 text-sm">{a.title}</CardTitle>
              <CardDescription className="text-xs">{a.body}</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 text-[11px] font-mono text-primary">
              skill · {a.skill}
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-14 text-lg font-semibold">Unified resource catalog</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Create, upload, download — zip / markdown auto-detected into skills, plugins, agents, prompts,
        MCP, tools. Bulk upload from Studio.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {catalog.map((c) => (
          <Card key={c.label} className="p-4 shadow-panel">
            <c.icon className="size-4 text-primary" />
            <p className="mt-2 text-sm font-medium">{c.label}</p>
            <p className="text-xs text-muted-foreground">{c.hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Card className="shadow-panel">
          <CardHeader>
            <KeyRound className="size-4 text-primary" />
            <CardTitle className="mt-2 text-base">OAuth · PKCE S256</CardTitle>
            <CardDescription>ChatGPT plugins and OAuth MCP clients.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 font-mono text-xs text-primary">
            <p>/.well-known/oauth-authorization-server</p>
            <p>/oauth/authorize · /oauth/token · /oauth/register</p>
          </CardContent>
        </Card>
        <Card className="shadow-panel">
          <CardHeader>
            <Link2 className="size-4 text-primary" />
            <CardTitle className="mt-2 text-base">Stack</CardTitle>
            <CardDescription>GitHub · Cloudflare · Supabase only.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {["github", "cloudflare", "supabase", "openai", "anthropic", "grok", "mistral"].map((p) => (
              <BrandLogo key={p} provider={p} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-12 bg-pillar">
        <CardHeader>
          <CardTitle className="text-base">Wire any client in 60 seconds</CardTitle>
          <CardDescription>
            Sign in → create oc_live_ key → point base URL or MCP → optional Secrets for MultiOn /
            Pipedream / Composio.
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
          <div className="flex flex-wrap gap-2">
            {user ? (
              <>
                <Button asChild size="sm">
                  <Link to="/studio">Open Studio</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/guides">Professional setup</Link>
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">Get started</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
