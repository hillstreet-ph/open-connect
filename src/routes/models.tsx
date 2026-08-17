import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
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
          "Access multiple AI providers through one OpenAI-compatible gateway with stable model aliases, routing and fallbacks.",
      },
      { property: "og:title", content: "AI Models — Open-Connect" },
      {
        property: "og:description",
        content: "One base URL, one key, many providers — with routing, fallbacks and usage.",
      },
    ],
  }),
  component: ModelsPage,
});

const providers = ["OpenAI", "Anthropic", "Google", "Azure", "OpenRouter", "Groq", "Ollama"];

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
        One OpenAI-compatible endpoint in front of many providers. Change infrastructure without
        reconfiguring a single connected agent.
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
      <div className="mt-4 flex flex-wrap gap-2">
        {providers.map((provider) => (
          <Badge key={provider} variant="secondary">
            {provider}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Only providers you configure are exposed to your keys.
      </p>

      <div className="mt-12">
        <Button asChild>
          <Link to="/auth" search={{ mode: "signup" }}>
            Get a model key <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
