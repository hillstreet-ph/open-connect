import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
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
          "Access multiple AI providers through one OpenAI-compatible gateway with stable model aliases.",
      },
    ],
  }),
  component: ModelsPage,
});

const providers = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
  { id: "azure", name: "Azure" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "groq", name: "Groq" },
  { id: "ollama", name: "Ollama" },
  { id: "xai", name: "xAI / Grok" },
];

const aliases = [
  { alias: "open-connect/fast", body: "Low latency, low cost. High-volume classification and chat." },
  { alias: "open-connect/balanced", body: "Default general-purpose routing with a fallback provider." },
  { alias: "open-connect/reasoning", body: "Long-context, multi-step reasoning workloads." },
  { alias: "open-connect/coding", body: "Code generation and review, with an alternate provider." },
  { alias: "open-connect/vision", body: "Image + text input for multimodal tasks." },
];

function ModelsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-3xl font-semibold sm:text-4xl">AI Models</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Connect any provider behind one OpenAI-compatible endpoint. Change infrastructure without
        reconfiguring agents.
      </p>

      <Card className="mt-10 shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Point any client here</CardTitle>
          <CardDescription>Provider secrets stay behind the gateway.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 font-mono text-xs">
          <div className="rounded-lg border border-border/70 bg-background/60 px-4 py-3">
            <span className="text-muted-foreground">Base URL </span>
            <span className="text-primary">https://open-connect.site/v1</span>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 px-4 py-3">
            <span className="text-muted-foreground">API key </span>
            <span className="text-accent">oc_live_••••••••••••••••</span>
          </div>
        </CardContent>
      </Card>

      <h2 className="mt-14 text-xl font-semibold">Stable model aliases</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {aliases.map((item) => (
          <Card key={item.alias} className="p-5">
            <p className="font-mono text-sm text-primary">{item.alias}</p>
            <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-14 text-xl font-semibold">Providers</h2>
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
        Upstream today: OpenRouter (health: model_upstream). Only configured providers are exposed to
        your keys.
      </p>

      <div className="mt-12 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/auth" search={{ mode: "signup" }}>
            Get a model key <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/studio">Create in Studio</Link>
        </Button>
      </div>
    </div>
  );
}
