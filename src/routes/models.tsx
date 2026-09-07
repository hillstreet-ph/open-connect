import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, KeyRound, List } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/models")({
  head: () => ({
    meta: [
      { title: "AI Models — Open-Connect" },
      {
        name: "description",
        content:
          "One OpenAI-compatible gateway for OpenRouter, OpenAI, Claude, Gemini, Grok and more. List every model with your oc_live_ key.",
      },
    ],
  }),
  component: ModelsPage,
});

const providers = [
  { id: "openrouter", name: "OpenRouter" },
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic / Claude" },
  { id: "google", name: "Google / Gemini" },
  { id: "xai", name: "xAI / Grok" },
  { id: "meta", name: "Meta Llama" },
  { id: "mistral", name: "Mistral" },
  { id: "deepseek", name: "DeepSeek" },
];

const aliases = [
  { alias: "open-connect/fast", body: "Low latency · gpt-4o-mini" },
  { alias: "open-connect/coding", body: "Code · gpt-4o" },
  { alias: "open-connect/reasoning", body: "Reasoning · gpt-4o" },
  { alias: "open-connect/claude", body: "Claude Sonnet via OpenRouter" },
  { alias: "open-connect/gemini", body: "Gemini 2.5 Flash" },
  { alias: "open-connect/vision", body: "Multimodal · gpt-4o" },
  { alias: "gpt-4o", body: "OpenAI GPT-4o" },
  { alias: "claude-sonnet", body: "Anthropic Claude Sonnet" },
  { alias: "gemini-flash", body: "Google Gemini Flash" },
  { alias: "grok-2", body: "xAI Grok" },
];

function ModelsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
        LiteLLM-compatible · OpenRouter multi-provider
      </Badge>
      <h1 className="text-3xl font-semibold sm:text-4xl">AI Models</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        One gateway for OpenAI, Claude, Gemini, Grok and the full OpenRouter catalog. Provider
        secrets stay on the server; clients only use an Open-Connect key.
      </p>

      <Card className="mt-10 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Point any client here</CardTitle>
          <CardDescription>
            Open WebUI, LobeHub, Cursor, custom agents — same OpenAI-compatible API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 font-mono text-xs">
          <div className="rounded-lg border border-border/70 bg-background/60 px-4 py-3">
            <span className="text-muted-foreground">Base URL </span>
            <span className="text-primary">https://open-connect.site/v1</span>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 px-4 py-3">
            <span className="text-muted-foreground">API key </span>
            <span className="text-accent">oc_live_…</span>
            <span className="ml-2 text-muted-foreground">(create at /api-keys)</span>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <List className="size-4" /> Full model list
          </CardTitle>
          <CardDescription>
            Authenticated GET /v1/models returns managed aliases plus every model from the connected
            OpenRouter credential (OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, xAI, …).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
{`curl -sS https://open-connect.site/v1/models \\
  -H "Authorization: Bearer oc_live_YOUR_KEY"`}
          </pre>
          <p className="text-xs text-muted-foreground">
            Requires scopes models:read or models:invoke (included on new keys).
          </p>
        </CardContent>
      </Card>

      <h2 className="mt-14 text-xl font-semibold">Stable aliases</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {aliases.map((item) => (
          <Card key={item.alias} className="p-4">
            <p className="font-mono text-sm text-primary">{item.alias}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-14 text-xl font-semibold">Providers (via OpenRouter)</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5"
          >
            <BrandLogo provider={provider.id} name={provider.name} size="sm" />
            <span className="text-sm">{provider.name}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Live upstream: OpenRouter (LiteLLM-compatible env on Cloudflare Pages). Optional second
        LiteLLM proxy host can be added later without changing client base URLs.
      </p>

      <div className="mt-12 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/auth" search={{ mode: "signup" }}>
            Get a model key <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/api-keys">
            <KeyRound className="mr-1 size-4" />
            API keys
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/integrations">Integrations</Link>
        </Button>
      </div>
    </div>
  );
}
