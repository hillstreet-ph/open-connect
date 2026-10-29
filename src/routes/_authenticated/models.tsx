import { modelProviderState } from "@/lib/model-provider-state";
import { ApiKeysCard } from "@/components/api-keys-card";
import { testFreeModel } from "@/lib/model-check.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, KeyRound, List, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/hooks/use-auth";
import {
  configureAppConnection,
  disconnectApp,
  listAppConnections,
} from "@/lib/connections.functions";
import { listFreeModels } from "@/lib/model-catalog.functions";
import { AI_GATEWAY_PROVIDERS, AI_GATEWAY_PROVIDER_IDS } from "@/lib/ai-gateway-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/models")({
  head: () => ({
    meta: [
      { title: "AI Gateway — Open-Connect" },
      {
        name: "description",
        content:
          "One OpenAI-compatible gateway for OpenRouter, OpenAI, Claude, Gemini, Grok and more. List every model with your sk-oc- Organization Token.",
      },
    ],
  }),
  component: ModelsPage,
});

const aliases = [
  { alias: "open-connect/auto", body: "Free-only · routes across connected OpenRouter / LiteLLM" },
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
const gatewayProviders = AI_GATEWAY_PROVIDER_IDS;

function ModelsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const testFn = useServerFn(testFreeModel);
  const modelTest = useMutation({
    mutationFn: () => testFn({}),
  });
  const listFn = useServerFn(listAppConnections);
  const freeModelsFn = useServerFn(listFreeModels);
  const configureFn = useServerFn(configureAppConnection);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const disconnectFn = useServerFn(disconnectApp);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState("AI Gateway");
  const [providerKey, setProviderKey] = useState("");
  const [providerUrl, setProviderUrl] = useState("");
  const connections = useQuery({
    queryKey: ["app-connections"],
    queryFn: () => listFn({}),
    enabled: Boolean(user),
  });
  const freeModels = useQuery({
    queryKey: ["free-model-catalog", user?.id],
    queryFn: () => freeModelsFn({}),
    enabled: Boolean(user),
  });
  const reconnectProviders = new Set(
    AI_GATEWAY_PROVIDERS.filter(
      (provider) => modelProviderState(connections.data ?? [], provider.id).needsReconnect,
    ).map((provider) => provider.id),
  );
  function openProvider(provider: (typeof AI_GATEWAY_PROVIDERS)[number], id: string | null = null) {
    const account = (connections.data ?? []).find((item) => item.id === id);
    setActiveProvider(provider.id);
    setConnectionId(id);
    setAccountLabel(account?.identity.label || "AI Gateway");
    setProviderUrl(account?.metadata.endpoint_url || provider.baseUrl);
    setProviderKey("");
  }
  const removeConnection = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["free-model-catalog"] });
      modelTest.reset();
      toast.success("Provider account disconnected");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not disconnect"),
  });
  const configureMutation = useMutation({
    mutationFn: () => {
      const provider = AI_GATEWAY_PROVIDERS.find((item) => item.id === activeProvider);
      if (!provider) throw new Error("Choose an AI provider");
      return configureFn({
        data: {
          ...(connectionId ? { connection_id: connectionId } : {}),
          new_account: !connectionId,
          provider: provider.id,
          display_name: provider.name,
          account_label: accountLabel.trim() || "AI Gateway",
          endpoint_url: providerUrl || provider.baseUrl,
          api_key: providerKey,
          auth_type: "api_key",
        },
      });
    },
    onSuccess: () => {
      toast.success("AI provider connected");
      modelTest.reset();
      setConnectionId(null);
      setActiveProvider(null);
      setProviderKey("");
      setProviderUrl("");
      void queryClient.invalidateQueries({ queryKey: ["app-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["free-model-catalog"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Provider setup failed"),
  });
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
        Internal · Multi-provider gateway
      </Badge>
      <h1 className="text-3xl font-semibold sm:text-4xl">AI Gateway</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        One gateway for OpenAI, Claude, Gemini, Grok and the full OpenRouter catalog. Provider
        secrets stay on the server; clients only use an Open-Connect key.
      </p>

      <div className="mt-8">
        <ApiKeysCard modelOnly />
      </div>

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
            <span className="text-muted-foreground">Organization Token </span>
            <span className="text-accent">sk-oc-…</span>
            <span className="ml-2 text-muted-foreground">(create above)</span>
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
  -H "Authorization: Bearer sk-oc-YOUR_KEY"`}
          </pre>
          <p className="text-xs text-muted-foreground">
            Use the OpenAI-compatible provider setting and the base URL above. An Open-Connect key
            works at this gateway, not directly at OpenAI or a separate LiteLLM server. If LiteLLM
            reports token_not_found_in_db, verify the client base URL and reconnect LiteLLM below
            using a key issued by that LiteLLM server. Renaming a key does not register it there.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6 shadow-panel" id="free-models">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <List className="size-4" /> Free models · Auto default
              </CardTitle>
              <CardDescription className="mt-1 max-w-3xl">
                Use <span className="font-mono text-primary">open-connect/auto</span> for all
                projects and clients. It routes through your connected OpenRouter free-model router,
                then tries only provider free endpoints, Ollama free-plan models, and LiteLLM models
                explicitly priced at zero. Other connected models appear below and may cost money
                according to the provider.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void freeModels.refetch()}
              disabled={freeModels.isFetching || !user}
            >
              {freeModels.isFetching ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Refresh list
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!user ? (
            <p className="text-sm text-muted-foreground">
              Sign in to view your connected free models.
            </p>
          ) : freeModels.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your free model catalog…</p>
          ) : freeModels.error ? (
            <p role="alert" className="text-sm text-destructive">
              {freeModels.error.message}
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">Auto · open-connect/auto</Badge>
                {(freeModels.data?.providers ?? []).map((provider) => (
                  <Badge key={provider} variant="outline">
                    {provider}
                  </Badge>
                ))}
              </div>
              {freeModels.data?.models.length ? (
                <div className="max-h-80 overflow-auto rounded-lg border border-border/70">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Model</span>
                    <span>Provider</span>
                    <span>Catalog</span>
                  </div>
                  {freeModels.data.models.map((model) => (
                    <div
                      key={`${model.source}:${model.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0"
                    >
                      <span className="break-all font-mono text-xs">{model.id}</span>
                      <span className="text-xs text-muted-foreground">{model.provider}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {
                          {
                            openrouter: "OpenRouter",
                            litellm: "LiteLLM",
                            nvidia: "NVIDIA",
                            ollama_cloud: "Ollama Cloud",
                          }[model.source]
                        }
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {reconnectProviders.size > 0
                    ? `A connected gateway is missing its saved credential reference (${[...reconnectProviders].join(", ")}). Reconnect its credential below, then refresh the list.`
                    : "No individually priced free models were found. Auto still uses the OpenRouter free router when that connection is available. Connect OpenRouter or configure free pricing on your LiteLLM proxy, then refresh."}
                </p>
              )}
            </>
          )}
          {freeModels.data?.allModels.length ? (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">All connected models</h3>
              <div className="max-h-96 overflow-auto rounded-lg border border-border/70">
                {freeModels.data.allModels.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
                  >
                    <span className="break-all font-mono text-xs">{model.id}</span>
                    <Badge
                      variant={model.free ? "secondary" : "outline"}
                      className="shrink-0 text-[10px]"
                    >
                      {model.free ? "Auto · free eligible" : "Connected · check provider pricing"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Test free inference</CardTitle>
          <CardDescription>
            Send a short test through your connected free-model routes. Free models are subject to
            provider quotas and availability.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled={modelTest.isPending} onClick={() => modelTest.mutate()}>
            {modelTest.isPending ? "Testing…" : "Test free model"}
          </Button>
          {modelTest.data && (
            <p role="status" className="mt-3 text-sm">
              Inference verified: {modelTest.data.model}
            </p>
          )}
          {modelTest.error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {modelTest.error.message}
            </p>
          )}
        </CardContent>
      </Card>
      <h2 className="mt-14 text-xl font-semibold">AI provider credentials</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Connect compatible model APIs here to load their model catalogs into the gateway. Auto uses
        only provider models explicitly marked free or configured at zero cost; named paid models
        remain available through the gateway and follow the provider's billing.
      </p>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {AI_GATEWAY_PROVIDERS.map((provider) => (
          <Card key={provider.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <BrandLogo provider={provider.id} name={provider.name} size="sm" />
                <span className="break-words font-medium">{provider.name}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!user || configureMutation.isPending}
                onClick={() => openProvider(provider)}
              >
                Add account
              </Button>
            </div>
            {provider.id === "anthropic" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Native Anthropic credential validation. Use an OpenAI-compatible router for Claude
                chat through /v1.
              </p>
            ) : null}
            <div className="mt-3 space-y-2">
              {modelProviderState(connections.data ?? [], provider.id).accounts.map((account) => (
                <div key={account.id} className="space-y-2 rounded-lg border border-border/70 p-3">
                  <p className="break-words text-sm">
                    {account.identity.label ||
                      account.identity.email ||
                      account.identity.login ||
                      account.display_name}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={account.gateway_ready ? "secondary" : "outline"}>
                      {account.gateway_ready ? (
                        <>
                          <CheckCircle2 className="mr-1 size-3" />{" "}
                          {provider.id === "anthropic" ? "Credential verified" : "Ready"}
                        </>
                      ) : account.status === "disconnected" ? (
                        "Disconnected"
                      ) : (
                        "Reconnect required"
                      )}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={configureMutation.isPending}
                      onClick={() => openProvider(provider, account.id)}
                    >
                      Reconnect
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removeConnection.isPending || configureMutation.isPending}
                      onClick={() => removeConnection.mutate(account.id)}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {activeProvider === provider.id ? (
              <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`account-label-${provider.id}`}>Account label</Label>
                  <Input
                    id={`account-label-${provider.id}`}
                    value={accountLabel}
                    onChange={(event) => setAccountLabel(event.target.value)}
                    placeholder="Personal or work account"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`provider-url-${provider.id}`}>API base URL</Label>
                  <Input
                    id={`provider-url-${provider.id}`}
                    readOnly={provider.id !== "litellm"}
                    type="url"
                    value={providerUrl}
                    onChange={(event) => setProviderUrl(event.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`provider-key-${provider.id}`}>
                    Provider API key or access token
                  </Label>
                  <Input
                    id={`provider-key-${provider.id}`}
                    type="password"
                    autoComplete="off"
                    value={providerKey}
                    onChange={(event) => setProviderKey(event.target.value)}
                    placeholder="Paste provider API key or token"
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
                    {connectionId ? "Verify and reconnect" : "Verify and connect"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActiveProvider(null);
                      setConnectionId(null);
                      setProviderKey("");
                    }}
                  >
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
    </div>
  );
}
