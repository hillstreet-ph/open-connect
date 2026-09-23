import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, KeyRound, List, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/hooks/use-auth";
import { configureAppConnection, listAppConnections } from "@/lib/connections.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic / Claude", baseUrl: "https://api.anthropic.com" },
  { id: "google", name: "Google / Gemini", baseUrl: "https://generativelanguage.googleapis.com" },
  { id: "xai", name: "xAI / Grok", baseUrl: "https://api.x.ai/v1" },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  { id: "litellm", name: "LiteLLM proxy", baseUrl: "https://litellm.example.com/v1" },
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAppConnections);
  const configureFn = useServerFn(configureAppConnection);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [providerKey, setProviderKey] = useState("");
  const [providerUrl, setProviderUrl] = useState("");
  const connections = useQuery({
    queryKey: ["app-connections"],
    queryFn: () => listFn({}),
    enabled: Boolean(user),
  });
  const connectedProviders = new Set(
    (connections.data ?? [])
      .filter((item) => item.status === "connected")
      .map((item) => item.provider),
  );
  const configureMutation = useMutation({
    mutationFn: () => {
      const provider = providers.find((item) => item.id === activeProvider);
      if (!provider) throw new Error("Choose an AI provider");
      return configureFn({
        data: {
          provider: provider.id,
          display_name: provider.name,
          account_label: "AI Gateway",
          endpoint_url: providerUrl || provider.baseUrl,
          api_key: providerKey,
          auth_type: "api_key",
        },
      });
    },
    onSuccess: () => {
      toast.success("AI provider connected");
      setActiveProvider(null);
      setProviderKey("");
      setProviderUrl("");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Provider setup failed"),
  });
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

      <h2 className="mt-14 text-xl font-semibold">AI provider credentials</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Add each provider key once. Open‑Connect stores it in Vault and routes requests through the
        same LiteLLM-compatible gateway.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => (
          <Card key={provider.id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <BrandLogo provider={provider.id} name={provider.name} size="sm" />
                <span className="truncate text-sm font-medium">{provider.name}</span>
              </div>
              {connectedProviders.has(provider.id) ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="size-3" /> Connected
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!user}
                  onClick={() => {
                    setActiveProvider(provider.id);
                    setProviderUrl(provider.baseUrl);
                    setProviderKey("");
                  }}
                >
                  Add key
                </Button>
              )}
            </div>
            {activeProvider === provider.id ? (
              <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`provider-url-${provider.id}`}>API base URL</Label>
                  <Input
                    id={`provider-url-${provider.id}`}
                    type="url"
                    value={providerUrl}
                    onChange={(event) => setProviderUrl(event.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`provider-key-${provider.id}`}>Provider API key</Label>
                  <Input
                    id={`provider-key-${provider.id}`}
                    type="password"
                    autoComplete="off"
                    value={providerKey}
                    onChange={(event) => setProviderKey(event.target.value)}
                    placeholder="Paste provider key"
                    className="font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={configureMutation.isPending || providerKey.trim().length < 8}
                    onClick={() => configureMutation.mutate()}
                  >
                    {configureMutation.isPending ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="mr-1 size-3.5" />
                    )}
                    Save provider
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveProvider(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Provider keys are never returned to the browser after saving. Clients continue using only
        their scoped Open‑Connect key and the shared `/v1` base URL.
      </p>

      <div className="mt-12 flex flex-wrap gap-2">
        <Button asChild>
          {user ? (
            <Link to="/api-keys">
              Get a model key <ArrowRight className="ml-1 size-4" />
            </Link>
          ) : (
            <Link to="/auth" search={{ mode: "signup" }}>
              Get a model key <ArrowRight className="ml-1 size-4" />
            </Link>
          )}
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
